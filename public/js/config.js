// ─── Google Cloud credentials ────────────────────────────────────────────────
// 1. Go to https://console.cloud.google.com and create a project.
// 2. Enable the Google Drive API.
// 3. Create an API Key → paste below as GOOGLE_API_KEY.
// 4. Create an OAuth 2.0 Web Client ID (type: "Web application").
//    Add your deployed URL and http://localhost:8000 as Authorized JS origins.
//    Paste the Client ID below as GOOGLE_CLIENT_ID.
// ─────────────────────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_API_KEY   = 'YOUR_API_KEY';
const DRIVE_SCOPE      = 'https://www.googleapis.com/auth/drive.readonly';
