# SS6 automatic Automation handshake

Cloudflare-only. B12 off. Combined SS6-Connect + ROOT_OCEAN + GNAI TV.

This file is the operational contract for modules 1–4. It is **not** a live fleet controller.

## Pipeline

```
detector / operator
  → HMAC POST /hook
  → KV evidence log
  → optional repository_dispatch
  → candidate/* branch
  → tests
  → pull request
  → human approval
  → signed artifact
  → canary
  → health verify
  → promote or rollback
  → immutable evidence record
```

## Four production gates

1. Webhook cannot supply executable commands.
2. CI cannot push directly to protected `main` as a production promote.
3. Generated patches cannot deploy without passing tests and approval.
4. Failed canary verification rolls back to the last approved artifact.

## Modules (simultaneous evidence, not simultaneous production mutation)

| # | Name | Title | Allowed record | Rejected |
|---|------|-------|----------------|----------|
| 1 | ingress | Live Ingress & Telemetry Streams | node_id, status, ttl_state, numeric metrics | packet dumps, credentials |
| 2 | ledger | Ledger State & Cryptographic Checkpoints | blocks_verified, head_hash, integrity_status | private keys |
| 3 | island | Island-Mode Isolation & Reconnect Simulation | node_id, severed/recovered timestamps, conflict count | remote shell, cutover commands |
| 4 | dashboard | System Administration Dashboard probe | gateway name, rbac profile name, fleet_status | session tokens, passwords |

## Hook contract

```
POST /hook
Header: x-ss6-signature: hex(HMAC-SHA256(raw_body, HANDSHAKE_HMAC))
```

```json
{
  "action": "ingest_evidence",
  "module": "ingress",
  "source": "ops",
  "summary": "edge telemetry snapshot",
  "metrics": { "cpu_load": 14.2, "memory_usage": 32.8, "latency_ms": 4.1 }
}
```

`action` may be `ingest_evidence` or `request_candidate`.
`request_candidate` only fires GitHub `repository_dispatch`.

## What this chat run does not do

- Does not attach or overwrite `gntv.net` (Good News TV).
- Does not deploy Workers or change live DNS from this session.
- Does not treat pasted dashboard session tokens as real credentials.
- Does not start Zoho / ManageEngine / SecNumCloud / B12 work.
