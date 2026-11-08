"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ActivityEvent, WorkItemComment } from "@/lib/collaboration";
import type { WorkItem } from "@/lib/work-items";

import { DropdownMenu } from "@/components/shared/DropdownMenu";
import { useCurrentUser } from "@/lib/current-user";
import { relativeTime } from "@/lib/relative-time";
import { workItemErrorMessage } from "@/lib/work-items";
import {
  addWorkItemComment,
  listWorkItemActivity,
  listWorkItemComments,
} from "@/lib/work-items-api";

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

function Composer({
  draft,
  busy,
  error,
  top,
  initials,
  onDraft,
  onSubmit,
}: {
  draft: string;
  busy: boolean;
  error: string;
  top: boolean;
  initials: string;
  onDraft: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className={`${styles.composer} ${top ? styles.composerTop : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <span className={styles.avatar} aria-hidden="true">
        {initials}
      </span>
      <div className={styles.composerBox}>
        <label className="sr-only" htmlFor="work-item-comment">
          Add a comment
        </label>
        <textarea
          id="work-item-comment"
          rows={3}
          placeholder="Write a comment…"
          value={draft}
          disabled={busy}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.composerFoot}>
          <button
            className="button button-primary"
            type="submit"
            disabled={busy || !draft.trim()}
          >
            {busy ? "Posting…" : "Comment"}
          </button>
        </div>
      </div>
    </form>
  );
}

type Entry =
  | { kind: "comment"; at: string; id: string; comment: WorkItemComment }
  | { kind: "event"; at: string; id: string; event: ActivityEvent };

export function BacklogActivity({
  item,
  now,
  archived,
  onBusy,
  subtaskRevision,
  onDraftChange,
}: {
  item: WorkItem;
  now: number;
  archived: boolean;
  onBusy: (busy: boolean) => void;
  subtaskRevision: number;
  onDraftChange: (dirty: boolean) => void;
}) {
  const isSubtask = item.parentId !== null;
  const showComments = !isSubtask;
  const { user } = useCurrentUser();
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
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      showComments
        ? listWorkItemComments(item.projectId, item.id)
        : Promise.resolve([]),
      listWorkItemActivity(item.projectId, item.id),
    ]).then(
      ([comments, events]) => {
        if (active) setState({ status: "ready", comments, events });
      },
      (cause: unknown) => {
        if (active)
          setState({
            status: "error",
            message: workItemErrorMessage(cause, "Couldn’t load activity."),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [
    item.projectId,
    item.id,
    item.updatedAt,
    showComments,
    subtaskRevision,
    reload,
  ]);

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
    if (sending.current || !content || archived || isSubtask) return;
    sending.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const comment = await addWorkItemComment(
        item.projectId,
        item.id,
        content,
      );
      setState((current) =>
        current.status === "ready"
          ? { ...current, comments: [...current.comments, comment] }
          : current,
      );
      setReload((value) => value + 1);
      if (view.filter === "history") changeView({ filter: "all" });
      setDraft("");
      onDraftChange(false);
    } catch (cause) {
      setError(
        workItemErrorMessage(
          cause,
          "Couldn’t post your comment. Please try again.",
        ),
      );
    } finally {
      sending.current = false;
      setBusy(false);
      onBusy(false);
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
          ...(filter === "comments" ? [] : state.events)
            .filter(
              (event) => filter !== "all" || event.action !== "COMMENT_CREATED",
            )
            .map((event): Entry => ({
              kind: "event",
              at: event.occurredAt,
              id: event.id,
              event,
            })),
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

  const composer = isSubtask ? (
    <p className={styles.note}>
      Comments are available on the parent work item.
    </p>
  ) : archived ? null : (
    <Composer
      draft={draft}
      initials={user?.initials ?? "?"}
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
                <li key={entry.kind + entry.id} className={styles.event}>
                  <span className={styles.dot} aria-hidden="true" />
                  <span>
                    <strong>{entry.event.actor.fullName}</strong>{" "}
                    {entry.event.summary}{" "}
                    <EntryTime at={entry.at} now={now} separator />
                  </span>
                </li>
              ) : (
                <li key={entry.kind + entry.id} className={styles.comment}>
                  <span className={styles.avatar} aria-hidden="true">
                    {entry.comment.author.fullName[0]}
                  </span>
                  <div className={styles.bubble}>
                    <div className={styles.bubbleHead}>
                      <strong>{entry.comment.author.fullName}</strong>
                      <EntryTime at={entry.at} now={now} />
                    </div>
                    <p>{entry.comment.content}</p>
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
