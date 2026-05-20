import { useState, useEffect, useRef, useCallback } from "react";
import { RotateCcw, X } from "lucide-react";
import { useReorderHint } from "@/hooks/use-reorder-hint";
import { navItem, type NavId } from "./nav-utils";
import type { TriadGroup } from "@/components/triad-tab-bar";

const SHORTCUT_HINT_KEY = "delve:triad-shortcut-hint-dismissed";
const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 8;

function ShortcutHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SHORTCUT_HINT_KEY) === "1") return;
      const isDesktop = window.matchMedia("(min-width: 768px) and (pointer: fine)").matches;
      if (isDesktop) setVisible(true);
    } catch { /* ignore */ }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { sessionStorage.setItem(SHORTCUT_HINT_KEY, "1"); } catch { /* ignore */ }
  };

  if (!visible) return null;

  return (
    <div
      className="hidden md:flex items-center gap-2 pl-3 text-[11px] text-muted-foreground shrink-0"
      data-testid="hint-keyboard-shortcuts"
    >
      <span>
        Press{" "}
        <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 font-mono text-[10px] text-foreground">1</kbd>
        {" "}
        <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 font-mono text-[10px] text-foreground">2</kbd>
        {" "}
        <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 font-mono text-[10px] text-foreground">3</kbd>
        {" "}to switch
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss keyboard shortcut hint"
        className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
        data-testid="button-dismiss-shortcut-hint"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function ReorderHint({ dismissed }: { dismissed: boolean }) {
  const { visible, dismiss } = useReorderHint(dismissed);

  if (!visible) return null;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-40 flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] shadow-lg pointer-events-auto animate-in fade-in slide-in-from-top-1"
      role="status"
      data-testid="hint-subnav-reorder"
    >
      <span
        className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-primary"
        aria-hidden="true"
      />
      <span>Tip: long-press or drag to reorder</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss reorder hint"
        className="p-0.5 rounded hover:bg-primary-foreground/10 transition-colors"
        data-testid="button-dismiss-reorder-hint"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

interface SubNavStripProps {
  group: TriadGroup;
  items: NavId[];
  pinnedItems: NavId[];
  activeTab: NavId;
  onSelect: (id: NavId) => void;
  newRecapCount: number;
  upcomingDeliveryFailureCount: number;
  hasCustomOrder: boolean;
  onReorder: (group: TriadGroup, nextReorderable: NavId[]) => void;
  onReset: (group: TriadGroup) => void;
}

export function SubNavStrip({
  group,
  items: defaultItems,
  pinnedItems,
  activeTab,
  onSelect,
  newRecapCount,
  upcomingDeliveryFailureCount,
  hasCustomOrder,
  onReorder,
  onReset,
}: SubNavStripProps) {
  const [workingOrder, setWorkingOrder] = useState<NavId[]>(defaultItems);
  useEffect(() => { setWorkingOrder(defaultItems); }, [defaultItems]);

  const [draggingId, setDraggingId] = useState<NavId | null>(null);
  const [reorderedOnce, setReorderedOnce] = useState(false);
  const itemRefs = useRef<Map<NavId, HTMLButtonElement | null>>(new Map());
  const longPressTimer = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const armedId = useRef<NavId | null>(null);
  const suppressClick = useRef<NavId | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    armedId.current = null;
    pointerStart.current = null;
  };

  const isReorderable = useCallback(
    (id: NavId) => !pinnedItems.includes(id),
    [pinnedItems],
  );

  const moveItem = useCallback((from: NavId, to: NavId) => {
    if (from === to) return;
    if (!isReorderable(from) || !isReorderable(to)) return;
    setWorkingOrder((prev) => {
      const reorderable = prev.filter((id) => isReorderable(id));
      const fromIdx = reorderable.indexOf(from);
      const toIdx = reorderable.indexOf(to);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = reorderable.slice();
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      const pinnedTail = prev.filter((id) => !isReorderable(id));
      return [...next, ...pinnedTail];
    });
  }, [isReorderable]);

  const findItemAt = (clientX: number, clientY: number): NavId | null => {
    for (const [id, el] of itemRefs.current) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return id;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, id: NavId) => {
    if (!isReorderable(id)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    armedId.current = id;
    const targetEl = e.currentTarget;
    const pointerId = e.pointerId;
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      if (armedId.current !== id) return;
      try { targetEl.setPointerCapture(pointerId); } catch { /* ignore */ }
      setDraggingId(id);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>, id: NavId) => {
    if (draggingId) {
      const overId = findItemAt(e.clientX, e.clientY);
      if (overId && isReorderable(overId)) {
        moveItem(draggingId, overId);
      }
      return;
    }
    if (pointerStart.current && armedId.current === id) {
      const dx = e.clientX - pointerStart.current.x;
      const dy = e.clientY - pointerStart.current.y;
      if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX) {
        clearLongPress();
      }
    }
  };

  const finishDrag = () => {
    if (draggingId) {
      suppressClick.current = draggingId;
      const reorderable = workingOrder.filter((wId) => isReorderable(wId));
      onReorder(group, reorderable);
      setDraggingId(null);
      setReorderedOnce(true);
    }
    clearLongPress();
  };

  const handlePointerUp = () => { finishDrag(); };
  const handlePointerCancel = () => {
    if (draggingId) setDraggingId(null);
    clearLongPress();
  };

  const handleClick = (id: NavId) => {
    if (suppressClick.current === id) {
      suppressClick.current = null;
      return;
    }
    onSelect(id);
  };

  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>, id: NavId) => {
    if (!isReorderable(id)) { e.preventDefault(); return; }
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch { /* ignore */ }
  };

  const handleDragOver = (e: React.DragEvent<HTMLButtonElement>, id: NavId) => {
    if (!draggingId || !isReorderable(id)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    moveItem(draggingId, id);
  };

  const handleDragEnd = () => {
    if (draggingId) {
      const reorderable = workingOrder.filter((wId) => isReorderable(wId));
      onReorder(group, reorderable);
      setDraggingId(null);
      setReorderedOnce(true);
    }
  };

  const renderItems = workingOrder;

  return (
    <div className="sticky top-[53px] z-30 bg-background/95 backdrop-blur-sm border-b border-border/40 relative">
      <ReorderHint dismissed={reorderedOnce || hasCustomOrder} />
      <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-none max-w-5xl mx-auto">
        {renderItems.map((id) => {
          const item = navItem(id);
          const isActive = activeTab === id;
          const Icon = item.icon;
          const hasRecapBadge = id === "sessions" && newRecapCount > 0;
          const hasFailureBadge = id === "calendar" && upcomingDeliveryFailureCount > 0;
          const badgeCount = hasRecapBadge ? newRecapCount : upcomingDeliveryFailureCount;
          const badgeColor = hasRecapBadge ? "bg-amber-500 text-black" : "bg-red-500 text-white";
          const reorderable = isReorderable(id);
          const isDragging = draggingId === id;

          return (
            <button
              key={id}
              ref={(el) => { itemRefs.current.set(id, el); }}
              draggable={reorderable}
              onDragStart={(e) => handleDragStart(e, id)}
              onDragOver={(e) => handleDragOver(e, id)}
              onDragEnd={handleDragEnd}
              onPointerDown={(e) => handlePointerDown(e, id)}
              onPointerMove={(e) => handlePointerMove(e, id)}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onClick={() => handleClick(id)}
              data-testid={`nav-${id}`}
              style={{ touchAction: draggingId ? "none" : "manipulation" }}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 select-none ${
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              } ${isDragging ? "opacity-60 ring-2 ring-primary/40 scale-105" : ""} ${reorderable ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
              {hasRecapBadge && (
                <>
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-1 py-0.5 text-[9px] font-bold leading-none min-w-[15px] ${badgeColor}`}
                    data-testid="badge-new-recap-count"
                  >
                    {badgeCount}
                  </span>
                  <span className="hidden" data-testid="badge-new-recap-count-mobile" aria-hidden="true" />
                </>
              )}
              {hasFailureBadge && (
                <>
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-1 py-0.5 text-[9px] font-bold leading-none min-w-[15px] ${badgeColor}`}
                    data-testid="badge-delivery-failure-count"
                    title={`${badgeCount} upcoming session${badgeCount === 1 ? "" : "s"} with invite delivery failures`}
                  >
                    {badgeCount}
                  </span>
                  <span className="hidden" data-testid="badge-delivery-failure-count-mobile" aria-hidden="true" />
                </>
              )}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {hasCustomOrder && (
            <button
              type="button"
              onClick={() => onReset(group)}
              data-testid={`button-reset-subnav-order-${group}`}
              title="Reset to default order"
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}
          <ShortcutHint />
        </div>
      </div>
    </div>
  );
}
