"use client";

import type { FormEvent } from "react";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { requestPasswordReset } from "@/lib/auth";

import flow from "./auth-flow.module.css";
import { AuthCard } from "./AuthCard";
import styles from "./login.module.css";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const invalid = !email.trim()
      ? "Enter your email address."
      : emailRef.current?.validity.typeMismatch
        ? "Enter a valid email address."
        : "";
    setError(invalid);
    setMessage("");
    if (invalid) {
      emailRef.current?.focus();
      return;
    }

    busy.current = true;
    setPending(true);
    try {
      // The answer is the same whether or not the account exists, so just show it as sent.
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        reason.code === "VALIDATION_FAILED" &&
        reason.field === "email"
      ) {
        setError(reason.message);
      } else {
        setMessage(
          reason instanceof ApiError
            ? reason.message
            : "We couldn’t request a reset link. Please try again later.",
        );
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <AuthCard
      compact={sent}
      className={sent ? flow.result : undefined}
      footer={
        sent ? (
          <Link
            href="/login"
            className={`button button-primary ${styles.submit}`}
          >
            Back to sign in
          </Link>
        ) : undefined
      }
      title={sent ? "Check your email" : "Forgot password?"}
      description={
        sent
          ? "If your account is eligible, you’ll receive a password reset link."
          : "Enter your email address to request a password reset link."
      }
    >
      {sent ? (
        <p className={flow.resultHelp}>
          Check your inbox and spam folder. The link works for 30 minutes.
        </p>
      ) : (
        <form onSubmit={submit} noValidate aria-busy={pending}>
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
              disabled={pending}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
                setMessage("");
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
            disabled={pending}
          >
            {pending && (
              <LoaderCircle
                size={17}
                className={styles.spinner}
                aria-hidden="true"
              />
            )}
            {pending ? "Sending…" : "Send reset link"}
          </button>
          {message && (
            <p className={flow.alert} role="alert">
              {message}
            </p>
          )}
        </form>
      )}
      {!sent && (
        <p className={flow.help}>
          Use Google sign-in if your account was created with Google.
        </p>
      )}
    </AuthCard>
  );
}
