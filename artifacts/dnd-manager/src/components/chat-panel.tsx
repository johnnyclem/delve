import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Send, BookOpen, Sparkles, Lock, Scroll, Plus, Trash2, History, Pencil, Check, X, User } from "@/components/ui/pixel-icons";
import { PixelD20Loader } from "@/components/ui/pixel-d20-loader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SafeMarkdown } from "@/components/safe-markdown";
import {
  useGetMyMembership,
  useListChatThreads,
  useListSpeakableCharacters,
  getChatThread,
  deleteChatThread,
  updateChatThread,
  getListChatThreadsQueryKey,
  getGetChatThreadQueryKey,
} from "@workspace/api-client-react";
import type { ChatCitation, ChatThread } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface ChatTurn {
  id: string;
  question: string;
  answer: string | null;
  citations: ChatCitation[];
  edition: "2014" | "2024" | null;
  error: string | null;
  loading: boolean;
}

function CitationBadge({ citation, index, isDm }: { citation: ChatCitation; index: number; isDm: boolean }) {
  const isCampaign = citation.source === "campaign";
  const isHomebrew = citation.source === "homebrew";
  const isCharacter = citation.source === "character";
  const prefix = isCharacter ? "M" : isHomebrew ? "H" : isCampaign ? "C" : "R";
  const tag = `${prefix}${index + 1}`;
  const label = isCharacter
    ? "My character"
    : isHomebrew
    ? "House Rule"
    : citation.source === "srd-2014"
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
        isCharacter
          ? "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200"
          : isHomebrew
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : isCampaign
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-primary/30 bg-primary/10 text-primary"
      } ${citation.sourceUrl ? "hover:bg-primary/20" : ""}`}
      data-testid={`chat-citation-${tag}`}
    >
      <span className="font-mono text-[10px] opacity-80">[{tag}]</span>
      {isCharacter ? (
        <User className="h-3 w-3" />
      ) : isHomebrew ? (
        <Scroll className="h-3 w-3" />
      ) : isCampaign ? (
        <Sparkles className="h-3 w-3" />
      ) : (
        <BookOpen className="h-3 w-3" />
      )}
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

function formatThreadTimestamp(d: string): string {
  const dt = new Date(d);
  const now = new Date();
  const sameDay = dt.toDateString() === now.toDateString();
  return sameDay
    ? dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : dt.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatPanel({ initialConversationId }: { initialConversationId?: number | null }) {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(initialConversationId ?? null);
  const [speakingAsId, setSpeakingAsId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const { data: membership } = useGetMyMembership();
  const isDm = membership?.role === "dm";
  const myUserId = membership?.userId;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { data: threads = [] } = useListChatThreads();
  const { data: speakable = [] } = useListSpeakableCharacters();
  const sortedThreads = useMemo<ChatThread[]>(
    () => [...threads].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [threads],
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  // Auto-load the thread when opened via "Continue in chat" from the ask popover
  useEffect(() => {
    if (!initialConversationId) return;
    loadThread(initialConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // For brand-new conversations, default the picker to the user's sole own character
  // (players only — DMs default to "nobody" so their meta-questions aren't accidentally
  // answered as a single PC).
  useEffect(() => {
    if (conversationId !== null) return;
    if (speakingAsId !== null) return;
    if (isDm) return;
    const own = speakable.filter((c) => c.ownerUserId === myUserId);
    if (own.length === 1) setSpeakingAsId(own[0].id);
  }, [speakable, conversationId, speakingAsId, myUserId, isDm]);

  const startNewConversation = () => {
    setConversationId(null);
    setTurns([]);
    setInput("");
    setHistoryOpen(false);
    // Default: if exactly one own character is speakable AND the caller is a
    // player, pre-select it. DMs default to "nobody".
    const own = speakable.filter((c) => c.ownerUserId === myUserId);
    setSpeakingAsId(!isDm && own.length === 1 ? own[0].id : null);
  };

  const loadThread = async (threadId: number) => {
    setHistoryOpen(false);
    if (threadId === conversationId) return;
    setLoadingThread(true);
    try {
      const detail = await getChatThread(threadId);
      const loaded: ChatTurn[] = [];
      for (let i = 0; i < detail.messages.length; i += 1) {
        const m = detail.messages[i];
        if (m.role === "user") {
          const next = detail.messages[i + 1];
          loaded.push({
            id: `msg-${m.id}`,
            question: m.content,
            answer: next && next.role === "assistant" ? next.content : null,
            citations: [],
            edition: null,
            error: null,
            loading: false,
          });
          if (next && next.role === "assistant") i += 1;
        } else {
          loaded.push({
            id: `msg-${m.id}`,
            question: "",
            answer: m.content,
            citations: [],
            edition: null,
            error: null,
            loading: false,
          });
        }
      }
      setTurns(loaded);
      setConversationId(threadId);
      setSpeakingAsId(detail.thread.speakingAsCharacterId ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load conversation";
      setTurns([{ id: `err-${Date.now()}`, question: "", answer: null, citations: [], edition: null, error: msg, loading: false }]);
    } finally {
      setLoadingThread(false);
    }
  };

  const startRename = (thread: ChatThread, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(thread.id);
    setRenameValue(thread.title);
  };

  const cancelRename = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    setRenamingId(null);
    setRenameValue("");
  };

  const submitRename = async (threadId: number, e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    const trimmed = renameValue.trim();
    if (!trimmed) {
      cancelRename();
      return;
    }
    const current = sortedThreads.find((t) => t.id === threadId);
    if (current && trimmed === current.title) {
      cancelRename();
      return;
    }
    setRenameSubmitting(true);
    try {
      await updateChatThread(threadId, { title: trimmed });
      await queryClient.invalidateQueries({ queryKey: getListChatThreadsQueryKey() });
      setRenamingId(null);
      setRenameValue("");
    } catch {
      // best-effort rename; leave editor open so user can retry.
    } finally {
      setRenameSubmitting(false);
    }
  };

  const handleDeleteThread = async (threadId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteChatThread(threadId);
      await queryClient.invalidateQueries({ queryKey: getListChatThreadsQueryKey() });
      if (threadId === conversationId) {
        startNewConversation();
      }
    } catch {
      // best-effort delete; ignore.
    }
  };

  const updateTurn = (id: string, patch: Partial<ChatTurn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

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

    let accumulated = "";
    let buffer = "";
    let resolvedConversationId: number | null = conversationId;

    const handleEvent = (raw: string) => {
      const lines = raw.split("\n");
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (dataLines.length === 0) return;
      const data = dataLines.join("\n");
      let payload: {
        type: string;
        value?: string;
        error?: string;
        citations?: ChatCitation[];
        edition?: "2014" | "2024";
        conversationId?: number;
      };
      try {
        payload = JSON.parse(data);
      } catch {
        return;
      }
      if (payload.type === "metadata" && typeof payload.conversationId === "number") {
        resolvedConversationId = payload.conversationId;
        setConversationId(payload.conversationId);
      } else if (payload.type === "token" && typeof payload.value === "string") {
        accumulated += payload.value;
        updateTurn(id, { answer: accumulated, loading: true });
      } else if (payload.type === "citations") {
        updateTurn(id, {
          citations: payload.citations ?? [],
          edition: payload.edition ?? null,
        });
      } else if (payload.type === "done") {
        if (typeof payload.conversationId === "number") {
          resolvedConversationId = payload.conversationId;
          setConversationId(payload.conversationId);
        }
        updateTurn(id, { loading: false });
      } else if (payload.type === "error") {
        updateTurn(id, {
          error: payload.error ?? "The assistant ran into a problem.",
          loading: false,
        });
      }
    };

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ message, conversationId, speakingAsCharacterId: speakingAsId }),
      });

      if (!response.ok || !response.body) {
        let detail = `Request failed (${response.status})`;
        try {
          const j = await response.json();
          if (j?.error) detail = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sepIndex: number;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const eventChunk = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);
          if (eventChunk.trim()) handleEvent(eventChunk);
        }
      }
      if (buffer.trim()) handleEvent(buffer);

      setTurns((prev) =>
        prev.map((t) => (t.id === id && t.loading ? { ...t, loading: false } : t)),
      );
      await queryClient.invalidateQueries({ queryKey: getListChatThreadsQueryKey() });
      if (resolvedConversationId !== null) {
        await queryClient.invalidateQueries({
          queryKey: getGetChatThreadQueryKey(resolvedConversationId),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to get a response";
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                answer: accumulated || t.answer,
                error: msg,
                loading: false,
              }
            : t,
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full" data-testid="chat-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
            <MessageSquare className="h-6 w-6 text-primary" />
            Ask the Lorekeeper
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ask questions about D&D rules or this campaign's lore. Follow-ups remember the conversation — citations
            still appear on each answer.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryOpen((v) => !v)}
            data-testid="chat-history-toggle"
          >
            <History className="h-4 w-4 mr-1" />
            History
            {sortedThreads.length > 0 && (
              <span className="ml-1 text-[10px] opacity-70">({sortedThreads.length})</span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={startNewConversation}
            disabled={turns.length === 0 && conversationId === null}
            data-testid="chat-new-conversation"
          >
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>
      </div>

      {historyOpen && (
        <div className="rounded-2xl glass-panel p-3 max-h-64 overflow-auto" data-testid="chat-history-list">
          {sortedThreads.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No prior conversations yet.</p>
          ) : (
            <ul className="divide-y divide-[rgba(255,255,255,0.06)]">
              {sortedThreads.map((t) => {
                const isRenaming = renamingId === t.id;
                return (
                  <li
                    key={t.id}
                    className={`flex items-center gap-2 px-2 py-2 rounded ${
                      isRenaming ? "bg-primary/10" : "cursor-pointer hover:bg-primary/10"
                    } ${t.id === conversationId && !isRenaming ? "bg-primary/10" : ""}`}
                    onClick={() => {
                      if (!isRenaming) loadThread(t.id);
                    }}
                    data-testid={`chat-history-item-${t.id}`}
                  >
                    <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <input
                          type="text"
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void submitRename(t.id, e);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelRename(e);
                            }
                          }}
                          maxLength={200}
                          disabled={renameSubmitting}
                          className="w-full bg-background/40 border border-primary/40 rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          data-testid={`chat-history-rename-input-${t.id}`}
                        />
                      ) : (
                        <p className="text-sm text-foreground truncate">{t.title}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">{formatThreadTimestamp(t.updatedAt)}</p>
                    </div>
                    {isRenaming ? (
                      <>
                        <button
                          type="button"
                          onClick={(e) => void submitRename(t.id, e)}
                          disabled={renameSubmitting}
                          className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary disabled:opacity-50"
                          aria-label="Save new name"
                          data-testid={`chat-history-rename-save-${t.id}`}
                        >
                          {renameSubmitting ? (
                            <PixelD20Loader className="h-3.5 w-3.5" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => cancelRename(e)}
                          disabled={renameSubmitting}
                          className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive disabled:opacity-50"
                          aria-label="Cancel rename"
                          data-testid={`chat-history-rename-cancel-${t.id}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={(e) => startRename(t, e)}
                          className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary"
                          aria-label="Rename conversation"
                          data-testid={`chat-history-rename-${t.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteThread(t.id, e)}
                          className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                          aria-label="Delete conversation"
                          data-testid={`chat-history-delete-${t.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto space-y-6 pr-1" data-testid="chat-scroll">
        {loadingThread && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm justify-center py-6">
            <PixelD20Loader className="h-4 w-4" />
            Loading conversation…
          </div>
        )}
        {!loadingThread && turns.length === 0 && (
          <div className="rounded-2xl glass-panel p-8 text-center text-muted-foreground" data-testid="chat-empty">
            <Sparkles className="h-6 w-6 mx-auto mb-3 text-primary" />
            <p className="text-sm">Try: <span className="text-foreground">"Who was the bartender in Tessringale?"</span></p>
            <p className="text-sm mt-1">Then follow up: <span className="text-foreground">"What about her sister?"</span></p>
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
              {turn.question && (
                <div className="flex justify-end">
                  <div className="rounded-2xl glass-panel px-4 py-2 max-w-[80%]" data-testid="chat-question">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{turn.question}</p>
                  </div>
                </div>
              )}
              {(turn.loading || turn.error || turn.answer) && (
                <div className="rounded-2xl glass-panel p-4 space-y-3" data-testid="chat-answer">
                  {turn.loading && !turn.answer && (
                    <div
                      className="flex items-center gap-2 text-muted-foreground text-sm"
                      data-testid="chat-loading"
                    >
                      <PixelD20Loader className="h-4 w-4" />
                      Searching the archives…
                    </div>
                  )}
                  {turn.answer && (
                    <SafeMarkdown
                      content={turn.answer}
                      loading={turn.loading}
                      cursor={turn.loading}
                    />
                  )}
                  {turn.error && (
                    <p className="text-sm text-destructive" data-testid="chat-error">
                      {turn.error}
                    </p>
                  )}
                  {turn.citations.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
                      {turn.citations.map((c, i) => (
                        <CitationBadge key={`${turn.id}-${i}`} citation={c} index={i} isDm={!!isDm} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {(() => {
        const ownChars = speakable.filter((c) => c.ownerUserId === myUserId);
        // A player with exactly one own character and no DM-view options gets a
        // static label (no dropdown chrome) — auto-pick is unambiguous.
        const isStaticSinglePlayer =
          !isDm && ownChars.length === 1 && speakable.length === 1;
        const persistOnChange = (nextId: number | null) => {
          setSpeakingAsId(nextId);
          if (conversationId !== null) {
            void updateChatThread(conversationId, { speakingAsCharacterId: nextId })
              .then(() =>
                queryClient.invalidateQueries({
                  queryKey: getGetChatThreadQueryKey(conversationId),
                }),
              )
              .catch(() => {
                /* best-effort; the next /chat call will also persist. */
              });
          }
        };
        const fmtChar = (c: (typeof speakable)[number]): string => {
          const meta = [c.race, c.class].filter(Boolean).join(" ");
          const isOwn = c.ownerUserId === myUserId;
          return `${c.name}${meta ? ` — ${meta}` : ""}${c.level ? ` (lvl ${c.level})` : ""}${
            !isOwn ? ` · ${c.ownerDisplayName}` : ""
          }`;
        };

        if (isStaticSinglePlayer) {
          const sole = ownChars[0];
          return (
            <div
              className="rounded-2xl glass-panel px-3 py-2 flex items-center gap-2 shrink-0 text-xs text-muted-foreground"
              data-testid="chat-speaking-as"
            >
              <User className="h-3.5 w-3.5 text-fuchsia-300" />
              <span>Speaking as</span>
              <span
                className="font-medium text-foreground"
                data-testid="chat-speaking-as-static"
              >
                {fmtChar(sole)}
              </span>
              <span className="text-[10px] opacity-70">
                Personal questions will use this sheet.
              </span>
            </div>
          );
        }

        return (
          <div
            className="rounded-2xl glass-panel px-3 py-2 flex items-center gap-2 shrink-0 text-xs text-muted-foreground"
            data-testid="chat-speaking-as"
          >
            <User className="h-3.5 w-3.5 text-fuchsia-300" />
            <span>Speaking as</span>
            {speakable.length === 0 ? (
              <span
                className="font-medium text-foreground"
                data-testid="chat-speaking-as-static"
              >
                nobody
              </span>
            ) : (
              <select
                value={speakingAsId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  persistOnChange(v === "" ? null : Number(v));
                }}
                className="bg-background/40 border border-[rgba(255,255,255,0.1)] rounded px-2 py-1 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-fuchsia-400/50"
                data-testid="chat-speaking-as-select"
              >
                <option value="">nobody (rules-only)</option>
                {speakable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {fmtChar(c)}
                  </option>
                ))}
              </select>
            )}
            {speakingAsId !== null && speakable.length > 0 && (
              <span className="text-[10px] opacity-70">
                Personal questions (HP, spells, inventory) will use this sheet.
              </span>
            )}
          </div>
        );
      })()}

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
          placeholder={
            conversationId
              ? "Ask a follow-up — the assistant remembers earlier turns…"
              : "Ask about a rule or someone in the campaign…"
          }
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
          {submitting ? <PixelD20Loader className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
