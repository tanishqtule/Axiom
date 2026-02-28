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
  supabaseUrl:  'YOUR_SUPABASE_URL_HERE',       // e.g. https://abcdef.supabase.co
  supabaseKey:  'YOUR_SUPABASE_ANON_KEY_HERE',  // eyJhbGci... (long key)
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
