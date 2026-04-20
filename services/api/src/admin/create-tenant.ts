import { schema, type Database } from "@lwa/db";
import { eq } from "drizzle-orm";

export type CreateTenantInput = {
  tenantName: string;
  tenantSlug: string;
  adminEmail: string;
  adminName: string;
};

export type CreateTenantResult = {
  tenant: { id: string; slug: string; name: string };
  user: { id: string; email: string; name: string };
  membership: { id: string; userId: string; tenantId: string; role: "network_admin" };
};

export async function createTenantAndAdmin(
  db: Database,
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db as any).transaction(async (tx: Database) => {
    const existing = await tx.query.tenant.findFirst({
      where: eq(schema.tenant.slug, input.tenantSlug),
    });
    if (existing) throw new Error(`Tenant slug '${input.tenantSlug}' already exists`);

    const [tenantRow] = await tx
      .insert(schema.tenant)
      .values({ name: input.tenantName, slug: input.tenantSlug })
      .returning();
    if (!tenantRow) throw new Error("tenant insert failed");

    let userRow = await tx.query.user.findFirst({ where: eq(schema.user.email, input.adminEmail) });
    if (!userRow) {
      const [inserted] = await tx
        .insert(schema.user)
        .values({
          email: input.adminEmail,
          name: input.adminName,
          emailVerified: true,
        })
        .returning();
      if (!inserted) throw new Error("user insert failed");
      userRow = inserted;
    }

    const [membershipRow] = await tx
      .insert(schema.tenantMembership)
      .values({
        userId: userRow.id,
        tenantId: tenantRow.id,
        role: "network_admin",
      })
      .returning();
    if (!membershipRow) throw new Error("membership insert failed");

    return {
      tenant: { id: tenantRow.id, slug: tenantRow.slug, name: tenantRow.name },
      user: { id: userRow.id, email: userRow.email, name: userRow.name },
      membership: {
        id: membershipRow.id,
        userId: membershipRow.userId,
        tenantId: membershipRow.tenantId,
        role: "network_admin",
      },
    };
  });
}

// CLI entrypoint: `pnpm admin:create-tenant --name <name> --slug <slug> --admin-email <email> --admin-name <name>`
if (import.meta.url === `file://${process.argv[1]}`) {
  const { createDb } = await import("@lwa/db");
  const parseArg = (flag: string): string | undefined => {
    const idx = process.argv.indexOf(flag);
    return idx >= 0 ? process.argv[idx + 1] : undefined;
  };

  const name = parseArg("--name");
  const slug = parseArg("--slug") ?? name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const adminEmail = parseArg("--admin-email");
  const adminName = parseArg("--admin-name") ?? "Admin";

  if (!name || !slug || !adminEmail) {
    console.error("Usage: pnpm admin:create-tenant --name <name> [--slug <slug>] --admin-email <email> [--admin-name <name>]");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL env var required");
    process.exit(1);
  }

  const db = createDb(url);
  const result = await createTenantAndAdmin(db, {
    tenantName: name,
    tenantSlug: slug,
    adminEmail,
    adminName,
  });
  console.log("✓ Created:");
  console.log(`  Tenant   : ${result.tenant.name} (${result.tenant.slug})`);
  console.log(`  Admin    : ${result.user.email}`);
  console.log("Next step: the admin user has no password yet. Run Better Auth's reset-password flow");
  console.log("or update the password directly via Better Auth API to allow login.");
  process.exit(0);
}