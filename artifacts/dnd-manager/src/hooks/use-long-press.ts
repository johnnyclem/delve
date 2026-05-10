import { useCallback, useRef } from "react";

export interface LongPressPosition {
  x: number;
  y: number;
}

export interface UseLongPressOptions {
  threshold?: number;
  moveThreshold?: number;
}

export interface LongPressHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useLongPress(
  callback: (position: LongPressPosition) => void,
  options: UseLongPressOptions = {},
): LongPressHandlers {
  const { threshold = 450, moveThreshold = 10 } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const suppressCtxRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  }, []);

  const fire = useCallback(
    (x: number, y: number) => {
      firedRef.current = true;
      timerRef.current = null;
      suppressCtxRef.current = true;
      setTimeout(() => {
        suppressCtxRef.current = false;
      }, 400);
      callback({ x, y });
    },
    [callback],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      firedRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => fire(e.clientX, e.clientY), threshold);
    },
    [threshold, fire],
  );

  const onMouseUp = useCallback(
    (_e: React.MouseEvent) => {
      cancel();
    },
    [cancel],
  );

  const onMouseLeave = useCallback(
    (_e: React.MouseEvent) => {
      cancel();
    },
    [cancel],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!startPosRef.current) return;
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > moveThreshold) {
        cancel();
      }
    },
    [moveThreshold, cancel],
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      firedRef.current = false;
      startPosRef.current = { x: t.clientX, y: t.clientY };
      timerRef.current = setTimeout(() => fire(t.clientX, t.clientY), threshold);
    },
    [threshold, fire],
  );

  const onTouchEnd = useCallback(
    (_e: React.TouchEvent) => {
      cancel();
    },
    [cancel],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPosRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startPosRef.current.x;
      const dy = t.clientY - startPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > moveThreshold) {
        cancel();
      }
    },
    [moveThreshold, cancel],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (suppressCtxRef.current) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      cancel();
      fire(e.clientX, e.clientY);
    },
    [cancel, fire],
  );

  return {
    onMouseDown,
    onMouseUp,
    onMouseLeave,
    onMouseMove,
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    onContextMenu,
  };
}
