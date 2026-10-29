"use client";

import { UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/shared/PageHeader";
import { Toast } from "@/components/shared/Toast";
import { isProjectOwner, type PreviewProject } from "@/lib/preview-data";

import styles from "./create-project.module.css";

export function ProjectOverview({ project }: { project: PreviewProject }) {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      if (sessionStorage.getItem("pms-project-created") === project.id) {
        const frame = requestAnimationFrame(() => {
          setNotice("Project created.");
          sessionStorage.removeItem("pms-project-created");
        });
        return () => cancelAnimationFrame(frame);
      }
      if (sessionStorage.getItem("pms-project-transferred") === project.id) {
        const frame = requestAnimationFrame(() => {
          setNotice("Project ownership transferred.");
          sessionStorage.removeItem("pms-project-transferred");
        });
        return () => cancelAnimationFrame(frame);
      }
    } catch {
      /* Browser storage may be unavailable. */
    }
  }, [project.id]);
  return (
    <>
      <PageHeader
        eyebrow="Project overview"
        title={project.name}
        description={project.description || "Your team's shared workspace."}
      />
      {project.id.startsWith("preview-") && isProjectOwner(project) && (
        <section className={styles.teamCard}>
          <UsersRound size={24} />
          <div>
            <h2>Set up your team</h2>
            <p>Invite members and assign Scrum roles to get started.</p>
            <Link
              className="button button-primary"
              href={`/projects/${project.id}/members`}
            >
              Manage members
            </Link>
          </div>
        </section>
      )}
      {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
    </>
  );
}
