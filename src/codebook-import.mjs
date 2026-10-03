export function importCodeDefinitions(state, records, makeId) {
  if (!Array.isArray(records) || !records.length || records.length > 5000) throw Error('Import between 1 and 5,000 code definitions.');
  const existing = new Set(state.codes.map(c => c.id)), ids = new Map();
  for (const c of records) {
    if (!c || typeof c.id !== 'string' || !c.id || ids.has(c.id)) throw Error('Code definitions need unique identifiers.');
    if (typeof c.name !== 'string' || !c.name.trim()) throw Error('Every code needs a name.');
    ids.set(c.id, makeId());
  }
  const definitions = records.map(c => {
    const parentId = c.parentId ? ids.get(c.parentId) || (existing.has(c.parentId) ? c.parentId : null) : null;
    if (c.parentId && !parentId) throw Error('A code refers to a missing parent.');
    return {id:ids.get(c.id), name:c.name.trim(), description:String(c.description || ''), parentId, color:/^#[\da-f]{6}$/i.test(c.color || '') ? c.color : '#537a92', codable:c.codable !== false};
  });
  state.codes.push(...definitions);
  return definitions;
}
