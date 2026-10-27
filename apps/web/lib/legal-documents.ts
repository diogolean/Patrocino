import { filledCompanyFields, legalConfig } from "@mimelux/core";

export type LegalId = "terms" | "privacy" | "guidelines" | "refund";

export type LegalSection = {
  heading: string;
  paragraphs: string[];
};

export type LegalDocument = {
  title: string;
  updated: string;
  sections: LegalSection[];
};

const company = legalConfig;

function identification(labels: { legalName: string; cnpj: string; address: string }) {
  const fields = filledCompanyFields();
  const parts = [
    fields.legalName ? `${labels.legalName} ${fields.legalName}` : "",
    fields.cnpj ? `${labels.cnpj} ${fields.cnpj}` : "",
    fields.address ? `${labels.address} ${fields.address}` : "",
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

const ptIdentity = identification({ legalName: "razão social", cnpj: "CNPJ", address: "endereço" });
const enIdentity = identification({ legalName: "legal name", cnpj: "CNPJ", address: "address" });

const pt: Record<LegalId, LegalDocument> = {
  terms: {
    title: "Termos de Uso",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Quem oferece o serviço",
        paragraphs: [
          `${company.productName} é operado pela ${company.operatorName}${ptIdentity}.`,
          "Ao criar uma conta ou usar o site, você concorda com estes termos e confirma que tem 18 anos ou mais.",
        ],
      },
      {
        heading: "A conta",
        paragraphs: [
          "A conta é pessoal. Você informa dados verdadeiros e guarda a senha. Podemos suspender o acesso se houver violação destes termos ou das diretrizes de conteúdo.",
          "Assinaturas renovam automaticamente no fim de cada período, pelo mesmo meio de pagamento, até você cancelar.",
        ],
      },
      {
        heading: "Termos do criador",
        paragraphs: [
          "Quem publica conteúdo também aceita estes termos do criador. Só pode aparecer quem consentiu, e todo o conteúdo é destinado a adultos.",
          "O criador é responsável pelo que publica, inclusive direitos de imagem. A plataforma pode remover conteúdo e encerrar a conta se as diretrizes forem descumpridas.",
          "A conta de um criador e o chat dessa conta podem ser operados com ajuda da equipe do criador e de ferramentas de automação.",
          "A remuneração segue as regras de repasse vigentes na conta. Valores devidos podem ser retidos em caso de reembolso, contestação ou investigação.",
        ],
      },
      {
        heading: "Contato",
        paragraphs: [`Dúvidas sobre estes termos: ${company.dpoEmail}.`],
      },
    ],
  },
  privacy: {
    title: "Política de Privacidade",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Controladora",
        paragraphs: [
          `A controladora dos dados pessoais é a ${company.operatorName}${ptIdentity}. O contato do encarregado (DPO) é ${company.dpoEmail}.`,
          "Esta política segue a Lei Geral de Proteção de Dados (Lei 13.709/2018).",
        ],
      },
      {
        heading: "Dados coletados",
        paragraphs: [
          "Coletamos os dados da conta (nome, e-mail, senha armazenada como hash), a data e a versão dos termos aceitos, o endereço IP do aceite, dados de uso do site e identificadores de cookies.",
          "Pagamentos são processados por terceiros. Recebemos o identificador da cobrança, o valor, a moeda e o status, não o número completo do cartão.",
        ],
      },
      {
        heading: "Finalidades e bases legais",
        paragraphs: [
          "Usamos os dados para criar e manter a conta, prestar o serviço, cobrar assinaturas, prevenir fraude e cumprir obrigações legais. As bases são a execução do contrato, o cumprimento de obrigação legal, o legítimo interesse em segurança e, quando exigido, o consentimento.",
          "O aceite dos termos e a confirmação de idade registram o momento, a versão do documento e o IP, para demonstrar o consentimento.",
        ],
      },
      {
        heading: "Retenção",
        paragraphs: [
          "Enquanto a conta existe, guardamos o perfil, as mensagens e as preferências para prestar o serviço.",
          "Na exclusão, nome, e-mail, senha, foto, bio e o texto das mensagens são apagados ou substituídos na hora. O perfil público e as mídias de quem publica deixam de aparecer.",
          "Registros de pagamento, de assinatura e do livro-razão ficam por 5 anos, ligados apenas a um identificador anônimo, para obrigação fiscal e defesa em disputas. O prazo conta do fato gerador.",
          "O registro do consentimento de cookies fica por 5 anos. O cookie de idade dura 12 meses. A sessão de acesso dura 15 minutos e a renovação dura 30 dias.",
        ],
      },
      {
        heading: "Direitos do titular",
        paragraphs: [
          "Em Conta, Baixar meus dados gera um JSON com perfil, assinaturas, compras, consentimentos e metadados de mensagens (data, conversa e se havia mídia), sem o texto. O download é limitado a 3 por hora.",
          "Excluir minha conta pede a senha outra vez e a palavra EXCLUIR. A exclusão cancela assinaturas ativas, anonimiza os dados pessoais e oculta o perfil e as mídias públicas de quem publica. Os registros financeiros exigidos em lei permanecem sem o nome e o e-mail.",
          `Também é possível escrever para ${company.dpoEmail} e apresentar reclamação à Autoridade Nacional de Proteção de Dados.`,
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "O banner oferece Aceitar todos, Só necessários e Personalizar. A escolha padrão é só os cookies estritamente necessários: sessão, idioma, confirmação de 18 anos e a própria preferência.",
          "Analíticos e de marketing não são carregados antes dessa escolha. Aceitar todos, ou marcar a opção em Personalizar, libera só o script correspondente.",
          `A escolha fica num cookie, neste navegador e, se você entrou na conta, também no nosso banco com data e hora. A versão atual é ${company.termsVersion}. Uma versão nova pede a escolha de novo.`,
          "O rodapé tem o link Preferências de cookies para reabrir o banner.",
        ],
      },
      {
        heading: "Transferência internacional e pagamentos",
        paragraphs: [
          "Processadores de pagamento e provedores de infraestrutura podem tratar dados fora do Brasil. Quando isso ocorre, exigimos cláusulas contratuais e medidas compatíveis com a LGPD.",
          "O processamento de cartão é feito pelo provedor de pagamentos configurado na conta, hoje em modo de teste quando nenhuma chave de produção está ativa.",
        ],
      },
    ],
  },
  guidelines: {
    title: "Diretrizes de conteúdo",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Somente adultos",
        paragraphs: [
          "O site é exclusivo para pessoas com 18 anos ou mais. É proibido publicar, pedir ou sugerir conteúdo com menores de idade, mesmo que fictício.",
        ],
      },
      {
        heading: "Consentimento",
        paragraphs: [
          "Toda pessoa identificável no conteúdo precisa ter consentido a publicação. Não é permitido conteúdo feito sem consentimento, gravado em segredo, ou obtido por ameaça, fraude ou invasão.",
          "Também é proibido conteúdo ilegal, de exploração, de ódio violento, ou que infrinja direitos de terceiros.",
        ],
      },
      {
        heading: "Denúncia e remoção",
        paragraphs: [
          `Para pedir a retirada de um conteúdo, escreva para ${company.reportEmail} com o endereço da página, o motivo e uma forma de resposta.`,
          "Analisamos o pedido e, quando a denúncia se confirma, removemos o conteúdo e podemos encerrar a conta. Conteúdo envolvendo menor é removido e pode ser comunicado às autoridades.",
        ],
      },
    ],
  },
  refund: {
    title: "Reembolso e cancelamento",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Renovação automática",
        paragraphs: [
          "A assinatura é cobrada no início do período e se renova sozinha, pelo mesmo valor e meio de pagamento, até o cancelamento.",
        ],
      },
      {
        heading: "Cancelar quando quiser",
        paragraphs: [
          "Você pode cancelar a qualquer momento em Minhas assinaturas. O cancelamento vale para a próxima renovação. O acesso permanece até o fim do período já pago.",
        ],
      },
      {
        heading: "Reembolso",
        paragraphs: [
          "Cobranças já confirmadas não são reembolsadas só porque o período ainda não terminou, salvo obrigação legal, cobrança duplicada ou falha comprovada na entrega do acesso.",
          `Pedidos de reembolso: ${company.dpoEmail}. Estornos aprovados aparecem na fatura do meio de pagamento usado.`,
        ],
      },
    ],
  },
};

