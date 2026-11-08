"use client";

import { LoaderCircle } from "lucide-react";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import styles from "./login.module.css";

/** Google's own sign-in button; `NEXT_PUBLIC_GOOGLE_CLIENT_ID` turns it on. */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type GoogleId = {
  initialize(options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
  }): void;
  renderButton(
    element: HTMLElement,
    options: {
      type: "standard";
      theme: "outline";
      size: "large";
      width: number;
    },
  ): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

/**
 * The app's own "Continue with Google" button, with Google's real button laid over it
 * (invisible), because Google only accepts a click on its own button to hand out the token.
 */
export function GoogleButton({
  disabled = false,
  pending = false,
  onCredential,
}: {
  disabled?: boolean;
  pending?: boolean;
  onCredential: (credential: string) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [ready, setReady] = useState(
    typeof window !== "undefined" && !!window.google,
  );

  useEffect(() => {
    callback.current = onCredential;
  });

  useEffect(() => {
    const id = window.google?.accounts.id;
    if (!ready || !id || !slot.current) return;
    id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: ({ credential }) => {
        if (credential) callback.current(credential);
      },
    });
    id.renderButton(slot.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      // Google draws the button at a fixed width (200–400px).
      width: Math.min(400, Math.max(200, slot.current.clientWidth)),
    });
  }, [ready]);

  return (
    <div className={styles.googleWrap}>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <button
        type="button"
        className={`button ${styles.googleButton}`}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
      >
        {pending ? (
          <LoaderCircle size={17} className={styles.spinner} />
        ) : (
          <span className={styles.googleLetter}>G</span>
        )}
        {pending ? "Checking…" : "Continue with Google"}
      </button>
      <div ref={slot} className={styles.googleSlot} inert={disabled} />
    </div>
  );
}
