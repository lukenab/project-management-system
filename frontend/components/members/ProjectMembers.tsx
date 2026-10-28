"use client";

import type { FormEvent } from "react";

import { MoreHorizontal, Search, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { PreviewProject } from "@/lib/preview-data";
import type {
  ProjectMember,
  ScrumAccountability,
} from "@/lib/preview-project-members";

import { DropdownMenu } from "@/components/shared/DropdownMenu";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Toast } from "@/components/shared/Toast";
import { isProjectOwner, previewUser } from "@/lib/preview-data";
import {
  changePreviewAccountability,
  invitePreviewProjectMember,
  listPreviewProjectMembers,
  removePreviewProjectMember,
  scrumRoles,
} from "@/lib/preview-project-members";

import { MemberDialog } from "./MemberDialog";
import { MemberRoleDropdown } from "./MemberRoleDropdown";
import styles from "./members.module.css";

type MembersState =
  | { status: "loading" }
  | { status: "ready"; members: ProjectMember[] }
  | { status: "error"; message: string };
type Dialog =
  | { type: "invite" }
  | { type: "role" | "remove"; member: ProjectMember };
const dateFormat = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function ProjectMembers({ project }: { project: PreviewProject }) {
  const [state, setState] = useState<MembersState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ScrumAccountability>("DEVELOPER");
  const [previousRole, setPreviousRole] = useState<
    "DEVELOPER" | "SCRUM_MASTER"
  >("DEVELOPER");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [roleError, setRoleError] = useState<{
    memberId: string;
    message: string;
  } | null>(null);
  const lock = useRef(false);
  const inviteRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [notice, setNotice] = useState<{
    message: string;
    sequence: number;
  } | null>(null);
  const sequence = useRef(0);
  const canManage = isProjectOwner(project) && project.status === "ACTIVE";
  const members = state.status === "ready" ? state.members : [];
  const normalizedQuery = query.trim().toLowerCase();
  const visible = members.filter((member) =>
    `${member.fullName} ${member.email}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const currentPO =
    dialog?.type === "role" && role === "PRODUCT_OWNER"
      ? members.find(
          (member) =>
            member.scrumAccountability === "PRODUCT_OWNER" &&
            member.id !== dialog.member.id,
        )
      : undefined;

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      try {
        const result = listPreviewProjectMembers(project.id);
        if (active) setState({ status: "ready", members: result });
      } catch (cause) {
        if (active)
          setState({
            status: "error",
            message:
              cause instanceof Error
                ? cause.message
                : "Couldn't load project members.",
          });
      }
    });
    return () => {
      active = false;
    };
  }, [project.id, attempt]);

  function openDialog(next: Dialog) {
    setError("");
    setEmail("");
    setRole(
      next.type === "role"
        ? (next.member.scrumAccountability ?? "DEVELOPER")
        : "DEVELOPER",
    );
    setPreviousRole("DEVELOPER");
    setDialog(next);
  }

  async function selectRole(
    member: ProjectMember,
    nextRole: ScrumAccountability,
  ) {
    if (!canManage || lock.current || member.scrumAccountability === nextRole)
      return;
    setRoleError(null);
    const previousPO = members.find(
      (candidate) =>
        candidate.scrumAccountability === "PRODUCT_OWNER" &&
        candidate.id !== member.id,
    );
    if (nextRole === "PRODUCT_OWNER" && previousPO) {
      openDialog({ type: "role", member });
      setRole("PRODUCT_OWNER");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await Promise.resolve();
      const updated = changePreviewAccountability(project.id, member.id, {
        scrumAccountability: nextRole,
      });
      setState({ status: "ready", members: updated });
      setNotice({
        message: "Scrum role updated.",
        sequence: ++sequence.current,
      });
    } catch (cause) {
      setRoleError({
        memberId: member.id,
        message:
          cause instanceof Error
            ? cause.message
            : "Couldn't update the Scrum role. Please try again.",
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !dialog || !canManage) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await Promise.resolve();
      let updated: ProjectMember[];
      let message: string;
      if (dialog.type === "invite") {
        updated = invitePreviewProjectMember(project.id, {
          email,
          scrumAccountability: role,
        });
        message = "Member added.";
        setQuery("");
      } else if (dialog.type === "role") {
        updated = changePreviewAccountability(project.id, dialog.member.id, {
          scrumAccountability: role,
          ...(currentPO
            ? {
                replaceCurrentProductOwner: true,
                previousProductOwnerId: currentPO.id,
                previousProductOwnerNewAccountability: previousRole,
              }
            : {}),
        });
        message = "Scrum role updated.";
      } else {
        updated = removePreviewProjectMember(project.id, dialog.member.id);
        message = "Member removed.";
      }
      setState({ status: "ready", members: updated });
      setDialog(null);
      setNotice({ message, sequence: ++sequence.current });
      if (dialog.type === "remove")
        requestAnimationFrame(() => inviteRef.current?.focus());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't save changes. Please try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow={project.name}
        title="Members"
        description="Manage your project team."
        action={
          canManage ? (
            <button
              ref={inviteRef}
              type="button"
              className="button button-primary"
              disabled={state.status !== "ready"}
              onClick={() => openDialog({ type: "invite" })}
            >
              <UserPlus size={16} aria-hidden="true" />
              Invite members
            </button>
          ) : undefined
        }
      />
      {project.status === "ARCHIVED" && (
        <p className={styles.notice}>
          This project is archived. Members are read-only.
        </p>
      )}
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            aria-label="Search members"
            placeholder="Search by name or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={state.status !== "ready"}
          />
        </div>
        {state.status === "ready" && (
          <span className={styles.count} role="status">
            {normalizedQuery
              ? `${visible.length} of ${members.length}`
              : members.length}{" "}
            {members.length === 1 ? "member" : "members"}
          </span>
        )}
      </div>
      {state.status === "loading" && (
        <div className={styles.loading} role="status">
          Loading members…
        </div>
      )}
      {state.status === "error" && (
        <div className={styles.failure}>
          <EmptyState
            icon={Users}
            title="Couldn't load members"
            description={state.message}
          />
          <button
            className={`button ${styles.secondary}`}
            onClick={() => {
              setState({ status: "loading" });
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {state.status === "ready" &&
        (visible.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>
                Members of {project.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Scrum role</th>
                  <th scope="col" className={styles.dateColumn}>
                    Joined
                  </th>
                  {canManage && (
                    <th scope="col">
                      <span className={styles.srOnly}>Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className={styles.person}>
                        <span className={styles.avatar} aria-hidden="true">
                          {member.initials}
                        </span>
                        <div className={styles.identity}>
                          <div className={styles.name}>
                            {member.fullName}
                            {member.email === previewUser.email && (
                              <span className={styles.you}>You</span>
                            )}
                          </div>
                          <div className={styles.email}>{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className={styles.role}>
                      {canManage ? (
                        <MemberRoleDropdown
                          name={member.fullName}
                          value={member.scrumAccountability}
                          disabled={busy}
                          onSelect={(nextRole) =>
                            void selectRole(member, nextRole)
                          }
                        />
                      ) : member.scrumAccountability ? (
                        scrumRoles[member.scrumAccountability]
                      ) : (
                        "None"
                      )}
                      {roleError?.memberId === member.id && (
                        <p role="alert" className={styles.rowError}>
                          {roleError.message}
                        </p>
                      )}
                    </td>
                    <td className={styles.dateColumn}>
                      <time dateTime={member.joinedAt}>
                        {dateFormat.format(new Date(member.joinedAt))}
                      </time>
                    </td>
                    {canManage && (
                      <td className={styles.actions}>
                        {member.accessRole !== "OWNER" && (
                          <DropdownMenu
                            label={`Member actions for ${member.fullName}`}
                            triggerLabel={`Actions for ${member.fullName}`}
                            triggerClassName={`icon-button ${styles.menuTrigger}`}
                            trigger={
                              <MoreHorizontal size={18} aria-hidden="true" />
                            }
                            groups={[
                              [
                                {
                                  label: "Remove member",
                                  icon: Trash2,
                                  tone: "danger" as const,
                                  onSelect: () =>
                                    openDialog({ type: "remove", member }),
                                },
                              ],
                            ]}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            <EmptyState
              icon={Users}
              title={normalizedQuery ? "No members found" : "No members yet"}
              description={
                normalizedQuery
                  ? "Try another name or email."
                  : "Invite someone to join your project."
              }
            />
            {normalizedQuery && (
              <button
                type="button"
                className={`button ${styles.secondary}`}
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                Clear search
              </button>
            )}
          </div>
        ))}
      {dialog && (
        <MemberDialog
          title={
            dialog.type === "invite"
              ? "Invite members"
              : dialog.type === "role"
                ? "Replace Product Owner"
                : "Remove member"
          }
          description={
            dialog.type === "invite" ? (
              <>
                You&apos;re inviting members to the{" "}
                <strong>{project.name}</strong> project.
              </>
            ) : dialog.type === "role" ? (
              <>
                Set <strong>{dialog.member.fullName}</strong> as the Product
                Owner for <strong>{project.name}</strong>.
              </>
            ) : (
              <>
                Remove <strong>{dialog.member.fullName}</strong> (
                {dialog.member.email}) from <strong>{project.name}</strong>?
              </>
            )
          }
          busy={busy}
          error={error}
          confirmLabel={
            dialog.type === "invite"
              ? "Invite"
              : dialog.type === "role"
                ? "Confirm change"
                : "Remove member"
          }
          destructive={dialog.type === "remove"}
          onSubmit={submit}
          onClose={() => {
            if (!lock.current) setDialog(null);
          }}
        >
          {dialog.type === "invite" && (
            <div className={styles.field}>
              <label htmlFor={`${id}-email`}>
                Email{" "}
                <span aria-hidden="true" className={styles.required}>
                  *
                </span>
              </label>
              <input
                id={`${id}-email`}
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                required
                autoFocus
                data-initial-focus
                disabled={busy}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          )}
          {dialog.type === "invite" && (
            <div className={styles.field}>
              <label htmlFor={`${id}-role`}>
                Scrum role{" "}
                <span aria-hidden="true" className={styles.required}>
                  *
                </span>
              </label>
              <select
                id={`${id}-role`}
                required
                disabled={busy}
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as ScrumAccountability)
                }
              >
                {Object.entries(scrumRoles).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {currentPO && (
            <>
              <p className={styles.notice}>
                <strong>{currentPO.fullName}</strong> is the current Product
                Owner. Saving will replace them.
              </p>
              <div className={styles.field}>
                <label htmlFor={`${id}-previous-role`}>
                  New Scrum role for {currentPO.fullName}
                </label>
                <select
                  id={`${id}-previous-role`}
                  data-initial-focus
                  disabled={busy}
                  value={previousRole}
                  onChange={(event) =>
                    setPreviousRole(
                      event.target.value as "DEVELOPER" | "SCRUM_MASTER",
                    )
                  }
                >
                  <option value="DEVELOPER">Developer</option>
                  <option value="SCRUM_MASTER">Scrum Master</option>
                </select>
              </div>
            </>
          )}
          {dialog.type === "remove" && (
            <p className={styles.notice}>
              They will lose access to this project. Their past contributions
              will remain.
            </p>
          )}
        </MemberDialog>
      )}
      {notice && (
        <Toast
          key={notice.sequence}
          message={notice.message}
          onDismiss={() => setNotice(null)}
          onRestoreFocus={() =>
            (canManage ? inviteRef.current : searchRef.current)?.focus()
          }
        />
      )}
    </section>
  );
}
