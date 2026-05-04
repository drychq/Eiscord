import { z } from 'zod';
import { request } from '../../shared/api/http-client';

const checkPermissionSchema = z.object({
  action: z.string(),
  resource_id: z.string().uuid(),
  resource_type: z.enum([
    'attachment',
    'channel',
    'dm',
    'message',
    'server',
    'user',
    'voice',
  ]),
});

const checkPermissionResponseSchema = z.object({
  allowed: z.boolean(),
});

export type CheckPermissionInput = z.infer<typeof checkPermissionSchema>;

export function checkPermission(
  data: CheckPermissionInput,
): Promise<{ allowed: boolean }> {
  return request<{ allowed: boolean }>('POST', '/permissions/check', {
    body: data,
    schema: checkPermissionResponseSchema,
  });
}
