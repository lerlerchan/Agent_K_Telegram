-- Supabase Schema for Tele Agent K
-- Run this in your Supabase SQL Editor

-- Sessions table: Store Claude Code session IDs for conversation continuity
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id TEXT UNIQUE NOT NULL,
  session_id TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_sessions_telegram_user_id ON sessions(telegram_user_id);

-- Audit log: Track all interactions
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id TEXT NOT NULL,
  user_message TEXT,
  bot_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_telegram_user_id ON audit_log(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- Optional: Stored credentials (for automated tasks)
-- WARNING: Encrypt sensitive data before storing!
CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id TEXT NOT NULL,
  service TEXT NOT NULL,           -- 'gmail', 'ssm', etc.
  encrypted_data TEXT NOT NULL,    -- Encrypted JSON with username/password
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(telegram_user_id, service)
);

-- Optional: Task queue for long-running tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  task_description TEXT,
  status TEXT DEFAULT 'pending',   -- 'pending', 'running', 'completed', 'failed'
  result TEXT,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_telegram_user_id ON tasks(telegram_user_id);

-- Row Level Security (optional but recommended)
-- Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (for your backend)
CREATE POLICY "Service role full access" ON sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON audit_log
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON credentials
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON tasks
  FOR ALL USING (auth.role() = 'service_role');
