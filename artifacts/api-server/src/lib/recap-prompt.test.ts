import { describe, it, expect } from "vitest";
import { buildRecapUserPrompt } from "./recap-prompt";

describe("buildRecapUserPrompt", () => {
  it("omits the attendees block when no attendees are supplied", () => {
    const out = buildRecapUserPrompt(3, "Into the Mines", "We fought a goblin.");
    expect(out).toContain('Session 3: "Into the Mines"');
    expect(out).toContain("DM Notes");
    expect(out).not.toContain("Attendees");
    expect(out).not.toContain("Players present");
  });

  it("omits the attendees block when the list is empty", () => {
    const out = buildRecapUserPrompt(1, "Test", "notes", []);
    expect(out).not.toContain("Attendees");
  });

  it("includes 'Players present' line only when PCs are present", () => {
    const out = buildRecapUserPrompt(1, "Test", "notes", [
      { kind: "npc", name: "Brogg" },
    ]);
    expect(out).toContain("NPCs encountered: Brogg");
    expect(out).not.toContain("Players present");
  });

  it("groups attendees by kind and joins names with commas", () => {
    const out = buildRecapUserPrompt(2, "Caverns", "notes", [
      { kind: "pc", name: "Lyra" },
      { kind: "pc", name: "Thorin" },
      { kind: "npc", name: "Innkeeper Brogg" },
      { kind: "npc", name: "Captain Vex" },
    ]);
    expect(out).toContain("Players present: Lyra, Thorin");
    expect(out).toContain("NPCs encountered: Innkeeper Brogg, Captain Vex");
    // Attendees block must come BEFORE the DM notes block so the model
    // reads the cast list before parsing the notes.
    const attendeesIdx = out.indexOf("Attendees");
    const notesIdx = out.indexOf("DM Notes");
    expect(attendeesIdx).toBeGreaterThan(-1);
    expect(notesIdx).toBeGreaterThan(attendeesIdx);
  });
});
