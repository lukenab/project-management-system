"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { passwordLengthError } from "@/components/auth/PasswordFields";
import { Toast } from "@/components/shared/Toast";
import {
  changePreviewPassword,
  IncorrectPasswordError,
  systemRoleLabels,
  updatePreviewProfile,
  usePreviewProfile,
  type PreviewProfile,
} from "@/lib/preview-profile";

import styles from "./profile.module.css";

const memberSince = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function PersonalInformation({
  profile,
  onNotice,
}: {
  profile: PreviewProfile;
  onNotice: (message: string) => void;
}) {
  // Null follows the saved name, which is only known after hydration.
  const [draft, setDraft] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const fullName = draft ?? profile.fullName;
  const dirty = fullName !== profile.fullName;
  const nameMissing = attempted && !fullName.trim();

  function reset() {
    setDraft(null);
    setAttempted(false);
    setError("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current || !dirty) return;
    setAttempted(true);
    setError("");
    if (!fullName.trim()) {
      nameRef.current?.focus();
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      await updatePreviewProfile({ fullName });
      reset();
      onNotice("Profile updated.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't save your changes. Please try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="profile-heading">
      <div className={styles.sectionHead}>
        <h2 id="profile-heading">Personal information</h2>
        <p>Your name is shown to members of your projects.</p>
      </div>
      <form onSubmit={save} noValidate aria-busy={busy}>
        <fieldset className={styles.fields} disabled={busy}>
          <div className={styles.identity}>
            <span className="user-avatar large" aria-hidden="true">
              {profile.initials}
            </span>
            <div>
              <strong>{profile.fullName}</strong>
              <span>{profile.email}</span>
            </div>
          </div>
          <div className={styles.row}>
            <label htmlFor="profile-name">
              Full name
              <span className={styles.required} aria-hidden="true">
                *
              </span>
            </label>
            <div className={styles.control}>
              <input
                ref={nameRef}
                id="profile-name"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setDraft(e.target.value)}
                aria-invalid={nameMissing}
                aria-describedby={
                  nameMissing ? "profile-name-error" : undefined
                }
              />
              {nameMissing && (
                <p id="profile-name-error" className={styles.error}>
                  Enter your full name.
                </p>
              )}
            </div>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Email</span>
            <div className={styles.control}>
              <span className={styles.value}>{profile.email}</span>
              <p className={styles.help}>
                Used to sign in. It cannot be changed here.
              </p>
            </div>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>System role</span>
            <div className={styles.control}>
              <span className={styles.value}>
                {systemRoleLabels[profile.systemRole]}
              </span>
            </div>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Account created</span>
            <div className={styles.control}>
              <span className={styles.value}>
                {memberSince.format(new Date(profile.createdAt))}
              </span>
            </div>
          </div>
        </fieldset>
        {error && (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className="button"
            onClick={reset}
            disabled={!dirty || busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={!dirty || busy}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}

type PasswordErrors = {
  current?: string;
  next?: string;
  confirmation?: string;
};

function PasswordInput({
  id,
  label,
  value,
  autoComplete,
  error,
  help,
  inputRef,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  autoComplete: "current-password" | "new-password";
  error?: string;
  help?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;
  return (
    <div className={styles.row}>
      <label htmlFor={id}>
        {label}
        <span className={styles.required} aria-hidden="true">
          *
        </span>
      </label>
      <div className={styles.control}>
        <div className={styles.passwordField}>
          <input
            ref={inputRef}
            id={id}
            type={visible ? "text" : "password"}
            required
            spellCheck={false}
            autoComplete={autoComplete}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={describedBy}
          />
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setVisible((current) => !current)}
            aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-pressed={visible}
          >
            {visible ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
          </button>
        </div>
        {help && !error && (
          <p id={`${id}-help`} className={styles.help}>
            {help}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ChangePassword({
  hasPassword,
  onNotice,
}: {
  hasPassword: boolean;
  onNotice: (message: string) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const dirty = !!(current || next || confirmation);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirmation("");
    setErrors({});
    setFormError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const found: PasswordErrors = {
      current: current ? undefined : "Enter your current password.",
      next: passwordLengthError(next),
      confirmation:
        next === confirmation ? undefined : "The passwords don't match.",
    };
    setErrors(found);
    setFormError("");
    if (found.current) return currentRef.current?.focus();
    if (found.next) return nextRef.current?.focus();
    if (found.confirmation) return confirmationRef.current?.focus();
    saving.current = true;
    setBusy(true);
    try {
      await changePreviewPassword({
        currentPassword: current,
        newPassword: next,
      });
      reset();
      onNotice("Password updated. Your other devices have been signed out.");
    } catch (reason) {
      if (reason instanceof IncorrectPasswordError) {
        setErrors({ current: reason.message });
        requestAnimationFrame(() => currentRef.current?.focus());
      } else {
        setFormError("Couldn't update your password. Please try again.");
      }
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="password-heading">
      <div className={styles.sectionHead}>
        <h2 id="password-heading">Password</h2>
        <p>Changing it signs you out on your other devices.</p>
      </div>
      {hasPassword ? (
        <form onSubmit={submit} noValidate aria-busy={busy}>
          <fieldset className={styles.fields} disabled={busy}>
            <PasswordInput
              id="current-password"
              label="Current password"
              value={current}
              autoComplete="current-password"
              error={errors.current}
              inputRef={currentRef}
              onChange={setCurrent}
            />
            <PasswordInput
              id="new-password"
              label="New password"
              value={next}
              autoComplete="new-password"
              error={errors.next}
              help="Use 8–128 characters."
              inputRef={nextRef}
              onChange={setNext}
            />
            <PasswordInput
              id="confirm-password"
              label="Confirm new password"
              value={confirmation}
              autoComplete="new-password"
              error={errors.confirmation}
              inputRef={confirmationRef}
              onChange={setConfirmation}
            />
          </fieldset>
          {formError && (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className="button"
              onClick={reset}
              disabled={!dirty || busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={!dirty || busy}
            >
              {busy ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      ) : (
        <p className={styles.notice}>
          You sign in with Google, so this account has no password to change.
        </p>
      )}
    </section>
  );
}

export function ProfileSettings() {
  const profile = usePreviewProfile();
  const [notice, setNotice] = useState("");
  return (
    <>
      <div className={styles.page}>
        <PersonalInformation profile={profile} onNotice={setNotice} />
        <ChangePassword
          hasPassword={profile.hasPassword}
          onNotice={setNotice}
        />
      </div>
      {notice && (
        <Toast key={notice} message={notice} onDismiss={() => setNotice("")} />
      )}
    </>
  );
}
