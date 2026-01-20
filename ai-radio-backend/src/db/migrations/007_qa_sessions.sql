-- Q&A Sessions Migration
-- Interactive question and answer about content

-- Q&A sessions table
CREATE TABLE IF NOT EXISTS qa_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    context_type TEXT NOT NULL CHECK (context_type IN ('topic', 'deep_dive', 'live_station', 'daily_brief')),
    context_id TEXT NOT NULL,
    context_title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Q&A messages table
CREATE TABLE IF NOT EXISTS qa_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    audio_url TEXT,
    audio_path TEXT,
    duration_seconds INTEGER,
    sources JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qa_sessions_user_id ON qa_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_qa_sessions_context ON qa_sessions(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_qa_sessions_updated_at ON qa_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_messages_session_id ON qa_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_qa_messages_created_at ON qa_messages(created_at);

-- Trigger to update session updated_at when message added
CREATE OR REPLACE FUNCTION update_qa_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE qa_sessions
    SET updated_at = NOW()
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER qa_message_added
    AFTER INSERT ON qa_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_qa_session_timestamp();

-- RLS Policies
ALTER TABLE qa_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_messages ENABLE ROW LEVEL SECURITY;

-- Users can read their own sessions
CREATE POLICY "Users can read own Q&A sessions"
    ON qa_sessions FOR SELECT
    USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Users can create their own sessions
CREATE POLICY "Users can create own Q&A sessions"
    ON qa_sessions FOR INSERT
    WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Users can update their own sessions
CREATE POLICY "Users can update own Q&A sessions"
    ON qa_sessions FOR UPDATE
    USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Users can delete their own sessions
CREATE POLICY "Users can delete own Q&A sessions"
    ON qa_sessions FOR DELETE
    USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Messages follow session ownership
CREATE POLICY "Users can read own Q&A messages"
    ON qa_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM qa_sessions
            WHERE qa_sessions.id = qa_messages.session_id
            AND (qa_sessions.user_id = auth.uid()::text OR auth.role() = 'service_role')
        )
    );

-- Service role can manage all messages
CREATE POLICY "Service role can manage Q&A messages"
    ON qa_messages FOR ALL
    USING (auth.role() = 'service_role');
