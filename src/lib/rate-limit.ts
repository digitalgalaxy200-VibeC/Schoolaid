// In-memory rate limiting utility for API routes
// Stores IP -> { count, expires }
const cache = new Map<string, { count: number; expires: number }>();

export function checkRateLimit(ip: string, limit: number = 5, windowMs: number = 60000) {
  const now = Date.now();
  const record = cache.get(ip);

  if (record && record.expires > now) {
    record.count++;
    if (record.count > limit) {
      return false; // Rate limited
    }
  } else {
    cache.set(ip, { count: 1, expires: now + windowMs });
  }

  // Cleanup old entries randomly to prevent memory leaks
  if (Math.random() < 0.05) {
    for (const [key, val] of cache.entries()) {
      if (val.expires < now) {
        cache.delete(key);
      }
    }
  }

  return true; // OK
}
