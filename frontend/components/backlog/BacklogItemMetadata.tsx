"use client";

import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ProjectMember } from "@/lib/preview-project-members";
import type {
  PreviewWorkItemMetadata,
  PreviewMetadataChanges,
} from "@/lib/preview-work-items";
import type { SprintSummary } from "@/lib/sprints";
import type { WorkItem } from "@/lib/work-items";

import { useCurrentUser } from "@/lib/current-user";
import { previewUser } from "@/lib/preview-data";
import { previewSprintOptions } from "@/lib/preview-sprints";
import { previewWorkItemMembers } from "@/lib/preview-work-items";
import { sprintErrorMessage, sprintStatusLabels } from "@/lib/sprints";
import { apiSprintRepository } from "@/lib/sprints-api";
import {
  isWorkItemAssignee,
  workItemMemberName,
  workItemErrorMessage,
} from "@/lib/work-items";

import styles from "./backlog.module.css";

const sections = ["Assignee", "Sprint", "Dates"] as const;
type Section = (typeof sections)[number];

export function BacklogItemMetadata({
  item,
  value,
  liveMembers,
  editable,
  canSelectSprint,
  onSave,
  onBusy,
  fieldEditors,
}: {
  fieldEditors: ReactNode;
  item: WorkItem;
  value: PreviewWorkItemMetadata;
  liveMembers?: ProjectMember[];
  editable: boolean;
  canSelectSprint: boolean;
  onSave: (changes: PreviewMetadataChanges) => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [editing, setEditing] = useState<Section | null>(null);
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const live = liveMembers !== undefined;
  const { user } = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [sprintOptions, setSprintOptions] = useState<SprintSummary[] | null>(
    null,
  );
  const [sprintLoadError, setSprintLoadError] = useState("");
  const [sprintAttempt, setSprintAttempt] = useState(0);
  const activeSection = useRef<HTMLElement>(null);
  const triggers = useRef<Partial<Record<Section, HTMLButtonElement | null>>>(
    {},
  );
  const projectMembers =
    liveMembers?.map((person) => ({ ...person, membershipId: person.id })) ??
    previewWorkItemMembers(item.projectId);
  const self = projectMembers.find((person) =>
    live
      ? "userId" in person &&
        person.userId === user?.id &&
        isWorkItemAssignee(person)
      : person.email === previewUser.email,
  );

  const selectors = useRef<Partial<Record<Section, HTMLButtonElement | null>>>(
    {},
  );
  const sprints = live
    ? (sprintOptions ?? []).map((sprint) => ({
        ...sprint,
        name: sprint.name ?? "Unnamed sprint",
      }))
    : previewSprintOptions(item.projectId, value.sprintId);
  const assignee = (liveMembers ?? projectMembers).find(
    (person) => person.id === value.assigneeId,
  );
  const assigneeName = assignee
    ? workItemMemberName(assignee)
    : value.assigneeId && liveMembers
      ? "Unknown assignee"
      : "None";

  useEffect(() => {
    if (!editing) return;
    function dismiss(event: PointerEvent) {
      if (pending.current) return;
      if (!activeSection.current?.contains(event.target as Node)) {
        setEditing(null);
        setError("");
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [editing]);

  useEffect(() => {
    if (!live || editing !== "Sprint") return;
    let active = true;
    void apiSprintRepository.list(item.projectId).then(
      (options) => {
        if (active) setSprintOptions(options);
      },
      (cause) => {
        if (active)
          setSprintLoadError(
            sprintErrorMessage(cause, "Couldn’t load sprints."),
          );
      },
    );
    return () => {
      active = false;
    };
  }, [editing, item.projectId, live, sprintAttempt]);

  function finish() {
    const previous = editing;
    setEditing(null);
    setError("");
    requestAnimationFrame(() => {
      if (previous) triggers.current[previous]?.focus();
    });
  }
  function open(section: Section) {
    if (pending.current) return;
    if (editing === section) {
      finish();
      return;
    }
    if (section === "Sprint" && live) {
      setSprintOptions(null);
      setSprintLoadError("");
    }
    setDraft(value);
    setQuery("");
    setError("");
    setEditing(section);
  }
  async function commit(changes: PreviewMetadataChanges) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    onBusy(true);
    try {
      if (Object.keys(changes).length) await onSave(changes);
      finish();
    } catch (cause) {
      if (!editing) setEditing("Assignee");
      setError(
        workItemErrorMessage(
          cause,
          "Couldn’t apply changes. Please try again.",
        ),
      );
    } finally {
      pending.current = false;
      setSaving(false);
      onBusy(false);
    }
  }
  function apply() {
    if (editing === "Sprint") {
      void commit(
        draft.sprintId === value.sprintId ? {} : { sprintId: draft.sprintId },
      );
    } else if (editing === "Dates") {
      const changes: PreviewMetadataChanges = {};
      if (draft.startDate !== value.startDate)
        changes.startDate = draft.startDate;
      if (draft.dueDate !== value.dueDate) changes.dueDate = draft.dueDate;
      void commit(changes);
    }
  }
  const search = query.trim().toLowerCase();
  const members = projectMembers.filter(
    (person) =>
      (!live || isWorkItemAssignee(person)) &&
      !("accountStatus" in person && person.accountStatus) &&
      `${person.fullName} ${person.email}`.toLowerCase().includes(search),
  );
  const filteredSprints = sprints.filter(
    (sprint) =>
      sprint.status !== "CLOSED" && sprint.name.toLowerCase().includes(search),
  );

  return (
    <aside
      className={styles.metadata}
      aria-label="Item details"
      onKeyDown={(event) => {
        if (editing && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!pending.current) finish();
        }
      }}
    >
      {sections.map((section) => (
        <section
          key={section}
          className={styles.metadataSection}
          ref={editing === section ? activeSection : undefined}
          aria-label={section}
        >
          <div className={styles.sectionHeading}>
            <h3>{section}</h3>
            {(section === "Sprint" ? canSelectSprint : editable) &&
              (editing === section && section !== "Assignee" ? (
                <button
                  type="button"
                  className={styles.editButton}
                  disabled={
                    saving || (section === "Sprint" && live && !sprintOptions)
                  }
                  onClick={apply}
                  aria-label={`Apply ${section.toLowerCase()}`}
                >
                  {saving ? "Saving…" : "Apply"}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.editButton}
                  ref={(element) => {
                    triggers.current[section] = element;
                  }}
                  disabled={saving}
                  onClick={() => open(section)}
                  aria-label={`Edit ${section.toLowerCase()}`}
                  aria-expanded={editing === section}
                >
                  Edit
                </button>
              ))}
          </div>
          {section === "Assignee" ? (
            <>
              {editable && editing === section ? (
                <div className={styles.assigneeControl}>
                  <button
                    type="button"
                    className={styles.metadataTrigger}
                    aria-label="Select assignee"
                    aria-expanded={editing === section}
                    ref={(element) => {
                      selectors.current.Assignee = element;
                    }}
                    onClick={() => open(section)}
                  >
                    <span className={styles.person}>
                      {assignee && (
                        <span className={styles.avatar} aria-hidden="true">
                          {assignee.initials}
                        </span>
                      )}
                      {assigneeName}
                    </span>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className={styles.metadataValue}>
                  <span className={styles.person}>
                    {assignee && (
                      <span className={styles.avatar} aria-hidden="true">
                        {assignee.initials}
                      </span>
                    )}
                    {assigneeName}
                  </span>
                  {editable && !value.assigneeId && self && (
                    <>
                      <span className={styles.placeholder} aria-hidden="true">
                        —
                      </span>
                      <button
                        type="button"
                        className={styles.editButton}
                        disabled={saving}
                        onClick={() => {
                          void commit({ assigneeId: self.id });
                          requestAnimationFrame(() =>
                            triggers.current.Assignee?.focus(),
                          );
                        }}
                      >
                        Assign yourself
                      </button>
                    </>
                  )}
                </div>
              )}
              {editing === section && (
                <ChoicePopover section={section} triggers={selectors}>
                  <SearchInput
                    label="Search members"
                    value={query}
                    onChange={setQuery}
                  />
                  <ChoiceList
                    label="Assignee options"
                    selected={value.assigneeId ?? ""}
                    onSelect={(id) =>
                      void commit(
                        (id || null) === value.assigneeId
                          ? {}
                          : { assigneeId: id || null },
                      )
                    }
                    options={[
                      ...(!search || "none".includes(search)
                        ? [{ id: "", name: "None" }]
                        : []),
                      ...members.map((person) => ({
                        id: person.id,
                        name: person.fullName,
                        subtitle: person.email,
                        initials: person.initials,
                      })),
                    ]}
                  />
                </ChoicePopover>
              )}
            </>
          ) : section === "Sprint" ? (
            <>
              {canSelectSprint && editing === section ? (
                <button
                  type="button"
                  className={styles.metadataTrigger}
                  aria-label="Select sprint"
                  aria-expanded={editing === section}
                  ref={(element) => {
                    selectors.current.Sprint = element;
                  }}
                  onClick={() => open(section)}
                >
                  <span>
                    {sprints.find(
                      (sprint) =>
                        sprint.id ===
                        (editing === section ? draft.sprintId : value.sprintId),
                    )?.name ?? "None"}
                  </span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              ) : (
                <p className={styles.metadataValue}>
                  {liveMembers
                    ? item.sprint
                      ? (item.sprint.name ?? "Unnamed sprint")
                      : "None"
                    : (sprints.find((sprint) => sprint.id === value.sprintId)
                        ?.name ?? "None")}
                </p>
              )}
              {editing === section && (
                <ChoicePopover section={section} triggers={selectors}>
                  <div className={styles.choiceToolbar}>
                    <button
                      type="button"
                      className={styles.editButton}
                      onClick={() => {
                        setDraft({ ...draft, sprintId: null });
                        setQuery("");
                      }}
                      aria-label="Clear sprint"
                      disabled={
                        saving ||
                        !draft.sprintId ||
                        (live &&
                          (!sprintOptions ||
                            sprintOptions.some(
                              (sprint) =>
                                sprint.id === value.sprintId &&
                                sprint.status === "CLOSED",
                            )))
                      }
                    >
                      Clear
                    </button>
                  </div>
                  <SearchInput
                    label="Search sprints"
                    value={query}
                    onChange={setQuery}
                  />
                  {sprintLoadError && (
                    <p className={styles.editorError} role="alert">
                      {sprintLoadError}{" "}
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => {
                          setSprintLoadError("");
                          setSprintAttempt((attempt) => attempt + 1);
                        }}
                      >
                        Retry
                      </button>
                    </p>
                  )}
                  {live && !sprintOptions && !sprintLoadError && (
                    <p role="status">Loading sprints…</p>
                  )}
                  <ChoiceList
                    label="Sprint options"
                    selected={draft.sprintId ?? ""}
                    onSelect={(id) => {
                      if (!pending.current)
                        setDraft({ ...draft, sprintId: id });
                    }}
                    options={filteredSprints.map((sprint) => ({
                      id: sprint.id,
                      name: sprint.name,
                      subtitle:
                        sprint.status === "ACTIVE"
                          ? "Active · changes the running Sprint’s scope"
                          : sprintStatusLabels[sprint.status],
                    }))}
                  />
                </ChoicePopover>
              )}
            </>
          ) : editing === section ? (
            <form
              className={styles.inlineEditor}
              aria-label="Edit dates"
              onSubmit={(event) => {
                event.preventDefault();
                apply();
              }}
            >
              {(["startDate", "dueDate"] as const).map((field) => (
                <label key={field}>
                  {field === "startDate" ? "Start" : "Due"}
                  <span className={styles.dateControl}>
                    <input
                      autoFocus={field === "startDate"}
                      disabled={saving}
                      type="date"
                      aria-label={
                        field === "startDate" ? "Start date" : "Due date"
                      }
                      value={draft[field] ?? ""}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          [field]: event.target.value || null,
                        })
                      }
                    />
                    {draft[field] && (
                      <button
                        type="button"
                        disabled={saving}
                        className={styles.clearDate}
                        aria-label={
                          field === "startDate"
                            ? "Clear start date"
                            : "Clear due date"
                        }
                        onClick={() => setDraft({ ...draft, [field]: null })}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                </label>
              ))}
              <button type="submit" hidden>
                Apply
              </button>
            </form>
          ) : (
            <dl className={styles.dateFacts}>
              <dt>Start</dt>
              <dd>{formatDate(value.startDate)}</dd>
              <dt>Due</dt>
              <dd>{formatDate(value.dueDate)}</dd>
            </dl>
          )}
          {editing === section && error && (
            <p role="alert" className={styles.editorError}>
              {error}
            </p>
          )}
        </section>
      ))}
      {fieldEditors}
    </aside>
  );
}

