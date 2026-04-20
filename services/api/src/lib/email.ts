import type { Env } from "../env";

export type EmailSender = (to: string, subject: string, text: string) => Promise<void>;

export function createEmailSender(env: Env): EmailSender {
  if (!env.SMTP_HOST) {
    // Dev fallback — log instead of send
    return (to, subject, text) => {
      console.log(`[email:dev] to=${to} subject=${subject}\n${text}`);
      return Promise.resolve();
    };
  }
  // Real SMTP wiring comes in Phase 1 when we actually send digest emails.
  // For Phase 0 we keep it logger-only to avoid SMTP dependency at bootstrap.
  return (to, subject, text) => {
    console.log(`[email] to=${to} subject=${subject}\n${text}`);
    return Promise.resolve();
  };
}
