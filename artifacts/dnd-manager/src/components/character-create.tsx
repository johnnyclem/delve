import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles, Plus, X, Dices, Wand2, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
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
import {
  useCreateCharacter,
  getListCharactersQueryKey,
  useGetCampaign,
  useRollDice,
  getGetRecentRollsQueryKey,
} from "@workspace/api-client-react";
import type { CreateCharacterBody, CharacterSheet } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  DND_RACES,
  DND_CLASSES,
  CUSTOM_OPTION_VALUE,
  proficiencyBonusForLevel,
  RECOMMENDED_ABILITY_ORDER,
  DEFAULT_ABILITY_ORDER,
  type AbilityName,
} from "@/lib/dnd-options";
import {
  rollAbilityScores,
  STANDARD_ARRAY,
  abilityRollLabel,
  type AbilityRoll,
} from "@/lib/dice";

const DND_SKILLS = [
  "Acrobatics", "Animal Handling", "Arcana", "Athletics",
  "Deception", "History", "Insight", "Intimidation",
  "Investigation", "Medicine", "Nature", "Perception",
  "Performance", "Persuasion", "Religion", "Sleight of Hand",
  "Stealth", "Survival",
];

const ABILITY_NAMES: readonly AbilityName[] = [
  "strength", "dexterity", "constitution",
  "intelligence", "wisdom", "charisma",
];
const ABILITY_LABELS: Record<AbilityName, string> = {
  strength: "STR", dexterity: "DEX", constitution: "CON",
  intelligence: "INT", wisdom: "WIS", charisma: "CHA",
};

const SAVING_THROW_OPTIONS = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

const STEP_TITLES = ["Basics", "Ability Scores", "Combat", "Details"];

type ScoreSource = "rolled" | "standard";
interface ScoreChip {
  id: string;
  source: ScoreSource;
  total: number;
  roll?: AbilityRoll; // present when source === "rolled"
}

type AbilityAssignments = Record<AbilityName, string | null>;

const emptyAssignments: AbilityAssignments = {
  strength: null, dexterity: null, constitution: null,
  intelligence: null, wisdom: null, charisma: null,
};

interface FormState {
  name: string;
  race: string;
  customRace: string;
  charClass: string;
  customClass: string;
  level: number;
  // Ability score generation
  scoreMode: "rolled" | "standard";
  scorePool: ScoreChip[]; // unassigned + assigned chips combined
  abilityAssignments: AbilityAssignments; // ability -> chip id
  hasRolled: boolean;
  // Combat
  maxHp: number;
  currentHp: number;
  armorClass: number;
  speed: number;
  proficiencyBonus: number;
  savingThrows: string[];
  // Details
  skills: string[];
  inventory: string[];
  newInventoryItem: string;
  notes: string;
}

function makeChipId(): string {
  return `chip-${Math.random().toString(36).slice(2, 10)}`;
}

function buildStandardArrayChips(): ScoreChip[] {
  return STANDARD_ARRAY.map((total) => ({ id: makeChipId(), source: "standard", total }));
}

function buildRolledChips(rolls: AbilityRoll[]): ScoreChip[] {
  return rolls.map((roll) => ({ id: makeChipId(), source: "rolled", total: roll.total, roll }));
}

const defaultForm: FormState = {
  name: "",
  race: "",
  customRace: "",
  charClass: "",
  customClass: "",
  level: 1,
  scoreMode: "rolled",
  scorePool: [],
  abilityAssignments: { ...emptyAssignments },
  hasRolled: false,
  maxHp: 10,
  currentHp: 10,
  armorClass: 10,
  speed: 30,
  proficiencyBonus: 2,
  savingThrows: [],
  skills: [],
  inventory: [],
  newInventoryItem: "",
  notes: "",
};

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max?: number;
  step?: number;
  fallback: number;
  onChange: (value: number) => void;
  testId: string;
  className?: string;
}

