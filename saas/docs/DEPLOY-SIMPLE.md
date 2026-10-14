# Put Tradeline online: no Terminal, no coding tools

Everything is done in your web browser. Do one step, tick it, do the next. If a screen looks different from what is written here, take a screenshot and send it to me.

**Secret** = a password for programs. Never post or send these: the Firebase `.json` key file, your Paystack `sk_test_` key, any password.

You will build a **test** copy first. Test money is pretend money. Going live is Part J.

**Before you start, open Notepad and make a file `my-notes.txt`** (keep it on your computer only). You will paste values into it as you go: the Firebase bucket name, the Paystack secret key, two plan codes, and your site address.

**What you need:** a computer with a web browser, a Google account, an email address you can open, about 90 minutes, and a card for Google (Firebase Storage) and for Vercel if you go live (see Part J).

---

## A. GitHub (a safe box for your files)
1. Go to **github.com** and **Sign up**. Confirm your email.
2. Click the **+** (top right), then **New repository**. Name it `tradeline`. Choose **Private**. Tick nothing else. Click **Create repository**.
3. On your computer, find `trades-saas-standard.zip`. Right-click it, **Extract All**. Open the `saas` folder inside. You should see `api`, `public`, `docs`, `package.json`, `vercel.json` and more.
4. On the GitHub page, click **uploading an existing file**.
5. Open the `saas` folder, press **Ctrl+A** to select everything inside it, and drag it into the GitHub page. Wait until every file and folder has finished loading (the bar goes away).
   - GitHub cannot upload an empty folder, that is fine.
   - Never upload the Firebase `.json` key file. It is not in the zip. Keep it that way.
6. Scroll down and click **Commit changes**.
7. **Check:** the page shows the folders `api`, `public`, `docs`, `test` and the files `vercel.json`, `firestore.rules`, `storage.rules`.

## B. Firebase (logins, database, files)
1. Go to **console.firebase.google.com** and sign in with Google.
2. Click **Create a project**. Name it `tradeline-staging`. Turn **Google Analytics off**. Click **Create project**, then **Continue**.
3. **Logins.** Left menu: **Build, then Authentication, then Get started**. Click **Email/Password**, switch the first **Enable** on, click **Save**.
4. **Database.** Left menu: **Build, then Firestore Database, then Create database**. Choose a location near South Africa (for example `europe-west1` or `africa-south1` if offered; it cannot be changed later). Choose **Start in production mode**. Click **Create**.
5. **Database rules (very important).** In Firestore, click the **Rules** tab.
   - On GitHub, open the file `firestore.rules`, click **Raw**, press Ctrl+A, Ctrl+C.
   - In Firebase, click inside the rules box, press Ctrl+A, then Ctrl+V to replace everything. Click **Publish**.
