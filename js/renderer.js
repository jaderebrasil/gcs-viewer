// Renders a parsed GCS display model into the #sheet element.

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function detectImageMime(base64) {
  try {
    const raw = atob(base64.slice(0, 16));
    const b = c => raw.charCodeAt(c);
    if (b(0) === 0xFF && b(1) === 0xD8)                    return 'image/jpeg';
    if (b(0) === 0x89 && b(1) === 0x50)                    return 'image/png';
    if (b(0) === 0x47 && b(1) === 0x49)                    return 'image/gif';
    if (b(0) === 0x42 && b(1) === 0x4D)                    return 'image/bmp';
    if (raw.startsWith('RIFF') && raw.slice(8, 12) === 'WEBP') return 'image/webp';
  } catch (_) { /* ignore */ }
  return 'image/jpeg';
}

function portraitSrc(portrait) {
  if (!portrait) return null;
  const mime = detectImageMime(portrait);
  return `data:${mime};base64,${portrait}`;
}

// Difficulty is stored as a string like "dx/e", "iq/h", "dx/a" — just uppercase it.
function fmtDifficulty(diff) {
  if (!diff) return '';
  if (typeof diff === 'string') return diff.toUpperCase();
  // Legacy object shape fallback
  const ABBREV = { easy: 'E', average: 'A', hard: 'H', very_hard: 'VH', wildcard: 'W!' };
  const attr = (diff.attribute || '').toUpperCase();
  const d    = ABBREV[diff.difficulty] || (diff.difficulty || '').toUpperCase();
  return `${attr}/${d}`;
}

// RSL comes from calc.rsl — already a formatted string like "DX+3" in current GCS.
function fmtRSL(rsl) {
  if (rsl == null) return '';
  if (typeof rsl === 'string') return rsl;
  // Numeric fallback (older format)
  const n = Math.round(parseFxp(rsl));
  return `${n >= 0 ? '+' : ''}${n}`;
}

// Weight may already be a formatted string like "34.8 lb" — display as-is.
// If it's a bare number, append the unit.
function fmtWeight(v) {
  if (v == null) return '—';
  if (typeof v === 'string') return v.trim() || '—';
  const n = parseFxp(v);
  return n === 0 ? '—' : String(n);
}

