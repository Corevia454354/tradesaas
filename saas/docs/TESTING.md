# Testing guide (real Firebase, real Paystack test mode)

There is no demo mode and no mock data. Every test below runs against a **staging** Firebase project and
Paystack **test mode**. Nothing here costs money or touches production.

Work through the parts in order. Each step says what to do, what you should see, and where to check.
If a step does not match, stop and fix it before continuing: later steps depend on earlier ones.

Time needed: about 2 hours the first time.

---

## Part 0. What you need

- A Google account (Firebase), a Paystack account (test mode is available straight after signup), a Vercel account, a GitHub account.
- Node 20+ on your computer (`node -v`).
- Two different email addresses you can receive nothing on (any fake address works, e.g. `owner.a@example.com`; Firebase does not verify them in this version). You need **two** because several tests prove one business cannot see another.
- A phone on mobile data (for Part 9).
- Keep three browser tabs handy: Firebase console, Paystack dashboard (test mode switch ON), Vercel dashboard.

Use a separate Firebase project for staging, for example `mytrades-staging`. Never test against production.

---

## Part 1. Firebase staging project

1. console.firebase.google.com → **Add project** → name it `mytrades-staging`. Google Analytics: off.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
3. **Build → Firestore Database → Create database → Production mode.** Choose a region close to your users (for South Africa, `europe-west1` or the nearest available). It cannot be changed later.
4. **Project settings (gear) → General → Your apps → Web (`</>`)** → register app `web`. Copy the `firebaseConfig` values.
5. Open `public/firebase-config.js` and replace every `REPLACE_ME`:
   `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. (Your product name and colours are in `public/brand.js`.)
   (These values are public identifiers, not secrets. Security comes from the rules.)
6. **Project settings → Service accounts → Generate new private key.** Save as `service-account.json` in the project folder. It is a secret. It is already in `.gitignore`. Never commit or share it.
7. Deploy rules (rules only):
   ```
   npm i -g firebase-tools
   firebase login
   firebase use --add        # pick mytrades-staging
   npm run deploy:rules
   ```
   **Check:** Firebase console → Firestore → **Rules** tab shows the text from `firestore.rules` and a recent publish time.

**Pass when:** rules are published and `firebase-config.js` has no `REPLACE_ME` left.

---

## Part 2. Paystack test mode

1. dashboard.paystack.com → toggle **Test mode** (top of the page).
2. **Settings → API Keys & Webhooks** → copy the **Test Secret Key** (`sk_test_...`).
3. **Products → Plans → Create plan**: name `Standard (test)`, amount `399`, currency ZAR, interval Monthly. Copy the plan code (`PLN_...`).
   If ZAR is not offered on your account, stop: Paystack must enable ZAR for your business before billing can work (contact Paystack support).
4. Create a second plan `Business (test)`, `149`, currency **USD**, monthly. Copy its code. (If USD is not available, see DEPLOY-SIMPLE step C4 for the ZAR fallback.)
5. Leave the webhook URL for Part 3, once you know your Vercel domain.

---

## Part 3. Deploy to Vercel

1. Push the project to a GitHub repository (private). Check `git status` shows no `service-account.json` and no `.env` files.
2. vercel.com → **Add New → Project** → import the repo.
   Framework preset **Other**. Leave Build Command empty. Output Directory `public` (already in `vercel.json`).
3. Before deploying, **Environment Variables** (apply to Production, Preview and Development):

   | Name | Value |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | open `service-account.json`, copy the **entire** JSON, paste |
   | `PAYSTACK_SECRET_KEY` | `sk_test_...` |
   | `PAYSTACK_PLAN_STANDARD` | `PLN_...` (Standard test plan) |
   | `PAYSTACK_PLAN_BUSINESS` | `PLN_...` (Business test plan) |
   | `CRON_SECRET` | any long random text |
   | `APP_URL` | `https://<your-project>.vercel.app` (no trailing slash; you can edit after the first deploy) |

4. **Deploy.** If you had to edit `APP_URL` afterwards, **Redeploy** (Deployments → ⋯ → Redeploy). Vercel only reads new variables on a new deployment.
5. Firebase console → **Authentication → Settings → Authorized domains → Add domain** → `<your-project>.vercel.app`.
6. Paystack (test mode) → **Settings → API Keys & Webhooks → Test Webhook URL** → `https://<your-project>.vercel.app/api/paystack-webhook` → Save.

