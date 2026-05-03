import type { ZodType } from 'zod';
import { ApiError } from './api-error';
import { useAuthStore } from '../state/use-auth-store';
import { getPublicClientConfig } from './client-config';
import { apiErrorResponseSchema, apiSuccessResponseSchema } from '@eiscord/shared';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

type RequestOptions<TBody = unknown> = {
  body?: TBody;
  schema?: ZodType<unknown>;
  signal?: AbortSignal;
};

function generateRequestId(): string {
  return crypto.randomUUID();
}

function parseErrorEnvelope(
  json: unknown,
  responseStatus: number,
): ApiError {
  const envelope = apiErrorResponseSchema.safeParse(json);
  if (envelope.success) {
    return new ApiError(
      envelope.data.error.code,
      envelope.data.error.message,
      responseStatus,
      envelope.data.request_id,
      envelope.data.error.details as Record<string, unknown> | undefined,
    );
  }
  return new ApiError(
    'INTERNAL_ERROR' as never,
    'Unable to parse server error',
    responseStatus,
    'unknown',
  );
}

export async function request<TData = unknown>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<TData> {
  const config = getPublicClientConfig();
  const url = `${config.apiBaseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = useAuthStore.getState().accessToken;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const requestId = generateRequestId();
  headers['X-Request-Id'] = requestId;

  const response = await fetch(url, {
    method,
    headers,
    body: options.body != null ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const json = (await response.json().catch(() => null)) as unknown;

  if (!response.ok || (json != null && typeof json === 'object' && 'error' in json)) {
    throw parseErrorEnvelope(json, response.status);
  }

  if (options.schema) {
    const wrapper = apiSuccessResponseSchema(options.schema);
    const envelope = wrapper.safeParse(json);
    if (envelope.success) {
      return (envelope.data as { data: unknown }).data as TData;
    }
    throw new ApiError(
      'INTERNAL_ERROR' as never,
      'Response validation failed',
      response.status,
      requestId,
    );
  }

  const loose = json as { data?: TData; request_id?: string; server_time?: string };
  return (loose.data ?? (json as TData)) as TData;
}
