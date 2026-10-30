"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { PreviewProject } from "@/lib/preview-data";

import { MemberDialog } from "@/components/members/MemberDialog";
import { projectHref } from "@/config/navigation";
import {
  archivePreviewProject,
  ProjectArchiveError,
} from "@/lib/preview-projects";
import { previewSprintRepository } from "@/lib/preview-sprints";

export function ArchiveProjectDialog({
  project,
  onClose,
  onArchived,
}: {
  project: PreviewProject;
  onClose: () => void;
  onArchived: (project: PreviewProject) => void;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [activeSprintId, setActiveSprintId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    previewSprintRepository.list(project.id).then(
      (sprints) => {
        if (active) {
          setActiveSprintId(
            sprints.find((sprint) => sprint.status === "ACTIVE")?.id ?? null,
          );
          setChecking(false);
        }
      },
      () => {
        if (active) {
          setError("Couldn't check the project's sprints. Please try again.");
          setChecking(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [project.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checking || saving.current) return;
    if (activeSprintId) {
      onClose();
      router.push(projectHref(project.id, `sprints/${activeSprintId}`));
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await archivePreviewProject(project.id);
      onArchived(updated);
    } catch (cause) {
      if (cause instanceof ProjectArchiveError)
        setActiveSprintId(cause.sprintId);
      else
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn't archive the project. Please try again.",
        );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <MemberDialog
      title={
        activeSprintId ? "Complete the active sprint first" : "Archive project?"
      }
      description={
        activeSprintId ? (
          <>
            <strong>{project.name}</strong> has an active sprint. Complete it
            before archiving this project.
          </>
        ) : (
          <>
            Archive <strong>{project.name}</strong>? Members will still be able
            to view the project, but no further changes can be made.
          </>
        )
      }
      busy={busy}
      error={error}
      confirmLabel={
        checking
          ? "Checking…"
          : activeSprintId
            ? "View sprint"
            : "Archive project"
      }
      confirmDisabled={checking}
      busyLabel="Archiving…"
      cancelLabel={activeSprintId ? "Close" : "Cancel"}
      destructive={!activeSprintId}
      onSubmit={(event) => {
        void submit(event);
      }}
      onClose={() => {
        if (!saving.current) onClose();
      }}
    />
  );
}