### Test 3.1: server settings
Open `https://<your-project>.vercel.app/api/health`.

Expected:
```json
{"ok":true,"checks":{"firebaseServiceAccount":true,"firebaseProjectId":"mytrades-staging","paystackSecretKey":true,"paystackMode":"test","paystackPlanStandard":true,"paystackPlanBusiness":true,"appUrl":"https://<your-project>.vercel.app"}}
```
Fix anything `false` or `null`. `paystackMode` must say `test`. `firebaseProjectId` must be your **staging** project.

### Test 3.2: app starts
Open the site root.
- Expected: the sign-in screen.
- If you see **"Setup needed"**: `public/firebase-config.js` still has `REPLACE_ME` values (or you did not commit/redeploy after editing).
- If you see **"The app could not start"**: the line under the heading is the real error; see Troubleshooting in the README.
- Open `/app.js` directly: it must show JavaScript, not the sign-in page.

---

## Part 4. Core flows (business A)

Use a normal desktop browser. Keep DevTools open (F12 → Console) and watch for red errors throughout.

### Test 4.0: the 30-day trial
Applies to every new business (so it affects what 4.1 shows).
1. After signup the pill says **Standard** and a banner says "Free trial of Standard: 30 days left".
2. Firestore `tenants/<id>`: `tier: "standard"`, `trial.active: true`, `trial.endsAt` about 30 days ahead.
3. Plan page: explains the trial and shows **Subscribe to keep Standard**. CSV export works and jobs are unlimited.
4. In `/admin` open the business, press **End trial now**. Reload the app: pill says **Free**, banner says the trial has ended, the 5-jobs-a-month limit applies.
5. In `/admin` set days to 14 and press **Start / extend trial**: Standard returns with "14 days left".
6. **Expiry on its own:** in Firestore edit `trial.endsAt` to a past number (for example `1700000000000`), then reload the app. It asks the server to end the trial and drops to **Free** within a few seconds.
7. **Daily job:** set `trial.active: true` and a past `endsAt` on a test business, set `tier: "standard"`. In Vercel open **Project, Settings, Cron Jobs** and press **Run** on `/api/cron-trials` (needs `CRON_SECRET` set). Expected: that business is Free afterwards.
8. **Paying during the trial:** upgrade with the test card (Part 7). Expected: `trial.active: false`, Standard stays, and the trial banner disappears.
9. A contract-managed business and a paying business cannot be given a trial (admin shows an error).

### Test 4.0b: the free Business trial
1. Sign up a new business. On the billing page you see **R399/month**, **US$149/month** and "Up to 20 people", and a button **Try Business free for 30 days (no card)**.
2. Press it and confirm. Expected: the plan pill says Business, the top banner says "Free trial of Business: 30 days left", and Team, Library, Support, Payroll appear in the menu. Firestore `tenants/<id>`: `tier: business`, `trial.tier: business`, `trialsUsed.business: true`.
3. The button is gone from the billing page. Add one person under Team.
4. To see the end without waiting 30 days: in Firestore change `trial.endsAt` to a time in the past, then reload the app. Expected: the plan drops to Free, a banner says the trial ended, the Team pages disappear, and the person you added now sees "not on the Business plan". Records are still in Firestore. No second Business trial is offered.
5. Subscribe to Business with the test card (Part 7). Expected: Business returns, the person can sign in again with everything intact.
6. In `/admin`, open a business and use **Trial plan** to start a Business trial for it.

### Test 4.1: sign up creates a business
1. Click **Create account**. Business name `Sparky Electrical`, email `owner.a@example.com`, password 8+ chars.
2. Expected: you land on the dashboard with a **Standard** (trial) plan pill, or after the trial a **Free** pill, and a banner "0 of 5 jobs used" style message once you add a job.
3. Verify in Firebase console:
   - **Authentication → Users:** `owner.a@example.com` exists.
   - **Firestore:** `tenants/<id>` exists with `tier: "free"`, `status: "active"`, an `entitlements` map; `tenants/<id>/members/<uid>` has `role: "owner"`; `ownerIndex/<uid>` exists.
4. Vercel → project → **Logs** (filter `/api/tenant`): one POST, status 200.

