"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { AppNotification } from "@/lib/notifications";

import { request } from "@/lib/api";

type State = {
  items: AppNotification[];
  loading: boolean;
  loadError: boolean;
  writeError: boolean;
  busy: boolean;
};

const initial: State = {
  items: [],
  loading: true,
  loadError: false,
  writeError: false,
  busy: false,
};
const path = "/api/notifications";
const NotificationsContext = createContext<{
  state: State;
  refresh: () => void;
  markRead: (id: string) => void;
  markAllRead: (ids: string[]) => void;
} | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initial);
  const version = useRef(0);
  const loading = useRef(false);
  const writing = useRef(false);

  const refresh = useCallback(() => {
    if (loading.current || writing.current) return;
    loading.current = true;
    const current = ++version.current;
    setState((previous) => ({ ...previous, loadError: false }));
    void request<{ items: AppNotification[] }>("GET", path).then(
      ({ items }) => {
        if (version.current !== current) return;
        loading.current = false;
        setState((previous) => ({ ...previous, items, loading: false }));
      },
      () => {
        if (version.current !== current) return;
        loading.current = false;
        setState((previous) => ({
          ...previous,
          loading: false,
          loadError: true,
        }));
      },
    );
  }, []);

  const invalidate = useCallback(() => {
    version.current++;
    loading.current = false;
  }, []);

  useEffect(() => {
    refresh();
    function refreshVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    const timer = window.setInterval(refreshVisible, 30000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
      invalidate();
    };
  }, [refresh, invalidate]);

  async function write(
    apply: () => Promise<(item: AppNotification) => AppNotification>,
  ) {
    if (writing.current) return;
    writing.current = true;
    loading.current = false;
    const current = ++version.current;
    setState((previous) => ({ ...previous, busy: true, writeError: false }));
    try {
      const update = await apply();
      if (version.current === current)
        setState((previous) => ({
          ...previous,
          items: previous.items.map(update),
        }));
    } catch {
      if (version.current === current)
        setState((previous) => ({ ...previous, writeError: true }));
    } finally {
      writing.current = false;
      if (version.current === current) {
        setState((previous) => ({ ...previous, busy: false }));
        refresh();
      }
    }
  }

  function markRead(id: string) {
    void write(async () => {
      const updated = await request<AppNotification>(
        "PATCH",
        path + "/" + encodeURIComponent(id) + "/read",
      );
      return (item) => (item.id === id ? updated : item);
    });
  }

  function markAllRead(ids: string[]) {
    if (!ids.length) return;
    void write(async () => {
      await request<void>("POST", path + "/read-all", { notificationIds: ids });
      const readAt = new Date().toISOString();
      const marked = new Set(ids);
      return (item) =>
        marked.has(item.id) && !item.readAt ? { ...item, readAt } : item;
    });
  }

  return (
    <NotificationsContext.Provider
      value={{ state, refresh, markRead, markAllRead }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("NotificationsProvider is missing");
  return value;
}
