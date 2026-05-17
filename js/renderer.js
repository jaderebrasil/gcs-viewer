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
    if (b(0) === 0xFF && b(1) === 0xD8)               return 'image/jpeg';
    if (b(0) === 0x89 && b(1) === 0x50)               return 'image/png';
    if (b(0) === 0x47 && b(1) === 0x49)               return 'image/gif';
    if (b(0) === 0x42 && b(1) === 0x4D)               return 'image/bmp';
    if (raw.startsWith('RIFF') && raw.slice(8, 12) === 'WEBP') return 'image/webp';
  } catch (_) { /* ignore */ }
  return 'image/jpeg';
}

function portraitSrc(portrait) {
  if (!portrait) return null;
  const mime = detectImageMime(portrait);
  return `data:${mime};base64,${portrait}`;
}

const DIFF_ABBREV = { easy: 'E', average: 'A', hard: 'H', very_hard: 'VH', wildcard: 'W!' };

function fmtDifficulty(diff) {
  if (!diff) return '';
  const attr = (diff.attribute || '').toUpperCase();
  const d    = DIFF_ABBREV[diff.difficulty] || diff.difficulty || '';
  return `${attr}/${d}`;
}

function fmtRSL(attrId, rslRaw) {
  const rsl = Math.round(parseFxp(rslRaw));
  const sign = rsl >= 0 ? '+' : '';
  return `${(attrId || '').toUpperCase()}${sign}${rsl}`;
}

function fmtWeight(v, unit) {
  const n = parseFxp(v);
  if (n === 0) return '—';
  const u = unit || 'lb';
  return `${n} ${u}`;
}

