-- ════════════════════════════════════════════════════════
--  AXIOM — Supabase Schema
--  ──────────────────────────────────────────────────────
--  HOW TO USE:
--  1. Go to https://supabase.com/dashboard → your project
--  2. Click "SQL Editor" in the left sidebar
--  3. Click "+ New query"
--  4. Paste this entire file and click "Run"
--  That's it! Your database is ready.
-- ════════════════════════════════════════════════════════


-- ── 1. Notes table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users NOT NULL,
  title       TEXT        NOT NULL DEFAULT 'Untitled Note',
  content     TEXT        DEFAULT '',
  tags        TEXT[]      DEFAULT '{}',
  is_favorite BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ── 2. Enable Row Level Security ────────────────────────
--  This ensures users can ONLY see and edit their own notes.
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;


-- ── 3. RLS policy ───────────────────────────────────────
--  Drop first in case it already exists, then recreate.
DROP POLICY IF EXISTS "users_own_notes" ON notes;

CREATE POLICY "users_own_notes" ON notes
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── 4. Auto-update updated_at on row changes ────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notes_set_updated_at ON notes;

CREATE TRIGGER notes_set_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();


-- ── 5. Index for fast per-user queries ──────────────────
CREATE INDEX IF NOT EXISTS notes_user_id_idx
  ON notes (user_id, updated_at DESC);


-- ════════════════════════════════════════════════════════
--  Done! You can now configure Google OAuth:
--
--  Supabase Dashboard → Authentication → Providers → Google
--    • Toggle Google ON
--    • Paste your Google Client ID and Client Secret
--    • Copy the "Callback URL (for OAuth)" shown there
--
--  Google Cloud Console → APIs & Services → Credentials
--    → OAuth 2.0 Client IDs → your client
--    → Add the Supabase callback URL to "Authorised redirect URIs"
--
--  Supabase Dashboard → Authentication → URL Configuration
--    → Add http://localhost:3000/index.html to "Redirect URLs"
-- ════════════════════════════════════════════════════════
