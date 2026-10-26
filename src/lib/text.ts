/** Lowercase and strip accents, for accent-insensitive matching ("Échéance" → "echeance"). */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
