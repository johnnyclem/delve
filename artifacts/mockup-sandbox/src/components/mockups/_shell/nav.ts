import { CalendarDays, Compass, Home, Library, Swords } from "lucide-react";
import type { ComponentType } from "react";

export type NavId = "now" | "play" | "world" | "party" | "more";

export interface NavDestination {
  id: NavId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Optional badge count surfaced on the bottom nav. */
  badge?: number;
}

export const NAV_DESTINATIONS: NavDestination[] = [
  { id: "now", label: "Now", icon: Home, badge: 2 },
  { id: "play", label: "Play", icon: Swords },
  { id: "world", label: "World", icon: Compass },
  { id: "party", label: "Party", icon: CalendarDays },
  { id: "more", label: "More", icon: Library },
];

export type Role = "dm" | "player";
