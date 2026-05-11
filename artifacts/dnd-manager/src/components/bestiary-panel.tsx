import { useEffect, useMemo, useState } from "react";
import { Skull, Search, Loader2, ChevronLeft, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useGetCampaign,
  useListBestiary,
  useGetBestiaryFacets,
  useGetRule,
} from "@workspace/api-client-react";

interface BestiaryEntry {
  slug: string;
  title: string;
  sourceUrl?: string | null;
  type?: string | null;
  size?: string | null;
  alignment?: string | null;
  cr?: number | null;
  imageUrl?: string | null;
}

interface RuleEntity {
  edition: "2014" | "2024";
  entityKind: string;
  entitySlug: string;
  title: string;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  chunks: { id: number; section: string | null; title: string; bodyMd: string }[];
}

// Mirrors `resolvePortraitSrc` in character-list. Object-storage paths
// stored as `/objects/<id>` are served by the api-server's
// `/api/storage/objects/<id>` route (auth-gated by campaign membership).
function resolveImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/objects/")) return `${import.meta.env.BASE_URL}api/storage${url}`;
  return url;
}

function MonsterArt({
  url,
  name,
  size,
}: {
  url: string | null | undefined;
  name: string;
  size: "thumb" | "hero";
}) {
  const src = resolveImageSrc(url);
  // Track per-mount load failures so a stale or 404'd object path falls
  // back to the skull placeholder instead of rendering a broken image.
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const imgCls =
    size === "thumb"
      ? "h-16 w-16 sm:h-20 sm:w-20 rounded-lg shrink-0 object-cover [image-rendering:pixelated] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)]"
      : "w-full max-w-sm aspect-square mx-auto rounded-xl object-cover [image-rendering:pixelated] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)]";
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={`${name} portrait`}
        loading="lazy"
        onError={() => setFailed(true)}
        className={imgCls}
        data-testid={size === "thumb" ? "img-monster-thumb" : "img-monster-hero"}
      />
    );
  }
  const placeholderCls =
    size === "thumb"
      ? "h-16 w-16 sm:h-20 sm:w-20 rounded-lg shrink-0 flex items-center justify-center bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]"
      : "w-full max-w-sm aspect-square mx-auto rounded-xl flex items-center justify-center bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]";
  return (
    <div
      className={placeholderCls}
      data-testid={size === "thumb" ? "img-monster-thumb-placeholder" : "img-monster-hero-placeholder"}
      aria-label={`No portrait for ${name}`}
    >
      <Skull className={size === "thumb" ? "h-7 w-7 text-muted-foreground/60" : "h-20 w-20 text-muted-foreground/40"} />
    </div>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Mirrors the markdown rendering used in rules-lookup so stat blocks
// render identically in both panels.
function markdownToHtml(md: string): string {
  const escaped = escapeHtml(md);
  return escaped
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<)(.+)$/gm, "<p>$1</p>");
}

function formatCr(cr: number | null | undefined): string {
  if (cr == null) return "—";
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

const SIZE_ORDER = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];

