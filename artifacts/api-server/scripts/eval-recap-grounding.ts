/**
 * Recap grounding evaluation harness.
 *
 * Runs a handful of canned DM-note fixtures (sparse, medium, dense) through the
 * real `generate-recap` system prompt and checks that named entities in the
 * generated recap appear in the source notes. Helps catch model drift or prompt
 * regressions that let the AI fabricate NPCs, places, dialogue, etc.
 *
 * Usage (from repo root):
 *   pnpm --filter @workspace/api-server run eval:recap
 *
 * Requires AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL
 * to be set in the environment.
 */

import {
  RECAP_MODEL,
  RECAP_TEMPERATURE,
  RECAP_MAX_TOKENS,
  RECAP_SYSTEM_PROMPT,
  buildRecapUserPrompt,
} from "../src/lib/recap-prompt.ts";

type Fixture = {
  name: string;
  density: "sparse" | "medium" | "dense";
  sessionNumber: number;
  title: string;
  rawNotesMd: string;
  /** Short note explaining the kind of fabrication this fixture is designed
   *  to catch, so a future maintainer knows why the case exists. */
  targets: string;
  /** Allowlisted proper nouns the model is welcome to use (player handles,
   *  party name, etc.) even though they don't literally appear in the notes. */
  allowedExtraEntities?: string[];
};

const FIXTURES: Fixture[] = [
  {
    name: "sparse-fragment",
    density: "sparse",
    sessionNumber: 1,
    title: "Tavern brawl",
    rawNotesMd: "Party met at the Crooked Crow tavern. Brawl with two thugs. Got a map.",
    targets: "Sparse notes invite the model to invent NPC names, tavern patrons, or details about the map.",
  },
  {
    name: "medium-cave",
    density: "medium",
    sessionNumber: 4,
    title: "Into the cave",
    rawNotesMd: `Party traveled north from Bramblefield to the Hollow Cliffs.
Encountered a goblin scout named Skritch who fled after taking 6 damage.
Inside the cave they found a shrine to Vohra and a locked iron chest.
Mira picked the lock; chest contained 40gp and a silver pendant.
Session ended as they heard drums deeper in the cave.`,
    targets: "Mid-density notes can drift into invented NPC details (Skritch's tribe, the chest's previous owner) or fabricated god lore around Vohra.",
  },
  {
    name: "dense-court",
    density: "dense",
    sessionNumber: 9,
    title: "Audience with the Duke",
    rawNotesMd: `The party arrived in Sallowmere at dusk and were escorted to Duke Aldwin's keep by Captain Renna of the city watch.
Duke Aldwin asked them to investigate the disappearance of his envoy, Lord Pell, last seen heading toward the Verdant March.
Tavi argued the price up to 800gp plus writs of safe passage. The Duke agreed.
The party met Sister Imeth of the Temple of Vohra, who shared rumors of cultists operating out of an abandoned mill called Old Stagg's.
They visited the mill that night. Found bloodstains and a torn banner bearing a black sun sigil.
Combat: 3 cultists ambushed them. Tavi dropped to 4 HP before Mira healed her. All cultists killed; one captured alive.
The captive refused to speak but had a tattoo matching the banner.
Session ended back at the keep, planning to question the prisoner at dawn.`,
    targets: "Dense political notes encourage invented courtiers, fake guard names, or extra cultist faction lore beyond what the notes establish.",
    allowedExtraEntities: ["DM"],
  },
  {
    name: "numeric-combat",
    density: "dense",
    sessionNumber: 12,
    title: "Bridge ambush",
    rawNotesMd: `Ambush on the Greystone Bridge at dusk. Initiative: Tavi 18, Mira 15, Borin 11, ogre 9, 2 bandits 6.
Round 1: Tavi crit for 22 slashing on the ogre (down to 38/60 HP). Mira cast Bless. Borin hit bandit A for 9 (dead).
Round 2: Ogre hit Borin for 17 (Borin at 14/31). Bandit B threw a dagger at Mira, missed. Tavi rapier 11 dmg on ogre (27/60).
Round 3: Mira healing word on Borin (+8, now 22/31). Ogre missed Tavi (AC 17). Borin axe crit on bandit B for 19 (dead).
Round 4: Tavi sneak attack 16 on ogre (11/60). Ogre swung at Mira, hit for 13 (Mira at 9/24). Borin axe 8 (3/60).
Round 5: Mira cantrip 5 dmg killed the ogre.
Loot: 73gp, a +1 handaxe, and a sealed letter addressed to "M.V." in Stagholm.
Party rested 1 hour, used 2 hit dice each, then pushed on toward Stagholm.`,
    targets: "Numeric-heavy notes (HP, AC, damage, gp) tempt the model to invent additional combat beats, round counts, or loot quantities that drift from the recorded numbers.",
  },
  {
    name: "partial-name-intro",
    density: "medium",
    sessionNumber: 6,
    title: "The merchant's offer",
    rawNotesMd: `Party returned to Pinehollow. Met a new merchant — only introduced herself as "Yssa" (no surname given).
Yssa offered 200gp for safe escort to the next town. Tavi haggled to 275gp.
Yssa mentioned she had a brother who "went missing on the eastern road last spring" — did not give his name.
Party agreed. Departing in the morning.`,
    targets: "Partial-name introductions often get auto-completed by the model — e.g. inventing a surname for Yssa or a name for her missing brother.",
  },
  {
    name: "shorthand-abbrev",
    density: "medium",
    sessionNumber: 14,
    title: "Crypt run",
    rawNotesMd: `Sess started @ crypt entr. T + M + B in. 2 skeles down quick (T crit, B cleave).
Hall trap: pit, B failed dex (took 8 fall). M help up. Found sarc w/ inscription — couldn't read, took rubbing.
2nd cham: ghoul + 3 skeles. Long fight. M down to 4hp, T used potion on her. Ghoul killed by B.
Loot: ring (unid), 120gp, holy symbol (sun?). End sess @ stairs going down.`,
    targets: "Shorthand and abbreviations leave gaps the model loves to fill with invented spell names, expanded NPC names, or specific deities for the holy symbol.",
  },
  {
    name: "ambiguous-pronouns",
    density: "medium",
    sessionNumber: 8,
    title: "The two strangers",
    rawNotesMd: `Two travelers approached the camp. One wore a green cloak, the other carried a longbow.
The one with the bow asked about the road north. She warned them about wolves.
He offered to trade rations for arrows. The party agreed.
Later, she slipped away during the second watch. He stayed until morning, then left without a word.
The party never learned either of their names.`,
    targets: "Ambiguous pronouns with no proper names tempt the model to assign names, backstories, or factions to 'the two strangers' that the notes deliberately withhold.",
  },
  {
    name: "rumor-mill",
    density: "medium",
    sessionNumber: 11,
    title: "Tavern rumors",
    rawNotesMd: `Downtime in town. Party split up to gather rumors at three taverns.
Tavi heard: a noble's daughter eloped, and the city watch is being doubled next week.
Mira heard: prices on grain are up, and someone saw "lights in the old tower" three nights running.
Borin heard: a caravan from the south is overdue by a week.
No names attached to any of the rumors. Party reconvened at the inn to compare notes.`,
    targets: "Rumor-only sessions with deliberately nameless gossip invite the model to invent the noble's name, the daughter's suitor, the caravan master, or the tower's owner.",
  },
];

