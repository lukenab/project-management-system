"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { PreviewProject } from "@/lib/preview-data";

import { DropdownMenu } from "@/components/shared/DropdownMenu";
import { projectHref, projectNavigation } from "@/config/navigation";

import styles from "./project-navigation.module.css";

export function ProjectNavigation({
  project,
  pathname,
}: {
  project: PreviewProject;
  pathname: string;
}) {
  const activeIndex = Math.max(
    0,
    projectNavigation.findIndex(({ segment }) => {
      const href = projectHref(project.id, segment);
      return (
        pathname === href || (segment !== "" && pathname.startsWith(`${href}/`))
      );
    }),
  );
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fitted, setFitted] = useState<number[]>([activeIndex]);

  useEffect(() => {
    const nav = navRef.current;
    const measurement = measureRef.current;
    if (!nav || !measurement) return;
    let frame = 0;
    let active = true;
    function measure() {
      if (!active || !nav || !measurement || nav.clientWidth === 0) return;
      const widths = Array.from(
        measurement.children,
        (element) => element.getBoundingClientRect().width,
      );
      const tabWidths = widths.slice(0, projectNavigation.length);
      const gap = parseFloat(getComputedStyle(nav).columnGap) || 0;
      const available = nav.clientWidth;
      let next = Array.from(projectNavigation.keys());
      if (
        tabWidths.reduce((sum, width) => sum + width, 0) +
          gap * (tabWidths.length - 1) >
        available
      ) {
        // Reserve the active tab and More, then fill spare space in menu order.
        next = [activeIndex];
        let used =
          tabWidths[activeIndex] + gap + widths[projectNavigation.length];
        for (let index = 0; index < tabWidths.length; index += 1) {
          if (
            index !== activeIndex &&
            used + gap + tabWidths[index] <= available
          ) {
            next.push(index);
            used += gap + tabWidths[index];
          }
        }
        next.sort((a, b) => a - b);
      }
      setFitted((previous) =>
        previous.join(",") === next.join(",") ? previous : next,
      );
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(nav);
    observer.observe(measurement);
    document.fonts.ready.then(schedule);
    schedule();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeIndex]);

  const visible = fitted.includes(activeIndex) ? fitted : [activeIndex];
  const hidden = projectNavigation.filter(
    ({ segment }) =>
      !visible.some((index) => projectNavigation[index].segment === segment),
  );
  return (
    <nav
      ref={navRef}
      className={`project-workspace-nav ${styles.navigation}`}
      aria-label={`${project.name} views`}
    >
      <div className={styles.tabs}>
        {projectNavigation.map(({ label, segment, icon: Icon }, index) => {
          if (!visible.includes(index)) return null;
          const href = projectHref(project.id, segment);
          const active =
            pathname === href ||
            (segment !== "" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={segment}
              className={styles.tab}
              href={href}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
        {hidden.length > 0 && (
          <DropdownMenu
            key={hidden.map(({ segment }) => segment).join(",")}
            label="More project views"
            triggerLabel={`More project views, ${hidden.length} additional views`}
            triggerClassName={styles.more}
            trigger={
              <>
                <span>More</span>
                <span className={styles.count}>{hidden.length}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </>
            }
            groups={[
              hidden.map(({ label, segment, icon }) => ({
                label,
                href: projectHref(project.id, segment),
                icon,
              })),
            ]}
            className={styles.overflowMenu}
          />
        )}
      </div>
      <div
        ref={measureRef}
        className={styles.measurement}
        aria-hidden="true"
        inert
      >
        {projectNavigation.map(({ label, segment, icon: Icon }) => (
          <span className={styles.tab} key={segment}>
            <Icon size={15} />
            <span>{label}</span>
          </span>
        ))}
        <span className={styles.more}>
          <span>More</span>
          <span className={styles.count}>{projectNavigation.length}</span>
          <ChevronDown size={14} />
        </span>
      </div>
    </nav>
  );
}
