import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Send, Loader2, BookOpen, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postChat, useGetMyMembership } from "@workspace/api-client-react";
import type { ChatResponse, ChatCitation } from "@workspace/api-client-react";

interface ChatTurn {
  id: string;
  question: string;
  answer: string | null;
  citations: ChatCitation[];
  edition: "2014" | "2024" | null;
  error: string | null;
  loading: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderAnswer(md: string): string {
  const escaped = escapeHtml(md);
  return escaped
    .replace(/\[([CR]\d+)\]/g, '<span class="inline-flex items-center rounded bg-primary/20 text-primary px-1 py-0 text-[10px] font-mono align-middle">$1</span>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<)(.+)$/gm, "<p>$1</p>");
}

function CitationBadge({ citation, index, isDm }: { citation: ChatCitation; index: number; isDm: boolean }) {
  const isCampaign = citation.source === "campaign";
  const tag = isCampaign ? `C${index + 1}` : `R${index + 1}`;
  const label =
    citation.source === "srd-2014"
      ? "SRD 2014"
      : citation.source === "srd-2024"
      ? "SRD 2024"
      : isDm
      ? `Campaign · ${citation.entityKind.replace(/_/g, " ")}`
      : "Campaign";

  return (
    <a
      href={citation.sourceUrl ?? undefined}
      target={citation.sourceUrl ? "_blank" : undefined}
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
        isCampaign
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-primary/30 bg-primary/10 text-primary"
      } ${citation.sourceUrl ? "hover:bg-primary/20" : ""}`}
      data-testid={`chat-citation-${tag}`}
    >
      <span className="font-mono text-[10px] opacity-80">[{tag}]</span>
      {isCampaign ? <Sparkles className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
      <span className="font-medium truncate max-w-[200px]">{citation.entityName}</span>
      <span className="text-[10px] opacity-70">{label}</span>
      {isDm && isCampaign && citation.sourceField && citation.sourceField !== "public_md" && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-300">
          <Lock className="h-2.5 w-2.5" />
          {citation.sourceField === "secret_md" ? "secret" : "DM notes"}
        </span>
      )}
    </a>
  );
}

export default function ChatPanel() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { data: membership } = useGetMyMembership();
  const isDm = membership?.role === "dm";
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  const handleSubmit = async () => {
    const message = input.trim();
    if (!message || submitting) return;
    setSubmitting(true);
    const id = `turn-${Date.now()}`;
    const turn: ChatTurn = {
      id,
      question: message,
      answer: null,
      citations: [],
      edition: null,
      error: null,
      loading: true,
    };
    setTurns((prev) => [...prev, turn]);
    setInput("");
    try {
      const res: ChatResponse = await postChat({ message });
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, answer: res.answer, citations: res.citations, edition: res.edition, loading: false }
            : t,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to get a response";
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, error: msg, loading: false } : t)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full" data-testid="chat-panel">
      <div>
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
          <MessageSquare className="h-6 w-6 text-primary" />
          Ask the Lorekeeper
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ask questions about D&D rules or this campaign's lore. Answers cite their sources — campaign-specific
          information is preferred over generic SRD when both apply.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto space-y-6 pr-1" data-testid="chat-scroll">
        {turns.length === 0 && (
          <div className="rounded-2xl glass-panel p-8 text-center text-muted-foreground" data-testid="chat-empty">
            <Sparkles className="h-6 w-6 mx-auto mb-3 text-primary" />
            <p className="text-sm">Try: <span className="text-foreground">"Who was the bartender in Tessringale?"</span></p>
            <p className="text-sm mt-1">Or: <span className="text-foreground">"How does grappling work?"</span></p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {turns.map((turn) => (
            <motion.div
              key={turn.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
              data-testid={`chat-turn-${turn.id}`}
            >
              <div className="flex justify-end">
                <div className="rounded-2xl glass-panel px-4 py-2 max-w-[80%]" data-testid="chat-question">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{turn.question}</p>
                </div>
              </div>
              <div className="rounded-2xl glass-panel p-4 space-y-3" data-testid="chat-answer">
                {turn.loading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching the archives…
                  </div>
                )}
                {turn.error && <p className="text-sm text-destructive">{turn.error}</p>}
                {turn.answer && (
                  <div
                    className="prose prose-sm prose-invert max-w-none text-foreground/90"
                    dangerouslySetInnerHTML={{ __html: renderAnswer(turn.answer) }}
                  />
                )}
                {turn.citations.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
                    {turn.citations.map((c, i) => (
                      <CitationBadge key={`${turn.id}-${i}`} citation={c} index={i} isDm={!!isDm} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="rounded-2xl glass-panel p-3 flex gap-2 items-end shrink-0">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="Ask about a rule or someone in the campaign…"
          rows={2}
          className="resize-none bg-transparent border-0 focus-visible:ring-0 text-sm"
          data-testid="chat-input"
          disabled={submitting}
        />
        <Button
          onClick={handleSubmit}
          disabled={submitting || !input.trim()}
          data-testid="chat-send"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