// Native popovers paint above the drawer without entering its document flow.
export function ChoicePopover<T extends string>({
  section,
  triggers,
  children,
}: {
  section: T;
  triggers: RefObject<Partial<Record<T, HTMLButtonElement | null>>>;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trigger = triggers.current[section];
    if (!panel || !trigger) return;
    let frame = 0;
    function position() {
      if (!panel || !trigger) return;
      const anchor = (
        trigger.closest(`.${styles.assigneeControl}`) ?? trigger
      ).getBoundingClientRect();
      const margin = 12;
      const width = Math.min(
        Math.max(anchor.width, 240),
        window.innerWidth - margin * 2,
      );
      panel.style.width = `${width}px`;
      panel.style.left = `${Math.max(margin, Math.min(anchor.right - width, window.innerWidth - width - margin))}px`;
      const below = window.innerHeight - anchor.bottom - margin - 6;
      const above = anchor.top - margin - 6;
      panel.style.maxHeight = `${window.innerHeight - margin * 2}px`;
      const height = panel.getBoundingClientRect().height;
      const flip = height > below && above > below;
      panel.style.maxHeight = `${Math.max(60, flip ? above : below)}px`;
      const actualHeight = panel.getBoundingClientRect().height;
      panel.style.top = `${Math.max(margin, Math.min(flip ? anchor.top - actualHeight - 6 : anchor.bottom + 6, window.innerHeight - actualHeight - margin))}px`;
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    }
    panel.showPopover();
    position();
    const focusTarget =
      panel.querySelector<HTMLElement>(
        'input[type="search"], [role="option"][aria-selected="true"]',
      ) ?? panel.querySelector<HTMLElement>('[role="option"]');
    focusTarget?.focus({ preventScroll: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(trigger);
    observer.observe(panel);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      panel.hidePopover();
    };
  }, [section, triggers]);
  return (
    <div ref={panelRef} className={styles.choicePanel} popover="manual">
      {children}
    </div>
  );
}

