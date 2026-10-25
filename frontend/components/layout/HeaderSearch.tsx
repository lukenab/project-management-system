"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function HeaderSearch() {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  return (
    <div
      role="search"
      className={`header-search ${expanded ? "header-search-expanded" : ""}`}
    >
      <button
        type="button"
        className="icon-button header-search-toggle"
        aria-label="Open search"
        aria-expanded={expanded}
        onClick={() => setExpanded(true)}
      >
        <Search size={18} aria-hidden="true" />
      </button>
      <label className="project-search header-search-field">
        <Search size={15} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          aria-label="Search"
          placeholder="Search"
          onKeyDown={(event) => {
            if (event.key === "Escape") setExpanded(false);
          }}
          onBlur={() => setExpanded(false)}
        />
      </label>
    </div>
  );
}
