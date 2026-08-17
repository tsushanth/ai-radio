-- 003_add_voice_id_to_users.sql
-- Adds the voice_id + voice_cloned_at columns to the users table so we can
-- link a user to their cloned-voice tone-color embedding on the OpenVoice
-- host. Embeddings themselves (~2KB .pth) live on the audexa-radio Hetzner
-- box under /opt/audexa-clip/storage/voices/<voice_id>.pth — Supabase only
-- holds the pointer.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS voice_id        text,
  ADD COLUMN IF NOT EXISTS voice_cloned_at timestamptz;

-- A user has at most one cloned voice at a time. Re-cloning overwrites
-- voice_id; the old embedding file on the host is orphaned (cleanup happens
-- in a separate sweep job — not in scope for this migration).
CREATE UNIQUE INDEX IF NOT EXISTS users_voice_id_unique
  ON users (voice_id)
  WHERE voice_id IS NOT NULL;
