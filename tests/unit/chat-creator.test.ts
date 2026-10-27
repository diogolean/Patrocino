import { describe, expect, it } from "vitest";
import { creators } from "../../apps/web/lib/fixtures";
import { messageBodyParts, resolveChatCreator } from "../../apps/web/lib/chat-creator";

describe("chat creator identity", () => {
  it("does not paint another creator when the route id is a database id", () => {
    expect(creators[0]?.username).toBe("albina-schneider");
    expect(resolveChatCreator(creators, "cmvq0msls0001nw01dyc84rrn")).toBeNull();
    expect(resolveChatCreator(creators, "sarah-mitchell")?.name).toBe("Sarah Mitchell");
    const parts = messageBodyParts("Abre a aba Vídeos: /creator/sarah-mitchell?tab=videos. Pedido: /creator/sarah-mitchell?pedido=especial.");
    expect(parts.filter((part) => part.kind === "link").map((part) => part.value)).toEqual([
      "/creator/sarah-mitchell?tab=videos",
      "/creator/sarah-mitchell?pedido=especial",
    ]);
  });
});