### Test 4.2: double submit does not create two businesses
1. Sign out. Create another account `owner.b@example.com`, but double-click the Create button quickly.
2. Expected: still exactly **one** `tenants` document for owner B (check Firestore). Reloading keeps you in the same business.

### Test 4.3: settings
Settings → fill business name, address, phone, VAT number, registration number → Save. Reload: values persist. Firestore: `tenants/<A>/settings/profile` holds them.

### Test 4.4: client
Clients → New → name `Test Client`, phone `082 123 4567` → Save. It appears in the list and in Firestore `tenants/<A>/clients`.

### Test 4.5: quote with signature
1. Quotes → New → pick the client, add 2 line items (qty 2 × R100, qty 1 × R50.50), VAT ticked.
2. Expected totals: subtotal R250.50, VAT R37.58, total R288.08.
3. Sign on the canvas with your finger or mouse → Save. Reopen: the signature shows. Print preview shows it too.

### Test 4.6: quote → job
Open the quote → **Convert to job**. Expected: a job appears (status Scheduled). Firestore: `tenants/<A>/jobs/<id>` and `tenants/<A>/usage/<YYYY-MM>` with `jobs: 1`.
Network tab: the create went to `POST /api/jobs`, not directly to Firestore.

### Test 4.7: certificate (checklist, issue, lock)
1. Certificates → New → type Electrical → pick client.
2. Try **Issue** with unanswered checks. Expected: refused with a message.
3. Answer every check, sign, **Issue**. Expected: status Issued, record read-only (no edit/delete buttons).
4. Firestore: the document has `status: "issued"`.
5. Reminder: set a renewal date a few days ahead on a new certificate; the dashboard "renewals" list shows it with a WhatsApp link.

Note: the checklist layout is a starter, not the official prescribed form. Do not rely on it for regulatory compliance until a registered person has confirmed the layout.

### Test 4.8: invoice
1. Invoices → New, pick the client, add items, VAT on, set status **Draft** and Save. Then edit it: status **Sent** with a due date in the past.
2. Dashboard shows it under overdue. **WhatsApp** opens `wa.me/27821234567?text=...` with the invoice text.
3. **Mark paid**. It leaves the overdue list.
4. Delete: a **draft** invoice deletes; a sent or paid one has no delete (rules block it, tested in Part 6).

### Test 4.9: search, print/PDF
- Search box: type part of the client name; quote, job, certificate and invoice for that client appear.
- Open an invoice → **Print** → browser print dialog → Save as PDF. Controls and nav are hidden; business details and totals show.

### Test 4.10: free plan limits
After the trial the Free plan allows 5 jobs per month and no CSV export. See Part 5.

---

## Part 5. Monthly job limit (enforced on the server)

1. First make business A Free: in `/admin` press **End trial now** (Test 4.0 step 4), then reload the app. Create jobs until you have 5 this month (Test 4.6 made the first). Jobs made during the trial count too.
2. Try a 6th. Expected: a message "You've used all 5 jobs this month on the Free plan. Upgrade to add more." No job is created.
3. Firestore: `tenants/<A>/usage/<YYYY-MM>` → `jobs: 5`.
4. **Deleting does not free a slot.** Delete one job, then try to create another: still refused (counter stays 5). This is intentional so the limit cannot be gamed.
5. **Bypass attempt from the browser.** Open DevTools console on the signed-in app and run:
   ```js
   const fs = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
   const { auth } = await import('/data.js');
   const db = fs.getFirestore();
   const tid = (await auth.currentUser.getIdTokenResult()).claims.tenantId;
   await fs.addDoc(fs.collection(db, 'tenants', tid, 'jobs'), { title: 'sneaky', clientId: 'x', status: 'scheduled', createdAt: Date.now() });
   ```
   Expected: `FirebaseError: Missing or insufficient permissions.` The rules forbid creating jobs directly.
6. **Forged counter.** Same console: `await fs.setDoc(fs.doc(db,'tenants',tid,'usage','2026-10'), {jobs:0})` → expected: permission denied.
7. **Month rollover** (optional, needs patience): the key is the South African month (UTC+2). On the 1st of next month a new `usage/<YYYY-MM>` document starts at 0 automatically.

---

## Part 6. Security tests (two businesses)

