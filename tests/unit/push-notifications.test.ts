import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildMessagePushPayload,
  deliverPush,
  isPushEndpoint,
  publicVapid,
  pushStatusCode,
  pushSubscriptionGone,
  readVapidConfig,
} from "../../apps/api/src/modules/notifications/push";
import { urlBase64ToUint8Array } from "../../apps/web/lib/message-notifications";

const publicKey = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

describe("web push", () => {
  it("stays off unless the three VAPID variables are set", () => {
    expect(readVapidConfig({})).toBeNull();
    expect(readVapidConfig({ VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" })).toBeNull();
    expect(
      readVapidConfig({
        VAPID_PUBLIC_KEY: " pub ",
        VAPID_PRIVATE_KEY: " priv ",
        VAPID_SUBJECT: "not-a-url",
      }),
    ).toBeNull();
    const config = readVapidConfig({
      VAPID_PUBLIC_KEY: " pub ",
      VAPID_PRIVATE_KEY: " priv ",
      VAPID_SUBJECT: " mailto:no-reply@patrocino.com ",
    });
    expect(config).toEqual({
      publicKey: "pub",
      privateKey: "priv",
      subject: "mailto:no-reply@patrocino.com",
    });
    expect(publicVapid(config)).toEqual({ enabled: true, publicKey: "pub" });
    expect(publicVapid(null)).toEqual({ enabled: false, publicKey: null });
    expect(Object.keys(publicVapid(config))).toEqual(["enabled", "publicKey"]);
  });

  it("names the creator and opens the conversation", () => {
    const payload = buildMessagePushPayload({
      creatorName: " Luna ",
      body: "Oi\nsumida",
      creatorId: "creator-1",
      icon: "x".repeat(600),
    });
    expect(payload.title).toBe("Luna");
    expect(payload.body).toBe("Oi sumida");
    expect(payload.url).toBe("/chat/creator-1");
    expect(payload.icon).toBe("/icons/icon-192.png");
    expect(buildMessagePushPayload({ creatorName: " ", body: " ", creatorId: "c" }).body).toBe("Nova mensagem");
  });

  it("drops subscriptions that the push service has forgotten", async () => {
    const removed: string[] = [];
    const sent: string[] = [];
    const result = await deliverPush({
      subscriptions: [
        { id: "gone", endpoint: "https://push.example/gone", p256dh: "p", auth: "a" },
        { id: "ok", endpoint: "https://push.example/ok", p256dh: "p", auth: "a" },
        { id: "busy", endpoint: "https://push.example/busy", p256dh: "p", auth: "a" },
        { id: "expired", endpoint: "https://push.example/expired", p256dh: "p", auth: "a" },
      ],
      payload: buildMessagePushPayload({ creatorName: "Luna", body: "Oi", creatorId: "luna" }),
      send: async (subscription, body) => {
        const parsed = JSON.parse(body) as { title: string; url: string };
        expect(parsed.title).toBe("Luna");
        expect(parsed.url).toBe("/chat/luna");
        sent.push(subscription.endpoint);
        if (subscription.endpoint.endsWith("/gone")) throw { statusCode: 404 };
        if (subscription.endpoint.endsWith("/expired")) throw Object.assign(new Error("gone"), { statusCode: 410 });
        if (subscription.endpoint.endsWith("/busy")) throw { statusCode: 500 };
      },
      remove: async (id) => {
        if (id === "expired") throw new Error("already gone");
        removed.push(id);
      },
    });
    expect(result).toEqual({ sent: 1, removed: 2 });
    expect(removed).toEqual(["gone"]);
    expect(sent).toHaveLength(4);
    expect(pushSubscriptionGone(404)).toBe(true);
    expect(pushSubscriptionGone(410)).toBe(true);
    expect(pushSubscriptionGone(500)).toBe(false);
    expect(pushStatusCode(new Error("nope"))).toBeUndefined();
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("https://user:pass@push.example/abc")).toBe(false);
  });

  it("registers a service worker that opens the conversation", () => {
    const worker = readFileSync(new URL("../../apps/web/public/sw.js", import.meta.url), "utf8");
    expect(worker).toContain("showNotification");
    expect(worker).toContain("notificationclick");
    expect(worker).toContain("openWindow");
    expect(urlBase64ToUint8Array(publicKey)).toHaveLength(65);
    const manifest = JSON.parse(readFileSync(new URL("../../apps/web/public/manifest.webmanifest", import.meta.url), "utf8")) as {
      display: string;
      start_url: string;
    };
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/feed");
    const pt = JSON.parse(readFileSync(new URL("../../apps/web/messages/pt-BR.json", import.meta.url), "utf8")) as {
      notifications: { iosHint: string };
    };
    expect(pt.notifications.iosHint).toBe("Adicione à tela inicial para receber notificações");
  });
});
