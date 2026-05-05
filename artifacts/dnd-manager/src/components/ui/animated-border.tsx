import { cn } from "@/lib/utils";
import { useEffect, useState, type ReactNode } from "react";

interface AnimatedBorderProps {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  animate?: boolean;
  interactive?: boolean;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return prefersReducedMotion;
}

export function AnimatedBorder({
  children,
  className,
  containerClassName,
  animate = true,
  interactive = false,
}: AnimatedBorderProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldAnimate = animate && !prefersReducedMotion;

  return (
    <div
      className={cn(
        "relative rounded-2xl p-px overflow-hidden",
        interactive && "animated-border-interactive group",
        containerClassName,
      )}
    >
      <div
        className={
          shouldAnimate
            ? "animated-border-gradient pointer-events-none"
            : "animated-border-static pointer-events-none"
        }
      />
      {interactive && <div className="animated-border-glow pointer-events-none" />}
      <div
        className={cn(
          "relative z-10 rounded-2xl bg-glass backdrop-blur-[20px]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
