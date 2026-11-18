"use client";

import { useEffect } from "react";
import { captureLandingAttribution } from "@/lib/meta";

/** First-touch UTM and fbclid, kept for 30 days. Does not overwrite an existing landing. */
export function AttributionCapture() {
  useEffect(() => {
    captureLandingAttribution();
  }, []);
  return null;
}
