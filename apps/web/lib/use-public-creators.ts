"use client";

import { useEffect, useMemo, useState } from "react";
import { creators as fixtureCreators, type Creator } from "@/lib/fixtures";
import { mergePublicCreators, parseDatabaseCreators } from "@/lib/public-catalog";

/** Fixture creators immediately, then ACTIVE database creators that are not already in the fixture list. */
export function usePublicCreators() {
  const [extra, setExtra] = useState<Creator[]>([]);
  useEffect(() => {
    let cancel = false;
    void fetch("/api/creators", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancel) setExtra(parseDatabaseCreators(payload).creators);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);
  return useMemo(() => mergePublicCreators(fixtureCreators, extra), [extra]);
}
