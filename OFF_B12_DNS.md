# Why ssgpt6.com 404s (2026-09-01)

Live probe:

- `ssgpt6.com` and `www.ssgpt6.com` resolve to B12:
  - CNAME: `webproxy-production.b12.io` / `gnaiaaac-llc.b12sites.com`
  - A: `52.22.145.238`
  - Headers: `content-security-policy: frame-ancestors https://*.b12.io` and `via: 1.1 Caddy`
- Body is B12 generic 404.
- `/health` is also 404.

This is not a Worker outage. The apex is still on B12.
`gntv.net` is Good News TV. Do not change it.

## DNS cutover (operator terminal / Cloudflare dashboard)

1. Cloudflare → Add site `ssgpt6.com`.
2. At the registrar, set the two Cloudflare nameservers.
3. Wait until the zone is Active.
4. `npx wrangler pages deploy public --project-name ss6-connect-hub`
5. Attach `ssgpt6.com`, `www.ssgpt6.com`, `hub.ssgpt6.com`, `tv.ssgpt6.com`.
6. `npx wrangler deploy` for the handshake Worker.
7. Confirm `/` returns the hub HTML and `/health` on the Worker returns JSON.
8. Leave B12 published until the new origin is 200.
