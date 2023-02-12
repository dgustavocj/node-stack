export const nestedReplacements = (
  phrase: Record<string, unknown> | string,
  replacements: Record<string, unknown> = {},
): Record<string, unknown> | string => {
  return typeof phrase === 'string'
    ? phrase
    : Object.keys(phrase).reduce((acc, cur) => {
        acc[cur] = Object.keys(replacements).reduce(
          (a, c) => (typeof a === 'string' ? a.replace(`{{${c}}}`, replacements[c] as string) : a),
          phrase[cur],
        );
        return acc;
      }, {} as Record<string, unknown>);
};
