# EasyRelay Console

Admin and investigation UI for the EasyRelay API: consumers and keys, upstreams,
routes, call search with request/response detail, and per-route metrics.

## Run

```sh
npm install
cp .env.example .env     # only if the API is not on http://127.0.0.1:8120
npm run dev              # http://127.0.0.1:5273
```

Start the API first (`uv run python main.py` in the `easyrelay` repo), then sign in
with an admin account created there (`uv run python -m app.cli create-admin <name>`).

## How it connects

The browser only talks to its own origin. Vite proxies `/admin` and `/calls` to
`EASYRELAY_API`, so the API needs no CORS settings.

In production, serve `dist/` and the API behind one reverse proxy on one HTTPS origin:

```
https://relay.example.com/          → dist/ (static files)
https://relay.example.com/admin/*   → EasyRelay API
https://relay.example.com/calls/*   → EasyRelay API
https://relay.example.com/relay/*   → EasyRelay API
```

## Security

- Sign-in is username + password. The server returns a random session token (stored
  hashed, expires after 12 h, revoked on sign-out). The UI keeps it in `sessionStorage`
  (this tab only, cleared on close) and sends it only as `Authorization: Bearer`.
  A 401 signs you out. Five wrong passwords lock the account for 15 minutes.
- Production builds carry a strict Content-Security-Policy (`'self'` only, no inline
  scripts) and no source maps.
- Recorded bodies and headers are rendered as text, never as HTML.
- Dev and preview servers bind to `127.0.0.1` only.
