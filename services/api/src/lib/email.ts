import nodemailer from "nodemailer";
import type { Env } from "../env";

export type EmailSender = (to: string, subject: string, text: string) => Promise<void>;
export type MailTransport = {
  sendMail(input: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
};
export type MailTransportFactory = (env: Env) => MailTransport;

const createNodemailerTransport: MailTransportFactory = (env) =>
  nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER || env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

export function createEmailSender(
  env: Env,
  transportFactory: MailTransportFactory = createNodemailerTransport,
): EmailSender {
  const requiresSmtp = env.NODE_ENV === "staging" || env.NODE_ENV === "production";

  if (!env.SMTP_HOST) {
    if (requiresSmtp) {
      throw new Error("SMTP_HOST is required when NODE_ENV is staging or production");
    }
    return (to, subject) => {
      console.log(`[email:dev] to=${to} subject=${subject} (body redacted; may contain tokens)`);
      return Promise.resolve();
    };
  }

  const transport = transportFactory(env);
  return async (to, subject, text) => {
    await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
  };
}
