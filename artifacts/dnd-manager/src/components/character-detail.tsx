import { useState, useRef } from "react";
import { Edit, Heart, Shield, Zap, ArrowLeft, Download, Printer, Pencil, Upload, User as UserIcon, Link as LinkIcon, TrendingUp, Trash2, X, Check, ChevronDown, History, Sparkles, Dice5 } from "lucide-react";
import LevelUpModal from "@/components/level-up-modal";
import { Button } from "@/components/ui/button";
import { useGetCharacter, useUpdateCharacter, getListCharactersQueryKey, getGetCharacterQueryKey, useGetMyMembership, useGetCampaign } from "@workspace/api-client-react";
import type { Character, CharacterSheet } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AnimatedBorder } from "@/components/ui/animated-border";
import {
  DND_RACES,
  DND_CLASSES,
  CUSTOM_OPTION_VALUE,
  proficiencyBonusForLevel,
  computeLevelUpSuggestion,
  suggestionHasChanges,
  ABILITY_ORDER,
  type AbilityName,
  type LevelUpSuggestion,
  type SpellSlotMap,
} from "@/lib/dnd-options";
import { getFeat } from "@/lib/dnd-feats";
import { PortraitCropperDialog } from "@/components/portrait-cropper-dialog";

type AsiEntry = NonNullable<CharacterSheet["asiHistory"]>[number];

const ABILITY_SHORT: Record<AbilityName, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

interface DetailsDraft {
  name: string;
  raceSelect: string;
  customRace: string;
  classSelect: string;
  customClass: string;
  level: number;
}

const buildDetailsDraft = (char: Character): DetailsDraft => ({
  name: char.name,
  raceSelect: DND_RACES.includes(char.race) ? char.race : CUSTOM_OPTION_VALUE,
  customRace: DND_RACES.includes(char.race) ? "" : char.race,
  classSelect: DND_CLASSES.includes(char.class) ? char.class : CUSTOM_OPTION_VALUE,
  customClass: DND_CLASSES.includes(char.class) ? "" : char.class,
  level: char.level,
});

