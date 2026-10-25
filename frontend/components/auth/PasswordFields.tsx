"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import flow from "./auth-flow.module.css";
import styles from "./login.module.css";

export function passwordLengthError(value: string) {
  const length = Array.from(value).length;
  if (!length) return "Enter a password.";
  if (length < 8 || length > 128)
    return "Use 8–128 characters for your password.";
  return undefined;
}

export function PasswordFields({
  password,
  confirmation,
  onPassword,
  onConfirmation,
  errors,
}: {
  password: string;
  confirmation: string;
  onPassword: (value: string) => void;
  onConfirmation: (value: string) => void;
  errors: { password?: string; confirmation?: string };
}) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <div className={styles.field}>
        <label htmlFor="auth-password">New password</label>
        <div className={styles.passwordField}>
          <input
            id="auth-password"
            name="newPassword"
            type={visible ? "text" : "password"}
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Create a password"
            required
            aria-invalid={!!errors.password}
            aria-describedby={
              errors.password
                ? "auth-password-help auth-password-error"
                : "auth-password-help"
            }
          />
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
          >
            {visible ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        </div>
        <p id="auth-password-help" className={flow.help}>
          Use 8–128 characters. Spaces and passphrases are welcome.
        </p>
        {errors.password && (
          <p
            id="auth-password-error"
            className={styles.fieldError}
            role="alert"
          >
            {errors.password}
          </p>
        )}
      </div>
      <div className={styles.field}>
        <label htmlFor="auth-confirmation">Confirm password</label>
        <input
          id="auth-confirmation"
          name="confirmPassword"
          type={visible ? "text" : "password"}
          value={confirmation}
          onChange={(e) => onConfirmation(e.target.value)}
          autoComplete="new-password"
          placeholder="Re-enter your password"
          required
          aria-invalid={!!errors.confirmation}
          aria-describedby={
            errors.confirmation ? "auth-confirmation-error" : undefined
          }
        />
        {errors.confirmation && (
          <p
            id="auth-confirmation-error"
            className={styles.fieldError}
            role="alert"
          >
            {errors.confirmation}
          </p>
        )}
      </div>
    </>
  );
}
