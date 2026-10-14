# Trades SaaS: Standard tier

Quotes, jobs, compliance certificates and invoices for small trades businesses.
Self-serve signup, a Free plan and a paid Standard plan billed through Paystack.

**Stack:** Vercel (static app + serverless API) · Firebase Auth, Firestore and Storage · Paystack subscriptions.
No Firebase Cloud Functions and no Firebase Hosting are used anywhere.

```
public/            the app (plain ES modules, no build step) → served by Vercel
  app.js           screens, forms, routing
  data.js          Firebase Auth + Firestore access, and fetch() to /api
  admin.html/.js   platform admin panel at /admin (staff only)
  boot.js          entry point: checks firebase-config.js, then loads app.js (shows "Setup needed" if not configured)
  lib.js           pure helpers (VAT/totals, CSV, WhatsApp links, escaping)
  shared/plans.js  tiers, limits, features, prices (used by the app AND the API)
api/               Vercel serverless routes
  tenant.js        POST create business (signup) / invite team member
  jobs.js          POST create a job (server enforces the monthly plan limit)
  billing.js       POST Paystack checkout / cancel
  paystack-webhook.js   Paystack → plan changes (signature-verified)
  admin.js         POST platform-admin controls (overrides, tier, suspend, branding)
  health.js        GET  which server settings are in place (true/false, no secrets)
  _lib/            Firebase Admin, auth helpers, input validation
firestore.rules    tenant isolation, plan gating, locked certificates
storage.rules      per-tenant file access (not used by the app yet)
scripts/make-super-admin.js   one-time: make yourself platform super admin
test/              unit tests (npm test)
docs/TESTING.md    step-by-step testing guide against real Firebase and Paystack test mode
```

## Start here

New to this? Follow **[docs/DEPLOY-SIMPLE.md](docs/DEPLOY-SIMPLE.md)** to put the app online, one tiny step at a time.

There is no demo mode and no sample data. Follow **[docs/TESTING.md](docs/TESTING.md)**: it takes you from an empty
Firebase project and Paystack test account to a fully tested staging deployment, then to production.

Until `public/firebase-config.js` holds real Firebase values, the site shows a **Setup needed** screen listing what is missing.
Open the site through its web address (Vercel or `npx vercel dev`), not by double-clicking `index.html`.

## Plans

| | Free | Standard | Business |
|---|---|---|---|
| Quotes, jobs, certificates, invoices, e-sign | yes (5 jobs/month) | yes, unlimited jobs | yes |
| **30-day free trial** | | every new business starts on Standard for 30 days, no card needed, then drops to Free unless it subscribes | |
| CSV export for accounting | no | yes | yes |
| Team hierarchy, tasks, time, chat | no | no | **not built yet** |
| Price | R0 | R399/month | US$149/month, up to 20 people, free 30-day trial |

Edit prices, limits and features in `public/shared/plans.js`. Keep the Paystack plan amounts in sync.

## Setup

**1. Firebase** (console.firebase.google.com)
- Create a project. Build → Authentication → enable **Email/Password**.
- Authentication → Settings → Authorized domains → add your Vercel domain (and custom domain).
- Build → Firestore Database → create in production mode. Pick the region carefully; it can't be changed later.
- Project settings → General → add a **Web app** and paste its config into `public/firebase-config.js` (your brand is separate, in `public/brand.js`).
- Project settings → Service accounts → **Generate new private key**. You'll paste this JSON into Vercel (step 3).
- Security rules: Firestore Database → **Rules** tab → paste the contents of `firestore.rules` → **Publish**. (Developers can use `npm run deploy:rules` instead.)

**2. Paystack** (dashboard.paystack.com)
- Products → Plans → create a monthly **Standard** plan at R399 (ZAR). Copy the plan code (`PLN_...`).
  Create the Business plan at **US$149 (USD)** (see docs/DEPLOY-SIMPLE.md step C4 if USD is not available).
- Settings → API Keys & Webhooks → set the webhook URL to `https://<your-domain>/api/paystack-webhook`.
  Start with test keys (`sk_test_...`) and test-mode plans.

