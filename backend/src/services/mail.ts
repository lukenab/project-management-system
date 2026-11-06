import logger from "../utils/logger.ts";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type Mailer = { send(message: MailMessage): Promise<void> };

// Chỉ dùng khi phát triển: in nội dung email (có cả mã xác minh) ra log thay vì gửi thật
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

/** Thay cách gửi (dùng trong test); null để trở về cấu hình theo biến môi trường */
export const setMailer = (mailer: Mailer | null) => {
  override = mailer;
};

/**
 * Có RESEND_API_KEY thì gửi email thật qua Resend. Không có thì in ra console để dev
 * không cần key; production không bao giờ in mã ra log nên thiếu key sẽ báo lỗi.
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

/** Email chứa mã xác minh đăng ký: tiêu đề có mã, nội dung gồm cả text và html */
export const verificationEmail = (code: string, expiresInMinutes: number) => {
  const ignore = "If you did not request it, you can safely ignore this email.";
  return {
    subject: `${code} is your ${APP_NAME} verification code`,
    text:
      `Use this code to finish creating your ${APP_NAME} account:\n\n` +
      `${code}\n\nThis code expires in ${expiresInMinutes} minutes.\n${ignore}`,
    // Style viết thẳng trong thẻ vì các trình đọc email không hỗ trợ CSS ngoài; code chỉ gồm chữ số
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
