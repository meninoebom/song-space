/**
 * Debug overlay — displays movement qualities and readings as text bars.
 */

function bar(v, width = 16) {
  const filled = Math.round(v * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export { bar };

export function updateDebug(panel, allQualities, readingValues, relQualities) {
  if (!panel || panel.style.display === 'none') return;

  let text = '';

  for (let i = 0; i < allQualities.length; i++) {
    const label = allQualities.length > 1 ? ` (body ${i + 1})` : '';
    const qLines = Object.entries(allQualities[i])
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => `${k.padEnd(14)} ${bar(v)} ${v.toFixed(2)}`)
      .join('\n');
    text += `── qualities${label} ──\n${qLines}\n\n`;
  }

  if (relQualities) {
    const relLines = Object.entries(relQualities)
      .map(([k, v]) => `${k.padEnd(16)} ${bar(v)} ${v.toFixed(2)}`)
      .join('\n');
    text += `── relational ──\n${relLines}\n\n`;
  }

  const rLines = readingValues
    .map(r => `${r.id.padEnd(14)} ${bar(r.value)} ${r.value.toFixed(2)} ${r.active ? '●' : '○'}`)
    .join('\n');
  text += `── readings ──\n${rLines}`;

  panel.textContent = text;
}
