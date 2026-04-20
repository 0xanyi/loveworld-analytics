import { Hono } from "hono";

// Return an EXPLICIT subset of session.user rather than passing the raw object
// through. Better Auth's runtime session includes extra fields (createdAt,
// updatedAt, and anything future plugins add) that we don't want to leak
// through /me accidentally. This is the API-contract boundary with the
// frontend in Task 8 — keep it explicit.
export const meRoutes = new Hono().get("/me", (c) => {
  const session = c.get("session");
  if (!session?.user) return c.json({ error: "unauthenticated" }, 401);
  return c.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerified,
      image: session.user.image ?? null,
      twoFactorEnabled: session.user.twoFactorEnabled ?? false,
    },
  });
});
