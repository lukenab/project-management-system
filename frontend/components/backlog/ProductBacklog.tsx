"use client";

import { ClipboardList, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { PreviewProject } from "@/lib/preview-data";
import type { WorkItem, UpdateWorkItemInput } from "@/lib/work-items";

import { EmptyState } from "@/components/shared/EmptyState";
import { Toast } from "@/components/shared/Toast";
import { previewWorkItemRepository as repository } from "@/lib/preview-work-items";
import { WorkItemDataError, workItemErrorMessage } from "@/lib/work-items";

import type { BacklogDetailState } from "./BacklogItemDrawer";
import type { BacklogEditMode } from "./BacklogItemEditor";

import styles from "./backlog.module.css";
import { BacklogConfirmation } from "./BacklogConfirmation";
import { BacklogItemActions } from "./BacklogItemActions";
import { BacklogItemDrawer } from "./BacklogItemDrawer";
import { BacklogStatusBadge } from "./BacklogItemStatus";
import { BacklogLoading } from "./BacklogLoading";
import { BacklogPriority } from "./BacklogPriority";
import { QuickCreateItem } from "./QuickCreateItem";
import { WorkTypeIcon } from "./WorkTypeIcon";

type BacklogListState =
  | { status: "loading" }
  | { status: "ready"; items: WorkItem[] }
  | { status: "error"; message: string };

export function ProductBacklog({ project }: { project: PreviewProject }) {
  const [list, setList] = useState<BacklogListState>({ status: "loading" });
  const [listAttempt, setListAttempt] = useState(0);
  const [detail, setDetail] = useState<BacklogDetailState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{
    item: WorkItem;
    action: "created" | "updated" | "deleted";
    sequence: number;
  } | null>(null);
  const [editing, setEditing] = useState<BacklogEditMode | null>(null);
  const dirty = useRef(false);
  const busy = useRef(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [deleting, setDeleting] = useState<WorkItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const notificationSequence = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const detailRequest = useRef(0);
  const mounted = useRef(false);
  const canCreate =
    project.status === "ACTIVE" && project.scrumRole === "Product Owner";
  const canChangeStatus =
    project.status === "ACTIVE" && project.scrumRole === "Developer";
  function notify(item: WorkItem, action: "created" | "updated" | "deleted") {
    setNotice({ item, action, sequence: ++notificationSequence.current });
  }
  function finishEditing(restoreFocus = true) {
    dirty.current = false;
    setEditing(null);
    if (!restoreFocus) return;
    const label = editing === "priority" ? "Edit priority" : "Edit item";
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
        ?.focus(),
    );
  }
  function guard(action: () => void) {
    if (busy.current) return;
    if (dirty.current) setPendingAction(() => action);
    else action();
  }
  function changeEditMode(mode: BacklogEditMode) {
    if (editing === mode) return;
    guard(() => {
      dirty.current = false;
      setEditing(mode);
    });
  }
  function requestDelete(item: WorkItem) {
    guard(() => {
      setDeleting(item);
      setDeleteError("");
    });
  }
  const panelLayout = detail ? (expanded ? "expanded" : "docked") : null;

  useEffect(() => {
    if (!panelLayout) return;
    document.body.dataset.backlogPanel = panelLayout;
    return () => {
      delete document.body.dataset.backlogPanel;
    };
  }, [panelLayout]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    repository.list(project.id).then(
      (items) => {
        if (active) setList({ status: "ready", items });
      },
      (cause) => {
        if (active) {
          setList({
            status: "error",
            message: workItemErrorMessage(cause, "Please try again."),
          });
        }
      },
    );
    return () => {
      active = false;
      mounted.current = false;
      detailRequest.current += 1;
    };
  }, [project.id, listAttempt]);

  function requestOpenItem(id: string, edit = false) {
    if (detail?.id === id && detail.status === "ready") {
      if (edit) changeEditMode("content");
      return;
    }
    guard(() => {
      dirty.current = false;
      setEditing(edit ? "content" : null);
      void openItem(id);
    });
  }
  async function openItem(id: string) {
    setNotice(null);
    const request = ++detailRequest.current;
    setDetail({ status: "loading", id });
    try {
      const item = await repository.get(project.id, id);
      if (mounted.current && request === detailRequest.current) {
        setDetail({ status: "ready", id, item });
      }
    } catch (cause) {
      if (mounted.current && request === detailRequest.current) {
        const missing =
          cause instanceof WorkItemDataError && cause.code === "NOT_FOUND";
        setDetail({
          status: "error",
          id,
          missing,
          message: workItemErrorMessage(
            cause,
            "Your work items are still available. Please try again.",
          ),
        });
      }
    }
  }

  function closeDetails() {
    finishEditing();
    const id = detail?.id;
    detailRequest.current += 1;
    setDetail(null);
    setExpanded(false);
    requestAnimationFrame(() => {
      const trigger = id
        ? listRef.current?.querySelector<HTMLButtonElement>(
            `[data-item-id="${CSS.escape(id)}"]`,
          )
        : null;
      (trigger || createRef.current)?.focus();
    });
  }

  function startCreating() {
    setCreating(true);
    inputRef.current?.focus();
  }

  async function createItem(title: string) {
    const item = await repository.create(project.id, { title });
    if (!mounted.current) return;
    setList((current) => ({
      status: "ready",
      items: [...(current.status === "ready" ? current.items : []), item],
    }));
    setCreating(false);
    notify(item, "created");
    requestAnimationFrame(() => createRef.current?.focus());
  }

  async function saveItem(itemId: string, changes: UpdateWorkItemInput) {
    const item = await repository.update(project.id, itemId, changes);
    if (!mounted.current) return;
    setList((current) =>
      current.status === "ready"
        ? {
            ...current,
            items: current.items.map((existing) =>
              existing.id === item.id ? item : existing,
            ),
          }
        : current,
    );
    setDetail((current) =>
      current?.status === "ready" && current.id === item.id
        ? { ...current, item }
        : current,
    );
    notify(item, "updated");
  }
  async function deleteItem() {
    if (!deleting || busy.current) return;
    busy.current = true;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await repository.remove(project.id, deleting.id);
      if (!mounted.current) return;
      setList((current) =>
        current.status === "ready"
          ? {
              ...current,
              items: current.items.filter((item) => item.id !== deleting.id),
            }
          : current,
      );
      if (detail?.id === deleting.id) closeDetails();
      else finishEditing();
      notify(deleting, "deleted");
      setDeleting(null);
      requestAnimationFrame(() =>
        (
          listRef.current?.querySelector<HTMLButtonElement>("[data-item-id]") ??
          createRef.current
        )?.focus(),
      );
    } catch (cause) {
      setDeleteError(
        workItemErrorMessage(
          cause,
          "Couldn’t delete this item. Please try again.",
        ),
      );
    } finally {
      busy.current = false;
      setDeleteBusy(false);
    }
  }

  return (
    <div
      className={`${styles.page} ${detail ? styles.docked : ""} ${detail && expanded ? styles.expanded : ""}`}
    >
      <h1 className="sr-only">Work Items</h1>
      {notice && (
        <Toast
          key={notice.sequence}
          message={`Item ${notice.item.key} ${notice.action}.`}
          actionLabel={notice.action === "deleted" ? undefined : "View item"}
          onAction={
            notice.action === "deleted"
              ? undefined
              : () => requestOpenItem(notice.item.id)
          }
          onDismiss={() => setNotice(null)}
          onRestoreFocus={() =>
            (createRef.current ?? inputRef.current)?.focus()
          }
        />
      )}
      <div className={styles.workspace}>
        <section className={styles.list} ref={listRef} aria-label="Work items">
          <div className={styles.listHeader}>
            <h2>
              Work Items
              {list.status === "ready" && (
                <span className={styles.count}>{list.items.length}</span>
              )}
            </h2>
          </div>
          {list.status === "loading" ? (
            <BacklogLoading />
          ) : list.status === "error" ? (
            <div className={styles.listError} role="alert">
              <h2>Couldn’t load work items</h2>
              <p>{list.message}</p>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setList({ status: "loading" });
                  setListAttempt((attempt) => attempt + 1);
                }}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {list.items.length ? (
                <ul className={styles.items}>
                  {list.items.map((item) => (
                    <li
                      key={item.id}
                      className={styles.itemRow}
                      data-selected={detail?.id === item.id || undefined}
                    >
                      <button
                        type="button"
                        className={styles.item}
                        data-item-id={item.id}
                        onClick={() => requestOpenItem(item.id)}
                        aria-pressed={detail?.id === item.id}
                        aria-controls={
                          detail?.id === item.id
                            ? "backlog-item-details"
                            : undefined
                        }
                      >
                        <WorkTypeIcon workType={item.workType} />
                        <span className={styles.itemCopy}>
                          <span className={styles.itemKey}>{item.key}</span>
                          <span className={styles.itemTitle} title={item.title}>
                            {item.title}
                          </span>
                        </span>
                        <span className={styles.itemIndicators}>
                          <BacklogStatusBadge status={item.status} />
                          <BacklogPriority priority={item.priority} />
                        </span>
                      </button>
                      {canCreate && (
                        <BacklogItemActions
                          itemKey={item.key}
                          onDelete={() => requestDelete(item)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={ClipboardList}
                  title="No work items yet"
                  description="Add the first piece of work for your product."
                />
              )}
              {canCreate &&
                (creating ? (
                  <QuickCreateItem
                    inputRef={inputRef}
                    onCreate={createItem}
                    onClose={() => {
                      setCreating(false);
                      requestAnimationFrame(() => createRef.current?.focus());
                    }}
                  />
                ) : (
                  <button
                    ref={createRef}
                    className={styles.addItem}
                    type="button"
                    onClick={startCreating}
                  >
                    <Plus size={16} aria-hidden="true" />
                    Create item
                  </button>
                ))}
            </>
          )}
        </section>
        {detail && (
          <BacklogItemDrawer
            state={detail}
            canEditContent={canCreate}
            canChangeStatus={canChangeStatus}
            canEditMetadata={project.status === "ACTIVE"}
            editing={editing}
            onEdit={changeEditMode}
            onFinishEditing={finishEditing}
            onDirty={(value) => {
              dirty.current = value;
            }}
            onBusy={(value) => {
              busy.current = value;
            }}
            onSave={saveItem}
            onDelete={() => {
              if (detail.status === "ready") requestDelete(detail.item);
            }}
            canClose={() => {
              if (busy.current) return false;
              if (dirty.current) {
                setPendingAction(() => closeDetails);
                return false;
              }
              return true;
            }}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((value) => !value)}
            onClose={closeDetails}
            onRetry={() => void openItem(detail.id)}
          />
        )}
      </div>
      {pendingAction && (
        <BacklogConfirmation
          title="Discard changes?"
          confirmLabel="Discard changes"
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            const action = pendingAction;
            dirty.current = false;
            setEditing(null);
            setPendingAction(null);
            action();
          }}
        >
          <p>Your unsaved changes will be lost.</p>
        </BacklogConfirmation>
      )}
      {deleting && (
        <BacklogConfirmation
          title={`Delete ${deleting.key}?`}
          confirmLabel="Delete item"
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => {
            if (!busy.current) setDeleting(null);
          }}
          onConfirm={() => void deleteItem()}
        >
          <p className={styles.deleteItemTitle}>{deleting.title}</p>
          <p>
            This work item and its subtasks will be hidden. You cannot restore
            it from this app.
          </p>
        </BacklogConfirmation>
      )}
    </div>
  );
}