export default function CharacterDetail({ id, onBack }: { id: number; onBack?: () => void }) {
  const { user } = useUser();
  const { data: membership } = useGetMyMembership();
  const { data: campaign } = useGetCampaign();
  const homebrewRules = campaign?.homebrewRules ?? null;
  const { data: character, isLoading } = useGetCharacter(id, { query: { queryKey: getGetCharacterQueryKey(id) } });
  const updateMutation = useUpdateCharacter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editSheet, setEditSheet] = useState<CharacterSheet | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState<DetailsDraft | null>(null);
  const [applyLevelUp, setApplyLevelUp] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSource, setCropSource] = useState<{ src: string; name: string; type: string } | null>(null);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [levelUpTarget, setLevelUpTarget] = useState<number | null>(null);
  const [asiPopoverOpenIdx, setAsiPopoverOpenIdx] = useState<number | null>(null);
  const [asiEditingIdx, setAsiEditingIdx] = useState<number | null>(null);
  const [asiEditDraft, setAsiEditDraft] = useState<AsiEntry | null>(null);
  const [asiRemoveIdx, setAsiRemoveIdx] = useState<number | null>(null);

  const char = character as Character | undefined;
  const isOwner = char?.ownerUserId === user?.id;
  const isDm = membership?.role === "dm";
  const canEditDetails = (isOwner || isDm) && !!char;
  const canExport = (isOwner || isDm) && !!char;
  const exportDisabled = editing || editingDetails;
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

  const startEditingDetails = () => {
    if (!char) return;
    setDetailsDraft(buildDetailsDraft(char));
    setApplyLevelUp(true);
    setEditingDetails(true);
  };

  const cancelEditingDetails = () => {
    setEditingDetails(false);
    setDetailsDraft(null);
  };

  const resolvedDraftRace = detailsDraft
    ? (detailsDraft.raceSelect === CUSTOM_OPTION_VALUE ? detailsDraft.customRace : detailsDraft.raceSelect)
    : "";
  const resolvedDraftClass = detailsDraft
    ? (detailsDraft.classSelect === CUSTOM_OPTION_VALUE ? detailsDraft.customClass : detailsDraft.classSelect)
    : "";
  const detailsValid = !!detailsDraft
    && detailsDraft.name.trim() !== ""
    && resolvedDraftRace.trim() !== ""
    && resolvedDraftClass.trim() !== ""
    && detailsDraft.level >= 1
    && detailsDraft.level <= 20;

  const levelChanged = !!detailsDraft && !!char && detailsDraft.level !== char.level;
  const levelIncreased = !!detailsDraft && !!char && detailsDraft.level > char.level;
  const currentProficiencyBonus = char?.sheetJson?.proficiencyBonus ?? 2;
  const expectedForOldLevel = char ? proficiencyBonusForLevel(char.level, homebrewRules) : 2;
  // Auto-progression is suppressed in two cases:
  //   1. The campaign disables proficiency auto-progression entirely
  //      (proficiencyBonusForLevel returns null).
  //   2. The character's existing bonus already diverges from what the
  //      active rule would produce for their current level — treat that
  //      as an intentional per-character override and don't clobber it.
  const autoProgressionDisabled = expectedForOldLevel === null;
  const hasPerCharacterOverride =
    !!char && expectedForOldLevel !== null && currentProficiencyBonus !== expectedForOldLevel;
  const skipAutoRecalc = autoProgressionDisabled || hasPerCharacterOverride;
  const newProficiencyBonus = detailsDraft ? proficiencyBonusForLevel(detailsDraft.level, homebrewRules) : null;
  const proficiencyBonusWillChange =
    levelChanged
    && !skipAutoRecalc
    && newProficiencyBonus !== null
    && newProficiencyBonus !== currentProficiencyBonus;

  const levelUpClass = resolvedDraftClass.trim();
  const levelUpSuggestion: LevelUpSuggestion | null =
    levelIncreased && char && levelUpClass !== ""
      ? computeLevelUpSuggestion(
          levelUpClass,
          char.level,
          detailsDraft!.level,
          char.sheetJson?.constitution ?? 10,
        )
      : null;
  const showLevelUpPreview =
    !!levelUpSuggestion && (levelUpSuggestion.isStandardClass
      ? suggestionHasChanges(levelUpSuggestion)
      : true);

  const saveDetails = () => {
    if (!detailsDraft || !detailsValid || !char) return;
    const data: {
      name: string;
      race: string;
      class: string;
      level: number;
      sheetJson?: CharacterSheet;
    } = {
      name: detailsDraft.name.trim(),
      race: resolvedDraftRace.trim(),
      class: resolvedDraftClass.trim(),
      level: detailsDraft.level,
    };
    let nextSheet: CharacterSheet | undefined;
    if (detailsDraft.level !== char.level && !skipAutoRecalc && newProficiencyBonus !== null) {
      nextSheet = {
        ...char.sheetJson,
        proficiencyBonus: newProficiencyBonus,
      };
    }
    if (
      levelUpSuggestion
      && levelUpSuggestion.isStandardClass
      && applyLevelUp
      && showLevelUpPreview
    ) {
      const base: CharacterSheet = nextSheet ?? { ...char.sheetJson };
      if (levelUpSuggestion.hpGain > 0) {
        const newMax = (base.maxHp ?? 0) + levelUpSuggestion.hpGain;
        const hpDelta = newMax - (base.maxHp ?? 0);
        base.maxHp = newMax;
        base.currentHp = Math.max(0, (base.currentHp ?? 0) + hpDelta);
      }
      if (levelUpSuggestion.newSpellSlots) {
        const merged: SpellSlotMap = {};
        const prevSlots = base.spellSlots ?? {};
        for (const [lvl, slot] of Object.entries(levelUpSuggestion.newSpellSlots)) {
          const prevUsed = prevSlots[lvl]?.used ?? 0;
          merged[lvl] = { total: slot.total, used: Math.min(prevUsed, slot.total) };
        }
        base.spellSlots = merged;
      }
      if (levelUpSuggestion.features.length > 0) {
        const featureLines = levelUpSuggestion.features
          .map((f) => `• Level ${f.level}: ${f.names.join(", ")}`)
          .join("\n");
        const header = `Level-up (to ${detailsDraft.level}):`;
        const addition = `${header}\n${featureLines}`;
        base.notes = base.notes && base.notes.trim() !== ""
          ? `${base.notes}\n\n${addition}`
          : addition;
      }
      nextSheet = base;
    }
    if (nextSheet) data.sheetJson = nextSheet;
    updateMutation.mutate(
      { id, data },
      {
        onSuccess: () => {
          setEditingDetails(false);
          setDetailsDraft(null);
          queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey() });
          toast({ title: "Character updated!" });
        },
        onError: () => {
          toast({ title: "Failed to update character", variant: "destructive" });
        },
      },
    );
  };

  const canEditAsi = (isOwner || isDm) && !!char;

  const startAsiEdit = (idx: number, entry: AsiEntry) => {
    setAsiEditingIdx(idx);
    setAsiEditDraft({ ...entry });
  };

  const cancelAsiEdit = () => {
    setAsiEditingIdx(null);
    setAsiEditDraft(null);
  };

  const saveAsiEdit = () => {
    if (!char || asiEditingIdx === null || !asiEditDraft) return;
    const history = char.sheetJson.asiHistory ?? [];
    const old = history[asiEditingIdx];
    if (!old) return;
    const sheet: CharacterSheet = { ...char.sheetJson };
    const oldScore = (sheet[old.ability] as number | undefined) ?? 10;
    sheet[old.ability] = Math.max(1, oldScore - old.delta);
    const targetScore = (sheet[asiEditDraft.ability] as number | undefined) ?? 10;
    sheet[asiEditDraft.ability] = Math.max(1, targetScore + asiEditDraft.delta);
    sheet.asiHistory = history.map((e, i) => (i === asiEditingIdx ? asiEditDraft : e));
    updateMutation.mutate(
      { id, data: { sheetJson: sheet } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey() });
          toast({ title: "Level-up entry updated" });
          cancelAsiEdit();
          setAsiPopoverOpenIdx(null);
        },
        onError: () => toast({ title: "Could not update entry", variant: "destructive" }),
      },
    );
  };

  const confirmAsiRemove = () => {
    if (!char || asiRemoveIdx === null) return;
    const history = char.sheetJson.asiHistory ?? [];
    const entry = history[asiRemoveIdx];
    if (!entry) return;
    const sheet: CharacterSheet = { ...char.sheetJson };
    const oldScore = (sheet[entry.ability] as number | undefined) ?? 10;
    sheet[entry.ability] = Math.max(1, oldScore - entry.delta);
    sheet.asiHistory = history.filter((_, i) => i !== asiRemoveIdx);
    updateMutation.mutate(
      { id, data: { sheetJson: sheet } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey() });
          toast({ title: "Level-up entry removed" });
          setAsiRemoveIdx(null);
          setAsiPopoverOpenIdx(null);
        },
        onError: () => toast({ title: "Could not remove entry", variant: "destructive" }),
      },
    );
  };

  const pendingRemoveEntry: AsiEntry | null =
    char && asiRemoveIdx !== null ? (char.sheetJson.asiHistory ?? [])[asiRemoveIdx] ?? null : null;
  const pendingRemoveOldScore = pendingRemoveEntry
    ? ((char!.sheetJson[pendingRemoveEntry.ability] as number | undefined) ?? 10)
    : 0;
  const pendingRemoveNewScore = pendingRemoveEntry
    ? Math.max(1, pendingRemoveOldScore - pendingRemoveEntry.delta)
    : 0;

  const pdfUrl = `${import.meta.env.BASE_URL}api/characters/${id}/pdf`;

  // Build the public-facing URL for the stored portrait. App Storage paths look
  // like `/objects/...`; external URLs (http/https) are passed through.
  const portraitSrc = (() => {
    const url = char?.portraitUrl;
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("/objects/")) return `${import.meta.env.BASE_URL}api/storage${url}`;
    return url;
  })();

  const savePortraitUrl = (portraitUrl: string | null) => {
    updateMutation.mutate(
      { id, data: { portraitUrl } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey() });
          toast({ title: portraitUrl ? "Portrait updated" : "Portrait removed" });
        },
        onError: () => toast({ title: "Could not save portrait", variant: "destructive" }),
      },
    );
  };

  const uploadPortraitFile = async (file: File) => {
    setUploading(true);
    try {
      const reqRes = await fetch(`${import.meta.env.BASE_URL}api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!reqRes.ok) {
        let description: string | undefined;
        try {
          const body = (await reqRes.json()) as { error?: string };
          description = body?.error;
        } catch {
          // ignore non-JSON error bodies
        }
        toast({ title: "Upload failed", description, variant: "destructive" });
        return;
      }
      const { uploadURL, objectPath } = (await reqRes.json()) as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error("upload");
      savePortraitUrl(objectPath);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePortraitFile = (file: File) => {
    const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;
    const ALLOWED_PORTRAIT_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    const fileType = (file.type || "").toLowerCase();
    if (!ALLOWED_PORTRAIT_TYPES.includes(fileType)) {
      toast({
        title: "Unsupported file type",
        description: "Please choose a PNG, JPEG, or WebP image.",
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_PORTRAIT_BYTES) {
      toast({
        title: "Image is too large",
        description: `Portraits must be 5MB or smaller (this one is ${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : null;
      if (!src) {
        toast({ title: "Could not read image", variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setCropSource({ src, name: file.name, type: file.type });
    };
    reader.onerror = () => {
      toast({ title: "Could not read image", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleCropCancel = () => {
    setCropSource(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropDone = async (file: File) => {
    setCropSource(null);
    await uploadPortraitFile(file);
  };

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
        {isOwner && !editing && !editingDetails && (
          <Button variant="outline" size="sm" onClick={startEditing} data-testid="button-edit-character">
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
        )}
        {canEditDetails && !editing && !editingDetails && (
          <Button variant="outline" size="sm" onClick={startEditingDetails} data-testid="button-edit-details">
            <Pencil className="h-4 w-4 mr-1" />
            Edit details
          </Button>
        )}
        {canEditDetails && !editing && !editingDetails && (
          <Button
            variant="outline"
            size="sm"
            disabled={char.level >= 20}
            onClick={() => { setLevelUpTarget(char.level + 1); setLevelUpOpen(true); }}
            title={char.level >= 20 ? "Max level" : "Walk through your level up"}
            data-testid="button-level-up"
          >
            <TrendingUp className="h-4 w-4 mr-1" />
            Level Up
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
              variant="outline"
              size="sm"
              disabled={exportDisabled}
              data-testid={`button-print-character-pdf-${id}`}
              onClick={() => {
                toast({ title: "Building your sheet…" });
                window.open(`${pdfUrl}?inline=1`, "_blank", "noopener,noreferrer");
              }}
            >
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exportDisabled}
              data-testid={`button-download-character-pdf-${id}`}
              onClick={() => {
                toast({ title: "Building your sheet…" });
                window.location.assign(pdfUrl);
              }}
            >
              <Download className="h-4 w-4 mr-1" />
              Download PDF
            </Button>
          </div>
        )}
      </div>

      {editingDetails && detailsDraft ? (
        <div className="rounded-2xl glass-panel p-5 space-y-4" data-testid="edit-details-form">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Character Name</Label>
            <Input
              id="edit-name"
              value={detailsDraft.name}
              onChange={(e) => setDetailsDraft({ ...detailsDraft, name: e.target.value })}
              data-testid="input-edit-name"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Race</Label>
              <Select
                value={detailsDraft.raceSelect}
                onValueChange={(v) => setDetailsDraft({ ...detailsDraft, raceSelect: v })}
              >
                <SelectTrigger data-testid="select-edit-race">
                  <SelectValue placeholder="Select a race" />
                </SelectTrigger>
                <SelectContent>
                  {DND_RACES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_OPTION_VALUE}>Other (custom)</SelectItem>
                </SelectContent>
              </Select>
              {detailsDraft.raceSelect === CUSTOM_OPTION_VALUE && (
                <Input
                  value={detailsDraft.customRace}
                  onChange={(e) => setDetailsDraft({ ...detailsDraft, customRace: e.target.value })}
                  placeholder="Enter custom race"
                  data-testid="input-edit-custom-race"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              <Select
                value={detailsDraft.classSelect}
                onValueChange={(v) => setDetailsDraft({ ...detailsDraft, classSelect: v })}
              >
                <SelectTrigger data-testid="select-edit-class">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {DND_CLASSES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_OPTION_VALUE}>Other (custom)</SelectItem>
                </SelectContent>
              </Select>
              {detailsDraft.classSelect === CUSTOM_OPTION_VALUE && (
                <Input
                  value={detailsDraft.customClass}
                  onChange={(e) => setDetailsDraft({ ...detailsDraft, customClass: e.target.value })}
                  placeholder="Enter custom class"
                  data-testid="input-edit-custom-class"
                />
              )}
            </div>
          </div>
          <div className="space-y-2 max-w-[200px]">
            <Label htmlFor="edit-level">Level</Label>
            <Input
              id="edit-level"
              type="number"
              min={1}
              max={20}
              value={detailsDraft.level}
              onChange={(e) => setDetailsDraft({
                ...detailsDraft,
                level: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)),
              })}
              data-testid="input-edit-level"
            />
            {proficiencyBonusWillChange && (
              <p
                className="text-xs text-muted-foreground"
                data-testid="text-proficiency-bonus-preview"
              >
                Proficiency bonus will become +{newProficiencyBonus}
              </p>
            )}
            {levelChanged && detailsDraft.level > char.level && detailsDraft.level <= 20 && (
              <button
                type="button"
                className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                onClick={() => {
                  cancelEditingDetails();
                  setLevelUpTarget(detailsDraft.level);
                  setLevelUpOpen(true);
                }}
                data-testid="link-level-up-walkthrough"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Try the Level Up walkthrough →
              </button>
            )}
          </div>
          {showLevelUpPreview && levelUpSuggestion && char && (
            <div
              className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3"
              data-testid="level-up-preview"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h4 className="font-semibold text-sm text-foreground">
                  Level up: {char.level} → {detailsDraft!.level}
                </h4>
                {!levelUpSuggestion.isStandardClass && (
                  <span
                    className="text-[10px] uppercase tracking-wider text-muted-foreground"
                    data-testid="text-level-up-custom-class"
                  >
                    Custom class — features unknown
                  </span>
                )}
              </div>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-5">
                {levelUpSuggestion.hpGain > 0 && (
                  <li data-testid="text-level-up-hp">
                    Max HP: <span className="font-mono tabular-nums text-foreground">+{levelUpSuggestion.hpGain}</span>{" "}
                    (avg d{levelUpSuggestion.hitDie} per level + CON modifier)
                  </li>
                )}
                {levelUpSuggestion.newSpellSlots && (
                  <li data-testid="text-level-up-slots">
                    Spell slots become:{" "}
                    <span className="font-mono tabular-nums text-foreground">
                      {Object.entries(levelUpSuggestion.newSpellSlots)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([lvl, s]) => `L${lvl}:${s.total}`)
                        .join(" ")}
                    </span>
                  </li>
                )}
                {levelUpSuggestion.newCantripsKnown !== null
                  && levelUpSuggestion.prevCantripsKnown !== null
                  && levelUpSuggestion.newCantripsKnown > levelUpSuggestion.prevCantripsKnown && (
                  <li data-testid="text-level-up-cantrips">
                    Cantrips known:{" "}
                    <span className="font-mono tabular-nums text-foreground">
                      {levelUpSuggestion.prevCantripsKnown} → {levelUpSuggestion.newCantripsKnown}
                    </span>{" "}
                    (pick a new cantrip on your sheet)
                  </li>
                )}
                {levelUpSuggestion.features.map((f) => (
                  <li key={f.level} data-testid={`text-level-up-features-${f.level}`}>
                    Level {f.level} features:{" "}
                    <span className="text-foreground">{f.names.join(", ")}</span>
                  </li>
                ))}
                {levelUpSuggestion.isStandardClass
                  && levelUpSuggestion.hpGain === 0
                  && !levelUpSuggestion.newSpellSlots
                  && levelUpSuggestion.features.length === 0 && (
                  <li>No automatic changes for this class at this level.</li>
                )}
              </ul>
              {levelUpSuggestion.isStandardClass && (
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                    checked={applyLevelUp}
                    onChange={(e) => setApplyLevelUp(e.target.checked)}
                    data-testid="checkbox-apply-level-up"
                  />
                  Apply these changes to the sheet when I save
                </label>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={saveDetails}
              disabled={updateMutation.isPending || !detailsValid}
              data-testid="button-save-details"
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelEditingDetails}
              data-testid="button-cancel-details"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          <div
            className="relative h-24 w-24 flex-shrink-0 rounded-2xl overflow-hidden bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]"
            data-testid="character-portrait"
          >
            {portraitSrc ? (
              <img
                src={portraitSrc}
                alt={`${char.name} portrait`}
                className="h-full w-full object-cover [image-rendering:auto]"
                onError={(e) => {
                  // Fallback gracefully when the URL is unreachable.
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
                data-testid="img-character-portrait"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <UserIcon className="h-10 w-10" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold text-foreground tracking-tight" data-testid="text-character-name">{char.name}</h2>
          <p className="text-muted-foreground">
            Level <span className="font-mono tabular-nums">{char.level}</span> {char.race} {char.class} — played by {char.ownerDisplayName}
          </p>
          <p className="text-xs text-muted-foreground mt-1" data-testid="text-character-background">
            Background: <span className="text-foreground">{char.sheetJson?.background?.trim() ? char.sheetJson.background : "—"}</span>
          </p>
          {isOwner && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePortraitFile(f);
                }}
                data-testid="input-portrait-file"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-portrait"
              >
                <Upload className="h-4 w-4 mr-1" />
                {uploading ? "Uploading…" : portraitSrc ? "Change portrait" : "Upload portrait"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => {
                  setUrlInputValue(typeof char.portraitUrl === "string" && /^https?:/i.test(char.portraitUrl) ? char.portraitUrl : "");
                  setUrlInputOpen((v) => !v);
                }}
                data-testid="button-portrait-url-toggle"
              >
                <LinkIcon className="h-4 w-4 mr-1" />
                Use URL
              </Button>
              {portraitSrc && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  onClick={() => savePortraitUrl(null)}
                  data-testid="button-remove-portrait"
                >
                  Remove
                </Button>
              )}
            </div>
          )}
          {isOwner && urlInputOpen && (
            <div className="mt-2 flex gap-2 max-w-md">
              <Input
                type="url"
                placeholder="https://example.com/portrait.png"
                value={urlInputValue}
                onChange={(e) => setUrlInputValue(e.target.value)}
                data-testid="input-portrait-url"
              />
              <Button
                size="sm"
                onClick={() => {
                  const trimmed = urlInputValue.trim();
                  if (!trimmed) return;
                  if (!/^https?:\/\//i.test(trimmed)) {
                    toast({ title: "URL must start with http:// or https://", variant: "destructive" });
                    return;
                  }
                  savePortraitUrl(trimmed);
                  setUrlInputOpen(false);
                }}
                data-testid="button-save-portrait-url"
              >
                Save
              </Button>
            </div>
          )}
          </div>
        </div>
      )}

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
            <TooltipProvider delayDuration={150}>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const).map((stat) => {
                  const val = sheet[stat] ?? 10;
                  const mod = Math.floor((val - 10) / 2);
                  const allHistory = sheet.asiHistory ?? [];
                  const entries = allHistory
                    .map((e, originalIndex) => ({ entry: e, originalIndex }))
                    .filter(({ entry }) => entry.ability === stat);
                  const totalDelta = entries.reduce((sum, { entry }) => sum + entry.delta, 0);
                  const badgeLabel = `+${totalDelta} ${
                    entries.length === 1 ? `(L${entries[0].entry.level})` : `(×${entries.length})`
                  }`;
                  const badgeAria = `Ability score increased by ${totalDelta} from level-up boosts`;
                  const renderEntries = (
                    <div className="space-y-2" data-testid={`asi-tooltip-${stat}`}>
                      <p className="text-xs font-semibold">From level-up boosts:</p>
                      <ul className="space-y-1.5">
                        {entries.map(({ entry, originalIndex }) => {
                          const isEditingThis = asiEditingIdx === originalIndex && asiEditDraft;
                          return (
                            <li
                              key={originalIndex}
                              className="flex items-center gap-2 text-xs"
                              data-testid={`asi-entry-${stat}-${originalIndex}`}
                            >
                              {isEditingThis ? (
                                <div className="flex items-center gap-1.5 flex-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={asiEditDraft.level}
                                    onChange={(e) =>
                                      setAsiEditDraft({
                                        ...asiEditDraft,
                                        level: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)),
                                      })
                                    }
                                    className="h-7 w-14 px-2 font-mono text-xs"
                                    data-testid={`input-asi-edit-level-${originalIndex}`}
                                    aria-label="Level"
                                  />
                                  <Select
                                    value={asiEditDraft.ability}
                                    onValueChange={(v) =>
                                      setAsiEditDraft({ ...asiEditDraft, ability: v as AbilityName })
                                    }
                                  >
                                    <SelectTrigger
                                      className="h-7 w-24 text-xs"
                                      data-testid={`select-asi-edit-ability-${originalIndex}`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ABILITY_ORDER.map((a) => (
                                        <SelectItem key={a} value={a}>
                                          {ABILITY_SHORT[a]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={2}
                                    value={asiEditDraft.delta}
                                    onChange={(e) =>
                                      setAsiEditDraft({
                                        ...asiEditDraft,
                                        delta: Math.max(1, Math.min(2, parseInt(e.target.value) || 1)),
                                      })
                                    }
                                    className="h-7 w-12 px-2 font-mono text-xs"
                                    data-testid={`input-asi-edit-delta-${originalIndex}`}
                                    aria-label="Delta"
                                  />
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={saveAsiEdit}
                                    disabled={updateMutation.isPending}
                                    aria-label="Save entry"
                                    data-testid={`button-asi-save-${originalIndex}`}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={cancelAsiEdit}
                                    aria-label="Cancel edit"
                                    data-testid={`button-asi-edit-cancel-${originalIndex}`}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <span className="font-mono flex-1">
                                    Level {entry.level}: +{entry.delta}
                                  </span>
                                  {canEditAsi && (
                                    <>
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        onClick={() => startAsiEdit(originalIndex, entry)}
                                        aria-label="Edit entry"
                                        data-testid={`button-asi-edit-${originalIndex}`}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                        onClick={() => setAsiRemoveIdx(originalIndex)}
                                        aria-label="Remove entry"
                                        data-testid={`button-asi-remove-${originalIndex}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {!canEditAsi && (
                        <p className="text-[10px] text-muted-foreground italic">
                          Only the character&apos;s player or the DM can edit these.
                        </p>
                      )}
                    </div>
                  );
                  return (
                    <div key={stat} className="relative text-center p-2 rounded-lg bg-[rgba(255,255,255,0.03)]">
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
                      {!editing && entries.length > 0 && (
                        canEditAsi ? (
                          <Popover
                            open={asiPopoverOpenIdx === entries[0].originalIndex}
                            onOpenChange={(o) => {
                              if (o) {
                                setAsiPopoverOpenIdx(entries[0].originalIndex);
                              } else {
                                setAsiPopoverOpenIdx(null);
                                cancelAsiEdit();
                              }
                            }}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-primary/20 border border-primary/40 text-primary text-[10px] font-mono font-semibold tabular-nums leading-none hover:bg-primary/30 cursor-pointer"
                                data-testid={`asi-badge-${stat}`}
                                aria-label={badgeAria}
                              >
                                {badgeLabel}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto min-w-[260px] p-3" align="end">
                              {renderEntries}
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-primary/20 border border-primary/40 text-primary text-[10px] font-mono font-semibold tabular-nums leading-none hover:bg-primary/30 cursor-help"
                                data-testid={`asi-badge-${stat}`}
                                aria-label={badgeAria}
                              >
                                {badgeLabel}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{renderEntries}</TooltipContent>
                          </Tooltip>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>

          {sheet.feats && sheet.feats.length > 0 && (
            <div
              className="rounded-2xl glass-panel p-5 md:col-span-2 lg:col-span-3"
              data-testid="card-feats"
            >
              <h3 className="font-semibold text-sm text-foreground mb-3">Feats</h3>
              <ul className="space-y-2">
                {sheet.feats.map((id: string) => {
                  const feat = getFeat(id);
                  // Custom feats picked before this list existed (or homebrew)
                  // come through as raw ids. Show them as-is so nothing
                  // disappears off the sheet.
                  if (!feat) {
                    return (
                      <li
                        key={id}
                        className="rounded-lg bg-[rgba(255,255,255,0.04)] p-3 text-sm text-foreground"
                        data-testid={`feat-card-${id}`}
                      >
                        {id}
                      </li>
                    );
                  }
                  return (
                    <li
                      key={feat.id}
                      className="rounded-lg bg-[rgba(255,255,255,0.04)] p-3"
                      data-testid={`feat-card-${feat.id}`}
                    >
                      <p className="text-sm font-semibold text-foreground">{feat.name}</p>
                      {feat.prerequisite && (
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
                          Prerequisite: {feat.prerequisite}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{feat.summary}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

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

          {!editing && (sheet.levelHistory?.length ?? 0) > 0 && (
            <LevelingHistoryPanel entries={sheet.levelHistory ?? []} />
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

      {levelUpTarget !== null && (
        <LevelUpModal
          character={char}
          targetLevel={levelUpTarget}
          open={levelUpOpen}
          onClose={() => { setLevelUpOpen(false); setLevelUpTarget(null); }}
        />
      )}

      <AlertDialog
        open={asiRemoveIdx !== null}
        onOpenChange={(o) => { if (!o) setAsiRemoveIdx(null); }}
      >
        <AlertDialogContent data-testid="asi-remove-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove level-up boost?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoveEntry ? (
                <>
                  This will remove the +{pendingRemoveEntry.delta} {ABILITY_SHORT[pendingRemoveEntry.ability]}{" "}
                  boost recorded at level {pendingRemoveEntry.level}.{" "}
                  <span className="font-mono">
                    {ABILITY_SHORT[pendingRemoveEntry.ability]} {pendingRemoveOldScore} → {pendingRemoveNewScore}
                  </span>
                  .
                </>
              ) : (
                "This will remove the selected level-up boost entry."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-asi-remove-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAsiRemove}
              disabled={updateMutation.isPending}
              data-testid="button-asi-remove-confirm"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PortraitCropperDialog
        open={!!cropSource}
        imageSrc={cropSource?.src ?? null}
        fileName={cropSource?.name ?? "portrait"}
        mimeType={cropSource?.type ?? "image/jpeg"}
        onCancel={handleCropCancel}
        onCropped={handleCropDone}
      />
    </div>
  );
}

const ABILITY_ABBR: Record<string, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

function LevelingHistoryPanel({
  entries,
}: {
  entries: NonNullable<CharacterSheet["levelHistory"]>;
}) {
  const [open, setOpen] = useState(false);
  const sorted = [...entries].sort((a, b) => a.level - b.level);
  return (
    <div className="rounded-2xl glass-panel p-5 md:col-span-2 lg:col-span-3" data-testid="leveling-history">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between text-left"
            data-testid="button-toggle-leveling-history"
          >
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Leveling history
              <span className="text-xs text-muted-foreground font-normal">
                ({sorted.length} {sorted.length === 1 ? "entry" : "entries"})
              </span>
            </h3>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <ol className="space-y-2">
            {sorted.map((e, idx) => (
              <li
                key={`${e.level}-${idx}`}
                className="rounded-lg bg-[rgba(255,255,255,0.04)] p-3 text-sm"
                data-testid={`leveling-history-entry-${e.level}`}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <p className="font-semibold text-foreground">Level {e.level}</p>
                  <p className="text-xs text-muted-foreground font-mono tabular-nums flex items-center gap-1">
                    <Heart className="h-3 w-3 text-red-400" /> +{e.hpGained} HP
                    {e.hpMethod === "roll" && typeof e.hpRoll === "number" && (
                      <span className="ml-1 inline-flex items-center gap-0.5">
                        <Dice5 className="h-3 w-3" /> {e.hpRoll}
                      </span>
                    )}
                    {e.hpMethod === "average" && <span className="ml-1">(avg)</span>}
                    {e.hpMethod === "manual" && <span className="ml-1">(manual)</span>}
                  </p>
                </div>
                {e.asiBoosts && e.asiBoosts.length > 0 && (
                  <p className="text-xs text-muted-foreground" data-testid={`leveling-history-asi-${e.level}`}>
                    ASI:{" "}
                    {e.asiBoosts
                      .map((b) => `+${b.delta} ${ABILITY_ABBR[b.ability] ?? b.ability.slice(0, 3).toUpperCase()}`)
                      .join(", ")}
                  </p>
                )}
                {e.featNote && (
                  <p className="text-xs text-muted-foreground" data-testid={`leveling-history-feat-${e.level}`}>
                    Feat: {e.featNote}
                  </p>
                )}
                {e.featuresLearned && e.featuresLearned.length > 0 && (
                  <p
                    className="text-xs text-muted-foreground flex items-start gap-1"
                    data-testid={`leveling-history-features-${e.level}`}
                  >
                    <Sparkles className="h-3 w-3 mt-0.5 text-primary flex-shrink-0" />
                    <span>{e.featuresLearned.join(", ")}</span>
                  </p>
                )}
              </li>
            ))}
          </ol>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
