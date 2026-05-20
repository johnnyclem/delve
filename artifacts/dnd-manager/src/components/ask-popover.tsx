import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Send, Loader2, Sparkles, MessageSquare, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatCitation } from "@workspace/api-client-react";
import { useChatNav } from "@/contexts/chat-nav-context";
import { SafeMarkdown } from "@/components/safe-markdown";

export interface AskPopoverEntity {
  name: string;
  entityType: "character" | "campaign_entity";
  entityId: number;
  entityKind?: string;
}

interface AskPopoverProps {
  entity: AskPopoverEntity;
  triggerPosition: { x: number; y: number };
  onClose: () => void;
}

interface ChatTurn {
  id: string;
  question: string;
  answer: string | null;
  error: string | null;
  loading: boolean;
  citations: ChatCitation[];
}

function getSuggestedPrompts(entity: AskPopoverEntity): string[] {
  const kind = entity.entityKind ?? entity.entityType;
  switch (kind) {
    case "character":
      return [
        "What plot hooks involve them?",
        "Summarize what we know",
        "Any relevant rules for their class?",
      ];
    case "npc":
      return [
        "What plot hooks involve them?",
        "Summarize what we know",
        "What's their motivation?",
      ];
    case "location":
      return [
        "What notable features does this place have?",
        "Summarize what we know",
        "What encounters might happen here?",
      ];
    case "faction":
      return [
        "What plot hooks involve this faction?",
        "Summarize what we know",
        "Who leads them?",
      ];
    case "quest":
      return [
        "What are the key objectives?",
        "Summarize what we know",
        "Any related plot hooks?",
      ];
    default:
      return [
        "What plot hooks involve this?",
        "Summarize what we know",
        "Any relevant rules?",
      ];
  }
}

function computePopoverPosition(
  triggerX: number,
  triggerY: number,
  popoverWidth: number,
  popoverHeight: number,
): { top: number; left: number } {
  const margin = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = triggerX - popoverWidth / 2;
  if (left < margin) left = margin;
  if (left + popoverWidth > vw - margin) left = vw - popoverWidth - margin;

  let top = triggerY - popoverHeight - 12;
  if (top < margin) {
    top = triggerY + 20;
  }
  if (top + popoverHeight > vh - margin) {
    top = vh - popoverHeight - margin;
  }

  return { top, left };
}

