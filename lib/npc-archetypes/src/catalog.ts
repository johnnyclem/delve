import type { Archetype } from "./types";

// Curated catalog. Order within a category is the order shown in the
// FE picker dropdown. Keep each archetype self-contained so authors
// can edit one without scanning the whole file.
//
// Conventions:
// - `key` is a stable kebab-case identifier and must never change
//   (it's persisted as `npcs.archetype_key`).
// - Name tables aim for ~14 first names and ~10-14 last names so
//   re-rolls produce variety without repeats.
// - Dialogue lines end with no trailing whitespace and avoid quoting
//   marks (the FE renders them inside its own quote styling).
// - Portrait prompt fragments stay short (1-2 sentences) — the shared
//   pixel-art style header is added by the server.

// ─────────────────────────────────────────────────────────────────
// TOWN
// ─────────────────────────────────────────────────────────────────

const innkeeper: Archetype = {
  key: "innkeeper",
  displayName: "Innkeeper",
  category: "Town",
  occupation: "Innkeeper",
  suggestedClass: "Commoner (Expert, hospitality)",
  portraitPromptFragment:
    "middle-aged human innkeeper in a stained apron, holding a ceramic tankard, warm tavern lighting behind",
  nameTable: {
    firstNames: [
      "Bram", "Hilda", "Otho", "Marda", "Gendry", "Ysolde", "Kellam",
      "Rowena", "Davin", "Maeve", "Jorin", "Petra", "Aldric", "Senna",
    ],
    lastNames: [
      "Greenleaf", "Tankard", "Cobblestone", "Brewer", "Hearthwood",
      "Oakhand", "Mallory", "Warrens", "Coldspring", "Fairweather", "Hollow",
    ],
  },
  backstoryTemplates: [
    "{name} inherited the inn from a parent who drank away most of its profits. They run a tighter ship now, but every regular has stories of the old days they like to tell when the ale flows.",
    "Once a caravan cook on the long roads east, {name} settled here after a knee injury made the road impossible. The inn was bought with a small fortune in road silver and a handful of favors owed.",
    "{name} bought the inn for a song after the previous owner vanished one snowy winter. The price was suspiciously low and locals still won't sleep in the back room.",
  ],
  publicMotiveTemplates: [
    "Keep the inn full, the kitchen warm, and the regulars happy.",
    "Save up enough to expand into the empty lot next door before the chandler does.",
    "Find a reliable cook so they can finally take a day off.",
  ],
  secretMotiveTemplates: [
    "Skim a few coppers from every traveling merchant's tab — the road folk never check.",
    "Listen for any mention of their estranged sibling, who they're quietly trying to find before a creditor does.",
    "Keep the back room reserved for a smuggler's monthly drop in exchange for a cut.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Welcome, traveler. Mind the step — that floorboard's been loose since my mother's day.",
        "First time through? You'll want the brown ale, not the red. Trust me.",
        "Sit anywhere that's not got a coat on it. I'll be right with you.",
      ],
    },
    {
      topic: "Room rates",
      lines: [
        "Common room's two coppers a night, includes a bowl of whatever's in the pot.",
        "Private room is a silver, and that gets you a real lock and a chamber pot you don't have to share.",
        "If you're staying a tenday or more we can talk about a number that doesn't make either of us cry.",
      ],
    },
    {
      topic: "Local rumors",
      lines: [
        "The miller's daughter ran off again. Third time this year. I've stopped feeling sorry.",
        "Something's been killing sheep up by the old mill. Wolves, they say. I've seen wolves. Wasn't wolves.",
        "Caravan from the south is overdue by four days. Either the road's bad or the road's worse.",
      ],
    },
    {
      topic: "Closing time",
      lines: [
        "Last call was a song ago, friends. Drink up or take it with you.",
        "I love you all but I love sleep more. Out you go.",
        "Doors stay open another hour for paying guests. Everyone else, the night air will do you good.",
      ],
    },
    {
      topic: "DM secret hooks",
      dmOnly: true,
      lines: [
        "(In a low voice) The man in the corner's been here three nights and hasn't drunk a drop. Watches the door. I don't like it.",
        "(Quiet aside) If you're looking for the kind of work that doesn't get talked about, ask for Old Pell at the back gate after midnight.",
      ],
    },
  ],
};

const blacksmith: Archetype = {
  key: "blacksmith",
  displayName: "Blacksmith",
  category: "Town",
  occupation: "Blacksmith",
  suggestedClass: "Commoner (Expert, smith's tools)",
  portraitPromptFragment:
    "burly half-orc blacksmith in a sooty leather apron, hammer in one hand, glowing tongs in the other, forge fire reflected on their face",
  nameTable: {
    firstNames: [
      "Borin", "Thessa", "Magda", "Krell", "Gareth", "Ulra", "Donal",
      "Ivy", "Hammond", "Saera", "Brunn", "Ketta", "Old Tomas", "Vex",
    ],
    lastNames: [
      "Ironside", "Coalfist", "Hammerfall", "Forge", "Anvil", "Blackbar",
      "Steelhand", "Cinder", "Greavson", "Smelt", "Dross",
    ],
  },
  backstoryTemplates: [
    "{name} learned the trade from a master who beat the lessons in. The master is dead now, but the lessons stuck — every weld they make is good enough to have made the old man grunt.",
    "Once a soldier-smith for a marching army, {name} mustered out and bought this forge with their pension. The work is slower here, but the steel is honest.",
    "{name} took over the forge after the previous smith disappeared during a war that nobody won. The signs above the door still bear the old name.",
  ],
  publicMotiveTemplates: [
    "Keep the forge fire lit and the orders going out on time.",
    "Save up to buy the better grade of ore from the dwarven trade caravan.",
    "Take on an apprentice worth keeping, for once.",
  ],
  secretMotiveTemplates: [
    "Reforge a broken family heirloom they swore on a grave they'd restore.",
    "Quietly supply weapons to a faction the local lord doesn't approve of.",
    "Find a teacher who can show them the lost technique their master never finished teaching.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Mind the sparks. Talk while I work or come back at sundown.",
        "Steel or favor? Either way, what do you need?",
        "Hot work today. Speak your business, friend.",
      ],
    },
    {
      topic: "Buying a weapon",
      lines: [
        "Standard sword is fifteen gold. You want it weighted right for your arm, that's twenty.",
        "I don't carry magical steel. Anyone who says they do is a liar or a thief.",
        "I've a fine axe finished last week. Owner died before he could pick it up. Yours for ten if you'll have it.",
      ],
    },
    {
      topic: "Repair quote",
      lines: [
        "Let me see it. (Examines.) Two silvers and a day, if I can finish before the dwarves get here.",
        "This was made by a fool. I can mend the break but the balance will never be right.",
        "I've seen worse. Leave it. Pick it up tomorrow afternoon.",
      ],
    },
    {
      topic: "Haggling",
      lines: [
        "Price is the price. I've children to feed and ore that doesn't pay for itself.",
        "Tell you what — pay full for the blade and I'll throw in the scabbard.",
        "If you can't afford honest steel you can't afford to use it. Move along.",
      ],
    },
    {
      topic: "Refusal",
      lines: [
        "I don't make weapons for that crowd. Not for any price.",
        "Whatever you want done, I want no part of it. Walk on.",
        "My forge, my rules. The answer is no.",
      ],
    },
  ],
};

