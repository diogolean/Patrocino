import { describe, expect, it } from "vitest";
import {
  characterVariation,
  emblems,
  frameMetals,
  grounds,
  hashUserId,
  patterns,
} from "../../apps/web/lib/character-card";

describe("character card variation", () => {
  it("derives a stable card from the user id", () => {
    const first = characterVariation("cmviu2opu00wsru2lfry7svky");
    const again = characterVariation("cmviu2opu00wsru2lfry7svky");
    expect(again).toEqual(first);
    expect(first.hash).toBe(hashUserId("cmviu2opu00wsru2lfry7svky"));
    expect(frameMetals.map((metal) => metal.id)).toContain(first.frame.id);
    expect(grounds.map((ground) => ground.id)).toContain(first.ground.id);
    expect(patterns).toContain(first.pattern);
    expect(emblems).toContain(first.emblem);
    expect(first.titleIndex).toBeGreaterThanOrEqual(0);
    expect(first.titleIndex).toBeLessThan(6);
  });

  it("changes frame, emblem, ground, or pattern for a different id", () => {
    const ids = ["fan-1", "fan-2", "creator-luna", "affiliate-ezequiel", "admin-root", "guest-9"];
    const cards = ids.map((id) => characterVariation(id));
    const signatures = new Set(cards.map((card) => `${card.frame.id}|${card.emblem}|${card.ground.id}|${card.pattern}|${card.titleIndex}`));
    expect(signatures.size).toBeGreaterThan(1);
    expect(new Set(cards.map((card) => card.frame.id)).size).toBeGreaterThan(1);
    expect(new Set(cards.map((card) => card.emblem)).size).toBeGreaterThan(1);
    expect(new Set(cards.map((card) => card.pattern)).size).toBeGreaterThan(1);
    expect(new Set(cards.map((card) => card.ground.id)).size).toBeGreaterThan(1);
  });
});
