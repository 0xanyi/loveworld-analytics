import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { type Database, hierarchyNode, tenant } from "@lwa/db";
import { createTestDb } from "@lwa/db/test-utils";
import { areNodesInScope, isNodeInScope } from "../src/lib/hierarchy-scope";

let container: StartedPostgreSqlContainer;
let db: Database;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const res = await createTestDb(container.getConnectionUri());
  db = res.db;
  cleanup = res.cleanup;
}, 60_000);

afterAll(async () => {
  await cleanup();
  await container.stop();
});

describe("hierarchy-scope", () => {
  it("empty scope means tenant-wide access (always true)", async () => {
    const ctx = await seedTree(db);
    expect(await isNodeInScope(db, ctx.tenantId, [], ctx.child.id)).toBe(true);
    expect(await isNodeInScope(db, ctx.tenantId, [], ctx.grandchild.id)).toBe(true);
  });

  it("scope root grants access to itself and all descendants", async () => {
    const ctx = await seedTree(db);
    const scope = [ctx.parent.id];
    expect(await isNodeInScope(db, ctx.tenantId, scope, ctx.parent.id)).toBe(true);
    expect(await isNodeInScope(db, ctx.tenantId, scope, ctx.child.id)).toBe(true);
    expect(await isNodeInScope(db, ctx.tenantId, scope, ctx.grandchild.id)).toBe(true);
  });

  it("scope does not grant access to siblings or ancestors", async () => {
    const ctx = await seedTree(db);
    const scope = [ctx.child.id];
    expect(await isNodeInScope(db, ctx.tenantId, scope, ctx.parent.id)).toBe(false);
    expect(await isNodeInScope(db, ctx.tenantId, scope, ctx.sibling.id)).toBe(false);
  });

  it("rejects nodes that belong to another tenant", async () => {
    const a = await seedTree(db);
    const b = await seedTree(db);
    // Even with a tenant-wide empty scope, a node from tenant B must not
    // be authorized against tenant A's tenantId.
    expect(await isNodeInScope(db, a.tenantId, [], b.child.id)).toBe(false);
    expect(await isNodeInScope(db, a.tenantId, [a.parent.id], b.child.id)).toBe(false);
  });

  it("treats archived ancestors as a broken path (cannot traverse)", async () => {
    const ctx = await seedTree(db);
    // Archive the middle node.
    await db
      .update(hierarchyNode)
      .set({ archivedAt: new Date() })
      .where(eq(hierarchyNode.id, ctx.child.id));

    // Even though the scope root (parent) is an ancestor of grandchild,
    // the archived middle node breaks the traversal.
    expect(await isNodeInScope(db, ctx.tenantId, [ctx.parent.id], ctx.grandchild.id)).toBe(false);
    // The archived node itself is also not in scope (it's excluded from the graph).
    expect(await isNodeInScope(db, ctx.tenantId, [ctx.parent.id], ctx.child.id)).toBe(false);
  });

  it("batch variant preserves input order and handles mixed in/out nodes", async () => {
    const a = await seedTree(db);
    const b = await seedTree(db);
    const res = await areNodesInScope(db, a.tenantId, [a.child.id], [
      a.grandchild.id, // in (descendant of child)
      a.sibling.id, // out (sibling of child, not in subtree)
      a.child.id, // in (scope root itself)
      b.child.id, // out (different tenant)
    ]);
    expect(res).toEqual([true, false, true, false]);
  });

  it("returns false for unknown node ids", async () => {
    const ctx = await seedTree(db);
    const missing = "00000000-0000-0000-0000-000000000000";
    expect(await isNodeInScope(db, ctx.tenantId, [ctx.parent.id], missing)).toBe(false);
  });
});

async function seedTree(db: Database) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const [t] = await db
    .insert(tenant)
    .values({ name: `scope-${suffix}`, slug: `scope-${suffix}` })
    .returning();

  const [parent] = await db
    .insert(hierarchyNode)
    .values({ tenantId: t!.id, type: "station", name: "Parent", slug: `parent-${suffix}` })
    .returning();

  const [child] = await db
    .insert(hierarchyNode)
    .values({
      tenantId: t!.id,
      type: "broadcast_channel",
      parentId: parent!.id,
      name: "Child",
      slug: `child-${suffix}`,
    })
    .returning();

  const [grandchild] = await db
    .insert(hierarchyNode)
    .values({
      tenantId: t!.id,
      type: "language_channel",
      parentId: child!.id,
      name: "Grandchild",
      slug: `grandchild-${suffix}`,
    })
    .returning();

  const [sibling] = await db
    .insert(hierarchyNode)
    .values({
      tenantId: t!.id,
      type: "broadcast_channel",
      parentId: parent!.id,
      name: "Sibling",
      slug: `sibling-${suffix}`,
    })
    .returning();

  return {
    tenantId: t!.id,
    parent: parent!,
    child: child!,
    grandchild: grandchild!,
    sibling: sibling!,
  };
}

