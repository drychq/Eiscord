CREATE TABLE "permission_overwrites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "channel_id" UUID NOT NULL,
  "target_type" VARCHAR(20) NOT NULL,
  "target_id" UUID NOT NULL,
  "allow_bits" BIGINT NOT NULL DEFAULT 0,
  "deny_bits" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "permission_overwrites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "permission_overwrites_target_type_check" CHECK ("target_type" IN ('role', 'member')),
  CONSTRAINT "permission_overwrites_nonnegative_bits_check" CHECK ("allow_bits" >= 0 AND "deny_bits" >= 0)
);

CREATE UNIQUE INDEX "permission_overwrites_channel_id_target_type_target_id_key"
  ON "permission_overwrites"("channel_id", "target_type", "target_id");
CREATE INDEX "permission_overwrites_target_type_target_id_idx"
  ON "permission_overwrites"("target_type", "target_id");

ALTER TABLE "permission_overwrites"
  ADD CONSTRAINT "permission_overwrites_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "roles"
SET
  "permission_bits" = 19,
  "updated_at" = NOW()
WHERE "is_default" = TRUE
  AND "permission_bits" = 0;
