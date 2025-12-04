-- Database Schema for Collaborative Whiteboard
-- WARNING: This will delete all existing data!

-- Drop existing tables
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS whiteboards CASCADE;

-- Whiteboards table
CREATE TABLE whiteboards (
  id UUID PRIMARY KEY,
  elements JSONB DEFAULT '[]'::jsonb,
  app_state JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- Participants table
CREATE TABLE participants (
  id BIGSERIAL PRIMARY KEY,
  whiteboard_id UUID REFERENCES whiteboards(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  ip_address TEXT,
  system_info TEXT,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime for whiteboards
ALTER PUBLICATION supabase_realtime ADD TABLE whiteboards;

-- Index for performance
CREATE INDEX idx_whiteboards_last_activity ON whiteboards(last_activity);
CREATE INDEX idx_participants_whiteboard ON participants(whiteboard_id);

-- Function to clean up old boards (empty for more than 1 hour)
-- This should be run periodically via a cron job or Supabase Edge Function
CREATE OR REPLACE FUNCTION cleanup_old_boards()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete boards that haven't had activity in 1 hour AND have no elements
  DELETE FROM whiteboards
  WHERE last_activity < NOW() - INTERVAL '1 hour'
    AND (elements IS NULL OR elements = '[]'::jsonb);
  
  -- Optionally, you could also clean up boards with content after a longer period
  -- DELETE FROM whiteboards
  -- WHERE last_activity < NOW() - INTERVAL '7 days';
END;
$$;

-- Optional: Create a scheduled job (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-old-boards', '0 * * * *', 'SELECT cleanup_old_boards()');
