import logger from "../utils/logger.ts";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type Mailer = { send(message: MailMessage): Promise<void> };

const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    logger.info(`[mail:console] to=${to} subject="${subject}"\n${text}`);
  },
};

const RESEND_URL = "https://api.resend.com/emails";

const resendMailer: Mailer = {
  async send({ to, subject, text, html }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;
    if (!apiKey || !from) {
      throw new Error("RESEND_API_KEY and MAIL_FROM must both be set");
    }
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(
        `Resend rejected the email with status ${response.status}`,
      );
    }
  },
};

let override: Mailer | null = null;

export const setMailer = (mailer: Mailer | null) => {
  override = mailer;
};

/**
 * Có RESEND_API_KEY thì gửi email thật qua Resend. Không có thì in ra console để dev
 */
export const sendMail = async (message: MailMessage) => {
  if (override) return override.send(message);
  if (process.env.RESEND_API_KEY) return resendMailer.send(message);
  if (process.env.NODE_ENV === "production") {
    throw new Error("RESEND_API_KEY must be set in production");
  }
  return consoleMailer.send(message);
};

const APP_NAME = "Project Management";

export const verificationEmail = (code: string, expiresInMinutes: number) => {
  const ignore = "If you did not request it, you can safely ignore this email.";
  return {
    subject: `${code} is your ${APP_NAME} verification code`,
    text:
      `Use this code to finish creating your ${APP_NAME} account:\n\n` +
      `${code}\n\nThis code expires in ${expiresInMinutes} minutes.\n${ignore}`,
    html:
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">' +
      `<h2 style="margin:0 0 16px;font-size:18px">${APP_NAME}</h2>` +
      '<p style="margin:0 0 16px;font-size:15px;line-height:1.5">Use this code to finish creating your account:</p>' +
      '<p style="margin:0 0 16px;padding:16px;background:#f3f4f6;border-radius:8px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;font-family:Consolas,Menlo,monospace">' +
      `${code}</p>` +
      `<p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280">This code expires in ${expiresInMinutes} minutes. ${ignore}</p>` +
      "</div>",
  };
};

/** Email chứa link đặt lại mật khẩu: text và html có nút bấm, nói rõ hạn dùng */
export const resetPasswordEmail = (link: string, expiresInMinutes: number) => {
  const ignore =
    "If you did not ask for this, you can safely ignore this email; your password stays the same.";
  return {
    subject: `Reset your ${APP_NAME} password`,
    text:
      `Use this link to choose a new password for your ${APP_NAME} account:

` +
      `${link}

The link expires in ${expiresInMinutes} minutes and works once.
${ignore}`,
    html:
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">' +
      `<h2 style="margin:0 0 16px;font-size:18px">${APP_NAME}</h2>` +
      '<p style="margin:0 0 16px;font-size:15px;line-height:1.5">Use the button below to choose a new password for your account:</p>' +
      `<p style="margin:0 0 16px"><a href="${link}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold">Reset password</a></p>` +
      `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#6b7280">Or open this link: ${link}</p>` +
      `<p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280">The link expires in ${expiresInMinutes} minutes and works once. ${ignore}</p>` +
      "</div>",
  };
};
