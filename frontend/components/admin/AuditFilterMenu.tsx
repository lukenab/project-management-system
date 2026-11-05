"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import styles from "./admin.module.css";

export type FilterOption = {
  value: string;
  label: string;
  subtitle?: string;
  group?: string;
};

/**
 * A compact filter button that opens a panel. `children` replaces the option
 * list; a click on an element marked `data-filter-close` closes the panel.
 */
export function AuditFilterMenu({
  label,
  value,
  valueLabel,
  options = [],
  searchable = false,
  clearable = true,
  onSelect,
  children,
}: {
  label: string;
  value: string;
  /** Shown on the button once a value is chosen. */
  valueLabel?: string;
  options?: FilterOption[];
  searchable?: boolean;
  clearable?: boolean;
  onSelect?: (value: string) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const active = !!value;

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => trigger.current?.focus());
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    // Arrow keys change the value inside a date field.
    if ((event.target as HTMLElement).matches('input[type="date"]')) return;
    const items = [
      ...(root.current?.querySelectorAll<HTMLButtonElement>(
        "[data-filter-option]",
      ) ?? []),
    ];
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(index + step + items.length) % items.length].focus();
  }

  const term = query.trim().toLowerCase();
  const matches = options.filter((option) =>
    `${option.label} ${option.subtitle ?? ""}`.toLowerCase().includes(term),
  );
  const groups = [...new Set(matches.map((option) => option.group ?? ""))];

  return (
    <div className={styles.filterMenu} ref={root} onKeyDown={onKeyDown}>
      <div className={styles.filterPill} data-active={active || undefined}>
        <button
          ref={trigger}
          type="button"
          className={styles.filterTrigger}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => {
            setOpen((current) => !current);
            setQuery("");
          }}
        >
          <span className={styles.filterText}>
            {active && clearable
              ? `${label}: ${valueLabel}`
              : (valueLabel ?? label)}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {active && clearable && (
          <button
            type="button"
            className={styles.filterClear}
            aria-label={`Clear ${label} filter`}
            onClick={() => {
              onSelect?.("");
              trigger.current?.focus();
            }}
          >
            <X size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <div
          id={panelId}
          role="group"
          className={styles.filterPanel}
          aria-label={label}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("[data-filter-close]"))
              close();
          }}
        >
          {children ?? (
            <>
              {searchable && (
                <label className={styles.filterSearch}>
                  <Search size={14} aria-hidden="true" />
                  <input
                    autoFocus
                    type="search"
                    aria-label={`Search ${label.toLowerCase()}`}
                    placeholder="Search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
              )}
              <div className={styles.filterOptions}>
                {groups.map((group) => (
                  <div key={group} role="group" aria-label={group || label}>
                    {group && <p className={styles.filterGroup}>{group}</p>}
                    {matches
                      .filter((option) => (option.group ?? "") === group)
                      .map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={styles.filterOption}
                          data-filter-option
                          aria-pressed={value === option.value}
                          onClick={() => {
                            onSelect?.(option.value);
                            close();
                          }}
                        >
                          <span>
                            {option.label}
                            {option.subtitle && (
                              <small>{option.subtitle}</small>
                            )}
                          </span>
                          {value === option.value && (
                            <Check size={14} aria-hidden="true" />
                          )}
                        </button>
                      ))}
                  </div>
                ))}
                {!matches.length && (
                  <p className={styles.filterNone}>No matches.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
