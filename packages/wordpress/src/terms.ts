/** Splits a term name that bundles several terms ("Business|Press releases", "News; Events") into its parts. */
export const termParts = (name: unknown): string[] =>
  String(name ?? "")
    .split(/\s*[|;]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
