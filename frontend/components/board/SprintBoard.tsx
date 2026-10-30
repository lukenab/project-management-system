"use client";

import {
  CalendarDays,
  Columns3,
  ListFilter,
  Search,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { BacklogDetailState } from "@/components/backlog/BacklogItemDrawer";
import type { PreviewProject } from "@/lib/preview-data";
import type { SprintBoardData } from "@/lib/preview-sprint-board";
import type {
  UpdateWorkItemInput,
  WorkItem,
  WorkItemMember,
  WorkItemStatus,
} from "@/lib/work-items";

import { BacklogItemDrawer } from "@/components/backlog/BacklogItemDrawer";
import { BacklogPriority } from "@/components/backlog/BacklogPriority";
import { WorkTypeIcon } from "@/components/backlog/WorkTypeIcon";
import { EmptyState } from "@/components/shared/EmptyState";
import { Toast } from "@/components/shared/Toast";
import { projectHref } from "@/config/navigation";
import {
  getPreviewSprintBoard,
  listBoardMembers,
  updateBoardStatus,
} from "@/lib/preview-sprint-board";
import { previewWorkItemRepository } from "@/lib/preview-work-items";
import { formatSprintDate, sprintErrorMessage } from "@/lib/sprints";
import { workItemStatusLabels } from "@/lib/work-items";

import backlogStyles from "../backlog/backlog.module.css";
import styles from "./sprint-board.module.css";

type BoardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; board: SprintBoardData; members: WorkItemMember[] };

