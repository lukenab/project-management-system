"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import type { ScrumAccountability } from "@/lib/preview-project-members";

import { scrumRoles } from "@/lib/preview-project-members";

import styles from "./members.module.css";

const descriptions: Record<ScrumAccountability, string> = {
  PRODUCT_OWNER: "Manage and prioritize work, and plan sprints.",
  SCRUM_MASTER: "Support the team and facilitate Scrum practices.",
  DEVELOPER: "Work on items and subtasks, and update progress.",
};

export function MemberRoleDropdown({
  name,
  value,
  disabled,
  onSelect,
}: {
  name: string;
  value: ScrumAccountability | null;
  disabled: boolean;
  onSelect: (value: ScrumAccountability) => void;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  function position() {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12))}px`;
    menu.style.top = `${rect.bottom + 6 + menu.offsetHeight > window.innerHeight - 12 ? Math.max(12, rect.top - menu.offsetHeight - 6) : rect.bottom + 6}px`;
  }

  useEffect(() => {
    if (!open) return;
    const close = () => menuRef.current?.hidePopover();
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function close() {
    menuRef.current?.hidePopover();
    triggerRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]',
      ) ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = (index + 1) % items.length;
        break;
      case "ArrowUp":
        next = (index - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      case "Escape":
        close();
        event.preventDefault();
        return;
      case "Tab":
        close();
        return;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.roleTrigger}
        popoverTarget={id}
        disabled={disabled}
        aria-label={`Change Scrum role for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
      >
        <span>{value ? scrumRoles[value] : "None"}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      <div
        ref={menuRef}
        id={id}
        popover="auto"
        role="menu"
        aria-label={`Scrum role for ${name}`}
        className={styles.roleMenu}
        onKeyDown={onKeyDown}
        onBeforeToggle={(event) => {
          if (event.newState === "open") position();
        }}
        onToggle={(event) => {
          const isOpen = event.newState === "open";
          setOpen(isOpen);
          if (!isOpen) return;
          position();
          (
            menuRef.current?.querySelector<HTMLButtonElement>(
              '[aria-checked="true"]',
            ) ?? menuRef.current?.querySelector<HTMLButtonElement>("button")
          )?.focus();
        }}
      >
        <div className={styles.roleMenuHeading}>Change Scrum role</div>
        {Object.entries(scrumRoles).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="menuitemradio"
            aria-checked={value === key}
            tabIndex={-1}
            disabled={disabled}
            className={styles.roleOption}
            onClick={() => {
              close();
              if (key !== value) onSelect(key as ScrumAccountability);
            }}
          >
            <span className={styles.roleCheck}>
              {value === key && <Check size={15} aria-hidden="true" />}
            </span>
            <span>
              <span className={styles.roleLabel}>{label}</span>
              <span className={styles.roleDescription}>
                {descriptions[key as ScrumAccountability]}
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