const townGuard: Archetype = {
  key: "town-guard",
  displayName: "Town Guard",
  category: "Town",
  occupation: "City Watch",
  suggestedClass: "Guard (CR 1/8)",
  portraitPromptFragment:
    "weary human town guard in patched chainmail and a tabard with a faded city sigil, leaning on a spear at a torchlit gate",
  nameTable: {
    firstNames: [
      "Tomas", "Lina", "Erran", "Saela", "Vorn", "Brann", "Mira",
      "Corvin", "Petra", "Joss", "Aldwin", "Risa", "Gareth", "Hildy",
    ],
    lastNames: [
      "Gateward", "Stoneside", "Marsh", "Thrune", "Coldwater", "Ash",
      "Fenwick", "Brightoak", "Drum", "Halberd",
    ],
  },
  backstoryTemplates: [
    "{name} took the watch job because it pays steady and nobody's killed a guard in this district in three years. Long may that record hold.",
    "Conscripted during the last border scuffle and never quite went home, {name} now patrols the same three streets every night and knows every cat by name.",
    "{name} joined the watch after their younger brother was killed in a tavern brawl no one was punished for. They take the law more seriously than most.",
  ],
  publicMotiveTemplates: [
    "Keep the peace, finish the shift, get home in one piece.",
    "Make sergeant before the new captain notices how many rounds are skipped.",
    "Catch the cutpurse working the market square — third week running and nothing to show for it.",
  ],
  secretMotiveTemplates: [
    "Take the regular bribe from a smuggler that pays half their wages.",
    "Look the other way when a particular fence works the docks at night, in exchange for past favors.",
    "Quietly hate the captain and would gladly tip the players off if it embarrassed him.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting / stop",
      lines: [
        "Hold there. State your business in the city.",
        "Evening, traveler. Anything to declare?",
        "Move along, no loitering at the gate.",
      ],
    },
    {
      topic: "Asking for directions",
      lines: [
        "Temple's three streets that way. Don't take the alley unless you mean to lose a purse.",
        "Mayor's hall? You can't miss it. Big stone thing, looks angry. North side of the square.",
        "If you want lodging, the Boar's Tooth is honest. The Crown is cheap. They are not the same place.",
      ],
    },
    {
      topic: "Reporting a crime",
      lines: [
        "Lost a purse, did you? Aye. Description?",
        "I'll write it down. Whether the captain reads it is between him and his conscience.",
        "If you saw it, walk me through it. Slowly.",
      ],
    },
    {
      topic: "Bribery",
      lines: [
        "I didn't see anything. (pockets coin) Move along, friend.",
        "Save your coin. I don't take. Go on, before I have to remember I saw you.",
        "Keep your hand out of your purse where I can see it. Now.",
      ],
    },
  ],
};

const merchant: Archetype = {
  key: "merchant",
  displayName: "Merchant",
  category: "Town",
  occupation: "Trader",
  suggestedClass: "Commoner (Expert, mercantile)",
  portraitPromptFragment:
    "well-fed human merchant in a fur-trimmed coat, weighing coins on a small brass scale, market stall behind",
  nameTable: {
    firstNames: [
      "Vannik", "Sela", "Domard", "Iressa", "Kazimir", "Lennea", "Orvik",
      "Tatya", "Marko", "Oren", "Rilla", "Quint", "Bessa", "Halric",
    ],
    lastNames: [
      "Threadwell", "Goldfast", "Brassmark", "Coinclasp", "Tradewind",
      "Velvet", "Ledger", "Spiceborn", "Marketon",
    ],
  },
  backstoryTemplates: [
    "{name} runs the third-largest trading house in town and is determined to make it the largest before the end of the year.",
    "After two ruined seasons on the southern routes, {name} now deals only in goods they can carry on their own back. Less profit. Less risk.",
    "{name} was raised in the back of a caravan and has never owned a roof for longer than a season at a time.",
  ],
  publicMotiveTemplates: [
    "Move the inventory before it spoils, before the season turns, before the competition undercuts.",
    "Find a courier who can be trusted with goods worth more than a handcart.",
    "Get a stall closer to the temple square where the foot traffic is twice as heavy.",
  ],
  secretMotiveTemplates: [
    "Quietly grease the right city official to push their main competitor out of the guild.",
    "Move a single high-value item that absolutely must not be inspected at the gate.",
    "Recover a debt from a noble who has so far refused every polite request.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Step closer, friend, the prices won't bite — only the wares will.",
        "Looking for anything in particular, or just admiring fine craftsmanship?",
        "If you've coin, I've something you didn't know you needed.",
      ],
    },
    {
      topic: "Price quote",
      lines: [
        "For you? Special price. Three silvers. Don't tell the others.",
        "That's twelve gold and worth every coin. I won't go lower.",
        "I bought it for ten, I'd sell it for fifteen, and I'd be insulted by anything in between.",
      ],
    },
    {
      topic: "Haggling",
      lines: [
        "You wound me. You actually wound me. Eight, then. Final.",
        "Walk away, then. Walk. Just walk. (sighs) Come back, come back.",
        "I'll throw in the small one for free if you take both. That's the best I can do.",
      ],
    },
    {
      topic: "Local information",
      lines: [
        "I don't gossip. (long pause) But if I did, I'd say the spice route's been quiet for a reason.",
        "Caravans aren't running west of here. Whatever's out there, it eats traders.",
        "The new mayor is bad for business. Specifically, mine.",
      ],
    },
  ],
};

const stablemaster: Archetype = {
  key: "stablemaster",
  displayName: "Stablemaster",
  category: "Town",
  occupation: "Stablemaster",
  suggestedClass: "Commoner (Expert, animal handling)",
  portraitPromptFragment:
    "weather-tanned human stablemaster in a worn vest and gloves, hand on the bridle of a chestnut horse, hay bales behind",
  nameTable: {
    firstNames: [
      "Wyll", "Jenna", "Hod", "Marni", "Crom", "Sela", "Pard",
      "Iliana", "Rowdy Aldric", "Hesta", "Bram", "Mira",
    ],
    lastNames: [
      "Bridlewood", "Hoofworth", "Coldsaddle", "Mane", "Pasture",
      "Tackwright", "Stables", "Rein",
    ],
  },
  backstoryTemplates: [
    "{name} grew up around horses and has more patience for them than for people. The arrangement suits them.",
    "Once a courier rider for a noble house, {name} retired to the stable when the road got too hard on their back.",
  ],
  publicMotiveTemplates: [
    "Keep every animal in the stable healthy and ready to ride at dawn.",
    "Buy out the rival stable across the green and consolidate the trade.",
  ],
  secretMotiveTemplates: [
    "Hide a particular horse — fast, distinctive, stolen — in the back stall until the buyer arrives.",
    "Watch every customer for the noble's blazon they once swore to never serve again.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Mind the muck. Riding or stabling?",
        "If you're after a mount, I've three. None for sale, all for hire.",
      ],
    },
    {
      topic: "Hire rates",
      lines: [
        "Riding horse: five silvers a day, deposit of a gold against not coming back.",
        "Draft horse: three silvers, but you'll need a cart and a strong back.",
        "If your business takes you north of the river, the price doubles. Insurance.",
      ],
    },
    {
      topic: "Animal care",
      lines: [
        "She's a sweet one. Don't ride her hard the first hour, she's stiff in the morning.",
        "He bites. Just so you know.",
        "Keep her watered, keep her warm, bring her back the way you found her.",
      ],
    },
  ],
};

