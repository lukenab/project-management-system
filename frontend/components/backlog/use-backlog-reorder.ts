import type { PointerEvent } from "react";

import { useEffect, useRef, useState } from "react";

type DropTarget = { id: string; side: "before" | "after" };
type Drag = {
  id: string;
  pointerId: number;
  startY: number;
  active: boolean;
};

export function useBacklogReorder(
  onDrop: (id: string, target: DropTarget) => void,
) {
  const drag = useRef<Drag | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);

  function reset() {
    drag.current = null;
    setDraggingId(null);
    setTarget(null);
  }

  useEffect(() => {
    function cancel(event: KeyboardEvent) {
      if (event.key !== "Escape" || !drag.current?.active) return;
      event.preventDefault();
      event.stopPropagation();
      reset();
    }
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, []);

  function targetAt(event: PointerEvent<HTMLSpanElement>, id: string) {
    const list = event.currentTarget.closest("ul");
    const row = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-reorder-id]");
    if (!row || row.parentElement !== list) return null;
    const targetId = row.dataset.reorderId;
    if (!targetId || targetId === id) return null;
    const bounds = row.getBoundingClientRect();
    return {
      id: targetId,
      side: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
    } as const;
  }

  function handleProps(id: string) {
    return {
      onPointerDown(event: PointerEvent<HTMLSpanElement>) {
        if (!event.isPrimary || event.button !== 0 || drag.current) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          id,
          pointerId: event.pointerId,
          startY: event.clientY,
          active: false,
        };
      },
      onPointerMove(event: PointerEvent<HTMLSpanElement>) {
        const current = drag.current;
        if (current?.pointerId !== event.pointerId) return;
        if (!current.active) {
          if (Math.abs(event.clientY - current.startY) < 5) return;
          current.active = true;
          setDraggingId(current.id);
        }
        setTarget(targetAt(event, current.id));
      },
      onPointerUp(event: PointerEvent<HTMLSpanElement>) {
        const current = drag.current;
        if (current?.pointerId !== event.pointerId) return;
        const destination = current.active ? targetAt(event, current.id) : null;
        reset();
        if (destination) onDrop(current.id, destination);
      },
      onPointerCancel(event: PointerEvent<HTMLSpanElement>) {
        if (drag.current?.pointerId === event.pointerId) reset();
      },
      onLostPointerCapture(event: PointerEvent<HTMLSpanElement>) {
        if (drag.current?.pointerId === event.pointerId) reset();
      },
    };
  }

  return { draggingId, target, handleProps };
}
