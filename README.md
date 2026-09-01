# SS6-Connect Cloudflare handshake

Cloudflare-only pack. **B12 off.** Combined hub UI + Worker + gated GitHub dispatch.

This pack does **not** run a live handshake from chat. It does **not** attach `gntv.net`. It does **not** auto-deploy to production.

Repo: https://github.com/GNAIAAAC-LLC/ss6-connect-handshake

## Four production gates (enforced in code)

1. Webhook cannot supply executable commands (`command` / tokens / secrets rejected).
2. Allowed actions only: `ingest_evidence`, `request_candidate`.
3. Worker never pushes to `main`.
4. `request_candidate` may fire `repository_dispatch` only. Human approval + tests before any promote.

## Modules 1–4

See `SEQUENCE.md`. Simultaneous execution means four evidence events, not four production mutations.

## Local files

- `public/index.html` — SS6-Connect + ROOT_OCEAN + GNAI TV board
- `src/worker.js` — `/health`, `/handshake`, `/sequence`, `/evidence`, `POST /hook`
- `wrangler.toml` — Worker name
- `.github/workflows/candidate.yml` — candidate branch + PR, no main merge
- `examples/sequence-payloads.json` — unsigned module payloads
- `examples/sign-and-post.sh` — local signer (secret stays in your shell)

## Deploy (you run this in your terminal)

```bash
cd ss6-connect-handshake
npx wrangler login
npx wrangler kv:namespace create SS6_EVIDENCE
# paste id into wrangler.toml
npx wrangler secret put HANDSHAKE_HMAC
# optional, repo-scoped token only:
# npx wrangler secret put GITHUB_DISPATCH_TOKEN
# npx wrangler secret put GITHUB_REPO
npx wrangler deploy
npx wrangler pages deploy public --project-name ss6-connect-hub
```

Set Worker var `GITHUB_REPO=GNAIAAAC-LLC/ss6-connect-handshake` after deploy if you want dispatch.

Do not paste tokens here.

## Domains

- Hub: Cloudflare Pages or Workers on a name **you control** (`hub.ssgpt6.com` after origin fix).
- Channel: **GNAI TV** at `tv.ssgpt6.com`.
- `gntv.net` is already a live Good News TV property. Out of scope.
