import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, Sparkles, Plus, X, Dices, Wand2, RotateCcw, Lock,
  ChevronDown, ChevronRight, Heart, Shield, Zap, Award, Flame,
  Axe, Music, Cross, Leaf, Sword, Hand, ShieldCheck, Target, VenetianMask, Eye,
} from "@workspace/ui";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@workspace/ui";
import { Input } from "@workspace/ui";
import { Label } from "@workspace/ui";
import { Textarea } from "@workspace/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui";
import {
  useCreateCharacter,
  getListCharactersQueryKey,
  useGetCampaign,
} from "@workspace/api-client-react";
import type { CreateCharacterBody, CharacterSheet } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@workspace/ui";
import {
  DND_RACES,
  DND_CLASSES,
  CUSTOM_OPTION_VALUE,
  proficiencyBonusForLevel,
  RECOMMENDED_ABILITY_ORDER,
  DEFAULT_ABILITY_ORDER,
  type AbilityName,
  type SpellSlotMap,
} from "@/lib/dnd-options";
import {
  rollAbilityScores,
  STANDARD_ARRAY,
  type AbilityRoll,
} from "@/lib/dice";
import {
  isIdentityValid,
  isOriginValid,
  isCallingValid,
  isBackgroundValid,
  isAbilitiesValid,
  isAbilityAssignmentsValid,
  isCombatNumericsValid,
  isFormValidForSubmit,
} from "@/lib/character-form-validation";
import {
  RACE_DATA,
  CLASS_DATA,
  BACKGROUND_DATA,
  DND_BACKGROUNDS,
  ABILITY_LABEL_TO_NAME,
  level1MaxHp,
  modifierFor,
  type ClassInfo,
  type RaceInfo,
  type BackgroundInfo,
  type HitDieSize,
} from "@/lib/dnd-srd";

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
const ABILITY_FULL: Record<AbilityName, string> = {
  strength: "Strength", dexterity: "Dexterity", constitution: "Constitution",
  intelligence: "Intelligence", wisdom: "Wisdom", charisma: "Charisma",
};

const SAVING_THROW_OPTIONS = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

// 6-step AAA-FTUE wizard. Each step is one focused decision; subtitles set tone.
const STEP_TITLES = ["Identity", "Origin", "Calling", "Background", "Abilities", "Review"] as const;
const STEP_SUBTITLES: Record<number, string> = {
  0: "How shall the bards remember you?",
  1: "Your race shapes your body and your story.",
  2: "Your calling decides your role in the party.",
  3: "Where did your story begin?",
  4: "Forge your strengths and weaknesses.",
  5: "Your hero stands ready. Take one last look.",
};

// Big iconography for the picker grids — emoji for races/backgrounds (most
// expressive at large sizes), lucide for classes (cleaner alongside our UI).
const RACE_EMOJI: Record<string, string> = {
  Dragonborn: "🐲", Dwarf: "⛏️", Elf: "🧝", Gnome: "🎩", "Half-Elf": "🌙",
  Halfling: "🍀", "Half-Orc": "💪", Human: "🧑", Tiefling: "😈",
};
const CLASS_ICON: Record<string, { icon: typeof Sword; tint: string }> = {
  Barbarian: { icon: Axe, tint: "text-rose-300" },
  Bard: { icon: Music, tint: "text-pink-300" },
  Cleric: { icon: Cross, tint: "text-yellow-200" },
  Druid: { icon: Leaf, tint: "text-emerald-300" },
  Fighter: { icon: Sword, tint: "text-slate-200" },
  Monk: { icon: Hand, tint: "text-orange-200" },
  Paladin: { icon: ShieldCheck, tint: "text-sky-200" },
  Ranger: { icon: Target, tint: "text-lime-300" },
  Rogue: { icon: VenetianMask, tint: "text-zinc-300" },
  Sorcerer: { icon: Flame, tint: "text-fuchsia-300" },
  Warlock: { icon: Eye, tint: "text-violet-300" },
  Wizard: { icon: Wand2, tint: "text-indigo-300" },
};

type ScoreSource = "rolled" | "standard";
interface ScoreChip {
  id: string;
  source: ScoreSource;
  total: number;
  roll?: AbilityRoll;
}

type AbilityAssignments = Record<AbilityName, string | null>;

const emptyAssignments: AbilityAssignments = {
  strength: null, dexterity: null, constitution: null,
  intelligence: null, wisdom: null, charisma: null,
};

