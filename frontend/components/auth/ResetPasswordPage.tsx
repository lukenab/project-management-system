"use client";

import type { FormEvent } from "react";

import Link from "next/link";
import { useState } from "react";

import flow from "./auth-flow.module.css";
import { AuthCard } from "./AuthCard";
import styles from "./login.module.css";
import { PasswordFields, passwordLengthError } from "./PasswordFields";

export function ResetPasswordPage({ hasToken }: { hasToken: boolean }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<{
    password?: string;
    confirmation?: string;
  }>({});
  const [unavailable, setUnavailable] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = {
      password: passwordLengthError(password),
      confirmation: !confirmation
        ? "Confirm your password."
        : confirmation !== password
          ? "Passwords do not match."
          : undefined,
    };
    setErrors(next);
    setUnavailable(false);
    if (next.password || next.confirmation) {
      document
        .getElementById(next.password ? "auth-password" : "auth-confirmation")
        ?.focus();
      return;
    }
    setUnavailable(true);
  }
  return (
    <AuthCard
      title={hasToken ? "Reset your password" : "Reset link unavailable"}
      description={
        hasToken
          ? "Choose a new password for your account."
          : "Open the link from your reset email, or request a new one."
      }
    >
      {hasToken ? (
        <form noValidate onSubmit={submit}>
          <PasswordFields
            password={password}
            confirmation={confirmation}
            onPassword={(v) => {
              setPassword(v);
              setErrors((e) => ({ ...e, password: undefined }));
              setUnavailable(false);
            }}
            onConfirmation={(v) => {
              setConfirmation(v);
              setErrors((e) => ({ ...e, confirmation: undefined }));
              setUnavailable(false);
            }}
            errors={errors}
          />
          <button
            type="submit"
            className={`button button-primary ${styles.submit}`}
          >
            Reset password
          </button>
          {unavailable && (
            <p className={flow.alert} role="alert">
              We couldn’t reset your password. Please try again later or request
              a new link.
            </p>
          )}
        </form>
      ) : (
        <Link
          className={`button button-primary ${styles.submit}`}
          href="/forgot-password"
        >
          Request a new reset link
        </Link>
      )}
    </AuthCard>
  );
}