export function SearchInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.choiceSearch}>
      <Search size={14} aria-hidden="true" />
      <input
        autoFocus
        type="search"
        aria-label={label}
        placeholder="Search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            event.currentTarget
              .closest(`.${styles.choicePanel}`)
              ?.querySelector<HTMLButtonElement>('[role="option"]')
              ?.focus();
          }
        }}
      />
    </div>
  );
}

type Choice = {
  id: string;
  name: string;
  subtitle?: string;
  initials?: string;
};
export function ChoiceList({
  id,
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  id?: string;
  options: Choice[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const choices = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="option"]',
      ),
    );
    const index = choices.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === "ArrowDown") next = (index + 1) % choices.length;
    else if (event.key === "ArrowUp")
      next = (index - 1 + choices.length) % choices.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = choices.length - 1;
    else return;
    event.preventDefault();
    choices[next]?.focus();
  }
  return (
    <div
      className={styles.choiceList}
      id={id}
      role="listbox"
      aria-label={label}
      onKeyDown={navigate}
    >
      {options.length ? (
        options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={selected === option.id}
            tabIndex={
              selected === option.id ||
              (!options.some((entry) => entry.id === selected) && index === 0)
                ? 0
                : -1
            }
            className={styles.choiceOption}
            onClick={() => onSelect(option.id)}
          >
            <span className={styles.selectionMark}>
              {selected === option.id && <Check size={14} aria-hidden="true" />}
            </span>
            {option.initials && (
              <span className={styles.avatar} aria-hidden="true">
                {option.initials}
              </span>
            )}
            <span className={styles.choiceCopy}>
              <span>{option.name}</span>
              {option.subtitle && <small>{option.subtitle}</small>}
            </span>
          </button>
        ))
      ) : (
        <p className={styles.noChoices} role="status">
          No results found.
        </p>
      )}
    </div>
  );
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`))
    : "None";
}