interface FormState {
  name: string;
  portraitUrl: string;
  race: string;
  customRace: string;
  charClass: string;
  customClass: string;
  background: string;
  customBackground: string;
  level: number;
  scoreMode: "rolled" | "standard";
  scorePool: ScoreChip[];
  abilityAssignments: AbilityAssignments;
  hasRolled: boolean;
  racialBonuses: Partial<Record<AbilityName, number>>;
  hitDie: HitDieSize | null;
  maxHpAuto: boolean;
  maxHp: number;
  currentHp: number;
  armorClass: number;
  speed: number;
  proficiencyBonus: number;
  savingThrows: string[];
  skills: string[];
  equipmentChoices: Record<string, number>;
  inventory: string[];
  newInventoryItem: string;
  notes: string;
  spellSlots: SpellSlotMap | null;
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
  portraitUrl: "",
  race: "",
  customRace: "",
  charClass: "",
  customClass: "",
  background: "",
  customBackground: "",
  level: 1,
  scoreMode: "rolled",
  scorePool: [],
  abilityAssignments: { ...emptyAssignments },
  hasRolled: false,
  racialBonuses: {},
  hitDie: null,
  maxHpAuto: true,
  maxHp: 10,
  currentHp: 10,
  armorClass: 10,
  speed: 30,
  proficiencyBonus: 2,
  savingThrows: [],
  skills: [],
  equipmentChoices: {},
  inventory: [],
  newInventoryItem: "",
  notes: "",
  spellSlots: null,
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

function NumberField({ id, label, value, min, max, step, fallback, onChange, testId, className }: NumberFieldProps) {
  const [text, setText] = useState<string>(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
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

// Persistent wizard chrome: progress bar, eyebrow ("Step N of 6"), big
// title, warm subtitle, animated body, sticky footer w/ Back / Next.
function WizardShell({
  step, totalSteps, title, subtitle, children, footer,
}: {
  step: number;
  totalSteps: number;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const pct = Math.round(((step + 1) / totalSteps) * 100);
  return (
    <div className="space-y-6">
      <div className="space-y-3" data-testid="wizard-header">
        <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
          <motion.div
            className="h-full bg-primary"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 220, damping: 28 }}
            data-testid="wizard-progress"
          />
        </div>
        <p
          className="text-[11px] uppercase tracking-[0.2em] text-primary/80 font-semibold"
          data-testid="wizard-step-counter"
        >
          Step {step + 1} of {totalSteps} — {STEP_TITLES[step]}
        </p>
        <h2
          className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight"
          data-testid="wizard-title"
        >
          {title}
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground" data-testid="wizard-subtitle">
          {subtitle}
        </p>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
          className="rounded-2xl glass-panel p-5 sm:p-6"
        >
          {children}
        </motion.div>
      </AnimatePresence>
      <div className="sticky bottom-2 z-10">
        <div className="rounded-xl glass-panel p-3 flex justify-between items-center">
          {footer}
        </div>
      </div>
    </div>
  );
}

// Tappable picker card (used by Origin / Calling / Background grids).
function PickerCard({
  selected, onClick, autoFocus, title, subtitle, leading, children, testId,
}: {
  selected: boolean;
  onClick: () => void;
  autoFocus?: boolean;
  title: string;
  subtitle?: string;
  leading: ReactNode;
  children?: ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      onClick={onClick}
      data-testid={testId}
      className={`group relative w-full text-left rounded-2xl border-2 p-4 sm:p-5 transition-all duration-150 min-h-[112px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
        selected
          ? "border-primary bg-primary/10 shadow-[0_0_24px_-6px_hsl(270_100%_60%/0.55)] scale-[1.01]"
          : "border-border/50 bg-card/60 hover:border-primary/60 hover:bg-primary/5 active:scale-[0.99]"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">{leading}</div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-base sm:text-lg text-foreground leading-tight">{title}</p>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground leading-snug">{subtitle}</p>
          )}
          {children}
        </div>
      </div>
      {selected && (
        <span className="absolute top-2 right-2 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 shadow">
          ✓
        </span>
      )}
    </button>
  );
}

export default function CharacterCreateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [selectedChipId, setSelectedChipId] = useState<string | null>(null);
  const [rollAnimationKey, setRollAnimationKey] = useState(0);
  const [hasTappedChip, setHasTappedChip] = useState(false);
  const [hasAssignedOnce, setHasAssignedOnce] = useState(false);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const createMutation = useCreateCharacter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: campaign } = useGetCampaign();
  const homebrewRules = campaign?.homebrewRules ?? null;

  // Seed proficiency bonus from the campaign rules on first load.
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
  const resolvedBackground = form.background === CUSTOM_OPTION_VALUE
    ? form.customBackground
    : form.background;

  const raceInfo: RaceInfo | null =
    form.race && form.race !== CUSTOM_OPTION_VALUE ? RACE_DATA[form.race] ?? null : null;
  const classInfo: ClassInfo | null =
    form.charClass && form.charClass !== CUSTOM_OPTION_VALUE ? CLASS_DATA[form.charClass] ?? null : null;
  const backgroundInfo: BackgroundInfo | null =
    form.background && form.background !== CUSTOM_OPTION_VALUE
      ? BACKGROUND_DATA[form.background] ?? null
      : null;

  // Race change → racial ability bonuses + race default speed.
  useEffect(() => {
    if (raceInfo) {
      setForm((prev) => ({
        ...prev,
        racialBonuses: { ...raceInfo.abilityBonuses },
        speed: raceInfo.speed,
      }));
    } else if (form.race === CUSTOM_OPTION_VALUE || form.race === "") {
      setForm((prev) =>
        Object.keys(prev.racialBonuses).length === 0 ? prev : { ...prev, racialBonuses: {} },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.race]);

  // Class change → lock saves, set hit die, reset class-specific picks.
  useEffect(() => {
    if (classInfo) {
      const lockedLabels = classInfo.savingThrows.map(
        (s) => s.charAt(0).toUpperCase() + s.slice(1),
      );
      setForm((prev) => ({
        ...prev,
        hitDie: classInfo.hitDie,
        maxHpAuto: true,
        savingThrows: Array.from(new Set([...lockedLabels])),
        skills: prev.skills
          .filter((s) => classInfo.skillChoices.from.includes(s))
          .slice(0, classInfo.skillChoices.count),
        equipmentChoices: {},
      }));
    } else if (form.charClass === CUSTOM_OPTION_VALUE || form.charClass === "") {
      setForm((prev) =>
        prev.hitDie === null ? prev : { ...prev, hitDie: null, equipmentChoices: {} },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.charClass]);

  // Final ability scores = chip + racial bonus.
  const abilityScores: Record<AbilityName, number | null> = useMemo(() => {
    const out = {
      strength: null, dexterity: null, constitution: null,
      intelligence: null, wisdom: null, charisma: null,
    } as Record<AbilityName, number | null>;
    for (const ability of ABILITY_NAMES) {
      const chipId = form.abilityAssignments[ability];
      if (!chipId) continue;
      const chip = form.scorePool.find((c) => c.id === chipId);
      if (!chip) continue;
      const bonus = form.racialBonuses[ability] ?? 0;
      out[ability] = chip.total + bonus;
    }
    return out;
  }, [form.abilityAssignments, form.scorePool, form.racialBonuses]);

  // Auto-recompute level-1 max HP while the user hasn't manually edited it.
  const conScoreFinal = abilityScores.constitution;
  useEffect(() => {
    if (form.hitDie === null || conScoreFinal === null) return;
    const auto = level1MaxHp(form.hitDie, conScoreFinal);
    setForm((prev) => {
      if (!prev.maxHpAuto) return prev;
      if (prev.maxHp === auto) return prev;
      const newCurrent = Math.min(prev.currentHp, auto);
      return { ...prev, maxHp: auto, currentHp: newCurrent };
    });
  }, [form.hitDie, conScoreFinal]);

  const assignedChipIds = new Set(
    Object.values(form.abilityAssignments).filter((v): v is string => v !== null),
  );
  const unassignedChips = form.scorePool.filter((c) => !assignedChipIds.has(c.id));

  // ---- Step validity ----
  const validatable = {
    name: form.name,
    resolvedRace,
    resolvedClass,
    resolvedBackground,
    scorePool: form.scorePool.map((c) => ({ id: c.id, total: c.total })),
    abilityAssignments: form.abilityAssignments,
    maxHp: form.maxHp,
    currentHp: form.currentHp,
    armorClass: form.armorClass,
    speed: form.speed,
    proficiencyBonus: form.proficiencyBonus,
  };
  const stepValid: Record<number, boolean> = {
    0: isIdentityValid(validatable),
    1: isOriginValid(validatable),
    2: isCallingValid(validatable),
    3: isBackgroundValid(validatable),
    4: isAbilitiesValid(validatable),
    5: isFormValidForSubmit(validatable),
  };
  const formIsValid = stepValid[5];

  const failingStepLabel = !stepValid[0] ? "Identity"
    : !stepValid[1] ? "Origin"
    : !stepValid[2] ? "Calling"
    : !stepValid[3] ? "Background"
    : !stepValid[4] ? "Abilities"
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
    const order = RECOMMENDED_ABILITY_ORDER[resolvedClass] ?? DEFAULT_ABILITY_ORDER;
    const sortedChipIds = [...form.scorePool]
      .sort((a, b) => b.total - a.total)
      .map((c) => c.id);
    const next: AbilityAssignments = { ...emptyAssignments };
    order.forEach((ability, i) => { next[ability] = sortedChipIds[i] ?? null; });
    update("abilityAssignments", next);
    setSelectedChipId(null);
    setHasAssignedOnce(true);
  };

  const handleClearAssignments = () => {
    update("abilityAssignments", { ...emptyAssignments });
    setSelectedChipId(null);
  };

  const handleChipClick = (chipId: string) => {
    if (assignedChipIds.has(chipId)) return;
    setHasTappedChip(true);
    setSelectedChipId((prev) => (prev === chipId ? null : chipId));
  };

  const handleSlotClick = (ability: AbilityName) => {
    const currentlyAssigned = form.abilityAssignments[ability];
    if (currentlyAssigned) {
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
    setHasAssignedOnce(true);
  };

  // Merged skill list = the player's class picks + background's free profs (deduped).
  const mergedSkills = useMemo(() => {
    const set = new Set(form.skills);
    if (backgroundInfo) for (const s of backgroundInfo.skillProficiencies) set.add(s);
    return Array.from(set);
  }, [form.skills, backgroundInfo]);

  // ---- Submit ----
  const handleSubmit = () => {
    if (!formIsValid) return;
    const equipmentItems: string[] = classInfo
      ? classInfo.startingEquipmentOptions.flatMap((slot) => {
          const idx = form.equipmentChoices[slot.slot];
          if (idx === undefined || idx === -1) return [];
          return slot.choices[idx]?.items ?? [];
        })
      : [];
    const fullInventory = [...equipmentItems, ...form.inventory];

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
      skills: mergedSkills,
      inventory: fullInventory.length > 0 ? fullInventory : undefined,
      notes: form.notes || undefined,
      spellSlots: form.spellSlots ?? undefined,
      background: resolvedBackground.trim() || undefined,
    };

    const body: CreateCharacterBody = {
      name: form.name.trim(),
      race: resolvedRace.trim(),
      class: resolvedClass.trim(),
      level: form.level,
      sheetJson: sheet,
      ...(form.portraitUrl.trim() ? { portraitUrl: form.portraitUrl.trim() } : {}),
    };

    createMutation.mutate(
      { data: body },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey() });
          toast({ title: "Character forged!" });
          onCreated();
        },
        onError: (err: unknown) => {
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

  // ---- Footer ----
  const onNext = () => setStep((s) => Math.min(STEP_TITLES.length - 1, s + 1));
  const onBack = () => setStep((s) => Math.max(0, s - 1));
  const isLast = step === STEP_TITLES.length - 1;
  const canAdvance = stepValid[step];

  const footer = (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={step === 0 ? onCancel : onBack}
        data-testid={step === 0 ? "button-cancel-create" : "button-prev-step"}
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        {step === 0 ? "Cancel" : "Back"}
      </Button>
      {!isLast ? (
        <Button onClick={onNext} disabled={!canAdvance} data-testid="button-next-step">
          Next
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      ) : (
        <Button
          onClick={handleSubmit}
          disabled={createMutation.isPending || !formIsValid}
          data-testid="button-create-character"
          className="bg-primary hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          {createMutation.isPending ? "Forging…" : "Forge Character"}
        </Button>
      )}
    </>
  );

  return (
    <div data-testid="character-create-form">
      <WizardShell
        step={step}
        totalSteps={STEP_TITLES.length}
        title={STEP_TITLES[step]}
        subtitle={STEP_SUBTITLES[step]}
        footer={footer}
      >
        {/* ---- Step 0: Identity ---- */}
        {step === 0 && (
          <div className="space-y-5" data-testid="step-identity">
            <div className="space-y-2">
              <Label htmlFor="char-name">Character Name *</Label>
              <Input
                id="char-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. Thalion Stormwind"
                autoFocus
                className="text-lg"
                data-testid="input-char-name"
              />
            </div>
            <NumberField
              id="char-level"
              label="Starting Level"
              value={form.level}
              min={1}
              max={20}
              fallback={1}
              onChange={(lvl) => {
                setForm((prev) => {
                  const auto = proficiencyBonusForLevel(lvl, homebrewRules);
                  return { ...prev, level: lvl, proficiencyBonus: auto ?? prev.proficiencyBonus };
                });
              }}
              testId="input-level"
              className="max-w-[200px]"
            />
            <div className="space-y-2">
              <Label htmlFor="char-portrait">Portrait URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="char-portrait"
                type="url"
                value={form.portraitUrl}
                onChange={(e) => update("portraitUrl", e.target.value)}
                placeholder="https://example.com/portrait.png"
                data-testid="input-portrait-url"
              />
              <p className="text-xs text-muted-foreground">You can also upload one later from the character page.</p>
            </div>
          </div>
        )}

        {/* ---- Step 1: Origin (race grid) ---- */}
        {step === 1 && (
          <div className="space-y-4" data-testid="step-origin">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DND_RACES.map((race, i) => {
                const info = RACE_DATA[race];
                const bonusBits = Object.entries(info.abilityBonuses)
                  .map(([k, v]) => `+${v} ${ABILITY_LABELS[k as AbilityName]}`)
                  .join(" · ");
                return (
                  <PickerCard
                    key={race}
                    selected={form.race === race}
                    autoFocus={i === 0 && form.race === ""}
                    onClick={() => update("race", race)}
                    title={race}
                    subtitle={`Speed ${info.speed} ft · ${bonusBits || "no fixed bonus"}`}
                    leading={<span className="text-5xl leading-none" aria-hidden="true">{RACE_EMOJI[race] ?? "✨"}</span>}
                    testId={`card-race-${race.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  >
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                      {info.traits[0]?.summary}
                    </p>
                  </PickerCard>
                );
              })}
              <PickerCard
                selected={form.race === CUSTOM_OPTION_VALUE}
                onClick={() => update("race", CUSTOM_OPTION_VALUE)}
                title="Other"
                subtitle="Bring your own race name (homebrew)."
                leading={<span className="text-5xl leading-none" aria-hidden="true">✨</span>}
                testId="card-race-custom"
              />
            </div>
            {form.race === CUSTOM_OPTION_VALUE && (
              <Input
                value={form.customRace}
                onChange={(e) => update("customRace", e.target.value)}
                placeholder="Enter custom race"
                data-testid="input-custom-race"
              />
            )}
          </div>
        )}

        {/* ---- Step 2: Calling (class grid) ---- */}
        {step === 2 && (
          <div className="space-y-4" data-testid="step-calling">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DND_CLASSES.map((cls, i) => {
                const info = CLASS_DATA[cls];
                const meta = CLASS_ICON[cls] ?? { icon: Sword, tint: "text-foreground" };
                const Icon = meta.icon;
                return (
                  <PickerCard
                    key={cls}
                    selected={form.charClass === cls}
                    autoFocus={i === 0 && form.charClass === ""}
                    onClick={() => update("charClass", cls)}
                    title={cls}
                    subtitle={`Hit die d${info.hitDie} · Saves: ${info.savingThrows.map((s) => s.slice(0, 3).toUpperCase()).join(" & ")}`}
                    leading={
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/30 ${meta.tint}`}
                        aria-hidden="true"
                      >
                        <Icon className="h-6 w-6" />
                      </span>
                    }
                    testId={`card-class-${cls.toLowerCase()}`}
                  >
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                      {info.level1Features[0]?.name}: {info.level1Features[0]?.summary}
                    </p>
                  </PickerCard>
                );
              })}
              <PickerCard
                selected={form.charClass === CUSTOM_OPTION_VALUE}
                onClick={() => update("charClass", CUSTOM_OPTION_VALUE)}
                title="Other"
                subtitle="Bring your own class name (homebrew)."
                leading={
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/30">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </span>
                }
                testId="card-class-custom"
              />
            </div>
            {form.charClass === CUSTOM_OPTION_VALUE && (
              <Input
                value={form.customClass}
                onChange={(e) => update("customClass", e.target.value)}
                placeholder="Enter custom class"
                data-testid="input-custom-class"
              />
            )}
          </div>
        )}

        {/* ---- Step 3: Background ---- */}
        {step === 3 && (
          <div className="space-y-4" data-testid="step-background">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DND_BACKGROUNDS.map((bg, i) => {
                const info = BACKGROUND_DATA[bg];
                return (
                  <PickerCard
                    key={bg}
                    selected={form.background === bg}
                    autoFocus={i === 0 && form.background === ""}
                    onClick={() => update("background", bg)}
                    title={bg}
                    subtitle={info.description}
                    leading={<span className="text-5xl leading-none" aria-hidden="true">{info.emoji}</span>}
                    testId={`card-background-${bg.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  >
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {info.skillProficiencies.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-primary/15 text-primary text-[10px] font-medium px-2 py-0.5 ring-1 ring-primary/30"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </PickerCard>
                );
              })}
              <PickerCard
                selected={form.background === CUSTOM_OPTION_VALUE}
                onClick={() => update("background", CUSTOM_OPTION_VALUE)}
                title="Other"
                subtitle="Write your own — no auto skill profs."
                leading={<span className="text-5xl leading-none" aria-hidden="true">✍️</span>}
                testId="card-background-custom"
              />
            </div>
            {form.background === CUSTOM_OPTION_VALUE && (
              <Input
                value={form.customBackground}
                onChange={(e) => update("customBackground", e.target.value)}
                placeholder="Enter custom background"
                data-testid="input-custom-background"
              />
            )}
            {backgroundInfo && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-1" data-testid="background-feature">
                <p className="font-semibold text-foreground">{backgroundInfo.feature.name}</p>
                <p className="text-muted-foreground">{backgroundInfo.feature.description}</p>
              </div>
            )}
          </div>
        )}

        {/* ---- Step 4: Abilities ---- */}
        {step === 4 && (
          <div className="space-y-5" data-testid="step-abilities">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Tap <span className="font-medium text-foreground">Roll Stats</span> for{" "}
                <span className="font-mono">4d6</span> (drop lowest) ×6, then tap a score and tap an ability slot to assign it.
              </p>
              {classInfo && (
                <p className="text-xs text-muted-foreground/90">
                  Higher numbers make d20 rolls more likely to succeed.{" "}
                  <span className="text-foreground font-medium">{classInfo.name}s</span> usually want high{" "}
                  <span className="text-primary font-semibold">
                    {ABILITY_FULL[(RECOMMENDED_ABILITY_ORDER[resolvedClass] ?? DEFAULT_ABILITY_ORDER)[0]]}
                  </span>.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleRoll} variant={form.hasRolled ? "outline" : "default"} size="sm" data-testid="button-roll-stats">
                <Dices className="h-4 w-4 mr-1.5" />
                {form.hasRolled ? "Reroll all" : "Roll Stats"}
              </Button>
              {form.scoreMode === "rolled" && form.hasRolled && unassignedChips.length > 0 && unassignedChips.length < 6 && (
                <Button onClick={handleRerollUnassigned} variant="outline" size="sm" data-testid="button-reroll-unassigned">
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  Reroll unassigned ({unassignedChips.length})
                </Button>
              )}
              <Button onClick={handleStandardArray} variant="outline" size="sm" data-testid="button-standard-array">
                Use standard array
              </Button>
              {form.hasRolled && form.scorePool.length === 6 && (
                <Button onClick={handleAutoAssign} variant="outline" size="sm" data-testid="button-auto-assign">
                  <Wand2 className="h-4 w-4 mr-1.5" />
                  Auto-assign{resolvedClass ? ` for ${resolvedClass}` : ""}
                </Button>
              )}
              {form.hasRolled && Object.values(form.abilityAssignments).some((v) => v !== null) && (
                <Button onClick={handleClearAssignments} variant="ghost" size="sm" data-testid="button-clear-assignments">
                  Clear
                </Button>
              )}
            </div>

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
                      const showNudge = !hasTappedChip && !hasAssignedOnce && i === 0 && selectedChipId === null;
                      return (
                        <motion.button
                          key={chip.id}
                          layout
                          type="button"
                          onClick={() => handleChipClick(chip.id)}
                          drag
                          dragSnapToOrigin
                          dragMomentum={false}
                          whileDrag={{ scale: 1.1, zIndex: 50 }}
                          onDragStart={() => {
                            setHasTappedChip(true);
                            setSelectedChipId(chip.id);
                          }}
                          onDragEnd={(_, info) => {
                            const els = document.elementsFromPoint(info.point.x, info.point.y);
                            const slot = els.find((el) => (el as HTMLElement).dataset?.abilitySlot) as HTMLElement | undefined;
                            const ability = slot?.dataset.abilitySlot as AbilityName | undefined;
                            if (ability && !form.abilityAssignments[ability]) {
                              setForm((prev) => ({
                                ...prev,
                                abilityAssignments: { ...prev.abilityAssignments, [ability]: chip.id },
                              }));
                              setSelectedChipId(null);
                              setHasAssignedOnce(true);
                            }
                          }}
                          initial={{ opacity: 0, scale: 0.5, y: -10 }}
                          animate={
                            isSelected
                              ? { opacity: 1, scale: 1.08, y: 0 }
                              : showNudge
                                ? { opacity: 1, scale: [1, 1.08, 1], y: [0, -2, 0] }
                                : { opacity: 1, scale: 1, y: 0 }
                          }
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={
                            showNudge
                              ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                              : { type: "spring", stiffness: 320, damping: 22, delay: i * 0.06 }
                          }
                          className={`group relative flex flex-col items-center justify-center rounded-lg border-2 px-3 py-2 min-w-[64px] transition-colors cursor-grab active:cursor-grabbing touch-none ${
                            isSelected
                              ? "border-primary bg-primary/20 ring-4 ring-primary/40 shadow-lg shadow-primary/20"
                              : showNudge
                                ? "border-primary/70 bg-primary/5 ring-2 ring-primary/30"
                                : "border-border/60 bg-card hover:border-primary/60 hover:bg-primary/5"
                          }`}
                          data-testid={`chip-score-${chip.total}-${i}`}
                        >
                          {showNudge && (
                            <span
                              className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-md"
                              data-testid="chip-nudge"
                            >
                              Tap me first
                            </span>
                          )}
                          <span className="font-mono text-2xl font-bold text-foreground tabular-nums">{chip.total}</span>
                          {chip.roll && (
                            <span className="text-[10px] text-muted-foreground/80 font-mono mt-0.5 leading-none">
                              {chip.roll.dice.map((d, idx) => (
                                <span
                                  key={idx}
                                  className={idx === chip.roll!.droppedIndex ? "line-through opacity-50" : ""}
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

            <AnimatePresence>
              {form.hasRolled && !hasAssignedOnce && (
                <motion.div
                  key="two-step-hint"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground"
                  data-testid="two-step-hint"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 font-mono text-[10px] font-bold text-primary">1</span>
                    Tap a rolled score
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 font-mono text-[10px] font-bold text-primary">2</span>
                    Tap an ability slot
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ABILITY_NAMES.map((stat) => {
                const finalScore = abilityScores[stat];
                const bonus = form.racialBonuses[stat] ?? 0;
                const chipId = form.abilityAssignments[stat];
                const baseChip = chipId ? form.scorePool.find((c) => c.id === chipId) : null;
                const baseTotal = baseChip ? baseChip.total : null;
                const mod = finalScore !== null ? modifierFor(finalScore) : null;
                const isAssigned = finalScore !== null;
                const canDrop = !isAssigned && selectedChipId !== null;
                return (
                  <button
                    key={stat}
                    type="button"
                    onClick={() => handleSlotClick(stat)}
                    disabled={!form.hasRolled || (!isAssigned && !selectedChipId)}
                    className={`relative rounded-xl border-2 p-3 text-center space-y-1 transition-colors min-h-[88px] ${
                      isAssigned
                        ? "border-primary/60 bg-primary/10 hover:bg-primary/15 hover:border-primary cursor-pointer"
                        : canDrop
                          ? "border-primary/50 border-dashed bg-primary/5 hover:bg-primary/10 cursor-pointer animate-pulse"
                          : "border-border/30 bg-muted/10"
                    } ${!form.hasRolled ? "opacity-60" : ""}`}
                    data-testid={`slot-${stat}`}
                    data-ability-slot={stat}
                  >
                    {bonus > 0 && (
                      <span
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 shadow"
                        data-testid={`bonus-${stat}`}
                        title={`Racial bonus from ${resolvedRace}`}
                      >
                        +{bonus}
                      </span>
                    )}
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{ABILITY_LABELS[stat]}</p>
                    <p className="font-mono text-3xl font-bold text-foreground tabular-nums">{finalScore ?? "—"}</p>
                    <p className={`text-xs h-4 ${canDrop ? "text-primary font-medium" : "text-muted-foreground"}`}>
                      {mod !== null
                        ? bonus > 0 && baseTotal !== null
                          ? `${baseTotal}+${bonus} • mod ${mod >= 0 ? "+" : ""}${mod}`
                          : `Modifier: ${mod >= 0 ? "+" : ""}${mod}`
                        : isAssigned
                          ? ""
                          : canDrop
                            ? "tap to assign"
                            : form.hasRolled
                              ? "pick a score above"
                              : ""}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Auto-filled summary card */}
            {(classInfo || form.maxHp > 0) && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="auto-fill-summary">
                <p className="text-[11px] uppercase tracking-wider text-primary/90 font-semibold mb-2">
                  Auto-filled from your class
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Max HP</p>
                    <p className="font-mono text-xl font-bold text-foreground tabular-nums">{form.maxHp}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">AC</p>
                    <p className="font-mono text-xl font-bold text-foreground tabular-nums">{form.armorClass}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Speed</p>
                    <p className="font-mono text-xl font-bold text-foreground tabular-nums">{form.speed}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Prof. Bonus</p>
                    <p className="font-mono text-xl font-bold text-foreground tabular-nums">+{form.proficiencyBonus}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Customize disclosure (combat numerics + saves + skills + equipment + traits + optional) */}
            <div className="rounded-lg border border-border/50">
              <button
                type="button"
                onClick={() => setCustomizeOpen((v) => !v)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
                data-testid="button-toggle-customize"
              >
                <span className="text-sm font-medium text-foreground">Customize details (HP / AC / saves / skills / gear)</span>
                {customizeOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {customizeOpen && (
                <div className="p-3 pt-0 space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <NumberField
                      id="max-hp" label="Max HP" value={form.maxHp} min={1} fallback={10}
                      onChange={(v) => setForm((prev) => ({
                        ...prev, maxHp: v, maxHpAuto: false,
                        currentHp: Math.min(prev.currentHp, v),
                      }))}
                      testId="input-max-hp"
                    />
                    <NumberField
                      id="current-hp" label="Current HP" value={form.currentHp} min={0}
                      max={form.maxHp} fallback={form.maxHp}
                      onChange={(v) => update("currentHp", v)}
                      testId="input-current-hp"
                    />
                    <NumberField
                      id="armor-class" label="Armor Class" value={form.armorClass} min={0} fallback={10}
                      onChange={(v) => update("armorClass", v)}
                      testId="input-armor-class"
                    />
                    <NumberField
                      id="speed" label="Speed (ft)" value={form.speed} min={0} step={5} fallback={30}
                      onChange={(v) => update("speed", v)}
                      testId="input-speed"
                    />
                  </div>
                  <NumberField
                    id="prof-bonus" label="Proficiency Bonus" value={form.proficiencyBonus} min={1} max={6} fallback={2}
                    onChange={(v) => update("proficiencyBonus", v)}
                    testId="input-proficiency-bonus" className="max-w-[200px]"
                  />

                  {/* Saving throws */}
                  <div className="space-y-3">
                    <Label>Saving Throw Proficiencies</Label>
                    {classInfo && (
                      <p className="text-xs text-muted-foreground">
                        <Lock className="inline h-3 w-3 mr-1 -mt-0.5" />
                        {classInfo.name}s are always proficient in{" "}
                        {classInfo.savingThrows.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" & ")} saves.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {SAVING_THROW_OPTIONS.map((st) => {
                        const ability = ABILITY_LABEL_TO_NAME[st];
                        const isLocked = !!classInfo && classInfo.savingThrows.includes(ability);
                        const isChecked = form.savingThrows.includes(st);
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => { if (!isLocked) toggleSavingThrow(st); }}
                            disabled={isLocked}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                              isChecked
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/50 text-muted-foreground hover:bg-muted"
                            } ${isLocked ? "opacity-90 cursor-not-allowed ring-1 ring-primary/40" : ""}`}
                            data-testid={`toggle-save-${st.toLowerCase()}`}
                          >
                            {isLocked && <Lock className="h-3 w-3" />}
                            {st}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Skill picker (class) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Class Skill Proficiencies</Label>
                      {classInfo && (
                        <span className="text-xs text-muted-foreground" data-testid="text-skill-counter">
                          Pick {classInfo.skillChoices.count} — {Math.max(0, classInfo.skillChoices.count - form.skills.length)} left
                        </span>
                      )}
                    </div>
                    {backgroundInfo && (
                      <p className="text-xs text-muted-foreground">
                        Your <span className="text-foreground">{backgroundInfo.name}</span> background already grants{" "}
                        {backgroundInfo.skillProficiencies.join(" & ")}.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {(classInfo ? classInfo.skillChoices.from : DND_SKILLS).map((skill) => {
                        const checked = form.skills.includes(skill);
                        const grantedByBg = backgroundInfo?.skillProficiencies.includes(skill) ?? false;
                        const atLimit =
                          classInfo !== null &&
                          !checked &&
                          form.skills.length >= classInfo.skillChoices.count;
                        return (
                          <button
                            key={skill}
                            type="button"
                            onClick={() => { if (!atLimit) toggleSkill(skill); }}
                            disabled={atLimit}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                              checked || grantedByBg
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/50 text-muted-foreground hover:bg-muted"
                            } ${atLimit ? "opacity-40 cursor-not-allowed" : ""}`}
                            data-testid={`toggle-skill-${skill.toLowerCase().replace(/ /g, "-")}`}
                            title={grantedByBg ? "Granted by your background" : undefined}
                          >
                            {skill}{grantedByBg ? " ✦" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Equipment picker */}
                  {classInfo && (() => {
                    const derivedEquipment = classInfo.startingEquipmentOptions.flatMap((slot) => {
                      const idx = form.equipmentChoices[slot.slot];
                      if (idx === undefined || idx === -1) return [];
                      return slot.choices[idx]?.items ?? [];
                    });
                    return (
                      <div className="space-y-3" data-testid="equipment-picker">
                        <Label>Starting Equipment</Label>
                        <div className="space-y-3">
                          {classInfo.startingEquipmentOptions.map((slot) => {
                            const selected = form.equipmentChoices[slot.slot] as number | undefined;
                            return (
                              <div key={slot.slot} className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-2">
                                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{slot.slot}</p>
                                <div className="flex flex-wrap gap-2">
                                  {slot.choices.map((choice, idx) => {
                                    const isOn = selected === idx;
                                    return (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() =>
                                          setForm((prev) => ({
                                            ...prev,
                                            equipmentChoices: { ...prev.equipmentChoices, [slot.slot]: idx },
                                          }))
                                        }
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                          isOn
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted/40 text-foreground hover:bg-muted/70"
                                        }`}
                                        data-testid={`equipment-${slot.slot.toLowerCase().replace(/ /g, "-")}-${idx}`}
                                      >
                                        {choice.label}
                                      </button>
                                    );
                                  })}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setForm((prev) => ({
                                        ...prev,
                                        equipmentChoices: { ...prev.equipmentChoices, [slot.slot]: -1 },
                                      }))
                                    }
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                      selected === -1
                                        ? "bg-muted text-muted-foreground ring-1 ring-border"
                                        : "bg-transparent text-muted-foreground hover:bg-muted/30"
                                    }`}
                                    data-testid={`equipment-${slot.slot.toLowerCase().replace(/ /g, "-")}-skip`}
                                  >
                                    Skip
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {derivedEquipment.length > 0 && (
                          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1" data-testid="equipment-preview">
                            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                              Items added from your picks
                            </p>
                            <ul className="text-xs text-foreground list-disc pl-5 space-y-0.5">
                              {derivedEquipment.map((item, i) => (
                                <li key={`${item}-${i}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Optional details */}
                  <div className="rounded-lg border border-border/50">
                    <button
                      type="button"
                      onClick={() => setOptionalOpen((v) => !v)}
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
                      data-testid="button-toggle-optional"
                    >
                      <span className="text-sm font-medium text-foreground">Extra inventory & backstory</span>
                      {optionalOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {optionalOpen && (
                      <div className="p-3 pt-0 space-y-4">
                        <div className="space-y-2">
                          <Label>Extra inventory items</Label>
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
                          <Label htmlFor="char-notes">Backstory & notes</Label>
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

                  {/* Race traits + class L1 features */}
                  {(raceInfo || classInfo) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {raceInfo && (
                        <div className="rounded-lg border border-border/50 bg-card/60 p-3 space-y-2" data-testid="card-racial-traits">
                          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{raceInfo.name} Traits</p>
                          <ul className="space-y-1.5 text-xs">
                            {raceInfo.traits.map((t) => (
                              <li key={t.name}>
                                <span className="font-medium text-foreground">{t.name}.</span>{" "}
                                <span className="text-muted-foreground">{t.summary}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {classInfo && (
                        <div className="rounded-lg border border-border/50 bg-card/60 p-3 space-y-2" data-testid="card-class-features">
                          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                            {classInfo.name} — Level 1 Features
                          </p>
                          <ul className="space-y-1.5 text-xs">
                            {classInfo.level1Features.map((f) => (
                              <li key={f.name}>
                                <span className="font-medium text-foreground">{f.name}.</span>{" "}
                                <span className="text-muted-foreground">{f.summary}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- Step 5: Review (hero card) ---- */}
        {step === 5 && (
          <div className="space-y-5" data-testid="step-review">
            <div className="rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5 sm:p-6 space-y-5 shadow-[0_0_40px_-12px_hsl(270_100%_60%/0.5)]" data-testid="hero-card">
              <div className="flex items-start gap-4">
                <div className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-3xl bg-primary/15 ring-2 ring-primary/40 text-6xl flex-shrink-0">
                  {RACE_EMOJI[form.race] ?? "✨"}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-3xl sm:text-5xl font-bold text-foreground tracking-tight leading-tight" data-testid="review-name">
                    {form.name || "Unnamed"}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1">
                      Lv. {form.level} {resolvedClass || "—"}
                    </span>
                    <span className="rounded-full bg-muted/40 text-foreground text-xs font-medium px-2.5 py-1">
                      {resolvedRace || "—"}
                    </span>
                    {resolvedBackground && (
                      <span className="rounded-full bg-muted/40 text-foreground text-xs font-medium px-2.5 py-1" data-testid="review-background">
                        {resolvedBackground}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 4-up combat strip */}
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {[
                  { label: "AC", value: form.armorClass, icon: Shield },
                  { label: "Init", value: (() => {
                      const dex = abilityScores.dexterity;
                      const m = dex !== null ? modifierFor(dex) : 0;
                      return `${m >= 0 ? "+" : ""}${m}`;
                    })(), icon: Zap },
                  { label: "Max HP", value: form.maxHp, icon: Heart },
                  { label: "Prof.", value: `+${form.proficiencyBonus}`, icon: Award },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-xl bg-card/60 p-2 sm:p-3 text-center">
                    <Icon className="h-4 w-4 mx-auto text-primary mb-1" />
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="font-mono text-lg sm:text-xl font-bold text-foreground tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              {/* Ability scores */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {ABILITY_NAMES.map((stat) => {
                  const v = abilityScores[stat] ?? 10;
                  const m = modifierFor(v);
                  return (
                    <div key={stat} className="rounded-xl bg-card/60 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{ABILITY_LABELS[stat]}</p>
                      <p className="font-mono text-xl font-bold text-foreground tabular-nums">{v}</p>
                      <p className="text-[10px] text-muted-foreground font-mono tabular-nums">
                        {m >= 0 ? "+" : ""}{m}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Skill chips */}
              {mergedSkills.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Skill Proficiencies</p>
                  <div className="flex flex-wrap gap-1.5">
                    {mergedSkills.map((s) => (
                      <span
                        key={s}
                        className="rounded-full bg-primary/15 text-primary text-[11px] font-medium px-2 py-0.5 ring-1 ring-primary/30"
                        data-testid={`review-skill-${s.toLowerCase().replace(/ /g, "-")}`}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Your Legend */}
              <p className="text-sm text-muted-foreground italic leading-relaxed border-l-2 border-primary/40 pl-3" data-testid="review-legend">
                A {resolvedRace || "wandering"} {resolvedClass || "adventurer"} known as{" "}
                <span className="text-foreground font-medium not-italic">{form.name || "the nameless one"}</span>.
                {resolvedBackground ? ` Once a ${resolvedBackground.toLowerCase()},` : ""} they now stand on the
                threshold of their first adventure — Level {form.level}, with{" "}
                <span className="text-foreground not-italic">{form.maxHp} HP</span> and AC{" "}
                <span className="text-foreground not-italic">{form.armorClass}</span>. The story begins now.
              </p>
            </div>

            {failingStepLabel && (
              <p className="text-xs text-primary/90" data-testid="text-incomplete-hint">
                {failingStepLabel} step is incomplete — go back and finish it before forging.
              </p>
            )}
          </div>
        )}
      </WizardShell>
    </div>
  );
}
