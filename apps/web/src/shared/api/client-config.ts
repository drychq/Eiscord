import { publicClientConfigSchema, type PublicClientConfig } from '@eiscord/shared';

export function getPublicClientConfig(): PublicClientConfig {
  return publicClientConfigSchema.parse({
    apiBaseUrl: import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1',
    realtimeUrl: import.meta.env.PUBLIC_REALTIME_URL ?? 'http://localhost:3000/realtime',
  });
}
