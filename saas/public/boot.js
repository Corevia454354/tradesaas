// Entry point. Checks the Firebase settings are filled in, then starts the app.
import { firebaseConfig } from './firebase-config.js';
import { PLATFORM_NAME } from './brand.js';

const REQUIRED = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missing = REQUIRED.filter((k) => !firebaseConfig[k] || /REPLACE/i.test(String(firebaseConfig[k])));

if (missing.length) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="auth"><h1>Setup needed</h1>
    <p class="muted">The site is deployed, but it is not connected to Firebase yet.</p>
    <div class="banner bad">Still to fill in, in <code>public/firebase-config.js</code>: <b>${missing.join(', ')}</b></div>
    <ol class="muted">
      <li>Firebase console, Project settings, General, Your apps, Web app: copy the config.</li>
      <li>Paste it into <code>public/firebase-config.js</code>, commit, and let Vercel redeploy.</li>
      <li>Reload this page.</li>
    </ol>
    <p class="muted">${PLATFORM_NAME}: full steps are in README.md, Setup step 1.</p></div>`;
  window.__appReady = true;
} else {
  try {
    await import('./app.js');
  } catch (e) {
    console.error(e);
    window.__fail?.(`The app failed to load: ${e.message}`);
  }
}
