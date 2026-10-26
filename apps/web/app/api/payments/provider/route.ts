export const dynamic = "force-dynamic";

export function GET() {
  const provider = process.env.PAYMENTS_PROVIDER === "expay" ? "expay" : "demo";
  return Response.json({ provider });
}
