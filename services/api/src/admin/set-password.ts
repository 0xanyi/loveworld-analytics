import { hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { account, schema, type Database } from "@lwa/db";

export type SetAdminPasswordInput = {
  email: string;
  password: string;
};

export type SetAdminPasswordResult = {
  userId: string;
  email: string;
  credentialAccountId: string;
};

export async function setAdminPassword(
  db: Database,
  input: SetAdminPasswordInput,
): Promise<SetAdminPasswordResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("--email is required");
  if (input.password.length < 8) throw new Error("--password must be at least 8 characters");

  const userRow = await db.query.user.findFirst({
    where: sql`lower(${schema.user.email}) = ${email}`,
  });
  if (!userRow) throw new Error(`No user found for email '${email}'`);

  const passwordHash = await hashPassword(input.password);

  const existing = await db.query.account.findFirst({
    where: and(eq(account.userId, userRow.id), eq(account.providerId, "credential")),
  });

  if (existing) {
    const [updated] = await db
      .update(account)
      .set({
        accountId: userRow.id,
        password: passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(account.id, existing.id))
      .returning();
    if (!updated) throw new Error("credential update failed");
    return { userId: userRow.id, email: userRow.email, credentialAccountId: updated.id };
  }

  const [created] = await db
    .insert(account)
    .values({
      userId: userRow.id,
      providerId: "credential",
      accountId: userRow.id,
      password: passwordHash,
    })
    .returning();
  if (!created) throw new Error("credential insert failed");

  return { userId: userRow.id, email: userRow.email, credentialAccountId: created.id };
}

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { createDb } = await import("@lwa/db");
    const email = parseArg("--email");
    const password = parseArg("--password");

    if (!email || !password) {
      console.error("Usage: pnpm admin:set-password --email <email> --password <password>");
      process.exit(1);
    }

    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error("DATABASE_URL env var required");
      process.exit(1);
    }

    const db = createDb(url);
    const result = await setAdminPassword(db, { email, password });
    console.log(`✓ Password credential set for ${result.email}`);
    process.exit(0);
  } catch (e) {
    console.error(`✗ Failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
