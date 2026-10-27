import { describe, expect, it } from "vitest";
import { messagePreview } from "../../apps/api/src/modules/notifications/preview";
import {
  activeCreatorKey,
  freshMessages,
  matchesOpenCreator,
  needsHomeScreenInstall,
  openCreatorKey,
  UNREAD_POLL_MS,
} from "../../apps/web/lib/message-notifications";
import { unreadBadge } from "../../apps/web/lib/unread-store";

describe("message alerts", () => {
  it("polls a few times a minute and badges the nav", () => {
    expect(UNREAD_POLL_MS).toBeGreaterThanOrEqual(10_000);
    expect(UNREAD_POLL_MS).toBeLessThanOrEqual(15_000);
    expect(unreadBadge(1)).toBe("1");
    expect(unreadBadge(9)).toBe("9");
    expect(unreadBadge(12)).toBe("9+");
  });

  it("previews a message on one line", () => {
    expect(messagePreview("  oi\n  sumida  ")).toBe("oi sumida");
    const long = "a".repeat(180);
    expect(messagePreview(long).endsWith("…")).toBe(true);
    expect(messagePreview(long).length).toBeLessThanOrEqual(140);
  });

  it("toasts only new messages outside the open conversation", () => {
    const items = [
      { id: "1", creatorId: "luna", creatorUsername: "luna" },
      { id: "2", creatorId: "maya", creatorUsername: "maya" },
      { id: "3", creatorId: "maya", creatorUsername: "maya" },
      { id: "4", creatorId: "bia", creatorUsername: "bia" },
      { id: "5", creatorId: "bia", creatorUsername: "bia" },
    ];
    const seen = new Set(["1"]);
    const open = freshMessages(items, seen, "maya");
    expect(open.opened.map((item) => item.id)).toEqual(["2", "3"]);
    expect(open.visible.map((item) => item.id)).toEqual(["4", "5"]);
    expect(freshMessages(items, seen, null).visible).toHaveLength(3);
    expect(matchesOpenCreator({ creatorId: "c1", creatorUsername: "luna" }, "luna")).toBe(true);
    expect(openCreatorKey("/chat/luna")).toBe("luna");
    expect(openCreatorKey("/chat")).toBeNull();
    expect(openCreatorKey("/feed")).toBeNull();
    expect(activeCreatorKey("/feed", "sarah-mitchell")).toBe("sarah-mitchell");
    expect(activeCreatorKey("/chat/luna", "sarah-mitchell")).toBe("luna");
    expect(activeCreatorKey("/chat", null)).toBeNull();
  });

  it("asks for the home screen only on iOS outside the installed app", () => {
    expect(
      needsHomeScreenInstall({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", standalone: false }),
    ).toBe(true);
    expect(
      needsHomeScreenInstall({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
        standalone: true,
      }),
    ).toBe(false);
    expect(needsHomeScreenInstall({ userAgent: "Mozilla/5.0 (Macintosh)", standalone: false, maxTouchPoints: 0 })).toBe(
      false,
    );
    expect(
      needsHomeScreenInstall({ userAgent: "Mozilla/5.0 (Macintosh)", standalone: false, maxTouchPoints: 5 }),
    ).toBe(true);
  });
});
