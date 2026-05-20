import { useState } from "react";
import {
  Shield, BookOpen, Users, ScrollText, Calendar,
  MapIcon, Compass, Dice5, Library, Skull, MessageSquare,
  Scroll, GitCompare, User,
} from "lucide-react";
import type { TriadGroup } from "@/components/triad-tab-bar";

export type NavId = "my-character" | "overview" | "characters" | "npcs" | "sessions" | "calendar" | "maps" | "world" | "dice" | "rules" | "bestiary" | "chat" | "homebrew" | "compare";

export interface NavItem {
  id: NavId;
  label: string;
  icon: typeof Shield;
}

export const ACTIVE_ITEMS: NavId[] = ["overview", "sessions", "calendar"];
export const TABLE_ITEMS: NavId[] = ["dice", "chat", "maps"];

export const ALL_NAV_ITEMS: NavItem[] = [
  { id: "my-character", label: "My Character", icon: User },
  { id: "overview", label: "Overview", icon: Shield },
  { id: "characters", label: "Characters", icon: BookOpen },
  { id: "npcs", label: "NPCs", icon: Users },
  { id: "sessions", label: "Sessions", icon: ScrollText },
  { id: "calendar", label: "Schedule", icon: Calendar },
  { id: "maps", label: "Maps", icon: MapIcon },
  { id: "world", label: "World", icon: Compass },
  { id: "dice", label: "Dice", icon: Dice5 },
  { id: "rules", label: "Rules Lookup", icon: Library },
  { id: "bestiary", label: "Bestiary", icon: Skull },
  { id: "chat", label: "Ask", icon: MessageSquare },
  { id: "homebrew", label: "House Rules", icon: Scroll },
  { id: "compare", label: "Compare Editions", icon: GitCompare },
];

export function navItem(id: NavId): NavItem {
  return ALL_NAV_ITEMS.find((i) => i.id === id)!;
}

export function getGroupItems(group: TriadGroup, showMyCharacter: boolean, isDm: boolean): NavId[] {
  if (group === "active") return ACTIVE_ITEMS;
  if (group === "table") return TABLE_ITEMS;
  const libraryItems: NavId[] = [];
  if (showMyCharacter) libraryItems.push("my-character");
  libraryItems.push("characters", "npcs", "world", "rules", "bestiary", "homebrew");
  if (isDm) libraryItems.push("compare");
  return libraryItems;
}

export function getPinnedItems(group: TriadGroup): NavId[] {
  if (group === "library") return ["compare"];
  return [];
}

export const TRIAD_ITEM_ORDER_KEY = (group: TriadGroup) => `delve:triad-item-order:${group}`;
export const LAST_SUBNAV_KEY = "delve:triad-last-subnav";

export function readGroupOrder(group: TriadGroup): NavId[] | null {
  try {
    const raw = localStorage.getItem(TRIAD_ITEM_ORDER_KEY(group));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((v): v is NavId => typeof v === "string");
  } catch {
    return null;
  }
}

export function writeGroupOrder(group: TriadGroup, order: NavId[]) {
  try {
    localStorage.setItem(TRIAD_ITEM_ORDER_KEY(group), JSON.stringify(order));
  } catch { /* ignore */ }
}

export function clearGroupOrder(group: TriadGroup) {
  try {
    localStorage.removeItem(TRIAD_ITEM_ORDER_KEY(group));
  } catch { /* ignore */ }
}

export function getOrderedGroupItems(group: TriadGroup, showMyCharacter: boolean, isDm: boolean): NavId[] {
  const def = getGroupItems(group, showMyCharacter, isDm);
  const pinned = getPinnedItems(group).filter((id) => def.includes(id));
  const reorderable = def.filter((id) => !pinned.includes(id));
  const saved = readGroupOrder(group);
  if (!saved) return def;
  const ordered: NavId[] = [];
  for (const id of saved) {
    if (reorderable.includes(id) && !ordered.includes(id)) ordered.push(id);
  }
  for (const id of reorderable) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return [...ordered, ...pinned];
}

export function getGroupForTab(tab: NavId): TriadGroup {
  if (ACTIVE_ITEMS.includes(tab)) return "active";
  if (TABLE_ITEMS.includes(tab)) return "table";
  return "library";
}

export function readLastSubNav(): Partial<Record<TriadGroup, NavId>> {
  try {
    return JSON.parse(localStorage.getItem(LAST_SUBNAV_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function writeLastSubNav(group: TriadGroup, id: NavId) {
  try {
    const curr = readLastSubNav();
    curr[group] = id;
    localStorage.setItem(LAST_SUBNAV_KEY, JSON.stringify(curr));
  } catch { /* ignore */ }
}

export function readIntendedGroup(): TriadGroup | null {
  try {
    const v = localStorage.getItem("delve:triad-navigate-to-group");
    if (v === "active" || v === "table" || v === "library") return v;
    return null;
  } catch {
    return null;
  }
}

export function clearIntendedGroup() {
  try { localStorage.removeItem("delve:triad-navigate-to-group"); } catch { /* ignore */ }
}

export function useDmMode(userId: string | undefined): [boolean, (v: boolean) => void] {
  const key = userId ? `delve:dm-mode:${userId}` : null;
  const [dmMode, setDmModeState] = useState<boolean>(() => {
    if (!key) return false;
    return localStorage.getItem(key) === "true";
  });
  const setDmMode = (v: boolean) => {
    setDmModeState(v);
    if (key) localStorage.setItem(key, v ? "true" : "false");
  };
  return [dmMode, setDmMode];
}
