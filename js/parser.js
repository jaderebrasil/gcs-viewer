// Parses raw .gcs JSON into a normalized display model.

function parseFxp(v) {
  if (v == null) return 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function fmtNum(v) {
  const n = parseFxp(v);
  return Number.isInteger(n) ? n : parseFloat(n.toFixed(2));
}

// Recursively flattens a node tree into a flat array, adding _depth to each node.
function flattenTree(nodes, depth = 0) {
  if (!nodes || !nodes.length) return [];
  const result = [];
  for (const node of nodes) {
    result.push({ ...node, _depth: depth });
    if (node.children && node.children.length) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

function parseProfile(p) {
  if (!p) return { name: 'Unnamed' };
  return {
    name:         p.name        || 'Unnamed',
    playerName:   p.player_name || '',
    title:        p.title       || '',
    organization: p.organization || '',
    religion:     p.religion    || '',
    techLevel:    p.tech_level  || '',
    gender:       p.gender      || '',
    age:          p.age         || '',
    birthday:     p.birthday    || '',
    eyes:         p.eyes        || '',
    hair:         p.hair        || '',
    skin:         p.skin        || '',
    handedness:   p.handedness  || '',
    height:       p.height      || '',
    weight:       p.weight      || '',
    sizeModifier: p.SM          || 0,
    portrait:     p.portrait    || null,  // raw base64 string
  };
}

// Build a map from attr_id → AttributeDef using the settings block.
function buildAttrDefMap(settingsDefs) {
  const map = {};
  if (!settingsDefs) return map;
  for (const def of settingsDefs) {
    map[def.id] = def;
  }
  return map;
}

function parseAttributes(rawAttrs, settingsDefs) {
  const defMap = buildAttrDefMap(settingsDefs);
  if (!rawAttrs) return [];
  return rawAttrs.map(attr => {
    const def = defMap[attr.attr_id] || {};
    const isPool = def.type === 'pool' || def.type === 'pool_ref';
    return {
      id:        attr.attr_id,
      name:      def.full_name || def.name || attr.attr_id.toUpperCase(),
      shortName: def.name      || attr.attr_id.toUpperCase(),
      type:      def.type      || 'integer',
      placement: def.placement || '',
      isPool,
      value:   fmtNum(attr.calc?.value),
      current: isPool ? fmtNum(attr.calc?.current) : null,
      points:  fmtNum(attr.calc?.points),
      adj:     parseFxp(attr.adj),
    };
  });
}

// Converts the raw .gcs JSON object into a clean display model.
function parseGCS(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid .gcs file');

  const settings = raw.settings || {};
  const profile   = parseProfile(raw.profile);
  const attributes = parseAttributes(raw.attributes, settings.attributes);

  const totalPoints = parseFxp(raw.total_points);
  // unspent points aren't stored directly; derive from the calc block if present
  // or compute from attributes + breakdown (we use the calc block if available)
  const breakdown = raw.calc?.unspent_points != null
    ? parseFxp(raw.calc.unspent_points)
    : null;

  return {
    version:          raw.version,
    profile,
    totalPoints,
    unspentPoints:    breakdown,
    attributes,
    traits:           flattenTree(raw.traits),
    skills:           flattenTree(raw.skills),
    spells:           flattenTree(raw.spells),
    carriedEquipment: flattenTree(raw.equipment),
    otherEquipment:   flattenTree(raw.other_equipment),
    notes:            flattenTree(raw.notes),
    calc:             raw.calc || {},
    settings,
  };
}
