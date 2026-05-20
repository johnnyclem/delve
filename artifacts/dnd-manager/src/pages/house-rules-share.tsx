import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Printer, Scroll } from "@/components/ui/pixel-icons";
import { PixelD20Loader } from "@/components/ui/pixel-d20-loader";
import { SafeMarkdown } from "@/components/safe-markdown";
import { useGetPublicHouseRules, type PublicHouseRulesView } from "@workspace/api-client-react";

export default function HouseRulesSharePage() {
  const [, params] = useRoute("/share/house-rules/:token");
  const token = params?.token ?? "";
  const { data, isLoading, error } = useGetPublicHouseRules(token, {
    query: {
      enabled: !!token,
      retry: false,
      queryKey: ["/api/public/house-rules", token] as const,
    },
  });
  const view = data as PublicHouseRulesView | undefined;
  const [printedAt] = useState(() => new Date());

  useEffect(() => {
    if (view) {
      document.title = `House Rules — ${view.campaignName}`;
    }
  }, [view]);

  return (
    <div className="house-rules-share min-h-[100dvh] bg-white text-zinc-900">
      <style>{`
        .house-rules-share { font-family: 'Inter', system-ui, sans-serif; }
        .house-rules-share .hr-h2 { font-size: 1.125rem; font-weight: 600; margin: 1rem 0 0.5rem; }
        .house-rules-share .hr-h3 { font-size: 1rem; font-weight: 600; margin: 0.75rem 0 0.25rem; }
        .house-rules-share p { margin: 0.5rem 0; line-height: 1.55; }
        .house-rules-share li { margin-left: 1.25rem; list-style: disc; line-height: 1.55; }
        .house-rules-share .rule { break-inside: avoid; page-break-inside: avoid; }
        .house-rules-share .rule + .rule { margin-top: 1.5rem; }
        @media print {
          .house-rules-share { background: white; color: black; }
          .no-print { display: none !important; }
          @page { margin: 18mm; }
          .house-rules-share .rule + .rule { border-top: 1px solid #e5e7eb; padding-top: 1rem; }
        }
      `}</style>

      <div className="mx-auto max-w-3xl px-6 py-10 print:py-0 print:px-0">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-6 mb-6">
          <div>
            <div className="flex items-center gap-2 text-zinc-500 text-xs uppercase tracking-wide mb-2">
              <Scroll className="h-4 w-4" /> House Rules
            </div>
            <h1
              className="text-3xl font-semibold tracking-tight"
              data-testid="text-share-campaign-name"
            >
              {view?.campaignName ?? (isLoading ? "Loading…" : "House Rules")}
            </h1>
            {view?.worldName && (
              <p className="text-sm text-zinc-500 mt-1">{view.worldName}</p>
            )}
            <p className="text-xs text-zinc-400 mt-2">
              Printed {printedAt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            data-testid="button-print-house-rules"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </header>

        {isLoading && (
          <div className="flex items-center gap-2 text-zinc-500 text-sm" data-testid="text-share-loading">
            <PixelD20Loader className="h-4 w-4" /> Loading house rules…
          </div>
        )}

        {error && (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700"
            data-testid="text-share-error"
          >
            <p className="font-medium">This share link isn't valid.</p>
            <p className="text-sm mt-1">Ask the DM for an updated link.</p>
          </div>
        )}

        {view && view.rules.length === 0 && (
          <div
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-center text-zinc-500"
            data-testid="text-share-empty"
          >
            The DM hasn't published any active house rules yet.
          </div>
        )}

        <div>
          {view?.rules.map((rule) => (
            <section key={rule.id} className="rule" data-testid={`share-rule-${rule.id}`}>
              <h2 className="text-xl font-semibold tracking-tight mb-2">{rule.title}</h2>
              <SafeMarkdown
                content={rule.bodyMd}
                className="text-zinc-800"
              />
            </section>
          ))}
        </div>

        <footer className="mt-10 pt-6 border-t border-zinc-200 text-xs text-zinc-400 text-center">
          Shared from Delve · House Rules are read-only and reflect the DM's current ruling.
        </footer>
      </div>
    </div>
  );
}
