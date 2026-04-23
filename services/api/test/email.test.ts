import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { createEmailSender } from "../src/lib/email";

const BASE_ENV: Env = {
  NODE_ENV: "development",
  LOG_LEVEL: "info",
  DATABASE_URL: "postgres://user:pw@localhost:5432/db",
  API_PORT: 3001,
  AUTH_SECRET: "a".repeat(32),
  AUTH_BASE_URL: "http://localhost:3001",
  REDIS_URL: "redis://localhost:6379",
  SMTP_HOST: "",
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: "",
  SMTP_PASS: "",
  SMTP_FROM: "no-reply@example.com",
  ALLOWED_ORIGINS: [],
};

describe("createEmailSender", () => {
  it("uses a redacted dev sender outside staging/production when SMTP_HOST is blank", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const sender = createEmailSender(BASE_ENV);
    await sender("admin@example.com", "Subject", "Secret token body");
    expect(log.mock.calls[0]?.[0]).toContain("body redacted");
    expect(log.mock.calls[0]?.[0]).not.toContain("Secret token body");
    log.mockRestore();
  });

  it("requires SMTP_HOST in staging and production", () => {
    expect(() => createEmailSender({ ...BASE_ENV, NODE_ENV: "staging" })).toThrow(/SMTP_HOST/);
    expect(() => createEmailSender({ ...BASE_ENV, NODE_ENV: "production" })).toThrow(/SMTP_HOST/);
  });

  it("sends through injected transport when SMTP is configured", async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const sender = createEmailSender(
      {
        ...BASE_ENV,
        NODE_ENV: "production",
        SMTP_HOST: "smtp.example.com",
        SMTP_USER: "user",
        SMTP_PASS: "pass",
        SMTP_FROM: "no-reply@loveworld.example",
      },
      () => ({ sendMail }),
    );

    await sender("admin@example.com", "Subject", "Body");

    expect(sendMail).toHaveBeenCalledWith({
      from: "no-reply@loveworld.example",
      to: "admin@example.com",
      subject: "Subject",
      text: "Body",
    });
  });
});
