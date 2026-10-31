import { NextResponse } from "next/server";
import { googleAuthorizeUrl } from "@/lib/google-start";

export async function GET(request: Request) {
  return NextResponse.redirect(googleAuthorizeUrl(request));
}
