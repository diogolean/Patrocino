export function accountDisplayName(user: {
  name?: string | null;
  username?: string | null;
  email?: string | null;
}) {
  const name = user.name?.trim();
  if (name) return name;
  const username = user.username?.trim();
  if (username) return username;
  const email = user.email?.trim() ?? "";
  const local = email.split("@")[0]?.trim();
  return local || email;
}

export function accountInitial(label: string) {
  const letter = label.trim().charAt(0).toUpperCase();
  return letter || "?";
}
