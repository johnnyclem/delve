import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles, Plus, X } from "lucide-react";
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
import { useCreateCharacter, getListCharactersQueryKey, useGetCampaign } from "@workspace/api-client-react";
import type { CreateCharacterBody, CharacterSheet } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { DND_RACES, DND_CLASSES, CUSTOM_OPTION_VALUE, proficiencyBonusForLevel } from "@/lib/dnd-options";

const DND_SKILLS = [
  "Acrobatics", "Animal Handling", "Arcana", "Athletics",
  "Deception", "History", "Insight", "Intimidation",
  "Investigation", "Medicine", "Nature", "Perception",
  "Performance", "Persuasion", "Religion", "Sleight of Hand",
  "Stealth", "Survival",
];

const ABILITY_NAMES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
const ABILITY_LABELS: Record<string, string> = {
  strength: "STR", dexterity: "DEX", constitution: "CON",
  intelligence: "INT", wisdom: "WIS", charisma: "CHA",
};

const SAVING_THROW_OPTIONS = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

const STEP_TITLES = ["Basics", "Ability Scores", "Combat", "Details"];

interface FormState {
  name: string;
  race: string;
  customRace: string;
  charClass: string;
  customClass: string;
  level: number;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  maxHp: number;
  currentHp: number;
  armorClass: number;
  speed: number;
  proficiencyBonus: number;
  savingThrows: string[];
  skills: string[];
  inventory: string[];
  newInventoryItem: string;
  notes: string;
}

const defaultForm: FormState = {
  name: "",
  race: "",
  customRace: "",
  charClass: "",
  customClass: "",
  level: 1,
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
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

export default function CharacterCreateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(defaultForm);
  const createMutation = useCreateCharacter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: campaign } = useGetCampaign();
  const homebrewRules = campaign?.homebrewRules ?? null;

  // When the campaign rules first load (or change), seed the form's
  // proficiency bonus to match the campaign's rule for the current level.
  // We only do this while the user hasn't manually adjusted the bonus —
  // i.e. it still equals what the rule would produce for the level. This
  // keeps the create wizard consistent with campaigns that override the
  // standard 5e level-1 bonus, without clobbering an intentional change.
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
    // Only react to campaign rule changes; intentionally not depending on
    // form state here to avoid fighting user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, JSON.stringify(homebrewRules)]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resolvedRace = form.race === CUSTOM_OPTION_VALUE ? form.customRace : form.race;
  const resolvedClass = form.charClass === CUSTOM_OPTION_VALUE ? form.customClass : form.charClass;

  const canProceedStep0 = form.name.trim() !== "" && resolvedRace.trim() !== "" && resolvedClass.trim() !== "";

  const handleSubmit = () => {
    const sheet: CharacterSheet = {
      strength: form.strength,
      dexterity: form.dexterity,
      constitution: form.constitution,
      intelligence: form.intelligence,
      wisdom: form.wisdom,
      charisma: form.charisma,
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
        onError: () => {
          toast({ title: "Failed to create character", variant: "destructive" });
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

            <div className="space-y-2 max-w-[200px]">
              <Label htmlFor="char-level">Level</Label>
              <Input
                id="char-level"
                type="number"
                min={1}
                max={20}
                value={form.level}
                onChange={(e) => {
                  const lvl = Math.max(1, Math.min(20, parseInt(e.target.value) || 1));
                  setForm((prev) => {
                    const auto = proficiencyBonusForLevel(lvl, homebrewRules);
                    return {
                      ...prev,
                      level: lvl,
                      proficiencyBonus: auto ?? prev.proficiencyBonus,
                    };
                  });
                }}
                data-testid="input-level"
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5" data-testid="step-abilities">
            <p className="text-sm text-muted-foreground">
              Set your character's six ability scores. The standard array is 15, 14, 13, 12, 10, 8.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {ABILITY_NAMES.map((stat) => {
                const val = form[stat];
                const mod = Math.floor((val - 10) / 2);
                return (
                  <div key={stat} className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center space-y-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      {ABILITY_LABELS[stat]}
                    </p>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={val}
                      onChange={(e) => update(stat, Math.max(1, Math.min(30, parseInt(e.target.value) || 10)))}
                      className="w-20 mx-auto text-center font-mono text-lg"
                      data-testid={`input-${stat}`}
                    />
                    <p className="text-xs text-muted-foreground">
                      Modifier: {mod >= 0 ? `+${mod}` : mod}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5" data-testid="step-combat">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max-hp">Max HP</Label>
                <Input
                  id="max-hp"
                  type="number"
                  min={1}
                  value={form.maxHp}
                  onChange={(e) => {
                    const v = Math.max(1, parseInt(e.target.value) || 1);
                    setForm((prev) => ({ ...prev, maxHp: v, currentHp: Math.min(prev.currentHp, v) }));
                  }}
                  data-testid="input-max-hp"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="current-hp">Current HP</Label>
                <Input
                  id="current-hp"
                  type="number"
                  min={0}
                  max={form.maxHp}
                  value={form.currentHp}
                  onChange={(e) => update("currentHp", Math.max(0, Math.min(form.maxHp, parseInt(e.target.value) || 0)))}
                  data-testid="input-current-hp"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="armor-class">Armor Class</Label>
                <Input
                  id="armor-class"
                  type="number"
                  min={0}
                  value={form.armorClass}
                  onChange={(e) => update("armorClass", Math.max(0, parseInt(e.target.value) || 10))}
                  data-testid="input-armor-class"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="speed">Speed (ft)</Label>
                <Input
                  id="speed"
                  type="number"
                  min={0}
                  step={5}
                  value={form.speed}
                  onChange={(e) => update("speed", Math.max(0, parseInt(e.target.value) || 30))}
                  data-testid="input-speed"
                />
              </div>
            </div>

            <div className="max-w-[200px] space-y-2">
              <Label htmlFor="prof-bonus">Proficiency Bonus</Label>
              <Input
                id="prof-bonus"
                type="number"
                min={1}
                max={6}
                value={form.proficiencyBonus}
                onChange={(e) => update("proficiencyBonus", Math.max(1, Math.min(6, parseInt(e.target.value) || 2)))}
                data-testid="input-proficiency-bonus"
              />
            </div>

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
            disabled={step === 0 && !canProceedStep0}
            data-testid="button-next-step"
          >
            Next
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !canProceedStep0}
            data-testid="button-create-character"
          >
            {createMutation.isPending ? "Creating..." : "Create Character"}
          </Button>
        )}
      </div>
    </div>
  );
}
