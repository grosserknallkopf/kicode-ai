# KiCode AI

## Auth-Konfiguration

Setze für Login per Benutzername/Passwort diese Variablen:

- `AUTH_USERNAME`
- `AUTH_PASSWORD`

Zusätzlich optional für OAuth:

- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

## Cloudflare Build & Deploy

Für Cloudflare Worker Deploy mit OpenNext:

- Build Command: `npm run build:cloudflare`
- Deploy Command: `npm run deploy:cloudflare`

Damit wird nur noch ein OpenNext-Build verwendet und anschließend das bereits gebaute Artefakt deployed.

## Chat-Speicherung (D1)

Chats werden in der D1-Datenbank `kicode-ai-db` gespeichert (Binding `DB`).

- Migration anwenden: `npx wrangler d1 migrations apply kicode-ai-db --remote`
- Admin-Bereich: `/admin` (standardmäßig ist `AUTH_USERNAME` Admin)
- Weitere Admins: `ADMIN_USERNAMES` bzw. `ADMIN_EMAILS` (kommagetrennt) als Secrets/Variablen setzen

## Benutzerkonten

- Der Login über `AUTH_USERNAME` / `AUTH_PASSWORD` bleibt als Admin-Zugang erhalten.
- Weitere Konten werden im Admin-Bereich unter `/admin` angelegt (Benutzername, Anzeigename, Startpasswort, Rolle).
- Passwörter werden mit PBKDF2-SHA256 gehasht in D1 gespeichert.
- Admins können Passwörter zurücksetzen, Konten sperren/entsperren, die Rolle ändern und Konten löschen.
