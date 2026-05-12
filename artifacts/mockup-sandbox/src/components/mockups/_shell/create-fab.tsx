import { Plus } from "lucide-react";
import { motion } from "framer-motion";

interface CreateFabProps {
  onClick: () => void;
  /** Hide on screens where create has no meaning (e.g. Play, More). */
  hidden?: boolean;
}

/**
 * Floating action button sitting above the bottom nav. Opens a context-aware
 * "create new …" sheet. Visible on Now, World, Party for DMs (the panel
 * decides what creatable types to show).
 */
export function CreateFab({ onClick, hidden }: CreateFabProps) {
  if (hidden) return null;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      aria-label="Create new"
      className="fixed right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
    >
      <Plus className="h-6 w-6" />
    </motion.button>
  );
}