**3. Vercel**
- Import the repo. Framework preset: **Other**. `vercel.json` already sets the output directory to `public`.
- Settings → Environment Variables (see `.env.example`):

| Variable | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | the whole service-account JSON (or its base64) |
| `PAYSTACK_SECRET_KEY` | `sk_test_...` then `sk_live_...` |
| `PAYSTACK_PLAN_STANDARD` | `PLN_...` |
| `PAYSTACK_PLAN_BUSINESS` | `PLN_...` |
| `APP_URL` | `https://your-domain` (no trailing slash) |
| `PLATFORM_ADMIN_EMAILS` | your email (comma-separate several) |
| `CRON_SECRET` | any long random text (lets the daily job end finished trials) |

**4. Make yourself platform admin (no terminal).** Add your email to the Vercel variable `PLATFORM_ADMIN_EMAILS` and redeploy. Sign up in the app with that email, open `https://<your-domain>/admin`, press **Send verification email**, click the link in the email, then press **Make me admin**. Only a *verified* email on that list can do this. (`npm run make-admin` still exists as an alternative for developers.)

## How it works

- **Free trial:** a new business is created on Standard with `trial: {active, endsAt}` (30 days, `TRIAL` in `shared/plans.js`). When it runs out the server moves the business to Free: on the next job creation, when the app opens (`checkTrial`), or in the daily `/api/cron-trials` job. Subscribing during the trial replaces it and starts the paid month immediately. In `/admin` you can start, extend or end a trial per business.
- **Signup:** the app signs the user up in Firebase Auth, then calls `POST /api/tenant {action:'create'}`. The server creates the business on the Standard trial and sets the user's `tenantId` / `role` claims. Nobody onboards anyone by hand.
- **Isolation:** every record lives under `tenants/{tenantId}/…` and the rules compare the path to the `tenantId` claim. Tier, status, entitlements, overrides, branding and billing can only be written by the server.
- **Upgrade:** `POST /api/billing {action:'checkout'}` returns a Paystack checkout URL. When payment succeeds Paystack calls the webhook (HMAC-SHA512 verified), which sets the tier and recomputes entitlements. The app updates live.
- **Cancel:** `{action:'cancel'}` stops renewal; Paystack sends `subscription.not_renew` immediately and `subscription.disable` on the next payment date, when the business drops back to Free (data is kept).
- **Your controls:** `POST /api/admin` with a platform role. Override limits and features per business, force a tier, suspend or restore, set white-label branding. Setting `overrides.contractManaged = true` stops Paystack events changing that business's plan (custom contracts). Every call is written to `auditLogs`.
- **No money moves through the platform.** Clients pay the business directly; the business marks invoices paid.

## Go live checklist (config)

1. Do the Setup steps above (Firebase, Paystack, Vercel variables), then **redeploy** (Vercel only reads new variables on a new deployment).
2. Open `https://<your-domain>/api/health`. Every check should be `true` and `"ok": true`:
   `firebaseServiceAccount`, `paystackSecretKey`, `paystackPlanStandard`, `appUrl`. Anything `false` is a missing or wrong variable.
3. Open the site. You should see the sign-in screen. If you see **Setup needed**,
   `public/firebase-config.js` still contains `REPLACE_ME` values.
4. Create an account → the business is created on the Free plan → upgrade with a Paystack **test** card and check the pill changes to Standard
   (this proves the webhook works).

## If the page is blank or says "The app could not start"

The message under the heading is the real error. Common causes:
- **Opened as a file** (double-clicked `index.html`) → use `npx serve public` or your Vercel URL.
- **Vercel is serving the wrong folder** → Project Settings → Build & Development: Framework "Other", Output Directory `public`, Build Command empty.
  Check that `https://<your-domain>/app.js` shows JavaScript, not an HTML page.
- **Firebase blocked or offline** → the app loads Firebase from gstatic.com; check the network and ad-blockers.
- **Bad Firebase config** → re-copy the web-app config from Firebase console → Project settings.
- Anything else: press F12 → Console and send me the red lines.

## Tests

