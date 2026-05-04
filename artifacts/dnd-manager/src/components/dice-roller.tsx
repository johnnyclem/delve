import { useState } from "react";
import { Dice5 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRollDice, useGetRecentRolls, getGetRecentRollsQueryKey } from "@workspace/api-client-react";
import type { DiceRoll, DiceRollBreakdown } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const quickRolls = [
  { label: "d4", expr: "1d4" },
  { label: "d6", expr: "1d6" },
  { label: "d8", expr: "1d8" },
  { label: "d10", expr: "1d10" },
  { label: "d12", expr: "1d12" },
  { label: "d20", expr: "1d20" },
  { label: "d100", expr: "1d100" },
  { label: "2d6", expr: "2d6" },
  { label: "4d6", expr: "4d6" },
];

interface BreakdownRoll {
  die: string;
  results: number[];
}

interface ParsedBreakdown {
  rolls?: BreakdownRoll[];
  modifier?: number;
}

export default function DiceRollerPanel() {
  const [expression, setExpression] = useState("1d20");
  const [label, setLabel] = useState("");
  const [lastResult, setLastResult] = useState<{ result: number; expression: string; breakdown: ParsedBreakdown } | null>(null);
  const queryClient = useQueryClient();

  const rollMutation = useRollDice();
  const { data: recentRolls, isLoading } = useGetRecentRolls();

  const handleRoll = (expr?: string) => {
    const rollExpr = expr ?? expression;
    if (!rollExpr.trim()) return;

    rollMutation.mutate(
      { data: { expression: rollExpr, label: label || null } },
      {
        onSuccess: (data) => {
          setLastResult({ result: data.result, expression: data.expression, breakdown: data.breakdown as ParsedBreakdown });
          queryClient.invalidateQueries({ queryKey: getGetRecentRollsQueryKey() });
        },
      },
    );
  };

  return (
    <div className="space-y-6" data-testid="dice-roller-panel">
      <h2 className="font-serif text-2xl font-bold text-foreground flex items-center gap-2">
        <Dice5 className="h-6 w-6 text-primary" />
        Dice Roller
      </h2>

      {lastResult && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 text-center" data-testid="dice-result">
          <p className="text-sm text-muted-foreground mb-1">{lastResult.expression}</p>
          <p className="font-serif text-5xl font-bold text-primary" data-testid="text-dice-result">{lastResult.result}</p>
          {lastResult.breakdown?.rolls?.map((r, i) => (
            <p key={i} className="text-xs text-muted-foreground mt-1">
              {r.die}: [{r.results.join(", ")}]
            </p>
          ))}
          {lastResult.breakdown?.modifier !== undefined && lastResult.breakdown.modifier !== 0 && (
            <p className="text-xs text-muted-foreground">
              Modifier: {lastResult.breakdown.modifier > 0 ? "+" : ""}{lastResult.breakdown.modifier}
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="e.g. 2d6+3"
            className="font-mono"
            onKeyDown={(e) => e.key === "Enter" && handleRoll()}
            data-testid="input-dice-expression"
          />
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="max-w-[160px]"
            data-testid="input-dice-label"
          />
          <Button onClick={() => handleRoll()} disabled={rollMutation.isPending} data-testid="button-roll">
            Roll
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {quickRolls.map((qr) => (
            <Button
              key={qr.expr}
              variant="secondary"
              size="sm"
              onClick={() => handleRoll(qr.expr)}
              disabled={rollMutation.isPending}
              data-testid={`button-quick-roll-${qr.label}`}
            >
              {qr.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-5">
        <h3 className="font-semibold text-card-foreground text-sm mb-3">Recent Rolls</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !recentRolls?.length ? (
          <p className="text-sm text-muted-foreground">No rolls yet. Roll some dice!</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-auto">
            {(recentRolls as DiceRoll[]).map((roll) => (
              <div key={roll.id} className="flex items-center justify-between text-sm py-1 border-b border-border/20 last:border-0" data-testid={`recent-roll-${roll.id}`}>
                <div>
                  <span className="text-foreground font-medium">{roll.displayName}</span>
                  <span className="text-muted-foreground"> rolled </span>
                  <span className="font-mono text-foreground">{roll.expression}</span>
                  {roll.label && <span className="text-muted-foreground text-xs ml-1">({roll.label})</span>}
                </div>
                <span className="font-mono font-bold text-foreground text-base">{roll.result}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
