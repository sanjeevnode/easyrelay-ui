# EasyRelay Console

Admin and investigation UI for the EasyRelay API: consumers and keys, upstreams,
routes, call search with request/response detail, and per-route metrics.

## Run

```sh
npm install
cp .env.example .env     # only if the API is not on http://127.0.0.1:8120
npm run dev              # http://127.0.0.1:5173
```

Start the API first (`uv run python main.py` in the `easyrelay` repo), then sign in
with the API's `ADMIN_KEY`.

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

- The admin key is kept in `sessionStorage` (this tab only, cleared on close), sent
  only as the `X-Admin-Key` header, never in URLs or cookies. A 401 signs you out.
- Production builds carry a strict Content-Security-Policy (`'self'` only, no inline
  scripts) and no source maps.
- Recorded bodies and headers are rendered as text, never as HTML.
- Dev and preview servers bind to `127.0.0.1` only.
