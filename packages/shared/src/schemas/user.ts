import { z } from 'zod';

export const userSummarySchema = z.object({
  account_status: z.string().min(1),
  avatar_attachment_id: z.string().uuid().nullable(),
  bio: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
  nickname: z.string().min(1),
  presence_status: z.string().min(1),
  user_id: z.string().uuid(),
  username: z.string().min(1),
});

export const updateProfileRequestSchema = z
  .object({
    nickname: z.string().trim().min(1).max(64).optional(),
    avatar_attachment_id: z.string().uuid().nullable().optional(),
    bio: z.string().max(280).nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.nickname !== undefined ||
      value.avatar_attachment_id !== undefined ||
      value.bio !== undefined,
    { message: 'At least one profile field must be provided.' },
  );

export type UserSummary = z.infer<typeof userSummarySchema>;

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
