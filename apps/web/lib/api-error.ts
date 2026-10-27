type ErrorTranslator = {
  has: (key: string) => boolean;
  (key: string): string;
};

export function apiErrorText(
  data: { code?: unknown; message?: unknown } | null | undefined,
  errors: ErrorTranslator,
  fallback: string,
) {
  const code = typeof data?.code === "string" ? data.code : "";
  if (code && errors.has(code)) return errors(code);
  if (typeof data?.message === "string" && data.message.trim()) return data.message;
  if (Array.isArray(data?.message) && typeof data.message[0] === "string" && data.message[0].trim()) return data.message[0];
  return fallback;
}
