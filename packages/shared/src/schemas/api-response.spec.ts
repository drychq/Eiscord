import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ErrorCode } from '../constants/error-codes';
import { apiErrorResponseSchema, apiSuccessResponseSchema } from './api-response';

describe('api response schemas', () => {
  it('validates success envelopes', () => {
    const schema = apiSuccessResponseSchema(
      z.object({
        status: z.literal('ok'),
      }),
    );

    expect(() =>
      schema.parse({
        data: { status: 'ok' },
        request_id: 'request-1',
        server_time: '2026-05-01T12:00:00.000Z',
      }),
    ).not.toThrow();
  });

  it('validates error envelopes', () => {
    expect(() =>
      apiErrorResponseSchema.parse({
        error: {
          code: ErrorCode.PermissionDenied,
          details: { resource: 'channel' },
          message: 'Permission denied.',
        },
        request_id: 'request-1',
        server_time: '2026-05-01T12:00:00.000Z',
      }),
    ).not.toThrow();
  });
});
