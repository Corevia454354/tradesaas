// The ONE place the platform's brand lives. Change the name, colours or tagline here and everything follows:
// sign-in page, top bar, browser tab, tab icon, phone home-screen icon (see also favicon.svg / manifest.webmanifest
// / icon-*.png), the public support page, the admin panel and the "Sent with ..." line on documents.
export const BRAND = {
  name: 'Tradeline',
  tagline: 'Quotes, jobs, certificates, invoices and your team in one place.',
  color: '#2f6bff', // main colour (buttons, links, icon background)
  accent: '#f59e0b', // small highlight in the logo
};
export const PLATFORM_NAME = BRAND.name;

/** The logo mark (a rounded square with a "T" and an accent dot) as inline SVG. */
export const logoSvg = (size = 28) => `<svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${BRAND.name}"><rect width="64" height="64" rx="15" fill="${BRAND.color}"/><rect x="14" y="15" width="36" height="9" rx="3" fill="#fff"/><rect x="27.5" y="15" width="9" height="33" rx="3" fill="#fff"/><circle cx="46" cy="46" r="5.5" fill="${BRAND.accent}"/></svg>`;

/** Apply the brand to the current page: colour, tab title and tab icon. */
export function applyBrand(title = BRAND.name) {
  document.documentElement.style.setProperty('--brand', BRAND.color);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', BRAND.color);
  document.title = title;
}
