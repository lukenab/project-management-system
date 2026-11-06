"use client";

import type { FormEvent } from "react";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import {
  registerAccount,
  requestRegistration,
  resendRegistration,
  verifyRegistration,
} from "@/lib/auth";

import flow from "./auth-flow.module.css";
import { AuthCard } from "./AuthCard";
import styles from "./login.module.css";
import { PasswordFields, passwordLengthError } from "./PasswordFields";

type Step = "email" | "verify" | "profile" | "google" | "done";
type Errors = {
  email?: string;
  code?: string;
  fullName?: string;
  password?: string;
  confirmation?: string;
};
type Action = "email" | "verify" | "resend" | "profile";

const RESEND_COOLDOWN_MS = 60_000;
const FULL_NAME_MAX_LENGTH = 100;

export function SignUpPage({
  initialStep = "email",
  previewEmail = "",
  googleProfile,
}: {
  initialStep?: Step;
  previewEmail?: string;
  googleProfile?: { email: string; fullName: string };
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const [email, setEmail] = useState(previewEmail);
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  // The request id and the registration token stay in memory only; reloading starts over.
  const requestId = useRef("");
  const registrationToken = useRef("");
  const busy = useRef(false);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const counting = secondsLeft > 0;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  function startCooldown() {
    const current = Date.now();
    setNow(current);
    setResendAt(current + RESEND_COOLDOWN_MS);
  }

  function restart(next: { message?: string } = {}) {
    requestId.current = "";
    registrationToken.current = "";
    setStep("email");
    setCode("");
    setFullName("");
    setPassword("");
    setConfirmation("");
    setErrors({});
    setMessage(next.message ?? "");
    setNotice("");
    setResendAt(0);
  }

  // Shows a backend error where the user can act on it (see docs/api/errors.md).
  function fail(error: unknown, action: Action) {
    if (!(error instanceof ApiError)) {
      setMessage("Something went wrong. Please try again.");
      return;
    }
    switch (error.code) {
      case "EMAIL_ALREADY_REGISTERED":
        restart();
        setErrors({
          email: "An account with this email already exists. Try signing in.",
        });
        return;
      case "INVALID_FLOW_TOKEN":
        restart({
          message: "This registration is no longer valid. Please start again.",
        });
        return;
      case "INVALID_VERIFICATION_CODE":
        setErrors({ code: error.message });
        return;
      case "RATE_LIMITED":
        // Too many wrong codes: the request cannot be used any more.
        if (action === "verify") restart({ message: error.message });
        else setMessage(error.message);
        return;
      case "VALIDATION_FAILED":
        if (
          error.field === "email" ||
          error.field === "code" ||
          error.field === "fullName" ||
          error.field === "password"
        ) {
          setErrors({ [error.field]: error.message });
        } else {
          setMessage(error.message);
        }
        return;
      default:
        setMessage(error.message);
    }
  }

  async function run(action: Action, task: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    setNotice("");
    try {
      await task();
    } catch (error) {
      fail(error, action);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const next: Errors = {};
    if (step === "email") {
      if (!email.trim()) next.email = "Enter your email address.";
      else if (emailRef.current?.validity.typeMismatch)
        next.email = "Enter a valid email address.";
    } else if (step === "verify") {
      if (!/^\d{6}$/.test(code))
        next.code = "Enter the six-digit code from your email.";
    } else if (step === "profile") {
      if (!fullName.trim()) next.fullName = "Enter your full name.";
      else if (fullName.trim().length > FULL_NAME_MAX_LENGTH)
        next.fullName = `Use ${FULL_NAME_MAX_LENGTH} characters or fewer.`;
      next.password = passwordLengthError(password);
      next.confirmation = !confirmation
        ? "Confirm your password."
        : confirmation !== password
          ? "Passwords do not match."
          : undefined;
    }
    setErrors(next);
    const first = Object.entries(next).find(([, value]) => value)?.[0];
    if (first) {
      document
        .getElementById(
          first === "password" || first === "confirmation"
            ? `auth-${first}`
            : `signup-${first}`,
        )
        ?.focus();
      return;
    }

    if (step === "email") {
      void run("email", async () => {
        const result = await requestRegistration(email.trim());
        requestId.current = result.requestId;
        setStep("verify");
        startCooldown();
      });
    } else if (step === "verify") {
      void run("verify", async () => {
        const result = await verifyRegistration(requestId.current, code);
        registrationToken.current = result.registrationToken;
        setStep("profile");
      });
    } else if (step === "profile") {
      void run("profile", async () => {
        await registerAccount({
          registrationToken: registrationToken.current,
          fullName: fullName.trim(),
          password,
        });
        registrationToken.current = "";
        setPassword("");
        setConfirmation("");
        setStep("done");
      });
    } else {
      // Google sign-up is not connected to the backend yet.
      setMessage(
        "Google sign-up is temporarily unavailable. Please try again later.",
      );
    }
  }

  function resend() {
    void run("resend", async () => {
      await resendRegistration(requestId.current);
      startCooldown();
      setCode("");
      setNotice("We sent a new code to your email.");
    });
  }

  function changeEmail() {
    restart();
  }
  return (
    <AuthCard
      compact
      footer={
        step === "done" ? undefined : step === "email" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className={styles.textButton}>
              Sign in
            </Link>
          </>
        ) : (
          <Link href="/login" className={styles.textButton}>
            Cancel registration
          </Link>
        )
      }
      title={
        step === "done"
          ? "Account created"
          : step === "google"
            ? "Confirm your account"
            : step === "verify"
              ? "Check your email"
              : step === "profile"
                ? "Add your account details"
                : "Create your account"
      }
      description={
        step === "done"
          ? "Your account is ready. Sign in to continue."
          : step === "google"
            ? "Review the information provided by Google."
            : step === "verify"
              ? "Enter the verification code sent to:"
              : step === "profile"
                ? "Add your name and choose a password."
                : "Start with your email address."
      }
    >
      <form noValidate onSubmit={submit}>
        {step === "email" && (
          <div className={styles.field}>
            <label htmlFor="signup-email">Email</label>
            <input
              ref={emailRef}
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Enter your email address"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors({});
                setMessage("");
              }}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "signup-email-error" : undefined}
            />
            {errors.email && (
              <p
                id="signup-email-error"
                className={styles.fieldError}
                role="alert"
              >
                {errors.email}
              </p>
            )}
          </div>
        )}
        {step === "verify" && (
          <>
            <div className={flow.recipient}>
              <strong>{email}</strong>
              <button
                type="button"
                className={styles.textButton}
                onClick={changeEmail}
              >
                Change email
              </button>
            </div>
            <div className={styles.field}>
              <label htmlFor="signup-code">Verification code</label>
              <div className={flow.codeField}>
                <input
                  id="signup-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={flow.codeInput}
                  required
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setErrors({});
                    setMessage("");
                  }}
                  aria-invalid={!!errors.code}
                  aria-describedby={
                    errors.code
                      ? "signup-code-help signup-code-error"
                      : "signup-code-help"
                  }
                />
                <div className={flow.codeSlots} aria-hidden="true">
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <span key={index}>{code[index] || ""}</span>
                  ))}
                </div>
              </div>
              <p id="signup-code-help" className={flow.help}>
                Codes expire after 10 minutes. Use the latest code.
              </p>
              {errors.code && (
                <p
                  id="signup-code-error"
                  className={styles.fieldError}
                  role="alert"
                >
                  {errors.code}
                </p>
              )}
            </div>
          </>
        )}
        {step === "profile" && (
          <>
            <div className={flow.verifiedEmail}>
              <span className={flow.verifiedLabel}>Verified email</span>
              <p className={flow.email}>
                {email}{" "}
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={changeEmail}
                >
                  Change email
                </button>
              </p>
            </div>
            <div className={styles.field}>
              <label htmlFor="signup-fullName">Full name</label>
              <input
                id="signup-fullName"
                name="fullName"
                autoComplete="name"
                placeholder="Enter your full name"
                required
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setErrors((s) => ({ ...s, fullName: undefined }));
                  setMessage("");
                }}
                aria-invalid={!!errors.fullName}
                aria-describedby={
                  errors.fullName ? "signup-name-error" : undefined
                }
              />
              {errors.fullName && (
                <p
                  id="signup-name-error"
                  className={styles.fieldError}
                  role="alert"
                >
                  {errors.fullName}
                </p>
              )}
            </div>
            <PasswordFields
              password={password}
              confirmation={confirmation}
              onPassword={(v) => {
                setPassword(v);
                setErrors((e) => ({ ...e, password: undefined }));
                setMessage("");
              }}
              onConfirmation={(v) => {
                setConfirmation(v);
                setErrors((e) => ({ ...e, confirmation: undefined }));
                setMessage("");
              }}
              errors={errors}
            />
          </>
        )}
        {step === "google" && googleProfile && (
          <dl className={flow.profile}>
            <dt>Full name</dt>
            <dd>{googleProfile.fullName}</dd>
            <dt>Email</dt>
            <dd>{googleProfile.email}</dd>
          </dl>
        )}
        {step === "done" ? (
          <Link
            href="/login"
            className={`button button-primary ${styles.submit}`}
          >
            Go to sign in
          </Link>
        ) : (
          <button
            type="submit"
            className={`button button-primary ${styles.submit}`}
            disabled={pending}
          >
            {pending && (
              <LoaderCircle
                size={17}
                className={styles.spinner}
                aria-hidden="true"
              />
            )}
            {pending
              ? "Please wait…"
              : step === "email"
                ? "Continue with email"
                : step === "verify"
                  ? "Verify email"
                  : "Create account"}
          </button>
        )}
        {notice && (
          <p className={flow.notice} role="status">
            {notice}
          </p>
        )}
        {message && (
          <p className={flow.alert} role="alert">
            {message}
          </p>
        )}
      </form>
      {step === "verify" && (
        <div className={flow.resend}>
          <span>Didn’t receive a code?</span>
          <button
            type="button"
            className={styles.textButton}
            onClick={resend}
            disabled={pending || counting}
          >
            {counting ? `Resend code in ${secondsLeft}s` : "Resend code"}
          </button>
        </div>
      )}
      {step === "email" && (
        <>
          <div className={styles.divider}>
            <span>or</span>
          </div>
          <button
            type="button"
            className={`button ${styles.googleButton}`}
            onClick={() =>
              setMessage(
                "Google sign-up is temporarily unavailable. Please try again later.",
              )
            }
          >
            <span className={styles.googleLetter} aria-hidden="true">
              G
            </span>
            Continue with Google
          </button>
        </>
      )}
    </AuthCard>
  );
}
