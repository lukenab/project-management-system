"use client";

import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { BacklogItem } from "@/lib/backlog-items";
import type {
  PreviewBacklogMetadata,
  PreviewMetadataChanges,
} from "@/lib/preview-backlog-metadata";

import { backlogErrorMessage } from "@/lib/backlog-items";
import {
  previewBacklogMembers,
  previewBacklogSprints,
} from "@/lib/preview-backlog-metadata";
import { previewUser } from "@/lib/preview-data";

import styles from "./backlog.module.css";
import { BacklogPriority } from "./BacklogPriority";

const sections = ["Assignee", "Sprint", "Dates"] as const;
type Section = (typeof sections)[number];

export function BacklogItemMetadata({
  item,
  value,
  editable,
  onSave,
}: {
  item: BacklogItem;
  value: PreviewBacklogMetadata;
  editable: boolean;
  onSave: (changes: PreviewMetadataChanges) => void;
}) {
  const [editing, setEditing] = useState<Section | null>(null);
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const activeSection = useRef<HTMLElement>(null);
  const triggers = useRef<Partial<Record<Section, HTMLButtonElement | null>>>(
    {},
  );
  const self = previewBacklogMembers.find(
    (person) => person.email === previewUser.email,
  );
  const selectors = useRef<Partial<Record<Section, HTMLButtonElement | null>>>(
    {},
  );
  const sprints = previewBacklogSprints(item.projectId);
  const assignee = previewBacklogMembers.find(
    (person) => person.id === value.assigneeId,
  );

  useEffect(() => {
    if (!editing) return;
    function dismiss(event: PointerEvent) {
      if (!activeSection.current?.contains(event.target as Node)) {
        setEditing(null);
        setError("");
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [editing]);

  function finish() {
    const previous = editing;
    setEditing(null);
    setError("");
    requestAnimationFrame(() => {
      if (previous) triggers.current[previous]?.focus();
    });
  }
  function open(section: Section) {
    if (editing === section) {
      finish();
      return;
    }
    setDraft(value);
    setQuery("");
    setError("");
    setEditing(section);
  }
  function commit(changes: PreviewMetadataChanges) {
    try {
      onSave(changes);
      finish();
    } catch (cause) {
      setError(
        backlogErrorMessage(cause, "Couldn’t apply changes. Please try again."),
      );
    }
  }
  function apply() {
    if (editing === "Sprint") commit({ sprintId: draft.sprintId });
    else if (editing === "Dates")
      commit({ startDate: draft.startDate, dueDate: draft.dueDate });
  }
  const search = query.trim().toLowerCase();
  const members = previewBacklogMembers.filter((person) =>
    `${person.fullName} ${person.email}`.toLowerCase().includes(search),
  );
  const filteredSprints = sprints.filter((sprint) =>
    sprint.name.toLowerCase().includes(search),
  );

  return (
    <aside
      className={styles.metadata}
      aria-label="Item details"
      onKeyDown={(event) => {
        if (editing && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish();
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
            {editable &&
              (editing === section && section !== "Assignee" ? (
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={apply}
                  aria-label={`Apply ${section.toLowerCase()}`}
                >
                  Apply
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.editButton}
                  ref={(element) => {
                    triggers.current[section] = element;
                  }}
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
                      {assignee?.fullName ?? "None"}
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
                    {assignee?.fullName ?? "None"}
                  </span>
                  {editable && !value.assigneeId && self && (
                    <>
                      <span className={styles.placeholder} aria-hidden="true">
                        —
                      </span>
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => {
                          commit({ assigneeId: self.id });
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
                    onSelect={(id) => commit({ assigneeId: id || null })}
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
              {editable && editing === section ? (
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
                  {sprints.find((sprint) => sprint.id === value.sprintId)
                    ?.name ?? "None"}
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
                      disabled={!draft.sprintId}
                    >
                      Clear
                    </button>
                  </div>
                  <SearchInput
                    label="Search sprints"
                    value={query}
                    onChange={setQuery}
                  />
                  <ChoiceList
                    label="Sprint options"
                    selected={draft.sprintId ?? ""}
                    onSelect={(id) => setDraft({ ...draft, sprintId: id })}
                    options={filteredSprints.map((sprint) => ({
                      id: sprint.id,
                      name: sprint.name,
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
      <section className={styles.metadataSection}>
        <h3>Priority</h3>
        <BacklogPriority priority={item.priority} />
      </section>
      <section className={styles.metadataSection}>
        <h3>Story points</h3>
        <p
          className={item.storyPoints === null ? styles.placeholder : undefined}
        >
          {item.storyPoints ?? "Unestimated"}
        </p>
      </section>
    </aside>
  );
}

// Native popovers paint above the drawer without entering its document flow.
function ChoicePopover({
  section,
  triggers,
  children,
}: {
  section: Section;
  triggers: RefObject<Partial<Record<Section, HTMLButtonElement | null>>>;
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
    panel
      .querySelector<HTMLInputElement>('input[type="search"]')
      ?.focus({ preventScroll: true });
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

function SearchInput({
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
function ChoiceList({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
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
