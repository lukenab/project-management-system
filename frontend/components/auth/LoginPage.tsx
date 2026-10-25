"use client";

import type { FormEvent } from "react";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/brand/BrandMark";

import styles from "./login.module.css";

type FieldErrors = { email?: string; password?: string };
type PendingAction = "email" | "google" | null;

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState<PendingAction>(null);
  const [message, setMessage] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  function previewSignIn(action: Exclude<PendingAction, null>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setMessage("");
    setPending(action);
    timerRef.current = setTimeout(() => {
      setMessage(
        action === "google"
          ? "Google sign-in is not connected yet. No Google account was accessed."
          : "Sign-in is not connected yet. Your credentials were not sent or saved.",
      );
      setPending(null);
      busyRef.current = false;
      timerRef.current = null;
    }, 700);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const next: FieldErrors = {};
    if (!email.trim()) next.email = "Enter your email address.";
    else if (emailRef.current?.validity.typeMismatch)
      next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    setMessage("");
    if (next.email) return emailRef.current?.focus();
    if (next.password) return passwordRef.current?.focus();
    previewSignIn("email");
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrapper}>
        <section className={styles.card} aria-labelledby="login-title">
          <header className={styles.heading}>
            <div className={styles.mark}>
              <BrandMark size={48} />
            </div>
            <h1 id="login-title">Welcome back</h1>
            <p>Sign in to your project workspace.</p>
          </header>
          <form onSubmit={submit} noValidate aria-busy={pending !== null}>
            <div className={styles.field}>
              <label htmlFor="login-email">Email</label>
              <input
                ref={emailRef}
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Enter your email address"
                required
                value={email}
                disabled={pending !== null}
                aria-invalid={!!errors.email}
                aria-describedby={
                  errors.email ? "login-email-error" : undefined
                }
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrors((current) => ({ ...current, email: undefined }));
                  setMessage("");
                }}
              />
              {errors.email && (
                <p
                  id="login-email-error"
                  className={styles.fieldError}
                  role="alert"
                >
                  {errors.email}
                </p>
              )}
            </div>
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label htmlFor="login-password">Password</label>
                <Link href="/forgot-password" className={styles.textButton}>
                  Forgot password?
                </Link>
              </div>
              <div className={styles.passwordField}>
                <input
                  ref={passwordRef}
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  value={password}
                  disabled={pending !== null}
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? "login-password-error" : undefined
                  }
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors((current) => ({
                      ...current,
                      password: undefined,
                    }));
                    setMessage("");
                  }}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  disabled={pending !== null}
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p
                  id="login-password-error"
                  className={styles.fieldError}
                  role="alert"
                >
                  {errors.password}
                </p>
              )}
            </div>
            <button
              type="submit"
              className={`button button-primary ${styles.submit}`}
              disabled={pending !== null}
            >
              {pending === "email" && (
                <LoaderCircle
                  size={17}
                  className={styles.spinner}
                  aria-hidden="true"
                />
              )}
              {pending === "email" ? "Checking…" : "Sign in"}
            </button>
          </form>
          <div className={styles.divider}>
            <span>or continue with</span>
          </div>
          <button
            type="button"
            className={`button ${styles.googleButton}`}
            disabled={pending !== null}
            onClick={() => previewSignIn("google")}
          >
            {pending === "google" ? (
              <LoaderCircle
                size={17}
                className={styles.spinner}
                aria-hidden="true"
              />
            ) : (
              <span className={styles.googleLetter} aria-hidden="true">
                G
              </span>
            )}
            {pending === "google" ? "Checking…" : "Continue with Google"}
          </button>
          <div
            className={styles.feedback}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {message && <p>{message}</p>}
          </div>
          <p className={styles.signup}>
            Don’t have an account?{" "}
            <Link href="/sign-up" className={styles.textButton}>
              Sign up
            </Link>
          </p>
        </section>
        {process.env.NODE_ENV === "development" && (
          <aside className={styles.devTools} aria-label="Development tools">
            <span>Development only</span>
            <Link href="/projects" className={`button ${styles.devWorkspace}`}>
              Open development workspace
            </Link>
            <Link href="/auth-preview" className={styles.textButton}>
              Preview sign-up steps
            </Link>
          </aside>
        )}
      </div>
    </main>
  );
}