const STOPWORDS = new Set([
  "The","A","An","And","Or","But","If","Then","So","As","At","By","For","From","In","Into","Of","On","Onto","Out","Over","To","Up","With","Without","Within","After","Before","During","While",
  "Narrative","Notes","Summary","Key","Events","Session","Recap",
  "I","You","He","She","It","We","They","Their","Her","His","Its","My","Your","Our",
  "This","That","These","Those","There","Here",
  "Mr","Mrs","Ms","Sir","Lord","Lady","Captain","Sister","Brother","Duke","Duchess",
  "DM","HP","GP","XP","AC",
  "Day","Night","Morning","Evening","Dawn","Dusk","Today","Tomorrow","Yesterday",
  "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
  "January","February","March","April","May","June","July","August","September","October","November","December",
]);

/** Extract candidate proper nouns from markdown: capitalized tokens
 *  (and short capitalized phrases) that are not at the start of a sentence
 *  alone. Best-effort; the goal is recall over precision since we then check
 *  whether each candidate appears in the source notes. */
function extractNamedEntities(md: string): string[] {
  // Strip code fences and headings markers to reduce noise.
  const cleaned = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_>`#-]+/g, " ");

  const sentences = cleaned.split(/(?<=[.!?])\s+|\n+/);
  const entities = new Set<string>();
  const phraseRe = /\b([A-Z][a-z'’]+(?:\s+(?:of\s+)?[A-Z][a-z'’]+){0,3})\b/g;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    let match: RegExpExecArray | null;
    let isFirst = true;
    while ((match = phraseRe.exec(trimmed)) !== null) {
      const phrase = match[1];
      const startsSentence = isFirst && match.index === 0;
      isFirst = false;

      // Skip a single capitalized token that is the very first word of a
      // sentence — likely just sentence capitalization, not a proper noun.
      const tokens = phrase.split(/\s+/);
      if (startsSentence && tokens.length === 1) continue;

      // Filter: drop pure stopwords / titles when they appear alone.
      if (tokens.length === 1 && STOPWORDS.has(tokens[0])) continue;

      // Strip leading honorific titles ("Captain Renna" -> "Renna") so the
      // grounding check is more forgiving when the notes use the bare name.
      const stripped = tokens.filter((t, i) => !(i === 0 && STOPWORDS.has(t))).join(" ");
      const candidate = stripped || phrase;
      if (candidate.length < 2) continue;
      entities.add(candidate);
    }
    phraseRe.lastIndex = 0;
  }
  return [...entities];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/['’`]/g, "").replace(/\s+/g, " ").trim();
}

