"use client";

import { useState } from "react";

import styles from "./auth-flow.module.css";
import { ForgotPasswordPage } from "./ForgotPasswordPage";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { SignUpPage } from "./SignUpPage";

export function AuthPreview() {
  const [screen, setScreen] = useState("email");
  return (
    <>
      <div className={styles.previewBar}>
        <span>
          Development only · Static UI states · No accounts, emails or sessions
        </span>
        <label htmlFor="auth-preview-screen">State</label>
        <select
          id="auth-preview-screen"
          value={screen}
          onChange={(e) => setScreen(e.target.value)}
        >
          <option value="email">Sign up · Email</option>
          <option value="verify">Sign up · Verification code</option>
          <option value="profile">Sign up · Profile</option>
          <option value="google">Google · Confirmation</option>
          <option value="sent">Recovery · Generic response</option>
          <option value="reset">Reset · Password form</option>
          <option value="invalid">Reset · Invalid link</option>
        </select>
      </div>
      <div key={screen}>
        {screen === "sent" ? (
          <ForgotPasswordPage previewSent />
        ) : screen === "reset" || screen === "invalid" ? (
          <ResetPasswordPage hasToken={screen === "reset"} />
        ) : (
          <SignUpPage
            initialStep={screen as "email" | "verify" | "profile" | "google"}
            previewEmail={screen === "email" ? "" : "alex@example.com"}
            googleProfile={
              screen === "google"
                ? { fullName: "Alex Morgan", email: "alex@example.com" }
                : undefined
            }
          />
        )}
      </div>
    </>
  );
}
