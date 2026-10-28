"use client";

import { ArrowRight, Check, Rows3, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { PageHeader } from "@/components/shared/PageHeader";
import {
  createPreviewProject,
  suggestProjectKey,
} from "@/lib/preview-projects";

import styles from "./create-project.module.css";

export function CreateProject() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [customKey, setCustomKey] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const saving = useRef(false);
  const dirty = !!(name || key || description);
  const keyInvalid = !/^[A-Z][A-Z0-9]{1,9}$/.test(key);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function cancel() {
    if (busy) return;
    if (dirty) dialog.current?.showModal();
    else router.push("/projects");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    setAttempted(true);
    setError("");
    if (!name.trim() || keyInvalid) {
      form.current
        ?.querySelector<HTMLInputElement>(
          !name.trim() ? "#project-name" : "#project-key",
        )
        ?.focus();
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const project = await createPreviewProject({ name, key, description });
      try {
        sessionStorage.setItem("pms-project-created", project.id);
      } catch {
        /* Toast is optional if storage is restricted. */
      }
      router.push(`/projects/${project.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't create your project. Please try again.",
      );
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className={styles.layout}>
        <section className={styles.formPanel}>
          <PageHeader
            title="Create your project"
            description="Give your team a place to plan, collaborate, and deliver."
          />
          <form ref={form} onSubmit={submit} noValidate aria-busy={busy}>
            <fieldset disabled={busy} className={styles.fields}>
              <div className={styles.field}>
                <label htmlFor="project-name">
                  Project name <span aria-hidden="true">*</span>
                </label>
                <input
                  id="project-name"
                  required
                  autoComplete="off"
                  placeholder="e.g. Customer portal"
                  value={name}
                  aria-invalid={attempted && !name.trim()}
                  aria-describedby={
                    attempted && !name.trim() ? "name-error" : undefined
                  }
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!customKey) setKey(suggestProjectKey(e.target.value));
                  }}
                />
                {attempted && !name.trim() && (
                  <p id="name-error" className={styles.error}>
                    Enter a project name.
                  </p>
                )}
              </div>
              <div className={styles.field}>
                <label htmlFor="project-key">
                  Project key <span aria-hidden="true">*</span>
                </label>
                <input
                  id="project-key"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="e.g. CP"
                  value={key}
                  aria-invalid={attempted && keyInvalid}
                  aria-describedby="key-help"
                  onChange={(e) => {
                    setCustomKey(true);
                    setKey(e.target.value.toUpperCase());
                  }}
                />
                <p
                  id="key-help"
                  className={
                    attempted && keyInvalid ? styles.error : styles.help
                  }
                >
                  2–10 uppercase letters or numbers, starting with a letter.
                  Your key cannot be changed after creation.
                </p>
              </div>
              <div className={styles.field}>
                <label htmlFor="project-description">
                  Description <span className={styles.optional}>Optional</span>
                </label>
                <textarea
                  id="project-description"
                  rows={4}
                  placeholder="What is this project about?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </fieldset>
            {error && (
              <p role="alert" className={styles.errorBanner}>
                {error}
              </p>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={cancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={busy}
              >
                {busy ? "Creating…" : "Create project"}
                {!busy && <ArrowRight size={16} />}
              </button>
            </div>
          </form>
        </section>
        <aside className={styles.preview} aria-label="Project preview">
          <p className={styles.eyebrow}>Your workspace · Preview</p>
          <div className={styles.previewCard}>
            <span className={styles.help}>{key || "CP"}</span>
            <h2>{name.trim() || "Your project name"}</h2>
            <p className={styles.description}>
              {description.trim() || "A shared space for your team's work."}
            </p>
            <div className={styles.tabs}>
              <span>Overview</span>
              <span>Members</span>
              <span>Work Items</span>
              <span>Sprints</span>
            </div>
            <div className={styles.setup}>
              <UsersRound size={20} />
              <div>
                <strong>Build your team</strong>
                <p>Invite members and assign Scrum roles after creation.</p>
              </div>
            </div>
            <div className={styles.setup}>
              <Rows3 size={20} />
              <div>
                <strong>Make room for your next idea</strong>
                <p>Your work items will use keys like {key || "CP"}-1.</p>
              </div>
            </div>
          </div>
          <p className={styles.caption}>
            <Check size={16} />
            Story, Task and Bug · To do, In progress and Done
          </p>
        </aside>
      </div>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="discard-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const box = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < box.left ||
              event.clientX > box.right ||
              event.clientY < box.top ||
              event.clientY > box.bottom
            )
              dialog.current?.close();
          }
        }}
      >
        <h2 id="discard-title">Discard changes?</h2>
        <p>
          Your project has not been created. Your entered information will be
          discarded.
        </p>
        <div className={styles.actions}>
          <button
            className="button"
            onClick={() => dialog.current?.close()}
            autoFocus
          >
            Keep editing
          </button>
          <button
            className="button button-primary"
            onClick={() => {
              dialog.current?.close();
              router.push("/projects");
            }}
          >
            Discard changes
          </button>
        </div>
      </dialog>
    </>
  );
}
