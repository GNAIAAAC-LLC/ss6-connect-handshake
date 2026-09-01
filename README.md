# SS6-Connect Cloudflare handshake

Cloudflare-only pack. **B12 off.** Combined hub UI + Worker + gated GitHub dispatch.

This pack does **not** run a live handshake from chat. It does **not** attach `gntv.net`. It does **not** auto-deploy to production.

## Four production gates

1. Webhook cannot supply executable commands (`command` / `commands` rejected).
2. Allowed actions only: `ingest_evidence`, `request_candidate`.
3. Worker never pushes to production `ssgpt6.com`.
4. `request_candidate` may fire `repository_dispatch` only. Human approval required.

## Deploy

```bash
npx wrangler login
npx wrangler kv:namespace create SS6_EVIDENCE
npx wrangler secret put HANDSHAKE_HMAC
npx wrangler deploy
npx wrangler pages deploy public --project-name ss6-connect-hub
```

Do not paste tokens into chat.