export function AskPopover({ entity, triggerPosition, onClose }: AskPopoverProps) {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { openWithConversation } = useChatNav();

  const POPOVER_WIDTH = 380;
  const POPOVER_MAX_HEIGHT = 520;

  const position = computePopoverPosition(
    triggerPosition.x,
    triggerPosition.y,
    POPOVER_WIDTH,
    POPOVER_MAX_HEIGHT,
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const updateTurn = useCallback((id: string, patch: Partial<ChatTurn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const handleSubmit = useCallback(
    async (message?: string) => {
      const text = (message ?? input).trim();
      if (!text || submitting) return;
      setSubmitting(true);
      if (!message) setInput("");

      const turnId = `t-${Date.now()}`;
      const turn: ChatTurn = {
        id: turnId,
        question: text,
        answer: null,
        error: null,
        loading: true,
        citations: [],
      };
      setTurns((prev) => [...prev, turn]);

      let accumulated = "";
      let buffer = "";
      let resolvedConversationId = conversationId;

      const handleEvent = (raw: string) => {
        const lines = raw.split("\n");
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          }
        }
        if (!dataLines.length) return;
        const data = dataLines.join("\n");
        let payload: {
          type: string;
          value?: string;
          error?: string;
          citations?: ChatCitation[];
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
          updateTurn(turnId, { answer: accumulated, loading: true });
        } else if (payload.type === "citations") {
          updateTurn(turnId, { citations: payload.citations ?? [] });
        } else if (payload.type === "done") {
          if (typeof payload.conversationId === "number") {
            resolvedConversationId = payload.conversationId;
            setConversationId(payload.conversationId);
          }
          updateTurn(turnId, { loading: false });
        } else if (payload.type === "error") {
          updateTurn(turnId, {
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
          body: JSON.stringify({
            message: text,
            conversationId,
            primedContext: {
              entityType: entity.entityType,
              entityId: entity.entityId,
              entityName: entity.name,
            },
          }),
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
          prev.map((t) => (t.id === turnId && t.loading ? { ...t, loading: false } : t)),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to get a response";
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId
              ? { ...t, answer: accumulated || t.answer, error: msg, loading: false }
              : t,
          ),
        );
      } finally {
        setSubmitting(false);
      }
    },
    [input, submitting, conversationId, entity, updateTurn],
  );

  const handleContinueInChat = () => {
    openWithConversation(conversationId);
    onClose();
  };

  const suggestedPrompts = getSuggestedPrompts(entity);
  const hasResponse = turns.length > 0;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={popoverRef}
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          width: POPOVER_WIDTH,
          zIndex: 9999,
        }}
        className="rounded-2xl glass-panel shadow-2xl border border-[rgba(255,255,255,0.12)] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`Ask about ${entity.name}`}
        data-testid="ask-popover"
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[rgba(255,255,255,0.06)]">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Ask about{" "}
            <span className="text-primary truncate max-w-[180px]">{entity.name}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-[rgba(255,255,255,0.06)] transition-colors"
            aria-label="Close"
            data-testid="ask-popover-close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-2 space-y-3"
          style={{ maxHeight: 320 }}
        >
          {!hasResponse && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
                Suggested
              </p>
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handleSubmit(prompt)}
                  disabled={submitting}
                  className="w-full text-left rounded-xl px-3 py-2 text-sm text-foreground/80 hover:text-foreground hover:bg-primary/10 border border-[rgba(255,255,255,0.06)] hover:border-primary/30 transition-colors disabled:opacity-50"
                  data-testid="ask-popover-suggested"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence initial={false}>
            {turns.map((turn) => (
              <motion.div
                key={turn.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
              >
                {turn.question && (
                  <div className="flex justify-end">
                    <div className="rounded-xl glass-panel px-3 py-1.5 max-w-[85%]">
                      <p className="text-xs text-foreground">{turn.question}</p>
                    </div>
                  </div>
                )}
                {(turn.loading || turn.error || turn.answer) && (
                  <div className="rounded-xl glass-panel p-3 space-y-2">
                    {turn.loading && !turn.answer && (
                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Consulting the archives…
                      </div>
                    )}
                    {turn.answer && (
                      <SafeMarkdown
                        content={turn.answer}
                        loading={turn.loading}
                        cursor={turn.loading}
                        className="prose prose-xs prose-invert max-w-none text-foreground/90 text-xs leading-relaxed"
                      />
                    )}
                    {turn.error && (
                      <p className="text-xs text-destructive">{turn.error}</p>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="px-3 pb-3 pt-2 space-y-2 border-t border-[rgba(255,255,255,0.06)]">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder={
                hasResponse
                  ? "Ask a follow-up…"
                  : `Ask about ${entity.name}…`
              }
              rows={2}
              className="resize-none bg-transparent border border-[rgba(255,255,255,0.1)] text-sm rounded-xl focus-visible:ring-1 focus-visible:ring-primary/50"
              disabled={submitting}
              data-testid="ask-popover-input"
            />
            <Button
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={submitting || !input.trim()}
              className="shrink-0"
              data-testid="ask-popover-send"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {conversationId !== null && (
            <button
              type="button"
              onClick={handleContinueInChat}
              className="flex items-center gap-1.5 text-xs text-primary/80 hover:text-primary transition-colors"
              data-testid="ask-popover-continue"
            >
              <MessageSquare className="h-3 w-3" />
              Continue in full chat
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

interface EntityNameWithAskProps {
  entity: AskPopoverEntity;
  children: React.ReactNode;
  className?: string;
  tabIndex?: number;
}

export function EntityNameWithAsk({
  entity,
  children,
  className = "",
  tabIndex,
}: EntityNameWithAskProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [triggerPosition, setTriggerPosition] = useState({ x: 0, y: 0 });
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const suppressCtxRef = useRef(false);
  const THRESHOLD = 450;
  const MOVE_THRESHOLD = 10;

  const openPopover = (x: number, y: number) => {
    firedRef.current = true;
    suppressCtxRef.current = true;
    setTimeout(() => {
      suppressCtxRef.current = false;
    }, 400);
    setTriggerPosition({ x, y });
    setPopoverOpen(true);
  };

  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    startPosRef.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    firedRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    holdTimerRef.current = setTimeout(() => openPopover(e.clientX, e.clientY), THRESHOLD);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!startPosRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) cancelHold();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (suppressCtxRef.current) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    cancelHold();
    openPopover(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    firedRef.current = false;
    startPosRef.current = { x: t.clientX, y: t.clientY };
    holdTimerRef.current = setTimeout(() => openPopover(t.clientX, t.clientY), THRESHOLD);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!startPosRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startPosRef.current.x;
    const dy = t.clientY - startPosRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) cancelHold();
  };

  const askButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <span
      className={`inline-flex items-center gap-0.5 group/ask relative ${className}`}
    >
      <span
        onMouseDown={handleMouseDown}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchEnd={cancelHold}
        onTouchMove={handleTouchMove}
        onContextMenu={handleContextMenu}
        tabIndex={tabIndex}
        onKeyDown={(e) => {
          if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            openPopover(rect.left + rect.width / 2, rect.bottom);
          }
        }}
        className="cursor-default select-text"
      >
        {children}
      </span>
      <button
        ref={askButtonRef}
        type="button"
        aria-label={`Ask about ${entity.name}`}
        title={`Ask about ${entity.name}`}
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          openPopover(rect.left + rect.width / 2, rect.top);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            openPopover(rect.left + rect.width / 2, rect.top);
          }
        }}
        className="opacity-0 group-hover/ask:opacity-100 focus:opacity-100 transition-opacity ml-0.5 rounded p-0.5 text-primary/70 hover:text-primary hover:bg-primary/10"
        data-testid={`ask-btn-${entity.name.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <Sparkles className="h-3 w-3" />
      </button>

      {popoverOpen && (
        <AskPopover
          entity={entity}
          triggerPosition={triggerPosition}
          onClose={() => setPopoverOpen(false)}
        />
      )}
    </span>
  );
}
