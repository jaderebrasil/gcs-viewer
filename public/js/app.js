// Entry point — wires together the file picker, drag-and-drop, and Drive URL flow.

function setState(name) {
  document.body.className = 'state-' + name;
}

function showLoading(msg) {
  document.getElementById('loading').querySelector('.spinner').textContent = msg || 'Loading…';
  setState('loading');
}

function showError(err) {
  console.error(err);
  document.getElementById('error-text').textContent = err?.message || String(err);
  setState('error');
}

function showLanding() {
  setState('landing');
}

function loadFromText(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    showError(new Error('This file is not valid JSON. Is it really a .gcs file?'));
    return;
  }
  try {
    render(parseGCS(raw));
  } catch (e) {
    showError(e);
  }
}

function loadFromFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => loadFromText(e.target.result);
  reader.onerror = () => showError(new Error('Could not read the file.'));
  reader.readAsText(file);
}

async function loadFromUrl(url) {
  showLoading('Fetching…');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const text = await res.text();
    loadFromText(text);
  } catch (e) {
    showError(new Error(`Could not fetch URL: ${e.message}`));
  }
}

async function loadFromDrive(rawId) {
  const fileId = driveFileIdFromUrl(rawId);
  showLoading('Fetching from Google Drive…');
  try {
    const raw = await fetchDriveFile(fileId);
    render(parseGCS(raw));
  } catch (e) {
    showError(e);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // ── URL parameter: ?id=<file-id or share-url> ──────────────────────────────
  const params = new URLSearchParams(location.search);
  const urlParam = params.get('url');
  if (urlParam) {
    loadFromUrl(urlParam);
    return;
  }

  const idParam = params.get('id');
  if (idParam) {
    loadFromDrive(idParam);
    return;
  }

  // ── Drive "Open with" state parameter ─────────────────────────────────────
  // Drive sends ?state={"action":"open","ids":["<id>"],...}
  const stateParam = params.get('state');
  if (stateParam) {
    try {
      const state = JSON.parse(stateParam);
      if (state.action === 'open' && state.ids?.length) {
        loadFromDrive(state.ids[0]);
        return;
      }
    } catch (_) { /* not a Drive state — fall through */ }
  }

  // ── Landing page ───────────────────────────────────────────────────────────
  showLanding();

  // File picker
  document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadFromFile(file);
  });

  // Public URL form
  document.getElementById('url-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = document.getElementById('url-input').value.trim();
    if (val) loadFromUrl(val);
  });

  // Drive ID input form
  document.getElementById('drive-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = document.getElementById('drive-id-input').value.trim();
    if (val) loadFromDrive(val);
  });

  // Drag and drop
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('drag-over');
  });
  document.body.addEventListener('dragleave', () => {
    document.body.classList.remove('drag-over');
  });
  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.endsWith('.gcs')) {
      showError(new Error(`Expected a .gcs file, got "${file.name}"`));
      return;
    }
    loadFromFile(file);
  });
});
