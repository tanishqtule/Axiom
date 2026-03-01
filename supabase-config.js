/* ════════════════════════════════════════════════════════
   AXIOM — Supabase Configuration
   ──────────────────────────────────────────────────────
   HOW TO CONFIGURE (takes ~2 minutes):
   1. Go to https://supabase.com/dashboard → your project
   2. Click "Settings" (gear icon) → "API"
   3. Copy "Project URL"       → paste below as supabaseUrl
   4. Copy "anon public" key   → paste below as supabaseKey
   5. Save this file. That's it!
════════════════════════════════════════════════════════ */

const AXIOM_CONFIG = {
  supabaseUrl:  'https://hzrddplcieqarxtxzgay.supabase.co',
  supabaseKey:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6cmRkcGxjaWVxYXJ4dHh6Z2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMDg3NTEsImV4cCI6MjA4Nzg4NDc1MX0.fLg3EfMm4KZxYUjqxGe9DQezizjqVIm2kjaj1bd9P00',
  loginPage:    'login.html',
  mainPage:     'index.html',

  get isConfigured() {
    return this.supabaseUrl  !== 'YOUR_SUPABASE_URL_HERE'
        && this.supabaseKey  !== 'YOUR_SUPABASE_ANON_KEY_HERE';
  }
};

// Initialise Supabase client only when real credentials are present
// (requires the @supabase/supabase-js CDN script to be loaded first)
if (AXIOM_CONFIG.isConfigured && window.supabase) {
  window.axiomSupabase = window.supabase.createClient(
    AXIOM_CONFIG.supabaseUrl,
    AXIOM_CONFIG.supabaseKey,
    {
      auth: {
        // Store session in localStorage so it persists across page reloads
        persistSession: true,
        autoRefreshToken: true
      }
    }
  );
}
