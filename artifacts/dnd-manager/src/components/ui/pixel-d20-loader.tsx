import { useEffect, useRef, useState } from "react";

const FACES = [20, 13, 7, 19, 3, 17, 5, 11, 14, 2, 18, 6, 15, 8, 1, 16, 4, 12, 10, 9];
const INTERVAL_MS = 110;

export interface PixelD20LoaderProps {
  className?: string;
  size?: number | string;
  "aria-label"?: string;
}

export function PixelD20Loader({
  className,
  size = "1em",
  "aria-label": ariaLabel = "Loading",
}: PixelD20LoaderProps) {
  const [faceIdx, setFaceIdx] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setFaceIdx((i) => (i + 1) % FACES.length);
    }, INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [reducedMotion]);

  const face = reducedMotion ? 20 : FACES[faceIdx];
  const isDouble = face >= 10;
  const fontSize = isDouble ? "5" : "7";
  const textY = isDouble ? "11.5" : "12";

  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      style={{ shapeRendering: "crispEdges", imageRendering: "pixelated" }}
      role="img"
      aria-label={ariaLabel}
    >
      <polygon points="8,0 15,4 15,12 8,16 1,12 1,4" />
      <polygon
        points="8,1 14,4.5 14,11.5 8,15 2,11.5 2,4.5"
        fill="none"
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="0.5"
        style={{ shapeRendering: "crispEdges" as const }}
      />
      <text
        x="8"
        y={textY}
        textAnchor="middle"
        fontFamily="'JetBrains Mono','Courier New',monospace"
        fontWeight="bold"
        fontSize={fontSize}
        fill="var(--color-background, #09090B)"
        style={{ shapeRendering: "crispEdges" as const, fontVariantNumeric: "tabular-nums" }}
      >
        {face}
      </text>
    </svg>
  );
}
