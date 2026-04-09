-- migration-improvements.sql
-- Creates the improvements table for the Future Improvements / Ideas tracker.
--
-- HOW TO RUN:
-- 1. Open the Supabase Dashboard → SQL Editor
-- 2. Paste and run this entire file
-- OR
-- Use the Supabase CLI:  supabase db push
--
-- TRIGGER DEPENDENCY:
-- This migration uses update_updated_at() which was created in the initial
-- migration (supabase/migration.sql). Run that first if setting up fresh.

CREATE TABLE IF NOT EXISTS improvements (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  title        text        NOT NULL,
  description  text        DEFAULT '',
  status       text        NOT NULL DEFAULT 'idea'
                           CHECK (status IN ('idea', 'planned', 'in-progress', 'done')),
  priority     text        NOT NULL DEFAULT 'medium'
                           CHECK (priority IN ('low', 'medium', 'high')),
  submitted_by text        DEFAULT '',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- Row Level Security (service role bypasses all policies)
ALTER TABLE improvements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on improvements"
  ON improvements FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at on every row update
CREATE TRIGGER improvements_updated_at
  BEFORE UPDATE ON improvements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
