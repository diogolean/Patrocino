export const frameMetals = [
  { id: "gold", frame: "#c6a15b", edge: "#7a5a28", ink: "#2c2112", highlight: "#f4e7c4" },
  { id: "silver", frame: "#c5ccd4", edge: "#5e6874", ink: "#1c222a", highlight: "#f5f7fa" },
  { id: "copper", frame: "#c4845a", edge: "#7a4328", ink: "#35180e", highlight: "#f3d2bc" },
  { id: "bronze", frame: "#a67c52", edge: "#5e4124", ink: "#2a1c0e", highlight: "#ead4b4" },
  { id: "iron", frame: "#8d97a3", edge: "#3c4551", ink: "#14181d", highlight: "#e4e8ee" },
  { id: "rose", frame: "#c98b90", edge: "#7d4550", ink: "#351820", highlight: "#f6dfe2" },
  { id: "emerald", frame: "#7e9a78", edge: "#355438", ink: "#142016", highlight: "#e4f0df" },
  { id: "sapphire", frame: "#7f93b5", edge: "#31456e", ink: "#12192a", highlight: "#e4ebf6" },
] as const;

export const grounds = [
  { id: "dawn", from: "#f6ead0", to: "#e4c49a" },
  { id: "dusk", from: "#f3e7d4", to: "#d9c4de" },
  { id: "forest", from: "#f3ead4", to: "#c5d4be" },
  { id: "sea", from: "#f4ead4", to: "#c3d4e2" },
  { id: "ember", from: "#f8ead2", to: "#e4c2a4" },
  { id: "night", from: "#ebe4d8", to: "#cfc6dc" },
] as const;

export const patterns = ["diamond", "chevron", "scale", "cross"] as const;
export const emblems = ["shield", "sword", "star", "sun", "moon", "key"] as const;

export type FrameMetal = (typeof frameMetals)[number];
export type Ground = (typeof grounds)[number];
export type CardPattern = (typeof patterns)[number];
export type CardEmblem = (typeof emblems)[number];

export type CharacterVariation = {
  hash: number;
  frame: FrameMetal;
  ground: Ground;
  pattern: CardPattern;
  emblem: CardEmblem;
  titleIndex: number;
};

/** FNV-1a 32-bit. Same user id always lands on the same card. */
export function hashUserId(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function characterVariation(userId: string): CharacterVariation {
  const hash = hashUserId(userId || "guest");
  return {
    hash,
    frame: frameMetals[hash % frameMetals.length]!,
    ground: grounds[(hash >>> 5) % grounds.length]!,
    pattern: patterns[(hash >>> 9) % patterns.length]!,
    emblem: emblems[(hash >>> 13) % emblems.length]!,
    titleIndex: (hash >>> 17) % 6,
  };
}
