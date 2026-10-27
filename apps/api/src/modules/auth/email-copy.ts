export type EmailCopy = { subject: string; html: string };

const copy: Record<string, { subject: string; body: string }> = {
  "pt-BR": {
    subject: "Confirme seu e-mail no Patrocino",
    body: "Confirme seu e-mail para usar o Patrocino.",
  },
  en: {
    subject: "Confirm your email on Patrocino",
    body: "Confirm your email to use Patrocino.",
  },
  es: {
    subject: "Confirma tu correo en Patrocino",
    body: "Confirma tu correo para usar Patrocino.",
  },
  de: {
    subject: "Bestätige deine E-Mail bei Patrocino",
    body: "Bestätige deine E-Mail, um Patrocino zu nutzen.",
  },
  fr: {
    subject: "Confirmez votre e-mail sur Patrocino",
    body: "Confirmez votre e-mail pour utiliser Patrocino.",
  },
};

export function verificationEmail(locale: string | null | undefined, link: string): EmailCopy {
  const language = locale && copy[locale] ? locale : locale?.toLowerCase().startsWith("pt") ? "pt-BR" : locale?.slice(0, 2);
  const text = (language && copy[language]) || copy["pt-BR"]!;
  const safeLink = link.replace(/"/g, "%22");
  return {
    subject: text.subject,
    html: `<p>${text.body}</p><p><a href="${safeLink}">${safeLink}</a></p>`,
  };
}
