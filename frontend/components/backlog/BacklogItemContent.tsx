"use client";

import { useEffect, useRef, useState } from "react";

import type { ProjectMember } from "@/lib/preview-project-members";
import type { PreviewMetadataChanges } from "@/lib/preview-work-items";
import type { WorkItem, UpdateWorkItemInput } from "@/lib/work-items";

import {
  getPreviewWorkItemMetadata,
  updatePreviewWorkItemMetadata,
} from "@/lib/preview-work-items";
import { relativeTime } from "@/lib/relative-time";

import styles from "./backlog.module.css";
import { BacklogActivity } from "./BacklogActivity";
import { BacklogItemEditor, type BacklogEditMode } from "./BacklogItemEditor";
import { BacklogItemMetadata } from "./BacklogItemMetadata";
import { BacklogItemStatus } from "./BacklogItemStatus";
import { BacklogPriority } from "./BacklogPriority";
import { BacklogPriorityEditor } from "./BacklogPriorityEditor";
import { BacklogSubtasks } from "./BacklogSubtasks";
import { WorkTypeIcon } from "./WorkTypeIcon";

export function BacklogItemContent({
  item,
  liveMembers,
  archived,
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
  item: WorkItem;
  liveMembers?: ProjectMember[];
  archived: boolean;
  canEditContent: boolean;
  canChangeStatus: boolean;
  editing: BacklogEditMode | null;
  onEdit: (mode: BacklogEditMode) => void;
  onFinishEditing: (restoreFocus?: boolean) => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  canEditMetadata: boolean;
  onSave: (id: string, changes: UpdateWorkItemInput) => Promise<void>;
}) {
  const priorityTriggers = useRef<
    Partial<Record<"Priority", HTMLButtonElement | null>>
  >({});
  const [previewMetadata, setMetadata] = useState(() =>
    liveMembers ? null : getPreviewWorkItemMetadata(item),
  );
  const metadata = previewMetadata ?? {
    createdBy:
      liveMembers?.find((member) => member.userId === item.createdBy) ?? null,
    assigneeId: item.assigneeId,
    sprintId: item.sprint?.id ?? null,
    startDate: item.startDate,
    dueDate: item.dueDate,
  };
  const [subtaskRevision, setSubtaskRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  // The editor and the comment box each report unsaved text to the same guard.
  const editorDirty = useRef(false);
  const commentDirty = useRef(false);
  function reportDirty() {
    onDirty(editorDirty.current || commentDirty.current);
  }
  async function saveMetadata(changes: PreviewMetadataChanges) {
    if (liveMembers) await onSave(item.id, changes);
    else setMetadata(updatePreviewWorkItemMetadata(item, changes));
  }
  return (
    <div className={styles.drawerBody}>
      <div className={styles.itemIdentity}>
        <WorkTypeIcon workType={item.workType} />
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
              onDirty={(dirty) => {
                editorDirty.current = dirty;
                reportDirty();
              }}
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
          {(!liveMembers || !item.parentId) && (
            <BacklogSubtasks
              item={item}
              liveMembers={liveMembers}
              editable={canChangeStatus}
              onBusy={onBusy}
              onChanged={
                liveMembers
                  ? () => setSubtaskRevision((value) => value + 1)
                  : undefined
              }
            />
          )}
          <BacklogActivity
            item={item}
            now={now}
            archived={archived}
            onBusy={onBusy}
            subtaskRevision={subtaskRevision}
            onDraftChange={(dirty) => {
              commentDirty.current = dirty;
              reportDirty();
            }}
          />
        </div>
        <BacklogItemMetadata
          item={item}
          value={metadata}
          liveMembers={liveMembers}
          editable={canEditMetadata && canChangeStatus}
          canSelectSprint={
            canEditMetadata && (canEditContent || canChangeStatus)
          }
          onSave={saveMetadata}
          onBusy={onBusy}
          onEditDescription={
            canEditContent ? () => onEdit("content") : undefined
          }
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
