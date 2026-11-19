export const MAX_PROBLEM_WORDS = 2_000;

export function countProblemWords(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function problemWordLimitMessage(wordCount: number) {
  return `Your problem description is ${wordCount.toLocaleString()} words. The maximum is ${MAX_PROBLEM_WORDS.toLocaleString()} words. Shorten it before continuing.`;
}
