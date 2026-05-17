// Google Drive API integration using Google Identity Services (GIS).
// No server required — all OAuth happens client-side via a popup.

let _accessToken = null;

// Returns a valid access token, triggering sign-in if needed.
async function getAccessToken() {
  if (_accessToken) return _accessToken;
  _accessToken = await signIn();
  return _accessToken;
}

// Triggers a Google sign-in popup and resolves with the access token.
function signIn() {
  return new Promise((resolve, reject) => {
    if (typeof google === 'undefined') {
      reject(new Error('Google Identity Services script has not loaded. Check your internet connection.'));
      return;
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(`Google sign-in failed: ${resp.error}`));
        } else {
          resolve(resp.access_token);
        }
      },
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}

// Fetches a Drive file's content and returns the parsed JSON.
// First tries as a public file (API key only); on 401/403 prompts sign-in.
async function fetchDriveFile(fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

  // Attempt 1 — public access with API key only
  if (GOOGLE_API_KEY && GOOGLE_API_KEY !== 'YOUR_API_KEY') {
    const res = await fetch(`${url}&key=${encodeURIComponent(GOOGLE_API_KEY)}`);
    if (res.ok) return res.json();
    if (res.status !== 401 && res.status !== 403) {
      throw new Error(`Drive request failed (${res.status}): ${await res.text()}`);
    }
  }

  // Attempt 2 — authenticated access
  const token = await getAccessToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Drive request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// Extracts a file ID from a standard Google Drive share URL, or returns the
// input unchanged if it doesn't look like a URL.
function driveFileIdFromUrl(input) {
  const m = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : input.trim();
}
