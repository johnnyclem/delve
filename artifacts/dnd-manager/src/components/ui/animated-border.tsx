import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface AnimatedBorderProps {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
}

export function AnimatedBorder({ children, className, containerClassName }: AnimatedBorderProps) {
  return (
    <div className={cn("relative rounded-2xl p-px overflow-hidden", containerClassName)}>
      <div className="animated-border-gradient pointer-events-none" />
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
