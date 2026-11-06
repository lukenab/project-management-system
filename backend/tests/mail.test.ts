import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  sendMail,
  setMailer,
  verificationEmail,
} from "../src/services/mail.ts";

// Log collector
const logs: string[] = [];
function log(msg: string = "") {
  console.log(msg);
  logs.push(msg);
}

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedCount++;
    log(`  [PASS] ${testName}`);
  } else {
    failedCount++;
    log(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function check(name: string, run: () => Promise<boolean>) {
  try {
    assert(await run(), name);
  } catch (e: any) {
    assert(false, name, e.message);
  }
}

async function catchError(run: () => unknown): Promise<any> {
  try {
    await run();
    return null;
  } catch (e: any) {
    return e;
  }
}

/** Chạy một đoạn với biến môi trường tạm thời, rồi khôi phục */
async function withEnv<T>(
  vars: Record<string, string | undefined>,
  run: () => Promise<T> | T,
) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function runTests() {
  process.env.NODE_ENV = "test";

  // ============================================================================
  // SUITE 1: Mailer
  // ============================================================================
  log("\n--- SUITE 1: mailer ---");

  /** Thay fetch bằng bản giả ghi lại lời gọi; trả về hàm khôi phục */
  const stubFetch = (response: () => Response) => {
    const realFetch = globalThis.fetch;
    const calls: { url: string; init: any }[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return response();
    }) as typeof fetch;
    return {
      calls,
      restore: () => {
        globalThis.fetch = realFetch;
      },
    };
  };
  const mail = { to: "a@example.com", subject: "Hi", text: "Code 123456" };

  await check(
    "1.1: Không có RESEND_API_KEY -> in ra console, không gọi mạng",
    async () => {
      const fetchStub = stubFetch(() => new Response("{}"));
      try {
        for (const NODE_ENV of ["development", "test"]) {
          await withEnv({ RESEND_API_KEY: undefined, NODE_ENV }, () =>
            sendMail(mail),
          );
        }
        await withEnv({ RESEND_API_KEY: "", NODE_ENV: "test" }, () =>
          sendMail(mail),
        );
        return fetchStub.calls.length === 0;
      } finally {
        fetchStub.restore();
      }
    },
  );

  await check(
    "1.2: Production không có RESEND_API_KEY -> lỗi cấu hình, không in mã ra log",
    async () => {
      const fetchStub = stubFetch(() => new Response("{}"));
      try {
        const error = await catchError(() =>
          withEnv({ RESEND_API_KEY: undefined, NODE_ENV: "production" }, () =>
            sendMail(mail),
          ),
        );
        return (
          error instanceof Error &&
          /RESEND_API_KEY/.test(error.message) &&
          fetchStub.calls.length === 0
        );
      } finally {
        fetchStub.restore();
      }
    },
  );

  await check(
    "1.3: Có RESEND_API_KEY -> gọi API Resend đúng địa chỉ, header và nội dung (text + html)",
    async () => {
      const fetchStub = stubFetch(
        () => new Response(JSON.stringify({ id: "1" }), { status: 200 }),
      );
      try {
        await withEnv(
          {
            RESEND_API_KEY: "re_secret",
            MAIL_FROM: "App <no-reply@example.com>",
            NODE_ENV: "production",
          },
          () => sendMail({ ...mail, html: "<b>Code 123456</b>" }),
        );
        const { url, init } = fetchStub.calls[0];
        const body = JSON.parse(init.body);
        return (
          fetchStub.calls.length === 1 &&
          url === "https://api.resend.com/emails" &&
          init.method === "POST" &&
          init.headers.Authorization === "Bearer re_secret" &&
          init.headers["Content-Type"] === "application/json" &&
          body.from === "App <no-reply@example.com>" &&
          body.to.length === 1 &&
          body.to[0] === "a@example.com" &&
          body.subject === "Hi" &&
          body.text === "Code 123456" &&
          body.html === "<b>Code 123456</b>" &&
          init.signal instanceof AbortSignal
        );
      } finally {
        fetchStub.restore();
      }
    },
  );

  await check(
    "1.4: Resend trả lỗi -> ném lỗi không chứa khóa API hay nội dung email",
    async () => {
      const fetchStub = stubFetch(
        () => new Response("denied re_secret", { status: 403 }),
      );
      try {
        const error = await catchError(() =>
          withEnv(
            { RESEND_API_KEY: "re_secret", MAIL_FROM: "x@example.com" },
            () => sendMail(mail),
          ),
        );
        return (
          error instanceof Error &&
          error.message.includes("403") &&
          !error.message.includes("re_secret") &&
          !error.message.includes("123456")
        );
      } finally {
        fetchStub.restore();
      }
    },
  );

  await check(
    "1.5: Có RESEND_API_KEY nhưng thiếu MAIL_FROM -> lỗi cấu hình, không gọi mạng",
    async () => {
      const fetchStub = stubFetch(() => new Response("{}"));
      try {
        const error = await catchError(() =>
          withEnv({ RESEND_API_KEY: "k", MAIL_FROM: undefined }, () =>
            sendMail(mail),
          ),
        );
        return error instanceof Error && fetchStub.calls.length === 0;
      } finally {
        fetchStub.restore();
      }
    },
  );

  await check(
    "1.6: setMailer thay cách gửi và null trả về cấu hình theo biến môi trường",
    async () => {
      const received: string[] = [];
      setMailer({
        async send(m) {
          received.push(m.to);
        },
      });
      await sendMail({ ...mail, to: "x@example.com" });
      setMailer(null);
      await withEnv({ RESEND_API_KEY: undefined, NODE_ENV: "test" }, () =>
        sendMail({ ...mail, to: "y@example.com" }),
      );
      return received.length === 1 && received[0] === "x@example.com";
    },
  );

  await check(
    "1.7: verificationEmail: mã trong tiêu đề, text và html; nói rõ hạn dùng",
    async () => {
      const mail = verificationEmail("123456", 10);
      return (
        mail.subject.startsWith("123456 ") &&
        mail.text.includes("123456") &&
        mail.text.includes("10 minutes") &&
        mail.html.includes("123456") &&
        mail.html.includes("10 minutes") &&
        mail.html.startsWith("<div") &&
        !mail.html.includes("undefined")
      );
    },
  );

  // -------------------------------------------------------------
  // SUMMARY & WRITE LOG FILE
  // -------------------------------------------------------------
  setMailer(null);
  log("\n===============================================================");
  log(`  TỔNG KẾT KẾT QUẢ TEST:`);
  log(`  Tổng số tests: ${passedCount + failedCount}`);
  log(`  Thành công (PASS): ${passedCount}`);
  log(`  Thất bại   (FAIL): ${failedCount}`);
  log("===============================================================");

  const here = path.dirname(fileURLToPath(import.meta.url));
  const logDir = path.resolve(here, "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFilePath = path.join(logDir, "mail.log");
  fs.writeFileSync(logFilePath, logs.join("\n"), "utf-8");
  console.log(`\n-> Kết quả đã được ghi vào file log: ${logFilePath}`);

  if (failedCount > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
