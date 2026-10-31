import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { afterAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import {
  GOOGLE_CALLBACK_URL,
  GOOGLE_SCOPES,
  accountForGoogleProfile,
  fetchGoogleProfile,
  googleAuthorizeUrl,
  googleConfigured,
  readGoogleState,
  signGoogleState,
} from "../../apps/api/src/modules/auth/google-oauth";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const env = {
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  JWT_ACCESS_SECRET: "google-state-secret",
};

function googleFetch(profile: { sub: string; email: string; email_verified: boolean; name: string }) {
  return async (url: string, init?: RequestInit) => {
    if (url.includes("oauth2.googleapis.com/token")) {
      const body = String(init?.body ?? "");
      expect(body).toContain("client_secret=test-secret");
      expect(body).toContain(encodeURIComponent(GOOGLE_CALLBACK_URL));
      return new Response(JSON.stringify({ access_token: "token-1" }), { status: 200 });
    }
    expect(url).toContain("openidconnect.googleapis.com/v1/userinfo");
    return new Response(JSON.stringify(profile), { status: 200 });
  };
}

describe("Google sign-in", () => {
  const emails: string[] = [];

  afterAll(async () => {
    if (emails.length) await database.user.deleteMany({ where: { email: { in: emails } } });
    await database.$disconnect();
  });

  it("stays hidden until both environment values are set", () => {
    expect(googleConfigured({})).toBe(false);
    expect(googleConfigured({ GOOGLE_CLIENT_ID: "id" })).toBe(false);
    expect(googleConfigured(env)).toBe(true);
  });

  it("asks Google for openid, email, and profile at the production callback", () => {
    const state = signGoogleState({ next: "/checkout?kind=post&id=1", role: "FAN", clickId: "clk" }, env);
    const url = new URL(googleAuthorizeUrl({ clientId: env.GOOGLE_CLIENT_ID, state }));
    expect(url.searchParams.get("redirect_uri")).toBe(GOOGLE_CALLBACK_URL);
    expect(url.searchParams.get("scope")).toBe(GOOGLE_SCOPES);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(readGoogleState(state, env)?.next).toBe("/checkout?kind=post&id=1");
    expect(readGoogleState(`${state}x`, env)).toBeNull();
  });

  it("creates an account, links a verified email, and keeps the affiliate click", async () => {
    const email = `google-${suffix}@patrocino.test`;
    emails.push(email);
    const profile = await fetchGoogleProfile({
      code: "code-1",
      env,
      fetchImpl: googleFetch({ sub: `sub-${suffix}`, email, email_verified: true, name: "Pessoa Google" }),
    });
    expect(profile?.emailVerified).toBe(true);
    const state = readGoogleState(signGoogleState({ next: "/checkout?kind=pack&id=pack", role: "FAN", clickId: null }, env), env)!;
    const created = await accountForGoogleProfile(profile!, state);
    expect(created.created).toBe(true);
    expect(created.user?.emailVerifiedAt).toBeTruthy();

    const again = await accountForGoogleProfile(profile!, state);
    expect(again.created).toBe(false);
    expect(again.user?.id).toBe(created.user?.id);

    const unverified = await fetchGoogleProfile({
      code: "code-2",
      env,
      fetchImpl: googleFetch({ sub: `sub-2-${suffix}`, email: `other-${suffix}@patrocino.test`, email_verified: false, name: "Não" }),
    });
    expect((await accountForGoogleProfile(unverified!, state)).error).toBe("unverified_email");

    const localEmail = `local-${suffix}@patrocino.test`;
    emails.push(localEmail);
    await database.user.create({
      data: { email: localEmail, passwordHash: "test-only", role: "FAN", emailVerifiedAt: new Date() },
    });
    const linked = await accountForGoogleProfile(
      { sub: `sub-local-${suffix}`, email: localEmail, emailVerified: true, name: "Já existe" },
      state,
    );
    expect(linked.created).toBe(false);
    expect(linked.user?.googleSub).toBe(`sub-local-${suffix}`);

    const openEmail = `open-${suffix}@patrocino.test`;
    emails.push(openEmail);
    await database.user.create({ data: { email: openEmail, passwordHash: "test-only", role: "FAN" } });
    expect((await accountForGoogleProfile(
      { sub: `sub-open-${suffix}`, email: openEmail, emailVerified: true, name: "Aberta" },
      state,
    )).error).toBe("unverified_account");
  });
});