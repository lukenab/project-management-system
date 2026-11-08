"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { MemberDialog } from "@/components/members/MemberDialog";
import { projectHref } from "@/config/navigation";
import { isProjectOwner, type PreviewProject } from "@/lib/preview-data";
import { leaveProject } from "@/lib/projects";
import { removeStoredProject } from "@/lib/projects-store";

import styles from "./leave-project.module.css";

export function LeaveProjectDialog({
  project,
  onClose,
  onLeft,
}: {
  project: PreviewProject;
  onClose: () => void;
  onLeft: (project: PreviewProject) => void;
}) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const owner = isProjectOwner(project);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    if (owner) {
      onClose();
      router.push(projectHref(project.id, "settings"));
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await leaveProject(project.id);
      removeStoredProject(project.id);
      onLeft(project);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't leave the project. Please try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <MemberDialog
      title={owner ? "Transfer ownership first" : `Leave ${project.name}?`}
      description={
        owner ? (
          <>
            You&apos;re the owner of <strong>{project.name}</strong>. Transfer
            ownership to another member before leaving the project.
          </>
        ) : (
          "You'll lose access to this project and its work items."
        )
      }
      busy={busy}
      error={error}
      confirmLabel={owner ? "Go to Settings" : "Leave project"}
      busyLabel="Leaving…"
      cancelLabel={owner ? "Close" : "Cancel"}
      destructive={!owner}
      onSubmit={(event) => void submit(event)}
      onClose={() => {
        if (!saving.current) onClose();
      }}
    >
      {!owner && (
        <ul className={styles.consequences}>
          <li>Your unfinished work will become unassigned.</li>
          <li>Your comments and activity stay in the project history.</li>
          <li>A Project Owner can add you again later.</li>
        </ul>
      )}
    </MemberDialog>
  );
}