Sign in as business B (`owner.b@example.com`) in a **private window** so the two sessions stay separate. Add one client in B named `B Secret Client`.

In the console of the app signed in as **A**, with `fs`, `db`, `tid` defined as in Part 5 step 5:

| # | Run | Expected |
|---|---|---|
| 6.1 | `await fs.getDocs(fs.collection(db,'tenants','<B tenant id>','clients'))` | permission denied (cross-tenant read) |
| 6.2 | `await fs.getDoc(fs.doc(db,'tenants','<B tenant id>'))` | permission denied |
| 6.3 | `await fs.updateDoc(fs.doc(db,'tenants',tid), {tier:'business'})` | permission denied (tier is server-only) |
| 6.4 | `await fs.updateDoc(fs.doc(db,'tenants',tid), {status:'active', 'entitlements.features':['quotes','jobs','certificates','invoices','tasks']})` | permission denied |
| 6.5 | `await fs.setDoc(fs.doc(db,'tenants',tid,'members','evil'), {role:'owner'})` | permission denied |
| 6.6 | `await fs.getDoc(fs.doc(db,'ownerIndex','x'))` | permission denied |
| 6.7 | `await fs.getDocs(fs.collection(db,'auditLogs'))` | permission denied (super admin only) |
| 6.8 | Update an **issued** certificate: `await fs.updateDoc(fs.doc(db,'tenants',tid,'certificates','<issued cert id>'), {notes:'edited'})` | permission denied |
| 6.9 | Delete any certificate: `await fs.deleteDoc(fs.doc(db,'tenants',tid,'certificates','<any cert id>'))` | permission denied |
| 6.10 | Delete a **sent or paid** invoice | permission denied |
| 6.11 | Delete a **draft** invoice | succeeds |

To find ids: Firestore console → open the documents and copy the id from the path.

**API checks** (replace `<ID_TOKEN>` with the output of `await (await import('/data.js')).auth.currentUser.getIdToken()` in the console):
```
# no token
curl -i -X POST https://<domain>/api/jobs -H 'content-type: application/json' -d '{"data":{"title":"x","clientId":"y"}}'
# expect 401

# normal user calling admin
curl -i -X POST https://<domain>/api/admin -H "authorization: Bearer <ID_TOKEN>" -H 'content-type: application/json' -d '{"action":"listTenants"}'
# expect 403

# job for a client that does not exist
curl -i -X POST https://<domain>/api/jobs -H "authorization: Bearer <ID_TOKEN>" -H 'content-type: application/json' -d '{"data":{"title":"x","clientId":"doesnotexist"}}'
# expect a 4xx with a message, and no new job in Firestore

# wrong method
curl -i https://<domain>/api/billing
# expect 405 (or 404), never 200
```
ID tokens last one hour. Treat them like passwords: do not paste them anywhere public.

---

## Part 7. Billing with Paystack test cards

Business A is on Free with 5/5 jobs used. Plan page → **Upgrade to Standard**.

1. Expected: redirect to a Paystack hosted checkout showing **R399.00** and the plan name.
   For Business the checkout must show **US$149.00** (or your ZAR fallback amount) and the Business plan name.
2. Pay with a test card (any future expiry, e.g. 09/27):

   | Scenario | Card | CVV | Then |
   |---|---|---|---|
   | Success, no extra steps | `4084 0840 8408 4081` | 408 | none |
   | Success with PIN | `5078 5078 5078 5078 12` | 081 | PIN `1111` |
   | Success with PIN + OTP | `5060 6666 6666 6666 666` | 123 | PIN `1234`, OTP `123456` |
   | Success with PIN + phone + OTP | `5078 5078 5078 5078 04` | 884 | PIN `0000`, OTP `123456` |
   | Declined | `4084 0800 0000 5408` | 001 | declined message |
   | Insufficient funds | `4084 0800 0067 0037` | 787 | insufficient funds |

   Card numbers can change; the current list is in Paystack's docs under "Test payments". Paystack does not document ZAR-specific cards: if a card is refused for currency reasons, try another from the list.

