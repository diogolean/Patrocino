import { describe, expect, it } from "vitest";
import {
  chatSequenceJobPlan,
  chatSequenceSeedAction,
  defaultChatSequenceSteps,
  legacyChatSequenceSteps,
  renderChatSequence,
} from "./chat-sequence";

const DAY = 24 * 60;

describe("default chat sequence", () => {
  it("schedules the launch offsets and then repeats every 21 days", () => {
    const once = defaultChatSequenceSteps.filter((step) => !step.recurring);
    const pool = defaultChatSequenceSteps.filter((step) => step.recurring);
    expect(once.map((step) => step.delayMinutes)).toEqual([0, 2, 10, 30, 120, 360, 720, 1080, 1320, 2 * DAY, 7 * DAY]);
    expect(pool.length).toBeGreaterThan(1);
    expect(pool.every((step) => step.delayMinutes === 21 * DAY)).toBe(true);
    const bodies = defaultChatSequenceSteps.map((step) => step.bodyTemplate);
    expect(new Set(bodies).size).toBe(bodies.length);
    for (const step of defaultChatSequenceSteps) {
      expect(step.bodyTemplate).toContain("{videosUrl}");
      expect(step.bodyTemplate).toContain("{requestUrl}");
      expect(step.bodyTemplate).toMatch(/pedido especial/i);
      expect(step.bodyTemplate.toLowerCase()).not.toMatch(/equipe|\bbot\b|automático|automatico/);
    }
    const started = new Date("2026-10-27T12:00:00.000Z");
    const plan = chatSequenceJobPlan(defaultChatSequenceSteps, started);
    expect(plan).toHaveLength(once.length + 1);
    expect(plan[0]?.runAt.toISOString()).toBe(started.toISOString());
    expect(plan[1]?.runAt.toISOString()).toBe(new Date(started.getTime() + 2 * 60_000).toISOString());
    expect(plan.at(-1)?.position).toBe(pool[0]?.position);
    expect(plan.at(-1)?.runAt.toISOString()).toBe(new Date(started.getTime() + (7 + 21) * DAY * 60_000).toISOString());
  });

  it("upgrades an untouched legacy sequence and keeps a creator edit", () => {
    expect(chatSequenceSeedAction(null)).toBe("insert");
    expect(chatSequenceSeedAction(legacyChatSequenceSteps)).toBe("upgrade");
    expect(chatSequenceSeedAction(defaultChatSequenceSteps)).toBe("keep");
    const edited = legacyChatSequenceSteps.map((step, index) => (index === 0 ? { ...step, bodyTemplate: "Texto da criadora." } : step));
    expect(chatSequenceSeedAction(edited)).toBe("keep");
    const rendered = renderChatSequence(defaultChatSequenceSteps[0]?.bodyTemplate ?? "", {
      fanName: "Marina",
      creatorName: "Sarah Mitchell",
      videosUrl: "/creator/sarah-mitchell?tab=videos",
      requestUrl: "/creator/sarah-mitchell?pedido=especial",
    });
    expect(rendered).toContain("Marina");
    expect(rendered).toContain("Sarah Mitchell");
    expect(rendered).toContain("/creator/sarah-mitchell?tab=videos");
    expect(rendered).toContain("/creator/sarah-mitchell?pedido=especial");
  });
});
