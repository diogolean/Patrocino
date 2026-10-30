import { verificationEmail } from "./email-copy";

export interface EmailSender {
  sendVerification(to: string, link: string, locale?: string | null): Promise<void>;
}

class LogEmailSender implements EmailSender {
  async sendVerification(to: string, link: string, locale?: string | null) {
    console.log(`[patrocino] verification link for ${to} (${locale || "pt-BR"}): ${link}`);
  }
}

export function readResendConfig(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export async function sendResendEmail(
  config: { apiKey: string; from: string },
  input: { to: string; subject: string; html: string },
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend failed (${response.status}): ${detail}`);
  }
}

class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendVerification(to: string, link: string, locale?: string | null) {
    const copy = verificationEmail(locale, link);
    await sendResendEmail({ apiKey: this.apiKey, from: this.from }, { to, subject: copy.subject, html: copy.html });
  }
}

export function createEmailSender(
  env: NodeJS.ProcessEnv = process.env,
): EmailSender {
  const config = readResendConfig(env);
  if (!env.RESEND_API_KEY?.trim()) return new LogEmailSender();
  if (!config) {
    console.warn("[patrocino] RESEND_API_KEY is set without EMAIL_FROM; logging the verification link instead.");
    return new LogEmailSender();
  }
  return new ResendEmailSender(config.apiKey, config.from);
}
