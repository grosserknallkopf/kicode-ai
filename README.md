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

- Build Command: `npm run build`
- Deploy Command: `npm run deploy`

Damit wird nur noch ein OpenNext-Build verwendet und anschließend das bereits gebaute Artefakt deployed.
