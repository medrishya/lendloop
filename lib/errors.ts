// lib/errors.ts
export function getFriendlyErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (!(err instanceof Error)) return fallback;

  const cleaned = err.message
    .replace(/^\[CONVEX[^\]]*\]\s*/i, '')
    .replace(/^Uncaught Error:\s*/i, '')
    .split('\n')[0]
    .trim();

  return cleaned || fallback;
}
