"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MediaManager } from "@/components/media-manager";
import { apiErrorText } from "@/lib/api-error";

type CreatorOption = { id: string; name: string; username: string };

export function AdminMedia() {
  const t = useTranslations("admin");
  const errors = useTranslations("errors");
  const [creators, setCreators] = useState<CreatorOption[]>([]);
  const [creatorId, setCreatorId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetch("/api/admin/creators", { cache: "no-store" })
        .then(async (response) => {
          const data = (await response.json().catch(() => ({}))) as { code?: unknown; message?: unknown; creators?: Array<CreatorOption & Record<string, unknown>> };
          if (!response.ok) {
            setError(apiErrorText(data, errors, t("creatorsFailed")));
            return;
          }
          setCreators((data.creators ?? []).map(({ id, name, username }) => ({ id, name, username })));
        })
        .catch(() => setError(t("creatorsFailed")));
    }, 0);
    return () => window.clearTimeout(handle);
  }, [errors, t]);

  return (
    <section data-testid="admin-media" className="mx-auto mt-2 w-full max-w-6xl px-4 sm:px-8">
      <h2 className="text-lg font-extrabold tracking-[-.03em]">{t("mediaTitle")}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        {t("mediaBody")}
      </p>
      <label className="mt-4 block max-w-md text-xs font-bold uppercase tracking-wide text-muted">
        {t("creator")}
        <select
          data-testid="admin-media-creator"
          value={creatorId}
          onChange={(event) => setCreatorId(event.target.value)}
          className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold normal-case tracking-normal text-foreground outline-none focus:border-primary"
        >
          <option value="">{t("choose")}</option>
          {creators.map((creator) => (
            <option key={creator.id} value={creator.id}>
              {creator.name || creator.username} (@{creator.username})
            </option>
          ))}
        </select>
      </label>
      {error && <p className="mt-3 text-sm text-muted">{error}</p>}
      {creatorId ? (
        <div className="mt-4">
          <MediaManager creatorId={creatorId} />
        </div>
      ) : null}
    </section>
  );
}
