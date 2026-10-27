"use client";

import { useEffect, useState } from "react";
import { ChatSequenceEditor } from "@/components/chat-sequence-editor";
import { CreatorStudio } from "@/components/creator-studio";

type CreatorOption = { id: string; name: string; username: string };

export function AdminCreatorStudio() {
  const [query, setQuery] = useState("");
  const [creators, setCreators] = useState<CreatorOption[]>([]);
  const [creatorId, setCreatorId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const path = query.trim() ? `/api/admin/creators?q=${encodeURIComponent(query.trim())}` : "/api/admin/creators";
      void fetch(path, { cache: "no-store" })
        .then((response) => response.json())
        .then((data: { creators?: CreatorOption[] }) => {
          setCreators((data.creators ?? []).map(({ id, name, username }) => ({ id, name, username })));
        })
        .catch(() => setError("Não foi possível listar os criadores."));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <section data-testid="admin-studio" className="mx-auto mt-8 w-full max-w-6xl px-4 sm:px-8">
      <h2 className="text-lg font-extrabold tracking-[-.03em]">Planos e perfil</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Escolha um criador para editar o perfil e os planos de assinatura com as mesmas regras do painel. Preços de posts ficam na seção Mídia.
      </p>
      <label className="mt-4 block max-w-md text-xs font-bold uppercase tracking-wide text-muted">
        Buscar criador
        <input
          data-testid="admin-studio-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nome ou usuário"
          className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold normal-case tracking-normal text-foreground outline-none focus:border-primary"
        />
      </label>
      <label className="mt-4 block max-w-md text-xs font-bold uppercase tracking-wide text-muted">
        Criador
        <select
          data-testid="admin-studio-creator"
          value={creatorId}
          onChange={(event) => setCreatorId(event.target.value)}
          className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold normal-case tracking-normal text-foreground outline-none focus:border-primary"
        >
          <option value="">Escolha um criador</option>
          {creators.map((creator) => (
            <option key={creator.id} value={creator.id}>
              {creator.name || creator.username} (@{creator.username})
            </option>
          ))}
        </select>
      </label>
      {error && <p className="mt-3 text-sm text-muted">{error}</p>}
      {creatorId ? (
        <div className="mt-5 space-y-5">
          <div className="rounded-[28px] border border-border bg-elevated/70 p-4 sm:p-6">
            <CreatorStudio creatorId={creatorId} />
          </div>
          <div className="rounded-[28px] border border-border bg-elevated/70 p-4 sm:p-6">
            <h3 className="text-sm font-extrabold">Sequência do chat</h3>
            <ChatSequenceEditor creatorId={creatorId} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
