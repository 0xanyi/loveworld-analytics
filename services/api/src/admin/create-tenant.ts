import { schema, type Database } from "@lwa/db";
import { eq, sql } from "drizzle-orm";

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

/**
 * Normalize a slug candidate: lowercase, replace non-alphanumeric runs with "-",
 * trim leading/trailing "-". Applied to both auto-derived and explicit slugs
 * so behavior is consistent across both paths.
 */
export function normalizeSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function createTenantAndAdmin(
  db: Database,
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.tenant.findFirst({
      where: eq(schema.tenant.slug, input.tenantSlug),
    });
    if (existing) throw new Error(`Tenant slug '${input.tenantSlug}' already exists`);

    const [tenantRow] = await tx
      .insert(schema.tenant)
      .values({ name: input.tenantName, slug: input.tenantSlug })
      .returning();
    if (!tenantRow) throw new Error("tenant insert failed");

    // Emails are case-insensitive per RFC 5321 local-part MAY be, but domain MUST be.
    // We normalize to lowercase everywhere to avoid "Admin@X.com" vs "admin@x.com"
    // creating duplicate users on the unique(email) constraint.
    const normalizedEmail = input.adminEmail.toLowerCase();
    let userRow = await tx.query.user.findFirst({
      where: sql`lower(${schema.user.email}) = ${normalizedEmail}`,
    });
    if (!userRow) {
      const [inserted] = await tx
        .insert(schema.user)
        .values({
          email: normalizedEmail,
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
  try {
    const { createDb } = await import("@lwa/db");
    const parseArg = (flag: string): string | undefined => {
      const idx = process.argv.indexOf(flag);
      return idx >= 0 ? process.argv[idx + 1] : undefined;
    };

    const name = parseArg("--name");
    const rawSlug = parseArg("--slug") ?? name;
    const slug = rawSlug ? normalizeSlug(rawSlug) : undefined;
    const adminEmail = parseArg("--admin-email");
    const adminName = parseArg("--admin-name") ?? "Admin";

    if (!name || !slug || !adminEmail) {
      console.error(
        "Usage: pnpm admin:create-tenant --name <name> [--slug <slug>] --admin-email <email> [--admin-name <name>]",
      );
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
    console.log("");
    console.log("Next: set the admin login password");
    console.log(`  pnpm admin:set-password --email ${result.user.email} --password <temporary-password>`);
    console.log("  Share the temporary password through a secure channel and rotate it after first login.");
    process.exit(0);
  } catch (e) {
    console.error(`✗ Failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
