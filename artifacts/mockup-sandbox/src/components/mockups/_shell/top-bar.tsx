import { ArrowLeft, Plus, Search } from "lucide-react";
import type { Role } from "./nav";

interface TopBarProps {
  title: string;
  subtitle?: string;
  /** Show the back arrow on detail routes. */
  showBack?: boolean;
  onBack?: () => void;
  onSearch: () => void;
  onCreate?: () => void;
  role: Role;
  /** Hide create button entirely (e.g. role=player on a DM-only screen). */
  hideCreate?: boolean;
}

export function TopBar({
  title,
  subtitle,
  showBack,
  onBack,
  onSearch,
  onCreate,
  role,
  hideCreate,
}: TopBarProps) {
  const canCreate = !hideCreate && (role === "dm" || title === "Now" || title === "Play");
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-md">
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold tracking-wide">{title}</h1>
        {subtitle ? (
          <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onSearch}
        aria-label="Open command palette"
        className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Search className="h-5 w-5" />
      </button>
      {canCreate ? (
        <button
          type="button"
          onClick={onCreate}
          aria-label="Create new"
          className="inline-flex h-9 w-9 items-center justify-center rounded-sm bg-primary text-primary-foreground hover:brightness-110"
        >
          <Plus className="h-5 w-5" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Profile"
        className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border bg-card text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground"
      >
        {role === "dm" ? "DM" : "PL"}
      </button>
    </header>
  );
}
