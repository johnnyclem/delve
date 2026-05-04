interface DiceResult {
  total: number;
  breakdown: {
    rolls: { die: string; results: number[] }[];
    modifier: number;
  };
}

function rollSingleDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function parseDiceExpression(expression: string): DiceResult {
  const cleaned = expression.replace(/\s/g, "").toLowerCase();

  const dicePattern = /(\d*)d(\d+)/g;
  const rolls: { die: string; results: number[] }[] = [];
  let total = 0;

  let remaining = cleaned;
  let match;

  while ((match = dicePattern.exec(cleaned)) !== null) {
    const count = match[1] ? parseInt(match[1], 10) : 1;
    const sides = parseInt(match[2], 10);

    if (count > 100 || sides > 1000) {
      throw new Error("Dice values too large");
    }

    const results: number[] = [];
    for (let i = 0; i < count; i++) {
      const roll = rollSingleDie(sides);
      results.push(roll);
      total += roll;
    }

    rolls.push({ die: `d${sides}`, results });
    remaining = remaining.replace(match[0], "");
  }

  if (rolls.length === 0) {
    throw new Error("Invalid dice expression");
  }

  let modifier = 0;
  const modMatch = remaining.match(/([+-]\d+)/);
  if (modMatch) {
    modifier = parseInt(modMatch[1], 10);
    total += modifier;
  }

  return {
    total,
    breakdown: { rolls, modifier },
  };
}
