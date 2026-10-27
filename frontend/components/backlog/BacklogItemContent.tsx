"use client";

import { useEffect, useRef, useState } from "react";

import type { BacklogItem, UpdateBacklogItemInput } from "@/lib/backlog-items";
import type { PreviewMetadataChanges } from "@/lib/preview-backlog-metadata";

import {
  getPreviewBacklogMetadata,
  updatePreviewBacklogMetadata,
} from "@/lib/preview-backlog-metadata";

import styles from "./backlog.module.css";
import { BacklogItemEditor, type BacklogEditMode } from "./BacklogItemEditor";
import { BacklogItemMetadata } from "./BacklogItemMetadata";
import { BacklogItemStatus } from "./BacklogItemStatus";
import { BacklogPriority } from "./BacklogPriority";
import { BacklogPriorityEditor } from "./BacklogPriorityEditor";
import { WorkTypeIcon } from "./WorkTypeIcon";

export function BacklogItemContent({
  item,
  canEditContent,
  canChangeStatus,
  editing,
  onEdit,
  onFinishEditing,
  onDirty,
  onBusy,
  canEditMetadata,
  onSave,
}: {
  item: BacklogItem;
  canEditContent: boolean;
  canChangeStatus: boolean;
  editing: BacklogEditMode | null;
  onEdit: (mode: BacklogEditMode) => void;
  onFinishEditing: (restoreFocus?: boolean) => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  canEditMetadata: boolean;
  onSave: (id: string, changes: UpdateBacklogItemInput) => Promise<void>;
}) {
  const priorityTriggers = useRef<
    Partial<Record<"Priority", HTMLButtonElement | null>>
  >({});
  const [metadata, setMetadata] = useState(() =>
    getPreviewBacklogMetadata(item),
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  function saveMetadata(changes: PreviewMetadataChanges) {
    setMetadata(updatePreviewBacklogMetadata(item, changes));
  }
  return (
    <div className={styles.drawerBody}>
      <div className={styles.itemIdentity}>
        <WorkTypeIcon itemType={item.itemType} />
        <span>{item.key}</span>
      </div>
      {editing !== "content" && <h2>{item.title}</h2>}
      {editing !== "content" && (
        <p className={styles.createdLine}>
          Item created{" "}
          <time
            dateTime={item.createdAt}
            title={new Date(item.createdAt).toLocaleString("en-GB", {
              timeZoneName: "short",
            })}
          >
            {relativeTime(item.createdAt, now)}
          </time>{" "}
          by <span>{metadata.createdBy?.fullName ?? "Unknown creator"}</span>
        </p>
      )}
      {editing !== "content" && (
        <BacklogItemStatus
          item={item}
          editable={canChangeStatus && !editing}
          onSave={onSave}
          onBusy={onBusy}
        />
      )}
      <div className={styles.detailColumns}>
        <div className={styles.narrative}>
          {editing === "content" ? (
            <BacklogItemEditor
              item={item}
              onSave={onSave}
              onFinish={onFinishEditing}
              onDirty={onDirty}
              onBusy={onBusy}
            />
          ) : (
            <>
              <section className={styles.detailSection}>
                <h3>Description</h3>
                <p
                  className={!item.description ? styles.placeholder : undefined}
                >
                  {item.description || "No description added."}
                </p>
              </section>
            </>
          )}
        </div>
        <BacklogItemMetadata
          item={item}
          value={metadata}
          editable={canEditMetadata}
          onSave={saveMetadata}
          fieldEditors={
            <>
              <section className={styles.metadataSection}>
                <div className={styles.sectionHeading}>
                  <h3>Priority</h3>
                  {canEditContent && (
                    <button
                      type="button"
                      className={styles.editButton}
                      aria-label="Edit priority"
                      aria-expanded={editing === "priority"}
                      ref={(element) => {
                        priorityTriggers.current.Priority = element;
                      }}
                      onClick={() => onEdit("priority")}
                    >
                      Edit
                    </button>
                  )}
                </div>
                <BacklogPriority priority={item.priority} />
                {editing === "priority" && (
                  <BacklogPriorityEditor
                    item={item}
                    triggers={priorityTriggers}
                    onSave={onSave}
                    onFinish={onFinishEditing}
                    onBusy={onBusy}
                  />
                )}
              </section>
            </>
          }
        />
      </div>
    </div>
  );
}

function relativeTime(date: string, now: number) {
  const seconds = (new Date(date).getTime() - now) / 1000;
  if (Math.abs(seconds) < 60) return "just now";
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  if (Math.abs(seconds) < 3600)
    return formatter.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400)
    return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}
