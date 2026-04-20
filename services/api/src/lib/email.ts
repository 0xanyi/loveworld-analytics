import type { Env } from "../env";

export type EmailSender = (to: string, subject: string, text: string) => Promise<void>;

/**
 * Phase 0 email sender.
 *
 * SECURITY: magic-link URLs arrive here as the `text` argument. Logging them
 * verbatim leaks session tokens to any log aggregator or shell history. The
 * dev sender logs only `to` and `subject`; the body is redacted.
 *
 * In production we hard-fail rather than silently log-and-skip. Real SMTP
 * wiring lands in Phase 1; until then, attempting to run with NODE_ENV=production
 * must be a loud error, not a no-op that presents "check your email" to users
 * who will never receive one.
 */
export function createEmailSender(env: Env): EmailSender {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "SMTP sender is not implemented (Phase 1 work). Do not run the API with NODE_ENV=production yet.",
    );
  }
  return (to, subject) => {
    console.log(`[email:dev] to=${to} subject=${subject} (body redacted; may contain tokens)`);
    return Promise.resolve();
  };
}
