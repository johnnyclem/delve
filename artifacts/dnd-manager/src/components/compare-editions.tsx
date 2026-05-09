import { useEffect, useMemo, useState, type ReactElement } from "react";
import { GitCompare, Search, Loader2, ArrowLeftRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSearchRules, useGetRule } from "@workspace/api-client-react";

interface RuleHit {
  id: number;
  edition: "2014" | "2024";
  entityKind: string;
  entitySlug: string;
  section?: string | null;
  title: string;
  snippet: string;
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

function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

// Simple word-level diff using LCS, returning per-token classifications.
type DiffPart = { text: string; kind: "same" | "added" | "removed" };

function tokenize(s: string): string[] {
  return s.split(/(\s+|[.,;:!?()])/g).filter((t) => t.length > 0);
}

function diffWords(a: string, b: string): { left: DiffPart[]; right: DiffPart[] } {
  const A = tokenize(a);
  const B = tokenize(b);
  const m = A.length;
  const n = B.length;
  // LCS DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (A[i] === B[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const left: DiffPart[] = [];
  const right: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) {
      left.push({ text: A[i], kind: "same" });
      right.push({ text: B[j], kind: "same" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      left.push({ text: A[i], kind: "removed" });
      i++;
    } else {
      right.push({ text: B[j], kind: "added" });
      j++;
    }
  }
  while (i < m) left.push({ text: A[i++], kind: "removed" });
  while (j < n) right.push({ text: B[j++], kind: "added" });
  return { left, right };
}

function renderDiff(parts: DiffPart[]): ReactElement[] {
  return parts.map((p, idx) => {
    if (p.kind === "same") return <span key={idx}>{p.text}</span>;
    if (p.kind === "added")
      return (
        <span key={idx} className="bg-emerald-500/20 text-emerald-100 rounded px-0.5">
          {p.text}
        </span>
      );
    return (
      <span key={idx} className="bg-rose-500/20 text-rose-100 rounded px-0.5 line-through">
        {p.text}
      </span>
    );
  });
}

function joinChunks(entity: RuleEntity | null): string {
  if (!entity) return "";
  return entity.chunks.map((c) => (c.section ? `## ${c.section}\n\n${c.bodyMd}` : c.bodyMd)).join("\n\n");
}

export default function CompareEditionsPanel() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query.trim(), 250);

  // Use the 2024 edition as the discovery source — picking from there finds
  // SRD entries that exist in the newest set, then we look up the same slug
  // in 2014.
  const searchQuery = useSearchRules(
    { q: debouncedQuery, edition: "2024", limit: 30 },
    {
      query: {
        enabled: debouncedQuery.length > 0,
        queryKey: ["/api/rules/search/compare", debouncedQuery],
      },
    },
  );
  const response = (searchQuery.data ?? null) as RuleSearchResponse | null;
  const searching = searchQuery.isFetching;

  const [picked, setPicked] = useState<{ kind: string; slug: string; title: string } | null>(null);

  const left = useGetRule(picked?.kind ?? "", picked?.slug ?? "", { edition: "2014" }, {
    query: {
      enabled: !!picked,
      queryKey: ["/api/rules/compare/2014", picked?.kind, picked?.slug],
      retry: false,
    },
  });
  const right = useGetRule(picked?.kind ?? "", picked?.slug ?? "", { edition: "2024" }, {
    query: {
      enabled: !!picked,
      queryKey: ["/api/rules/compare/2024", picked?.kind, picked?.slug],
      retry: false,
    },
  });

  const leftEntity = (left.data ?? null) as RuleEntity | null;
  const rightEntity = (right.data ?? null) as RuleEntity | null;

  const leftMissing = !!picked && !left.isFetching && !leftEntity;
  const rightMissing = !!picked && !right.isFetching && !rightEntity;

  const diff = useMemo(() => {
    if (!leftEntity || !rightEntity) return null;
    return diffWords(joinChunks(leftEntity), joinChunks(rightEntity));
  }, [leftEntity, rightEntity]);

  return (
    <div className="space-y-6" data-testid="compare-editions-panel">
      <div>
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
          <GitCompare className="h-6 w-6 text-primary" />
          Compare Editions
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Side-by-side comparison of the 5.1 (2014) and 5.2 (2024) SRDs. Differences are
          highlighted: <span className="text-rose-300">removed in 2024</span> /{" "}
          <span className="text-emerald-300">added in 2024</span>.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a spell, monster, class, or rule…"
          className="pl-9"
          autoFocus
          data-testid="input-compare-search"
        />
      </div>

      {searching && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm" data-testid="text-compare-loading">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching…
        </div>
      )}

      {!searching && response && response.hits.length > 0 && !picked && (
        <div className="rounded-2xl glass-panel divide-y divide-[rgba(255,255,255,0.06)]" data-testid="list-compare-hits">
          {response.hits.slice(0, 12).map((hit) => (
            <button
              key={hit.id}
              onClick={() =>
                setPicked({ kind: hit.entityKind, slug: hit.entitySlug, title: hit.title })
              }
              className="w-full text-left p-3 hover:bg-[rgba(255,255,255,0.04)] transition-colors flex items-center justify-between gap-3"
              data-testid={`compare-hit-${hit.entityKind}-${hit.entitySlug}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{hit.title}</p>
                {hit.section && (
                  <p className="text-xs text-muted-foreground truncate">{hit.section}</p>
                )}
              </div>
              <span className="text-xs uppercase tracking-wide text-muted-foreground/70 shrink-0">
                {hit.entityKind}
              </span>
            </button>
          ))}
        </div>
      )}

      {!searching && response && response.hits.length === 0 && !picked && (
        <div className="rounded-2xl glass-panel p-6 text-center text-muted-foreground text-sm" data-testid="text-compare-empty">
          No SRD matches for "{response.query}".
        </div>
      )}

      {picked && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <ArrowLeftRight className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground" data-testid="text-compare-title">{picked.title}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {picked.kind}
              </span>
            </div>
            <button
              onClick={() => setPicked(null)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
              data-testid="button-compare-clear"
            >
              Pick another entry
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-2xl glass-panel p-4 min-h-[280px]" data-testid="pane-2014">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-[rgba(255,255,255,0.06)]">
                <h3 className="text-sm font-semibold text-foreground">5.1 SRD (2014)</h3>
                {leftEntity && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {leftEntity.chunks.length} chunk{leftEntity.chunks.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {left.isFetching && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              )}
              {leftMissing && (
                <p className="text-sm text-muted-foreground italic" data-testid="text-2014-missing">
                  Not present in the 2014 SRD.
                </p>
              )}
              {leftEntity && diff && (
                <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed" data-testid="text-2014-body">
                  {renderDiff(diff.left)}
                </pre>
              )}
            </div>

            <div className="rounded-2xl glass-panel p-4 min-h-[280px]" data-testid="pane-2024">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-[rgba(255,255,255,0.06)]">
                <h3 className="text-sm font-semibold text-foreground">5.2 SRD (2024)</h3>
                {rightEntity && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {rightEntity.chunks.length} chunk{rightEntity.chunks.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {right.isFetching && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              )}
              {rightMissing && (
                <p className="text-sm text-muted-foreground italic" data-testid="text-2024-missing">
                  Not present in the 2024 SRD.
                </p>
              )}
              {rightEntity && diff && (
                <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed" data-testid="text-2024-body">
                  {renderDiff(diff.right)}
                </pre>
              )}
              {rightEntity && !diff && !leftEntity && !left.isFetching && (
                <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed">
                  {joinChunks(rightEntity)}
                </pre>
              )}
            </div>
          </div>

          {leftEntity && !rightEntity && !right.isFetching && (
            <div className="rounded-2xl glass-panel p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed">
                {joinChunks(leftEntity)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