3. **Success path, use the first card.** After paying you return to `…/billing/complete` (or `/?billing=complete`).
   - Expected: the app shows a confirmation and the pill changes to **Standard** within a few seconds (it updates live).
   - If the pill stays Free for more than ~30 seconds, the webhook is not arriving. Check Paystack → **Settings → API Keys & Webhooks → Logs** (test mode) for the delivery and its status code; check Vercel logs for `/api/paystack-webhook`. 401 means the secret key in Vercel differs from the one that signs the webhook. 404 means the URL is wrong.
   - Firestore `tenants/<A>`: `tier: "standard"`, `entitlements` recomputed (unlimited jobs), and `billing.paystackSubscriptionCode` filled in.
4. Now confirm Standard features: create a 6th job (works, since unlimited), and CSV export downloads a file that opens in Excel with the right columns. Open it in a text editor to confirm any cell starting with `=`, `+`, `-` or `@` in a text field is prefixed with `'`.
5. **Declined card.** Sign up business C, try Upgrade with the declined card. Expected: the checkout shows the failure; the app remains Free after returning; Firestore tier stays `free`.
6. **PIN/OTP cards.** Repeat the success flow on a fresh business with one of the PIN/OTP cards to prove the hosted flow works end to end.
7. **Duplicate webhook safety.** In Paystack's webhook log, **Resend** the `charge.success` event. Expected: still `standard`, no errors in Vercel logs.

### Test 7.1: signature check (forged webhooks are rejected)
```
curl -i -X POST https://<domain>/api/paystack-webhook \
  -H 'content-type: application/json' -H 'x-paystack-signature: deadbeef' \
  -d '{"event":"subscription.disable","data":{"metadata":{"tenantId":"<A tenant id>"}}}'
```
Expected: 401 and the tenant is unchanged. Then a **correctly signed** body is accepted (do this against a throwaway tenant, not one you care about):
```
BODY='{"event":"ping","data":{}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha512 -hmac "$PAYSTACK_SECRET_KEY" | sed 's/^.* //')
curl -i -X POST https://<domain>/api/paystack-webhook -H 'content-type: application/json' -H "x-paystack-signature: $SIG" -d "$BODY"
```
Expected: 200.

### Test 7.2: cancel
1. As the Standard business, Plan → **Cancel subscription**.
2. Expected immediately: a message that the plan continues until the end of the paid period; Firestore `cancelAtPeriodEnd: true`; tier still `standard`.
3. In Paystack (test mode) → Customers → the customer → Subscription: status shows non-renewing / cancelled.
4. At the next billing date Paystack sends `subscription.disable` and the business drops to Free. You cannot wait a month in test mode: instead, in Paystack's webhook log find the `subscription.disable` event if present, or trigger the effect with the admin API (Part 8) and note this step as "verified by documentation, confirm on first real renewal".

