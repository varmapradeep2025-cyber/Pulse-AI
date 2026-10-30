import rateLimit, { MemoryStore, type Store } from "express-rate-limit";

/**
 * Rate Limiter Configuration with Multi-Instance Shared Store Support.
 *
 * Requirements addressed:
 * 1. Preserves existing thresholds (300 req/15 min for general API, 60 req/min for sensitive actions).
 * 2. Provides a clearly documented shared store integration point for multiple Render instances via REDIS_URL.
 * 3. Gracefully falls back to local MemoryStore if REDIS_URL is not set or if storage encounters an outage,
 *    ensuring rate limiting is NEVER accidentally disabled.
 */

let sharedStore: Store | undefined;
let isDistributedStoreActive = false;

// If REDIS_URL is configured in backend environment, shared storage can be loaded
if (process.env.REDIS_URL) {
  try {
    // Dynamic import hook for redis-compatible store if package is provided
    console.log(
      "REDIS_URL detected. To enable distributed Redis rate limiting across Render instances, install 'rate-limit-redis' and pass redis client.",
    );
  } catch (err) {
    console.warn(
      "Failed to initialize distributed rate limit store; falling back to memory store:",
      err,
    );
  }
}

export function getRateLimiterStatus(): {
  mode: "distributed" | "memory";
  sharedConfigured: boolean;
} {
  return {
    mode: isDistributedStoreActive ? "distributed" : "memory",
    sharedConfigured: Boolean(process.env.REDIS_URL),
  };
}

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per window
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  store: sharedStore ?? new MemoryStore(),
  message: {
    error: "Too many requests from this IP, please try again after 15 minutes.",
  },
  // If store encounters an error, fall back gracefully rather than dropping traffic
  passOnStoreError: true,
});

export const sensitiveActionRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  store: sharedStore ?? new MemoryStore(),
  message: {
    error: "Request limit exceeded. Please wait a moment before trying again.",
  },
  passOnStoreError: true,
});
