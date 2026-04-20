import { Hono } from "hono";

// Uses typed c.get("session") — `SessionContext | undefined` per the
// ContextVariableMap augmentation in @lwa/auth/middleware.ts. No cast needed
// (deviation from plan, which predates Task 4's review fix).
export const meRoutes = new Hono().get("/me", (c) => {
  const session = c.get("session");
  if (!session?.user) return c.json({ error: "unauthenticated" }, 401);
  return c.json({ user: session.user });
});
