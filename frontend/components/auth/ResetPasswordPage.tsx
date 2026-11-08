"use client";

import type { FormEvent } from "react";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { resetPassword } from "@/lib/auth";

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
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const busy = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const next = {
      password: passwordLengthError(password),
      confirmation: !confirmation
        ? "Confirm your password."
        : confirmation !== password
          ? "Passwords do not match."
          : undefined,
    };
    setErrors(next);
    setMessage("");
    if (next.password || next.confirmation) {
      document
        .getElementById(next.password ? "auth-password" : "auth-confirmation")
        ?.focus();
      return;
    }

    busy.current = true;
    setPending(true);
    try {
      // The token stays in the address bar and is read only when the form is sent.
      const token = new URLSearchParams(window.location.search).get("token");
      await resetPassword({ token: token ?? "", newPassword: password });
      setPassword("");
      setConfirmation("");
      setDone(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "INVALID_FLOW_TOKEN") {
        setLinkInvalid(true);
      } else if (
        reason instanceof ApiError &&
        reason.code === "VALIDATION_FAILED" &&
        reason.field === "newPassword"
      ) {
        setErrors({ password: reason.message });
      } else {
        setMessage(
          reason instanceof ApiError
            ? reason.message
            : "We couldn’t reset your password. Please try again later.",
        );
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const unavailable = !hasToken || linkInvalid;
  return (
    <AuthCard
      title={
        done
          ? "Password updated"
          : unavailable
            ? "Reset link unavailable"
            : "Reset your password"
      }
      description={
        done
          ? "You can now sign in with your new password."
          : linkInvalid
            ? "This link has expired or was already used. Request a new one."
            : hasToken
              ? "Choose a new password for your account."
              : "Open the link from your reset email, or request a new one."
      }
    >
      {done ? (
        <Link
          className={`button button-primary ${styles.submit}`}
          href="/login"
        >
          Go to sign in
        </Link>
      ) : unavailable ? (
        <Link
          className={`button button-primary ${styles.submit}`}
          href="/forgot-password"
        >
          Request a new reset link
        </Link>
      ) : (
        <form noValidate onSubmit={submit} aria-busy={pending}>
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
            {pending ? "Updating…" : "Reset password"}
          </button>
          {message && (
            <p className={flow.alert} role="alert">
              {message}
            </p>
          )}
        </form>
      )}
    </AuthCard>
  );
}
