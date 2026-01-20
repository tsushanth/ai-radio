-- Live Stations Migration
-- Continuously updating news streams

-- Live stations table
CREATE TABLE IF NOT EXISTS live_stations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'radio',
    color TEXT DEFAULT '#EF4444',
    category TEXT NOT NULL CHECK (category IN ('news', 'technology', 'business', 'sports', 'entertainment', 'world')),
    refresh_interval_minutes INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT true,
    listener_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Live station episodes table
CREATE TABLE IF NOT EXISTS live_station_episodes (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL REFERENCES live_stations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    audio_url TEXT,
    audio_path TEXT,
    duration_seconds INTEGER,
    headlines JSONB DEFAULT '[]',
    script TEXT,
    generated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_live_station_episodes_station_id ON live_station_episodes(station_id);
CREATE INDEX IF NOT EXISTS idx_live_station_episodes_created_at ON live_station_episodes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_stations_category ON live_stations(category);
CREATE INDEX IF NOT EXISTS idx_live_stations_is_active ON live_stations(is_active);

-- Function to increment listener count
CREATE OR REPLACE FUNCTION increment_listener_count(station_id TEXT)
RETURNS void AS $$
BEGIN
    UPDATE live_stations
    SET listener_count = listener_count + 1,
        updated_at = NOW()
    WHERE id = station_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_live_station_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER live_stations_updated_at
    BEFORE UPDATE ON live_stations
    FOR EACH ROW
    EXECUTE FUNCTION update_live_station_timestamp();

-- RLS Policies (public read, admin write)
ALTER TABLE live_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_station_episodes ENABLE ROW LEVEL SECURITY;

-- Everyone can read stations
CREATE POLICY "Live stations are publicly readable"
    ON live_stations FOR SELECT
    USING (true);

-- Everyone can read episodes
CREATE POLICY "Live station episodes are publicly readable"
    ON live_station_episodes FOR SELECT
    USING (true);

-- Service role can insert/update stations
CREATE POLICY "Service role can manage live stations"
    ON live_stations FOR ALL
    USING (auth.role() = 'service_role');

-- Service role can insert/update episodes
CREATE POLICY "Service role can manage live station episodes"
    ON live_station_episodes FOR ALL
    USING (auth.role() = 'service_role');
