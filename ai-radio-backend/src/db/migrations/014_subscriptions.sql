-- 014_subscriptions.sql
-- Add subscription fields to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_platform TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_product_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_original_transaction_id TEXT;

-- Index for quick subscription lookups
CREATE INDEX IF NOT EXISTS idx_users_subscription ON users (subscription_status) WHERE subscription_status = 'premium';