const herbalist: Archetype = {
  key: "herbalist",
  displayName: "Herbalist",
  category: "Town",
  occupation: "Herbalist",
  suggestedClass: "Commoner (Expert, herbalism kit)",
  portraitPromptFragment:
    "elderly half-elf herbalist in a green-stained smock, rows of glass jars and dried plants on shelves behind",
  nameTable: {
    firstNames: [
      "Old Maevyn", "Linna", "Sablen", "Wenna", "Pyrrha", "Hesh",
      "Avorel", "Doryn", "Elwy", "Marra", "Thel", "Briar",
    ],
    lastNames: [
      "Greenroot", "Mossflower", "Wildvale", "Thistledown", "Brackenhall",
      "Foxglove", "Nettlewise", "Witherwick",
    ],
  },
  backstoryTemplates: [
    "{name} learned the craft from a hedge witch in the woods who refused to teach anything that might harm. They've broken that promise twice.",
    "{name} runs a respectable shop by day. The back door does different business by night, but only for people they trust.",
  ],
  publicMotiveTemplates: [
    "Keep the shelves stocked with everything from soothing tea to bone-setting poultice.",
    "Find a steady supplier of moonpetal — the only honest poison-cure in three counties.",
  ],
  secretMotiveTemplates: [
    "Quietly cultivate a single, very dangerous plant in a hidden corner of the cellar.",
    "Locate the recipe their old teacher destroyed — the one for a draught that brings the recently dead back, briefly.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Mind the leaves on the floor, mind the fumes in the back. Welcome.",
        "What ails you, traveler? Or is it ailing someone else?",
      ],
    },
    {
      topic: "Buying remedies",
      lines: [
        "For a cough, willow tea — a copper. For real pain, I've bittermoss salve, three silvers a tin.",
        "Antitoxin's a gold piece and I won't ask why.",
        "Healing potion? Friend, those are temple work or wizard work. I sell honest medicine.",
      ],
    },
    {
      topic: "Identifying a plant",
      lines: [
        "(turns it over in their hand) This grew in shade, near water. Northeast of here, I'd say.",
        "Common enough. Useless on its own. Mixed with three others I won't name, dangerous.",
        "I don't know what this is. I don't want to know what this is. Take it away.",
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// WILDERNESS
// ─────────────────────────────────────────────────────────────────

const hunter: Archetype = {
  key: "hunter",
  displayName: "Hunter",
  category: "Wilderness",
  occupation: "Hunter / Trapper",
  suggestedClass: "Scout (CR 1/2) or Ranger (low)",
  portraitPromptFragment:
    "wiry human hunter in oiled leathers and a fur cloak, longbow over shoulder, rabbit on belt, snowy pines behind",
  nameTable: {
    firstNames: [
      "Cael", "Renna", "Bohr", "Ysha", "Marek", "Wenna", "Ash",
      "Quill", "Tana", "Rurik", "Sable", "Idra",
    ],
    lastNames: [
      "Greycoat", "Snowstep", "Underbough", "Pinewise", "Trailmend",
      "Frostfox", "Quietfoot",
    ],
  },
  backstoryTemplates: [
    "{name} works the high woods alone. Comes to town twice a season to sell furs, drink one drink, and leave before the talking starts.",
    "Once a regimental scout, {name} took to the wilderness when the war ended and hasn't found a reason to come back.",
  ],
  publicMotiveTemplates: [
    "Bring back the season's furs without losing toes to frostbite or worse.",
    "Track the boar that has been raiding the upland farms before the village hires someone reckless.",
  ],
  secretMotiveTemplates: [
    "Find what's been killing wolves in the deep woods — too clean, too quiet, not natural.",
    "Avoid the old hunting partner who's been asking about them in town again.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Quiet a moment. (listens.) Alright. You needed something?",
        "Down from the high country. You'll be from town, I take it.",
      ],
    },
    {
      topic: "Wilderness advice",
      lines: [
        "Don't follow the river past the second bend. The footing lies.",
        "Whatever you saw in those tracks, you don't want to meet it. Take the west pass.",
        "Stay off the high ridge after dark. Cold's the gentlest thing up there.",
      ],
    },
    {
      topic: "Selling pelts",
      lines: [
        "Marten pelt: two silvers if it's clean. One if you bargained me down.",
        "Wolf, I won't take. Bad luck. You'll find a buyer in town if you're patient.",
        "Bear claw, I'll trade for arrowheads and not a thing more.",
      ],
    },
  ],
};

const rangerScout: Archetype = {
  key: "ranger-scout",
  displayName: "Ranger / Scout",
  category: "Wilderness",
  occupation: "Wilderness Scout",
  suggestedClass: "Scout (CR 1/2) or Ranger 3-5",
  portraitPromptFragment:
    "lean elven ranger in mottled green leather, longbow strung, hood up, pine forest deep behind",
  nameTable: {
    firstNames: [
      "Aelar", "Sira", "Theron", "Mirabel", "Ilan", "Vesh", "Ardyn",
      "Korin", "Lia", "Saela",
    ],
    lastNames: [
      "Silverleaf", "Quickbow", "Pinewatch", "Greengage", "Treadlight",
      "Tallwind", "Mossguard",
    ],
  },
  backstoryTemplates: [
    "{name} grew up in a forest village now lost to a fire no one will speak about. They walk the wilds and report what they find to whoever pays.",
    "Once sworn to a noble house, {name} broke the oath rather than carry out an order they couldn't live with.",
  ],
  publicMotiveTemplates: [
    "Map the wild country between the river and the high pass before winter closes it.",
    "Hire on as guide for a party that won't get them killed.",
  ],
  secretMotiveTemplates: [
    "Track a creature that has been picking off scouts one by one — and find it before it finds them.",
    "Find the old ranger's lodge they grew up in and learn what really happened the night it burned.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Stay on the trail. The forest is louder than it sounds.",
        "You smell of town. That's neither praise nor insult — it's just true.",
      ],
    },
    {
      topic: "Hire as guide",
      lines: [
        "Two silvers a day. I pick the route. Argue and the price goes up.",
        "I'll take you as far as the upper falls. Past that, you're on your own conscience.",
        "If you draw steel without my say-so, the deal's over and I keep the deposit.",
      ],
    },
    {
      topic: "Tracking",
      lines: [
        "Two days old. Heavy. Walking, not running. They didn't know they were followed.",
        "These tracks shouldn't be here. Nothing this big lives this close to the road.",
        "Lost the trail in the stream. Whatever it was knew what it was doing.",
      ],
    },
  ],
};

const hedgeWitch: Archetype = {
  key: "hedge-witch",
  displayName: "Hedge Witch",
  category: "Wilderness",
  occupation: "Hedge Witch",
  suggestedClass: "Druid 3 / Wizard 1 (folk magic)",
  portraitPromptFragment:
    "old gnome hedge witch in a layered woolen cloak strung with bones and herbs, lantern in hand, foggy heath behind",
  nameTable: {
    firstNames: [
      "Old Mab", "Granny Veska", "Aunt Hesh", "Maeve", "Sora", "Prilla",
      "Witherwen", "Old Tessa", "Brigh", "Mother Lyn",
    ],
    lastNames: [
      "Crookwood", "Bramblestone", "Marshfen", "Owlwise", "Greyleaf",
      "Hollowtree", "Knottle",
    ],
  },
  backstoryTemplates: [
    "{name} lives at the edge of the village in a cottage everyone knows but few visit. They are called for births, deaths, and the small magics in between.",
    "Once a temple novice, {name} left the order over a quiet disagreement they never explain. The folk magic suits them better.",
  ],
  publicMotiveTemplates: [
    "Tend to the village folk who can't afford a proper temple healer.",
    "Keep the old shrine in the woods clean — somebody must.",
  ],
  secretMotiveTemplates: [
    "Bind something old and dangerous that lives under the hill, with a working only they remember how to renew.",
    "Pass the craft on before they die — but the only candidate is a child whose parents would never allow it.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Took your time. I knew you were coming.",
        "Sit. The kettle's near boiled. We'll talk when it sings.",
      ],
    },
    {
      topic: "Healing / cure",
      lines: [
        "Three drops in tea, twice a day. Don't drink the tea cold. It changes the working.",
        "I can mend the wound. I can't mend the reason for it. That's your work.",
        "This isn't a sickness. Someone wished it on you. Tell me everyone you've crossed in the last year.",
      ],
    },
    {
      topic: "Omens / fortune",
      lines: [
        "(turns three bones in a bowl) You'll lose something you didn't know you valued. Soon.",
        "There's water in your future. A great deal of water. I don't know more than that.",
        "I won't read for you. Some futures are kinder unseen.",
      ],
    },
    {
      topic: "DM dark hint",
      dmOnly: true,
      lines: [
        "(after the others leave) The thing you're hunting hunts you back. It knows your scent. Be careful whose hand you take.",
      ],
    },
  ],
};

const farmer: Archetype = {
  key: "farmer",
  displayName: "Farmer",
  category: "Wilderness",
  occupation: "Farmer",
  suggestedClass: "Commoner",
  portraitPromptFragment:
    "weather-beaten human farmer in a straw hat and patched tunic, leaning on a pitchfork, golden field behind",
  nameTable: {
    firstNames: [
      "Old Hod", "Bessa", "Mart", "Nettie", "Cletus", "Saera", "Wend",
      "Halric", "Pol", "Rosa", "Donal", "Mira",
    ],
    lastNames: [
      "Furrow", "Cornsworth", "Greenacre", "Plowright", "Hayfield",
      "Barley", "Millerson",
    ],
  },
  backstoryTemplates: [
    "{name}'s family has worked this same plot for four generations. The deeds, however, are with the lord and getting harder to renew.",
    "{name} bought into a farming partnership and bought out the others when it was clear the others were drinking the profits.",
  ],
  publicMotiveTemplates: [
    "Get the harvest in before the rains come.",
    "Sell enough at market to cover the lord's tax with a copper to spare.",
  ],
  secretMotiveTemplates: [
    "Find whatever has been killing livestock at the back fence — and not tell the lord, who'd send hunters that trample the crop.",
    "Keep the small shrine in the back field hidden from the priest in town.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Don't trample the rows. What can I do for you, friend?",
        "If it's water you want, the well's behind the barn. If it's anything else, I'm working.",
      ],
    },
    {
      topic: "Selling produce",
      lines: [
        "Apples a copper a basket. Take your own basket back, I keep mine.",
        "I'll have grain to spare if the rain holds off another tenday.",
      ],
    },
    {
      topic: "Local trouble",
      lines: [
        "Something's been at the south flock. Not a wolf — wolves leave a mess. This is clean.",
        "The lord's tax man came by twice this season. Twice. That's never good.",
      ],
    },
  ],
};

