"use client";

import { useEffect, useState } from "react";
import type { Overview, RangeQuery } from "./types";

type Result = { key: string; data: Overview | null; failed: boolean };

function requestKey(range: RangeQuery, attempt: number) {
  const query = new URLSearchParams({ range: range.preset });
  if (range.preset === "custom" && range.from && range.to) {
    query.set("from", range.from);
    query.set("to", range.to);
  }
  return `${query}#${attempt}`;
}

/** Fetches the executive overview for a range; keeps the last data visible while a new range loads. */
export function useOverview(range: RangeQuery) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result>({ key: "", data: null, failed: false });
  const key = requestKey(range, attempt);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/overview?${key.split("#")[0]}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as Overview;
        setResult({ key, data, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult((previous) => ({ key, data: previous.data, failed: true }));
      });
    return () => controller.abort();
  }, [key]);

  const status = result.key !== key ? "loading" : result.failed ? "error" : "ready";
  return { status, data: result.data, retry: () => setAttempt((value) => value + 1) } as const;
}
