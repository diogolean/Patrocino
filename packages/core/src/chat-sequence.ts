export const chatSequenceOfferModes = ["none", "latest", "post"] as const;
export type ChatSequenceOfferMode = (typeof chatSequenceOfferModes)[number];

export type ChatSequenceStepTemplate = {
  position: number;
  delayMinutes: number;
  bodyTemplate: string;
  offerMode: ChatSequenceOfferMode;
};

export const defaultChatSequenceSteps: ChatSequenceStepTemplate[] = [
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

const templateTokens = ["fanName", "creatorName", "videoTitle", "price"] as const;

export function renderChatSequence(template: string, vars: Partial<Record<(typeof templateTokens)[number], string>>) {
  return template.replace(/\{(fanName|creatorName|videoTitle|price)\}/g, (_, key: (typeof templateTokens)[number]) => vars[key] ?? "");
}

export function chatSequenceNeedsVideo(template: string) {
  return /\{(videoTitle|price)\}/.test(template);
}
