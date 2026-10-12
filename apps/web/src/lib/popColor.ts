/** NeoPOP pop palette (Tailwind classes backed by `--pop-*` tokens), always paired with ink text. */
export const POP_COLORS = [
  'bg-pop-yellow',
  'bg-pop-mint',
  'bg-pop-blue',
  'bg-pop-pink',
  'bg-pop-coral',
  'bg-pop-lilac',
] as const;

/** A stable pop colour for a name, so a person keeps the same avatar colour everywhere. */
export const popColorFor = (name: string): (typeof POP_COLORS)[number] => {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return POP_COLORS[hash % POP_COLORS.length] ?? POP_COLORS[0];
};
