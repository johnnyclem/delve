import { Library, Radio, Swords } from "lucide-react";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";

export type TriadGroup = "active" | "table" | "library";

export const TRIAD_TABS: Array<{ id: TriadGroup; label: string; icon: typeof Shield }> = [
  { id: "active", label: "Active", icon: Radio },
  { id: "table", label: "Table", icon: Swords },
  { id: "library", label: "Library", icon: Library },
];

interface TriadTabBarProps {
  activeGroup: TriadGroup;
  onSelect: (group: TriadGroup) => void;
  activeBadgeCount?: number;
}

export function TriadTabBar({ activeGroup, onSelect, activeBadgeCount = 0 }: TriadTabBarProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#09090B]/95 backdrop-blur-sm border-t border-[rgba(255,255,255,0.06)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      data-testid="nav-triad-tab-bar"
      aria-label="Main navigation"
    >
      <div className="flex items-stretch max-w-lg mx-auto md:max-w-none">
        {TRIAD_TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeGroup === id;
          const showBadge = id === "active" && activeBadgeCount > 0;

          return (
            <motion.button
              key={id}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              onClick={() => onSelect(id)}
              data-testid={`triad-tab-${id}`}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 relative transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 inline-flex items-center justify-center rounded-full px-1 py-0.5 text-[9px] font-bold leading-none min-w-[15px] bg-amber-500 text-black">
                    {activeBadgeCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none">{label}</span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}

export const TRIAD_INTENDED_GROUP_KEY = "delve:triad-navigate-to-group";
