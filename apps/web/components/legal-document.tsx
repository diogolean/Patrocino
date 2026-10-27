import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@mimelux/ui";
import { isCreatorTermsHeading, legalCompany, legalDocument, type LegalId } from "@/lib/legal-documents";

export async function LegalDocument({ id }: { id: LegalId }) {
  const locale = await getLocale();
  const document = legalDocument(locale, id);
  const footer = await getTranslations("footer");
  const legal = await getTranslations("legal");
  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/auth?route=sign-in" aria-label={footer("about")}>
          <Logo compact />
        </Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[.18em] text-primary-strong">{legalCompany.productName}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-.04em] sm:text-4xl">{document.title}</h1>
        <p className="mt-2 text-xs text-muted">
          {legal("version")} {document.updated}
        </p>
        <div className="mt-8 space-y-8">
          {document.sections.map((section) => (
            <section key={section.heading} id={isCreatorTermsHeading(section.heading) ? "criador" : undefined}>
              <h2 className="text-lg font-extrabold">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-sm leading-7 text-muted">
                  <LegalText text={paragraph} />
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

function LegalText({ text }: { text: string }) {
  const tokens = [legalCompany.legalName, legalCompany.cnpj, legalCompany.address].map((value) => value.trim()).filter(Boolean);
  if (tokens.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "g"));
  return (
    <>
      {parts.map((part, index) =>
        tokens.includes(part) ? (
          <span key={`${part}-${index}`} data-placeholder="company" className="rounded bg-accent/40 px-1 font-semibold text-foreground">
            {part}
          </span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