```
npm test      # unit tests: totals/VAT, CSV, escaping, plans, admin and job validation
```
These cover the pure logic only. The live Firebase and Paystack paths are verified by following [docs/TESTING.md](docs/TESTING.md).

## Production status, honestly
- **No mock or demo data is shipped.** A new account starts empty. The only placeholders are the Firebase settings in `public/firebase-config.js`, which you must fill in, and hint text in form boxes. The test stand-ins used to check this build are not in the zip.
- **Branded as Tradeline** (working name, logo, colours, phone icon, in `public/brand.js`). Confirm the name is available to you before launch.
- **Not yet proven on your real accounts:** Firebase rules, Storage, emails, and Paystack. See the list below and run docs/TESTING.md.

## What is NOT done or NOT verified

- **`firestore.rules` and the browser data layer (`public/data.js`) have never run against real Firebase, and nothing has run against real Paystack.** The API routes were exercised in the build environment against an in-memory stand-in for Firebase (signup, job limit, checkout and webhook logic, admin actions, roles), and the app screens against an in-memory data layer, but the real services can still behave differently. They are syntax-checked and the pure logic is unit-tested, but the build environment blocked npm and Firebase. Run docs/TESTING.md in full before launch.
- **Check cancellation in Paystack test mode:** the plan should stay active until the paid period ends. The code follows Paystack's documented events, but confirm it end to end.
- **The 5-jobs-a-month limit is enforced on the server** (`/api/jobs` with a monthly counter in `usage/`, South African month). Deleting a job does not free a slot. Rules forbid creating jobs from the browser.
- **Business tier (US$149/month, 20 people included, one free 30-day trial per business) is built:** hierarchy with invites, tasks, work documents with read confirmation, time tracking, leave with approvals, chat groups, payslip records, job costing and team reports. Every team write goes through `/api/team`, which checks plan, role and hierarchy; browsers only read. It was exercised end to end (real route handlers + the real screens, three people signed in at once) against in-memory stand-ins, but **`firestore.rules` for the team collections have never run on real Firebase** and the invite emails rely on Firebase's password-reset email (the owner can also WhatsApp the link). Run Part 12 of docs/TESTING.md before selling it.
- **Business document library and customer support inbox are built too** (see docs/PLANS-AND-FEATURES.md). The library needs Firebase Storage (which may need the Blaze plan) plus the `FIREBASE_STORAGE_BUCKET` variable; the Storage rules use a Firestore lookup, which has never run on real Firebase. Support replies go out through the agent's own Gmail compose window; replies do not come back into the app, and agents are not emailed about new inquiries. Run Part 13 of docs/TESTING.md.
- **New look, team calendar and profile pictures are built:** the whole app has a dashboard-style design (sidebar on desktop, tab bar on phones). The Business plan has a shared team calendar (the owner chooses who can add events, everyone sees it) and everyone can add a profile picture (stored as a small JPEG on their member record). Calendar events are read by Firestore rules (`events`), so **redeploy `firestore.rules`** once. The pages load the Inter font from Google Fonts (falls back to the system font offline). Run Part 14 of docs/TESTING.md.
- **Business limits by design:** extra seats beyond 10 are by arrangement (admin overrides); payroll is a record of amounts you type (no PAYE/UIF calculation, no money moves); documents are text plus https links (no uploads); leave does not skip public holidays; timesheets have no approval step.
- **The admin panel (`/admin`) is built but, like the rest, has not run against real Firebase.** It manages businesses, plans, overrides, suspend/restore, white-label settings and the audit log. White-label settings are stored but not yet shown inside the customer app. Granting platform roles other than super_admin still needs a script.
- **Certificates use a starter checklist, not the official prescribed form.** Have a registered person confirm the layout matches what your regulator requires before anyone relies on it for compliance. The Settings page captures the installer's registration number, which prints on every certificate.
- **WhatsApp sharing is text only** (`wa.me` links). Clients sign on your device; there is no remote "sign from a link" page yet. Printing to PDF and attaching it works today.
- Storage is configured but unused: no logo or photo uploads yet (logos are an https link).
- No email verification, no Content-Security-Policy header yet, and no terms/privacy pages. Add these before onboarding real customers.
