export const chatSequenceOfferModes = ["none", "latest", "post"] as const;
export type ChatSequenceOfferMode = (typeof chatSequenceOfferModes)[number];

export type ChatSequenceStepTemplate = {
  position: number;
  delayMinutes: number;
  bodyTemplate: string;
  offerMode: ChatSequenceOfferMode;
  recurring?: boolean;
};

const DAY = 24 * 60;
const RECURRING_INTERVAL = 21 * DAY;

/** Previous shipped default. Seed upgrades a sequence only when it still matches this. */
export const legacyChatSequenceSteps: ChatSequenceStepTemplate[] = [
  {
    position: 0,
    delayMinutes: 0,
    offerMode: "latest",
    bodyTemplate: "Oi, {fanName}. Que bom ter você aqui comigo. Separei uma coisa só pra você.",
  },
  {
    position: 1,
    delayMinutes: 120,
    offerMode: "latest",
    bodyTemplate: "{fanName}, olha {videoTitle}. Eu deixei por {price}, e é seu pra sempre.",
  },
  {
    position: 2,
    delayMinutes: 24 * 60,
    offerMode: "latest",
    bodyTemplate: "Passando de novo: {videoTitle} ainda está aqui por {price}. Eu não posto isso no feed.",
  },
  {
    position: 3,
    delayMinutes: 72 * 60,
    offerMode: "latest",
    bodyTemplate: "{fanName}, última chamada de {videoTitle} por {price}. Depois eu guardo.",
  },
];

export const defaultChatSequenceSteps: ChatSequenceStepTemplate[] = [
  {
    position: 0,
    delayMinutes: 0,
    offerMode: "latest",
    bodyTemplate:
      "Oi, {fanName}. Aqui é a {creatorName}. Você chegou e eu já quero te mostrar o que não deixo no feed. Os vídeos trancados estão na aba Vídeos: {videosUrl}. Se quiser algo feito só pra você, abre um pedido especial: {requestUrl}.",
  },
  {
    position: 1,
    delayMinutes: 2,
    offerMode: "latest",
    bodyTemplate:
      "{fanName}, ainda estou aqui. Escolhi um vídeo pensando em você e deixei ele trancado de propósito. Dá uma olhada na aba Vídeos: {videosUrl}. Se preferir do seu jeito, me faz um pedido especial: {requestUrl}.",
  },
  {
    position: 2,
    delayMinutes: 10,
    offerMode: "latest",
    bodyTemplate:
      "Posso te confessar uma coisa? Eu gosto quando você chega pertinho. Separei mais um vídeo só pra quem fica. Abre a aba Vídeos: {videosUrl}. E se quiser uma cena do seu jeito, o pedido especial está aqui: {requestUrl}.",
  },
  {
    position: 3,
    delayMinutes: 30,
    offerMode: "latest",
    bodyTemplate:
      "Não some, {fanName}. Eu tenho um vídeo que ainda não te mostrei, e ele está te esperando na aba Vídeos: {videosUrl}. Quer que eu grave pensando em você? Me pede um pedido especial: {requestUrl}.",
  },
  {
    position: 4,
    delayMinutes: 2 * 60,
    offerMode: "latest",
    bodyTemplate:
      "Passei aqui de novo. {creatorName} não esquece quem chega. O próximo vídeo trancado está na aba Vídeos: {videosUrl}. Se quiser algo mais íntimo e só seu, abre um pedido especial: {requestUrl}.",
  },
  {
    position: 5,
    delayMinutes: 6 * 60,
    offerMode: "latest",
    bodyTemplate:
      "{fanName}, eu deixei a luz baixa e gravei uma coisa que não vai pro feed. Está na aba Vídeos: {videosUrl}. E se a sua ideia for outra, eu faço sob medida no pedido especial: {requestUrl}.",
  },
  {
    position: 6,
    delayMinutes: 12 * 60,
    offerMode: "latest",
    bodyTemplate:
      "Meio do dia e eu ainda pensando em você. Tem vídeo novo trancado na aba Vídeos: {videosUrl}. Quer uma versão com o seu pedido? Me chama no pedido especial: {requestUrl}.",
  },
  {
    position: 7,
    delayMinutes: 18 * 60,
    offerMode: "latest",
    bodyTemplate:
      "A noite chegou, {fanName}. É a hora em que eu fico mais ousada no que guardo pra quem fica. Olha a aba Vídeos: {videosUrl}. Se quiser uma surpresa com o seu nome, faz um pedido especial: {requestUrl}.",
  },
  {
    position: 8,
    delayMinutes: 22 * 60,
    offerMode: "latest",
    bodyTemplate:
      "Antes de dormir, uma última tentação. Eu deixei um vídeo te esperando na aba Vídeos: {videosUrl}. E se quiser que eu grave o que você pedir, o pedido especial está aberto: {requestUrl}.",
  },
  {
    position: 9,
    delayMinutes: 2 * DAY,
    offerMode: "latest",
    bodyTemplate:
      "{fanName}, dois dias e eu ainda não te mostrei tudo. Os vídeos que ficaram trancados estão na aba Vídeos: {videosUrl}. Quando quiser algo feito pra você, me pede um pedido especial: {requestUrl}.",
  },
  {
    position: 10,
    delayMinutes: 7 * DAY,
    offerMode: "latest",
    bodyTemplate:
      "Uma semana comigo, {fanName}. Eu continuei guardando vídeos só pra quem fica. A aba Vídeos está aqui: {videosUrl}. E o pedido especial continua seu, do jeito que você quiser: {requestUrl}.",
  },
  {
    position: 11,
    delayMinutes: RECURRING_INTERVAL,
    offerMode: "latest",
    recurring: true,
    bodyTemplate:
      "{fanName}, voltei. Eu gravei de novo pensando em quem fica comigo. O vídeo novo está na aba Vídeos: {videosUrl}. Se quiser uma versão só sua, abre um pedido especial: {requestUrl}.",
  },
  {
    position: 12,
    delayMinutes: RECURRING_INTERVAL,
    offerMode: "latest",
    recurring: true,
    bodyTemplate:
      "Saudade boa, {fanName}. Eu não posto isso em lugar nenhum, só na aba Vídeos: {videosUrl}. E se a ideia for sua, eu realizo no pedido especial: {requestUrl}.",
  },
  {
    position: 13,
    delayMinutes: RECURRING_INTERVAL,
    offerMode: "latest",
    recurring: true,
    bodyTemplate:
      "Oi. Aqui é a {creatorName}, e eu guardei um vídeo novo pra você. Abre a aba Vídeos: {videosUrl}. Quer que eu faça do seu jeito? Pedido especial: {requestUrl}.",
  },
  {
    position: 14,
    delayMinutes: RECURRING_INTERVAL,
    offerMode: "latest",
    recurring: true,
    bodyTemplate:
      "{fanName}, hoje eu estou em um dia daqueles. O que eu gravei ficou na aba Vídeos: {videosUrl}. Se quiser dirigir a próxima, me manda um pedido especial: {requestUrl}.",
  },
  {
    position: 15,
    delayMinutes: RECURRING_INTERVAL,
    offerMode: "latest",
    recurring: true,
    bodyTemplate:
      "Passando pra não te deixar esquecer de mim. Tem coisa trancada te esperando na aba Vídeos: {videosUrl}. E um pedido especial continua sendo só nosso: {requestUrl}.",
  },
  {
    position: 16,
    delayMinutes: RECURRING_INTERVAL,
    offerMode: "latest",
    recurring: true,
    bodyTemplate:
      "{creatorName} por aqui de novo, {fanName}. Eu separo o que é mais íntimo pra aba Vídeos: {videosUrl}. Quando quiser uma gravação com o seu pedido especial, é aqui: {requestUrl}.",
  },
];

