import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA = 'eiscord:rate-limit';

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export function RateLimit(options: RateLimitOptions) {
  return SetMetadata(RATE_LIMIT_METADATA, options);
}
