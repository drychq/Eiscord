import { z } from 'zod';

import { userSummarySchema } from './user';

export const registerRequestSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_]{3,32}$/, 'Username must be 3-32 alphanumeric or underscore characters.'),
    email_or_phone: z.string().min(1).max(320),
    password: z.string().min(8).max(128),
    verification_token: z.string().max(200).optional(),
  })
  .strict();

export const registerResponseSchema = z.object({
  user_id: z.string().uuid(),
  account_status: z.string().min(1),
});

export const loginClientSchema = z
  .object({
    device_name: z.string().max(120).optional(),
    timezone: z.string().max(80).optional(),
  })
  .strict();

export const loginRequestSchema = z
  .object({
    login_identifier: z.string().min(1).max(320),
    password: z.string().min(1).max(128),
    client: loginClientSchema.optional(),
  })
  .strict();

export const loginSummariesSchema = z.object({
  servers: z.array(z.unknown()),
  friends: z.array(z.unknown()),
  notifications: z.array(z.unknown()),
  unread: z.array(z.unknown()),
});

export const loginResponseSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    user: userSummarySchema,
  })
  .merge(loginSummariesSchema);

export const refreshRequestSchema = z
  .object({
    refresh_token: z.string().min(20),
  })
  .strict();

export const refreshResponseSchema = loginResponseSchema;

export const logoutResponseSchema = z.object({
  ok: z.literal(true),
});

export const forgotPasswordRequestSchema = z
  .object({
    email: z.string().email().max(320),
  })
  .strict();

export const forgotPasswordResponseSchema = z.object({
  message: z.string().min(1),
});

export const resetPasswordRequestSchema = z
  .object({
    email: z.string().email().max(320),
    code: z.string().regex(/^\d{6}$/, 'Verification code must be 6 digits.'),
    new_password: z
      .string()
      .min(8)
      .max(128)
      .regex(/[A-Za-z]/, 'Password must include letters.')
      .regex(/\d/, 'Password must include digits.'),
  })
  .strict();

export const resetPasswordResponseSchema = z.object({
  message: z.string().min(1),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export type LoginClient = z.infer<typeof loginClientSchema>;

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