export function SprintBoard({ project }: { project: PreviewProject }) {
  const [state, setState] = useState<BoardState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<BacklogDetailState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<WorkItemStatus | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    message: string;
    sequence: number;
  } | null>(null);
  const mounted = useRef(false);
  const detailRequest = useRef(0);
  const saving = useRef(false);
  const busy = useRef(false);
  const sequence = useRef(0);
  const suppressCardClickUntil = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const canChange =
    project.status === "ACTIVE" && project.scrumRole === "Developer";

  useEffect(() => {
    let active = true;
    const requests = detailRequest;
    mounted.current = true;
    Promise.all([
      getPreviewSprintBoard(project.id),
      listBoardMembers(project.id),
    ]).then(
      ([board, members]) => {
        if (active) setState({ status: "ready", board, members });
      },
      (cause) => {
        if (active)
          setState({
            status: "error",
            message: sprintErrorMessage(cause, "Please try again."),
          });
      },
    );
    return () => {
      active = false;
      mounted.current = false;
      requests.current++;
    };
  }, [project.id, attempt]);

  const panelLayout = detail ? (expanded ? "expanded" : "overlay") : null;
  useEffect(() => {
    if (!panelLayout) return;
    document.body.dataset.backlogPanel = panelLayout;
    return () => {
      delete document.body.dataset.backlogPanel;
    };
  }, [panelLayout]);

  async function openItem(id: string) {
    if (busy.current || saving.current) return;
    const request = ++detailRequest.current;
    setDetail({ status: "loading", id });
    try {
      const item = await previewWorkItemRepository.get(project.id, id);
      if (mounted.current && request === detailRequest.current)
        setDetail({ status: "ready", id, item });
    } catch (cause) {
      if (mounted.current && request === detailRequest.current)
        setDetail({
          status: "error",
          id,
          missing: false,
          message: sprintErrorMessage(
            cause,
            "Couldn’t load this item. Please try again.",
          ),
        });
    }
  }

  function closeDetails() {
    const id = detail?.id;
    detailRequest.current++;
    setDetail(null);
    setExpanded(false);
    requestAnimationFrame(() =>
      (
        boardRef.current?.querySelector<HTMLButtonElement>(
          `[data-item-id="${CSS.escape(id ?? "")}"]`,
        ) ?? searchRef.current
      )?.focus(),
    );
  }

  function applyItem(item: WorkItem) {
    setState((current) => {
      if (current.status !== "ready") return current;
      const items = current.board.columns
        .flatMap((column) => column.cards)
        .map((old) => (old.id === item.id ? item : old))
        .sort(
          (a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id),
        );
      return {
        ...current,
        board: {
          ...current.board,
          columns: current.board.columns.map((column) => ({
            ...column,
            cards: items.filter((card) => card.status === column.status),
          })),
        },
      };
    });
    setDetail((current) =>
      current?.status === "ready" && current.id === item.id
        ? { ...current, item }
        : current,
    );
  }

  async function saveItem(id: string, input: UpdateWorkItemInput) {
    if (saving.current || !canChange || !input.status)
      throw new Error("Status update unavailable.");
    saving.current = true;
    setSavingId(id);
    setError("");
    try {
      // Keep the card in its saved column until the update succeeds.
      const item = await updateBoardStatus(project.id, id, input.status);
      if (mounted.current) {
        applyItem(item);
        setNotice({
          message: `${item.key} moved to ${workItemStatusLabels[item.status]}.`,
          sequence: ++sequence.current,
        });
      }
    } finally {
      saving.current = false;
      if (mounted.current) setSavingId(null);
    }
  }

  async function dropItem(id: string, status: WorkItemStatus) {
    if (
      !canChange ||
      busy.current ||
      saving.current ||
      state.status !== "ready"
    )
      return;
    const item = state.board.columns
      .flatMap((column) => column.cards)
      .find((card) => card.id === id);
    if (!item || item.status === status) return;
    try {
      await saveItem(id, { status });
    } catch (cause) {
      if (mounted.current)
        setError(
          sprintErrorMessage(
            cause,
            "Couldn’t update status. Your item has not moved. Please try again.",
          ),
        );
    }
  }

  const sprint = state.status === "ready" ? state.board.sprint : null;
  const search = query.trim().toLowerCase();
  const visibleCount =
    state.status === "ready"
      ? state.board.columns
          .flatMap((column) => column.cards)
          .filter((item) =>
            `${item.key} ${item.title}`.toLowerCase().includes(search),
          ).length
      : 0;

  return (
    <div
      className={`${backlogStyles.page} ${styles.page} ${detail && expanded ? backlogStyles.expanded : ""}`}
    >
      <h1 className="sr-only">Sprint Board</h1>
      {(state.status === "loading" || sprint) && (
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              aria-label="Search work items by key or title"
              placeholder="Search work items..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className="icon-button"
            type="button"
            aria-label="Filter"
            disabled
            title="Filter"
          >
            <ListFilter size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
          <button
            type="button"
            className="button"
            onClick={() => {
              if (!busy.current && !saving.current) {
                setError("");
                setState({ status: "loading" });
                setAttempt((value) => value + 1);
              }
            }}
          >
            Refresh board
          </button>
        </p>
      )}
      {state.status === "error" ? (
        <div className={styles.state} role="alert">
          <EmptyState
            icon={TriangleAlert}
            title="Couldn’t load the board"
            description={state.message}
          />
          <button
            type="button"
            className="button"
            onClick={() => {
              setState({ status: "loading" });
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : state.status === "ready" && !sprint ? (
        <div className={styles.state}>
          <EmptyState
            icon={Columns3}
            title="No active sprint"
            description="Start a sprint to see your team’s work on the board."
          />
          {project.status === "ACTIVE" && (
            <Link className="button" href={projectHref(project.id, "sprints")}>
              View sprints
            </Link>
          )}
        </div>
      ) : (
        <>
          {state.status === "ready" && search && (
            <p className={styles.results} role="status">
              {visibleCount
                ? `${visibleCount} matching work items`
                : "No work items match your search."}
              <button type="button" onClick={() => setQuery("")}>
                Clear search
              </button>
            </p>
          )}
          <div
            className={styles.boardScroll}
            ref={boardRef}
            aria-label="Sprint Board"
            aria-busy={state.status === "loading"}
          >
            <div className={styles.columns}>
              {(state.status === "ready"
                ? state.board.columns
                : (["TODO", "IN_PROGRESS", "DONE"] as WorkItemStatus[]).map(
                    (status) => ({ status, cards: [] as WorkItem[] }),
                  )
              ).map((column) => {
                const cards = column.cards.filter((item) =>
                  `${item.key} ${item.title}`.toLowerCase().includes(search),
                );
                return (
                  <section
                    key={column.status}
                    className={styles.column}
                    data-status={column.status}
                    data-over={over === column.status || undefined}
                    aria-label={workItemStatusLabels[column.status]}
                    onDragOver={(event) => {
                      if (
                        canChange &&
                        dragged &&
                        !busy.current &&
                        !saving.current
                      ) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setOver(column.status);
                      }
                    }}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node | null,
                        )
                      )
                        setOver(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      suppressCardClickUntil.current = Date.now() + 250;
                      const id = dragged;
                      setDragged(null);
                      setOver(null);
                      if (id) void dropItem(id, column.status);
                    }}
                  >
                    <header className={styles.columnHeader}>
                      <h2 className={styles.statusPill}>
                        {workItemStatusLabels[column.status]}
                      </h2>
                      <span className={styles.count}>
                        {state.status === "ready" ? cards.length : ""}
                      </span>
                    </header>
                    <div className={styles.cards}>
                      {state.status === "loading" ? (
                        <div role="status" aria-label="Loading work items">
                          <div className={styles.skeleton} />
                          <div className={styles.skeleton} />
                        </div>
                      ) : cards.length ? (
                        cards.map((item) => {
                          const member = state.members.find(
                            (candidate) =>
                              candidate.membershipId === item.assigneeId,
                          );
                          const overdue =
                            item.status !== "DONE" &&
                            !!item.dueDate &&
                            item.dueDate <
                              new Date().toISOString().slice(0, 10);
                          return (
                            <button
                              type="button"
                              aria-label={item.title}
                              aria-pressed={detail?.id === item.id}
                              data-item-id={item.id}
                              onClick={() => {
                                if (
                                  Date.now() >= suppressCardClickUntil.current
                                )
                                  void openItem(item.id);
                              }}
                              key={item.id}
                              className={styles.card}
                              data-selected={
                                detail?.id === item.id || undefined
                              }
                              data-dragging={dragged === item.id || undefined}
                              aria-busy={savingId === item.id}
                              draggable={canChange && !savingId}
                              onDragStart={(event) => {
                                if (busy.current || saving.current) {
                                  event.preventDefault();
                                  return;
                                }
                                setDragged(item.id);
                                suppressCardClickUntil.current = Infinity;
                                event.dataTransfer.setData(
                                  "text/plain",
                                  item.id,
                                );
                                event.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                suppressCardClickUntil.current =
                                  Date.now() + 250;
                                setDragged(null);
                                setOver(null);
                              }}
                            >
                              <span className={styles.cardTitle}>
                                {item.title}
                              </span>
                              <span className={styles.cardMeta}>
                                <span className={styles.itemKey}>
                                  <WorkTypeIcon workType={item.workType} />
                                  {item.key}
                                </span>
                                <BacklogPriority priority={item.priority} />
                              </span>
                              <span className={styles.cardBottom}>
                                <span
                                  className={styles.due}
                                  data-overdue={overdue || undefined}
                                >
                                  {item.dueDate && (
                                    <>
                                      {overdue ? (
                                        <TriangleAlert
                                          size={13}
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <CalendarDays
                                          size={13}
                                          aria-hidden="true"
                                        />
                                      )}
                                      <time dateTime={item.dueDate}>
                                        {formatSprintDate(item.dueDate)}
                                      </time>
                                      {overdue && (
                                        <span className="sr-only">Overdue</span>
                                      )}
                                    </>
                                  )}
                                </span>
                                <span
                                  className={styles.avatar}
                                  title={member?.fullName ?? "None"}
                                  aria-label={`Assignee: ${member?.fullName ?? "None"}`}
                                >
                                  {member?.initials ?? (
                                    <UserRound size={15} aria-hidden="true" />
                                  )}
                                </span>
                              </span>
                              {savingId === item.id && (
                                <span className={styles.saving} role="status">
                                  Saving…
                                </span>
                              )}
                            </button>
                          );
                        })
                      ) : (
                        <p className={styles.emptyColumn}>No items</p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}
      {detail && (
        <BacklogItemDrawer
          state={detail}
          canEditContent={false}
          canChangeStatus={canChange}
          canEditMetadata={false}
          editing={null}
          onEdit={() => {}}
          onFinishEditing={() => {}}
          onDirty={() => {}}
          onBusy={(value) => {
            busy.current = value;
          }}
          onSave={saveItem}
          onDelete={() => {}}
          canClose={() => !busy.current && !saving.current}
          expanded={expanded}
          onToggleExpanded={() => setExpanded((value) => !value)}
          onClose={closeDetails}
          onRetry={() => void openItem(detail.id)}
        />
      )}
      {notice && (
        <Toast
          key={notice.sequence}
          message={notice.message}
          onDismiss={() => setNotice(null)}
          onRestoreFocus={() => searchRef.current?.focus()}
        />
      )}
    </div>
  );
}
