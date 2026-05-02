import { z } from 'zod';

import { ErrorCode } from '../constants/error-codes';

const errorCodeValues = Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]];

export const apiErrorSchema = z.object({
  code: z.enum(errorCodeValues),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
});

export const apiErrorResponseSchema = z.object({
  error: apiErrorSchema,
  request_id: z.string().min(1),
  server_time: z.string().datetime({ offset: true }),
});

export function apiSuccessResponseSchema<TSchema extends z.ZodType<unknown>>(dataSchema: TSchema) {
  return z.object({
    data: dataSchema,
    request_id: z.string().min(1),
    server_time: z.string().datetime({ offset: true }),
  });
}

export type ApiError = z.infer<typeof apiErrorSchema>;

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export type ApiSuccessResponse<TData> = {
  data: TData;
  request_id: string;
  server_time: string;
};