const en: Record<LegalId, LegalDocument> = {
  terms: {
    title: "Terms of Use",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Who offers the service",
        paragraphs: [
          `${company.productName} is operated by ${company.operatorName}${enIdentity}.`,
          "By creating an account or using the site, you agree to these terms and confirm that you are 18 or older.",
        ],
      },
      {
        heading: "The account",
        paragraphs: [
          "The account is personal. You provide accurate information and keep the password. We may suspend access if these terms or the content guidelines are broken.",
          "Subscriptions renew automatically at the end of each period, on the same payment method, until you cancel.",
        ],
      },
      {
        heading: "Creator terms",
        paragraphs: [
          "Anyone who publishes also accepts these creator terms. Everyone shown must have consented, and all content is meant for adults.",
          "The creator is responsible for what they publish, including image rights. The platform may remove content and close the account if the guidelines are broken.",
          "A creator account and that account's chat may be operated with help from the creator's team and automation tools.",
          "Payouts follow the revenue rules on the account. Amounts can be held when there is a refund, a dispute, or an investigation.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: [`Questions about these terms: ${company.dpoEmail}.`],
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Controller",
        paragraphs: [
          `The controller of personal data is ${company.operatorName}${enIdentity}. The data protection contact (DPO) is ${company.dpoEmail}.`,
          "This policy follows Brazil's General Data Protection Law (Lei 13.709/2018, LGPD).",
        ],
      },
      {
        heading: "Data we collect",
        paragraphs: [
          "We collect account data (name, email, password stored as a hash), the date and version of the terms you accepted, the IP address of that acceptance, site usage data, and cookie identifiers.",
          "Payments are processed by third parties. We receive the charge id, amount, currency, and status, not the full card number.",
        ],
      },
      {
        heading: "Purposes and legal bases",
        paragraphs: [
          "We use the data to create and maintain the account, provide the service, charge subscriptions, prevent fraud, and meet legal duties. The legal bases are contract performance, legal obligation, legitimate interest in security, and consent where it is required.",
          "Accepting the terms and confirming age stores the time, the document version, and the IP address, so the consent can be shown later.",
        ],
      },
      {
        heading: "Retention",
        paragraphs: [
          "While the account exists, we keep the profile, messages, and preferences in order to provide the service.",
          "On deletion, name, email, password, photo, bio, and message text are erased or replaced immediately. A publisher's public profile and media stop appearing.",
          "Payment, subscription, and ledger records are kept for 5 years, tied only to an anonymous id, for tax duties and payment disputes. The period runs from the event.",
          "The cookie-consent record is kept for 5 years. The age cookie lasts 12 months. The access session lasts 15 minutes and the renewal lasts 30 days.",
        ],
      },
      {
        heading: "Rights of the data subject",
        paragraphs: [
          "In Account, Download my data builds a JSON file with the profile, subscriptions, purchases, consents, and message metadata (time, conversation, and whether it had media), without the text. Downloads are limited to 3 per hour.",
          "Delete my account asks for the password again and the word EXCLUIR. Deletion cancels active subscriptions, anonymizes personal data, and hides a publisher's public profile and media. Financial records required by law stay, without the name and email.",
          `You can also email ${company.dpoEmail} and lodge a complaint with the Brazilian data protection authority (ANPD).`,
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "The banner offers Accept all, Necessary only, and Customize. The default is strictly necessary cookies only: session, language, the 18+ confirmation, and this preference.",
          "Analytics and marketing scripts do not load before that choice. Accept all, or a checked option in Customize, enables only the matching script.",
          `The choice is stored in a cookie, in this browser, and, when you are signed in, in our database with the date and time. The current version is ${company.termsVersion}. A new version asks again.`,
          "The footer link Cookie preferences reopens the banner.",
        ],
      },
      {
        heading: "International transfer and payments",
        paragraphs: [
          "Payment processors and infrastructure providers may process data outside Brazil. When they do, we require contractual clauses and safeguards compatible with the LGPD.",
          "Card processing is done by the payment provider configured on the account. It stays in test mode while no live key is enabled.",
        ],
      },
    ],
  },
  guidelines: {
    title: "Content guidelines",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Adults only",
        paragraphs: [
          "The site is only for people who are 18 or older. Publishing, requesting, or suggesting content that involves anyone under 18 is forbidden, including fictional depictions.",
        ],
      },
      {
        heading: "Consent",
        paragraphs: [
          "Every identifiable person in the content must have consented to publication. Content made without consent, recorded in secret, or obtained by threat, fraud, or intrusion is not allowed.",
          "Illegal content, exploitation, violent hate, and material that infringes someone else's rights are also forbidden.",
        ],
      },
      {
        heading: "Report and removal",
        paragraphs: [
          `To request a takedown, email ${company.reportEmail} with the page address, the reason, and a way to reply.`,
          "We review the request and, when the report is confirmed, remove the content and may close the account. Content involving a minor is removed and may be reported to the authorities.",
        ],
      },
    ],
  },
  refund: {
    title: "Refunds and cancellation",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Auto-renewal",
        paragraphs: [
          "A subscription is charged at the start of the period and renews on its own, for the same price and payment method, until you cancel.",
        ],
      },
      {
        heading: "Cancel any time",
        paragraphs: [
          "You can cancel at any time from My subscriptions. Cancellation applies to the next renewal. Access stays until the end of the period already paid.",
        ],
      },
      {
        heading: "Refunds",
        paragraphs: [
          "Confirmed charges are not refunded only because the period is still running, except where the law requires it, the charge was duplicated, or access clearly failed.",
          `Refund requests: ${company.dpoEmail}. Approved refunds show on the statement of the payment method that was used.`,
        ],
      },
    ],
  },
};

export function legalDocument(locale: string, id: LegalId): LegalDocument {
  return locale.toLowerCase().startsWith("pt") ? pt[id] : en[id];
}

export { company as legalCompany };