const templateTokens = ["fanName", "creatorName", "videoTitle", "price", "videosUrl", "requestUrl"] as const;

export function renderChatSequence(template: string, vars: Partial<Record<(typeof templateTokens)[number], string>>) {
  return template.replace(
    /\{(fanName|creatorName|videoTitle|price|videosUrl|requestUrl)\}/g,
    (_, key: (typeof templateTokens)[number]) => vars[key] ?? "",
  );
}

export function chatSequenceNeedsVideo(template: string) {
  return /\{(videoTitle|price)\}/.test(template);
}

export type StoredChatSequenceStep = {
  position: number;
  delayMinutes: number;
  bodyTemplate: string;
  offerMode: string;
  recurring?: boolean;
  postId?: string | null;
};

function orderedSteps<T extends { position: number }>(steps: readonly T[]) {
  return [...steps].sort((left, right) => left.position - right.position);
}

function sameSequence(stored: readonly StoredChatSequenceStep[], expected: readonly ChatSequenceStepTemplate[]) {
  const left = orderedSteps(stored);
  const right = orderedSteps(expected);
  if (left.length !== right.length) return false;
  return left.every((step, index) => {
    const target = right[index];
    if (!target) return false;
    return (
      step.position === target.position &&
      step.delayMinutes === target.delayMinutes &&
      step.bodyTemplate === target.bodyTemplate &&
      step.offerMode === target.offerMode &&
      (step.recurring ?? false) === (target.recurring ?? false) &&
      (step.postId ?? null) === null
    );
  });
}

/** insert when missing, upgrade when it is still a shipped default, keep creator edits. */
export function chatSequenceSeedAction(existing: readonly StoredChatSequenceStep[] | null): "insert" | "upgrade" | "keep" {
  if (!existing) return "insert";
  if (sameSequence(existing, defaultChatSequenceSteps)) return "keep";
  if (sameSequence(existing, legacyChatSequenceSteps)) return "upgrade";
  return "keep";
}

export function chatSequenceJobPlan(steps: readonly StoredChatSequenceStep[], startedAt: Date) {
  const once = orderedSteps(steps.filter((step) => !step.recurring));
  const pool = orderedSteps(steps.filter((step) => step.recurring));
  const jobs = once.map((step) => ({
    position: step.position,
    runAt: new Date(startedAt.getTime() + step.delayMinutes * 60_000),
  }));
  const first = pool[0];
  if (first) {
    const interval = first.delayMinutes > 0 ? first.delayMinutes : RECURRING_INTERVAL;
    const lastOnce = once.reduce((max, step) => Math.max(max, step.delayMinutes), 0);
    jobs.push({
      position: first.position,
      runAt: new Date(startedAt.getTime() + (lastOnce + interval) * 60_000),
    });
  }
  return jobs;
}

export function recurringIntervalMinutes(steps: readonly { position: number; delayMinutes: number; recurring?: boolean }[]) {
  const first = orderedSteps(steps.filter((step) => step.recurring))[0];
  if (!first || first.delayMinutes <= 0) return RECURRING_INTERVAL;
  return first.delayMinutes;
}
