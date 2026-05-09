import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dice5, Sparkles, ArrowRight, Check, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateCharacter,
  useRollDice,
  getGetCharacterQueryKey,
  getListCharactersQueryKey,
  getGetRecentRollsQueryKey,
} from "@workspace/api-client-react";
import type { Character, CharacterSheet } from "@workspace/api-client-react";
import { CLASS_DATA, getNewFeaturesAtLevel, modifierFor, type HitDieSize } from "@/lib/dnd-srd";
import { ABILITY_ORDER, type AbilityName } from "@/lib/dnd-options";
import { rollHitDie } from "@/lib/dice";
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

  const hpFromRoll = pass.hpRoll ?? 0;
  const hpDelta = (() => {
    if (pass.hpMethod === "manual") {
      const n = parseInt(pass.manualHp, 10);
      if (Number.isFinite(n) && n >= 1) return Math.max(1, n);
      return 0;
    }
    if (pass.hpRoll === null) return 0;
    return levelUpHpGain(hpFromRoll, conScore);
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
    const newMaxHp = (working.sheet.maxHp ?? 0) + hpDelta;
    const newCurrentHp = (working.sheet.currentHp ?? 0) + hpDelta;
    let nextSheet: CharacterSheet = { ...working.sheet, maxHp: newMaxHp, currentHp: newCurrentHp };

    if (asiNeeded && pass.asi.kind !== "none") {
      if (pass.asi.kind === "plus2" || pass.asi.kind === "plus1x2") {
        const before = readAbilityScores(working.sheet);
        const after = applyAsiChoice(before, pass.asi);
        nextSheet = { ...nextSheet, ...after } as CharacterSheet;
      } else if (pass.asi.kind === "feat") {
        nextSheet = { ...nextSheet, notes: appendFeatNote(working.sheet.notes, pass.toLevel, pass.asi.description) };
      }
    }

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

        {step === "confirm" && (
          <div className="space-y-3" data-testid="step-confirm">
            <p className="text-sm text-muted-foreground">Ready to commit:</p>
            <ul className="rounded-lg bg-[rgba(255,255,255,0.04)] p-3 text-sm space-y-1">
              <li>Level {pass.fromLevel} → {pass.toLevel}</li>
              <li>+{hpDelta} HP (max & current)</li>
              {asiNeeded && pass.asi.kind !== "none" && (
                <li>{describeAsiChoice(readAbilityScores(working.sheet), pass.asi)}</li>
              )}
              {newFeatures.length > 0 && (
                <li>Learned: {newFeatures.map((f) => f.name).join(", ")}</li>
              )}
            </ul>
          </div>
        )}

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
          else if (v === "feat") onChange({ kind: "feat", description: "" });
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
          Take a feat (manual)
        </label>
        {choice.kind === "feat" && (
          <div className="ml-6 max-w-[440px]">
            <Label htmlFor="feat-desc" className="text-xs text-muted-foreground">Describe the feat — added to your notes.</Label>
            <Textarea
              id="feat-desc"
              value={choice.description}
              onChange={(e) => onChange({ kind: "feat", description: e.target.value })}
              rows={2}
              placeholder="e.g. Sharpshooter — ignore cover, no -5/+10 trade-off"
              data-testid="input-asi-feat-desc"
            />
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
