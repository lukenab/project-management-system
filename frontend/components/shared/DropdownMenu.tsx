"use client";
import type { LucideIcon } from "lucide-react";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type DropdownItem = {
  label: string;
  href?: string;
  onSelect?: () => void;
  icon?: LucideIcon;
  tone?: "danger";
};

const VIEWPORT_MARGIN = 12;

export function DropdownMenu({
  label,
  triggerLabel,
  triggerClassName,
  trigger,
  header,
  groups,
  className = "",
}: {
  label: string;
  triggerLabel: string;
  triggerClassName: string;
  trigger: ReactNode;
  header?: ReactNode;
  groups: DropdownItem[][];
  className?: string;
}) {
  const menuId = `${useId()}-menu`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openedByPointer = useRef(false);
  const [open, setOpen] = useState(false);

  function position() {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = menu;
    const below = rect.bottom + 6;
    const top =
      below + height > window.innerHeight - VIEWPORT_MARGIN
        ? Math.max(VIEWPORT_MARGIN, rect.top - height - 6)
        : below;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.right - width, window.innerWidth - width - VIEWPORT_MARGIN),
    );
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
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

  function items() {
    return Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
  }

  function close() {
    menuRef.current?.hidePopover();
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) =>
      list[(next + list.length) % list.length]?.focus();
    switch (event.key) {
      case "ArrowDown":
        focusAt(index + 1);
        break;
      case "ArrowUp":
        focusAt(index < 0 ? list.length - 1 : index - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(list.length - 1);
        break;
      case "Escape":
      case "Tab":
        close();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        popoverTarget={menuId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={triggerLabel}
        onPointerDown={() => {
          openedByPointer.current = true;
        }}
        onKeyDown={() => {
          openedByPointer.current = false;
        }}
      >
        {trigger}
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={label}
        tabIndex={-1}
        className={`dropdown-menu ${className}`}
        onKeyDown={onMenuKeyDown}
        onBeforeToggle={(event) => {
          if (event.newState === "open") position();
        }}
        onToggle={(event) => {
          const isOpen = event.newState === "open";
          setOpen(isOpen);
          if (!isOpen) return;
          position();
          if (openedByPointer.current) menuRef.current?.focus();
          else items()[0]?.focus();
          openedByPointer.current = false;
        }}
      >
        {header}
        {groups.map((group, groupIndex) => (
          <div key={groupIndex} role="group" className="dropdown-group">
            {group.map(
              ({ label: itemLabel, href, onSelect, icon: Icon, tone }) => {
                const content = (
                  <>
                    {Icon && <Icon size={16} aria-hidden="true" />}
                    <span>{itemLabel}</span>
                  </>
                );
                const itemClass = `dropdown-item ${tone === "danger" ? "dropdown-danger" : ""}`;
                return href ? (
                  <Link
                    key={itemLabel}
                    href={href}
                    role="menuitem"
                    tabIndex={-1}
                    className={itemClass}
                    onClick={() => menuRef.current?.hidePopover()}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    key={itemLabel}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    aria-disabled={!onSelect || undefined}
                    onClick={() => {
                      if (!onSelect) return;
                      close();
                      onSelect();
                    }}
                    className={itemClass}
                  >
                    {content}
                  </button>
                );
              },
            )}
          </div>
        ))}
      </div>
    </>
  );
}
