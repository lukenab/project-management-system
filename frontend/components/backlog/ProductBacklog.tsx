"use client";

import { ClipboardList, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { BacklogItem } from "@/lib/backlog-items";
import type { PreviewProject } from "@/lib/preview-data";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Toast } from "@/components/shared/Toast";
import { BacklogDataError, backlogErrorMessage } from "@/lib/backlog-items";
import { previewBacklogRepository as repository } from "@/lib/preview-backlog-items";

import type { BacklogDetailState } from "./BacklogItemDrawer";

import styles from "./backlog.module.css";
import { BacklogItemDrawer } from "./BacklogItemDrawer";
import { BacklogLoading } from "./BacklogLoading";
import { BacklogPriority } from "./BacklogPriority";
import { QuickCreateItem } from "./QuickCreateItem";
import { WorkTypeIcon } from "./WorkTypeIcon";

type BacklogListState =
  | { status: "loading" }
  | { status: "ready"; items: BacklogItem[] }
  | { status: "error"; message: string };

export function ProductBacklog({ project }: { project: PreviewProject }) {
  const [list, setList] = useState<BacklogListState>({ status: "loading" });
  const [listAttempt, setListAttempt] = useState(0);
  const [detail, setDetail] = useState<BacklogDetailState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<BacklogItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const detailRequest = useRef(0);
  const mounted = useRef(false);
  const canCreate =
    project.status === "ACTIVE" && project.scrumRole === "Product Owner";
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
            message: backlogErrorMessage(cause, "Please try again."),
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
          cause instanceof BacklogDataError && cause.code === "NOT_FOUND";
        setDetail({
          status: "error",
          id,
          missing,
          message: backlogErrorMessage(
            cause,
            "Your backlog is still available. Please try again.",
          ),
        });
      }
    }
  }

  function closeDetails() {
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
    setNotice(item);
    requestAnimationFrame(() => createRef.current?.focus());
  }

  async function saveDescription(itemId: string, description: string) {
    const item = await repository.updateDescription(
      project.id,
      itemId,
      description,
    );
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
  }

  return (
    <div
      className={`${styles.page} ${detail ? styles.docked : ""} ${detail && expanded ? styles.expanded : ""}`}
    >
      <PageHeader
        eyebrow={project.name}
        title="Product Backlog"
        description="Capture the work your product needs."
      />
      {notice && (
        <Toast
          key={notice.id}
          message={`Item ${notice.key} created.`}
          actionLabel="View item"
          onAction={() => void openItem(notice.id)}
          onDismiss={() => setNotice(null)}
          onRestoreFocus={() =>
            (createRef.current ?? inputRef.current)?.focus()
          }
        />
      )}
      {project.status === "ARCHIVED" && (
        <p className={styles.readOnlyNotice}>Archived project · Read-only</p>
      )}
      <div className={styles.workspace}>
        <section
          className={styles.list}
          ref={listRef}
          aria-label="Backlog items"
        >
          <div className={styles.listHeader}>
            <h2>
              Backlog
              {list.status === "ready" && (
                <span className={styles.count}>{list.items.length}</span>
              )}
            </h2>
            <span>Priority</span>
          </div>
          {list.status === "loading" ? (
            <BacklogLoading />
          ) : list.status === "error" ? (
            <div className={styles.listError} role="alert">
              <h2>Couldn’t load the backlog</h2>
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
                    <li key={item.id}>
                      <button
                        type="button"
                        className={styles.item}
                        data-item-id={item.id}
                        onClick={() => void openItem(item.id)}
                        aria-pressed={detail?.id === item.id}
                        aria-controls={
                          detail?.id === item.id
                            ? "backlog-item-details"
                            : undefined
                        }
                      >
                        <WorkTypeIcon itemType={item.itemType} />
                        <span className={styles.itemCopy}>
                          <span className={styles.itemKey}>{item.key}</span>
                          <span className={styles.itemTitle} title={item.title}>
                            {item.title}
                          </span>
                        </span>
                        <BacklogPriority priority={item.priority} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={ClipboardList}
                  title="No backlog items yet"
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
            canEditDescription={canCreate}
            canEditMetadata={project.status === "ACTIVE"}
            onSaveDescription={saveDescription}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((value) => !value)}
            onClose={closeDetails}
            onRetry={() => void openItem(detail.id)}
          />
        )}
      </div>
    </div>
  );
}
