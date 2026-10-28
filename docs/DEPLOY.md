# Deploying Cockpit (Vercel + Turso)

Steps for the owner. Nothing here can be done from a cloud coding session: it needs your accounts. Allow about 45 minutes.

## What you will have

- The app on Vercel, the database on Turso (libSQL), login by passkey only.
- A GitHub Actions job calling `/api/cron/tick` every 5 minutes: sync, then the notifications that are due.
- The app installed on your iPhone, with push notifications and a Shortcut for quick capture.

## 1. Create the database (Turso)

```bash
curl -sSfL https://get.tur.so/install.sh | bash   # or: brew install tursodatabase/tap/turso
turso auth login
turso db create cockpit
turso db show cockpit --url          # libsql://cockpit-<you>.turso.io  → DATABASE_URL
turso db tokens create cockpit       # → DATABASE_AUTH_TOKEN
```

Apply the schema and load your own system (pillars, sources) from your machine:

```bash
export DATABASE_URL="libsql://cockpit-<you>.turso.io"
export DATABASE_AUTH_TOKEN="<token>"
npm run db:migrate    # versioned migrations from ./drizzle
npm run db:seed       # reads config/seed.local.json (never committed)
```

`db:push` stays for local development only. After a future schema change: `npm run db:generate`, commit the new file in `drizzle/`, run `npm run db:migrate` against Turso before deploying.

## 2. Generate the secrets

```bash
openssl rand -hex 32     # COCKPIT_SESSION_SECRET
openssl rand -hex 24     # COCKPIT_SETUP_TOKEN (one time)
openssl rand -hex 24     # COCKPIT_CRON_TOKEN
openssl rand -hex 24     # COCKPIT_CAPTURE_TOKEN
npx web-push generate-vapid-keys    # VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
```

## 3. Import the repository on Vercel

1. vercel.com → **Add New… → Project** → import the GitHub repository. Framework: Next.js (detected). Node 22.
2. Add the environment variables below (Production), then deploy. Note the URL, for example `https://cockpit-you.vercel.app`.
3. Set `APP_URL` to that exact URL and redeploy. It is the passkey's relying party: changing the domain later invalidates the passkeys.

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Turso, step 1 |
| `NOTION_TOKEN` | notion.so/profile/integrations: the internal integration (needs read, **update** and **insert** content) |
| `LINEAR_API_KEY` (and any extra `apiKeyEnv` named in your sources) | Linear → Settings → API |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud console: OAuth client, type Web application |
| `APP_URL` | your Vercel URL, no trailing slash |
| `COCKPIT_SESSION_SECRET` | step 2, 32 characters or more. Signs the session cookie |
| `COCKPIT_SETUP_TOKEN` | step 2. Lets you enrol the **first** passkey. Remove it afterwards |
| `COCKPIT_CRON_TOKEN` | step 2. Bearer token for `/api/cron/tick` and `/api/sync` |
| `COCKPIT_CAPTURE_TOKEN` | step 2. Bearer token for `/api/capture` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | step 2 |
| `VAPID_SUBJECT` | `mailto:you@example.com`: who the push services can contact |

Do **not** set `COCKPIT_DEMO` or `COCKPIT_AUTH=off` in production: either one switches authentication off. `VAULT_INBOX_PATH` (ideas) and `VAULT_GOALS_PATH` (the vision and one file per season, written after each edit and from the button in Réglages), `VAULT_REVIEWS_PATH` (one Markdown file per finished review) only make sense on your own machine because they write Markdown files; leave them unset on Vercel and nothing is exported.