export default function BestiaryPanel() {
  const { data: campaign } = useGetCampaign();
  const defaultEdition =
    (campaign?.defaultEdition as "2014" | "2024" | undefined) ?? "2024";
  const [edition, setEdition] = useState<"2014" | "2024">(defaultEdition);
  useEffect(() => setEdition(defaultEdition), [defaultEdition]);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query.trim(), 200);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedAlignment, setSelectedAlignment] = useState<string>("");
  const [crMin, setCrMin] = useState<string>("");
  const [crMax, setCrMax] = useState<string>("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  // Reset filters when switching editions so we don't end up with an
  // empty list because a 2014-only type was selected.
  useEffect(() => {
    setSelectedTypes([]);
    setSelectedSizes([]);
    setSelectedAlignment("");
    setCrMin("");
    setCrMax("");
    setOpenSlug(null);
  }, [edition]);

  const facetsQuery = useGetBestiaryFacets(
    { edition },
    { query: { queryKey: ["/api/bestiary/facets", edition] } },
  );
  const facets = facetsQuery.data;

  const listParams = useMemo(
    () => ({
      edition,
      q: debouncedQuery || undefined,
      type: selectedTypes.length ? selectedTypes.join(",") : undefined,
      size: selectedSizes.length ? selectedSizes.join(",") : undefined,
      alignment: selectedAlignment || undefined,
      crMin: crMin === "" ? undefined : Number(crMin),
      crMax: crMax === "" ? undefined : Number(crMax),
      limit: 500,
    }),
    [edition, debouncedQuery, selectedTypes, selectedSizes, selectedAlignment, crMin, crMax],
  );

  const listQuery = useListBestiary(listParams, {
    query: {
      queryKey: ["/api/bestiary", listParams],
    },
  });
  const list = listQuery.data;
  const items = (list?.items ?? []) as BestiaryEntry[];
  const loading = listQuery.isFetching;
  const error = listQuery.error ? (listQuery.error as Error).message : null;

  const detailQuery = useGetRule(
    "monster",
    openSlug ?? "",
    { edition },
    {
      query: {
        enabled: !!openSlug,
        queryKey: ["/api/rules", "monster", openSlug, edition],
      },
    },
  );
  const detail = (detailQuery.data ?? null) as RuleEntity | null;

  const sortedSizes = useMemo(() => {
    const all = facets?.sizes ?? [];
    return [...all].sort(
      (a, b) => SIZE_ORDER.indexOf(a.value) - SIZE_ORDER.indexOf(b.value),
    );
  }, [facets]);

  const toggle = (
    list: string[],
    setList: (next: string[]) => void,
    value: string,
  ) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const ingestionEmpty =
    !facetsQuery.isFetching &&
    facets != null &&
    facets.total === 0;
  const facetsErr = facetsQuery.error ? (facetsQuery.error as Error).message : null;

  if (openSlug) {
    return (
      <div className="space-y-4 max-w-3xl" data-testid="bestiary-detail">
        <Button variant="ghost" size="sm" onClick={() => setOpenSlug(null)} data-testid="button-back-bestiary">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to bestiary
        </Button>
        <div className="rounded-2xl glass-panel p-6">
          {detailQuery.isFetching && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading stat block...
            </div>
          )}
          {!detailQuery.isFetching && detail && (
            <div
              className="prose prose-sm prose-invert max-w-none text-foreground/90"
              data-testid="text-monster-body"
            >
              <div className="not-prose mb-4">
                <MonsterArt url={detail.imageUrl} name={detail.title} size="hero" />
              </div>
              {detail.chunks.map((c) => (
                <div key={c.id}>
                  {c.section && (
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {c.section}
                    </p>
                  )}
                  <div dangerouslySetInnerHTML={{ __html: markdownToHtml(c.bodyMd) }} />
                </div>
              ))}
              {detail.sourceUrl && (
                <p className="text-xs text-muted-foreground mt-3">
                  Source:{" "}
                  <a
                    href={detail.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {detail.sourceUrl}
                  </a>
                </p>
              )}
            </div>
          )}
          {!detailQuery.isFetching && !detail && (
            <p className="text-sm text-muted-foreground">Failed to load stat block.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="bestiary-panel">
      <div>
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
          <Skull className="h-6 w-6 text-primary" />
          Bestiary
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Browse every SRD monster and NPC stat block for the {edition === "2014" ? "5.1 (2014)" : "5.2 (2024)"} edition.
          Filter by challenge rating, type, size, and alignment.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search monster name..."
            className="pl-9"
            data-testid="input-bestiary-search"
          />
        </div>
        <div className="inline-flex rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-1 self-start md:self-auto">
          {(["2014", "2024"] as const).map((e) => (
            <button
              key={e}
              onClick={() => setEdition(e)}
              data-testid={`button-bestiary-edition-${e}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                edition === e
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {e === "2014" ? "5.1 (2014)" : "5.2 (2024)"}
            </button>
          ))}
        </div>
      </div>

      {ingestionEmpty && (
        <div className="rounded-2xl glass-panel p-6 text-sm text-muted-foreground" data-testid="text-bestiary-not-seeded">
          No monsters have been loaded yet for this edition. Run{" "}
          <code className="px-1 py-0.5 rounded bg-[rgba(255,255,255,0.06)]">pnpm srd:ingest-api</code>{" "}
          to populate the SRD bestiary.
        </div>
      )}

      {facetsErr && (
        <p className="text-sm text-destructive">Failed to load filters: {facetsErr}</p>
      )}

      {facets && facets.total > 0 && (
        <div className="rounded-2xl glass-panel p-4 space-y-4" data-testid="bestiary-filters">
          <FilterRow label="Type">
            {facets.types.map((t) => (
              <FilterChip
                key={t.value}
                label={t.value}
                count={t.count}
                active={selectedTypes.includes(t.value)}
                onClick={() => toggle(selectedTypes, setSelectedTypes, t.value)}
                testId={`chip-type-${t.value}`}
              />
            ))}
          </FilterRow>
          <FilterRow label="Size">
            {sortedSizes.map((s) => (
              <FilterChip
                key={s.value}
                label={s.value}
                count={s.count}
                active={selectedSizes.includes(s.value)}
                onClick={() => toggle(selectedSizes, setSelectedSizes, s.value)}
                testId={`chip-size-${s.value}`}
              />
            ))}
          </FilterRow>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Challenge Rating
            </label>
            <Input
              type="number"
              step="0.125"
              min={0}
              placeholder={facets.crMin != null ? `min ${formatCr(facets.crMin)}` : "min"}
              value={crMin}
              onChange={(e) => setCrMin(e.target.value)}
              className="w-28"
              data-testid="input-cr-min"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <Input
              type="number"
              step="0.125"
              min={0}
              placeholder={facets.crMax != null ? `max ${formatCr(facets.crMax)}` : "max"}
              value={crMax}
              onChange={(e) => setCrMax(e.target.value)}
              className="w-28"
              data-testid="input-cr-max"
            />
            <label className="text-xs uppercase tracking-wide text-muted-foreground ml-4">
              Alignment
            </label>
            <Input
              placeholder="e.g. lawful evil"
              value={selectedAlignment}
              onChange={(e) => setSelectedAlignment(e.target.value)}
              className="w-48"
              data-testid="input-alignment"
            />
            {(selectedTypes.length ||
              selectedSizes.length ||
              selectedAlignment ||
              crMin !== "" ||
              crMax !== "") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedTypes([]);
                  setSelectedSizes([]);
                  setSelectedAlignment("");
                  setCrMin("");
                  setCrMax("");
                }}
                data-testid="button-clear-filters"
              >
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" data-testid="text-bestiary-error">{error}</p>
      )}

      {loading && !list && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm" data-testid="text-bestiary-loading">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading bestiary...
        </div>
      )}

      {list && (
        <div className="text-xs text-muted-foreground" data-testid="text-bestiary-count">
          Showing {items.length} of {list.total} monsters
          {loading && (
            <span className="ml-2 inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> updating
            </span>
          )}
        </div>
      )}

      {list && items.length === 0 && !loading && !ingestionEmpty && (
        <div className="rounded-2xl glass-panel p-8 text-center text-muted-foreground" data-testid="text-bestiary-empty">
          No monsters match these filters. Try clearing some filters.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <AnimatePresence initial={false}>
          {items.map((m) => (
            <motion.button
              key={m.slug}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpenSlug(m.slug)}
              data-testid={`bestiary-card-${m.slug}`}
              className="text-left rounded-xl glass-panel-hover p-4 flex items-start gap-3"
            >
              <MonsterArt url={m.imageUrl} name={m.title} size="thumb" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="font-semibold text-foreground truncate">{m.title}</h4>
                  <span className="text-xs font-mono shrink-0 text-primary">
                    CR {formatCr(m.cr)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {[m.size, m.type].filter(Boolean).join(" · ") || "—"}
                </p>
                {m.alignment && (
                  <p className="text-xs text-muted-foreground/80 mt-0.5 truncate">{m.alignment}</p>
                )}
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  testId,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`px-2 py-1 text-xs rounded-full border transition-colors ${
        active
          ? "border-primary bg-primary/20 text-foreground"
          : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span className="ml-1 text-[10px] text-muted-foreground/70">{count}</span>
    </button>
  );
}
