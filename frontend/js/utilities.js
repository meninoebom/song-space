// Shared utility functions.

export function averageReadings(arrays) {
  if (arrays.length === 1) return arrays[0];
  const map = {};
  for (const arr of arrays) for (const r of arr) {
    if (!map[r.id]) map[r.id] = { total: 0, active: false, n: 0 };
    map[r.id].total += r.value; map[r.id].active ||= r.active; map[r.id].n++;
  }
  return Object.entries(map).map(([id, { total, active, n }]) => ({ id, value: total / n, active }));
}
