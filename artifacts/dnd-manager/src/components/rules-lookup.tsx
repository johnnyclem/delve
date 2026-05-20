import { useEffect, useMemo, useState } from "react";
import { BookOpen, Search } from "@/components/ui/pixel-icons";
import { PixelD20Loader } from "@/components/ui/pixel-d20-loader";
import { SafeMarkdown, SanitizedHtml } from "@/components/safe-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useGetCampaign, useSearchRules, useGetRule } from "@workspace/api-client-react";

interface RuleHit {
  id: number;
  edition: "2014" | "2024";
  entityKind: string;
  entitySlug: string;
  section?: string | null;
  title: string;
  snippet: string;
  sourceUrl?: string | null;
}

interface RuleSearchResponse {
  edition: "2014" | "2024";
  query: string;
  hits: RuleHit[];
}

interface RuleEntity {
  edition: "2014" | "2024";
  entityKind: string;
  entitySlug: string;
  title: string;
  sourceUrl?: string | null;
  chunks: { id: number; section: string | null; title: string; bodyMd: string }[];
}

const KIND_LABELS: Record<string, string> = {
  spell: "Spells",
  monster: "Monsters",
  class: "Classes",
  subclass: "Subclasses",
  feat: "Feats",
  item: "Items",
  rule: "Rules",
  background: "Backgrounds",
  race: "Races",
  subrace: "Subraces",
  condition: "Conditions",
  magicitem: "Magic Items",
  other: "Other",
};

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function renderSnippet(snippet: string): string {
  return snippet
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/«/g, '<mark class="bg-primary/30 text-foreground rounded px-0.5">')
    .replace(/»/g, "</mark>");
}

