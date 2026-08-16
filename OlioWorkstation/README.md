# Olio Workstation

The Olio Workstation web application is built with Vite, React, TypeScript, Tailwind CSS,
Supabase, and Vercel serverless functions.

Quick Pastes is a private, authenticated utility for reusable personal text. It uses the
dedicated `quick_pastes` table and never creates share URLs, public records, expiry
settings, or view counts. Pastebin remains a separate sharing utility backed by `pastes`.

Secure Launcher Connection lets an authenticated user approve a named Windows launcher
without entering an Olio password into AutoHotkey. Profile Settings lists safe device
metadata and provides confirmed per-device revocation. Milestone 6 adds a separately
reviewed `quick-pastes:read` scope for newly approved devices and read-only, owner-bound
synchronization through the existing `/api/launcher` function. Existing devices are not
silently upgraded.

Google Calendar integration uses the same `/api/launcher` boundary. Workstation owns the
read-only Google OAuth grant and stores the refresh token with AES-256-GCM encryption;
the launcher receives only bounded event fields for the remainder of the local day. Apply
`supabase/migrations/20260815090000_add_launcher_google_calendar.sql` and configure these
server-only variables in Vercel:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI` (for example, `https://olio.one/api/launcher?oauth=google-calendar`)
- `GOOGLE_OAUTH_STATE_SECRET`
- `CALENDAR_TOKEN_ENCRYPTION_KEY` (32 random bytes encoded as 64 hex characters or base64)

Enable the Google Calendar API and register the exact redirect URI in the Google Cloud
OAuth client. None of these values may use the `VITE_` prefix.

## Commands

The Vercel Hobby deployment is intentionally limited to 12 production files under
`api/`. Shared server helpers belong under `api/_utils`, and the automated function-budget
test prevents an accidental thirteenth function. Admin help CRUD uses the consolidated
`/api/admin/help-articles` route.

```powershell
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
npm run test:quick-pastes
npm run test:launcher-connection
npm run test:launcher-quick-pastes
npm test
```

The Vercel project Root Directory should be configured as `OlioWorkstation`.

Client configuration requires `VITE_SUPABASE_URL` and the public Supabase anon key in
`VITE_SUPABASE_ANON_KEY`. Never place `SUPABASE_SERVICE_ROLE_KEY` in a `VITE_` variable
or client bundle. See [setup.md](docs/setup.md), [security.md](docs/security.md), and
[milestone4-results.md](docs/milestone4-results.md) for local database validation,
privacy boundaries, and the Quick Pastes manual checklist. Secure Launcher Connection
evidence and limitations are in [milestone5-results.md](docs/milestone5-results.md).
Launcher Quick Paste authorization and validation evidence is in
[the Milestone 6 results](../OlioLauncher/docs/milestone6-results.md).
