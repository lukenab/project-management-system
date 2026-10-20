"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const storageKey = "pms-appearance";
const themeEvent = "pms-appearance-change";
let memoryTheme: Theme = "light";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(themeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(themeEvent, callback);
  };
}

function getSnapshot(): Theme {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved === "dark" || saved === "light" ? saved : memoryTheme;
  } catch {
    return memoryTheme;
  }
}

function getServerSnapshot(): Theme {
  return "light";
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggleTheme() {
    memoryTheme = theme === "light" ? "dark" : "light";
    try {
      window.localStorage.setItem(storageKey, memoryTheme);
    } catch {
      // Keep the toggle functional when storage is unavailable.
    }
    window.dispatchEvent(new Event(themeEvent));
  }

  return { theme, toggleTheme };
}
