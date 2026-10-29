import { apiAuth } from "@/lib/api-auth";
import { verificationLanding } from "@/lib/auth-return";

// Relative Location so the browser keeps the public host (patrocino.com).
// request.url inside the container is the internal bind address (0.0.0.0:3333).
function redirectTo(location: string) {
  return new Response(null, {
    status: 307,
    headers: { Location: location },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const next = url.searchParams.get("next");
  if (!token) return redirectTo(verificationLanding(false, next));
  const { response } = await apiAuth("/auth/verify-email", { token }, request);
  return redirectTo(verificationLanding(response.ok, next));
}
