-- Custom Sources Migration
-- User-added RSS feeds, newsletters, and websites

-- Custom sources table
CREATE TABLE IF NOT EXISTS custom_sources (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('rss', 'newsletter', 'website', 'youtube', 'podcast')),
    icon TEXT,
    color TEXT DEFAULT '#10B981',
    is_active BOOLEAN DEFAULT true,
    last_fetched_at TIMESTAMP WITH TIME ZONE,
    item_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'paused', 'error', 'pending')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Prevent duplicate URLs per user
    UNIQUE(user_id, url)
);

-- Custom source items table
CREATE TABLE IF NOT EXISTS custom_source_items (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES custom_sources(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    content TEXT,
    summary TEXT,
    author TEXT,
    published_at TIMESTAMP WITH TIME ZONE,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_read BOOLEAN DEFAULT false,
    is_included_in_brief BOOLEAN DEFAULT true,

    -- Prevent duplicate URLs per source
    UNIQUE(source_id, url)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_custom_sources_user_id ON custom_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_sources_type ON custom_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_custom_sources_status ON custom_sources(status);
CREATE INDEX IF NOT EXISTS idx_custom_sources_is_active ON custom_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_custom_source_items_source_id ON custom_source_items(source_id);
CREATE INDEX IF NOT EXISTS idx_custom_source_items_published_at ON custom_source_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_source_items_is_read ON custom_source_items(is_read);
CREATE INDEX IF NOT EXISTS idx_custom_source_items_brief ON custom_source_items(is_included_in_brief);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_custom_source_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custom_sources_updated_at
    BEFORE UPDATE ON custom_sources
    FOR EACH ROW
    EXECUTE FUNCTION update_custom_source_timestamp();

-- Function to update item count when items are added/removed
CREATE OR REPLACE FUNCTION update_source_item_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE custom_sources
        SET item_count = item_count + 1
        WHERE id = NEW.source_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE custom_sources
        SET item_count = item_count - 1
        WHERE id = OLD.source_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custom_source_items_count
    AFTER INSERT OR DELETE ON custom_source_items
    FOR EACH ROW
    EXECUTE FUNCTION update_source_item_count();

-- RLS Policies
ALTER TABLE custom_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_source_items ENABLE ROW LEVEL SECURITY;

-- Users can read their own sources
CREATE POLICY "Users can read own custom sources"
    ON custom_sources FOR SELECT
    USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Users can create their own sources
CREATE POLICY "Users can create own custom sources"
    ON custom_sources FOR INSERT
    WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Users can update their own sources
CREATE POLICY "Users can update own custom sources"
    ON custom_sources FOR UPDATE
    USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Users can delete their own sources
CREATE POLICY "Users can delete own custom sources"
    ON custom_sources FOR DELETE
    USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Items follow source ownership
CREATE POLICY "Users can read own source items"
    ON custom_source_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM custom_sources
            WHERE custom_sources.id = custom_source_items.source_id
            AND (custom_sources.user_id = auth.uid()::text OR auth.role() = 'service_role')
        )
    );

-- Service role can manage all items
CREATE POLICY "Service role can manage source items"
    ON custom_source_items FOR ALL
    USING (auth.role() = 'service_role');
