const names = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string): string {
  try {
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}
