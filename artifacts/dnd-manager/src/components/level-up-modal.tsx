import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dice5, Sparkles, ArrowRight, Check, AlertTriangle } from "@workspace/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui";
import { Button } from "@workspace/ui";
import { Input } from "@workspace/ui";
import { Label } from "@workspace/ui";
import { Textarea } from "@workspace/ui";
import { RadioGroup, RadioGroupItem } from "@workspace/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui";
import { Check as CheckIcon, ChevronsUpDown } from "@workspace/ui";
import { cn } from "@workspace/ui";
import { useToast } from "@workspace/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateCharacter,
  useRollDice,
  getGetCharacterQueryKey,
  getListCharactersQueryKey,
  getGetRecentRollsQueryKey,
} from "@workspace/api-client-react";
import type { Character, CharacterSheet, LevelHistoryEntry } from "@workspace/api-client-react";
import { CLASS_DATA, getNewFeaturesAtLevel, modifierFor, type HitDieSize } from "@/lib/dnd-srd";
import { ABILITY_ORDER, type AbilityName } from "@/lib/dnd-options";
import { rollHitDie } from "@/lib/dice";
import { SRD_FEATS, getFeat, bonusHpFromFeats } from "@/lib/dnd-feats";
import {
  appendFeatNote,
  applyAsiChoice,
  averageHpGain,
  describeAsiChoice,
  getCatchUpPasses,
  isAsiLevel,
  levelUpHpGain,
  readAbilityScores,
  validateAsiChoice,
  type AsiChoice,
  type AbilityScores,
} from "@/lib/level-up";

interface Props {
  character: Character;
  targetLevel: number; // can equal character.level + 1, or higher for catch-up
  open: boolean;
  onClose: () => void;
}

type Step = "hp" | "features" | "asi" | "confirm";

interface PassState {
  fromLevel: number;
  toLevel: number;
  index: number;
  total: number;
  hpRoll: number | null;
  hpMethod: "roll" | "average" | "manual" | null;
  manualHp: string;
  asi: AsiChoice;
}

function emptyPass(from: number, to: number, index: number, total: number): PassState {
  return {
    fromLevel: from,
    toLevel: to,
    index,
    total,
    hpRoll: null,
    hpMethod: null,
    manualHp: "",
    asi: { kind: "none" },
  };
}

const ABILITY_LABELS: Record<AbilityName, string> = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
  charisma: "Charisma",
};