function isGrounded(entity: string, notes: string, allowed: string[]): boolean {
  const n = normalize(notes);
  const e = normalize(entity);
  if (n.includes(e)) return true;
  for (const a of allowed) if (normalize(a) === e) return true;
  // Allow per-token match for multi-word entities (e.g. "Crooked Crow" matches
  // "Crow" in the notes if Crow alone is mentioned).
  const tokens = e.split(" ").filter(t => t.length > 2);
  if (tokens.length > 1 && tokens.every(t => n.includes(t))) return true;
  return false;
}

type FixtureResult = {
  fixture: Fixture;
  recap: string;
  entities: string[];
  ungrounded: string[];
  passed: boolean;
  error?: string;
};

async function runFixture(fixture: Fixture): Promise<FixtureResult> {
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  try {
    const completion = await openai.chat.completions.create({
      model: RECAP_MODEL,
      max_completion_tokens: RECAP_MAX_TOKENS,
      temperature: RECAP_TEMPERATURE,
      messages: [
        { role: "system", content: RECAP_SYSTEM_PROMPT },
        { role: "user", content: buildRecapUserPrompt(fixture.sessionNumber, fixture.title, fixture.rawNotesMd) },
      ],
    });
    const recap = completion.choices[0]?.message?.content ?? "";
    const entities = extractNamedEntities(recap);
    const allowed = [
      ...(fixture.allowedExtraEntities ?? []),
      // Title and session number tokens are fair game.
      ...fixture.title.split(/\s+/),
    ];
    const ungrounded = entities.filter(e => !isGrounded(e, fixture.rawNotesMd, allowed));
    return { fixture, recap, entities, ungrounded, passed: ungrounded.length === 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { fixture, recap: "", entities: [], ungrounded: [], passed: false, error: message };
  }
}

function printReport(results: FixtureResult[]): void {
  const reset = "\x1b[0m";
  const green = "\x1b[32m";
  const red = "\x1b[31m";
  const dim = "\x1b[2m";
  const bold = "\x1b[1m";

  console.log(`\n${bold}Recap grounding evaluation${reset}`);
  console.log(`${dim}Model: ${RECAP_MODEL}  Temp: ${RECAP_TEMPERATURE}  Fixtures: ${results.length}${reset}\n`);

  for (const r of results) {
    const tag = r.passed ? `${green}PASS${reset}` : `${red}FAIL${reset}`;
    console.log(`${tag}  [${r.fixture.density}] ${r.fixture.name}`);
    if (r.error) {
      console.log(`      ${red}error:${reset} ${r.error}`);
      continue;
    }
    console.log(`      entities checked: ${r.entities.length}`);
    if (!r.passed) {
      console.log(`${dim}      targets: ${r.fixture.targets}${reset}`);
      console.log(`      ${red}ungrounded:${reset} ${r.ungrounded.join(", ")}`);
      console.log(`${dim}      ---- recap ----${reset}`);
      for (const line of r.recap.split("\n")) console.log(`${dim}      ${line}${reset}`);
      console.log(`${dim}      ---------------${reset}`);
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log(`\n${bold}Summary:${reset} ${green}${passed} passed${reset}, ${failed > 0 ? red : dim}${failed} failed${reset}\n`);
}

async function main(): Promise<void> {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    console.error("Missing AI_INTEGRATIONS_OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_BASE_URL.");
    console.error("Provision the OpenAI AI integration and re-run.");
    process.exit(2);
  }

  const results: FixtureResult[] = [];
  for (const fixture of FIXTURES) {
    process.stdout.write(`Running ${fixture.name}...\n`);
    results.push(await runFixture(fixture));
  }

  printReport(results);
  const anyFailed = results.some(r => !r.passed);
  process.exit(anyFailed ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
