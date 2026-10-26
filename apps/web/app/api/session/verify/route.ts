import { apiAuth } from "@/lib/api-auth";

// Relative Location so the browser keeps the public host (patrocino.com).
// request.url inside the container is the internal bind address (0.0.0.0:3333).
function redirectToSignIn(verified: "0" | "1") {
  return new Response(null, {
    status: 307,
    headers: { Location: `/auth?route=sign-in&verified=${verified}` },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return redirectToSignIn("0");
  const { response } = await apiAuth("/auth/verify-email", { token }, request);
  return redirectToSignIn(response.ok ? "1" : "0");
}
