"use client";

import { ChevronDown } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { ActivityEvent, WorkItemComment } from "@/lib/collaboration";
import type { ProjectMember } from "@/lib/preview-project-members";
import type { WorkItem } from "@/lib/work-items";

import { DropdownMenu } from "@/components/shared/DropdownMenu";
import {
  previewCollaborationRepository as repository,
  subscribePreviewCollaboration,
} from "@/lib/preview-collaboration";
import { getPreviewProject, previewUser } from "@/lib/preview-data";
import { listPreviewProjectMembers } from "@/lib/preview-project-members";
import { previewWorkItemRepository } from "@/lib/preview-work-items";
import { relativeTime } from "@/lib/relative-time";
import { workItemErrorMessage } from "@/lib/work-items";
import { listWorkItemActivity } from "@/lib/work-items-api";

import styles from "./backlog-activity.module.css";

const filters = [
  { value: "all", label: "All activity" },
  { value: "comments", label: "Comments only" },
  { value: "history", label: "History only" },
] as const;
const sorts = [
  { value: "asc", label: "Oldest first" },
  { value: "desc", label: "Newest first" },
] as const;
type Filter = (typeof filters)[number]["value"];
type Sort = (typeof sorts)[number]["value"];
type View = { filter: Filter; sort: Sort };

const viewStorageKey = "pms-activity-view-v1";

function readView(): View {
  const fallback: View = { filter: "all", sort: "asc" };
  try {
    const stored = JSON.parse(localStorage.getItem(viewStorageKey) ?? "{}");
    return {
      filter: filters.some(({ value }) => value === stored?.filter)
        ? stored.filter
        : fallback.filter,
      sort: sorts.some(({ value }) => value === stored?.sort)
        ? stored.sort
        : fallback.sort,
    };
  } catch {
    return fallback;
  }
}

function saveView(view: View) {
  try {
    localStorage.setItem(viewStorageKey, JSON.stringify(view));
  } catch {
    /* The view choice is a convenience; the list still works without it. */
  }
}

function membersOf(projectId: string) {
  try {
    return listPreviewProjectMembers(projectId);
  } catch {
    return [];
  }
}

/** Finds the `@query` being typed before the caret, if any. */
function mentionMatch(value: string, caret: number) {
  const match = value.slice(0, caret).match(/(?:^|\s)@([\p{L}\p{M} ]{0,30})$/u);
  return match
    ? { query: match[1].toLowerCase(), start: caret - match[1].length - 1 }
    : null;
}