const ferryman: Archetype = {
  key: "ferryman",
  displayName: "Ferryman",
  category: "Wilderness",
  occupation: "Ferryman",
  suggestedClass: "Commoner (Expert, water vehicles)",
  portraitPromptFragment:
    "grizzled human ferryman in oilskin and a wide hat, pole in hand on a flat-bottomed barge, river mist behind",
  nameTable: {
    firstNames: [
      "Old Brun", "Hod", "Marn", "Vesh", "Sela", "Cole", "Tully",
      "Wend", "Pell",
    ],
    lastNames: [
      "Crossing", "Polestaff", "Reedmark", "Shallowford", "Driftwood",
      "Mistwater",
    ],
  },
  backstoryTemplates: [
    "{name} has worked this stretch of river for thirty years and has seen every face that comes and goes. They forget very little.",
    "Inherited the ferry rights from a cousin who drowned. {name} has never quite trusted the water since but the work is steady.",
  ],
  publicMotiveTemplates: [
    "Keep the ferry running on schedule and the toll fair.",
    "Earn enough this season to buy the second barge they need for the spring melt.",
  ],
  secretMotiveTemplates: [
    "Know more about every passenger than the passengers think they do, and quietly sell that knowledge.",
    "Avoid the part of the river where the body went under last winter — the one no one's reported missing.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting / fare",
      lines: [
        "Two coppers across. Horse a silver. Wagon a silver and a half. No haggling.",
        "If you're crossing, get on. If you're not, off the dock.",
      ],
    },
    {
      topic: "River conditions",
      lines: [
        "Water's high. We'll go but it'll be slow. Sit center, don't lean.",
        "Won't cross in this fog. Come back at dawn or find another ferry — there isn't one for a day's ride.",
      ],
    },
    {
      topic: "Local gossip",
      lines: [
        "I see who comes and goes. I don't always say. But for a copper extra I might remember a face.",
        "Two rough sorts crossed yesterday going north. Hadn't seen them before. Hope I don't again.",
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// UNDERWORLD
// ─────────────────────────────────────────────────────────────────

const fence: Archetype = {
  key: "fence",
  displayName: "Fence",
  category: "Underworld",
  occupation: "Fence",
  suggestedClass: "Spy (CR 1) / Bandit Captain",
  portraitPromptFragment:
    "smooth-cheeked tiefling fence in a tailored vest, jeweler's loupe in one hand, candlelit back room of a dim shop behind",
  nameTable: {
    firstNames: [
      "Vex", "Sable", "Quill", "Mara", "Thorne", "Pell", "Iresh",
      "Ash", "Karth", "Velvet",
    ],
    lastNames: [
      "Blackmark", "Greycoin", "Halfshadow", "Cobble", "Whisperknot",
      "Velvetlock", "Dim",
    ],
  },
  backstoryTemplates: [
    "{name} runs a respectable curio shop by day and a far less respectable trade by night. They have not been caught in either life.",
    "Once a thief, {name} found that organizing other people's loot paid better than stealing it themselves. They retired the lockpicks but kept the contacts.",
  ],
  publicMotiveTemplates: [
    "Run the curio shop well enough that it doesn't attract the wrong kind of inspection.",
    "Find a buyer for a piece they've been holding longer than they like.",
  ],
  secretMotiveTemplates: [
    "Move a single object — high value, very hot — across the border before the noble who lost it offers a real reward.",
    "Edge out the rival fence on the south side once and for all, by means polite or otherwise.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Curiosities, antiquities, occasional rarities. What can I show you?",
        "Browse a moment. I'll tell you when something I have isn't worth your time.",
      ],
    },
    {
      topic: "Selling stolen goods",
      lines: [
        "(examines piece) Mm. Quarter of true value, in coin, today. Or full value, in a favor, owed.",
        "I won't take this. The owner has friends I don't want to meet.",
        "Leave it with me three days. If it's still on the shelf when you come back, you take it back.",
      ],
    },
    {
      topic: "Information",
      lines: [
        "Information is more expensive than goods. Same risks, no insurance.",
        "I can ask. The answer might cost you. The answer might cost me. Either way you pay.",
        "Try the docks. Whatever you're hunting, half of it sleeps near salt water.",
      ],
    },
    {
      topic: "DM threat",
      dmOnly: true,
      lines: [
        "(quietly, after the deal) Walk out the back. There's a man in a green cloak across the street who's been waiting for a face to follow.",
      ],
    },
  ],
};

const beggar: Archetype = {
  key: "beggar",
  displayName: "Beggar",
  category: "Underworld",
  occupation: "Beggar",
  suggestedClass: "Commoner (Expert, perception)",
  portraitPromptFragment:
    "ragged human beggar in a moth-eaten cloak, bowl in lap, crouched in a temple doorway, snow falling lightly",
  nameTable: {
    firstNames: [
      "Old Pell", "Mam", "Wisp", "Ratch", "Crow", "Skinny Tem", "Vesh",
      "Bony Joss", "Nim",
    ],
    lastNames: [
      "Nofamily", "Nameless", "Doormat", "Stoop", "Gutter", "Threadbare",
    ],
  },
  backstoryTemplates: [
    "{name} was once something else — soldier, scholar, parent — and won't say which. The street has been their whole life for ten years.",
    "{name} chose this corner because the temple watch leaves them alone and the market's noisy enough that you can hear coin hit the bowl from a row away.",
  ],
  publicMotiveTemplates: [
    "Make enough by sundown to eat once and sleep dry.",
    "Get through the winter alive.",
  ],
  secretMotiveTemplates: [
    "See everything that passes their corner — and remember it for whoever pays in coin or kindness.",
    "Find the noble whose face they recognize and decide whether to greet them or rob them.",
  ],
  dialogueTopics: [
    {
      topic: "Asking for alms",
      lines: [
        "A copper, friend. The gods see what you give and what you keep.",
        "Anything you can spare. A heel of bread. A smile. Anything.",
        "Bless you for stopping. Most don't.",
      ],
    },
    {
      topic: "Information",
      lines: [
        "I see who comes and goes. A silver sharpens the memory.",
        "The man in the red hat? Aye. Walks past every morning. Visits the second house on the alley. Never twice in the same hour.",
        "I don't sell what I see lightly. But I am sometimes very hungry.",
      ],
    },
    {
      topic: "Refusal",
      lines: [
        "Not for that. Not for any coin. Walk on.",
        "I beg, friend. I don't tell.",
      ],
    },
  ],
};

const thief: Archetype = {
  key: "thief",
  displayName: "Thief",
  category: "Underworld",
  occupation: "Thief",
  suggestedClass: "Bandit (CR 1/8) or Spy (CR 1)",
  portraitPromptFragment:
    "young halfling thief in a dark hood, crouched on a rooftop, twin daggers sheathed at thigh, moonlit chimneys behind",
  nameTable: {
    firstNames: [
      "Vex", "Crow", "Lin", "Pip", "Sable", "Wisp", "Quick Tem",
      "Nim", "Ash", "Slip",
    ],
    lastNames: [
      "Halfshadow", "Picksleeve", "Quietfoot", "Cobble", "Dim",
      "Streetside", "Smoke",
    ],
  },
  backstoryTemplates: [
    "{name} grew up on the streets and learned the trade from older kids who are mostly dead now. They've lasted longer than any of them.",
    "{name} steals to keep a younger sibling fed. The sibling does not know.",
  ],
  publicMotiveTemplates: [
    "Pick a few purses without getting caught and disappear before the watch passes.",
    "Find a fence who'll give a fair price for last night's haul.",
  ],
  secretMotiveTemplates: [
    "Pull off one big job that lets them leave the city for good.",
    "Steal back a single object that was taken from their family — and burn the house it's in on the way out.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting (cautious)",
      lines: [
        "Don't know you. Move along.",
        "Whatever you're selling, I'm not buying. Whatever you're buying, I'm not selling.",
      ],
    },
    {
      topic: "Negotiating a job",
      lines: [
        "Half up front. Half on the table when the job's done. I don't take work on credit.",
        "I work alone. If you want a crew, I'm not your woman.",
        "Tell me what's behind the door, what's behind the door behind the door, and what walks the hallway. Then I'll quote.",
      ],
    },
    {
      topic: "DM dark line",
      dmOnly: true,
      lines: [
        "(later, alone) The watch captain is on someone's payroll. I've seen the meet. I'd sell that for the right price.",
      ],
    },
  ],
};

