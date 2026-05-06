import { useState } from "react";
import { Edit, Heart, Shield, Zap, ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetCharacter, useUpdateCharacter, getListCharactersQueryKey, getGetCharacterQueryKey, useGetMyMembership } from "@workspace/api-client-react";
import type { Character, CharacterSheet } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AnimatedBorder } from "@/components/ui/animated-border";

export default function CharacterDetail({ id, onBack }: { id: number; onBack?: () => void }) {
  const { user } = useUser();
  const { data: membership } = useGetMyMembership();
  const { data: character, isLoading } = useGetCharacter(id, { query: { queryKey: getGetCharacterQueryKey(id) } });
  const updateMutation = useUpdateCharacter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editSheet, setEditSheet] = useState<CharacterSheet | null>(null);

  const char = character as Character | undefined;
  const isOwner = char?.ownerUserId === user?.id;
  const isDm = membership?.role === "dm";
  const canExport = (isOwner || isDm) && !editing && !!char;
  const sheet: CharacterSheet | undefined = editing ? (editSheet ?? undefined) : char?.sheetJson;

  const startEditing = () => {
    if (!char) return;
    setEditSheet({ ...char.sheetJson });
    setEditing(true);
  };

  const saveChanges = () => {
    if (!editSheet) return;
    updateMutation.mutate(
      { id, data: { sheetJson: editSheet } },
      {
        onSuccess: () => {
          setEditing(false);
          queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey() });
          toast({ title: "Character updated!" });
        },
      },
    );
  };

  const pdfUrl = `${import.meta.env.BASE_URL}api/characters/${id}/pdf`;

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 rounded-2xl" /></div>;
  }

  if (!char) {
    return <p className="text-muted-foreground">Character not found.</p>;
  }

  return (
    <div className="space-y-6" data-testid="character-detail">
      <div className="flex items-center gap-3 flex-wrap">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-characters">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        )}
        {isOwner && !editing && (
          <Button variant="outline" size="sm" onClick={startEditing} data-testid="button-edit-character">
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
        )}
        {editing && (
          <>
            <Button size="sm" onClick={saveChanges} disabled={updateMutation.isPending} data-testid="button-save-character">
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
          </>
        )}
        {canExport && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              data-testid={`button-print-character-pdf-${id}`}
              onClick={() => toast({ title: "Building your sheet…" })}
            >
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                <Printer className="h-4 w-4 mr-1" />
                Print
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              data-testid={`button-download-character-pdf-${id}`}
              onClick={() => toast({ title: "Building your sheet…" })}
            >
              <a href={`${pdfUrl}?download=1`} download>
                <Download className="h-4 w-4 mr-1" />
                Download PDF
              </a>
            </Button>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-2xl font-semibold text-foreground tracking-tight" data-testid="text-character-name">{char.name}</h2>
        <p className="text-muted-foreground">
          Level <span className="font-mono tabular-nums">{char.level}</span> {char.race} {char.class} — played by {char.ownerDisplayName}
        </p>
      </div>

      {sheet && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatedBorder className="p-5">
            <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
              <Heart className="h-4 w-4 text-red-400" /> Hit Points
            </h3>
            <div className="flex items-baseline gap-1">
              {editing && editSheet ? (
                <Input
                  type="number"
                  value={editSheet.currentHp ?? 0}
                  onChange={(e) => setEditSheet({ ...editSheet, currentHp: parseInt(e.target.value) || 0 })}
                  className="w-20 font-mono text-lg tabular-nums"
                  data-testid="input-current-hp"
                />
              ) : (
                <span className="font-mono text-2xl font-bold text-foreground tabular-nums" data-testid="text-current-hp">{sheet.currentHp ?? 0}</span>
              )}
              <span className="text-muted-foreground text-sm font-mono tabular-nums">/ {sheet.maxHp ?? 0}</span>
            </div>
          </AnimatedBorder>

          <div className="rounded-2xl glass-panel p-5">
            <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-400" /> Armor Class
            </h3>
            <span className="font-mono text-2xl font-bold text-foreground tabular-nums" data-testid="text-armor-class">{sheet.armorClass ?? 10}</span>
          </div>

          <div className="rounded-2xl glass-panel p-5">
            <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-400" /> Speed
            </h3>
            <span className="font-mono text-2xl font-bold text-foreground tabular-nums">{sheet.speed ?? 30} ft</span>
          </div>

          <div className="rounded-2xl glass-panel p-5 md:col-span-2 lg:col-span-3">
            <h3 className="font-semibold text-sm text-foreground mb-3">Ability Scores</h3>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const).map((stat) => {
                const val = sheet[stat] ?? 10;
                const mod = Math.floor((val - 10) / 2);
                return (
                  <div key={stat} className="text-center p-2 rounded-lg bg-[rgba(255,255,255,0.03)]">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{stat.slice(0, 3)}</p>
                    {editing && editSheet ? (
                      <Input
                        type="number"
                        value={editSheet[stat] ?? 10}
                        onChange={(e) => setEditSheet({ ...editSheet, [stat]: parseInt(e.target.value) || 10 })}
                        className="w-14 mx-auto text-center font-mono text-sm tabular-nums"
                        data-testid={`input-${stat}`}
                      />
                    ) : (
                      <p className="font-mono text-lg font-bold text-foreground tabular-nums" data-testid={`text-${stat}`}>{val}</p>
                    )}
                    <p className="text-xs text-muted-foreground font-mono tabular-nums">{mod >= 0 ? `+${mod}` : mod}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {sheet.inventory && sheet.inventory.length > 0 && (
            <div className="rounded-2xl glass-panel p-5 md:col-span-2 lg:col-span-3">
              <h3 className="font-semibold text-sm text-foreground mb-3">Inventory</h3>
              <div className="flex flex-wrap gap-2">
                {sheet.inventory.map((item: string, i: number) => (
                  <span key={i} className="px-2 py-1 bg-[rgba(255,255,255,0.04)] rounded text-xs text-foreground">{item}</span>
                ))}
              </div>
            </div>
          )}

          {(sheet.notes || editing) && (
            <div className="rounded-2xl glass-panel p-5 md:col-span-2 lg:col-span-3">
              <h3 className="font-semibold text-sm text-foreground mb-3">Notes</h3>
              {editing && editSheet ? (
                <Textarea
                  value={editSheet.notes ?? ""}
                  onChange={(e) => setEditSheet({ ...editSheet, notes: e.target.value })}
                  rows={4}
                  data-testid="input-notes"
                />
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{sheet.notes}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
