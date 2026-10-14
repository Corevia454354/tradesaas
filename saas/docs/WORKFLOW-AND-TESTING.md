# What a person does after sign-up, and a complete test run

## Branding
The platform is branded **Tradeline** (a working name: a teal rounded-square logo with a white "T" and an amber dot). **Check the name is free to use** (company and trademark search, and the domain) before you launch. To rename or recolour, edit one file, `public/brand.js` (on GitHub with the pencil): `name`, `tagline`, `color`, `accent`. These follow automatically: the sign-in page (logo, name, tagline), the top bar mark, the browser tab title, the public support page ("Powered by ..."), the admin panel, and "Sent with ..." on documents of businesses without white label.
The icons are files in `public/`: `favicon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, plus `manifest.webmanifest` (name and colour). If you change the logo, replace those files too (send me the new logo and I will regenerate them). With the manifest, a phone can **Add to Home screen** and the app opens like an app with your icon.
Each customer business can also have its own display name, colour and logo link (you set these in `/admin`, Branding); businesses with white label hide the "Tradeline" mark.

## Workflow after sign-up

### The owner (first day)
1. **Create account** (email + password), then **Set up your business** (name). They land on Home on the **Standard trial**: 30 days, no card, a banner shows the days left.
2. **Settings:** business name, phone, address, VAT number, installer registration number, bank details, logo link. These print on every document.
3. **Clients:** add the first client.
4. **Quote:** add line items, VAT, have the client sign with a finger, send the link by WhatsApp or print / save as PDF.
5. **Job:** the signed quote becomes a job; update its status as work progresses.
6. **Certificate:** fill in the checklist, sign, **Issue** (locked forever after).
7. **Invoice:** from the job; mark sent, then paid. CSV export for the accountant.
8. **Plan page:** subscribe to Standard (R399) or **try Business free for 30 days** (one time, no card), or subscribe to Business (US$149).

### The owner (after choosing Business or the Business trial)
1. **Team, + Add person:** department heads, managers, employees (up to 20). Send each person's set-password link by WhatsApp.
2. **Support, Settings:** copy the public contact link (put it on your website or Facebook page) and choose who answers customers.
3. **Library, Who is allowed to add documents:** choose roles or people. Add the insurance, licence and tax documents with expiry dates.
4. **Documents:** send safety rules or policies to the team; they confirm they have read them.
5. **Leave allowances** (Leave page), then each day: tasks, time, leave approvals, chat, and Home shows what needs attention.
6. **Month end:** Payroll records and Reports; Costing shows profit per job.

### An employee
1. Opens the link from the owner, sets a password, signs in at the same address.
2. Home shows their tasks, documents to read, leave days left and a clock-in button.
3. Daily: **Time** (start/stop the timer), **Tasks** (set in progress, comment, done), **Documents** (confirm read), **Library** (open what was shared with them), **Jobs** (update status, add expenses), **Leave** (request), **Chat**, **My pay** (their own payslips only).

### A support agent (an employee or manager the owner chose)
Gets a **Support** tab. Takes an inquiry, replies with Gmail (opens a pre-filled compose window), adds internal notes, closes it.

### A customer of the business
Opens the business's support link, fills in the form, receives a reference number, and the business replies by email. The customer never signs in.

## Complete test run (about 90 minutes)
Do the deployment (DEPLOY-SIMPLE.md) first. Use **test mode** everywhere. Use real inboxes you can open: your own address plus three "plus" aliases, for example `you+owner@gmail.com`, `you+mia@gmail.com`, `you+eli@gmail.com`. Use a private window per person.

**A. Health (3 min).** Open `/api/health`: `ok` is true, `paystackMode` is `test`, `adminEmailsSet` and `storageBucketSet` are true.

**B. Branding (3 min).** The sign-in page shows the Tradeline logo, name and tagline; the browser tab says Tradeline with the icon; on a phone, **Add to Home screen** shows the icon. (To rename, edit `public/brand.js` and the icon files.)

**C. Owner sign-up and trial (5 min).** Create the owner account, set up the business. Home says Standard, banner "Free trial of Standard: 30 days left".

**D. Standard flow (20 min).** Follow `docs/TESTING.md` Part 4: settings, client, signed quote, job, certificate (issue and confirm it is locked), invoice, search, print/PDF, CSV.

**E. Business trial (10 min).** `docs/TESTING.md` Test 4.0b: press **Try Business free for 30 days**. Check the Business menu, the banner, that the button disappears, and (by editing `trial.endsAt` in Firestore to a past time and reloading) that it falls back to Free.

**F. Pay (10 min).** `docs/TESTING.md` Part 7: pay with the Paystack test card for Standard, then switch to Business (US$149). Check the old subscription is disabled in Paystack and the plan shows Business.

**G. Team (20 min).** `docs/TESTING.md` Part 12: add Mia (manager) and Eli (employee) and open Eli's link in a private window. Run tasks, documents, time, leave, chat, payroll, costing, and the "who can see what" checks.

**H. Library and support (15 min).** `docs/TESTING.md` Part 13: upload, share, expiry, uploader permissions, Storage rules in the Rules playground, the public support form, Gmail reply.

**I. Admin (10 min).** `docs/DEPLOY-SIMPLE.md` section G, then `/admin`: find the business, change a plan, start a Business trial for a customer, suspend and restore, see the audit log.

**J. Phone (5 min).** Open the app on a real phone: add the page to the home screen, draw a signature, send a WhatsApp link.

Write each result in the pass/fail record at the end of `docs/TESTING.md`. Anything that fails: send me the test letter and number, a screenshot, and any red words from the browser console (F12).
