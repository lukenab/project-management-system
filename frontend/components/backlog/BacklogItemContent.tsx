"use client";

import { useEffect, useRef, useState } from "react";

import type { BacklogItem } from "@/lib/backlog-items";
import type { PreviewMetadataChanges } from "@/lib/preview-backlog-metadata";

import { backlogErrorMessage } from "@/lib/backlog-items";
import {
  getPreviewBacklogMetadata,
  updatePreviewBacklogMetadata,
} from "@/lib/preview-backlog-metadata";

import styles from "./backlog.module.css";
import { BacklogItemMetadata } from "./BacklogItemMetadata";
import { WorkTypeIcon } from "./WorkTypeIcon";

export function BacklogItemContent({
  item,
  canEditDescription,
  canEditMetadata,
  onSaveDescription,
}: {
  item: BacklogItem;
  canEditDescription: boolean;
  canEditMetadata: boolean;
  onSaveDescription: (id: string, description: string) => Promise<void>;
}) {
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
      <h2>{item.title}</h2>
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
      <div className={styles.detailColumns}>
        <div className={styles.narrative}>
          <DescriptionEditor
            item={item}
            editable={canEditDescription}
            onSave={onSaveDescription}
          />
          <section className={styles.detailSection}>
            <h3>Acceptance criteria</h3>
            <p
              className={
                !item.acceptanceCriteria ? styles.placeholder : undefined
              }
            >
              {item.acceptanceCriteria || "No acceptance criteria added."}
            </p>
          </section>
        </div>
        <BacklogItemMetadata
          item={item}
          value={metadata}
          editable={canEditMetadata}
          onSave={saveMetadata}
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

function DescriptionEditor({
  item,
  editable,
  onSave,
}: {
  item: BacklogItem;
  editable: boolean;
  onSave: (id: string, description: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function finish() {
    setEditing(false);
    setError("");
    requestAnimationFrame(() => trigger.current?.focus());
  }
  async function save() {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(item.id, draft);
      finish();
    } catch (cause) {
      setError(
        backlogErrorMessage(
          cause,
          "Couldn’t save the description. Please try again.",
        ),
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  return (
    <section className={styles.detailSection}>
      <div className={styles.sectionHeading}>
        <h3>Description</h3>
        {editable && !editing && (
          <button
            ref={trigger}
            type="button"
            className={styles.editButton}
            aria-label="Edit description"
            onClick={() => {
              setDraft(item.description ?? "");
              setError("");
              setEditing(true);
            }}
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <form
          className={styles.inlineEditor}
          aria-label="Edit description"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              if (!submitting.current) finish();
            }
          }}
        >
          <label className="sr-only" htmlFor={`description-${item.id}`}>
            Description
          </label>
          <textarea
            id={`description-${item.id}`}
            autoFocus
            rows={7}
            value={draft}
            readOnly={saving}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Describe what needs to be done…"
          />
          {error && (
            <p className={styles.editorError} role="alert">
              {error}
            </p>
          )}
          <div className={styles.editorActions}>
            <button
              className="button button-primary"
              type="submit"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className={styles.editButton}
              disabled={saving}
              onClick={finish}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className={!item.description ? styles.placeholder : undefined}>
          {item.description || "No description added."}
        </p>
      )}
    </section>
  );
}