Google: in the OAuth client, add `https://<your-app>/api/google/callback` to the authorised redirect URIs. Then open Réglages and press **Connecter** (or **Reconnecter pour autoriser l'écriture** if the button says so).

## 4. Enrol your passkey

1. Open `https://<your-app>/connexion` on your phone (or laptop).
2. Expand **Première installation**, paste `COCKPIT_SETUP_TOKEN`, press **Enregistrer ma passkey** and confirm with Face ID / Touch ID.
3. You are logged in. **Remove `COCKPIT_SETUP_TOKEN` from Vercel and redeploy.** Once a passkey exists the token cannot enrol another one, but a leftover secret is still a secret.
4. Second device: from a logged-in device open Réglages → Sécurité → **Ajouter cet appareil**. The browser's passkey dialog lets you pick another device (scan the QR code with it) or a security key. A passkey synced by iCloud Keychain or Google Password Manager already works on all your devices of that ecosystem, so you may not need this.

Sessions last 30 days and slide forward while you use the app.

## 5. Install on the iPhone

1. Open the app in **Safari** (not an in-app browser), Share → **Sur l'écran d'accueil**.
2. Open Cockpit from the home screen icon. Notifications work only from there (iOS 16.4 or later).
3. Réglages → Notifications → **Activer sur cet appareil**, accept the prompt, then **Envoyer un test**.

## 6. The cron (GitHub Actions)

Repository → Settings → Secrets and variables → Actions → New repository secret:

- `COCKPIT_URL`: `https://<your-app>` without a trailing slash
- `COCKPIT_CRON_TOKEN`: the same value as in Vercel

`.github/workflows/cron.yml` then calls `/api/cron/tick` every 5 minutes. The job fails visibly (red run, email from GitHub) when the call does not return 2xx or a secret is missing. Start it once by hand from the Actions tab (**Run workflow**) to check. GitHub may delay scheduled runs by a few minutes at busy times; the notifications catch up for 30 minutes (15 for the clôture, which stops at 23:00).

What a tick sends: block-end check-in (only while the linked task is still open), the clôture (22:45 by default, opens `/cloture`), screens off (23:00), the morning cap (07:30 weekdays, 09:30 weekends, opens Aujourd'hui); all four times are editable in Réglages → Rituels, and a deadline warning for an Urgent or Haute task due within two days with no block before it, and the weekly review at its day and time (Sunday 19:30 by default, editable in Réglages → La revue; the tick also prepares the draft). Each notification goes out once.

## 7. iOS Shortcut for capture

Shortcuts → New shortcut:

1. **Ask for Input** (Text), prompt "Capturer".
2. **Get Contents of URL**: `https://<your-app>/api/capture`, Method **POST**, Headers `Authorization: Bearer <COCKPIT_CAPTURE_TOKEN>` and `Content-Type: application/json`, Request Body **JSON** with a `text` field set to the *Provided Input*.
3. **Show Result** (optional). Add it to the Home Screen or the Action button.

The text is parsed like the in-app capture: `Rendre le TP vendredi 18h #memoire`, `idée : …`, `rdv : …`.

## Troubleshooting

- **Redirected to /connexion in a loop**: the cookie is `Secure`; use the https URL. Check `COCKPIT_SESSION_SECRET` is set (32 characters or more) and has not changed since you logged in.
- **"Enrôlement refusé"**: the setup token is wrong, or a passkey already exists. After the first enrolment use Réglages → Ajouter cet appareil from a logged-in session.
- **Passkey fails with a domain error**: `APP_URL` does not match the address in the browser. Fix it and redeploy; passkeys made on another domain will not work, enrol again.
- **No notification arrives**: Réglages → Notifications must list the device and "Envoyer un test" must succeed. On iPhone it must be the home-screen app, and Settings → Notifications → Cockpit must be allowed. A device the push service dropped is removed automatically: enable it again.
- **Cron job red**: open the run log. `401` means the two `COCKPIT_CRON_TOKEN` values differ; `Add the COCKPIT_URL…` means a secret is missing.
- **Nothing syncs in production**: the tick calls the connectors with Vercel's environment variables. Réglages shows each source's last error.
- **Google asks to reconnect**: press the button in Réglages; the write permission is needed to move blocks.
- **Local development with real data and no passkey**: set `COCKPIT_AUTH=off` in `.env.local`. Never on Vercel.
