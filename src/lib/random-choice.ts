/** Avoid repeating the current choice whenever another option exists. */
export function randomAlternative<T>(items: readonly T[], current: T, random = Math.random): T | undefined {
  const alternatives = items.filter((item) => item !== current);
  const pool = alternatives.length ? alternatives : items;
  return pool[Math.floor(random() * pool.length)];
}