const cultist: Archetype = {
  key: "cultist",
  displayName: "Cultist",
  category: "Underworld",
  occupation: "Cult Initiate",
  suggestedClass: "Cultist (CR 1/8) or Cult Fanatic (CR 2)",
  portraitPromptFragment:
    "hooded human cultist in dark robes with a strange brass sigil at the collar, candlelit underground chamber behind",
  nameTable: {
    firstNames: [
      "Brother Veth", "Sister Maris", "Brother Karn", "Sister Hesh",
      "Initiate Pell", "The Pale", "The Quiet One", "The Recordkeeper",
    ],
    lastNames: [
      "Of the Lower Door", "Of the Black Star", "Of the Listening Stone",
      "Of the Hollow Mass", "Of the Empty Hand",
    ],
    patterns: ["{first} {last}", "{first}"],
  },
  backstoryTemplates: [
    "{name} was a respectable merchant's child until the night they were shown what lies beneath the city. They have never spoken to family since.",
    "{name} was rescued by the cult from a death they don't speak of. They owe a debt they will never finish paying.",
  ],
  publicMotiveTemplates: [
    "Live a quiet, normal life that draws no attention from the watch.",
    "Recruit one new initiate before the next dark moon.",
  ],
  secretMotiveTemplates: [
    "Carry out a single act on a date the cult has set, and ask no further questions about it.",
    "Identify someone the cult considers an enemy and report their movements weekly.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting (in public)",
      lines: [
        "(polite, distant) Good day, friend. Lovely weather.",
        "(barely looks up) Mm. Yes. Excuse me, I'm in a rush.",
      ],
    },
    {
      topic: "Recruitment hint",
      lines: [
        "There's more to the world than the priests will tell you. Some of us study what they've forgotten.",
        "You have a hunger I recognize. If you ever want to know its name, find me again. Quietly.",
      ],
    },
    {
      topic: "DM ritual line",
      dmOnly: true,
      lines: [
        "(in ritual, voice changed) The Hollow Mass turns. The names of those above are written on the underside of the world.",
        "(quietly to a fellow initiate) The hand has been chosen. The hand does not know it yet.",
      ],
    },
  ],
};

const smugglerCaptain: Archetype = {
  key: "smuggler-captain",
  displayName: "Smuggler Captain",
  category: "Underworld",
  occupation: "Smuggler / Ship Captain",
  suggestedClass: "Bandit Captain (CR 2)",
  portraitPromptFragment:
    "weather-tanned half-elf smuggler captain in a long coat and tricorn, scar across cheek, lantern-lit deck of a small ship at night",
  nameTable: {
    firstNames: [
      "Captain Vesh", "Captain Marra", "Captain Ren", "Old Quint",
      "Captain Pell", "Captain Sable",
    ],
    lastNames: [
      "Saltwise", "Lowtide", "Blackgale", "Greenwater", "Quickkeel",
      "Shoreless",
    ],
  },
  backstoryTemplates: [
    "{name} runs a small fast vessel that officially carries grain and unofficially carries everything else. They've never been caught and never overcharged.",
    "Once a navy officer, {name} resigned over an order they refused, and now uses the same skills against the same flag.",
  ],
  publicMotiveTemplates: [
    "Keep the cargo runs profitable and the crew alive.",
    "Buy a second ship before someone catches them in the first.",
  ],
  secretMotiveTemplates: [
    "Settle a long-standing score with the harbormaster who once turned them in.",
    "Find a cargo so valuable they can retire after one more run — and never quite stop running.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "If you've business with me, you were sent. So who sent you?",
        "Talk fast. Tide doesn't wait and neither do I.",
      ],
    },
    {
      topic: "Hire for passage",
      lines: [
        "Five gold to the next port, no questions, no luggage searched. Cabin extra.",
        "I don't take passengers I don't know. Bring the right name and the price drops.",
      ],
    },
    {
      topic: "Cargo negotiation",
      lines: [
        "I'll move it. I won't open it. Don't tell me what it is and the price is fair. Tell me, and the price is unfair.",
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// COURT
// ─────────────────────────────────────────────────────────────────

const noble: Archetype = {
  key: "noble",
  displayName: "Noble",
  category: "Court",
  occupation: "Noble",
  suggestedClass: "Noble (CR 1/8) or Knight (CR 3)",
  portraitPromptFragment:
    "haughty human noble in a fur-trimmed velvet doublet, signet ring prominent, gilded portrait gallery behind",
  nameTable: {
    firstNames: [
      "Lord Aldric", "Lady Sable", "Lord Marek", "Lady Yseult",
      "Lord Corvin", "Lady Iressa", "Lord Vannik", "Lady Petra",
      "Lord Donal", "Lady Marra",
    ],
    lastNames: [
      "Caelmore", "Vance", "Hightower", "Greycastle", "Ashfeld",
      "Vellincourt", "Stormhall", "Brynward", "Marchmont",
    ],
  },
  backstoryTemplates: [
    "{name} inherited a title and a debt of equal weight. The title is heavier on most days.",
    "{name} was the third child of a small house and never expected to inherit, until the elder two died in a bad season and a worse war.",
  ],
  publicMotiveTemplates: [
    "Keep the family name in good standing at court for one more generation.",
    "Arrange a marriage that brings the family the alliance it has needed for years.",
  ],
  secretMotiveTemplates: [
    "Discredit a rival house by means that absolutely cannot trace back to them.",
    "Hide a debt large enough that the family would lose its lands if the council learned of it.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting (formal)",
      lines: [
        "You are admitted. Speak briefly — my time is not infinite.",
        "I am told you have business that requires my attention. Convince me.",
      ],
    },
    {
      topic: "Granting a favor",
      lines: [
        "I will consider it. That is more than most receive.",
        "What you ask is small. What you offer in return must not be.",
        "It is done. You will not speak of it again.",
      ],
    },
    {
      topic: "Refusal",
      lines: [
        "No. Do not ask twice.",
        "Your boldness amuses me. Now leave before it stops amusing me.",
      ],
    },
    {
      topic: "DM intrigue",
      dmOnly: true,
      lines: [
        "(quietly to a servant after the players leave) Have them watched. Especially the quiet one. The quiet one is always the one to watch.",
      ],
    },
  ],
};

const guardCaptain: Archetype = {
  key: "guard-captain",
  displayName: "Guard Captain",
  category: "Court",
  occupation: "Captain of the Guard",
  suggestedClass: "Veteran (CR 3) or Knight (CR 3)",
  portraitPromptFragment:
    "stern human guard captain in polished plate with a city sigil tabard, gauntleted hand on sword hilt, banner-lined hall behind",
  nameTable: {
    firstNames: [
      "Captain Garrick", "Captain Mira", "Captain Vorn", "Captain Sera",
      "Commander Tully", "Commander Rilla", "Captain Aldric",
    ],
    lastNames: [
      "Halberd", "Stoneward", "Ironbar", "Watchful", "Grimsteel",
      "Shieldborn", "Ashguard",
    ],
  },
  backstoryTemplates: [
    "{name} rose through the ranks during a long bad year and has never quite shed the habits that year taught.",
    "{name} commands the watch out of a sense of duty their family does not share. Promotion has always come at family dinners' expense.",
  ],
  publicMotiveTemplates: [
    "Keep the streets safe enough that the lord doesn't replace them.",
    "Stamp out the smuggling ring everyone in the watch pretends they don't see.",
  ],
  secretMotiveTemplates: [
    "Quietly investigate a noble whose name has come up too often, while pretending to no one that they are.",
    "Suppress evidence of a crime committed by a guard the captain personally trained.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Stand at ease. Speak quickly — I've patrols to brief.",
        "If you've come to make a complaint, the clerk takes those. If you've come with information, sit.",
      ],
    },
    {
      topic: "Hiring for a job",
      lines: [
        "The watch doesn't pay irregulars. The lord does. We can arrange it discreetly.",
        "Bring the man in alive. Wounded I can work with. Dead, I can't.",
      ],
    },
    {
      topic: "Authority / arrest",
      lines: [
        "By the lord's writ, you'll come with me. Quietly, if you've sense.",
        "Your weapons. Now. You'll have them back when this is sorted, or never, depending on how it goes.",
      ],
    },
  ],
};