export default function LevelUpModal({ character, targetLevel, open, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateCharacter();
  const rollMutation = useRollDice();

  const passes = useMemo(
    () => getCatchUpPasses(character.level, targetLevel).map((p) => emptyPass(p.from, p.to, p.index, p.total)),
    [character.level, targetLevel],
  );

  const [passIdx, setPassIdx] = useState(0);
  const [step, setStep] = useState<Step>("hp");
  const [pass, setPass] = useState<PassState | null>(passes[0] ?? null);
  const [animKey, setAnimKey] = useState(0);
  const [working, setWorking] = useState<{ sheet: CharacterSheet; level: number } | null>(null);

  // Re-init when the modal opens for a fresh character/target.
  useEffect(() => {
    if (!open) return;
    setPassIdx(0);
    setStep("hp");
    setPass(passes[0] ?? null);
    setWorking({ sheet: { ...character.sheetJson }, level: character.level });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, character.id, targetLevel]);

  if (!open || !pass || !working) return null;

  const classInfo = CLASS_DATA[character.class];
  const hitDie: HitDieSize | null = classInfo?.hitDie ?? null;
  const isCustomClass = !classInfo;

  const conScore = (working.sheet.constitution ?? 10) as number;
  const conMod = modifierFor(conScore);

  // If Tough was already on the sheet from an earlier level, every level-up
  // pass adds +2 HP on top of the rolled/average value. (Picking Tough this
  // level is handled separately during commit — it credits 2 × toLevel HP.)
  const existingFeats = working.sheet.feats ?? [];
  const featHpPerLevel = bonusHpFromFeats(existingFeats, 1);

  const hpFromRoll = pass.hpRoll ?? 0;
  const hpDelta = (() => {
    if (pass.hpMethod === "manual") {
      const n = parseInt(pass.manualHp, 10);
      if (Number.isFinite(n) && n >= 1) return Math.max(1, n) + featHpPerLevel;
      return 0;
    }
    if (pass.hpRoll === null) return 0;
    return levelUpHpGain(hpFromRoll, conScore) + featHpPerLevel;
  })();

  const newFeatures = getNewFeaturesAtLevel(character.class, pass.toLevel);
  const asiNeeded = isAsiLevel(pass.toLevel);
  const asiValidation = asiNeeded ? validateAsiChoice(readAbilityScores(working.sheet), pass.asi) : { ok: true };

  const updatePass = (patch: Partial<PassState>) => setPass({ ...pass, ...patch });

  const doRoll = () => {
    if (!hitDie) return;
    const roll = rollHitDie(hitDie);
    setAnimKey((k) => k + 1);
    updatePass({ hpRoll: roll, hpMethod: "roll" });
    // Log to dice history. The shared schema has no `purpose` field, so we
    // tag it via the label so the DM can audit level-up rolls in /dice/recent.
    rollMutation.mutate(
      {
        data: {
          expression: `1d${hitDie}`,
          label: `Level up HP (${character.name} → L${pass.toLevel})`,
          characterId: character.id,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRecentRollsQueryKey() });
        },
      },
    );
  };

  const doAverage = () => {
    if (!hitDie) return;
    updatePass({ hpRoll: averageHpGain(hitDie), hpMethod: "average" });
  };

  const canAdvanceFromHp = hpDelta > 0;
  const canAdvanceFromAsi = !asiNeeded || asiValidation.ok;

  const goNext = () => {
    if (step === "hp") {
      if (!canAdvanceFromHp) return;
      setStep("features");
      return;
    }
    if (step === "features") {
      setStep(asiNeeded ? "asi" : "confirm");
      return;
    }
    if (step === "asi") {
      if (!canAdvanceFromAsi) return;
      setStep("confirm");
      return;
    }
  };

  const goBack = () => {
    if (step === "confirm") setStep(asiNeeded ? "asi" : "features");
    else if (step === "asi") setStep("features");
    else if (step === "features") setStep("hp");
  };

  const commit = () => {
    if (!working) return;
    let bonusHp = hpDelta;
    let nextSheet: CharacterSheet = { ...working.sheet };

    const historyEntry: LevelHistoryEntry = {
      level: pass.toLevel,
      hpGained: hpDelta,
      ...(pass.hpMethod ? { hpMethod: pass.hpMethod } : {}),
      ...(pass.hpMethod === "roll" && pass.hpRoll !== null ? { hpRoll: pass.hpRoll } : {}),
      ...(newFeatures.length > 0 ? { featuresLearned: newFeatures.map((f) => f.name) } : {}),
    };

    if (asiNeeded && pass.asi.kind !== "none") {
      if (pass.asi.kind === "plus2" || pass.asi.kind === "plus1x2") {
        const before = readAbilityScores(working.sheet);
        const after = applyAsiChoice(before, pass.asi);
        const newEntries =
          pass.asi.kind === "plus2"
            ? [{ level: pass.toLevel, ability: pass.asi.ability, delta: 2 }]
            : [
                { level: pass.toLevel, ability: pass.asi.abilityA, delta: 1 },
                { level: pass.toLevel, ability: pass.asi.abilityB, delta: 1 },
              ];
        nextSheet = {
          ...nextSheet,
          ...after,
          asiHistory: [...(working.sheet.asiHistory ?? []), ...newEntries],
        } as CharacterSheet;
        historyEntry.asiBoosts = newEntries.map((e) => ({ ability: e.ability, delta: e.delta }));
      } else if (pass.asi.kind === "feat") {
        nextSheet = { ...nextSheet, notes: appendFeatNote(working.sheet.notes, pass.toLevel, pass.asi.description) };
        historyEntry.featNote = pass.asi.description.trim();
        // Curated feat picks land on a structured `feats` list so they show
        // up on the sheet, not just buried in notes.
        if (pass.asi.featId) {
          const existing = nextSheet.feats ?? [];
          if (!existing.includes(pass.asi.featId)) {
            nextSheet = { ...nextSheet, feats: [...existing, pass.asi.featId] };
          }
          // Tough is retroactive: when picked, credit +2 HP for every
          // character level the character has at the new level. Future
          // level-ups add +2 each via featHpPerLevel above.
          const feat = getFeat(pass.asi.featId);
          if (feat?.hpPerLevel) {
            bonusHp += feat.hpPerLevel * pass.toLevel;
          }
        }
      }
    }

    historyEntry.hpGained = bonusHp;
    nextSheet = {
      ...nextSheet,
      maxHp: (working.sheet.maxHp ?? 0) + bonusHp,
      currentHp: (working.sheet.currentHp ?? 0) + bonusHp,
      levelHistory: [...(working.sheet.levelHistory ?? []), historyEntry],
    };

    updateMutation.mutate(
      { id: character.id, data: { level: pass.toLevel, sheetJson: nextSheet } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(character.id) });
          queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey() });
          toast({ title: `Welcome to level ${pass.toLevel}!` });

          const nextIdx = passIdx + 1;
          if (nextIdx < passes.length) {
            const np = passes[nextIdx];
            setWorking({ sheet: nextSheet, level: pass.toLevel });
            setPassIdx(nextIdx);
            setPass(np);
            setStep("hp");
          } else {
            onClose();
          }
        },
        onError: () => {
          toast({ title: "Could not save level up", variant: "destructive" });
        },
      },
    );
  };

  const titleSuffix = pass.total > 1 ? ` (${pass.index} of ${pass.total})` : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="level-up-modal">
        <DialogHeader>
          <DialogTitle data-testid="level-up-title">
            Leveling up: {pass.fromLevel} → {pass.toLevel}{titleSuffix}
          </DialogTitle>
          <DialogDescription>
            {character.name} the {character.race} {character.class}
          </DialogDescription>
        </DialogHeader>

        {step === "hp" && (
          <div className="space-y-4" data-testid="step-hp">
            <p className="text-sm text-muted-foreground">
              Roll your hit die or take the average. Your CON modifier is folded in.
            </p>

            {hitDie ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button onClick={doRoll} variant="default" size="sm" data-testid="button-hp-roll">
                    <Dice5 className="h-4 w-4 mr-1" /> Roll 1d{hitDie}
                  </Button>
                  <Button onClick={doAverage} variant="outline" size="sm" data-testid="button-hp-average">
                    Take average ({averageHpGain(hitDie)})
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    CON {conMod >= 0 ? "+" : ""}{conMod}
                  </span>
                </div>

                <div className="rounded-xl bg-[rgba(255,255,255,0.04)] p-4 min-h-[88px] flex items-center justify-center">
                  <AnimatePresence mode="wait">
                    {pass.hpRoll === null ? (
                      <motion.p
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-sm text-muted-foreground"
                      >
                        No HP added yet.
                      </motion.p>
                    ) : (
                      <motion.div
                        key={`${pass.hpMethod}-${animKey}`}
                        initial={{ scale: 0.8, opacity: 0, rotate: pass.hpMethod === "roll" ? -15 : 0 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 320, damping: 16 }}
                        className="text-center"
                        data-testid="hp-roll-display"
                      >
                        <p className="font-mono text-3xl font-bold text-primary tabular-nums">+{hpDelta} HP</p>
                        <p className="text-xs text-muted-foreground font-mono mt-1">
                          {pass.hpMethod === "roll"
                            ? `1d${hitDie} = ${hpFromRoll}`
                            : `Avg ${averageHpGain(hitDie)}`}
                          {" "}+ CON {conMod >= 0 ? "+" : ""}{conMod}
                          {hpFromRoll + conMod < 1 ? " (min 1)" : ""}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Custom class — enter how much HP to add this level.
                </p>
                <Input
                  type="number"
                  min={1}
                  value={pass.manualHp}
                  onChange={(e) => updatePass({ manualHp: e.target.value, hpMethod: "manual", hpRoll: null })}
                  placeholder="HP gained"
                  data-testid="input-hp-manual"
                />
              </div>
            )}
          </div>
        )}

        {step === "features" && (
          <div className="space-y-3" data-testid="step-features">
            <p className="text-sm text-muted-foreground">
              Features unlocked at level {pass.toLevel}:
            </p>
            {isCustomClass ? (
              <p className="text-sm text-muted-foreground italic">
                No SRD features known for custom classes — add them in your notes.
              </p>
            ) : newFeatures.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No new class features at this level (proficiency bonus and scaling effects still apply).
              </p>
            ) : (
              <ul className="space-y-2">
                {newFeatures.map((f) => (
                  <li key={f.name} className="rounded-lg bg-[rgba(255,255,255,0.04)] p-3" data-testid={`feature-${f.name}`}>
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> {f.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{f.summary}</p>
                  </li>
                ))}
              </ul>
            )}
            {pass.toLevel === 3 && !isCustomClass && (
              <p className="text-xs text-muted-foreground border-l-2 border-primary/50 pl-2">
                Subclass selection isn&apos;t guided yet — pick yours in your notes for now.
              </p>
            )}
          </div>
        )}

        {step === "asi" && (
          <AsiStep
            scores={readAbilityScores(working.sheet)}
            choice={pass.asi}
            onChange={(asi) => updatePass({ asi })}
            error={asiValidation.error}
          />
        )}

        {step === "confirm" && (() => {
          const pickedFeat = pass.asi.kind === "feat" && pass.asi.featId ? getFeat(pass.asi.featId) : null;
          const toughBonus = pickedFeat?.hpPerLevel ? pickedFeat.hpPerLevel * pass.toLevel : 0;
          const totalHp = hpDelta + toughBonus;
          return (
          <div className="space-y-3" data-testid="step-confirm">
            <p className="text-sm text-muted-foreground">Ready to commit:</p>
            <ul className="rounded-lg bg-[rgba(255,255,255,0.04)] p-3 text-sm space-y-1">
              <li>Level {pass.fromLevel} → {pass.toLevel}</li>
              <li data-testid="text-confirm-hp">
                +{totalHp} HP (max &amp; current)
                {toughBonus > 0 && (
                  <span className="text-xs text-muted-foreground"> — includes +{toughBonus} from {pickedFeat?.name}</span>
                )}
              </li>
              {asiNeeded && pass.asi.kind !== "none" && (
                <li>{describeAsiChoice(readAbilityScores(working.sheet), pass.asi)}</li>
              )}
              {newFeatures.length > 0 && (
                <li>Learned: {newFeatures.map((f) => f.name).join(", ")}</li>
              )}
            </ul>
          </div>
          );
        })()}

        <DialogFooter className="flex sm:justify-between gap-2">
          <Button
            variant="ghost"
            onClick={step === "hp" ? onClose : goBack}
            disabled={updateMutation.isPending}
            data-testid="button-level-up-back"
          >
            {step === "hp" ? "Cancel" : "Back"}
          </Button>
          {step === "confirm" ? (
            <Button
              onClick={commit}
              disabled={updateMutation.isPending || hpDelta === 0}
              data-testid="button-level-up-confirm"
            >
              <Check className="h-4 w-4 mr-1" />
              {updateMutation.isPending ? "Saving…" : "Confirm level up"}
            </Button>
          ) : (
            <Button
              onClick={goNext}
              disabled={(step === "hp" && !canAdvanceFromHp) || (step === "asi" && !canAdvanceFromAsi)}
              data-testid="button-level-up-next"
            >
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AsiStep({
  scores,
  choice,
  onChange,
  error,
}: {
  scores: AbilityScores;
  choice: AsiChoice;
  onChange: (c: AsiChoice) => void;
  error?: string;
}) {
  const kind = choice.kind === "none" ? "" : choice.kind;
  return (
    <div className="space-y-3" data-testid="step-asi">
      <p className="text-sm text-muted-foreground">
        Take an Ability Score Improvement (ASI) or a feat. The 5e cap is 20.
      </p>
      <RadioGroup
        value={kind}
        onValueChange={(v) => {
          if (v === "plus2") onChange({ kind: "plus2", ability: "strength" });
          else if (v === "plus1x2") onChange({ kind: "plus1x2", abilityA: "strength", abilityB: "dexterity" });
          // Default to the first curated feat so the picker shows a real
          // selection out of the gate; players can switch to "Custom" if needed.
          else if (v === "feat") {
            const first = SRD_FEATS[0];
            onChange({ kind: "feat", featId: first.id, description: first.name });
          }
        }}
        className="space-y-2"
      >
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="plus2" data-testid="radio-asi-plus2" />
          +2 to one ability
        </label>
        {choice.kind === "plus2" && (
          <div className="ml-6 max-w-[220px]">
            <Select value={choice.ability} onValueChange={(v) => onChange({ kind: "plus2", ability: v as AbilityName })}>
              <SelectTrigger data-testid="select-asi-plus2-ability"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ABILITY_ORDER.map((a) => (
                  <SelectItem key={a} value={a}>{ABILITY_LABELS[a]} ({scores[a]})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="plus1x2" data-testid="radio-asi-plus1x2" />
          +1 to two abilities
        </label>
        {choice.kind === "plus1x2" && (
          <div className="ml-6 grid grid-cols-2 gap-2 max-w-[440px]">
            <Select value={choice.abilityA} onValueChange={(v) => onChange({ ...choice, abilityA: v as AbilityName })}>
              <SelectTrigger data-testid="select-asi-plus1-a"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ABILITY_ORDER.map((a) => (
                  <SelectItem key={a} value={a}>{ABILITY_LABELS[a]} ({scores[a]})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={choice.abilityB} onValueChange={(v) => onChange({ ...choice, abilityB: v as AbilityName })}>
              <SelectTrigger data-testid="select-asi-plus1-b"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ABILITY_ORDER.map((a) => (
                  <SelectItem key={a} value={a}>{ABILITY_LABELS[a]} ({scores[a]})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="feat" data-testid="radio-asi-feat" />
          Take a feat
        </label>
        {choice.kind === "feat" && (
          <div className="ml-6 max-w-[440px] space-y-2">
            <FeatPicker
              featId={choice.featId}
              onPick={(featId) => {
                if (featId === null) {
                  onChange({ kind: "feat", featId: undefined, description: "" });
                } else {
                  const f = getFeat(featId);
                  if (f) onChange({ kind: "feat", featId: f.id, description: f.name });
                }
              }}
            />
            {choice.featId ? (() => {
              const feat = getFeat(choice.featId);
              if (!feat) return null;
              return (
                <div
                  className="rounded-lg bg-[rgba(255,255,255,0.04)] p-3 space-y-1"
                  data-testid={`feat-preview-${feat.id}`}
                >
                  <p className="text-sm font-semibold text-foreground">{feat.name}</p>
                  {feat.prerequisite && (
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Prerequisite: {feat.prerequisite}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{feat.summary}</p>
                  {feat.hpPerLevel && (
                    <p className="text-xs text-primary">
                      Adds +{feat.hpPerLevel} HP per character level on pick.
                    </p>
                  )}
                </div>
              );
            })() : (
              <div className="space-y-1">
                <Label htmlFor="feat-desc" className="text-xs text-muted-foreground">
                  Describe your custom feat — saved to your notes.
                </Label>
                <Textarea
                  id="feat-desc"
                  value={choice.description}
                  onChange={(e) => onChange({ kind: "feat", featId: undefined, description: e.target.value })}
                  rows={2}
                  placeholder="e.g. Homebrew Berserker — once per long rest, …"
                  data-testid="input-asi-feat-desc"
                />
              </div>
            )}
          </div>
        )}
      </RadioGroup>

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1" data-testid="asi-error">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
    </div>
  );
}

// Searchable combobox over the curated SRD feat list, with a "Custom feat
// (manual)" sentinel that the parent translates into a freeform description.
// We use Popover + Command (cmdk) so players can type to filter — important
// once the curated list grows beyond a handful of entries.
function FeatPicker({
  featId,
  onPick,
}: {
  featId: string | undefined;
  // null = the "Custom feat (manual)" sentinel; otherwise the picked SRD id.
  onPick: (featId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = featId ? getFeat(featId) : null;
  const label = selected?.name ?? (featId === undefined ? "Custom feat (manual)" : "Pick a feat");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          data-testid="combobox-asi-feat"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search feats…" data-testid="input-asi-feat-search" />
          <CommandList>
            <CommandEmpty>No feats found.</CommandEmpty>
            <CommandGroup heading="SRD feats">
              {SRD_FEATS.map((f) => (
                <CommandItem
                  key={f.id}
                  value={`${f.name} ${f.summary}`}
                  onSelect={() => {
                    onPick(f.id);
                    setOpen(false);
                  }}
                  data-testid={`option-feat-${f.id}`}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      featId === f.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm">{f.name}</span>
                    {f.prerequisite && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Req: {f.prerequisite}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Other">
              <CommandItem
                value="custom feat manual homebrew"
                onSelect={() => {
                  onPick(null);
                  setOpen(false);
                }}
                data-testid="option-feat-custom"
              >
                <CheckIcon
                  className={cn(
                    "mr-2 h-4 w-4",
                    featId === undefined ? "opacity-100" : "opacity-0",
                  )}
                />
                Custom feat (manual)
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