// Numeric input that snaps NaN/empty back to a safe value on blur, so the
// wizard never submits sheetJson with NaN — which is the root cause of the
// "Failed to create character" toast (server requires every numeric field).
function NumberField({ id, label, value, min, max, step, fallback, onChange, testId, className }: NumberFieldProps) {
  const [text, setText] = useState<string>(String(value));
  // Keep the visible text in sync when the value changes externally (e.g., auto-fill).
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseInt(e.target.value, 10);
          if (Number.isFinite(parsed)) {
            onChange(clampInt(parsed, min, max ?? Number.MAX_SAFE_INTEGER, fallback));
          }
        }}
        onBlur={() => {
          const parsed = parseInt(text, 10);
          const safe = Number.isFinite(parsed)
            ? clampInt(parsed, min, max ?? Number.MAX_SAFE_INTEGER, fallback)
            : fallback;
          setText(String(safe));
          if (safe !== value) onChange(safe);
        }}
        data-testid={testId}
      />
    </div>
  );
}

export default function CharacterCreateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [selectedChipId, setSelectedChipId] = useState<string | null>(null);
  const [rollAnimationKey, setRollAnimationKey] = useState(0);
  const createMutation = useCreateCharacter();
  const rollDiceMutation = useRollDice();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: campaign } = useGetCampaign();
  const homebrewRules = campaign?.homebrewRules ?? null;

  // When the campaign rules first load (or change), seed the form's
  // proficiency bonus to match the campaign's rule for the current level.
  useEffect(() => {
    if (!campaign) return;
    const auto = proficiencyBonusForLevel(form.level, homebrewRules);
    if (auto === null) return;
    setForm((prev) => {
      if (prev.proficiencyBonus === auto) return prev;
      const standardForPrev = proficiencyBonusForLevel(prev.level, null);
      if (prev.proficiencyBonus !== standardForPrev) return prev;
      return { ...prev, proficiencyBonus: auto };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, JSON.stringify(homebrewRules)]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resolvedRace = form.race === CUSTOM_OPTION_VALUE ? form.customRace : form.race;
  const resolvedClass = form.charClass === CUSTOM_OPTION_VALUE ? form.customClass : form.charClass;

  // Derive the six numeric ability scores from assignments (for submit).
  const abilityScores: Record<AbilityName, number | null> = useMemo(() => {
    const out = { strength: null, dexterity: null, constitution: null,
                  intelligence: null, wisdom: null, charisma: null } as Record<AbilityName, number | null>;
    for (const ability of ABILITY_NAMES) {
      const chipId = form.abilityAssignments[ability];
      if (!chipId) continue;
      const chip = form.scorePool.find((c) => c.id === chipId);
      out[ability] = chip ? chip.total : null;
    }
    return out;
  }, [form.abilityAssignments, form.scorePool]);

  const assignedChipIds = new Set(
    Object.values(form.abilityAssignments).filter((v): v is string => v !== null),
  );
  const unassignedChips = form.scorePool.filter((c) => !assignedChipIds.has(c.id));
  const allAbilitiesAssigned = ABILITY_NAMES.every((a) => abilityScores[a] !== null);

  // ---- Step validity ----
  const canProceedStep0 =
    form.name.trim() !== "" && resolvedRace.trim() !== "" && resolvedClass.trim() !== "";

  const assignedIdsList = Object.values(form.abilityAssignments).filter(
    (v): v is string => v !== null,
  );
  const step1Valid =
    form.scorePool.length === 6 &&
    allAbilitiesAssigned &&
    new Set(assignedIdsList).size === 6; // every chip used at most once

  const combatNumericsValid =
    Number.isFinite(form.maxHp) && form.maxHp >= 1 &&
    Number.isFinite(form.currentHp) && form.currentHp >= 0 && form.currentHp <= form.maxHp &&
    Number.isFinite(form.armorClass) && form.armorClass >= 0 &&
    Number.isFinite(form.speed) && form.speed >= 0 &&
    Number.isFinite(form.proficiencyBonus) && form.proficiencyBonus >= 1 && form.proficiencyBonus <= 6;

  const formIsValidForSubmit = canProceedStep0 && step1Valid && combatNumericsValid;

  const failingStepLabel = !canProceedStep0
    ? "Basics"
    : !step1Valid
      ? "Ability Scores"
      : !combatNumericsValid
        ? "Combat"
        : null;

  // ---- Roll & assign ----
  const handleRoll = () => {
    const rolls = rollAbilityScores();
    const chips = buildRolledChips(rolls);
    setForm((prev) => ({
      ...prev,
      scoreMode: "rolled",
      scorePool: chips,
      abilityAssignments: { ...emptyAssignments },
      hasRolled: true,
    }));
    setSelectedChipId(null);
    setRollAnimationKey((k) => k + 1);

    // Fire-and-forget: log each roll to the campaign dice history with a
    // descriptive label. We don't block the UI on these — failures are
    // silent so creation isn't held up by a noisy log.
    rolls.forEach((roll, i) => {
      const ability = ABILITY_LABELS[ABILITY_NAMES[i]];
      const kept = roll.dice.filter((_, idx) => idx !== roll.droppedIndex);
      const label = `Char creation – ${ability} (4d6 keep ${kept.join("+")} = ${roll.total}, dropped ${roll.dice[roll.droppedIndex]})`;
      rollDiceMutation.mutate(
        { data: { expression: "4d6", label, characterId: null } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetRecentRollsQueryKey() });
          },
        },
      );
    });
  };

  const handleRerollUnassigned = () => {
    const newRolls = rollAbilityScores().slice(0, unassignedChips.length);
    const newChips = buildRolledChips(newRolls);
    setForm((prev) => {
      const kept = prev.scorePool.filter((c) => assignedChipIds.has(c.id));
      return { ...prev, scorePool: [...kept, ...newChips] };
    });
    setSelectedChipId(null);
    setRollAnimationKey((k) => k + 1);
  };

  const handleStandardArray = () => {
    setForm((prev) => ({
      ...prev,
      scoreMode: "standard",
      scorePool: buildStandardArrayChips(),
      abilityAssignments: { ...emptyAssignments },
      hasRolled: true,
    }));
    setSelectedChipId(null);
    setRollAnimationKey((k) => k + 1);
  };

  const handleAutoAssign = () => {
    if (form.scorePool.length !== 6) return;
    const order =
      RECOMMENDED_ABILITY_ORDER[resolvedClass] ?? DEFAULT_ABILITY_ORDER;
    // Sort chips highest-first; assign in priority order.
    const sortedChipIds = [...form.scorePool]
      .sort((a, b) => b.total - a.total)
      .map((c) => c.id);
    const next: AbilityAssignments = { ...emptyAssignments };
    order.forEach((ability, i) => {
      next[ability] = sortedChipIds[i] ?? null;
    });
    update("abilityAssignments", next);
    setSelectedChipId(null);
  };

  const handleClearAssignments = () => {
    update("abilityAssignments", { ...emptyAssignments });
    setSelectedChipId(null);
  };

  const handleChipClick = (chipId: string) => {
    if (assignedChipIds.has(chipId)) return; // chip is in a slot
    setSelectedChipId((prev) => (prev === chipId ? null : chipId));
  };

  const handleSlotClick = (ability: AbilityName) => {
    const currentlyAssigned = form.abilityAssignments[ability];
    if (currentlyAssigned) {
      // Tap an assigned slot to return its chip to the pool.
      setForm((prev) => ({
        ...prev,
        abilityAssignments: { ...prev.abilityAssignments, [ability]: null },
      }));
      return;
    }
    if (!selectedChipId) return;
    setForm((prev) => ({
      ...prev,
      abilityAssignments: { ...prev.abilityAssignments, [ability]: selectedChipId },
    }));
    setSelectedChipId(null);
  };

  // ---- Submit ----
  const handleSubmit = () => {
    if (!formIsValidForSubmit) return;
    const sheet: CharacterSheet = {
      strength: abilityScores.strength!,
      dexterity: abilityScores.dexterity!,
      constitution: abilityScores.constitution!,
      intelligence: abilityScores.intelligence!,
      wisdom: abilityScores.wisdom!,
      charisma: abilityScores.charisma!,
      maxHp: form.maxHp,
      currentHp: form.currentHp,
      armorClass: form.armorClass,
      speed: form.speed,
      proficiencyBonus: form.proficiencyBonus,
      savingThrows: form.savingThrows,
      skills: form.skills,
      inventory: form.inventory.length > 0 ? form.inventory : undefined,
      notes: form.notes || undefined,
    };

    const body: CreateCharacterBody = {
      name: form.name.trim(),
      race: resolvedRace.trim(),
      class: resolvedClass.trim(),
      level: form.level,
      sheetJson: sheet,
    };

    createMutation.mutate(
      { data: body },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey() });
          toast({ title: "Character created!" });
          onCreated();
        },
        onError: (err: unknown) => {
          // Surface whatever the server tells us (e.g. validation message)
          // instead of the generic toast so the player has a real clue.
          let detail = "";
          const maybe = err as { response?: { data?: { error?: string } }; message?: string };
          if (maybe?.response?.data?.error) detail = maybe.response.data.error;
          else if (maybe?.message) detail = maybe.message;
          toast({
            title: "Failed to create character",
            description: detail ? detail.slice(0, 240) : undefined,
            variant: "destructive",
          });
        },
      },
    );
  };

  const addInventoryItem = () => {
    if (form.newInventoryItem.trim()) {
      update("inventory", [...form.inventory, form.newInventoryItem.trim()]);
      update("newInventoryItem", "");
    }
  };

  const removeInventoryItem = (index: number) => {
    update("inventory", form.inventory.filter((_, i) => i !== index));
  };

  const toggleSkill = (skill: string) => {
    update("skills", form.skills.includes(skill) ? form.skills.filter((s) => s !== skill) : [...form.skills, skill]);
  };

  const toggleSavingThrow = (st: string) => {
    update("savingThrows", form.savingThrows.includes(st) ? form.savingThrows.filter((s) => s !== st) : [...form.savingThrows, st]);
  };

  return (
    <div className="space-y-6" data-testid="character-create-form">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-create">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Cancel
        </Button>
        <h2 className="font-serif text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          Create Character
        </h2>
      </div>

      <div className="flex gap-2 mb-6">
        {STEP_TITLES.map((title, i) => (
          <button
            key={title}
            onClick={() => { if (i < step) setStep(i); }}
            className={`flex-1 text-center py-2 text-xs font-medium rounded-lg transition-colors ${
              i === step
                ? "bg-primary text-primary-foreground"
                : i < step
                  ? "bg-primary/20 text-primary cursor-pointer hover:bg-primary/30"
                  : "bg-muted/50 text-muted-foreground"
            }`}
            data-testid={`step-${i}`}
          >
            {title}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-6">
        {step === 0 && (
          <div className="space-y-5" data-testid="step-basics">
            <div className="space-y-2">
              <Label htmlFor="char-name">Character Name *</Label>
              <Input
                id="char-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. Thalion Stormwind"
                data-testid="input-char-name"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Race *</Label>
                <Select value={form.race} onValueChange={(v) => update("race", v)}>
                  <SelectTrigger data-testid="select-race">
                    <SelectValue placeholder="Select a race" />
                  </SelectTrigger>
                  <SelectContent>
                    {DND_RACES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_OPTION_VALUE}>Other (custom)</SelectItem>
                  </SelectContent>
                </Select>
                {form.race === CUSTOM_OPTION_VALUE && (
                  <Input
                    value={form.customRace}
                    onChange={(e) => update("customRace", e.target.value)}
                    placeholder="Enter custom race"
                    data-testid="input-custom-race"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label>Class *</Label>
                <Select value={form.charClass} onValueChange={(v) => update("charClass", v)}>
                  <SelectTrigger data-testid="select-class">
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {DND_CLASSES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_OPTION_VALUE}>Other (custom)</SelectItem>
                  </SelectContent>
                </Select>
                {form.charClass === CUSTOM_OPTION_VALUE && (
                  <Input
                    value={form.customClass}
                    onChange={(e) => update("customClass", e.target.value)}
                    placeholder="Enter custom class"
                    data-testid="input-custom-class"
                  />
                )}
              </div>
            </div>

            <NumberField
              id="char-level"
              label="Level"
              value={form.level}
              min={1}
              max={20}
              fallback={1}
              onChange={(lvl) => {
                setForm((prev) => {
                  const auto = proficiencyBonusForLevel(lvl, homebrewRules);
                  return {
                    ...prev,
                    level: lvl,
                    proficiencyBonus: auto ?? prev.proficiencyBonus,
                  };
                });
              }}
              testId="input-level"
              className="max-w-[200px]"
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5" data-testid="step-abilities">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                In 5e you don't pick your stats — you roll for them. Tap{" "}
                <span className="font-medium text-foreground">Roll Stats</span> to roll{" "}
                <span className="font-mono">4d6</span> six times (dropping the lowest die each time),
                then tap a score and tap an ability slot to assign it.
              </p>
              {!form.hasRolled && (
                <p className="text-xs text-muted-foreground/80">
                  Prefer not to roll? Use the standard array (15, 14, 13, 12, 10, 8) instead.
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleRoll}
                variant={form.hasRolled ? "outline" : "default"}
                size="sm"
                data-testid="button-roll-stats"
              >
                <Dices className="h-4 w-4 mr-1.5" />
                {form.hasRolled ? "Reroll all" : "Roll Stats"}
              </Button>
              {form.scoreMode === "rolled" && form.hasRolled && unassignedChips.length > 0 && unassignedChips.length < 6 && (
                <Button
                  onClick={handleRerollUnassigned}
                  variant="outline"
                  size="sm"
                  data-testid="button-reroll-unassigned"
                >
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  Reroll unassigned ({unassignedChips.length})
                </Button>
              )}
              <Button
                onClick={handleStandardArray}
                variant="outline"
                size="sm"
                data-testid="button-standard-array"
              >
                Use standard array
              </Button>
              {form.hasRolled && form.scorePool.length === 6 && (
                <Button
                  onClick={handleAutoAssign}
                  variant="outline"
                  size="sm"
                  data-testid="button-auto-assign"
                >
                  <Wand2 className="h-4 w-4 mr-1.5" />
                  Auto-assign{resolvedClass ? ` for ${resolvedClass}` : ""}
                </Button>
              )}
              {form.hasRolled && Object.values(form.abilityAssignments).some((v) => v !== null) && (
                <Button
                  onClick={handleClearAssignments}
                  variant="ghost"
                  size="sm"
                  data-testid="button-clear-assignments"
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Score pool */}
            {form.hasRolled && (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    {form.scoreMode === "rolled" ? "Your rolls" : "Standard array"} ({unassignedChips.length} unassigned)
                  </p>
                  {selectedChipId && (
                    <p className="text-xs text-primary">Tap an ability slot to assign →</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2" key={`pool-${rollAnimationKey}`}>
                  <AnimatePresence mode="popLayout">
                    {unassignedChips.map((chip, i) => {
                      const isSelected = selectedChipId === chip.id;
                      return (
                        <motion.button
                          key={chip.id}
                          layout
                          type="button"
                          onClick={() => handleChipClick(chip.id)}
                          initial={{ opacity: 0, scale: 0.5, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{
                            type: "spring", stiffness: 320, damping: 22,
                            delay: i * 0.06,
                          }}
                          className={`group relative flex flex-col items-center justify-center rounded-lg border-2 px-3 py-2 min-w-[64px] transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/15 ring-2 ring-primary/40"
                              : "border-border/60 bg-card hover:border-primary/60 hover:bg-primary/5"
                          }`}
                          data-testid={`chip-score-${chip.total}-${i}`}
                        >
                          <span className="font-mono text-2xl font-bold text-foreground tabular-nums">
                            {chip.total}
                          </span>
                          {chip.roll && (
                            <span className="text-[10px] text-muted-foreground/80 font-mono mt-0.5 leading-none">
                              {chip.roll.dice.map((d, idx) => (
                                <span
                                  key={idx}
                                  className={idx === chip.roll!.droppedIndex
                                    ? "line-through opacity-50"
                                    : ""}
                                >
                                  {d}{idx < 3 ? " " : ""}
                                </span>
                              ))}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                    {unassignedChips.length === 0 && (
                      <motion.p
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-muted-foreground py-2"
                      >
                        All scores assigned. Tap an ability slot to send one back to the pool.
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Ability slots */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {ABILITY_NAMES.map((stat) => {
                const score = abilityScores[stat];
                const mod = score !== null ? Math.floor((score - 10) / 2) : null;
                const isAssigned = score !== null;
                const canDrop = !isAssigned && selectedChipId !== null;
                return (
                  <button
                    key={stat}
                    type="button"
                    onClick={() => handleSlotClick(stat)}
                    disabled={!form.hasRolled || (!isAssigned && !selectedChipId)}
                    className={`rounded-lg border-2 p-3 text-center space-y-1 transition-colors ${
                      isAssigned
                        ? "border-primary/60 bg-primary/10 hover:bg-primary/15 hover:border-primary cursor-pointer"
                        : canDrop
                          ? "border-primary/50 border-dashed bg-primary/5 hover:bg-primary/10 cursor-pointer animate-pulse"
                          : "border-border/40 border-dashed bg-muted/20"
                    } ${!form.hasRolled ? "opacity-60" : ""}`}
                    data-testid={`slot-${stat}`}
                  >
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      {ABILITY_LABELS[stat]}
                    </p>
                    <p className="font-mono text-3xl font-bold text-foreground tabular-nums">
                      {score ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground h-4">
                      {mod !== null ? `Modifier: ${mod >= 0 ? "+" : ""}${mod}` : isAssigned ? "" : "tap to assign"}
                    </p>
                  </button>
                );
              })}
            </div>

            {form.hasRolled && form.scorePool.length === 6 && unassignedChips.length === 1 && (
              <p className="text-xs text-muted-foreground">Almost there — just one left.</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5" data-testid="step-combat">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <NumberField
                id="max-hp"
                label="Max HP"
                value={form.maxHp}
                min={1}
                fallback={10}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, maxHp: v, currentHp: Math.min(prev.currentHp, v) }))
                }
                testId="input-max-hp"
              />
              <NumberField
                id="current-hp"
                label="Current HP"
                value={form.currentHp}
                min={0}
                max={form.maxHp}
                fallback={form.maxHp}
                onChange={(v) => update("currentHp", v)}
                testId="input-current-hp"
              />
              <NumberField
                id="armor-class"
                label="Armor Class"
                value={form.armorClass}
                min={0}
                fallback={10}
                onChange={(v) => update("armorClass", v)}
                testId="input-armor-class"
              />
              <NumberField
                id="speed"
                label="Speed (ft)"
                value={form.speed}
                min={0}
                step={5}
                fallback={30}
                onChange={(v) => update("speed", v)}
                testId="input-speed"
              />
            </div>

            <NumberField
              id="prof-bonus"
              label="Proficiency Bonus"
              value={form.proficiencyBonus}
              min={1}
              max={6}
              fallback={2}
              onChange={(v) => update("proficiencyBonus", v)}
              testId="input-proficiency-bonus"
              className="max-w-[200px]"
            />

            <div className="space-y-3">
              <Label>Saving Throw Proficiencies</Label>
              <div className="flex flex-wrap gap-2">
                {SAVING_THROW_OPTIONS.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => toggleSavingThrow(st)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      form.savingThrows.includes(st)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                    data-testid={`toggle-save-${st.toLowerCase()}`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5" data-testid="step-details">
            <div className="space-y-3">
              <Label>Skill Proficiencies</Label>
              <div className="flex flex-wrap gap-2">
                {DND_SKILLS.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      form.skills.includes(skill)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                    data-testid={`toggle-skill-${skill.toLowerCase().replace(/ /g, "-")}`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Inventory</Label>
              <div className="flex gap-2">
                <Input
                  value={form.newInventoryItem}
                  onChange={(e) => update("newInventoryItem", e.target.value)}
                  placeholder="Add an item..."
                  onKeyDown={(e) => e.key === "Enter" && addInventoryItem()}
                  data-testid="input-inventory-item"
                />
                <Button variant="outline" size="sm" onClick={addInventoryItem} data-testid="button-add-inventory">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {form.inventory.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.inventory.map((item, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-1 bg-muted/50 rounded text-xs text-foreground">
                      {item}
                      <button onClick={() => removeInventoryItem(i)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="char-notes">Notes</Label>
              <Textarea
                id="char-notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Backstory, personality traits, bonds, flaws..."
                rows={4}
                data-testid="input-notes"
              />
            </div>
          </div>
        )}
      </div>

      {/* Inline submit-validity hint */}
      {step === STEP_TITLES.length - 1 && failingStepLabel && (
        <p className="text-xs text-amber-400/90" data-testid="text-incomplete-hint">
          {failingStepLabel} step is incomplete — go back and finish it before creating.
        </p>
      )}

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          data-testid="button-prev-step"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {step < STEP_TITLES.length - 1 ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={
              (step === 0 && !canProceedStep0) ||
              (step === 1 && !step1Valid) ||
              (step === 2 && !combatNumericsValid)
            }
            data-testid="button-next-step"
          >
            Next
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !formIsValidForSubmit}
            data-testid="button-create-character"
          >
            {createMutation.isPending ? "Creating..." : "Create Character"}
          </Button>
        )}
      </div>
    </div>
  );
}

// Exported for potential future use (debug labels, dev tooling).
export { abilityRollLabel };
