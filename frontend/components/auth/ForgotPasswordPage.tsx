"use client";

import type { FormEvent } from "react";

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
      title={previewSent ? "Check your inbox" : "Forgot password?"}
      description={
        previewSent
          ? "If the account is eligible, password reset instructions will be sent."
          : "Enter your email address to request a password reset link."
      }
    >
      {previewSent ? (
        <p className={flow.help}>
          Check your inbox and spam folder. Follow the link to choose a new
          password.
        </p>
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
      <p className={flow.help}>
        Use Google sign-in if your account was created with Google.
      </p>
    </AuthCard>
  );
}
