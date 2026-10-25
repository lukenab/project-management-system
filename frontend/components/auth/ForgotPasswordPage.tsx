"use client";

import type { FormEvent } from "react";

import Link from "next/link";
import { useRef, useState } from "react";

import flow from "./auth-flow.module.css";
import { AuthCard } from "./AuthCard";
import styles from "./login.module.css";

export function ForgotPasswordPage({
  previewSent = false,
}: {
  previewSent?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = !email.trim()
      ? "Enter your email address."
      : emailRef.current?.validity.typeMismatch
        ? "Enter a valid email address."
        : "";
    setError(invalid);
    setUnavailable(false);
    if (invalid) {
      emailRef.current?.focus();
      return;
    }
    setUnavailable(true);
  }
  return (
    <AuthCard
      compact={previewSent}
      className={previewSent ? flow.result : undefined}
      footer={
        previewSent ? (
          <Link
            href="/login"
            className={`button button-primary ${styles.submit}`}
          >
            Back to sign in
          </Link>
        ) : undefined
      }
      title={previewSent ? "Check your email" : "Forgot password?"}
      description={
        previewSent
          ? "If your account is eligible, you’ll receive a password reset link."
          : "Enter your email address to request a password reset link."
      }
    >
      {previewSent ? (
        <p className={flow.resultHelp}>Check your inbox and spam folder.</p>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className={styles.field}>
            <label htmlFor="recovery-email">Email</label>
            <input
              ref={emailRef}
              id="recovery-email"
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
                setError("");
                setUnavailable(false);
              }}
              aria-invalid={!!error}
              aria-describedby={error ? "recovery-email-error" : undefined}
            />
            {error && (
              <p
                id="recovery-email-error"
                className={styles.fieldError}
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
          <button
            type="submit"
            className={`button button-primary ${styles.submit}`}
          >
            Send reset link
          </button>
          {unavailable && (
            <p className={flow.alert} role="alert">
              We couldn’t request a reset link. Please try again later.
            </p>
          )}
        </form>
      )}
      {!previewSent && (
        <p className={flow.help}>
          Use Google sign-in if your account was created with Google.
        </p>
      )}
    </AuthCard>
  );
}
