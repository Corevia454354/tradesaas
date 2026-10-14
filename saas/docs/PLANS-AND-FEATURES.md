# Plans, prices and how everything fits together

Standard is priced in **South African rand (ZAR)** and Business in **US dollars (USD)**, both billed through Paystack. For reference, R399 is about US$24 at roughly R16.52 per US$1 (indicative rate, 10 Oct 2026; it moves daily). Paystack must have USD switched on for your account before Business can be billed in dollars. If it cannot, see the ZAR fallback in DEPLOY-SIMPLE step C4. Prices live in one place, `public/shared/plans.js`.

| | Free | Standard | Business |
|---|---|---|---|
| Price per month | R0 | **R399** (about US$24) | **US$149** (about R2,460) |
| People | 1 (owner) | up to 3 | **20 included**, more by arrangement |
| Jobs per month | 5 | unlimited | unlimited |
| Storage | 200 MB | 5 GB | 50 GB |
| Free trial | none | 30 days, automatic at sign-up, no card | 30 days, **owner starts it once**, no card |
| Who it is for | trying it out | one-person or small trade business | a business with staff |
| Team features | none | none | everything below |

**Trials.** Every new business gets 30 days of Standard automatically. Any business can also start **one free 30-day Business trial** from the Billing page ("Try Business free for 30 days"), whether it is on Free or in the middle of the Standard trial. The Business trial has every Business feature and 20 people. When it ends the business drops to Free; nothing is deleted, but the team cannot sign in until the owner subscribes (their records are all still there and come back when the owner pays). A second Business trial is refused. You can also start or extend either trial for a customer in `/admin`.

Subscribing starts the paid month straight away and ends any trial. Switching from Standard to Business starts Business immediately and cancels the old subscription for you. Cancelling keeps the plan until the paid month ends. You (the platform owner) can override any plan for one business in `/admin`: extra people, extra features, contract pricing, white label.

## Standard: running the jobs

Everything one owner needs to quote, do the work, prove it and get paid.

- **Clients:** name, phone, address. Everything else links back to a client.
- **Quotes:** line items, VAT, a validity date, and the client's **signature drawn on your phone**. A signed quote turns into a job in one tap. Send it as a WhatsApp text link, or print / save as PDF.
- **Jobs:** the work itself, with status (scheduled, in progress, done), notes and a client. Free is capped at 5 jobs a month; the server counts them, so the cap cannot be bypassed.
- **Certificates:** a checklist-style compliance certificate with an installer signature. A draft can be edited; once **issued** it is locked and can never be edited or deleted (this is a legal record).
- **Invoices:** created from a job or quote, with your bank details. Sent and paid invoices stay on record. Only drafts can be deleted.
- **Search, print/PDF, CSV export** for your accountant.
- **Settings:** business name, address, VAT number, registration number, bank details, logo link. These print on every document.

How it fits together: a client has quotes; a signed quote becomes a job; a job gets a certificate and an invoice. Because everything points at the client and the job, the job page shows the whole story in one place.

## Business: running the people (everything in Standard, plus)

One rule runs through all of it: **the browser only reads; the server decides.** Every change goes through the server, which checks your plan, your role and where you sit in the hierarchy, and then writes a list of who may see the record. The database refuses to show a record to anyone not on that list. So a clever user cannot see or change what they should not.

