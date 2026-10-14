// The public "Contact us" page of one business: /support?b=<business id>. No sign-in. It talks only to
// POST /api/support (info, submit). Built with DOM calls, never innerHTML on anything typed by a person.
import { BRAND, logoSvg, applyBrand } from './brand.js';
applyBrand('Contact us');
const app = document.getElementById('app');
const tid = new URLSearchParams(location.search).get('b') || '';
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach((k) => e.append(k)); return e; };
const post = async (body) => {
  const res = await fetch('/api/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
  return j;
};
const field = (label, name, opts = {}) => {
  const input = opts.area ? el('textarea', { name, maxLength: opts.max || 4000, required: !!opts.required }) : el('input', { name, type: opts.type || 'text', maxLength: opts.max || 200, required: !!opts.required, autocomplete: opts.auto || 'off' });
  return [el('label', { textContent: label }), input];
};
try {
  const { name, whiteLabel } = await post({ action: 'info', tid });
  document.title = `Contact ${name}`;
  const msg = el('p', { className: 'err' });
  const form = el('form', {}, ...field('Your name', 'name', { required: true, max: 80, auto: 'name' }), ...field('Email', 'email', { type: 'email', required: true, auto: 'email' }),
    ...field('Cell number (optional)', 'phone', { type: 'tel', max: 40, auto: 'tel' }), ...field('What is this about?', 'subject', { required: true, max: 150 }), ...field('Your message', 'message', { area: true, required: true }));
  form.append(el('div', { className: 'hp', ariaHidden: 'true' }, el('label', { textContent: 'Leave this empty' }), el('input', { name: 'hp', tabIndex: -1, autocomplete: 'off' })));
  const btn = el('button', { textContent: 'Send message' }); form.append(btn, msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); btn.disabled = true; msg.textContent = '';
    const v = Object.fromEntries(new FormData(form));
    try {
      const r = await post({ action: 'submit', tid, ...v });
      app.replaceChildren(el('h1', { textContent: 'Thank you' }), el('p', {}, `We got your message${r.number ? ` (reference #${String(r.number).padStart(4, '0')})` : ''}. ${name} will reply to ${v.email} as soon as they can.`));
    } catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });
  const foot = el('p', { className: 'pub-foot' }); if (!whiteLabel) foot.innerHTML = `${logoSvg(18)}Powered by ${BRAND.name}`;
  app.replaceChildren(el('h1', { textContent: name }), el('p', { className: 'muted', textContent: 'Send us a message and we will get back to you by email.' }), form, foot);
} catch (e) {
  app.replaceChildren(el('h1', { textContent: 'Contact page not found' }), el('p', { className: 'muted', textContent: 'This link is not working. Please check it with the business.' }));
}
