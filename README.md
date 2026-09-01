# MedConsult — Online Multi-Doctor Consultation System

A telemedicine web application with three roles — **Patient**, **Doctor** and
**Administrator** — covering doctor discovery, appointment booking, video
consultation, digital prescriptions, health records, an emergency SOS module,
an AI symptom checker, and a five-language interface.

---

# Getting it running

**Follow the seven steps below in order.** About 10 minutes end to end, most of
it spent waiting for `npm install`.

## What you need installed first

| Software | Version | Where to get it |
|---|---|---|
| **Node.js** | 20 or newer | <https://nodejs.org> — download the **LTS** installer |
| **MongoDB Community Server** | 6 or newer | <https://www.mongodb.com/try/download/community> |

Confirm both are present before going further:

```bash
node --version
```

```bash
mongod --version
```

`node --version` must print `v20` or higher. If either command reports
"command not found" or "is not recognized", that program is not installed
correctly — reinstall it before continuing.

Nothing else is needed. No Python, no C++ build tools, no Docker, and no paid
accounts of any kind.

---

## Step 1 — Install the dependencies

The project has two halves, `server` and `client`. **Each needs its own
install.** From the unzipped project folder:

```bash
cd server
npm install
```

```bash
cd client
npm install
```

Each takes one to three minutes. Warnings during install are normal; errors
are not.

> **Why isn't this already in the zip?** The installed dependencies
> (`node_modules`) run to several hundred megabytes and are meant to be
> regenerated on each machine. `npm install` reads the exact versions from
> `package-lock.json`, so you get the identical set the project was built
> against.

---

## Step 2 — Create the two configuration files

The project ships with `.env.example` templates. Real `.env` files are **not**
included, because they hold private keys. Create your own copies:

**Windows (Command Prompt):**

```bash
copy server\.env.example server\.env
```

```bash
copy client\.env.example client\.env
```

**macOS / Linux:**

```bash
cp server/.env.example server/.env
```

```bash
cp client/.env.example client/.env
```

`client/.env` needs no changes at all. `server/.env` needs one edit, in the
next step.

---

## Step 3 — Set your security key

Generate a random value:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Open `server/.env` in any text editor, find the `JWT_SECRET=` line, and
replace the placeholder with the long string that just printed:

```
JWT_SECRET=paste-the-generated-string-here
```

This key signs login sessions. Any long random value works — it simply must
not be left as the placeholder.