function fmtMoney(v) {
  const n = parseFxp(v);
  if (n === 0) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Dice may be a string like "1d+1" or a legacy object — handle both.
function diceStr(d) {
  if (!d) return '—';
  if (typeof d === 'string') return d;
  let s = '';
  if (d.count != null && d.count !== 0) s += `${d.count}d`;
  if (d.sides != null && d.sides !== 6) s += `${d.sides}`;
  if (d.modifier)                        s += d.modifier > 0 ? `+${d.modifier}` : d.modifier;
  if (d.multiplier && d.multiplier !== 1) s += `×${d.multiplier}`;
  return s || '—';
}

// All sections start collapsed — user expands what they need.
function section(id, title, body) {
  if (!body) return '';
  return `
    <details class="sheet-section" id="sec-${id}">
      <summary class="section-title">${esc(title)}</summary>
      <div class="section-body">${body}</div>
    </details>`;
}

function indentStyle(depth) {
  return depth > 0 ? ` style="padding-left:${depth * 16 + 4}px"` : '';
}

// ── Header ────────────────────────────────────────────────────────────────────

function buildHeader(profile, totalPoints, unspentPoints) {
  const src = portraitSrc(profile.portrait);
  const portraitHtml = src ? `<img class="portrait" src="${src}" alt="Portrait">` : '';

  const sm = profile.sizeModifier !== 0
    ? `<span class="sm">SM${profile.sizeModifier > 0 ? '+' : ''}${profile.sizeModifier}</span>`
    : '';

  const spent = unspentPoints != null
    ? `<div class="points-row"><span class="pts-label">Unspent</span><span class="pts-val ${unspentPoints < 0 ? 'pts-negative' : ''}">${unspentPoints}</span></div>`
    : '';

  const fields = [
    ['Player',   profile.playerName],
    ['Title',    profile.title],
    ['Org',      profile.organization],
    ['TL',       profile.techLevel],
    ['Gender',   profile.gender],
    ['Age',      profile.age],
    ['Height',   profile.height],
    ['Weight',   profile.weight],
    ['Eyes',     profile.eyes],
    ['Hair',     profile.hair],
    ['Skin',     profile.skin],
    ['Handed',   profile.handedness],
  ].filter(([, v]) => v).map(([k, v]) =>
    `<div class="ident-field"><span class="ident-label">${esc(k)}</span><span class="ident-val">${esc(v)}</span></div>`
  ).join('');

  return `
    <header class="sheet-header${src ? '' : ' no-portrait'}">
      ${portraitHtml ? `<div class="header-portrait">${portraitHtml}</div>` : ''}
      <div class="header-main">
        <h1 class="char-name">${esc(profile.name)} ${sm}</h1>
        <div class="ident-grid">${fields}</div>
      </div>
      <div class="header-points">
        <div class="points-row"><span class="pts-label">Points</span><span class="pts-val">${totalPoints}</span></div>
        ${spent}
      </div>
    </header>`;
}

// ── Attributes ────────────────────────────────────────────────────────────────

function buildAttributes(attributes) {
  if (!attributes.length) return '';

  const pools  = attributes.filter(a => a.isPool);
  const others = attributes.filter(a => !a.isPool);

  const attrBox = a => `
    <div class="attr-box">
      <div class="attr-name">${esc(a.shortName)}</div>
      <div class="attr-value">${a.value}</div>
    </div>`;

  const poolBox = a => `
    <div class="attr-box pool-box">
      <div class="attr-name">${esc(a.shortName)}</div>
      <div class="pool-values">
        <span class="pool-current">${a.current ?? a.value}</span>
        <span class="pool-sep">/</span>
        <span class="pool-max">${a.value}</span>
      </div>
    </div>`;

  return `
    <div class="attributes-section">
      <div class="attr-grid">
        ${others.map(attrBox).join('')}
        ${pools.map(poolBox).join('')}
      </div>
    </div>`;
}

// ── Combat block ──────────────────────────────────────────────────────────────

function buildCombat(calc) {
  const encNames = ['None', 'Light', 'Medium', 'Heavy', 'X-Heavy'];
  const encRows  = (calc.move || []).map((mv, i) =>
    `<tr><td>${encNames[i] || i}</td><td>${mv}</td><td>${(calc.dodge || [])[i] ?? '—'}</td></tr>`
  ).join('');

  // swing/thrust/basic_lift may already be formatted strings
  const swing  = calc.swing      ? diceStr(calc.swing)  : null;
  const thrust = calc.thrust     ? diceStr(calc.thrust) : null;
  const lift   = calc.basic_lift != null
    ? (typeof calc.basic_lift === 'string' ? calc.basic_lift : `${parseFxp(calc.basic_lift)} lb`)
    : null;

  const combatItems = [
    swing  && `<div class="combat-item"><span class="combat-label">Swing</span><span class="combat-val">${esc(swing)}</span></div>`,
    thrust && `<div class="combat-item"><span class="combat-label">Thrust</span><span class="combat-val">${esc(thrust)}</span></div>`,
    lift   && `<div class="combat-item"><span class="combat-label">Basic Lift</span><span class="combat-val">${esc(lift)}</span></div>`,
  ].filter(Boolean).join('');

  if (!combatItems && !encRows) return '';

  return `
    <div class="combat-section">
      ${combatItems ? `<div class="combat-grid">${combatItems}</div>` : ''}
      ${encRows ? `
      <table class="enc-table">
        <thead><tr><th>Encumbrance</th><th>Move</th><th>Dodge</th></tr></thead>
        <tbody>${encRows}</tbody>
      </table>` : ''}
    </div>`;
}

// ── Traits ────────────────────────────────────────────────────────────────────

function buildTraitsTable(traits) {
  if (!traits.length) return '';
  const rows = traits.map(t => {
    const isContainer = Array.isArray(t.children) && t.children.length > 0;
    const pts      = t.calc?.points != null ? parseFxp(t.calc.points) : '';
    const tags     = (t.tags || []).join(', ');
    const disabled = t.disabled ? ' disabled-row' : '';
    const notes    = t.local_notes || '';
    return `
      <tr class="${disabled}${isContainer ? ' container-row' : ''}">
        <td${indentStyle(t._depth)}>${isContainer ? '▸ ' : ''}${esc(t.name)}${notes ? `<br><small class="row-note">${esc(notes)}</small>` : ''}</td>
        <td class="col-pts">${pts !== '' ? pts : ''}</td>
        <td class="col-tags">${esc(tags)}</td>
      </tr>`;
  }).join('');
  return `
    <table class="data-table">
      <thead><tr><th>Trait</th><th class="col-pts">Pts</th><th class="col-tags">Tags</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Skills ────────────────────────────────────────────────────────────────────

function buildSkillsTable(skills) {
  if (!skills.length) return '';
  const rows = skills.map(s => {
    const isContainer = Array.isArray(s.children) && s.children.length > 0;
    const name  = s.specialization ? `${esc(s.name)} (${esc(s.specialization)})` : esc(s.name);
    const diff  = fmtDifficulty(s.difficulty);
    // calc.rsl is already a formatted string like "DX+3" in current GCS files
    const rsl   = !isContainer ? fmtRSL(s.calc?.rsl) : '';
    const level = !isContainer && s.calc?.level != null ? parseFxp(s.calc.level) : '';
    const pts   = !isContainer && s.calc?.points != null ? parseFxp(s.calc.points) : '';
    const notes = s.local_notes || '';
    return `
      <tr class="${isContainer ? 'container-row' : ''}">
        <td${indentStyle(s._depth)}>${isContainer ? '▸ ' : ''}${name}${notes ? `<br><small class="row-note">${esc(notes)}</small>` : ''}</td>
        <td class="col-diff">${esc(diff)}</td>
        <td class="col-rsl">${esc(rsl)}</td>
        <td class="col-level">${level !== '' ? level : ''}</td>
        <td class="col-pts">${pts !== '' ? pts : ''}</td>
      </tr>`;
  }).join('');
  return `
    <table class="data-table">
      <thead><tr><th>Skill</th><th class="col-diff">Difficulty</th><th class="col-rsl">RSL</th><th class="col-level">Level</th><th class="col-pts">Pts</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Spells ────────────────────────────────────────────────────────────────────

function buildSpellsTable(spells) {
  if (!spells.length) return '';
  const rows = spells.map(s => {
    const isContainer = Array.isArray(s.children) && s.children.length > 0;
    const college = (s.college || []).join(', ') || s.power_source || '';
    const diff    = fmtDifficulty(s.difficulty);
    const rsl     = !isContainer ? fmtRSL(s.calc?.rsl) : '';
    const level   = !isContainer && s.calc?.level != null ? parseFxp(s.calc.level) : '';
    const pts     = !isContainer && s.calc?.points != null ? parseFxp(s.calc.points) : '';
    return `
      <tr class="${isContainer ? 'container-row' : ''}">
        <td${indentStyle(s._depth)}>${isContainer ? '▸ ' : ''}${esc(s.name)}</td>
        <td>${esc(college)}</td>
        <td class="col-diff">${esc(diff)}</td>
        <td class="col-rsl">${esc(rsl)}</td>
        <td class="col-level">${level !== '' ? level : ''}</td>
        <td class="col-pts">${pts !== '' ? pts : ''}</td>
      </tr>`;
  }).join('');
  return `
    <table class="data-table">
      <thead><tr><th>Spell</th><th>College</th><th class="col-diff">Difficulty</th><th class="col-rsl">RSL</th><th class="col-level">Level</th><th class="col-pts">Pts</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Equipment ─────────────────────────────────────────────────────────────────

function buildEquipmentTable(items) {
  if (!items.length) return '';
  const rows = items.map(eq => {
    const isContainer = Array.isArray(eq.children) && eq.children.length > 0;
    const unequipped  = eq.equipped === false ? ' unequipped-row' : '';
    const qty    = eq.quantity != null ? parseFxp(eq.quantity) : 1;
    const weight = eq.calc?.extended_weight != null ? fmtWeight(eq.calc.extended_weight) : '—';
    const value  = eq.calc?.extended_value  != null ? fmtMoney(eq.calc.extended_value)   : '—';
    const notes  = eq.local_notes || '';
    return `
      <tr class="${unequipped}${isContainer ? ' container-row' : ''}">
        <td${indentStyle(eq._depth)}>${isContainer ? '▸ ' : ''}${esc(eq.description)}${notes ? `<br><small class="row-note">${esc(notes)}</small>` : ''}</td>
        <td class="col-qty">${qty}</td>
        <td class="col-wt">${weight}</td>
        <td class="col-val">${value}</td>
      </tr>`;
  }).join('');
  return `
    <table class="data-table">
      <thead><tr><th>Item</th><th class="col-qty">Qty</th><th class="col-wt">Weight</th><th class="col-val">Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Notes ─────────────────────────────────────────────────────────────────────

function buildNotesSection(notes) {
  if (!notes.length) return '';
  return notes.map(n => {
    const text = n.calc?.resolved_text || n.markdown || '';
    if (!text.trim()) return '';
    return `<p class="note-text"${indentStyle(n._depth)}>${esc(text)}</p>`;
  }).filter(Boolean).join('');
}

// ── Main render ───────────────────────────────────────────────────────────────

function render(data) {
  const { profile, attributes, totalPoints, unspentPoints,
          traits, skills, spells, carriedEquipment, otherEquipment, notes, calc } = data;

  const html = [
    buildHeader(profile, totalPoints, unspentPoints),
    buildAttributes(attributes),
    buildCombat(calc),
    section('traits',    'Traits',            buildTraitsTable(traits)),
    section('skills',    'Skills',            buildSkillsTable(skills)),
    section('spells',    'Spells',            buildSpellsTable(spells)),
    section('equipment', 'Carried Equipment', buildEquipmentTable(carriedEquipment)),
    section('other-eqp', 'Other Equipment',   buildEquipmentTable(otherEquipment)),
    section('notes',     'Notes',             buildNotesSection(notes)),
  ].join('');

  const sheet = document.getElementById('sheet');
  sheet.innerHTML = html;
  sheet.hidden = false;

  document.getElementById('landing').hidden = true;
  document.getElementById('loading').hidden = true;
}
