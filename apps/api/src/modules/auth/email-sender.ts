import { verificationEmail } from "./email-copy";

export interface EmailSender {
  sendVerification(to: string, link: string, locale?: string | null): Promise<void>;
}

class LogEmailSender implements EmailSender {
  async sendVerification(to: string, link: string, locale?: string | null) {
    console.log(`[patrocino] verification link for ${to} (${locale || "pt-BR"}): ${link}`);
  }
}

class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendVerification(to: string, link: string, locale?: string | null) {
    const copy = verificationEmail(locale, link);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [to],
        subject: copy.subject,
        html: copy.html,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Resend failed (${response.status}): ${detail}`);
    }
  }
}

export function createEmailSender(
  env: NodeJS.ProcessEnv = process.env,
): EmailSender {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return new LogEmailSender();
  const from = env.EMAIL_FROM?.trim();
  if (!from) {
    console.warn("[patrocino] RESEND_API_KEY is set without EMAIL_FROM; logging the verification link instead.");
    return new LogEmailSender();
  }
  return new ResendEmailSender(apiKey, from);
}
