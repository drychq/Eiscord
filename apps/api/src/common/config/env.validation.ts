import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().default('postgresql://eiscord:eiscord@localhost:5432/eiscord'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(1).default('change-me-access'),
  JWT_REFRESH_SECRET: z.string().min(1).default('change-me-refresh'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_BUCKET: z.string().min(1).default('eiscord-local'),
  S3_ACCESS_KEY: z.string().min(1).default('minioadmin'),
  S3_SECRET_KEY: z.string().min(1).default('minioadmin'),
  PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:3000/api/v1'),
  PUBLIC_REALTIME_URL: z.string().url().default('http://localhost:3000/realtime'),
  PUBLIC_WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10485760),
  SERVER_MEMBER_LIMIT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('debug'),
  REDIS_CONNECT_IN_TEST: z.enum(['true', 'false']).default('false'),
  REALTIME_SWEEP_IN_TEST: z.enum(['true', 'false']).default('false'),
  PRESENCE_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  PRESENCE_OFFLINE_GRACE_MS: z.coerce.number().int().positive().default(45000),
  MEDIASOUP_LISTEN_IP: z.string().ip().default('127.0.0.1'),
  MEDIASOUP_ANNOUNCED_IP: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().ip().optional(),
  ),
  MEDIASOUP_RTC_MIN_PORT: z.coerce.number().int().positive().default(40000),
  MEDIASOUP_RTC_MAX_PORT: z.coerce.number().int().positive().default(40100),
  MEDIASOUP_NUM_WORKERS: z.coerce.number().int().positive().default(1),
  MEDIA_HEALTH_PORT: z.coerce.number().int().min(0).default(3001),
  TURN_URL: z.string().min(1).default('turn:localhost:3478?transport=udp'),
  TURN_SHARED_SECRET: z.string().min(1).default('change-me-turn'),
  TURN_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  VOICE_MAX_PARTICIPANTS_PER_ROOM: z.coerce.number().int().positive().default(20),
  VOICE_NEGOTIATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  VOICE_NEGOTIATION_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): Environment {
  const parsed = environmentSchema.safeParse(config);

  if (!parsed.success) {
    const details = JSON.stringify(parsed.error.flatten().fieldErrors);
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return parsed.data;
}
