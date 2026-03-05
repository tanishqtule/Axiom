/* ════════════════════════════════════════════════════════
   AXIOM — Firebase Configuration
   ──────────────────────────────────────────────────────
   HOW TO CONFIGURE (takes ~5 minutes):

   1. Go to https://console.firebase.google.com
   2. Open your "axiom" project
   3. Click the gear icon (⚙) → Project settings
   4. Scroll to "Your apps" → click your web app (</>)
      (Create one if none exists: click "Add app" → Web)
   5. Copy the firebaseConfig values into AXIOM_FIREBASE_CONFIG below

   6. Enable Google Sign-In:
      Authentication → Sign-in method → Google → Enable → Save

   7. Create Firestore Database:
      Firestore Database → Create database → Start in production mode
      Choose a region close to your users → Done

   8. Set Firestore Security Rules (Firestore → Rules tab):
      Paste the rules from the comment block below → Publish

   9. Add authorised domains for Google Auth (if using GitHub Pages):
      Authentication → Settings → Authorised domains
      Add: tanishqtule.github.io
════════════════════════════════════════════════════════ */

const AXIOM_FIREBASE_CONFIG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT_ID.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId:             'YOUR_APP_ID',

  loginPage: 'login.html',
  mainPage:  'index.html',

  get isConfigured() {
    return this.apiKey !== 'YOUR_API_KEY'
        && this.projectId !== 'YOUR_PROJECT_ID';
  }
};

/*
 ════════════════════════════════════════════════════════
 FIRESTORE SECURITY RULES
 Paste these in Firebase Console → Firestore Database → Rules
 ════════════════════════════════════════════════════════

 rules_version = '2';
 service cloud.firestore {
   match /databases/{database}/documents {
     // Notes: only the owner can read or write their notes
     match /notes/{noteId} {
       allow read, write: if request.auth != null
           && resource.data.user_id == request.auth.uid;
       allow create: if request.auth != null
           && request.resource.data.user_id == request.auth.uid;
     }
   }
 }

 ════════════════════════════════════════════════════════
*/

/* ── Initialise Firebase when credentials are present ── */
if (typeof firebase !== 'undefined' && AXIOM_FIREBASE_CONFIG.isConfigured) {

  // Prevent double-initialisation (e.g. if this file is loaded twice)
  const existingApp = firebase.apps.find(a => a.name === '[DEFAULT]');
  const app = existingApp || firebase.initializeApp(AXIOM_FIREBASE_CONFIG);

  /* Global auth + Firestore handles used by app.js and login.html */
  window.axiomAuth = firebase.auth(app);
  window.axiomDb   = firebase.firestore(app);
  window.axiomFirebaseConfig = AXIOM_FIREBASE_CONFIG;

  /* Enable multi-tab offline persistence (best-effort) */
  window.axiomDb
    .enablePersistence({ synchronizeTabs: true })
    .catch(err => {
      if (err.code === 'failed-precondition') {
        // Multiple tabs open — only one tab can use offline persistence at a time
        console.warn('[Axiom] Offline persistence limited to one tab at a time.');
      } else if (err.code === 'unimplemented') {
        console.warn('[Axiom] Offline persistence is not supported in this browser.');
      }
    });

} else if (typeof firebase === 'undefined') {
  console.warn('[Axiom] Firebase SDK not loaded. Check your internet connection.');
} else {
  console.warn('[Axiom] Firebase not configured — fill in firebase-config.js with your project values.');
}
