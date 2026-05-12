import { useEffect, useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MOCK_CHARACTERS, MOCK_ENTITIES, MOCK_SESSIONS, PALETTE_ACTIONS } from "./mock-data";
import type { Role } from "./nav";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
  onAction: (id: string) => void;
}

/**
 * Global command palette. The single discoverability surface for every nav
 * destination, entity, character, session, and buried action. Replaces the
 * scattered Profile-sheet-buried Compare Editions, deeply-nested SRD seeder,
 * popover-only ASI editor, etc.
 */
export function CommandPalette({ open, onOpenChange, role, onAction }: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const actions = useMemo(
    () => PALETTE_ACTIONS.filter((a) => role === "dm" || !a.dmOnly),
    [role],
  );

  const grouped = useMemo(() => {
    const groups: Record<string, typeof actions> = {};
    for (const a of actions) {
      (groups[a.group] ??= []).push(a);
    }
    return groups;
  }, [actions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-lg"
        aria-describedby={undefined}
      >
        <Command shouldFilter className="bg-popover">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search anything — sessions, NPCs, actions…"
          />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>Nothing matches "{query}"</CommandEmpty>

            {Object.entries(grouped).map(([group, items], idx) => (
              <div key={group}>
                {idx > 0 ? <CommandSeparator /> : null}
                <CommandGroup heading={group}>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.label} ${item.group}`}
                      onSelect={() => {
                        onAction(item.id);
                        onOpenChange(false);
                      }}
                    >
                      <span className="flex-1">{item.label}</span>
                      {item.hint ? (
                        <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {item.hint}
                        </kbd>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}

            <CommandSeparator />
            <CommandGroup heading="Sessions">
              {MOCK_SESSIONS.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`session ${s.title}`}
                  onSelect={() => {
                    onAction(`session:${s.id}`);
                    onOpenChange(false);
                  }}
                >
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="ml-2 text-[10px] text-muted-foreground">{s.date}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup heading="World">
              {MOCK_ENTITIES.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.kind} ${e.name} ${e.summary}`}
                  onSelect={() => {
                    onAction(`entity:${e.id}`);
                    onOpenChange(false);
                  }}
                >
                  <span className="mr-2 inline-block w-16 text-[10px] uppercase text-muted-foreground">
                    {e.kind}
                  </span>
                  <span className="flex-1 truncate">{e.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup heading="Party">
              {MOCK_CHARACTERS.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`character ${c.name} ${c.class} ${c.player}`}
                  onSelect={() => {
                    onAction(`character:${c.id}`);
                    onOpenChange(false);
                  }}
                >
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    L{c.level} {c.class}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>

          <div className="flex items-center justify-between border-t border-border bg-card/40 px-3 py-2 text-[10px] text-muted-foreground">
            <span>
              <kbd className="rounded border border-border bg-muted px-1 font-mono">↑↓</kbd> nav ·
              <kbd className="ml-1 rounded border border-border bg-muted px-1 font-mono">↵</kbd> open
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1 font-mono">g</kbd> then{" "}
              <kbd className="rounded border border-border bg-muted px-1 font-mono">n/p/w/y/m</kbd>
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
