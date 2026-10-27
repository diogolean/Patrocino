import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { Logo, Mark, StarMark, starConcepts, type StarConceptId } from "@mimelux/ui";

const lightVars = {
  "--background": "#F7F7FB",
  "--surface": "#ECECF5",
  "--elevated": "#FFFFFF",
  "--primary": "#A996FF",
  "--primary-strong": "#5437D1",
  "--accent": "#62D4C8",
  "--foreground": "#181725",
  "--ink": "#181725",
  "--muted": "#625F73",
  "--border": "rgba(24, 23, 37, 0.11)",
} as CSSProperties;

const darkVars = {
  "--background": "#0C0D14",
  "--surface": "#171925",
  "--elevated": "#202331",
  "--primary": "#A996FF",
  "--primary-strong": "#C0B5FF",
  "--accent": "#62D4C8",
  "--foreground": "#F6F4FF",
  "--ink": "#181725",
  "--muted": "#AAA7B8",
  "--border": "rgba(246, 244, 255, 0.13)",
} as CSSProperties;

const conceptName: Record<StarConceptId, "conceptA" | "conceptB" | "conceptC" | "conceptD" | "conceptE" | "conceptF"> = {
  a: "conceptA",
  b: "conceptB",
  c: "conceptC",
  d: "conceptD",
  e: "conceptE",
  f: "conceptF",
};

function Board({
  id,
  vars,
  label,
  sparkLabel,
  sparkTitle,
  supportLabel,
  supportTitle,
}: {
  id: string;
  vars: CSSProperties;
  label: string;
  sparkLabel: string;
  sparkTitle: string;
  supportLabel: string;
  supportTitle: string;
}) {
  return (
    <section
      data-testid={id}
      style={vars}
      className="rounded-[28px] bg-background px-6 py-8 text-foreground sm:px-10"
    >
      <p className="text-[10px] font-bold uppercase tracking-[.22em] text-muted">{label}</p>
      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <div data-testid={`${id}-spark`}>
          <p className="text-xs font-semibold text-primary-strong">{sparkLabel}</p>
          <div className="mt-4 flex items-end gap-6">
            <span className="grid size-16 place-items-center rounded-[18px] bg-foreground text-background">
              <Mark className="size-11" />
            </span>
            <Mark title={sparkTitle} className="size-16" />
            <Mark className="size-4" />
          </div>
          <div className="mt-6">
            <Logo />
          </div>
        </div>
        <div data-testid={`${id}-heart`}>
          <p className="text-xs font-semibold text-muted">{supportLabel}</p>
          <div className="mt-4 flex items-end gap-6">
            <span className="grid size-16 place-items-center rounded-[18px] bg-foreground text-background">
              <Mark variant="heart" className="size-11" />
            </span>
            <Mark variant="heart" title={supportTitle} className="size-16" />
            <Mark variant="heart" className="size-4" />
          </div>
          <div className="mt-6">
            <Logo mark="heart" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Options({
  id,
  vars,
  label,
  studies,
  names,
  lines,
}: {
  id: string;
  vars: CSSProperties;
  label: string;
  studies: string;
  names: Record<StarConceptId, string>;
  lines: Record<StarConceptId, string>;
}) {
  return (
    <section
      data-testid={id}
      style={vars}
      className="rounded-[28px] bg-background px-5 py-8 text-foreground sm:px-8"
    >
      <p className="text-[10px] font-bold uppercase tracking-[.22em] text-muted">{label}</p>
      <p className="mt-2 text-xs text-muted">{studies}</p>
      <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {starConcepts.map((concept) => (
          <div key={concept.id} data-testid={`${id}-${concept.id}`}>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary-strong">
              {concept.id.toUpperCase()} · {names[concept.id]}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-muted">{lines[concept.id]}</p>
            <div className="mt-4 flex items-end gap-5">
              <StarMark id={concept.id} title={names[concept.id]} className="size-20" />
              <StarMark id={concept.id} className="size-8" />
              <StarMark id={concept.id} className="size-4" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function BrandPage() {
  const t = await getTranslations("brand");
  const names = Object.fromEntries(
    (Object.keys(conceptName) as StarConceptId[]).map((id) => [id, t(conceptName[id])]),
  ) as Record<StarConceptId, string>;
  const lines = Object.fromEntries(
    (Object.keys(conceptName) as StarConceptId[]).map((id) => [id, t(`${conceptName[id]}Line`)]),
  ) as Record<StarConceptId, string>;

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 py-10 sm:px-8">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[.28em] text-primary-strong">{t("eyebrow")}</p>
        <h1 className="mt-3 text-4xl font-medium tracking-[-.04em]">Patrocino</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">{t("body")}</p>
      </header>
      <section
        data-testid="favicon-preview"
        style={lightVars}
        className="rounded-[28px] bg-background px-6 py-8 text-foreground"
      >
        <p className="text-[10px] font-bold uppercase tracking-[.22em] text-muted">{t("favicon")}</p>
        <div className="mt-6 flex items-end gap-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt={t("favicon64")} width={64} height={64} className="size-16" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt={t("favicon32")} width={32} height={32} className="size-8" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt={t("favicon16")} width={16} height={16} className="size-4" />
        </div>
      </section>
      <Options id="logo-options-light" vars={lightVars} label={t("lightGround")} studies={t("studies")} names={names} lines={lines} />
      <Options id="logo-options-dark" vars={darkVars} label={t("darkGround")} studies={t("studies")} names={names} lines={lines} />
      <Board
        id="logo-board-light"
        vars={lightVars}
        label={t("currentLight")}
        sparkLabel={t("sparkLabel")}
        sparkTitle={t("sparkTitle")}
        supportLabel={t("supportLabel")}
        supportTitle={t("supportTitle")}
      />
      <Board
        id="logo-board-dark"
        vars={darkVars}
        label={t("currentDark")}
        sparkLabel={t("sparkLabel")}
        sparkTitle={t("sparkTitle")}
        supportLabel={t("supportLabel")}
        supportTitle={t("supportTitle")}
      />
    </main>
  );
}
