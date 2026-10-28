"use client";

import { ChevronDown } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

import type { PreviewProject } from "@/lib/preview-data";

import { DropdownMenu } from "@/components/shared/DropdownMenu";
import { projectHref, projectNavigation } from "@/config/navigation";

import styles from "./project-navigation.module.css";

type Measurement = {
  tabs: number[];
  more: number;
  gap: number;
  available: number;
};

const allTabs = Array.from(projectNavigation.keys());

function fitTabs(measurement: Measurement | null, activeIndex: number) {
  if (!measurement) return allTabs;
  const { tabs, more, gap, available } = measurement;
  const total =
    tabs.reduce((sum, width) => sum + width, 0) + gap * (tabs.length - 1);
  if (total <= available) return allTabs;
  // Reserve the active tab and More, then fill spare space in menu order.
  const fitted = [activeIndex];
  let used = tabs[activeIndex] + gap + more;
  tabs.forEach((width, index) => {
    if (index !== activeIndex && used + gap + width <= available) {
      fitted.push(index);
      used += gap + width;
    }
  });
  return fitted.sort((a, b) => a - b);
}

function sameMeasurement(a: Measurement | null, b: Measurement) {
  return (
    a !== null &&
    a.more === b.more &&
    a.gap === b.gap &&
    a.available === b.available &&
    a.tabs.join(",") === b.tabs.join(",")
  );
}

// Colour-only hint so a slow navigation never shifts the tab layout.
function PendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      className={styles.pending}
      data-pending={pending || undefined}
      aria-hidden="true"
    />
  );
}

export function ProjectNavigation({ project }: { project: PreviewProject }) {
  const segment = useSelectedLayoutSegment() ?? "";
  const activeIndex = Math.max(
    0,
    projectNavigation.findIndex((item) => item.segment === segment),
  );
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const hidden = measureRef.current;
    if (!nav || !hidden) return;
    let frame = 0;
    function measure() {
      if (!nav || !hidden || nav.clientWidth === 0) return;
      const widths = Array.from(
        hidden.children,
        (element) => element.getBoundingClientRect().width,
      );
      const next = {
        tabs: widths.slice(0, projectNavigation.length),
        more: widths[projectNavigation.length],
        gap: parseFloat(getComputedStyle(nav).columnGap) || 0,
        available: nav.clientWidth,
      };
      setMeasurement((previous) =>
        sameMeasurement(previous, next) ? previous : next,
      );
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(nav);
    observer.observe(hidden);
    document.fonts.ready.then(schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const visible = fitTabs(measurement, activeIndex);
  const hiddenTabs = allTabs
    .filter((index) => !visible.includes(index))
    .map((index) => projectNavigation[index]);
  return (
    <nav
      ref={navRef}
      className={`project-workspace-nav ${styles.navigation}`}
      aria-label={`${project.name} views`}
    >
      <div className={styles.tabs}>
        {projectNavigation.map(({ label, segment, icon: Icon }, index) => {
          if (!visible.includes(index)) return null;
          return (
            <Link
              key={segment}
              className={styles.tab}
              href={projectHref(project.id, segment)}
              prefetch
              aria-current={index === activeIndex ? "page" : undefined}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
              <PendingHint />
            </Link>
          );
        })}
        {hiddenTabs.length > 0 && (
          <DropdownMenu
            key={hiddenTabs.map(({ segment }) => segment).join(",")}
            label="More project views"
            triggerLabel={`More project views, ${hiddenTabs.length} additional views`}
            triggerClassName={styles.more}
            trigger={
              <>
                <span>More</span>
                <span className={styles.count}>{hiddenTabs.length}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </>
            }
            groups={[
              hiddenTabs.map(({ label, segment, icon }) => ({
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
