"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import type { PreviewProject } from "@/lib/preview-data";
import type { SprintDetail, SprintSummary } from "@/lib/sprints";

import { BacklogLoading } from "@/components/backlog/BacklogLoading";
import { projectHref } from "@/config/navigation";
import { previewSprintRepository as repository } from "@/lib/preview-sprints";
import {
  SprintDataError,
  fromDateInput,
  sprintDateError,
  sprintErrorMessage,
  suggestSprintName,
  toDateInput,
} from "@/lib/sprints";

import styles from "./sprints.module.css";

type Loaded = { sprints: SprintSummary[]; sprint: SprintDetail | null };

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: Loaded }
  | { status: "error"; message: string; missing: boolean };

type Values = { name: string; goal: string; start: string; end: string };

function initialValues({ sprints, sprint }: Loaded): Values {
  if (sprint)
    return {
      name: sprint.name,
      goal: sprint.goal ?? "",
      start: sprint.plannedStartAt ? toDateInput(sprint.plannedStartAt) : "",
      end: sprint.plannedEndAt ? toDateInput(sprint.plannedEndAt) : "",
    };
  return { name: suggestSprintName(sprints), goal: "", start: "", end: "" };
}

function RequiredMark() {
  return (
    <span className={styles.required} aria-hidden="true">
      *
    </span>
  );
}

