/**
 * Edit distance — how many typos apart two words are. Optimal string alignment: insertions,
 * deletions, substitutions, and a swapped pair of neighbouring letters ("nwe" → "new") each
 * count one. Shared by the reference jump (nearest book name) and the text search's spelling
 * correction (nearest words in the corpus).
 *
 * `cap` is for scanning a long word list: once every alignment is past it the answer can only
 * be "too far", so the scan stops and returns cap + 1.
 */
export const editDistance = (a: string, b: string, cap = Infinity): number => {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      const swapped = i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
      if (swapped) current[j] = Math.min(current[j], before[j - 2] + 1);
    }
    if (Math.min(...current) > cap) return cap + 1;
    before = previous;
    previous = current;
  }
  return Math.min(previous[b.length], cap + 1);
};
