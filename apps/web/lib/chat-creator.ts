export function resolveChatCreator<T extends { id: string; username: string }>(creators: readonly T[], key: string) {
  return creators.find((creator) => creator.id === key || creator.username === key) ?? null;
}

export function messageBodyParts(body: string) {
  const pattern = /(\/creator\/[A-Za-z0-9._~-]+(?:\?[A-Za-z0-9_~%=&+-]+)?|https?:\/\/[^\s]+)/g;
  const parts: { kind: "text" | "link"; value: string }[] = [];
  let cursor = 0;
  for (const match of body.matchAll(pattern)) {
    const value = match[0] ?? "";
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ kind: "text", value: body.slice(cursor, index) });
    parts.push({ kind: "link", value });
    cursor = index + value.length;
  }
  if (cursor < body.length) parts.push({ kind: "text", value: body.slice(cursor) });
  return parts;
}
