import { expect, test } from "vitest";
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER, clientIpFrom, upstreamAuthHeaders } from "./client-ip";

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

test("client ip trusts only the proxy hop in X-Forwarded-For", () => {
  expect(clientIpFrom(headers({ "cf-connecting-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.1" }))).toBe("198.51.100.1");
  expect(clientIpFrom(headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.8" }))).toBe("10.0.0.8");
  expect(clientIpFrom(headers({ "cf-connecting-ip": "203.0.113.8" }))).toBeUndefined();
  expect(clientIpFrom(headers({ "x-forwarded-for": "not an ip" }))).toBeUndefined();
});

test("upstream headers include the proxy secret only when it is configured", () => {
  const previous = process.env.INTERNAL_PROXY_SECRET;
  process.env.INTERNAL_PROXY_SECRET = "local-secret";
  const forwarded = upstreamAuthHeaders({ headers: headers({ "x-forwarded-for": "203.0.113.9, 10.1.1.1" }) });
  expect(forwarded[CLIENT_IP_HEADER]).toBe("10.1.1.1");
  expect(forwarded[PROXY_SECRET_HEADER]).toBe("local-secret");
  delete process.env.INTERNAL_PROXY_SECRET;
  expect(upstreamAuthHeaders({ headers: headers({ "cf-connecting-ip": "2001:db8::1" }) })[PROXY_SECRET_HEADER]).toBeUndefined();
  if (previous === undefined) delete process.env.INTERNAL_PROXY_SECRET;
  else process.env.INTERNAL_PROXY_SECRET = previous;
});
