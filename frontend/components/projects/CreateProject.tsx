"use client";

import { ArrowLeft, Info, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { WorkTypeIcon } from "@/components/backlog/WorkTypeIcon";
import { projectNavigation } from "@/config/navigation";
import {
  createPreviewProject,
  suggestProjectKey,
} from "@/lib/preview-projects";

import styles from "./create-project.module.css";

const descriptionLimit = 500;

// Sample cards for the preview board; titles are drawn as sketch lines.
const previewColumns = [
  {
    label: "To do",
    workType: "Story",
    sketch: "M2 8C14 2 22 12 34 7S58 4 70 8 96 9 108 7",
  },
  {
    label: "In progress",
    workType: "Bug",
    sketch: "M2 9C10 4 18 4 26 9S40 4 50 8 80 6 112 7",
  },
  {
    label: "Done",
    workType: "Task",
    sketch: "M2 6C16 12 26 2 40 8S60 12 74 5 92 6 100 9",
  },
];

function projectInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

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
  const tipId = useId();
  const dirty = !!(name || key || description);
  const keyInvalid = !/^[A-Z][A-Z0-9]{1,9}$/.test(key);
  const previewKey = key || "CP";
  const previewName = name.trim();
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
      <div className={styles.page}>
        <section className={styles.formColumn}>
          <Link className={styles.back} href="/projects">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to projects
          </Link>
          <form
            ref={form}
            id="create-project-form"
            className={styles.formBody}
            onSubmit={submit}
            noValidate
            aria-busy={busy}
          >
            <h1>Create project</h1>
            <p className={styles.requiredNote}>
              Required fields are marked with an asterisk{" "}
              <span className={styles.required}>*</span>
            </p>
            <fieldset disabled={busy} className={styles.fields}>
              <div className={styles.field}>
                <label htmlFor="project-name">
                  Name{" "}
                  <span className={styles.required} aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="project-name"
                  required
                  autoComplete="off"
                  placeholder="e.g. Customer Portal"
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
                  Key{" "}
                  <span className={styles.required} aria-hidden="true">
                    *
                  </span>
                  <span
                    className={styles.info}
                    tabIndex={0}
                    aria-label="Key format"
                    aria-describedby={tipId}
                  >
                    <Info size={14} aria-hidden="true" />
                    <span id={tipId} role="tooltip" className={styles.tip}>
                      Use 2–10 uppercase letters or numbers, starting with a
                      letter.
                    </span>
                  </span>
                </label>
                <input
                  id="project-key"
                  className={styles.keyInput}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={10}
                  placeholder="e.g. CP"
                  value={key}
                  aria-invalid={attempted && keyInvalid}
                  aria-describedby="key-help"
                  onChange={(e) => {
                    setCustomKey(true);
                    setKey(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                    );
                  }}
                />
                <p
                  id="key-help"
                  className={
                    attempted && keyInvalid ? styles.error : styles.help
                  }
                >
                  {attempted && keyInvalid
                    ? "Enter 2–10 uppercase letters or numbers, starting with a letter."
                    : `Prefix for work item keys, for example ${previewKey}-1. It cannot be changed after the project is created.`}
                </p>
              </div>
              <div className={styles.field}>
                <label htmlFor="project-description">Description</label>
                <textarea
                  id="project-description"
                  rows={3}
                  maxLength={descriptionLimit}
                  placeholder="What is this project about?"
                  value={description}
                  aria-describedby="description-help"
                  onChange={(e) => setDescription(e.target.value)}
                />
                <p
                  id="description-help"
                  className={`${styles.help} ${styles.split}`}
                >
                  <span>Briefly describe the project&apos;s purpose.</span>
                  <span aria-live="polite">
                    {description.length}/{descriptionLimit}
                  </span>
                </p>
              </div>
            </fieldset>
            {error && (
              <p role="alert" className={styles.errorBanner}>
                {error}
              </p>
            )}
          </form>
          <div className={styles.footer}>
            <div className={styles.footerInner}>
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
                form="create-project-form"
                className="button button-primary"
                disabled={busy}
              >
                {busy ? "Creating…" : "Create project"}
              </button>
            </div>
          </div>
        </section>
        <aside className={styles.preview} aria-label="Project preview">
          <svg
            className={styles.arcs}
            viewBox="0 0 600 800"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M-20 170C160 150 330 60 420-20" data-tone="accent" />
            <path d="M440-20C520 40 600 80 640 90" />
            <path d="M-20 700C80 760 150 790 200 820" data-tone="accent" />
            <path d="M420 820C440 760 450 740 470 700" />
          </svg>
          <div className={styles.frame} aria-hidden="true">
            <div className={styles.frameHead}>
              <div className={styles.frameProject}>
                <span className={styles.chip}>
                  {projectInitials(previewName) || "CP"}
                </span>
                <div>
                  <span className={styles.frameType}>Scrum project</span>
                  <strong
                    className={styles.frameName}
                    data-placeholder={!previewName || undefined}
                  >
                    {previewName || "Your project name"}
                  </strong>
                </div>
              </div>
              <div className={styles.frameTabs}>
                {projectNavigation.map(({ label, segment, icon: Icon }) => (
                  <span
                    key={segment}
                    className={styles.frameTab}
                    data-active={segment === "board" || undefined}
                  >
                    <Icon size={15} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className={styles.board}>
              {previewColumns.map((column, index) => (
                <div key={column.label} className={styles.column}>
                  <span className={styles.columnTitle}>{column.label}</span>
                  <div className={styles.card}>
                    <svg
                      className={styles.sketch}
                      viewBox="0 0 120 14"
                      preserveAspectRatio="none"
                    >
                      <path d={column.sketch} />
                    </svg>
                    <div className={styles.cardFoot}>
                      <span className={styles.cardKey}>
                        <WorkTypeIcon workType={column.workType} />
                        {previewKey}-{index + 1}
                      </span>
                      <span className={styles.cardAvatar}>
                        <UserRound size={11} />
                      </span>
                    </div>
                  </div>
                  {index === 0 && <div className={styles.ghostCard} />}
                </div>
              ))}
            </div>
          </div>
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
