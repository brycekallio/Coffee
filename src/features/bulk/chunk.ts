/** PostgREST puts `id=in.(…)` in the URL, so a long id list is sent in pieces. */
export const IN_CHUNK = 100;

export function chunks<T>(items: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
