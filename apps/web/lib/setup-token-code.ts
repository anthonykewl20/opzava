export function sanitizeSetupTokenCode(raw: string): string {
  return raw
    .split("")
    .filter((character) => {
      const codePoint = character.charCodeAt(0);
      return codePoint > 0x1f && codePoint !== 0x7f;
    })
    .join("")
    .replace(/https?:\/\/\S+/gi, "")
    .trim();
}
