import { useState } from "react";
import { Scroll, Plus, Pencil, Trash2, EyeOff, Share2, Copy, ExternalLink, RefreshCw, Printer } from "@workspace/ui";
import { PixelD20Loader } from "@workspace/ui";
import { SafeMarkdown } from "@/components/safe-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@workspace/ui";
import { Input } from "@workspace/ui";
import { Textarea } from "@workspace/ui";
import {
  useListHomebrewRules,
  useCreateHomebrewRule,
  useUpdateHomebrewRule,
  useDeleteHomebrewRule,
  useGetMyMembership,
  useGetHouseRulesShareToken,
  useCreateHouseRulesShareToken,
  getListHomebrewRulesQueryKey,
  getGetHouseRulesShareTokenQueryKey,
  type HomebrewRule,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@workspace/ui";



interface RuleEditorProps {
  initial: { title: string; bodyMd: string };
  busy: boolean;
  onCancel: () => void;
  onSave: (data: { title: string; bodyMd: string }) => void;
  testIdPrefix: string;
}

function RuleEditor({ initial, busy, onCancel, onSave, testIdPrefix }: RuleEditorProps) {
  const [title, setTitle] = useState(initial.title);
  const [bodyMd, setBodyMd] = useState(initial.bodyMd);
  const canSave = title.trim().length > 0 && bodyMd.trim().length > 0 && !busy;

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-editor`}>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Critical hits deal max + roll"
          maxLength={160}
          data-testid={`${testIdPrefix}-input-title`}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Rule body (markdown)</label>
        <Textarea
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          rows={6}
          placeholder="Describe how this house rule overrides or extends the standard 5e rule…"
          maxLength={20000}
          data-testid={`${testIdPrefix}-input-body`}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy} data-testid={`${testIdPrefix}-cancel`}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => canSave && onSave({ title: title.trim(), bodyMd })}
          disabled={!canSave}
          data-testid={`${testIdPrefix}-save`}
        >
          {busy ? <PixelD20Loader className="h-4 w-4" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}

export default function HomebrewPanel() {
  const { data: membership } = useGetMyMembership();
  const isDm = membership?.role === "dm";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useListHomebrewRules({
    query: { queryKey: RULES_KEY },
  });
  const rules = (data ?? []) as HomebrewRule[];

  const createMut = useCreateHomebrewRule();
  const updateMut = useUpdateHomebrewRule();
  const deleteMut = useDeleteHomebrewRule();

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showShare, setShowShare] = useState(false);

  const { data: shareData, isLoading: shareLoading } = useGetHouseRulesShareToken({
    query: { enabled: isDm && showShare, queryKey: getGetHouseRulesShareTokenQueryKey() },
  });
  const createShareMut = useCreateHouseRulesShareToken();
  const shareToken = (shareData as { token: string | null } | undefined)?.token ?? null;
  const shareUrl = shareToken
    ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/share/house-rules/${shareToken}`
    : null;

  const ensureToken = (rotate: boolean) => {
    createShareMut.mutate(
      { data: { rotate } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetHouseRulesShareTokenQueryKey() });
          if (rotate) toast({ title: "Share link rotated" });
        },
        onError: (err) => toast({ title: "Failed to update share link", description: (err as Error).message, variant: "destructive" }),
      },
    );
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied to clipboard" });
    } catch {
      toast({ title: "Couldn't copy link", description: "Copy it manually instead.", variant: "destructive" });
    }
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListHomebrewRulesQueryKey() });

  const handleCreate = (vals: { title: string; bodyMd: string }) => {
    createMut.mutate(
      { data: vals },
      {
        onSuccess: () => {
          toast({ title: "House rule created" });
          setCreating(false);
          invalidate();
        },
        onError: (err) => toast({ title: "Failed to create", description: (err as Error).message, variant: "destructive" }),
      },
    );
  };

  const handleUpdate = (id: number, vals: { title: string; bodyMd: string }) => {
    updateMut.mutate(
      { id, data: vals },
      {
        onSuccess: () => {
          toast({ title: "House rule updated" });
          setEditingId(null);
          invalidate();
        },
        onError: (err) => toast({ title: "Failed to update", description: (err as Error).message, variant: "destructive" }),
      },
    );
  };

  const handleDelete = (id: number, title: string) => {
    if (!window.confirm(`Deactivate house rule "${title}"? It will no longer apply to AI answers.`)) return;
    deleteMut.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "House rule deactivated" });
          invalidate();
        },
        onError: (err) => toast({ title: "Failed to delete", description: (err as Error).message, variant: "destructive" }),
      },
    );
  };

  const handleReactivate = (rule: HomebrewRule) => {
    updateMut.mutate(
      { id: rule.id, data: { active: true } },
      {
        onSuccess: () => {
          toast({ title: "House rule reactivated" });
          invalidate();
        },
        onError: (err) => toast({ title: "Failed to reactivate", description: (err as Error).message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-6" data-testid="homebrew-panel">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
            <Scroll className="h-6 w-6 text-primary" />
            House Rules
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            DM-authored overrides to standard 5e mechanics. The AI assistant cites these as
            "House Rule" and prefers them over the SRD when they conflict.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isDm && (
            <Button
              variant="outline"
              onClick={() => {
                setShowShare((s) => !s);
                if (!showShare && !shareToken) ensureToken(false);
              }}
              data-testid="button-share-house-rules"
            >
              <Share2 className="h-4 w-4 mr-1" />
              Share
            </Button>
          )}
          {isDm && !creating && (
            <Button onClick={() => setCreating(true)} data-testid="button-new-house-rule">
              <Plus className="h-4 w-4 mr-1" />
              New rule
            </Button>
          )}
        </div>
      </div>

      {isDm && showShare && (
        <div className="rounded-2xl glass-panel p-4 space-y-3" data-testid="share-house-rules-panel">
          <div className="flex items-start gap-2">
            <Share2 className="h-4 w-4 text-primary mt-1 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground">Shareable read-only link</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Anyone with this link can view your active house rules in a clean, print-friendly page —
                no sign-in required. Inactive rules are hidden. Rotate the link if you ever need to revoke access.
              </p>
            </div>
          </div>
          {(shareLoading || createShareMut.isPending) && !shareUrl ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <PixelD20Loader className="h-4 w-4" /> Preparing link…
            </div>
          ) : shareUrl ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                  data-testid="input-share-url"
                />
                <Button variant="secondary" size="sm" onClick={copyShareUrl} data-testid="button-copy-share-url">
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" asChild data-testid="button-open-share-url">
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" /> Open
                  </a>
                </Button>
                <Button variant="ghost" size="sm" asChild data-testid="button-print-share-url">
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                    <Printer className="h-4 w-4 mr-1" /> Printable view
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (window.confirm("Rotate the share link? The current link will stop working.")) {
                      ensureToken(true);
                    }
                  }}
                  disabled={createShareMut.isPending}
                  data-testid="button-rotate-share-url"
                >
                  <RefreshCw className="h-4 w-4 mr-1" /> Rotate
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={() => ensureToken(false)} disabled={createShareMut.isPending}>
              Generate link
            </Button>
          )}
        </div>
      )}

      {creating && isDm && (
        <div className="rounded-2xl glass-panel p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">New house rule</h3>
          <RuleEditor
            initial={{ title: "", bodyMd: "" }}
            busy={createMut.isPending}
            onCancel={() => setCreating(false)}
            onSave={handleCreate}
            testIdPrefix="create"
          />
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <PixelD20Loader className="h-4 w-4" /> Loading…
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive" data-testid="text-homebrew-error">
          {(error as Error).message}
        </p>
      )}

      {!isLoading && rules.length === 0 && (
        <div className="rounded-2xl glass-panel p-8 text-center text-muted-foreground" data-testid="text-homebrew-empty">
          {isDm
            ? "No house rules yet. Add one above to override standard 5e mechanics."
            : "Your DM hasn't published any house rules yet."}
        </div>
      )}

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {rules.map((rule) => (
            <motion.div
              key={rule.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`rounded-2xl glass-panel p-4 ${rule.active ? "" : "opacity-60"}`}
              data-testid={`house-rule-${rule.id}`}
            >
              {editingId === rule.id ? (
                <RuleEditor
                  initial={{ title: rule.title, bodyMd: rule.bodyMd }}
                  busy={updateMut.isPending}
                  onCancel={() => setEditingId(null)}
                  onSave={(vals) => handleUpdate(rule.id, vals)}
                  testIdPrefix={`edit-${rule.id}`}
                />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-foreground flex items-center gap-2" data-testid="text-rule-title">
                        {rule.title}
                        {!rule.active && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            <EyeOff className="h-3 w-3" /> inactive
                          </span>
                        )}
                      </h3>
                    </div>
                    {isDm && (
                      <div className="flex gap-1 shrink-0">
                        {!rule.active && (
                          <Button variant="ghost" size="sm" onClick={() => handleReactivate(rule)} data-testid={`button-reactivate-${rule.id}`}>
                            Reactivate
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => setEditingId(rule.id)} data-testid={`button-edit-${rule.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {rule.active && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(rule.id, rule.title)}
                            data-testid={`button-delete-${rule.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <SafeMarkdown content={rule.bodyMd} className="prose prose-sm prose-invert max-w-none text-foreground/90 mt-2" testId="text-rule-body" />
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