function fmtMoney(v) {
  const n = parseFxp(v);
  if (n === 0) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function section(id, title, body, open = true) {
  if (!body) return '';
  return `
    <details class="sheet-section" id="sec-${id}"${open ? ' open' : ''}>
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
  const portraitHtml = src
    ? `<img class="portrait" src="${src}" alt="Portrait">`
    : `<div class="portrait portrait-placeholder"></div>`;

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
    <header class="sheet-header">
      <div class="header-portrait">${portraitHtml}</div>
      <div class="header-main">
        <h1 class="char-name">${esc(profile.name)} ${sm}</h1>
        <div class="ident-grid">${fields}</div>
      </div>
      <div class="header-points">
        <div class="points-row"><span class="pts-label">Total</span><span class="pts-val">${totalPoints}</span></div>
        ${spent}
      </div>
    </header>`;
}

// ── Attributes ────────────────────────────────────────────────────────────────

function buildAttributes(attributes) {
  if (!attributes.length) return '';

  const pools = attributes.filter(a => a.isPool);
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

function buildCombat(calc, weightUnit) {
  const encNames = ['None', 'Light', 'Medium', 'Heavy', 'X-Heavy'];
  const encRows = (calc.move || []).map((mv, i) =>
    `<tr><td>${encNames[i] || i}</td><td>${mv}</td><td>${(calc.dodge || [])[i] ?? '—'}</td></tr>`
  ).join('');

  const swing   = calc.swing  ? diceStr(calc.swing)  : '—';
  const thrust  = calc.thrust ? diceStr(calc.thrust) : '—';
  const liftNum = calc.basic_lift != null ? parseFxp(calc.basic_lift) : null;
  const lift    = liftNum != null ? `${liftNum} ${weightUnit || 'lb'}` : '—';

  return `
    <div class="combat-section">
      <div class="combat-grid">
        <div class="combat-item"><span class="combat-label">Swing</span><span class="combat-val">${esc(swing)}</span></div>
        <div class="combat-item"><span class="combat-label">Thrust</span><span class="combat-val">${esc(thrust)}</span></div>
        <div class="combat-item"><span class="combat-label">Basic Lift</span><span class="combat-val">${lift}</span></div>
      </div>
      ${encRows ? `
      <table class="enc-table">
        <thead><tr><th>Encumbrance</th><th>Move</th><th>Dodge</th></tr></thead>
        <tbody>${encRows}</tbody>
      </table>` : ''}
    </div>`;
}

function diceStr(d) {
  if (!d) return '—';
  if (typeof d === 'string') return d;   // already formatted (e.g. "2d+1")
  let s = '';
  if (d.count != null && d.count !== 0) s += `${d.count}d`;
  if (d.sides != null && d.sides !== 6) s += `${d.sides}`;
  if (d.modifier)                        s += d.modifier > 0 ? `+${d.modifier}` : d.modifier;
  if (d.multiplier && d.multiplier !== 1) s += `×${d.multiplier}`;
  return s || '—';
}

// ── Traits ────────────────────────────────────────────────────────────────────

function buildTraitsTable(traits) {
  if (!traits.length) return '<p class="empty">No traits.</p>';
  const rows = traits.map(t => {
    const isContainer = !!(t.children);
    const pts = t.calc?.points != null ? parseFxp(t.calc.points) : '';
    const tags = (t.tags || []).join(', ');
    const disabled = t.disabled ? ' disabled-row' : '';
    const notes = t.local_notes || '';
    return `
      <tr class="trait-row${disabled}${isContainer ? ' container-row' : ''}">
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
  if (!skills.length) return '<p class="empty">No skills.</p>';
  const rows = skills.map(s => {
    const isContainer = !!(s.children);
    const name = s.specialization
      ? `${esc(s.name)} (${esc(s.specialization)})`
      : esc(s.name);
    const diff  = fmtDifficulty(s.difficulty);
    const rsl   = !isContainer && s.calc?.rsl != null && s.difficulty?.attribute
      ? fmtRSL(s.difficulty.attribute, s.calc.rsl)
      : '';
    const level = !isContainer && s.calc?.level != null ? parseFxp(s.calc.level) : '';
    const pts   = !isContainer && s.calc?.points != null ? parseFxp(s.calc.points) : '';
    const notes = s.local_notes || '';
    return `
      <tr class="skill-row${isContainer ? ' container-row' : ''}">
        <td${indentStyle(s._depth)}>${isContainer ? '▸ ' : ''}${name}${notes ? `<br><small class="row-note">${esc(notes)}</small>` : ''}</td>
        <td class="col-diff">${esc(diff)}</td>
        <td class="col-rsl">${esc(rsl)}</td>
        <td class="col-level">${level !== '' ? level : ''}</td>
        <td class="col-pts">${pts !== '' ? pts : ''}</td>
      </tr>`;
  }).join('');
  return `
    <table class="data-table">
      <thead><tr><th>Skill</th><th class="col-diff">Attr/Diff</th><th class="col-rsl">RSL</th><th class="col-level">Level</th><th class="col-pts">Pts</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Spells ────────────────────────────────────────────────────────────────────

function buildSpellsTable(spells) {
  if (!spells.length) return '';
  const rows = spells.map(s => {
    const isContainer = !!(s.children);
    const college = (s.college || []).join(', ') || s.power_source || '';
    const diff    = fmtDifficulty(s.difficulty);
    const rsl     = !isContainer && s.calc?.rsl != null && s.difficulty?.attribute
      ? fmtRSL(s.difficulty.attribute, s.calc.rsl)
      : '';
    const level   = !isContainer && s.calc?.level != null ? parseFxp(s.calc.level) : '';
    const pts     = !isContainer && s.calc?.points != null ? parseFxp(s.calc.points) : '';
    return `
      <tr class="${isContainer ? 'container-row' : ''}">
        <td${indentStyle(s._depth)}>${isContainer ? '▸ ' : ''}${esc(s.name)}</td>
        <td class="col-diff">${esc(college)}</td>
        <td class="col-diff">${esc(diff)}</td>
        <td class="col-rsl">${esc(rsl)}</td>
        <td class="col-level">${level !== '' ? level : ''}</td>
        <td class="col-pts">${pts !== '' ? pts : ''}</td>
      </tr>`;
  }).join('');
  return `
    <table class="data-table">
      <thead><tr><th>Spell</th><th>College</th><th class="col-diff">Attr/Diff</th><th class="col-rsl">RSL</th><th class="col-level">Level</th><th class="col-pts">Pts</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Equipment ─────────────────────────────────────────────────────────────────

function buildEquipmentTable(items, weightUnit) {
  if (!items.length) return '';
  const rows = items.map(eq => {
    const isContainer = !!(eq.children);
    const unequipped  = eq.equipped === false ? ' unequipped-row' : '';
    const qty    = eq.quantity != null ? parseFxp(eq.quantity) : 1;
    const weight = eq.calc?.extended_weight != null ? fmtWeight(eq.calc.extended_weight, weightUnit) : '—';
    const value  = eq.calc?.extended_value  != null ? fmtMoney(eq.calc.extended_value)  : '—';
    const notes  = eq.local_notes || '';
    return `
      <tr class="eqp-row${unequipped}${isContainer ? ' container-row' : ''}">
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
    return `<pre class="note-text"${indentStyle(n._depth)}>${esc(text)}</pre>`;
  }).join('');
}

// ── Main render ───────────────────────────────────────────────────────────────

function render(data) {
  const { profile, attributes, totalPoints, unspentPoints,
          traits, skills, spells, carriedEquipment, otherEquipment, notes,
          calc, settings } = data;

  const weightUnit = settings?.default_weight_units || 'lb';

  const html = [
    buildHeader(profile, totalPoints, unspentPoints),
    buildAttributes(attributes),
    buildCombat(calc, weightUnit),
    section('traits',     'Traits',           buildTraitsTable(traits)),
    section('skills',     'Skills',           buildSkillsTable(skills)),
    section('spells',     'Spells',           buildSpellsTable(spells),    spells.length > 0),
    section('equipment',  'Carried Equipment', buildEquipmentTable(carriedEquipment, weightUnit)),
    section('other-eqp',  'Other Equipment',   buildEquipmentTable(otherEquipment, weightUnit), otherEquipment.length > 0),
    section('notes',      'Notes',            buildNotesSection(notes),    notes.length > 0),
  ].join('');

  const sheet = document.getElementById('sheet');
  sheet.innerHTML = html;
  sheet.hidden = false;

  document.getElementById('landing').hidden = true;
  document.getElementById('loading').hidden = true;
}
