import { motion } from "framer-motion";
import { NAV_DESTINATIONS, type NavId } from "./nav";

interface BottomNavProps {
  active: NavId;
  onSelect: (id: NavId) => void;
}

/**
 * Mobile-first bottom navigation. 5 thumb-zone targets, fixed to the bottom,
 * respects iOS safe-area-inset. Replaces the 3-group Triad tab bar.
 */
export function BottomNav({ active, onSelect }: BottomNavProps) {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-2xl items-stretch">
        {NAV_DESTINATIONS.map(({ id, label, icon: Icon, badge }) => {
          const isActive = active === id;
          return (
            <motion.button
              key={id}
              type="button"
              whileTap={{ scale: 0.93 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              onClick={() => onSelect(id)}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {badge ? (
                  <span className="absolute -right-2 -top-1.5 inline-flex min-w-[15px] items-center justify-center rounded-full bg-primary px-1 py-0.5 text-[9px] font-bold leading-none text-primary-foreground">
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className="text-[10px] font-medium leading-none">{label}</span>
              {isActive ? (
                <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
              ) : null}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