6. **Web app settings.** Click the **gear** (top left), **Project settings**. Under "Your apps" click the **`</>`** icon. Nickname `web`. Do **not** tick Hosting. Click **Register app**. Leave the code box on screen.
7. **Put the settings into your project (on GitHub).** Open `public/firebase-config.js`, click the **pencil** (Edit). Replace each `REPLACE_ME` with the matching value from the Firebase code box: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. Keep the quote marks and commas. Click **Commit changes**, then **Commit changes** again. These values are not secret.
8. **The secret key.** Still in Project settings, open the **Service accounts** tab. Click **Generate new private key**, then **Generate key**. A `.json` file downloads. Leave it in Downloads. You paste its text into Vercel in step D4. Never upload it anywhere else.
9. **Files (needed for the Business plan's document library).**
   - Left menu: **Build, then Storage, then Get started**. If Firebase says you must **upgrade to the Blaze plan**, click **Upgrade** and add your card. Blaze is pay-as-you-go and small amounts are inside the free allowance. In the same screen set a **budget alert** (for example US$10) so you are warned.
   - Choose **Production mode**, the same location, then **Done**.
   - At the top of the **Files** tab you see an address like `gs://tradeline-staging.firebasestorage.app`. Copy only the part **after `gs://`** into `my-notes.txt`. This is your **bucket name**.
   - Click the **Rules** tab. On GitHub open `storage.rules`, copy the raw text, paste it over everything in Firebase, click **Publish**. If Firebase asks permission for Storage rules to read Firestore, click **Allow** or **Grant**.
10. **Check:** Firestore Rules and Storage Rules both show "Published" with today's date.

## C. Paystack (billing, test mode)
1. Sign up at **dashboard.paystack.com**. Look at the top of the dashboard and make sure **Test mode** is switched on.
2. **Settings, then API Keys & Webhooks.** Copy the **Test Secret Key** (it starts with `sk_test_`) into `my-notes.txt`.
3. **Plan 1.** Go to **Products (or Plans), then Plans, then Create plan**. Name `Standard test`, amount `399`, currency **ZAR**, interval **Monthly**. Create it. Open it and copy the **Plan code** (starts with `PLN_`) into `my-notes.txt` as STANDARD.
   - If ZAR is not offered, ask Paystack support to switch it on. Billing cannot work without it.
4. **Plan 2.** Create another plan: name `Business test`, amount `149`, currency **USD**, interval **Monthly**. Copy its **Plan code** into `my-notes.txt` as BUSINESS.
   - Business is priced in **US dollars**. Paystack must have USD switched on for your account. A South African account may not be allowed to bill in dollars. Ask Paystack support.
   - If you cannot get USD, create the Business plan in **ZAR** at about `2460` instead. Then on GitHub open `public/shared/plans.js`, click the pencil, find the line `business: { amount: 149, currency: 'USD', includedSeats: 20 },` and change it to `business: { amount: 2460, currency: 'ZAR', includedSeats: 20 },`. Commit. Everything else follows by itself.
5. The webhook address is added later, in Part E.

## D. Vercel (puts it on the internet)
1. Go to **vercel.com**. Click **Sign Up, then Continue with GitHub**. Allow it.
2. Click **Add New, then Project**. Next to `tradeline`, click **Import**. (If you do not see it, click "Adjust GitHub App permissions" and allow that repository.)
3. Set **Framework Preset** to **Other**. Leave **Build Command** empty. Make sure **Output Directory** says `public`. Leave Install Command as it is.
4. Open **Environment Variables** and add these eight. Type the **Name** exactly, paste the **Value**, click **Add** each time.

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | open the Firebase `.json` file in Notepad, Ctrl+A, Ctrl+C, paste the whole text |
| `PAYSTACK_SECRET_KEY` | your `sk_test_...` key |
| `PAYSTACK_PLAN_STANDARD` | the Standard `PLN_...` code |
| `PAYSTACK_PLAN_BUSINESS` | the Business `PLN_...` code |
| `APP_URL` | type `https://temporary.example.com` for now (fixed in step 7) |
| `PLATFORM_ADMIN_EMAILS` | your own email address (comma between several) |
| `CRON_SECRET` | 30 or more random letters and numbers you type by hand |
| `FIREBASE_STORAGE_BUCKET` | the bucket name from B9 (no `gs://`). Skip only if you skipped B9 |

5. Click **Deploy**. Wait for the confetti or the "Congratulations" screen (1 to 3 minutes). Click the picture of the site to open it, and copy the address, for example `tradeline-abc123.vercel.app`, into `my-notes.txt`.
6. In Vercel: your project, **Settings, then Environment Variables**. Click the three dots beside `APP_URL`, **Edit**, set it to `https://` plus your address (no slash at the end), **Save**.
7. **Deployments** tab. Click the three dots on the top deployment, **Redeploy**, **Redeploy**. Vercel only reads new settings when it deploys again.
8. **Check:** the daily job is registered: project **Settings, then Cron Jobs** shows `/api/cron-trials`.

## E. Tell Firebase and Paystack your address
1. Firebase: **Authentication, then Settings, then Authorized domains, then Add domain**. Type your address without `https://` (for example `tradeline-abc123.vercel.app`). Add.
2. Paystack (still in Test mode): **Settings, then API Keys & Webhooks**. In **Test Webhook URL** type `https://YOUR-ADDRESS/api/paystack-webhook`. Save. (Leave the Test Callback URL empty.)

## F. Four checks
1. Open `https://YOUR-ADDRESS/api/health`. Expect `"ok":true`, `paystackMode` `"test"`, `adminEmailsSet` `true`, `cronSecretSet` `true`, and `storageBucketSet` `true` if you did B9. Anything `false` or `null` means a Vercel value is missing or misspelled. Fix it, then Redeploy (D7).
2. Open `https://YOUR-ADDRESS/`. You see the **Tradeline** sign-in page with the logo. If it says **Setup needed**, `public/firebase-config.js` still has `REPLACE_ME` (B7). Fix it on GitHub, wait one minute, reload.
3. Click **Create account**, type your email and a password, then your business name. You land on Home. The plan says **Standard** with a banner "Free trial of Standard: 30 days left".
4. Reload the page. You stay signed in.

## G. Make yourself the boss (admin)
1. Use the **same email** that is in `PLATFORM_ADMIN_EMAILS`.
2. Open `https://YOUR-ADDRESS/admin` and sign in. You see **Not an admin yet**.
3. Click **Send verification email**. Open your inbox (check Spam), click the link.
4. Back on the admin page click **Make me admin**. You see the list of businesses.

## H. Test the money (pretend money)
1. In the app open **Plan**. Click **Upgrade to Standard** ("Subscribe to keep Standard").
2. On the Paystack page use card `4084 0840 8408 4081`, expiry `09/27`, CVV `408`. Complete payment.
3. You return to the app. Within a few seconds the plan shows **Standard** and the trial banner is gone.
4. Try **Switch to Business** the same way. The checkout should show US$149.00 (or your ZAR amount). The old Standard subscription gets disabled in Paystack (Customers or Subscriptions list).
   - If the plan does not change after 30 seconds: Paystack, **Settings, API Keys & Webhooks**, open the webhook log and send me the error.

## I. Test the team and the new features
Follow **docs/WORKFLOW-AND-TESTING.md** (the 90-minute run) and **docs/TESTING.md** Parts 12 and 13: add people, tasks, documents, time, leave, chat, payslips, costing, the library and customer support.

---

## J. Going live for real
Only after everything above passes. Keep the test copy for experiments.
1. **Vercel plan.** Vercel's free Hobby plan is for personal, non-commercial use. A business that charges customers needs the **Pro** plan (about US$20 per month). Upgrade under your account **Settings, then Billing**.
2. **Second Firebase project.** Repeat Part B with the name `tradeline-live`, including the rules, Storage, the web config and a **new** service-account key. Never reuse the test project for real customers.
3. **Paystack live mode.** Complete Paystack's business verification so **Live mode** can be switched on. Then in Live mode create the same two plans (Standard 399 ZAR, Business 99 USD or your ZAR fallback), copy the live `sk_live_` secret key and the live plan codes, and set the **Live Webhook URL** to `https://YOUR-LIVE-ADDRESS/api/paystack-webhook`.
4. **A second Vercel project** (or switch the first one) with the live values: live service account, `sk_live_` key, live plan codes, live `APP_URL`, your admin email, a new `CRON_SECRET`, the live bucket. Because `public/firebase-config.js` holds the Firebase web settings, the live project needs its own copy of the code with the live settings (a second GitHub repository, or a second branch connected to the live Vercel project).
5. **Your own web address.** Buy a domain, then Vercel **Settings, then Domains, Add** and follow its instructions at the domain seller. Then set `APP_URL` to the new address, add it to Firebase **Authorized domains**, update the Paystack webhook, and Redeploy.
6. **Emails.** Firebase's default password emails come from a Google address and may go to spam. In Firebase **Authentication, then Templates**, set the sender name and your support address. Employees can always use the WhatsApp link from the owner's Add person screen instead.
7. **Legal pages and privacy.** Before taking real customers you need terms of service and a privacy policy (South Africa's POPIA applies because you store people's personal information). These pages are not built yet. Have them written by a person qualified for it.
8. **Run the live checks:** `/api/health` (mode must say `live`), then one real small payment on your own card, then refund it from Paystack.

## If something goes wrong
Send me: (1) the step letter and number, (2) a screenshot, (3) any red words from the browser (press F12, click **Console**), (4) the newest lines in Vercel (your project, **Logs**).
Never send: the `.json` key, your `sk_test_` or `sk_live_` key, passwords.