function CommentText({
  content,
  members,
  mentionedIds,
}: {
  content: string;
  members: ProjectMember[];
  mentionedIds: string[];
}) {
  const names = members
    .filter((member) => mentionedIds.includes(member.id))
    .map((member) => `@${member.fullName}`)
    .sort((a, b) => b.length - a.length);
  if (!names.length) return <p>{content}</p>;
  // Rendered as text nodes, so comment content is never treated as HTML.
  const pattern = new RegExp(
    `(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "g",
  );
  return (
    <p>
      {content.split(pattern).map((part, index) =>
        names.includes(part) ? (
          <span key={index} className={styles.mention}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

function Composer({
  draft,
  members,
  busy,
  error,
  top,
  onDraft,
  onSubmit,
}: {
  draft: string;
  members: ProjectMember[];
  busy: boolean;
  error: string;
  top: boolean;
  onDraft: (value: string) => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{
    query: string;
    start: number;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const options = mention
    ? members
        .filter(
          (member) =>
            member.email !== previewUser.email &&
            member.fullName.toLowerCase().includes(mention.query),
        )
        .slice(0, 6)
    : [];
  const open = options.length > 0;
  const active = Math.min(activeIndex, Math.max(0, options.length - 1));

  function pick(member: ProjectMember) {
    const input = inputRef.current;
    if (!input || !mention) return;
    const inserted = `@${member.fullName} `;
    const next =
      draft.slice(0, mention.start) +
      inserted +
      draft.slice(input.selectionStart);
    const caret = mention.start + inserted.length;
    onDraft(next);
    setMention(null);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((active + step + options.length) % options.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(options[active]);
        return;
      }
      if (event.key === "Escape") {
        // Close only the list, not the drawer around it.
        event.preventDefault();
        event.stopPropagation();
        setMention(null);
        return;
      }
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <>
      <div className={`${styles.composer} ${top ? styles.composerTop : ""}`}>
        <span className={styles.avatar} aria-hidden="true">
          {previewUser.initials}
        </span>
        <div className={styles.composerBox}>
          {open && (
            <ul
              id="comment-mentions"
              className={styles.mentions}
              role="listbox"
              aria-label="Mention a member"
            >
              {options.map((member, index) => (
                <li
                  key={member.id}
                  id={`comment-mention-${member.id}`}
                  role="option"
                  aria-selected={index === active}
                  className={
                    index === active ? styles.mentionActive : undefined
                  }
                  onPointerDown={(event) => {
                    event.preventDefault();
                    pick(member);
                  }}
                >
                  <span className={styles.avatar} aria-hidden="true">
                    {member.initials}
                  </span>
                  <span>{member.fullName}</span>
                </li>
              ))}
            </ul>
          )}
          <label className="sr-only" htmlFor="work-item-comment">
            Add a comment
          </label>
          <textarea
            ref={inputRef}
            id="work-item-comment"
            rows={3}
            placeholder="Write a comment. Type @ to mention a member."
            value={draft}
            disabled={busy}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls="comment-mentions"
            aria-activedescendant={
              open ? `comment-mention-${options[active].id}` : undefined
            }
            onChange={(event) => {
              onDraft(event.target.value);
              setActiveIndex(0);
              setMention(
                mentionMatch(event.target.value, event.target.selectionStart),
              );
            }}
            onBlur={() => setMention(null)}
            onKeyDown={onKeyDown}
          />
          <div className={styles.composerFoot}>
            <small>Plain text · Ctrl + Enter to send</small>
            <button
              type="button"
              className="button button-primary"
              disabled={busy || !draft.trim()}
              onClick={onSubmit}
            >
              {busy ? "Posting…" : "Comment"}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}

type Entry =
  | { kind: "comment"; at: string; id: string; comment: WorkItemComment }
  | { kind: "event"; at: string; id: string; event: ActivityEvent };

export function BacklogActivity({
  item,
  now,
  live,
  subtaskRevision,
  onDraftChange,
}: {
  item: WorkItem;
  now: number;
  live: boolean;
  subtaskRevision: number;
  onDraftChange: (dirty: boolean) => void;
}) {
  const isSubtask = item.parentId !== null;
  const showComments = !live && !isSubtask;
  const archived =
    !live && getPreviewProject(item.projectId)?.status !== "ACTIVE";
  const activityUpdatedAt = live ? item.updatedAt : null;
  const [view, setView] = useState(readView);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
        status: "ready";
        comments: WorkItemComment[];
        events: ActivityEvent[];
      }
  >({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [parentKey, setParentKey] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const members = useMemo(
    () => (live ? [] : membersOf(item.projectId)),
    [item.projectId, live],
  );

  useEffect(() => {
    let active = true;
    function load() {
      Promise.all([
        !showComments
          ? Promise.resolve([])
          : repository.listComments(item.projectId, item.id),
        live
          ? listWorkItemActivity(item.projectId, item.id)
          : repository.listActivity(item.projectId, item.id),
      ]).then(
        ([comments, events]) => {
          if (active) setState({ status: "ready", comments, events });
        },
        (cause) => {
          if (active)
            setState({
              status: "error",
              message: workItemErrorMessage(cause, "Couldn’t load activity."),
            });
        },
      );
    }
    load();
    const unsubscribe = live ? undefined : subscribePreviewCollaboration(load);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [
    item.projectId,
    item.id,
    live,
    showComments,
    activityUpdatedAt,
    subtaskRevision,
    reload,
  ]);

  useEffect(() => {
    if (live || !item.parentId) return;
    let active = true;
    previewWorkItemRepository.get(item.projectId, item.parentId).then(
      (parent) => {
        if (active) setParentKey(parent.key);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [item.projectId, item.parentId, live]);

  function changeDraft(value: string) {
    setDraft(value);
    setError("");
    onDraftChange(!!value.trim());
  }
  function changeView(next: Partial<View>) {
    const updated = { ...view, ...next };
    setView(updated);
    saveView(updated);
  }
  async function submit() {
    const content = draft.trim();
    if (sending.current || !content) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await repository.addComment(item.projectId, item.id, {
        content,
        mentionedMemberIds: members
          .filter((member) => content.includes(`@${member.fullName}`))
          .map((member) => member.id),
      });
      setDraft("");
      onDraftChange(false);
    } catch {
      setError(
        "Couldn’t post your comment. Your text is kept; please try again.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const filter = showComments ? view.filter : "history";
  const entries: Entry[] =
    state.status === "ready"
      ? [
          ...(filter === "history" ? [] : state.comments).map(
            (comment): Entry => ({
              kind: "comment",
              at: comment.createdAt,
              id: comment.id,
              comment,
            }),
          ),
          ...(filter === "comments" ? [] : state.events).map(
            (event): Entry => ({
              kind: "event",
              at: event.occurredAt,
              id: event.id,
              event,
            }),
          ),
        ].sort((a, b) => {
          const order =
            a.at.localeCompare(b.at) ||
            a.id.localeCompare(b.id, undefined, { numeric: true });
          return view.sort === "asc" ? order : -order;
        })
      : [];
  const filterLabel = filters.find(({ value }) => value === view.filter)?.label;
  const sortLabel = sorts.find(({ value }) => value === view.sort)?.label;
  const composerTop = view.sort === "desc";

  const composer = live ? null : isSubtask ? (
    <p className={styles.note}>
      Comments are available on the parent work item
      {parentKey ? `, ${parentKey}` : ""}.
    </p>
  ) : archived ? (
    <p className={styles.note}>
      This project is archived. Comments are read-only.
    </p>
  ) : (
    <Composer
      draft={draft}
      members={members}
      busy={busy}
      error={error}
      top={composerTop}
      onDraft={changeDraft}
      onSubmit={() => void submit()}
    />
  );

  return (
    <section className={styles.activity} aria-labelledby="activity-heading">
      <div className={styles.heading}>
        <h3 id="activity-heading">Activity</h3>
        <div className={styles.controls}>
          {showComments && (
            <DropdownMenu
              label="Filter activity"
              triggerLabel={`Filter activity: ${filterLabel}`}
              triggerClassName={styles.pill}
              trigger={
                <>
                  {filterLabel}
                  <ChevronDown size={13} aria-hidden="true" />
                </>
              }
              groups={[
                filters.map(({ value, label }) => ({
                  label,
                  onSelect: () => changeView({ filter: value }),
                })),
              ]}
            />
          )}
          <DropdownMenu
            label="Sort activity"
            triggerLabel={`Sort activity: ${sortLabel}`}
            triggerClassName={styles.pill}
            trigger={
              <>
                {sortLabel}
                <ChevronDown size={13} aria-hidden="true" />
              </>
            }
            groups={[
              sorts.map(({ value, label }) => ({
                label,
                onSelect: () => changeView({ sort: value }),
              })),
            ]}
          />
        </div>
      </div>
      {composerTop && composer}
      {state.status === "loading" && (
        <p className={styles.empty} role="status">
          Loading activity…
        </p>
      )}
      {state.status === "error" && (
        <div className={styles.empty} role="alert">
          <p>{state.message}</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              setState({ status: "loading" });
              setReload((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {state.status === "ready" &&
        (entries.length ? (
          <ol className={styles.timeline}>
            {entries.map((entry) =>
              entry.kind === "event" ? (
                <li key={entry.id} className={styles.event}>
                  <span className={styles.dot} aria-hidden="true" />
                  <span>
                    <strong>{entry.event.actor.fullName}</strong>{" "}
                    {entry.event.summary}{" "}
                    <EntryTime at={entry.at} now={now} separator />
                  </span>
                </li>
              ) : (
                <li key={entry.id} className={styles.comment}>
                  <span className={styles.avatar} aria-hidden="true">
                    {members.find(
                      (member) => member.userId === entry.comment.author.id,
                    )?.initials ?? entry.comment.author.fullName[0]}
                  </span>
                  <div className={styles.bubble}>
                    <div className={styles.bubbleHead}>
                      <strong>{entry.comment.author.fullName}</strong>
                      <EntryTime at={entry.at} now={now} />
                    </div>
                    <CommentText
                      content={entry.comment.content}
                      members={members}
                      mentionedIds={entry.comment.mentionedMemberIds}
                    />
                  </div>
                </li>
              ),
            )}
          </ol>
        ) : (
          <p className={styles.empty}>
            {filter === "comments"
              ? "No comments yet."
              : "No activity to show."}
          </p>
        ))}
      {!composerTop && composer}
    </section>
  );
}

function EntryTime({
  at,
  now,
  separator = false,
}: {
  at: string;
  now: number;
  separator?: boolean;
}) {
  return (
    <time
      className={styles.time}
      dateTime={at}
      title={new Date(at).toLocaleString("en-GB", { timeZoneName: "short" })}
    >
      {separator && "· "}
      {relativeTime(at, now)}
    </time>
  );
}
