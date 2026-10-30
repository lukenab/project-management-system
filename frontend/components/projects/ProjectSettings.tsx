"use client";

import {
  Check,
  LockKeyhole,
  Search,
  TriangleAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { MemberDialog } from "@/components/members/MemberDialog";
import { Toast } from "@/components/shared/Toast";
import { isProjectOwner, type PreviewProject } from "@/lib/preview-data";
import {
  listPreviewProjectMembers,
  scrumRoles,
  type ProjectMember,
} from "@/lib/preview-project-members";
import {
  transferPreviewOwnership,
  updatePreviewProject,
} from "@/lib/preview-projects";

import { ArchiveProjectDialog } from "./ArchiveProjectDialog";
import styles from "./project-settings.module.css";

const descriptionLimit = 500;
// Small teams see every member at once; larger ones get a search field.
const searchThreshold = 6;

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
  const [archiving, setArchiving] = useState(false);
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
  const selectedMember = candidates?.find((member) => member.id === selected);
  const matches =
    candidates?.filter((member) =>
      `${member.fullName} ${member.email}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    ) ?? [];
  return (
    <>
      <h1 className="sr-only">Project settings</h1>
      {!isProjectOwner(project) ? (
        <div className={styles.readOnly}>
          <LockKeyhole size={20} />
          <p>
            You don&apos;t have permission to manage this project&apos;s
            settings.
          </p>
        </div>
      ) : (
        <div className={styles.page}>
          <section className={styles.section} aria-labelledby="details-heading">
            <div className={styles.sectionHead}>
              <h2 id="details-heading">General</h2>
              <p>
                {canManage
                  ? "Basic information visible to all project members."
                  : "This project is archived. Its information is read-only."}
              </p>
            </div>
            <form onSubmit={save} noValidate aria-busy={busy}>
              <fieldset
                className={styles.fields}
                disabled={!canManage || busy || transferring}
              >
                <div className={styles.row}>
                  <label htmlFor="settings-name">
                    Name
                    {canManage && (
                      <span className={styles.required} aria-hidden="true">
                        *
                      </span>
                    )}
                  </label>
                  <div className={styles.control}>
                    <input
                      ref={nameRef}
                      id="settings-name"
                      required
                      readOnly={!canManage}
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
                </div>
                <div className={styles.row}>
                  <span className={styles.label} id="settings-key-label">
                    Key
                  </span>
                  <div className={styles.control}>
                    <span
                      className={styles.keyBadge}
                      role="group"
                      aria-labelledby="settings-key-label"
                      aria-describedby="settings-key-help"
                    >
                      {project.key}
                    </span>
                    <p id="settings-key-help" className={styles.help}>
                      Prefix for work item keys, for example {project.key}-1. It
                      cannot be changed.
                    </p>
                  </div>
                </div>
                <div className={styles.row}>
                  <label htmlFor="settings-description">Description</label>
                  <div className={styles.control}>
                    <textarea
                      id="settings-description"
                      rows={3}
                      maxLength={descriptionLimit}
                      readOnly={!canManage}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What is this project about?"
                      aria-describedby="settings-description-help"
                    />
                    <p
                      id="settings-description-help"
                      className={`${styles.help} ${styles.split}`}
                    >
                      <span>Briefly describe the project&apos;s purpose.</span>
                      {canManage && (
                        <span>
                          {description.length}/{descriptionLimit}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </fieldset>
              {error && (
                <p className={styles.formError} role="alert">
                  {error}
                </p>
              )}
              {canManage && (
                <div className={styles.actions}>
                  {dirty && (
                    <p
                      id="settings-unsaved"
                      className={styles.unsaved}
                      role="status"
                    >
                      Unsaved changes. Save or cancel them to transfer or
                      archive the project.
                    </p>
                  )}
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
              )}
            </form>
          </section>
          <div className={styles.aside}>
            <section
              className={styles.section}
              aria-labelledby="ownership-heading"
            >
              <div className={styles.sectionHead}>
                <h2 id="ownership-heading">Ownership</h2>
              </div>
              <div className={styles.sectionBody}>
                <div className={styles.owner}>
                  <span className="owner-avatar" aria-hidden="true">
                    {project.owner.initials}
                  </span>
                  <div className={styles.ownerText}>
                    <strong>{project.owner.fullName}</strong>
                    <span>{project.owner.email}</span>
                  </div>
                </div>
                {canManage && (
                  <>
                    <p className={styles.help}>
                      Transfer this project to another member.
                    </p>
                    <button
                      className={`button ${styles.asideButton}`}
                      type="button"
                      disabled={busy || dirty || transferring}
                      aria-describedby={dirty ? "settings-unsaved" : undefined}
                      onClick={openTransfer}
                    >
                      Transfer ownership
                    </button>
                  </>
                )}
              </div>
            </section>
            {canManage && (
              <section
                className={`${styles.section} ${styles.danger}`}
                aria-labelledby="danger-heading"
              >
                <div className={styles.sectionHead}>
                  <h2 id="danger-heading">Danger zone</h2>
                </div>
                <div className={styles.sectionBody}>
                  <strong className={styles.dangerTitle}>
                    Archive project
                  </strong>
                  <p className={styles.help}>
                    Make the project read-only. Members can still view it.
                  </p>
                  <button
                    className={`button ${styles.asideButton} ${styles.dangerButton}`}
                    type="button"
                    disabled={busy || dirty || transferring}
                    aria-describedby={dirty ? "settings-unsaved" : undefined}
                    onClick={() => setArchiving(true)}
                  >
                    Archive project
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
      {archiving && (
        <ArchiveProjectDialog
          project={project}
          onClose={() => setArchiving(false)}
          onArchived={() => {
            setArchiving(false);
            setNotice("Project archived.");
          }}
        />
      )}
      {candidates && (
        <MemberDialog
          title="Transfer ownership"
          description={
            candidates.length
              ? `Choose who will own ${project.name}.`
              : "Ownership can only be transferred to a member of this project."
          }
          busy={transferring}
          error={transferError}
          confirmLabel={
            candidates.length ? "Transfer ownership" : "Go to Members"
          }
          confirmDisabled={candidates.length > 0 && !selectedMember}
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
              <span className={styles.pickerLabel} id="new-owner-label">
                New owner
                <span className={styles.required} aria-hidden="true">
                  *
                </span>
              </span>
              <div className={styles.picker}>
                {candidates.length >= searchThreshold && (
                  <div className={styles.search}>
                    <Search size={16} aria-hidden="true" />
                    <input
                      type="search"
                      aria-label="Search members"
                      placeholder="Search members"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      disabled={transferring}
                      data-initial-focus
                    />
                  </div>
                )}
                <fieldset
                  className={styles.candidates}
                  disabled={transferring}
                  aria-labelledby="new-owner-label"
                >
                  {matches.map((member) => (
                    <label key={member.id} className={styles.candidate}>
                      <input
                        type="radio"
                        className="sr-only"
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
                      <span className={styles.candidateText}>
                        <strong>{member.fullName}</strong>
                        <small>{member.email}</small>
                      </span>
                      {member.scrumAccountability && (
                        <span className={styles.candidateRole}>
                          {scrumRoles[member.scrumAccountability]}
                        </span>
                      )}
                      <Check
                        size={16}
                        className={styles.candidateCheck}
                        aria-hidden="true"
                      />
                    </label>
                  ))}
                  {!matches.length && (
                    <p className={styles.empty}>No matching members.</p>
                  )}
                </fieldset>
              </div>
              {selectedMember && (
                <div className={styles.consequences} role="status">
                  <TriangleAlert size={16} aria-hidden="true" />
                  <p>
                    <strong>{selectedMember.fullName}</strong> will become the
                    owner of {project.name}. You&apos;ll stay as a member and
                    lose access to project settings.
                    {selectedMember.scrumAccountability &&
                      ` Their Scrum role (${scrumRoles[selectedMember.scrumAccountability]}) stays the same.`}
                  </p>
                </div>
              )}
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
