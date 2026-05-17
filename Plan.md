# GCS Drive Viewer — Plan

A static HTML + JS + CSS single-page app for viewing `.gcs` GURPS Character Sheet files.
No build step required. Deploys to Netlify, GitHub Pages, or any static host.

## Two entry points

| Mode | How |
|---|---|
| **Local file** | Drag & drop a `.gcs` file onto the page, or use the file picker |
| **Google Drive** | Add `?id=<google-drive-file-id>` to the URL |

---

## File structure

```
drive/
  Plan.md              ← this file
  index.html           ← app shell, layout, Google API script tags
  css/
    sheet.css          ← character sheet styles
  js/
    config.js          ← GOOGLE_CLIENT_ID and GOOGLE_API_KEY (user edits once)
    parser.js          ← raw .gcs JSON → normalized display model
    renderer.js        ← display model → DOM
    drive.js           ← Google Identity Services OAuth + Drive API v3 fetch
    app.js             ← entry point: wires local file, URL param, Drive flow
```

---

## .gcs JSON — what the parser needs to know

`.gcs` files are plain JSON (version 5). The key fields:

```
{
  version: 5,
  profile: { name, player_name, title, gender, age, height, weight,
             eyes, hair, skin, SM, tech_level, portrait (base64) },
  total_points: fxp,
  attributes: [           ← array, not map
    { attr_id, adj, damage,
      calc: { value, current, points } }   ← use calc.value for display
  ],
  traits:     [ ...nodes ],    ← may have children[] (containers)
  skills:     [ ...nodes ],    ← calc: { level, rsl, points }
  spells:     [ ...nodes ],    ← same as skills
  equipment:  [ ...nodes ],    ← "description" is the name field
                                  calc: { extended_value, extended_weight }
  other_equipment: [ ...nodes ],
  notes:      [ ...nodes ],    ← calc: { resolved_text }
  calc: { swing, thrust, basic_lift, move[5], dodge[5] }
}
```

`fxp` values may be JSON strings or numbers — always use `parseFloat()`.
All major node types support `children[]` for nested containers.
Disabled traits have `disabled: true`. Unequipped items have `equipped: false`.

---

## parser.js

```js
function parseGCS(raw) → {
  version, profile, totalPoints, unspentPoints,
  attributes,        // [{ id, name, value, current, points }]
  traits,            // [{ depth, name, points, disabled, tags, ... }]
  skills,            // [{ depth, name, specialization, difficulty, level, rsl, points }]
  spells,            // [{ depth, name, college, level, rsl, points }]
  carriedEquipment,  // [{ depth, name, qty, weight, value, equipped }]
  otherEquipment,
  notes,             // [{ depth, text }]
  calc               // { swing, thrust, basicLift, move[], dodge[] }
}
```

- `parseAttributes(raw.attributes, raw.settings?.attributes)` — match attr_id to definition names (fall back to attr_id if settings missing)
- `flattenTree(nodes, depth=0)` — recurse into `children[]`, prepend a `depth` field to each node for indented rendering

---

## renderer.js

Renders these sections in order, each as a collapsible `<details>` block:

1. **Header** — portrait image, name, player, title, TL, total/unspent points
2. **Primary attributes** — ST, DX, IQ, HT (grid)
3. **Secondary attributes** — HP/FP pools (current/max), Will, Per, Basic Speed, Basic Move
4. **Combat** — Swing, Thrust, Basic Lift, Dodge/Move per encumbrance level
5. **Traits** — table: name (indented by depth), points, tags
6. **Skills** — table: name/specialization, attribute+difficulty, relative level, level
7. **Spells** — table: name, college, attribute+difficulty, level
8. **Carried equipment** — table: name (indented), qty, weight, value; greys out unequipped
9. **Other equipment** — same
10. **Notes** — rendered as `<pre>` text

Portrait: `<img src="data:image/...;base64,${profile.portrait}">` (field is already raw base64).

---

## drive.js — Google Drive fetch with graceful auth

```js
async function fetchDriveFile(fileId):
  1. Try public fetch:
       GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media&key={API_KEY}
  2. If 401/403 → trigger Google sign-in popup (GIS token client)
       scope: https://www.googleapis.com/auth/drive.readonly
  3. Retry with Authorization: Bearer {token}
  4. Return parsed JSON
```

Uses `google.accounts.oauth2.initTokenClient` (GIS popup flow — no redirect needed).
Access token stored in memory only (not localStorage) — user re-auths per session.

---

## app.js — entry point

```js
DOMContentLoaded:
  if URL has ?id=<fileId>  →  fetchDriveFile(fileId) → parseGCS → render
  else                     →  show landing (file picker + drag-drop)

file-input change  →  FileReader → parseGCS → render
body drop          →  FileReader → parseGCS → render (only .gcs files)
```

---

## index.html structure

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>

<div id="landing">        ← hidden after a file loads
  <input type="file" id="file-input" accept=".gcs">
  drag a .gcs file here — or add ?id=<drive-file-id> to the URL
</div>

<div id="sheet" hidden>   ← populated by renderer.js
  <header>...</header>
  <details id="traits">...</details>
  <details id="skills">...</details>
  ...
</div>
```

---

## Google Cloud setup (one-time, ~10 min)

1. [console.cloud.google.com](https://console.cloud.google.com) → new project
2. **APIs & Services → Enable APIs** → enable **Google Drive API**
3. **Credentials → Create → API Key** → paste into `js/config.js` as `GOOGLE_API_KEY`
4. **Credentials → Create → OAuth 2.0 Client ID** → type: **Web application**
   - Authorized JavaScript origins: `https://your-app.netlify.app` and `http://localhost:8000`
   - Paste Client ID into `js/config.js` as `GOOGLE_CLIENT_ID`
5. Share a `.gcs` Drive file → copy the ID from the share URL → use as `?id=<ID>`

For private files, the user will see a Google sign-in popup the first time.
For files shared as "Anyone with the link can view", no sign-in is needed.

---

## Deployment to Netlify

Drag the `drive/` folder to [app.netlify.com/drop](https://app.netlify.com/drop).
Add the deployed URL to your OAuth client's Authorized JavaScript origins.

---

## Testing checklist

- [ ] Serve locally: `python3 -m http.server 8000` inside `drive/`, open `http://localhost:8000`
- [ ] Local file: drag a `.gcs` file → all sections render, portrait shows if present
- [ ] Nested items: traits/equipment containers show child rows indented
- [ ] Disabled traits: rendered in grey / strikethrough
- [ ] Drive public file: `?id=<id>` with no auth, sheet loads
- [ ] Drive private file: `?id=<id>` triggers Google sign-in popup, then loads
- [ ] Deployed to Netlify: Drive auth works with production origin
