ALTER TABLE "voice_sessions"
  ADD COLUMN "media_state" VARCHAR(32) NOT NULL DEFAULT 'idle',
  ADD COLUMN "negotiation_deadline" TIMESTAMPTZ(6),
  ADD COLUMN "router_id" VARCHAR(64),
  ADD COLUMN "send_transport_id" VARCHAR(64),
  ADD COLUMN "recv_transport_id" VARCHAR(64),
  ADD COLUMN "producer_id" VARCHAR(64),
  ADD CONSTRAINT "voice_sessions_media_state_check"
    CHECK ("media_state" IN ('idle', 'negotiating', 'connected', 'reconnecting', 'failed'));

CREATE INDEX "voice_sessions_media_state_negotiation_deadline_idx"
  ON "voice_sessions"("media_state", "negotiation_deadline");
