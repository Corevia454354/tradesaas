// Small building blocks for the screens: icons, round profile pictures, and shrinking a photo before upload.
// No Firebase here and no business logic, so every screen file can import it.
import { esc } from './lib.js';

// ---------------------------------------------------------------- icons (24x24, drawn with a 1.8 stroke)
const P = {
  dashboard: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.7a3.5 3.5 0 0 1 0 6.6',
  user: 'M20 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5V21M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  tasks: 'M9 4h6v3H9zM9 5.5H6.5A1.5 1.5 0 0 0 5 7v13a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7a1.5 1.5 0 0 0-1.5-1.5H15M9 14l2 2 4-4',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  briefcase: 'M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18',
  shield: 'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6zM9 12l2.2 2.2L15 10.5',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  support: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zM16 14h2',
  trend: 'M4 4v16h16M8 15l3-4 3 2 5-6',
  bars: 'M5 20V10M12 20V4M19 20v-7',
  card: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM2 10.5h20',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5',
  calendar: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
  bell: 'M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 0 0 4 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  logout: 'M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  x: 'M6 6l12 12M18 6 6 18',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  link: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  send: 'M21 3 10 14M21 3l-7 18-4-7-7-4z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  check: 'M5 12.5l4.5 4.5L19 7',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 7l9 6 9-6',
  alert: 'M12 3 2.5 20h19zM12 10v4.5M12 17.5h.01',
};
/** An inline icon. `name` is a key of P; unknown names draw nothing. */
export const icon = (name, size = 20) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || ''}"/></svg>`;

/** Which icon each page uses in the menus. */
export const PAGE_ICON = {
  dashboard: 'dashboard', clients: 'user', quotes: 'file', jobs: 'briefcase', certificates: 'shield', invoices: 'receipt',
  tasks: 'tasks', team: 'users', docs: 'file', library: 'folder', support: 'support', time: 'clock', leave: 'sun', chat: 'chat',
  payroll: 'wallet', costing: 'trend', reports: 'bars', billing: 'card', settings: 'settings', calendar: 'calendar', profile: 'user',
};

// ---------------------------------------------------------------- profile pictures
const TONES = [['#dbeafe', '#1d4ed8'], ['#dcfce7', '#15803d'], ['#fef3c7', '#b45309'], ['#fce7f3', '#be185d'], ['#ede9fe', '#6d28d9'], ['#cffafe', '#0e7490'], ['#fee2e2', '#b91c1c'], ['#e0e7ff', '#4338ca']];
const hash = (s) => { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
export const initials = (name) => {
  const parts = String(name || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};
/** Only the small JPEGs our own API stores are ever drawn. */
export const safePhoto = (s) => (typeof s === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(s) ? s : '');
/** A round picture, or coloured initials when the person has no picture. m = { name, photo }. size: sm | md | lg | xl */
export function avatar(m, size = 'md') {
  const photo = safePhoto(m?.photo);
  const [bg, fg] = TONES[hash(m?.uid || m?.name) % TONES.length];
  return photo
    ? `<span class="av av-${size}"><img src="${photo}" alt="" loading="lazy"></span>`
    : `<span class="av av-${size}" style="background:${bg};color:${fg}" aria-hidden="true">${esc(initials(m?.name))}</span>`;
}

/**
 * Turn a chosen photo into a small square JPEG (data URL) that is cheap to store: cropped to the middle,
 * 192 px, and squeezed until it is under about 50 KB. Throws an Error with a plain message when it cannot.
 */
export async function shrinkImage(file, side = 192, maxChars = 50000) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That photo is too big. Choose one under 15 MB.');
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bmp = await new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That file could not be read as a picture.')); };
      img.src = url;
    });
  }
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
  if (!w || !h) throw new Error('That file could not be read as a picture.');
  const crop = Math.min(w, h);
  const c = document.createElement('canvas');
  c.width = c.height = side;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; // PNG transparency becomes white, not black
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(bmp, (w - crop) / 2, (h - crop) / 2, crop, crop, 0, 0, side, side);
  let q = 0.85, out = c.toDataURL('image/jpeg', q);
  while (out.length > maxChars && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
  if (out.length > maxChars) throw new Error('That picture is too detailed. Try another one.');
  return out;
}

// ---------------------------------------------------------------- small helpers
/** A greeting for the time of day, in South African time. */
export function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-ZA', { hour: 'numeric', hour12: false, timeZone: 'Africa/Johannesburg' }).format(now)) % 24;
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
/** File-type chip for the library, e.g. PDF in red. */
export function fileChip(name, kind) {
  if (kind === 'link') return `<span class="ft ft-link">${icon('link', 16)}</span>`;
  const ext = (String(name || '').match(/\.([a-z0-9]{1,5})$/i)?.[1] || 'file').toLowerCase();
  const cls = { pdf: 'pdf', doc: 'doc', docx: 'doc', xls: 'xls', xlsx: 'xls', csv: 'xls', ppt: 'ppt', pptx: 'ppt', png: 'img', jpg: 'img', jpeg: 'img', webp: 'img' }[ext] || 'txt';
  return `<span class="ft ft-${cls}">${esc(ext.slice(0, 4).toUpperCase())}</span>`;
}

/** A stat tile: icon chip, label, big number, small note. href makes the whole tile a link. tone: green | amber | purple | red */
export const kpi = ({ ic = 'dashboard', tone = '', label, n, sub = '', href = '', warn = false }) => {
  const tag = href ? 'a' : 'div';
  return `<${tag} class="kpi${warn ? ' warn' : ''}"${href ? ` href="${esc(href)}"` : ''}><span class="kpi-ic ${tone ? 't-' + tone : ''}">${icon(ic, 20)}</span><div><div class="kpi-l">${esc(label)}</div><div class="kpi-n">${esc(String(n))}</div>${sub ? `<div class="kpi-s">${esc(sub)}</div>` : ''}</div></${tag}>`;
};

/**
 * A line-and-area chart as inline SVG. pts = [{ label, v }]. money: format the scale as rand.
 * Hovering a point shows its value (the <title>). Nothing is drawn from outside data.
 */
export function areaChart(pts, { money = false, unit = '' } = {}) {
  const W = 600, H = 290, pl = money ? 46 : 32, pr = 14, pt = 14, pb = 30;
  const max = Math.max(...pts.map((p) => p.v), 0);
  const mag = 10 ** Math.floor(Math.log10(Math.max(max, 1)));
  let top = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= max) || 10 * mag;
  if (!money) top = Math.max(4, Math.ceil(top / 4) * 4);
  const x = (i) => pl + (pts.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (pts.length - 1));
  const y = (v) => pt + (H - pt - pb) * (1 - v / top);
  const fmt = (v) => (money ? (v >= 1000 ? `R${Math.round(v / 100) / 10}k`.replace('.0k', 'k') : `R${Math.round(v)}`) : String(Math.round(v)));
  const grid = [0, 1, 2, 3, 4].map((i) => { const v = (top * i) / 4; return `<line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`; }).join('');
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
  const step = Math.ceil(pts.length / 7);
  const labels = pts.map((p, i) => (i % step === 0 || i === pts.length - 1 ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>` : '')).join('');
  const dots = pts.map((p, i) => `<circle class="pt" cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${pts.length > 16 ? 2.5 : 4}"><title>${esc(p.label)}: ${esc(money ? fmt(p.v) : p.v + (unit ? ' ' + unit : ''))}</title></circle>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart">${grid}<path class="area" d="${area}"/><path class="ln" d="${line}"/>${dots}${labels}</svg>`;
}