const courtMage: Archetype = {
  key: "court-mage",
  displayName: "Court Mage",
  category: "Court",
  occupation: "Court Wizard",
  suggestedClass: "Mage (CR 6)",
  portraitPromptFragment:
    "silver-bearded elven court mage in star-embroidered robes, holding a quill above an open ledger, candlelit study behind",
  nameTable: {
    firstNames: [
      "Magister Aelar", "Magister Yseult", "Master Corvin", "Master Lyra",
      "Master Theron", "Master Wenna",
    ],
    lastNames: [
      "Of the Five Towers", "Of the Quiet Sigil", "Vex", "Halloran",
      "Greyspell", "Velasi", "Of the Outer Library",
    ],
  },
  backstoryTemplates: [
    "{name} serves the court out of a binding contract three generations old that none of the parties is permitted to discuss.",
    "{name} was a hedge wizard until they cured a noble's cough that no temple priest could touch. They have not gone home since.",
  ],
  publicMotiveTemplates: [
    "Advise the lord wisely on matters arcane and political alike.",
    "Complete a long-term study of a magical phenomenon the council has approved.",
  ],
  secretMotiveTemplates: [
    "Secretly continue research the council expressly forbade — buried in the same locked office it always was.",
    "Identify which noble has been smuggling magical contraband into the court library.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "You may approach. Mind the chalk on the floor. Yes. There. Don't smudge that.",
        "I have an hour. After that I have a meeting that no living person should be late to.",
      ],
    },
    {
      topic: "Magical advice",
      lines: [
        "What you describe is not impossible. It is, however, deeply unwise.",
        "I've read of similar workings. None of them ended well for the practitioner.",
        "I can teach you the cantrip but not the discipline. The discipline is on you.",
      ],
    },
    {
      topic: "DM warning",
      dmOnly: true,
      lines: [
        "(after a long pause) The thing in the lower vault has been quiet. I do not like that it has been quiet.",
      ],
    },
  ],
};

const butler: Archetype = {
  key: "butler",
  displayName: "Butler / Steward",
  category: "Court",
  occupation: "Household Steward",
  suggestedClass: "Commoner (Expert, organization)",
  portraitPromptFragment:
    "impeccable elderly human butler in a black coat with silver pins, white gloves, polished marble entry hall behind",
  nameTable: {
    firstNames: [
      "Mr. Halric", "Mrs. Vance", "Mr. Tully", "Mr. Karn", "Mrs. Pell",
      "Mr. Petra",
    ],
    lastNames: [
      "Of the House", "Coldspring", "Greyledger", "Whitehall", "Mannor",
      "Steward",
    ],
  },
  backstoryTemplates: [
    "{name} has served the family longer than the current lord has been alive. They will outlive the next lord too, and they know it.",
    "{name} was hired as a junior footman thirty years ago and rose by being indispensable, invisible, and impossibly discreet.",
  ],
  publicMotiveTemplates: [
    "Run the household to a standard the family takes for granted.",
    "Keep the staff loyal and the silver counted.",
  ],
  secretMotiveTemplates: [
    "Quietly protect a family secret no living member of the family knows.",
    "Decide which heir is worthy of the house and arrange small kindnesses or small cruelties accordingly.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "You are expected. This way, please.",
        "The house is at your disposal within reason. The house defines reason.",
      ],
    },
    {
      topic: "House etiquette",
      lines: [
        "We do not enter the western wing without a member of the family present. That is non-negotiable.",
        "The bell is for service. Use it. Do not shout for me.",
      ],
    },
    {
      topic: "Information",
      lines: [
        "I keep the house's confidence. I cannot help you in that respect.",
        "(slight pause) I will say only that the lord retires early tonight and the back stair is unattended after eleven.",
      ],
    },
  ],
};

const executioner: Archetype = {
  key: "executioner",
  displayName: "Executioner",
  category: "Court",
  occupation: "Royal Executioner",
  suggestedClass: "Veteran (CR 3) or Berserker (CR 2)",
  portraitPromptFragment:
    "broad-shouldered human executioner in a dark hood and leather apron, two-handed axe resting blade-down beside them, scaffold behind",
  nameTable: {
    firstNames: [
      "Brom", "Mara", "The Quiet Man", "The Black Hand", "Krell", "Hesh",
      "The Stranger",
    ],
    lastNames: [
      "Of the Square", "No Surname Given", "Of the High Block", "Halberd",
      "Greysteel",
    ],
    patterns: ["{first}", "{first} {last}"],
  },
  backstoryTemplates: [
    "{name} took the role because no one else in three towns would, and the pay was steady. They sleep most nights.",
    "{name} was trained by a father who believed the work, done well and quickly, was a mercy. They have tried to live up to that.",
  ],
  publicMotiveTemplates: [
    "Do the work the lord has decreed, cleanly and without spectacle.",
    "Teach an apprentice who can replace them when their back finally gives out.",
  ],
  secretMotiveTemplates: [
    "Find the names of those they executed who they later learned were innocent — and decide what, if anything, to do.",
    "Refuse, eventually, to carry out the next sentence. They are not yet sure when.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting (rare)",
      lines: [
        "I have nothing to say. Walk on.",
        "If you've come to look at me, look. If you've come to talk, find a softer ear.",
      ],
    },
    {
      topic: "On the work",
      lines: [
        "It is a job. The lord rules. The court decides. I lift the axe.",
        "I keep it sharp because the only kindness I can give is a clean one.",
      ],
    },
  ],
};

const jailer: Archetype = {
  key: "jailer",
  displayName: "Jailer",
  category: "Court",
  occupation: "Jailer / Gaoler",
  suggestedClass: "Thug (CR 1/2) or Veteran (CR 3)",
  portraitPromptFragment:
    "barrel-chested half-orc jailer with a heavy ring of keys at the belt, lantern in hand, narrow stone corridor behind",
  nameTable: {
    firstNames: [
      "Old Krell", "Boggs", "Hod", "Ratch", "Brom", "Marna", "Sela",
    ],
    lastNames: [
      "Keykeeper", "Oftheblock", "Stoneward", "Lowdoor", "Cellars",
    ],
  },
  backstoryTemplates: [
    "{name} took the jailer's job because they like quiet, and the cells are quieter than most rooms in the world.",
    "Once a guard who lost a foot to a prisoner's knife, {name} took the only post that didn't require running.",
  ],
  publicMotiveTemplates: [
    "Keep the cells secure, the prisoners fed, and the watch happy.",
  ],
  secretMotiveTemplates: [
    "Quietly let one specific prisoner slip a message out of the jail every week, in exchange for coin and a story.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Visiting hours? Family only, and family proves it.",
        "If you're delivering, sign the ledger. If you're not, leave.",
      ],
    },
    {
      topic: "Bribery",
      lines: [
        "(slowly) Coin doesn't open these doors. Coin opens conversations. Sometimes those lead to doors.",
        "I won't take. Not for that. Not in here.",
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// TEMPLE
// ─────────────────────────────────────────────────────────────────

const priest: Archetype = {
  key: "priest",
  displayName: "Priest",
  category: "Temple",
  occupation: "Priest",
  suggestedClass: "Priest (CR 2)",
  portraitPromptFragment:
    "kindly older human priest in flowing white-and-gold vestments, holy symbol prominent at chest, candlelit altar behind",
  nameTable: {
    firstNames: [
      "Father Aldric", "Mother Sera", "Father Tully", "Mother Hesh",
      "Brother Vesh", "Sister Marra", "Father Donal", "Mother Iressa",
    ],
    lastNames: [
      "Of the Morning", "Of the Quiet Hand", "Halloran", "Of the Long Vigil",
      "Of the Rising Sun", "Of the Fivefold Path",
    ],
  },
  backstoryTemplates: [
    "{name} took the cloth after a near-death experience that they describe in different ways depending on who is listening.",
    "Born into a temple-bound family, {name} never seriously considered any other life, and is sometimes surprised to find that this is fine.",
  ],
  publicMotiveTemplates: [
    "Tend to the faithful and to those who only come when they have run out of other places to turn.",
    "Restore the broken east window before the next holy day.",
  ],
  secretMotiveTemplates: [
    "Question the new doctrine the high temple has handed down, and quietly continue teaching the old one.",
    "Hide a relic the temple believes destroyed, until they decide what should be done with it.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Welcome, child. The temple is open to all who come in good faith.",
        "Sit, rest. The gods are patient. So am I.",
      ],
    },
    {
      topic: "Healing",
      lines: [
        "I will lay hands. The donation box is by the door, but no one is turned away for empty pockets.",
        "This is beyond my craft. I will pray for them, and for you, but seek a hedge witch tonight, not a temple in the morning.",
      ],
    },
    {
      topic: "Counsel / advice",
      lines: [
        "You ask the wrong question. The right one is plainer and harder.",
        "The gods do not always answer. When they do, the answer is rarely what you wanted to hear.",
      ],
    },
  ],
};

