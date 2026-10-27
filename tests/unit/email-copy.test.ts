import { describe, expect, it } from "vitest";
import { verificationEmail } from "../../apps/api/src/modules/auth/email-copy";
import { pushPreviewFallback } from "../../apps/api/src/modules/notifications/push";
import { undismissedPreviews } from "../../apps/web/lib/message-notifications";

describe("localized mail and push", () => {
  it("translates the confirmation email and falls back to Portuguese", () => {
    expect(verificationEmail("es", "https://patrocino.com/verify").subject).toMatch(/correo/i);
    expect(verificationEmail("de", "https://patrocino.com/verify").html).toContain("https://patrocino.com/verify");
    expect(verificationEmail("fr", "https://patrocino.com/verify").subject).toMatch(/e-mail/i);
    expect(verificationEmail(null, "https://patrocino.com/verify").subject).toMatch(/e-mail no Patrocino/);
  });

  it("translates the empty push body for the fan locale", () => {
    expect(pushPreviewFallback("pt-BR")).toBe("Nova mensagem");
    expect(pushPreviewFallback(undefined)).toBe("Nova mensagem");
    expect(pushPreviewFallback("en")).toBe("New message");
    expect(pushPreviewFallback("es")).toBe("Mensaje nuevo");
    expect(pushPreviewFallback("de")).toBe("Neue Nachricht");
    expect(pushPreviewFallback("fr")).toBe("Nouveau message");
  });

  it("shows an unread preview again only when the message id is new", () => {
    const first = { id: "m1", preview: "oi" };
    const next = { id: "m2", preview: "novo" };
    const dismissed = new Set(["m1"]);
    expect(undismissedPreviews([first, next], dismissed).map((item) => item.id)).toEqual(["m2"]);
  });
});