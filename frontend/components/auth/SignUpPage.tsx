"use client";

import type { FormEvent } from "react";

import Link from "next/link";
import { useRef, useState } from "react";

import flow from "./auth-flow.module.css";
import { AuthCard } from "./AuthCard";
import styles from "./login.module.css";
import { PasswordFields, passwordLengthError } from "./PasswordFields";

type Step = "email" | "verify" | "profile" | "google";
type Errors = {
  email?: string;
  code?: string;
  fullName?: string;
  password?: string;
  confirmation?: string;
};
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
  const emailRef = useRef<HTMLInputElement>(null);
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
    // UI only: never accept a code as verified or create a fake account/session.
    setMessage(
      step === "email"
        ? "We couldn’t request a verification code. Please try again later."
        : step === "verify"
          ? "We couldn’t verify this code. Please try again later."
          : "We couldn’t create your account. Please try again later.",
    );
  }
  function changeEmail() {
    setStep("email");
    setCode("");
    setFullName("");
    setPassword("");
    setConfirmation("");
    setErrors({});
    setMessage("");
  }
  return (
    <AuthCard
      compact
      footer={
        step === "email" ? (
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
        step === "google"
          ? "Confirm your account"
          : step === "verify"
            ? "Check your email"
            : step === "profile"
              ? "Add your account details"
              : "Create your account"
      }
      description={
        step === "google"
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
        <button
          type="submit"
          className={`button button-primary ${styles.submit}`}
        >
          {step === "email"
            ? "Continue with email"
            : step === "verify"
              ? "Verify email"
              : "Create account"}
        </button>
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
            onClick={() =>
              setMessage("We couldn’t resend the code. Please try again later.")
            }
          >
            Resend code
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