const acolyte: Archetype = {
  key: "acolyte",
  displayName: "Acolyte",
  category: "Temple",
  occupation: "Junior Cleric",
  suggestedClass: "Acolyte (CR 1/4)",
  portraitPromptFragment:
    "earnest young half-elf acolyte in plain white robes, holding a censer, sunlit cloister behind",
  nameTable: {
    firstNames: [
      "Veth", "Lin", "Pell", "Sora", "Hesh", "Maris", "Iren", "Quill",
    ],
    lastNames: [
      "Of the Morning Choir", "Of the Lower Cloister", "Halric", "Vesper",
      "Of the New Vigil",
    ],
  },
  backstoryTemplates: [
    "{name} entered the temple a year ago and is still half-amazed they were let in.",
    "Sent to the temple by a grandmother who was sure of their calling, {name} has not yet decided whether they share that certainty.",
  ],
  publicMotiveTemplates: [
    "Earn the trust of the senior priest and be assigned more responsibility.",
    "Master the morning rite without making any of the small mistakes that everyone notices.",
  ],
  secretMotiveTemplates: [
    "Doubt the doctrine and write the doubts in a small book that must never be found.",
    "Find their birth parent — the one the temple raised them from.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Welcome to the temple. Father is in the inner chapel — shall I take a message?",
        "(bow) Be welcome.",
      ],
    },
    {
      topic: "Errands / help",
      lines: [
        "I can take the donation. I'll record it in the book before sundown.",
        "If you wait a moment I can fetch a priest. Truly, I won't be long.",
      ],
    },
    {
      topic: "Gossip (whispered)",
      lines: [
        "I shouldn't say. (looks around.) The senior priest has been arguing with the high temple's letters for a tenday now. Nobody says about what.",
      ],
    },
  ],
};

const oracle: Archetype = {
  key: "oracle",
  displayName: "Oracle",
  category: "Temple",
  occupation: "Oracle",
  suggestedClass: "Priest (CR 2) or Mage (CR 6)",
  portraitPromptFragment:
    "blindfolded human oracle in pale gauzy robes, hands raised in a sigil of warding, mist-filled stone sanctum behind",
  nameTable: {
    firstNames: [
      "The Sightless", "The Quiet Voice", "The Weeping Seer", "Lady Pyrrha",
      "Mother Ash", "The Pale Listener",
    ],
    lastNames: [
      "Of the Hollow Shrine", "Of the Long Sleep", "Of the Mist Room",
      "Of the Inner Door",
    ],
  },
  backstoryTemplates: [
    "{name} has not seen with their eyes since the night they first heard the god speak. They have not regretted the trade, exactly.",
    "{name} took the oracle's seat when the previous oracle's voice failed. The seat has not failed them yet.",
  ],
  publicMotiveTemplates: [
    "Speak the visions clearly when they come and accept the silence between them.",
    "Train an attendant who can serve as the voice when the visions become too heavy.",
  ],
  secretMotiveTemplates: [
    "Hide one specific vision from everyone — the one about how this all ends.",
    "Find the meaning of a recurring dream the god has not deigned to interpret.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting (formal)",
      lines: [
        "Approach. You are heard before you are seen here.",
        "The smoke is settling. Speak when the bell is silent.",
      ],
    },
    {
      topic: "Reading",
      lines: [
        "I see a road and on that road a closed door. The door is not the end. Look past it.",
        "Two of you walk away from this. I will not say which.",
        "The vision is dark. I will not lie to comfort. Be ready.",
      ],
    },
    {
      topic: "DM hidden vision",
      dmOnly: true,
      lines: [
        "(later, alone, voice low) The thing they hunt has worn a face they trust. I cannot say more without losing the thread.",
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// ADVENTURING
// ─────────────────────────────────────────────────────────────────

const mercenary: Archetype = {
  key: "mercenary",
  displayName: "Mercenary",
  category: "Adventuring",
  occupation: "Mercenary",
  suggestedClass: "Veteran (CR 3) or Knight (CR 3)",
  portraitPromptFragment:
    "scarred human mercenary in studded leather and chainmail, longsword across back, cold mountain pass behind",
  nameTable: {
    firstNames: [
      "Garrick", "Mira", "Brom", "Sela", "Donal", "Ulra", "Krell",
      "Iressa", "Vorn", "Saera",
    ],
    lastNames: [
      "Coldsteel", "Greyhand", "Ironvein", "Halloran", "Stormbar",
      "Of the Free Band", "Of the Black Company",
    ],
  },
  backstoryTemplates: [
    "{name} marched in three different banners and outlived two of them. They take coin now and ask only that the contract be honest.",
    "Once a knight in a small order that fell apart over a politics they refuse to discuss, {name} now sells sword-time to anyone with the price.",
  ],
  publicMotiveTemplates: [
    "Take a contract that pays well, ends quickly, and doesn't haunt them later.",
    "Save enough to buy a small farm in a valley they've been looking at.",
  ],
  secretMotiveTemplates: [
    "Avoid the captain of the company that left them for dead, who is rumored to be in the next town.",
    "Find the woman they lost in the war and never found a body for.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "If you've coin and a clean contract, sit. Otherwise we've nothing to say.",
        "I'm between work. Don't read more into that than's there.",
      ],
    },
    {
      topic: "Negotiating a contract",
      lines: [
        "Three gold a day, double on combat days, week minimum. Half up front.",
        "I don't kill anyone you can't name to me first. I don't need surprises.",
        "If the job changes en route, the price changes. That's not haggling, that's the rule.",
      ],
    },
    {
      topic: "On the road",
      lines: [
        "I'll take first watch. Wake me only if something's wrong. Don't wake me if it isn't.",
      ],
    },
  ],
};

const bountyHunter: Archetype = {
  key: "bounty-hunter",
  displayName: "Bounty Hunter",
  category: "Adventuring",
  occupation: "Bounty Hunter",
  suggestedClass: "Spy (CR 1) or Veteran (CR 3)",
  portraitPromptFragment:
    "lean human bounty hunter in a wide-brimmed hat and dark coat, manacles at hip, crossbow under arm, dusty tavern back room behind",
  nameTable: {
    firstNames: [
      "Vesh", "Quint", "Marek", "Sable", "Karn", "Iren", "Tully",
    ],
    lastNames: [
      "Greyhand", "Coldwater", "Lastword", "Halloran", "Of the Long List",
    ],
  },
  backstoryTemplates: [
    "{name} took up the work because the law in this country is slow and the bounties posted along the road are not.",
    "Once a watch sergeant in a city they no longer enter, {name} works alone and prefers the company of the warrants over the company of people.",
  ],
  publicMotiveTemplates: [
    "Bring in the next name on the list, alive if possible, without losing more than they're paid.",
  ],
  secretMotiveTemplates: [
    "The next name on the list is someone they once knew. They have not decided what they will do.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "I'm working. Whatever you came to say, say it short.",
        "(reads warrant) Heard of him? Anyone you've seen who matches?",
      ],
    },
    {
      topic: "Asking about a target",
      lines: [
        "Two silvers for honest information. Five if it leads to him. None for a story I can't check.",
        "He was here. Two days back. North door. Anyone leave with him?",
      ],
    },
  ],
};