### Test 7.3: failed renewal
You cannot force a real failed renewal in test mode. Simulate by resending (from Paystack's log) or crafting a signed `invoice.payment_failed` body (use the signing snippet above, with `data.customer.customer_code` copied from `tenants/<id>.billing.paystackCustomerCode` in Firestore). Expected: tenant `status: "past_due"`; the app shows a red banner but still lets the business read and write (rules allow `past_due`). A later `charge.success` returns it to `active`.

---

## Part 8. Platform admin (you)

### Test 8.1: make yourself super admin (no terminal)
1. Set `PLATFORM_ADMIN_EMAILS` in Vercel to your email and redeploy. `/api/health` should show `adminEmailsSet: true`.
2. Sign up in the app with that email.
3. Open `/admin`, sign in. Expected: "Not an admin yet".
4. Press **Make me admin** first, **before** verifying. Expected: a message that the email is not verified yet.
5. Press **Send verification email**, click the link in the email, return and press **Make me admin**. Expected: the business list opens.
6. Negative: sign up a second account with an email that is NOT on the list, verify it, open `/admin`, press **Make me admin**. Expected: refused ("not on the admin list"). Then confirm in the console that its claims have no `platformRole`.

### Test 8.1b: admin panel screen
Open `https://<domain>/admin` and sign in with your admin account.
1. **Business list:** every business appears with plan and status. Search by the start of a name (case matters).
2. **Open business A:** shows owner email, member count, jobs this month (matches `usage/<YYYY-MM>`), billing codes.
3. **Overrides:** set Seats to 25, grant White label, tick Contract managed, add a note → Save → confirm. The "Effective now" line updates; Firestore `tenants/<A>.entitlements` and `overrides` match; `auditLogs` gets an entry.
4. **Suspend** business C (enter a reason), then sign in as C in another browser: reads work, saves fail. **Restore** in the panel and saves work again.
5. **Plan buttons:** force C to Business, then back. Paystack is not touched.
6. **Branding:** save a display name and colour; try `javascript:` as the logo and expect an error toast.
7. **Audit log tab:** shows each change with who, when and detail.
8. **Access:** a normal customer account opening `/admin` sees "No access". Signed out sees the staff sign-in.

### Test 8.2: admin API with curl (same actions, for scripting)
```
TOKEN=<your ID token>   # fresh, within the hour
H='content-type: application/json'
URL=https://<domain>/api/admin

# list
curl -s -X POST $URL -H "authorization: Bearer $TOKEN" -H "$H" -d '{"action":"listTenants"}'
# expect all businesses with id, name, tier, status

# search by name prefix
curl -s -X POST $URL -H "authorization: Bearer $TOKEN" -H "$H" -d '{"action":"listTenants","search":"Spark"}'

# override: give business A 25 seats worth of limits and white label, and mark contract-managed
curl -s -X POST $URL -H "authorization: Bearer $TOKEN" -H "$H" -d '{"action":"setOverrides","tenantId":"<A>","overrides":{"limits":{"jobsPerMonth":-1},"addFeatures":["whiteLabel"],"contractManaged":true,"note":"Pilot deal"}}'
# expect {"ok":true}; Firestore tenants/<A>.entitlements updated; auditLogs has a tenant.set_overrides entry

# bad input rejected
curl -s -i -X POST $URL -H "authorization: Bearer $TOKEN" -H "$H" -d '{"action":"setOverrides","tenantId":"<A>","overrides":{"limits":{"seats":"lots"}}}'
# expect 400 with a message, tenant unchanged

# force a tier
curl -s -X POST $URL -H "authorization: Bearer $TOKEN" -H "$H" -d '{"action":"setTier","tenantId":"<C>","tier":"standard"}'

# suspend
curl -s -X POST $URL -H "authorization: Bearer $TOKEN" -H "$H" -d '{"action":"setStatus","tenantId":"<C>","status":"suspended","reason":"test"}'
# restore
curl -s -X POST $URL -H "authorization: Bearer $TOKEN" -H "$H" -d '{"action":"setStatus","tenantId":"<C>","status":"active"}'

# branding
curl -s -X POST $URL -H "authorization: Bearer $TOKEN" -H "$H" -d '{"action":"setBranding","tenantId":"<A>","branding":{"displayName":"Sparky","primaryColor":"#0f766e","logoUrl":"https://example.com/logo.png"}}'
```
Checks:
- **Suspended business:** signed in as C, the app can still read but every save fails (rules: `active()`), and an Upgrade/checkout attempt is refused. After restore, saving works again.
- **contractManaged:** with it on for A, replay a `subscription.disable` webhook for A (signed, Test 7.1). Expected: A's tier does **not** change. Turn it off (`"contractManaged":false`) and replay: now it drops to Free.
- **Audit log:** Firestore → `auditLogs` has one entry per admin call with actor uid, action, tenantId, detail. As super admin you can read it in the console; in the app's console `getDocs(collection(db,'auditLogs'))` should work for you and fail for ordinary users (6.7).
- **Lower roles:** other platform roles (support, billing, read_only) can be set the same way as the claim; verify `support` can `setStatus` but gets 403 on `setTier`.

---

## Part 12. Business plan (team features)

Use a business that is on **Business** (pay with the test card for Business, or in `/admin` set the tier to Business). You need three more email addresses you can open (use `you+dana@gmail.com`, `you+mia@gmail.com`, `you+eli@gmail.com`).

### Test 12.1: add people
1. Team, then **+ Add person**. Add Dana as *Department head*, Mia as *Manager* reporting to Dana, Eli as *Employee* reporting to Mia. Give each an hourly cost.
2. Each time you see "was added" with a link. Expected: Firestore `tenants/<id>/members` has three docs; Eli's `ancestors` lists you, Dana and Mia.
3. Open the link for Eli in a private window, set a password, sign in. Expected: Eli sees only Home, Jobs, Certificates, Tasks, Documents, Time, Leave, Chat, My pay. No Quotes, Invoices, Costing, Reports.

### Test 12.2: who can see what
1. As Eli open `#/costing`, `#/quotes`. Expected: sent back home.
2. As Mia open Payroll. Expected: not in her menu; no payslip amounts anywhere.
3. As Eli try to open a job's Costs: expected expenses only, no profit figures.

### Test 12.3: tasks, documents
1. Mia creates a task for Eli. Eli sees it, sets it in progress, comments, marks done. Mia sees it done.
2. Mia sends a document to her team. Eli confirms he has read it. Mia sees "1/1 read".

### Test 12.4: time and leave
1. Eli starts the timer, waits a minute, stops. Mia sees Eli's hours under Time.
2. Eli requests leave for two future weekdays. Mia approves. Eli's balance goes down by 2.

### Test 12.5: chat
Mia makes a group with Eli. Both type; each sees the other's message appear without reloading.

### Test 12.6: payroll and costing
1. Owner: Payroll, new payslip for Eli, one earning line (10000), one deduction (100), **Save & issue**. Expected net R9 900. Eli sees it under My pay and can print it. Nobody else (not Mia, not Dana) sees it.
2. Eli adds an expense on a job. Owner opens Costing for that job: the expense, Eli's labour (hours x hourly cost) and profit appear.

### Test 12.7: switching someone off
Owner opens Eli, **Switch off access**. Expected: within about an hour Eli is signed out (immediately on the next action); his tasks, hours and payslips stay.

### Test 12.8: rules (browser cannot cheat)
Sign in as Eli, open the browser console (F12) on the app and run nothing special: instead check Firestore **Rules playground** for the Business paths. As Eli: read `tenants/<id>/payslips` for someone else must be **denied**; write to `tenants/<id>/tasks/x` must be **denied** (all team writes go through the server).

### Test 12.9: plan switching
Subscribe to Standard, then upgrade to Business. Expected: Paystack shows the old Standard subscription disabled and only Business active; the app shows Business.

## Part 13. Document library and customer support (Business plan)

You need the three extra email addresses from Part 12 (owner, a manager "Mia", an employee "Eli"). Do B9 in DEPLOY-SIMPLE first (Storage), or the upload tests will say "File storage is not switched on".

### Test 13.1: upload, share, download
1. Owner: **Library, + Add**. Choose a small PDF, name it, set **Expires on** to 10 days from today, tick **All employees**, **Upload**.
2. Expected: it appears with "expires in 10 days". Firebase Storage Files shows `tenants/<id>/library/<docid>/<name>.pdf`.
3. Eli: Library shows it. Open it, **Download**: the file downloads. (The link stops working after about five minutes.)
4. Eli has no **+ Add** button, and `#/library/new` says he has no permission.

### Test 13.2: who can add documents
1. Owner: Library, **Who is allowed to add documents**, tick **All managers**, Save.
2. Mia: now has **+ Add**. She uploads "Secret price list" and ticks nobody. Expected: Eli does **not** see it; the owner does.
3. Mia opens it, ticks **All employees**, Save. Expected: Eli now sees it but has no edit form.
4. Mia deletes it. Expected: gone from the list, and the file is gone in Storage.

### Test 13.3: rules (the browser cannot cheat)
Firebase **Rules playground**:
- Storage: as a signed-in user, **get** `tenants/<id>/library/<docid>/<name>.pdf` must be **denied** (files are only read through the server).
- Storage: **create** at a path with a document id that does not exist must be **denied**.
- Firestore: as Eli, **get** a library document that is not shared with employees must be **denied**; **create/update/delete** of any library or tickets document must be **denied**.

### Test 13.4: expiry
Set a document's expiry to yesterday. Expected: red "expired" label; the owner's Home shows the Documents expiring tile with a count.

### Test 13.5: support inquiries
1. Owner: **Support, Settings**. Copy the public link. Tick Mia as an agent, Save. Mia now has a **Support** tab; Eli does not.
2. In a private window open the link (no sign-in). Fill the form and send. Expected: "Thank you" with a reference like #0001.
3. Mia: Support, **Unassigned** shows it. Open it, **Take this one**, add an internal note, write a reply, press **Reply with Gmail**. Expected: Gmail opens with the customer's address, the subject `Re: ... [#0001]` and your text. Press Send in Gmail. Back in the app the reply shows "reply via Gmail" and the status says "Waiting for customer". Close it.
4. Eli opens `#/support`: sent home. Mia opens `#/support/settings`: "Only the owner".
5. Spam: submit with a bad email (refused). Typing `<script>` in the message must show as plain text everywhere.

## Part 9. Real phone and real world

1. Open the Vercel URL on your phone (mobile data, not your Wi-Fi). Add to Home Screen if you like.
2. Sign in, create a quote, **sign with your finger**. The signature canvas must not scroll the page while you draw.
3. Send the quote via WhatsApp: the WhatsApp app opens with a pre-filled message to the client's number (South African numbers are converted to `27…`).
4. Create a certificate on the phone and issue it.
5. Print/share as PDF from the phone's browser menu.
6. Rotate the phone and check nothing is cut off. Check text is readable in bright light.
7. Turn on airplane mode, try to save: you should get an error, not a silent loss.

---

## Part 10. Optional: rules tests with the Firebase emulator

Rules are the security boundary, so test them without touching the cloud:
```
firebase emulators:start --only auth,firestore
```
Open `http://localhost:3000/?emulator` while running `vercel dev` (or serve `public` and add `?emulator`). The app connects to the local Auth and Firestore emulators on localhost only. API routes still need the real service account, so the emulator is best for the browser-console tests of Part 6.

---

## Part 11. Production cutover checklist

Do this only after Parts 1–9 pass on staging.

1. Create a **second** Firebase project for production. Repeat Part 1 there (config, rules, service account).
2. Paystack: complete business verification, switch to **Live mode**, create live Standard and Business plans, copy the live secret key and plan codes. Set the live webhook URL.
3. Vercel: in **Production** environment only, set live values for `FIREBASE_SERVICE_ACCOUNT`, `PAYSTACK_SECRET_KEY` (`sk_live_`), both plan codes, `APP_URL` (your final domain). Keep Preview/Development on staging values.
4. Point the production deployment at the production Firebase config. The simplest approach is a separate Vercel project (and branch) with its own `public/firebase-config.js`.
5. Add your custom domain in Vercel, then add it to Firebase **Authorized domains**.
6. Deploy rules to production: `firebase use <prod-project>` then `npm run deploy:rules`.
7. Redeploy, open `/api/health`: `paystackMode` must be `live` and `firebaseProjectId` your production project.
8. Do one real payment with your own card on the cheapest setting you can, confirm the webhook upgrade, then cancel and (if desired) refund it from the Paystack dashboard.
9. Make yourself super admin on the production project (Part 8.1).
10. Turn on Firestore backups/PITR if available on your plan, and set budget alerts in Google Cloud.
11. Have your legal advisor review terms, privacy policy (POPIA), and the certificate layout before onboarding real customers.

---

## Pass/fail record

Copy this list and tick each item as you go.

- [ ] 3.1 health ok, mode test, staging project
- [ ] 3.2 app starts (no Setup-needed, no could-not-start)
- [ ] 4.1–4.9 core flows
- [ ] 5 job limit holds; browser bypass blocked
- [ ] 6.1–6.11 rules tests, API 401/403/4xx
- [ ] 7 success card upgrades; declined card does not; PIN/OTP cards work
- [ ] 7.1 forged webhook rejected
- [ ] 7.2 cancel keeps plan until period end
- [ ] 8 admin API incl. suspend, contractManaged, audit log
- [ ] 9 real phone: signature, WhatsApp, PDF
- [ ] 11 production cutover

If anything fails, note the step number, the exact message on screen, the red lines from the browser console, and the matching Vercel log lines. Those four things are enough to diagnose almost any failure.

## Part 14. Team calendar and profile pictures (Business plan)

### Test 14.1: calendar
1. As the owner open **Calendar**, click **Add event**, fill in a title and a date, save.
2. Sign in as an employee (another browser). The event is on their calendar. They have no **Add event** button.
3. As the owner: Calendar > **Who can add events**, tick **Employees**, save. The employee now gets **Add event** and can add one; everyone sees it.
4. The employee cannot edit or delete the owner's event; the owner can edit or delete any event.

### Test 14.2: profile picture
1. Open **Profile**, click **Add a picture**, choose a photo. It shows next to the name in the menu, chat and team pages within a second.
2. Choose **Remove**; the initials come back.