/** New Sprint and Edit Sprint share this form; Work Items are assigned elsewhere. */
export function SprintForm({
  project,
  sprintId,
}: {
  project: PreviewProject;
  sprintId?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [values, setValues] = useState<Values | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const canManage =
    project.status === "ACTIVE" && project.scrumRole === "Product Owner";
  const editing = Boolean(sprintId);
  const listHref = projectHref(project.id, "sprints");
  const detailHref = sprintId
    ? projectHref(project.id, `sprints/${sprintId}`)
    : listHref;
  const title = editing ? "Edit Sprint" : "New Sprint";

  useEffect(() => {
    let active = true;
    Promise.all([
      repository.list(project.id),
      sprintId ? repository.get(project.id, sprintId) : Promise.resolve(null),
    ]).then(
      ([sprints, sprint]) => {
        if (!active) return;
        const data = { sprints, sprint };
        setState({ status: "ready", data });
        setValues(initialValues(data));
        setNameTouched(false);
        setError("");
      },
      (cause) => {
        if (active)
          setState({
            status: "error",
            missing:
              cause instanceof SprintDataError && cause.code === "NOT_FOUND",
            message: sprintErrorMessage(cause, "Please try again."),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [project.id, sprintId, attempt]);

  const sprintName =
    state.status === "ready" ? state.data.sprint?.name : undefined;
  function frame(body: ReactNode) {
    return (
      <div className={styles.formPage}>
        <Link className={styles.back} href={detailHref}>
          <ArrowLeft size={15} aria-hidden="true" />
          {editing ? (sprintName ?? "Sprint") : "Sprints"}
        </Link>
        <h1 className={styles.formTitle}>{title}</h1>
        {body}
      </div>
    );
  }

  function notice(heading: string, text: string, href: string, action: string) {
    return frame(
      <div className={styles.notice} role="status">
        <h2>{heading}</h2>
        <p>{text}</p>
        <Link className={`button ${styles.secondary}`} href={href}>
          {action}
        </Link>
      </div>,
    );
  }

  if (!canManage)
    return notice(
      "Only the Product Owner can create Sprints",
      project.status === "ACTIVE"
        ? "You can view Sprints and their Work Items."
        : "This project is archived and read-only.",
      listHref,
      "Back to Sprints",
    );

  if (state.status === "error")
    return state.missing
      ? notice(
          "Sprint not found",
          "It may have been deleted, or the link is incorrect.",
          listHref,
          "Back to Sprints",
        )
      : frame(
          <div className={styles.notice} role="alert">
            <h2>Couldn’t load the Sprint</h2>
            <p>{state.message}</p>
            <button
              type="button"
              className={`button ${styles.secondary}`}
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>,
        );

  if (state.status === "loading" || !values)
    return frame(<BacklogLoading label="Loading Sprint…" rows={2} />);

  const running = state.data.sprint?.status === "ACTIVE";
  if (state.data.sprint && state.data.sprint.status !== "DRAFT" && !running)
    return notice(
      "This Sprint can no longer be edited",
      "Closed Sprints are read-only.",
      detailHref,
      "Back to Sprint",
    );

  const form = values;
  const trimmedName = form.name.trim();
  const nameError = !trimmedName
    ? "Enter a Sprint name."
    : state.data.sprints.some(
          (sprint) =>
            sprint.id !== sprintId &&
            sprint.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase(),
        )
      ? "Another Sprint in this project already uses this name."
      : null;
  const showNameError = nameTouched && nameError;
  const dateError =
    running && !form.end
      ? "An active Sprint needs an end date."
      : sprintDateError(
          form.start ? fromDateInput(form.start) : null,
          form.end ? fromDateInput(form.end) : null,
        );

  function update(changes: Partial<Values>) {
    setValues((current) => (current ? { ...current, ...changes } : current));
  }

  async function submit() {
    if (submitting.current) return;
    if (nameError) {
      setNameTouched(true);
      nameRef.current?.focus();
      return;
    }
    if (dateError) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    const input = {
      name: trimmedName,
      goal: form.goal.trim() || null,
      plannedStartAt: form.start ? fromDateInput(form.start) : null,
      plannedEndAt: form.end ? fromDateInput(form.end) : null,
    };
    try {
      const sprint = sprintId
        ? await repository.update(project.id, sprintId, input)
        : await repository.create(project.id, input);
      router.push(projectHref(project.id, `sprints/${sprint.id}`));
    } catch (cause) {
      setError(
        sprintErrorMessage(
          cause,
          "Couldn’t save the Sprint. Please try again.",
        ),
      );
    } finally {
      // Next keeps visited routes mounted, so reset even after a successful save.
      submitting.current = false;
      setSaving(false);
    }
  }

  return frame(
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className={styles.field}>
        <label htmlFor={`${ids}-name`}>
          Sprint Name <RequiredMark />
        </label>
        <input
          id={`${ids}-name`}
          ref={nameRef}
          value={form.name}
          required
          maxLength={120}
          disabled={saving}
          aria-invalid={Boolean(showNameError) || undefined}
          aria-describedby={showNameError ? `${ids}-name-error` : undefined}
          onChange={(event) => update({ name: event.target.value })}
          onBlur={() => setNameTouched(true)}
        />
        {showNameError && (
          <p id={`${ids}-name-error`} className={styles.error}>
            {nameError}
          </p>
        )}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${ids}-start`}>Start date</label>
        <input
          id={`${ids}-start`}
          type="date"
          value={form.start}
          disabled={saving || running}
          aria-invalid={Boolean(dateError) || undefined}
          aria-describedby={`${ids}-dates`}
          onChange={(event) => update({ start: event.target.value })}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${ids}-end`}>
          End date {running && <RequiredMark />}
        </label>
        <input
          id={`${ids}-end`}
          type="date"
          value={form.end}
          disabled={saving}
          aria-invalid={Boolean(dateError) || undefined}
          aria-describedby={`${ids}-dates`}
          onChange={(event) => update({ end: event.target.value })}
        />
        <p
          id={`${ids}-dates`}
          className={dateError ? styles.error : styles.hint}
          aria-live="polite"
        >
          {dateError ??
            (running
              ? "The start date is fixed while the Sprint runs. Move the end date to extend or shorten it, up to one month from the start."
              : "Dates can wait until the Sprint starts. A Sprint lasts at most one month and cannot overlap another open Sprint.")}
        </p>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${ids}-goal`}>Sprint Goal</label>
        <textarea
          id={`${ids}-goal`}
          value={form.goal}
          disabled={saving}
          placeholder="What the Sprint should achieve for customers"
          onChange={(event) => update({ goal: event.target.value })}
        />
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.formActions}>
        <button
          type="submit"
          className="button button-primary"
          disabled={saving || Boolean(dateError)}
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Create Sprint"}
        </button>
        <Link
          className={`button ${styles.secondary}`}
          href={detailHref}
          aria-disabled={saving || undefined}
        >
          Cancel
        </Link>
      </div>
    </form>,
  );
}