const sage: Archetype = {
  key: "sage",
  displayName: "Sage",
  category: "Adventuring",
  occupation: "Scholar / Sage",
  suggestedClass: "Commoner (Expert, multiple knowledges)",
  portraitPromptFragment:
    "spectacled half-elf sage at a cluttered desk piled with maps and scrolls, quill in hand, candlelit study with tall bookshelves behind",
  nameTable: {
    firstNames: [
      "Magister Aelar", "Master Wenna", "Magister Yseult", "Master Theron",
      "Sage Halloran", "Master Pell",
    ],
    lastNames: [
      "Of the Outer Library", "Of the Quiet Reading Room", "Greyspell",
      "Of the Three Volumes", "Vesper",
    ],
  },
  backstoryTemplates: [
    "{name} was once attached to a noble house as tutor and fled it the night the lord's son set fire to the library.",
    "{name} has been writing the same book for fifteen years and is not yet ready to say what it is about.",
  ],
  publicMotiveTemplates: [
    "Finish the current research project before the patron's interest wanders.",
    "Acquire the rare manuscript a rival sage has been hoarding.",
  ],
  secretMotiveTemplates: [
    "Quietly translate a forbidden text and find a safe place to publish what they learn.",
    "Recover a lost volume from a ruin most maps have stopped marking.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Yes? (does not look up) Speak — I'm at a passage I won't lose lightly.",
        "Sit, sit. Mind the stack on the chair. That's a third edition, gentle.",
      ],
    },
    {
      topic: "Information request",
      lines: [
        "I can answer that. It will take a day in the books and cost three silvers in candles.",
        "I won't research that. The last person who asked is no longer breathing, and the question is the reason.",
        "I know the answer off the top of my head. Twenty gold and you can have it.",
      ],
    },
    {
      topic: "Lecture mode",
      lines: [
        "Now, this is interesting — most people misremember it as a single battle. There were in fact three, the third entirely fictional.",
      ],
    },
  ],
};

const bard: Archetype = {
  key: "bard",
  displayName: "Bard",
  category: "Adventuring",
  occupation: "Traveling Bard",
  suggestedClass: "Bard 3 or Spy (CR 1)",
  portraitPromptFragment:
    "charming half-elf bard with a lute at hip and a feathered hat, mid-laugh, candlelit tavern stage behind",
  nameTable: {
    firstNames: [
      "Quill", "Elara", "Vannik", "Lyra", "Renn", "Sela", "Donal",
      "Iresh",
    ],
    lastNames: [
      "Quickstep", "Of the Bright Reed", "Halloran", "Lutewise",
      "Brightvoice", "Songmend",
    ],
  },
  backstoryTemplates: [
    "{name} ran away from a respectable trade and has yet to regret it loudly enough to convince the family.",
    "Once trained at a college whose name they drop too often, {name} now travels the inn circuit and watches for material.",
  ],
  publicMotiveTemplates: [
    "Land the regular spot at the best inn in town for the rest of the season.",
    "Compose the one song that makes their name beyond this region.",
  ],
  secretMotiveTemplates: [
    "Carry messages between two parties on opposite sides of a conflict, for handsome but very deniable pay.",
    "Find the bard who stole their best song and confront them publicly.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Friends! Sit, sit, you're just in time — the next song is the good one.",
        "Coin in the hat or kindness in the eye, both welcome equally.",
      ],
    },
    {
      topic: "Performance request",
      lines: [
        "A copper for any tune you name, a silver for one you know I haven't played tonight.",
        "I'll play that, but only if everyone in this room buys their next round.",
      ],
    },
    {
      topic: "Information / gossip",
      lines: [
        "I hear things. Inns hear everything. For a drink and a kind word, I'll repeat what I trust.",
        "I won't say where I heard it. That's the only way I'll keep hearing it.",
      ],
    },
  ],
};

const alchemist: Archetype = {
  key: "alchemist",
  displayName: "Alchemist",
  category: "Adventuring",
  occupation: "Alchemist",
  suggestedClass: "Mage (CR 6) flavored as alchemy",
  portraitPromptFragment:
    "soot-cheeked human alchemist in a leather smock and goggles pushed up on forehead, bubbling glassware on a bench behind",
  nameTable: {
    firstNames: [
      "Sablen", "Pyrrha", "Vex", "Iren", "Karn", "Marra", "Pell",
    ],
    lastNames: [
      "Glassworks", "Of the Brass Retort", "Halloran", "Cinderwell",
      "Brewright", "Vesper",
    ],
  },
  backstoryTemplates: [
    "{name} blew up their first three workshops before learning patience. The fourth is still standing — for now.",
    "Trained by a master who specialized in poisons, {name} has worked for twenty years to be known instead for cures.",
  ],
  publicMotiveTemplates: [
    "Brew a healing draft that works as well as a temple's prayer at half the price.",
    "Sell enough vials this season to afford the rare reagents the dwarven trade caravan brings.",
  ],
  secretMotiveTemplates: [
    "Perfect a single batch of an old, banned formula — for personal reasons no one needs to know.",
    "Identify the source of a strange illness in the next town that nobody else has connected to alchemy.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Don't touch anything. Speak quickly, the timer is running.",
        "Welcome. Mind the green flask. Always mind the green flask.",
      ],
    },
    {
      topic: "Buying potions",
      lines: [
        "Healing draft, ten gold a vial. I won't go lower; the moss alone costs me eight.",
        "Antitoxin, three gold. Lasts a week if you don't open it. Two days if you do.",
        "I don't sell what you're asking after. Not to your face. Not at any price.",
      ],
    },
    {
      topic: "Custom commission",
      lines: [
        "I can brew that. Tendays, not days. Half up front, the rest on delivery.",
        "Bring me the petals and I'll halve the cost. Don't bring the petals, you pay double.",
      ],
    },
  ],
};

const sailor: Archetype = {
  key: "sailor",
  displayName: "Sailor",
  category: "Adventuring",
  occupation: "Sailor / Deckhand",
  suggestedClass: "Sailor / Bandit (CR 1/8)",
  portraitPromptFragment:
    "sun-leathered human sailor in a striped shirt and knit cap, coil of rope over shoulder, salt-stained dock behind",
  nameTable: {
    firstNames: [
      "Salt Tully", "Old Pell", "Mira", "Crom", "Hod", "Wend", "Brun",
    ],
    lastNames: [
      "Saltwise", "Lowtide", "Brinemark", "Driftwood", "Of the Fair Wind",
    ],
  },
  backstoryTemplates: [
    "{name} has worked five ships and outlived two of them. The sea, they say, is a fair employer if you don't ask it for kindness.",
  ],
  publicMotiveTemplates: [
    "Land a berth on a southbound ship before the storm season closes the harbor.",
  ],
  secretMotiveTemplates: [
    "Avoid the captain of their last ship, who has every reason to want them found.",
  ],
  dialogueTopics: [
    {
      topic: "Greeting",
      lines: [
        "Land legs feel strange yet. Get me a drink and I'll talk.",
        "What's it about, friend? I'm not on a ship for the first time in two months and I mean to enjoy it.",
      ],
    },
    {
      topic: "Sea / route info",
      lines: [
        "Southbound is bad this season. Pirates worse than usual. Merchants are paying double for guards.",
        "If you're after the islands, find Captain Vesh. She's honest by sea standards. Don't compare.",
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// ASSEMBLE
// ─────────────────────────────────────────────────────────────────

export const ARCHETYPES: Archetype[] = [
  // Town
  innkeeper,
  blacksmith,
  townGuard,
  merchant,
  stablemaster,
  herbalist,
  // Wilderness
  hunter,
  rangerScout,
  hedgeWitch,
  farmer,
  ferryman,
  // Underworld
  fence,
  beggar,
  thief,
  cultist,
  smugglerCaptain,
  // Court
  noble,
  guardCaptain,
  courtMage,
  butler,
  executioner,
  jailer,
  // Temple
  priest,
  acolyte,
  oracle,
  // Adventuring
  mercenary,
  bountyHunter,
  sage,
  bard,
  alchemist,
  sailor,
];

export const ARCHETYPES_BY_KEY: Record<string, Archetype> = Object.fromEntries(
  ARCHETYPES.map((a) => [a.key, a]),
);
