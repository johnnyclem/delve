import { useMemo, useState } from "react";
import { Copy, Check } from "@/components/ui/pixel-icons";
import { Button } from "@/components/ui/button";

type DiffOp = "equal" | "add" | "remove";

interface DiffRow {
  left: { lineNo: number | null; text: string; op: DiffOp };
  right: { lineNo: number | null; text: string; op: DiffOp };
}

function computeLcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  return dp;
}

function buildDiffRows(leftText: string, rightText: string): DiffRow[] {
  const leftLines = leftText.split("\n");
  const rightLines = rightText.split("\n");
  const dp = computeLcs(leftLines, rightLines);
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  const m = leftLines.length;
  const n = rightLines.length;

  while (i < m && j < n) {
    if (leftLines[i] === rightLines[j]) {
      rows.push({
        left: { lineNo: i + 1, text: leftLines[i], op: "equal" },
        right: { lineNo: j + 1, text: rightLines[j], op: "equal" },
      });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({
        left: { lineNo: i + 1, text: leftLines[i], op: "remove" },
        right: { lineNo: null, text: "", op: "remove" },
      });
      i++;
    } else {
      rows.push({
        left: { lineNo: null, text: "", op: "add" },
        right: { lineNo: j + 1, text: rightLines[j], op: "add" },
      });
      j++;
    }
  }
  while (i < m) {
    rows.push({
      left: { lineNo: i + 1, text: leftLines[i], op: "remove" },
      right: { lineNo: null, text: "", op: "remove" },
    });
    i++;
  }
  while (j < n) {
    rows.push({
      left: { lineNo: null, text: "", op: "add" },
      right: { lineNo: j + 1, text: rightLines[j], op: "add" },
    });
    j++;
  }
  return rows;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs text-amber-200/90 hover:bg-amber-500/20"
      onClick={handleCopy}
      data-testid={`button-copy-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
      {copied ? "Copied" : `Copy ${label}`}
    </Button>
  );
}

interface NotesDiffViewProps {
  localText: string;
  serverText: string;
}

export function NotesDiffView({ localText, serverText }: NotesDiffViewProps) {
  const rows = useMemo(() => buildDiffRows(localText, serverText), [localText, serverText]);

  const cellClass = (op: DiffOp, side: "left" | "right") => {
    if (op === "equal") return "bg-transparent text-foreground/80";
    if (side === "left" && op === "remove") return "bg-rose-500/15 text-rose-200";
    if (side === "right" && op === "add") return "bg-emerald-500/15 text-emerald-200";
    return "bg-transparent text-muted-foreground/40";
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-background/40" data-testid="diff-view">
      <div className="grid grid-cols-2 border-b border-amber-500/30 text-xs">
        <div className="flex items-center justify-between px-3 py-2 border-r border-amber-500/30">
          <span className="font-semibold text-amber-200">Your local changes</span>
          <CopyButton text={localText} label="local" />
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="font-semibold text-amber-200">Server version</span>
          <CopyButton text={serverText} label="server" />
        </div>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full font-mono text-xs">
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="align-top">
                <td className="w-10 select-none px-2 py-0.5 text-right text-muted-foreground/50 border-r border-amber-500/10">
                  {row.left.lineNo ?? ""}
                </td>
                <td className={`px-2 py-0.5 whitespace-pre-wrap break-words border-r border-amber-500/30 ${cellClass(row.left.op, "left")}`}>
                  {row.left.text || "\u00A0"}
                </td>
                <td className="w-10 select-none px-2 py-0.5 text-right text-muted-foreground/50 border-r border-amber-500/10">
                  {row.right.lineNo ?? ""}
                </td>
                <td className={`px-2 py-0.5 whitespace-pre-wrap break-words ${cellClass(row.right.op, "right")}`}>
                  {row.right.text || "\u00A0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
