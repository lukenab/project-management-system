"use client";

import type { FormEvent } from "react";

import { MoreHorizontal, Search, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type { PreviewProject } from "@/lib/preview-data";
import type {
  ProjectMember,
  ScrumAccountability,
} from "@/lib/preview-project-members";

import { LeaveProjectDialog } from "@/components/projects/LeaveProjectDialog";
import { DropdownMenu } from "@/components/shared/DropdownMenu";
import { EmptyState } from "@/components/shared/EmptyState";
import { Toast } from "@/components/shared/Toast";
import { useCurrentUser } from "@/lib/current-user";
import { isProjectOwner, previewUser } from "@/lib/preview-data";
import {
  addPreviewProjectMember,
  changePreviewAccountability,
  listPreviewProjectMembers,
  removePreviewProjectMember,
  scrumRoles,
  searchPreviewProjectCandidates,
} from "@/lib/preview-project-members";
import {
  addProjectMember,
  changeProjectMemberAccountability,
  isApiProjectId,
  listProjectCandidates,
  listProjectMembers,
  removeProjectMember,
} from "@/lib/projects";
import { refreshStoredProjects } from "@/lib/projects-store";

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
  const router = useRouter();
  const live = isApiProjectId(project.id);
  const { user } = useCurrentUser();
  const [leaving, setLeaving] = useState(false);
  const [state, setState] = useState<MembersState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [email, setEmail] = useState("");
  const [candidates, setCandidates] = useState<
    Array<{ id: string; fullName: string; email: string; initials: string }>
  >([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [role, setRole] = useState<ScrumAccountability>("DEVELOPER");
  const [previousRole, setPreviousRole] =
    useState<ScrumAccountability>("DEVELOPER");
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
  const currentRoleHolder =
    dialog?.type === "role"
      ? members.find(
          (member) =>
            member.scrumAccountability === role &&
            member.id !== dialog.member.id,
        )
      : undefined;
  const availableReplacementRoles = (
    Object.keys(scrumRoles) as ScrumAccountability[]
  ).filter(
    (candidate) =>
      candidate === "DEVELOPER" ||
      (live
        ? candidate !== role &&
          !members.some((member) => member.scrumAccountability === candidate)
        : candidate === "SCRUM_MASTER"),
  );

  useEffect(() => {
    let active = true;
    const load = () =>
      live
        ? listProjectMembers(project.id)
        : listPreviewProjectMembers(project.id);
    void Promise.resolve()
      .then(load)
      .then(
        (members) => {
          if (active) setState({ status: "ready", members });
        },
        (cause) => {
          if (active)
            setState({
              status: "error",
              message:
                cause instanceof Error
                  ? cause.message
                  : "Couldn’t load project members.",
            });
        },
      );
    return () => {
      active = false;
    };
  }, [project.id, live, attempt]);

  useEffect(() => {
    const keyword = email.trim();
    if (dialog?.type !== "invite" || !keyword) return;

    let active = true;
    const timer = setTimeout(() => {
      setCandidatesLoading(true);
      const searchFn = live
        ? listProjectCandidates(project.id, keyword)
        : Promise.resolve(searchPreviewProjectCandidates(project.id, keyword));
      searchFn
        .then((items) => {
          if (active) {
            setCandidates(items);
            setCandidatesLoading(false);
          }
        })
        .catch(() => {
          if (active) setCandidatesLoading(false);
        });
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [dialog?.type, email, live, project.id]);

  function closeDialog() {
    setDialog(null);
    setCandidates([]);
    setShowDropdown(false);
  }

  function mergeMembers(changed: ProjectMember[]) {
    const byId = new Map(members.map((member) => [member.id, member]));
    for (const member of changed) byId.set(member.id, member);
    return [...byId.values()].sort(
      (a, b) =>
        a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id),
    );
  }

  async function saveAccountability(
    member: ProjectMember,
    nextRole: ScrumAccountability,
    previous?: ProjectMember,
  ) {
    if (live) {
      const changed = await changeProjectMemberAccountability(
        project.id,
        member.id,
        {
          scrumAccountability: nextRole,
          ...(previous && {
            previousUserMembershipId: previous.id,
            previousUserNewAccountability: previousRole,
          }),
        },
      );
      if (changed.some((entry) => entry.userId === user?.id))
        void refreshStoredProjects();
      return mergeMembers(changed);
    }
    return changePreviewAccountability(project.id, member.id, {
      scrumAccountability: nextRole,
      ...(previous && {
        replaceCurrentProductOwner: true,
        previousProductOwnerId: previous.id,
        previousProductOwnerNewAccountability:
          previousRole === "SCRUM_MASTER" ? "SCRUM_MASTER" : "DEVELOPER",
      }),
    });
  }
  function openDialog(next: Dialog) {
    setError("");
    setEmail("");
    setCandidates([]);
    setShowDropdown(false);
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
    const exclusive =
      nextRole === "PRODUCT_OWNER" || (live && nextRole === "SCRUM_MASTER");
    if (
      exclusive &&
      members.some(
        (candidate) =>
          candidate.id !== member.id &&
          candidate.scrumAccountability === nextRole,
      )
    ) {
      openDialog({ type: "role", member });
      setRole(nextRole);
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const updated = await saveAccountability(member, nextRole);
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
      let updated: ProjectMember[];
      let message: string;
      if (dialog.type === "invite") {
        const input = { email: email.trim(), scrumAccountability: role };
        updated = live
          ? mergeMembers([await addProjectMember(project.id, input)])
          : addPreviewProjectMember(project.id, input);
        message = "Member added.";
        setQuery("");
      } else if (dialog.type === "role") {
        updated = await saveAccountability(
          dialog.member,
          role,
          currentRoleHolder,
        );
        message = "Scrum role updated.";
      } else {
        if (live) {
          await removeProjectMember(project.id, dialog.member.id);
          updated = members.filter((member) => member.id !== dialog.member.id);
        } else {
          updated = removePreviewProjectMember(project.id, dialog.member.id);
        }
        message = "Member removed.";
      }
      setState({ status: "ready", members: updated });
      closeDialog();
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
      <h1 className="sr-only">Members</h1>
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
        {project.status === "ACTIVE" && (
          <div className={styles.toolbarActions}>
            {canManage && (
              <button
                ref={inviteRef}
                type="button"
                className="button button-primary"
                disabled={state.status !== "ready"}
                onClick={() => openDialog({ type: "invite" })}
              >
                <UserPlus size={16} aria-hidden="true" />
                Add member
              </button>
            )}
            <DropdownMenu
              label="Project actions"
              triggerLabel="Project actions"
              triggerClassName="icon-button row-actions-trigger"
              trigger={<MoreHorizontal size={18} aria-hidden="true" />}
              groups={[
                [
                  {
                    label: "Leave project",
                    tone: "danger",
                    onSelect: () => setLeaving(true),
                  },
                ],
              ]}
            />
          </div>
        )}
      </div>
      {leaving && project.status === "ACTIVE" && (
        <LeaveProjectDialog
          project={project}
          onClose={() => setLeaving(false)}
          onLeft={() => {
            setLeaving(false);
            router.replace("/projects");
          }}
        />
      )}
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
      {state.status === "ready" && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>
              Members of {project.name}
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className={styles.memberHeading}>
                    Members
                    <span
                      className={styles.count}
                      role="status"
                      aria-label={`${visible.length} of ${members.length} members`}
                    >
                      {visible.length}
                    </span>
                  </span>
                </th>
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
                          {(live
                            ? member.userId === user?.id
                            : member.email === previewUser.email) && (
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
          {visible.length === 0 && (
            <div className={styles.empty}>
              <EmptyState
                icon={Users}
                title={normalizedQuery ? "No members found" : "No members yet"}
                description={
                  normalizedQuery
                    ? "Try another name or email."
                    : "Add a staff member to join your project."
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
          )}
        </div>
      )}
      {dialog && (
        <MemberDialog
          title={
            dialog.type === "invite"
              ? "Add member"
              : dialog.type === "role"
                ? "Replace " + scrumRoles[role]
                : "Remove member"
          }
          description={
            dialog.type === "invite" ? (
              <>
                Add a team member to the <strong>{project.name}</strong>{" "}
                project.
              </>
            ) : dialog.type === "role" ? (
              <>
                Set <strong>{dialog.member.fullName}</strong> as the{" "}
                {scrumRoles[role]} for <strong>{project.name}</strong>.
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
              ? "Add member"
              : dialog.type === "role"
                ? "Confirm change"
                : "Remove member"
          }
          destructive={dialog.type === "remove"}
          onSubmit={submit}
          onClose={() => {
            if (!lock.current) closeDialog();
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
              <div className={styles.inputWrapper}>
                <input
                  id={`${id}-email`}
                  type="email"
                  autoComplete="off"
                  placeholder="name@example.com"
                  required
                  autoFocus
                  data-initial-focus
                  disabled={busy}
                  value={email}
                  onChange={(event) => {
                    const nextVal = event.target.value;
                    setEmail(nextVal);
                    if (!nextVal.trim()) {
                      setCandidates([]);
                      setCandidatesLoading(false);
                      setShowDropdown(false);
                    } else {
                      setShowDropdown(true);
                    }
                  }}
                  onFocus={() => {
                    if (email.trim().length > 0) {
                      setShowDropdown(true);
                    }
                  }}
                  onBlur={(event) => {
                    if (
                      !dropdownRef.current?.contains(
                        event.relatedTarget as Node,
                      )
                    ) {
                      setShowDropdown(false);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setShowDropdown(false);
                    }
                  }}
                />
                {showDropdown &&
                  email.trim().length > 0 &&
                  candidates.length > 0 && (
                    <div
                      ref={dropdownRef}
                      className={styles.candidatesDropdown}
                      role="listbox"
                      aria-label="Suggested staff members"
                    >
                      {candidates.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          className={styles.candidateItem}
                          role="option"
                          aria-selected={
                            email.toLowerCase() ===
                            candidate.email.toLowerCase()
                          }
                          onMouseDown={(e) => {
                            e.preventDefault();
                          }}
                          onClick={() => {
                            setEmail(candidate.email);
                            setShowDropdown(false);
                          }}
                        >
                          <span
                            className={styles.candidateAvatar}
                            aria-hidden="true"
                          >
                            {candidate.initials}
                          </span>
                          <div className={styles.candidateInfo}>
                            <div className={styles.candidateName}>
                              {candidate.fullName}
                            </div>
                            <div className={styles.candidateEmail}>
                              {candidate.email}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                {showDropdown &&
                  !candidatesLoading &&
                  candidates.length === 0 &&
                  email.trim().length > 0 && (
                    <div
                      ref={dropdownRef}
                      className={styles.candidatesDropdown}
                    >
                      <div className={styles.candidateEmpty}>
                        No available Staff members match &quot;{email}&quot;
                      </div>
                    </div>
                  )}
              </div>
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
          {currentRoleHolder && (
            <>
              <p className={styles.notice}>
                <strong>{currentRoleHolder.fullName}</strong> is the current{" "}
                {scrumRoles[role]}. Saving will replace them.
              </p>
              <div className={styles.field}>
                <label htmlFor={`${id}-previous-role`}>
                  New Scrum role for {currentRoleHolder.fullName}
                </label>
                <select
                  id={`${id}-previous-role`}
                  data-initial-focus
                  disabled={busy}
                  value={previousRole}
                  onChange={(event) =>
                    setPreviousRole(event.target.value as ScrumAccountability)
                  }
                >
                  {availableReplacementRoles.map((value) => (
                    <option key={value} value={value}>
                      {scrumRoles[value]}
                    </option>
                  ))}
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
