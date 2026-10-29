"use client";

import { Info, LockKeyhole, Search, UserRound, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { MemberDialog } from "@/components/members/MemberDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { Toast } from "@/components/shared/Toast";
import { isProjectOwner, type PreviewProject } from "@/lib/preview-data";
import {
  listPreviewProjectMembers,
  type ProjectMember,
} from "@/lib/preview-project-members";
import {
  transferPreviewOwnership,
  updatePreviewProject,
} from "@/lib/preview-projects";

import styles from "./project-settings.module.css";

export function ProjectSettings({ project }: { project: PreviewProject }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [notice, setNotice] = useState("");
  const [candidates, setCandidates] = useState<ProjectMember[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [transferError, setTransferError] = useState("");
  const [transferring, setTransferring] = useState(false);
  const saving = useRef(false);
  const transferLock = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const canManage = isProjectOwner(project) && project.status === "ACTIVE";
  const dirty = name !== project.name || description !== project.description;
  function reset() {
    setName(project.name);
    setDescription(project.description);
    setError("");
    setAttempted(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current || !dirty) return;
    setAttempted(true);
    setError("");
    setNotice("");
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const updated = await updatePreviewProject(project.id, {
        name,
        description,
      });
      setName(updated.name);
      setDescription(updated.description);
      setNotice("Project updated.");
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
  function openTransfer() {
    if (busy) return;
    try {
      const eligible = listPreviewProjectMembers(project.id).filter(
        (member) =>
          member.status === "ACTIVE" && member.email !== project.owner.email,
      );
      setQuery("");
      setSelected("");
      setTransferError("");
      setCandidates(eligible);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't load project members.",
      );
    }
  }
  async function transfer(event: FormEvent) {
    event.preventDefault();
    if (transferLock.current) return;
    if (!candidates?.length) {
      router.push(`/projects/${project.id}/members`);
      return;
    }
    if (!selected) {
      setTransferError("Choose a new owner.");
      return;
    }
    transferLock.current = true;
    setTransferring(true);
    setTransferError("");
    try {
      await transferPreviewOwnership(project.id, selected);
      try {
        sessionStorage.setItem("pms-project-transferred", project.id);
      } catch {
        /* The transfer is already saved; the toast is optional. */
      }
      setCandidates(null);
      router.replace(`/projects/${project.id}`);
    } catch (reason) {
      setTransferError(
        reason instanceof Error
          ? reason.message
          : "Couldn't transfer ownership. Please try again.",
      );
    } finally {
      transferLock.current = false;
      setTransferring(false);
    }
  }
  const matches =
    candidates?.filter((member) =>
      `${member.fullName} ${member.email}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    ) ?? [];
  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Project settings"
        description="Manage your project details and ownership."
      />
      {!canManage ? (
        <div className={styles.readOnly}>
          <LockKeyhole size={20} />
          <p>
            {project.status === "ARCHIVED"
              ? "This project is archived. Settings are read-only."
              : "You don't have permission to manage this project's settings."}
          </p>
        </div>
      ) : (
        <div className={styles.layout}>
          <section
            className={styles.card}
            aria-labelledby="project-details-heading"
          >
            <div className={styles.heading}>
              <h2 id="project-details-heading">Project details</h2>
              <p>Keep your project information up to date.</p>
            </div>
            <form onSubmit={save} noValidate aria-busy={busy}>
              <fieldset
                className={styles.fields}
                disabled={busy || transferring}
              >
                <div className={styles.field}>
                  <label htmlFor="settings-name">
                    Project name <span aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={nameRef}
                    id="settings-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={attempted && !name.trim()}
                    aria-describedby={
                      attempted && !name.trim()
                        ? "settings-name-error"
                        : undefined
                    }
                  />
                  {attempted && !name.trim() && (
                    <p id="settings-name-error" className={styles.error}>
                      Enter a project name.
                    </p>
                  )}
                </div>
                <div className={styles.field}>
                  <label htmlFor="settings-key">Project key</label>
                  <input
                    id="settings-key"
                    value={project.key}
                    readOnly
                    aria-describedby="settings-key-help"
                  />
                  <p id="settings-key-help" className={styles.help}>
                    Used in work item keys, such as {project.key}-1. The project
                    key cannot be changed.
                  </p>
                </div>
                <div className={styles.field}>
                  <label htmlFor="settings-description">Description</label>
                  <textarea
                    id="settings-description"
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this project about?"
                  />
                </div>
              </fieldset>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className="button"
                  onClick={reset}
                  disabled={!dirty || busy || transferring}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={!dirty || busy || transferring}
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>
          <section className={styles.card} aria-labelledby="ownership-heading">
            <div className={styles.heading}>
              <h2 id="ownership-heading">Ownership</h2>
              <p>Manage who owns this project.</p>
            </div>
            <div className={styles.owner}>
              <span className="owner-avatar" aria-hidden="true">
                {project.owner.initials}
              </span>
              <div>
                <strong>{project.owner.fullName}</strong>
                <span>{project.owner.email}</span>
              </div>
              <span className={styles.badge}>Project Owner</span>
            </div>
            <div className={styles.transfer}>
              <p>
                Transfer ownership to another member. You&apos;ll remain in the
                project as a member.
              </p>
              <button
                className="button"
                type="button"
                disabled={busy || dirty || transferring}
                onClick={openTransfer}
              >
                Transfer ownership
              </button>
              {dirty && (
                <p className={styles.help}>
                  Save or cancel your changes before transferring ownership.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
      {candidates && (
        <MemberDialog
          title="Transfer project ownership"
          description={
            candidates.length
              ? `Choose a member to become the owner of ${project.name}.`
              : "Ownership can only be transferred to a member of this project."
          }
          busy={transferring}
          error={transferError}
          confirmLabel={
            candidates.length ? "Transfer ownership" : "Go to Members"
          }
          confirmDisabled={candidates.length > 0 && !selected}
          destructive={candidates.length > 0}
          confirmClassName={
            candidates.length ? styles.transferConfirm : undefined
          }
          onSubmit={transfer}
          onClose={() => {
            if (!transferring) setCandidates(null);
          }}
        >
          {candidates.length ? (
            <>
              <label className={styles.pickerLabel} htmlFor="owner-search">
                New owner
              </label>
              <div className={styles.search}>
                <Search size={16} aria-hidden="true" />
                <input
                  id="owner-search"
                  type="search"
                  placeholder="Search by name or email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={transferring}
                  data-initial-focus
                />
              </div>
              <fieldset className={styles.candidates} disabled={transferring}>
                <legend className="sr-only">Select new owner</legend>
                {matches.map((member) => (
                  <label key={member.id} className={styles.candidate}>
                    <input
                      type="radio"
                      name="new-owner"
                      value={member.id}
                      checked={selected === member.id}
                      onChange={() => {
                        setSelected(member.id);
                        setTransferError("");
                      }}
                    />
                    <span className="owner-avatar" aria-hidden="true">
                      {member.initials || <UserRound size={16} />}
                    </span>
                    <span>
                      <strong>{member.fullName}</strong>
                      <small>{member.email}</small>
                    </span>
                  </label>
                ))}
                {!matches.length && (
                  <p className={styles.empty}>No matching members.</p>
                )}
              </fieldset>
              <div className={styles.consequences}>
                <Info size={16} aria-hidden="true" />
                <div>
                  <strong>After the transfer</strong>
                  <ul>
                    <li>The new owner manages project settings and members.</li>
                    <li>You stay in the project as a member.</li>
                    <li>Scrum accountabilities don&apos;t change.</li>
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <UsersRound size={20} aria-hidden="true" />
              <strong>No other members yet</strong>
              <p>
                Add a member to {project.name} first, then transfer ownership.
              </p>
            </div>
          )}
        </MemberDialog>
      )}
      {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
    </>
  );
}