- **Hierarchy:** owner, then department heads, then managers, then employees. The owner adds people (they receive a set-password link, and the owner can also send it on WhatsApp). Each person reports to someone above them. Moving a person moves their whole team and updates who sees what. Switching someone off removes their access immediately; their records stay.
- **Tasks:** managers give tasks to themselves or anyone below them, with due date, priority and an optional job. The assignee changes status and comments. Overdue tasks are flagged. Managers see their team's tasks.
- **Work documents:** instructions, policies, safety notices. A manager sends one to their team or to picked people. People tap "I have read and understood", and the sender sees "5/7 read". A sent document cannot be edited, so a confirmation always refers to the same words.
- **Time tracking:** a clock-in timer (capped at 16 hours so a forgotten timer cannot ruin a week), manual entries for forgotten time, and a team hours table for managers.
- **Leave:** annual, sick, family and unpaid leave with working-day counting, balances from the allowances the owner sets, and approval by the person's managers. "Who is off" shows approved leave.
- **Chat:** private chats and named groups. Only members can read a chat, not even the owner.
- **Team calendar:** one shared calendar (month, week and day views) that everyone in the business can see. The owner decides who may add events: whole roles (department heads, managers, employees) and/or named people (Calendar > Who can add events). Events can be a meeting, deadline, training, site visit, closed day, social or other, all-day or timed, and can run up to 31 days. Only the owner or the person who added an event can change or delete it. The calendar can also show jobs, your tasks and approved leave. It needs no extra set-up for existing Business customers.
- **Profile pictures:** everyone adds their own picture (Profile page). The browser shrinks it to a small JPEG and the server checks it; it is stored on the person's member record, so no extra storage set-up is needed.
- **Payroll records:** the owner writes payslips (earnings and deductions, net computed by the server), issues them (locked), and each employee sees only their own under "My pay". It is a record: no PAYE/UIF calculation and no money moves.
- **Job costing:** employees add expenses to jobs; hours are costed at each person's hourly rate, fixed at the time of logging. The owner sees income, costs and profit per job. Hourly rates are visible to the owner only.
- **Team reports:** hours, tasks done, open and overdue tasks and leave days per person, with CSV export.
- **Document library (new):** the business's own files (licences, insurance, tax clearance, contracts, policies, templates, finance). Uploading, who may upload, and who may open each file are all controlled:
  - The owner always sees everything and chooses **who is allowed to add documents**: whole roles (for example all managers) and/or named people.
  - Whoever adds a document chooses **who can open it**: whole roles (department heads, managers, employees) and/or named people. The owner and the uploader always can. The uploader or the owner can change this later, or delete the file.
  - Files go straight to Firebase Storage. Nobody can read a stored file directly; every download goes through the server, which checks the list and hands out a link that works for five minutes.
  - **Expiry dates (the extra feature I chose):** give a document an expiry date and it shows "expires in 12 days" or "expired" in red, and the owner's home screen counts expiring documents. Trades live on licences, insurance and tax clearance, and a lapsed one can cost a contract.
  - File types are limited (PDF, images, Word, Excel, PowerPoint, CSV, text), 15 MB each, and your plan's storage total. You can also save a web link (for example a Google Drive link) instead of a file.
- **Customer support inbox (new):**
  - Each business gets a public page, `https://your-app/support?b=<business id>`, to put on a website, Facebook page or invoice. Customers fill in name, email, phone and message. No account needed.
  - The inquiry appears in the dashboard for the owner and for the **support agents the owner picked**. Nobody else can see it.
  - An agent takes it (or hands it to another agent), reads the conversation, adds **internal notes** the customer never sees, and replies. **Reply with Gmail** opens Gmail's compose window with the customer's address, a subject carrying the reference (for example `Re: Geyser leaking [#0001]`) and the reply text filled in. The agent presses Send in their own Gmail, and the reply is saved on the inquiry so the team can see the history. Status goes to "Waiting for customer"; the agent can close or reopen it.
  - The form has a hidden trap field for bots and a limit of 40 inquiries an hour per business.
  - **Honest limits:** the customer's email reply does not come back into the dashboard by itself, and agents are not emailed when a new inquiry arrives. They see new inquiries on their home screen and under Support. Connecting Gmail properly (two-way) needs a Google OAuth application and is a bigger step for later.

## How it all coordinates (a typical day)

1. A customer fills in the support page. The owner's agent sees it, takes it, and replies by Gmail.
2. The agent books a plumber. The owner makes a **job**, linking the client, and gives the plumber a **task** for it.
3. The plumber clocks in (**time**), buys a part and adds an **expense** to the job, finishes, and ticks the task done.
4. The owner issues the **certificate** and the **invoice**. **Job costing** now shows income, the part, and the plumber's hours at his rate, so the profit is visible.
5. At month end the owner issues **payslips** from the hours; the plumber reads his under My pay. Insurance renews in the **library**; the expiry date moves.
6. The owner's home screen showed all of this: overdue tasks, leave to approve, documents expiring, new inquiries.

## What is deliberately not included yet

Extra-seat billing (done by arrangement), PAYE/UIF calculation, public-holiday awareness in leave, timesheet approval, two-way Gmail, e-signing from a link sent to a client, SMS, white-label display inside the customer app (stored, not yet shown), a terms/privacy page and email verification for customers.
