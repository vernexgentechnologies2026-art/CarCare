/** SVG car illustrations standing in for real photos in the mock layer (no network, no real imagery). */

const COLOR_HEX: Record<string, string> = {
  'Pearl White': '#F1F5F9',
  White: '#FFFFFF',
  Silver: '#CBD5E1',
  Grey: '#64748B',
  Black: '#1E293B',
  Red: '#DC2626',
  Blue: '#1D4ED8',
  Brown: '#78350F',
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Renders a car illustration. `afterWash` adds sparkle + date stamp. */
export function carIllustration(color: string, label: string, afterWash: boolean, seedKey: string): string {
  const body = COLOR_HEX[color] ?? '#94A3B8';
  const h = hashString(seedKey);
  const bg = afterWash ? ['#DBEAFE', '#D1FAE5', '#E0F2FE'][h % 3] : '#E2E8F0';
  const sparkles = afterWash
    ? [0, 1, 2]
        .map((i) => {
          const x = 60 + ((h >> (i * 5)) % 280);
          const y = 30 + ((h >> (i * 7)) % 60);
          return `<path d="M${x} ${y - 9}l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#FFFFFF" opacity="0.9"/>`;
        })
        .join('')
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" width="400" height="260">
<rect width="400" height="260" fill="${bg}"/>
<rect y="200" width="400" height="60" fill="#94A3B8" opacity="0.35"/>
<path d="M70 175 L95 120 Q105 100 130 100 L270 100 Q295 100 305 120 L330 175 Q340 178 340 190 L340 205 Q340 212 333 212 L67 212 Q60 212 60 205 L60 190 Q60 178 70 175 Z" fill="${body}" stroke="#0F172A" stroke-width="3"/>
<path d="M115 172 L130 128 Q135 118 147 118 L253 118 Q265 118 270 128 L285 172 Z" fill="#0F172A" opacity="0.75"/>
<line x1="200" y1="118" x2="200" y2="172" stroke="${body}" stroke-width="5"/>
<circle cx="120" cy="212" r="26" fill="#0F172A"/><circle cx="120" cy="212" r="11" fill="#CBD5E1"/>
<circle cx="280" cy="212" r="26" fill="#0F172A"/><circle cx="280" cy="212" r="11" fill="#CBD5E1"/>
<rect x="170" y="190" width="60" height="14" rx="2" fill="#FFFFFF" stroke="#0F172A"/>
${sparkles}
<text x="200" y="40" font-family="system-ui,sans-serif" font-size="16" font-weight="600" text-anchor="middle" fill="#0F172A">${escapeXml(label)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
