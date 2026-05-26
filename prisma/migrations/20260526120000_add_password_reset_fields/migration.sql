-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_reset_code_hash" VARCHAR(64),
ADD COLUMN     "password_reset_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "password_reset_attempts" INTEGER NOT NULL DEFAULT 0;
