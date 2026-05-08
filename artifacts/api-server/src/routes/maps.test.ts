import { describe, it, expect } from "vitest";
import { applyFogFilter } from "./maps";
import type { MapTile, MapToken } from "@workspace/db";

const tiles: MapTile[] = [
  { index: 0, type: "stone", revealed: true },
  { index: 1, type: "wall", revealed: false },
  { index: 2, type: "water", revealed: true },
  { index: 3, type: "pit", revealed: false },
];

const tokens: MapToken[] = [
  { id: "tkn1", index: 1, type: "monster", emoji: "🐉", color: "bg-red-600", label: "Monster", name: "Dragon" },
  { id: "tkn2", index: 2, type: "player", emoji: "🧙‍♂️", color: "bg-blue-600", label: "Players", name: "Wizard" },
];

describe("applyFogFilter", () => {
  it("returns map unchanged for the DM", () => {
    const out = applyFogFilter({ tiles, tokens }, true);
    expect(out.tiles).toEqual(tiles);
    expect(out.tokens).toEqual(tokens);
  });

  it("nulls out unrevealed tile types AND forces revealed=true for non-DMs", () => {
    const out = applyFogFilter({ tiles, tokens }, false);
    expect(out.tiles[0]).toEqual({ index: 0, type: "stone", revealed: true });
    // Unrevealed tiles must be normalized so the client cannot infer fog state
    // from a `revealed:false` flag — type is nulled and revealed is forced true.
    expect(out.tiles[1]).toEqual({ index: 1, type: null, revealed: true });
    expect(out.tiles[2]).toEqual({ index: 2, type: "water", revealed: true });
    expect(out.tiles[3]).toEqual({ index: 3, type: null, revealed: true });
  });

  it("leaves tokens visible even when sitting on unrevealed tiles", () => {
    const out = applyFogFilter({ tiles, tokens }, false);
    // Token at index 1 sits on an unrevealed tile but should still be returned in full.
    const monsterOnDarkTile = out.tokens.find((t) => t.index === 1);
    expect(monsterOnDarkTile).toBeDefined();
    expect(monsterOnDarkTile?.emoji).toBe("🐉");
    expect(out.tokens).toHaveLength(2);
  });

  it("does not mutate the input tiles array", () => {
    const snapshot = JSON.parse(JSON.stringify(tiles));
    applyFogFilter({ tiles, tokens }, false);
    expect(tiles).toEqual(snapshot);
  });
});
