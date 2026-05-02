import { z } from 'zod';

export const publicClientConfigSchema = z.object({
  apiBaseUrl: z.string().url(),
  realtimeUrl: z.string().url(),
});

export type PublicClientConfig = z.infer<typeof publicClientConfigSchema>;