export default function RulesLookupPanel() {
  const { data: campaign } = useGetCampaign();
  const defaultEdition = (campaign?.defaultEdition as "2014" | "2024" | undefined) ?? "2024";
  const [edition, setEdition] = useState<"2014" | "2024">(defaultEdition);
  useEffect(() => setEdition(defaultEdition), [defaultEdition]);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query.trim(), 250);

  const searchQuery = useSearchRules(
    { q: debouncedQuery, edition, limit: 30 },
    {
      query: {
        enabled: debouncedQuery.length > 0,
        queryKey: ["/api/rules/search", debouncedQuery, edition],
      },
    },
  );
  const searching = searchQuery.isFetching;
  const searchError = searchQuery.error ? (searchQuery.error as Error).message : null;
  const response = (searchQuery.data ?? null) as RuleSearchResponse | null;

  const [expanded, setExpanded] = useState<{ kind: string; slug: string } | null>(null);
  const entityQuery = useGetRule(
    expanded?.kind ?? "",
    expanded?.slug ?? "",
    { edition },
    {
      query: {
        enabled: !!expanded,
        queryKey: ["/api/rules", expanded?.kind, expanded?.slug, edition],
      },
    },
  );
  const expandedEntity = (entityQuery.data ?? null) as RuleEntity | null;
  const loadingEntity = entityQuery.isFetching;

  const grouped = useMemo(() => {
    if (!response) return [] as Array<{ kind: string; hits: RuleHit[] }>;
    const map = new Map<string, RuleHit[]>();
    for (const h of response.hits) {
      const list = map.get(h.entityKind) ?? [];
      list.push(h);
      map.set(h.entityKind, list);
    }
    return Array.from(map.entries()).map(([kind, hits]) => ({ kind, hits }));
  }, [response]);

  const handleExpand = (hit: RuleHit) => {
    if (expanded?.kind === hit.entityKind && expanded.slug === hit.entitySlug) {
      setExpanded(null);
      return;
    }
    setExpanded({ kind: hit.entityKind, slug: hit.entitySlug });
  };

  return (
    <div className="space-y-6" data-testid="rules-lookup-panel">
      <div>
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
          <BookOpen className="h-6 w-6 text-primary" />
          Rules Lookup
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Search the SRD for spells, monsters, classes, items, and rules. Results
          are scoped to the {edition === "2014" ? "5.1 (2014)" : "5.2 (2024)"} edition.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search spells, monsters, items, rules..."
            className="pl-9"
            autoFocus
            data-testid="input-rules-search"
          />
        </div>
        <div className="inline-flex rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-1 self-start md:self-auto">
          {(["2014", "2024"] as const).map((e) => (
            <button
              key={e}
              onClick={() => setEdition(e)}
              data-testid={`button-edition-${e}`}
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

      {searching && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm" data-testid="text-rules-loading">
          <PixelD20Loader className="h-4 w-4" /> Searching...
        </div>
      )}
      {searchError && (
        <p className="text-sm text-destructive" data-testid="text-rules-error">{searchError}</p>
      )}

      {!searching && response && response.hits.length === 0 && (
        <div className="rounded-2xl glass-panel p-8 text-center text-muted-foreground" data-testid="text-rules-empty">
          No matches for "{response.query}" in {edition}.
        </div>
      )}

      {!query.trim() && !response && (
        <div className="rounded-2xl glass-panel p-8 text-center text-muted-foreground" data-testid="text-rules-prompt">
          Type a keyword to start searching.
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(({ kind, hits }) => (
          <section key={kind} data-testid={`group-${kind}`}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {KIND_LABELS[kind] ?? kind}
              <span className="ml-2 text-xs text-muted-foreground/70">{hits.length}</span>
            </h3>
            <div className="grid gap-2">
              <AnimatePresence initial={false}>
                {hits.map((hit) => {
                  const isExpanded = expanded?.kind === hit.entityKind && expanded.slug === hit.entitySlug;
                  return (
                    <motion.div
                      key={hit.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="rounded-xl glass-panel overflow-hidden"
                      data-testid={`hit-${hit.entityKind}-${hit.entitySlug}`}
                    >
                      <button
                        onClick={() => handleExpand(hit)}
                        className="w-full text-left p-4 hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <h4 className="text-base font-semibold text-foreground" data-testid="text-hit-title">
                            {hit.title}
                            {hit.section && (
                              <span className="ml-2 text-xs text-muted-foreground font-normal">{hit.section}</span>
                            )}
                          </h4>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground/70 shrink-0">
                            {hit.entityKind}
                          </span>
                        </div>
                        <SanitizedHtml html={renderSnippet(hit.snippet)} className="text-sm text-muted-foreground mt-1 line-clamp-2" />
                      </button>
                      {isExpanded && (
                        <div className="border-t border-[rgba(255,255,255,0.06)] p-4 bg-[rgba(255,255,255,0.02)]">
                          {loadingEntity && (
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                              <PixelD20Loader className="h-4 w-4" /> Loading...
                            </div>
                          )}
                          {!loadingEntity && expandedEntity && (
                            <div className="prose prose-sm prose-invert max-w-none text-foreground/90" data-testid="text-hit-body">
                              {expandedEntity.chunks.map((c) => (
                                <div key={c.id}>
                                  {c.section && <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.section}</p>}
                                  <SafeMarkdown content={c.bodyMd} />
                                </div>
                              ))}
                              {expandedEntity.sourceUrl && (
                                <p className="text-xs text-muted-foreground mt-3">
                                  Source: <a href={expandedEntity.sourceUrl} target="_blank" rel="noreferrer" className="underline">{expandedEntity.sourceUrl}</a>
                                </p>
                              )}
                            </div>
                          )}
                          {!loadingEntity && !expandedEntity && (
                            <p className="text-sm text-muted-foreground">Failed to load full entry.</p>
                          )}
                          <div className="mt-3">
                            <Button variant="ghost" size="sm" onClick={() => handleExpand(hit)} data-testid="button-collapse-hit">
                              Collapse
                            </Button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