Leave everything else in the file alone. `MONGO_URI` is already set for a
standard local MongoDB, and every other setting (email, AI, video, file
storage) is **optional** — the application runs fully without them and simply
switches those features off. See [Optional integrations](#optional-integrations).

---

## Step 4 — Make sure MongoDB is actually running

Installing MongoDB is not the same as starting it. This is the single most
common reason the application fails to launch.

**Windows** — MongoDB usually installs as a service that starts automatically.
Verify it: press `Win + R`, type `services.msc`, press Enter, and find
**MongoDB Server** in the list. Its status must read *Running*. If it does not,
right-click it and choose **Start**.

**macOS** (installed via Homebrew):

```bash
brew services start mongodb-community
```

**Linux:**

```bash
sudo systemctl start mongod
```

---

## Step 5 — Load the demo data

A brand-new database is completely empty — no doctors, no specialities, no
administrator account — so nobody can log in and every screen is blank. This
step fills it:

```bash
cd server
npm run seed
```

It creates one administrator, eight specialities, six doctors, three patients,
appointments in every status, and a sample prescription, then prints every
login to the console.

> ⚠️ **Run this once, during setup.** `npm run seed` **erases the database**
> before rebuilding it. Once the system is in real use, running it again would
> delete real patient and doctor accounts. As a safeguard the script refuses to
> run if it detects any account it did not create itself.

---

## Step 6 — Start the two servers

These are two separate programs. **Both must run at the same time, in two
separate terminal windows,** and both must stay open while the application is
in use.

**Terminal 1 — the API server:**

```bash
cd server
npm run dev
```

Wait for `[server] Listening on http://localhost:5000`.

**Terminal 2 — the web application:**

```bash
cd client
npm run dev
```

Wait for `Local: http://localhost:5173`.

---

## Step 7 — Open it

Go to **<http://localhost:5173>** in Chrome or Edge.

To stop the application, press `Ctrl + C` in each terminal.

---

# Logging in

Every account below is created by `npm run seed`.

| Role | Email | Password |
|---|---|---|
| **Administrator** | `admin@medconsult.local` | `Admin@12345` |
| Doctor — General Physician | `anitha.raman@medconsult.local` | `Password@123` |
| Doctor — Cardiology | `vikram.iyer@medconsult.local` | `Password@123` |
| Doctor — Dermatology | `meera.nair@medconsult.local` | `Password@123` |
| Doctor — Pediatrics (overnight hours) | `sanjay.reddy@medconsult.local` | `Password@123` |
| Doctor — Psychiatry | `priya.deshmukh@medconsult.local` | `Password@123` |
| Doctor — **awaiting verification** | `rahul.menon@medconsult.local` | `Password@123` |
| Patient | `karthik@example.com` | `Password@123` |
| Patient | `fathima@example.com` | `Password@123` |
| Patient | `ravi@example.com` | `Password@123` |

Two accounts are deliberately arranged for demonstration: **Dr. Rahul Menon**
is left unverified so the administrator's approval queue is never empty, and
**Dr. Sanjay Reddy** publishes 22:00–02:00 availability, which makes the
around-the-clock booking claim visible rather than theoretical.

---

# A five-minute tour

Worth walking through in this order the first time:

1. **As a patient** (`karthik@example.com`) — open **Symptom Checker**,
   describe something ordinary such as a persistent cough, and see the
   suggested speciality and urgency. Follow the **Book this specialist**
   button straight into doctor search, pick a slot, and confirm.
2. **As that doctor** — sign in, find the pending request, and accept it. The
   patient receives a live notification.
3. **Back as the patient** — open the appointment and join the video call. Use
   two different browsers (not two tabs) to see both sides at once.
4. **As the doctor** — issue a prescription during the call. It is generated
   as a PDF and appears in the patient's history.
5. **As the administrator** (`admin@medconsult.local`) — open the verification
   queue and approve Dr. Rahul Menon.
6. **Switch language** — use the selector in the header. Tamil, Hindi, Telugu
   and Malayalam are fully translated, including the AI symptom checker's
   answers.
7. **As a patient** — open **Emergency** to see the ambulance number, nearby
   hospitals ordered by distance, and the emergency-contact alert.

---

# Troubleshooting

| What you see | What it means | Fix |
|---|---|---|
| `MongooseServerSelectionError` or `ECONNREFUSED 127.0.0.1:27017` | MongoDB is not running | Go back to **Step 4** |
| `Missing required environment variables` | `server/.env` was never created | Go back to **Step 2** |
| `EADDRINUSE: address already in use :::5000` | Another program holds port 5000, or an old copy is still running | Close the other program, or change `PORT` in `server/.env` |
| Login says "Invalid email or password" | The demo data was never loaded | Go back to **Step 5** |
| The page loads but is empty, doctor search shows nothing | The API server is not running | Check Terminal 1 from **Step 6** |
| `npm install` fails with syntax errors | Node.js is older than version 20 | Reinstall Node.js LTS |
| Camera or microphone does not work | Browsers only allow these on `localhost` or over `https` | Use `http://localhost:5173`, not the machine's IP address |

Still stuck? Confirm the API is alive:

```bash
curl http://localhost:5000/api/health
```

A healthy system replies with `"status":"ok"` and `"database":"connected"`.

---

# Technical reference

Everything below is for developers maintaining or extending the system.

## Optional integrations

The server reads which integrations are configured at boot and exposes the
result at `GET /api/config`. Anything not configured is skipped rather than
crashing, so the project always runs.

| Feature | Env vars | Without it |
|---|---|---|
| Video (Agora) | `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` | Falls back to a `meet.jit.si` iframe, which needs no keys |
| File storage | `CLOUDINARY_*` | Uploads fall back to local disk (development only) |
| Email | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Emails are logged to the console instead of sent |
| AI symptom checker | `GEMINI_API_KEY` | The built-in rule engine answers instead |
| WhatsApp alerts | `WHATSAPP_PROVIDER`, `META_WHATSAPP_*` | SOS still emails, and still offers a one-tap WhatsApp link |

Where to get each free key is documented inline in `server/.env.example`.

---

## WhatsApp alerts

An SOS notifies the emergency contact by email **and** WhatsApp. WhatsApp is
the harder half, because the platform's rules work against exactly this use
case, so the design is worth explaining.

### Why the obvious route fails

WhatsApp only allows a business to send **free-form** text within 24 hours of
the recipient messaging it. An emergency alert is *business-initiated* by
definition — the contact will not have messaged the service that morning — so
it must be a **pre-approved template**. That is a policy, not a quota, and no
amount of free credit gets around it.

That policy is what killed the Twilio route on a free account. Both failures
were reproduced directly, and `npm run whatsapp:probe-twilio` re-checks them:

| Attempt | Real error | Meaning |
|---|---|---|
| Any sender, trial account | `572002` | A trial refuses any destination that is not a verified caller id. |
| Newer "Tryout" sender | `21654` | Demands a `ContentSid` template per message; template creation needs the Content API, which trials cannot use. |

So the Twilio path needs a funded account. It is kept in the code and works
unchanged once one exists.

### What works: Meta's WhatsApp Cloud API

Meta's own API is free, needs no credit card, and — the part that matters —
**template creation is free**, which is precisely what Twilio's trial refuses.
A test business number reaches up to five recipients you verify by hand, which
is the right shape for a project demo.

1. Create an app at [developers.facebook.com](https://developers.facebook.com)
   → **Create App** → **Business** → add the **WhatsApp** product.
2. On **WhatsApp → API Setup**, copy the **Phone number ID** into
   `META_WHATSAPP_PHONE_NUMBER_ID`, and the temporary token into
   `META_WHATSAPP_TOKEN`.
3. On the same page, add each recipient under **To** and verify the code that
   arrives on their handset. Up to five numbers.
4. On **WhatsApp → Message templates**, create a **Utility** template. Give it
   a body with exactly four placeholders, in this order:

   ```
   Emergency alert from {{1}}.
   Time: {{2}}
   Live location: {{3}}
   Note: {{4}}
   ```

   Put its name in `META_WHATSAPP_TEMPLATE`. Utility templates are usually
   approved within minutes.
5. Set `WHATSAPP_PROVIDER=meta` and verify with a real send:

   ```bash
   npm run whatsapp:meta -- 919894705498
   ```

The dashboard token expires in about 24 hours. For one that does not, create a
**System User** in Business Settings with `whatsapp_business_messaging` and
`whatsapp_business_management`, and generate a token from it.

### The fallback that cannot break

Every automated route depends on credentials, tokens that expire, approvals and
someone else's uptime. During an actual emergency none of that is an acceptable
point of failure, so the SOS screen **always** offers a `wa.me` deep link with
the alert and live location already filled in, whenever the contact has a
WhatsApp number saved and the automated send did not go out.

It needs no account, no API and no opt-in — it is a URL. The trade-off is
stated plainly in the UI: the patient taps send, so it is a handoff rather than
an automatic alert. In exchange the contact receives it **from the patient's
own number**, which for an emergency contact is arguably better than an
unknown business sender they may ignore.

`sendWhatsApp()` remains one function with three providers behind it and a
single call site, so switching provider is an env change, not a code change.

---

## Project structure

```
medconsult/
├── client/                     React + Vite frontend
│   └── src/
│       ├── api/                One module per API resource (axios)
│       ├── components/         Shared UI, route guards, layout
│       ├── context/            AuthContext — the only global client state
│       ├── hooks/
│       ├── lib/                i18n, TanStack Query client + cache keys
│       ├── locales/            en / ta / hi / te / ml translation files
│       └── pages/              auth, patient, doctor, admin, consult
└── server/                     Express API
    └── src/
        ├── config/             env validation, database connection
        ├── controllers/
        ├── middleware/         auth guards, zod validation, rate limits
        ├── models/             Mongoose schemas
        ├── routes/
        ├── seed/               demo data generator
        ├── services/           email, storage, PDF, Gemini, Agora, maps
        ├── sockets/            Socket.io setup and events
        └── utils/
```

---

## Tests

The API ships with smoke suites covering the parts most worth proving:

```bash
cd server && npm test
```

The server must be running, started with `DISABLE_RATE_LIMITS=true` — the
suites log in far more often than a real user and would otherwise trip the
auth limiter. The limiter is covered by its own suite, which expects the
limits to be **active**:

```bash
cd server && npm run test:ratelimit
```

| Suite | Covers |
|---|---|
| `smoke-slots` | Slot generation as pure functions — timezones, overnight windows, lead time, blocked dates. No server or database needed. |
| `smoke-index` | The double-booking guarantee, including a genuinely concurrent race. |
| `smoke-auth` | Registration, login, tokens, validation, user enumeration. |
| `smoke-phase2` | Doctor discovery and filtering, the verification lifecycle, user management, settings. |
| `smoke-phase3` | Availability editing, slot listing, and every appointment state transition. |
| `smoke-phase45` | Notification scoping, live socket chat delivery, and every guard on the video token endpoint. |
| `smoke-phase6` | Upload validation by file signature, who may read a patient's records, expiring links, and the prescription lifecycle. |
| `smoke-pdf` | Reads the text back out of a generated PDF to confirm what it actually says, and that it paginates without losing content. |
| `smoke-phase78` | Every email template (including HTML-escaping of user input), the reminder sweep's idempotency, and the whole SOS flow. |
| `smoke-phase9` | Red-flag detection across many natural phrasings, the urgency floor, specialty routing, and hardening against a surprising model reply. |
| `smoke-whatsapp` | Provider-specific readiness rules (Meta vs. Twilio vs. CallMeBot vs. off), that a failure always explains itself, and that the one-tap `wa.me` fallback is offered with the location pre-filled whatever the provider did. |

The client has its own check for translation completeness:

```bash
cd client && npm run test:i18n
```

| Check | Covers |
|---|---|
| `test:i18n` | Every non-English locale has exactly the same keys as English (nothing missing, nothing stale), every `{{placeholder}}` survives translation, plural pairs (`_one`/`_other`) are complete, and no string was silently left untranslated. |

`tests/make-live-appointment.mjs` creates a consultation that is joinable
immediately, for walking through the video room by hand:

```bash
cd server && node tests/make-live-appointment.mjs
```

`tests/export-sample-prescription.mjs` writes the latest prescription to a PDF
on disk, for checking the layout by eye:

```bash
cd server && node tests/export-sample-prescription.mjs sample.pdf
```

The suites are idempotent — they create and clean up their own throwaway
records, so they can be run repeatedly against the same seeded database.

---

## Notable design decisions

**Translation completeness is enforced by a script, not by eye.** With five
languages and 500+ keys, a missing or renamed key is easy to miss by reading —
i18next silently falls back to English rather than erroring, so a gap can sit
unnoticed. `client/tests/check-i18n.mjs` diffs every locale's key set against
English, checks every `{{placeholder}}` survived translation, verifies plural
pairs are complete, and flags any string that was left identical to English
(which usually means forgotten, not intentional). All five files were verified
this way, not just spot-checked.

**`<html lang>` is set on the first paint, not only on every subsequent
switch.** i18next resolves the saved language and fires its own
`languageChanged` event during `init()`, before application code has a chance
to attach a listener to it — so a naive `i18n.on('languageChanged', ...)`
handler catches every language change a user makes by clicking the switcher,
but misses the very first one when a returning visitor's saved language loads
on a fresh page. Confirmed by reloading directly into a saved Malayalam
session and reading `document.documentElement.lang` afterward, which is what
screen readers actually rely on to choose a pronunciation.

**Double-booking is prevented by the database, not by application code.**
`Appointment` carries a unique *partial* index on `(doctor, startsAt)` limited
to pending and accepted statuses. Two patients submitting the same slot at the
same instant cannot both succeed regardless of how the requests interleave —
the loser receives a duplicate-key error which the controller translates into
HTTP 409. Rejected and cancelled appointments are excluded from the index, so
a freed slot becomes immediately bookable again. A read-then-write check in
JavaScript would leave a race window here; this does not.

**All appointment times are stored in UTC.** Availability rules store
minutes-since-midnight plus an IANA timezone, and concrete slots are generated
per requested date. The browser renders everything in the viewer's local time.

**Unverified doctors are invisible, not merely hidden.** The search
aggregation filters on `verificationStatus: 'approved'` at the database level,
and fetching an unverified doctor by direct URL returns 404. A doctor who
changes their registration number is automatically returned to the pending
state, because the administrator verified a specific credential.

**The video room is guarded four ways, and all four matter.** Before any
credential is minted, `GET /api/video/token/:id` checks that the appointment
exists, that the caller is one of its two participants, that it is actually
confirmed, and that the current time falls inside the join window (from 10
minutes before the start to 30 minutes after the end). Drop the last two and
a cancelled appointment, or one three weeks away, would still hand out a
working key to a video room. Agora tokens are always built server-side, so
the App Certificate never reaches the browser, and each token is scoped to a
single channel and expires within the hour.

**Video degrades instead of breaking.** The server decides the provider and
the client renders whatever it is told. With Agora keys configured it returns
an Agora token; without them it returns a namespaced `meet.jit.si` room,
which needs no account, no key and has no quota. Setting `VIDEO_PROVIDER=jitsi`
forces the fallback deliberately — useful if Agora's free minutes run out
during a live demonstration.

**Medical files are never on a guessable URL.** Uploads go to Cloudinary as
`authenticated` assets under a 48-hex-character random public id, which means
they cannot be fetched at all without a signature — not even by someone
holding the exact id. Every view mints a fresh five-minute signed URL, and
only after the caller's permission has been re-checked. Without Cloudinary
configured the same model runs against local disk, using an HMAC-signed
expiring token that this API validates, so development is not a weaker
security story than production.

**Upload types are checked by file signature, not by what the client claims.**
The `Content-Type` header and the filename extension are both just strings the
uploader chose. The first bytes of the file are compared against the known
magic numbers for PDF, JPEG and PNG, so an executable renamed `report.pdf`
with a matching Content-Type is rejected.

**Access to records is a relationship, re-checked every request.** A patient
always sees their own. A doctor sees them only while they hold a confirmed or
completed appointment with that patient — access is never granted once and
remembered. Administrators are deliberately excluded: they manage accounts,
not clinical records, and the platform's operator has no reason to read a
patient's scans.

**The prescription record is the source of truth; the PDF is a rendering of
it.** Generation happens server-side so what a patient downloads next year is
byte-for-byte what the doctor issued, rather than a re-render that drifts as
the UI changes. If generation or upload fails at issue time the prescription
still stands, and the download route rebuilds the file on demand.

**Email never claims a delivery that did not happen.** Without SMTP
credentials the mail service runs in preview mode: messages are fully
rendered and kept in an in-memory outbox, and every caller is told the message
was *not* sent along with the reason. The SOS screen therefore says "the email
could not be sent: email is in preview mode" rather than showing a green tick
to a patient in an emergency. In development the rendered messages are
readable at `GET /api/dev/outbox` — a route mounted only when preview mode is
on **and** `NODE_ENV` is not production, because rendered emails contain
patient names and appointment details.

**The reminder sweep claims each appointment before sending.** `reminderSentAt`
is written as part of the same filtered update that selects the appointment,
so a slow sweep overlapping the next one cannot send the same reminder twice.
It runs on a plain interval rather than a cron dependency, because the sweep is
idempotent and the exact minute does not matter.

**An emergency is recorded before anything is notified.** The SOS event is
saved first, so a press is never lost because a mail server was unreachable.
Both channels are then attempted independently, and the outcome of each is
written back onto the event and returned to the screen — the patient is told
whether their contact was actually reached instead of being left to assume it.
Location is optional throughout: refusing it degrades to an alert without
coordinates rather than blocking the alert.

**Hospital lookup runs in the browser, not through the API.** A free-tier
backend that has gone to sleep would otherwise add a 30-second cold start to
the one screen where waiting matters most. Two public Overpass instances are
tried in turn, with an 8-second timeout, a 10-minute session cache, and a
bundled list of major hospitals if both fail — the screen never sits empty.

**The symptom checker's red-flag rules set a floor the model cannot lower.**
Rules run *before* Gemini and produce a minimum urgency; the final answer is
the higher of the two. So a model that is having an off day, has been
rate-limited into a fallback, or has been talked into reassurance cannot tell
someone describing crushing chest pain that they have indigestion. The
emergency instructions shown on screen come from the rule table verbatim and
are never paraphrased by the model.

The model's reply is also treated as untrusted: an unknown specialty, an
invalid urgency, a non-array field or a 5,000-character answer are all
corrected before anything reaches the database.

Two honest limitations, both surfaced in the UI rather than hidden. The
red-flag patterns are English-only, so a non-English description shows a
warning that emergency keyword coverage is weaker. And the emergency route
stays visible on the page at all times, before and after any result, so a
missed match never leaves someone without a way to get help.

**Role guards exist on both sides, but only the server's count.** The
client's `RoleRoute` is a convenience that avoids showing a page the user
cannot use; every protected endpoint is independently guarded by `protect` and
`requireRole`.

**Rate limits cannot be disabled in production.** `DISABLE_RATE_LIMITS` exists
for the test scripts, and is ignored entirely whenever `NODE_ENV=production`.

---

## Limitations

These are honest consequences of building this for zero cost, and should be
stated in the project report.

1. **Not regulated healthcare software.** "Secure" here means hashed
   passwords, JWT auth, role guards, signed time-limited file URLs and HTTPS
   via the host — good engineering practice, not HIPAA or DPDP compliance.
2. **Prescriptions are demonstration PDFs**, not legally valid
   e-prescriptions. There is no doctor digital signature or regulatory
   registry integration.
3. **The AI symptom checker is a triage aid, not a diagnosis.** A hard-coded
   red-flag rule layer runs *before* the language model and cannot be
   overridden by it, so emergency symptoms are never downgraded. Its red-flag
   patterns are English-only; a description in another language is assessed by
   the model alone and the screen says so.
4. **No real SMS.** Emergency alerts go out by email and WhatsApp. There is no
   free SMS route at all, so the feature is presented as a *notification
   channel* rather than as SMS. WhatsApp itself now works — see
   [WhatsApp alerts](#whatsapp-alerts) below for how, and why the obvious
   route does not.
5. **Hospital data comes from OpenStreetMap**, which is less complete than
   Google Places in some areas — the deliberate trade-off for needing no
   billing card.
6. **Free tiers have ceilings.** Agora gives 10,000 participant-minutes a
   month, Gemini is rate-limited per minute, MongoDB Atlas M0 is a shared
   512 MB cluster, and a free Render instance sleeps after 15 minutes of
   inactivity (30–50 s cold start; mitigated by a keep-alive cron, not
   eliminated).

---

## Deployment

Three free services. Netlify cannot host the whole app on its own: the server
holds open Socket.io WebSocket connections for chat and live notifications,
which a static host and short-lived serverless functions cannot do.

| Piece | Host | Config |
|---|---|---|
| Frontend | Netlify | `netlify.toml` in the repo root sets base `client`, build `npm run build`, publish `dist`, and the SPA fallback redirect. |
| Backend | Render | `render.yaml` in the repo root. Root dir `server`, build `npm ci`, start `npm start`, health check `/api/health`. |
| Database | MongoDB Atlas | Free M0 cluster. Network access must allow `0.0.0.0/0` so Render can reach it. |
| Keep-alive | cron-job.org | Ping `https://<api>/api/health` every 10 min so the free instance does not cold-start mid-demo. |

### Order matters

1. **Atlas first** - create the M0 cluster, a database user, allow `0.0.0.0/0`,
   and copy the `mongodb+srv://` string. Nothing else works without it.
2. **Render next** - deploy from `render.yaml` and fill in the prompted
   secrets. You need the API URL before the frontend can be built.
3. **Netlify last** - set `VITE_API_URL` to `https://<your-api>.onrender.com/api`
   **before** the first build. It is compiled into the bundle, so changing it
   later needs a redeploy, not a restart.
4. **Close the loop** - set `CORS_ORIGINS` and `CLIENT_URL` on Render to the
   Netlify origin (no trailing slash), then redeploy the API. Until you do,
   every browser request is blocked by CORS.
5. **Seed** - run `npm run seed` once against the Atlas database, from your
   machine with `MONGO_URI` pointed at Atlas. Render's free plan has no shell.

### Two things that will bite you

- **Render free tier sleeps** after 15 minutes idle and takes 30-50s to wake.
  The keep-alive cron mitigates this but does not eliminate it. Wake the API
  before a live demo.
- **Uploads on Render are ephemeral.** Without Cloudinary configured, files go
  to local disk and are wiped on every redeploy. Configure `CLOUDINARY_*` for
  anything beyond a demo.

One env var drives both transports on the client: `client/src/lib/socket.js`
derives the WebSocket origin from `VITE_API_URL` by stripping the `/api`
suffix, so REST and Socket.io always agree.
