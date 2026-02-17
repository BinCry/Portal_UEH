type Entry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Entry>();

export const consumeRateLimit = (key: string, max: number, windowMinutes: number) => {
  const nowMs = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  const current = buckets.get(key);

  if (!current || current.resetAt <= nowMs) {
    buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    return { allowed: true, remaining: max - 1 };
  }

  if (current.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((current.resetAt - nowMs) / 1000),
    };
  }

  current.count += 1;
  buckets.set(key, current);
  return { allowed: true, remaining: max - current.count };
};
