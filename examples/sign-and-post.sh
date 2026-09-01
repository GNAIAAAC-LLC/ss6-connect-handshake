#!/usr/bin/env bash
# Sign example sequence payloads and POST them to a Worker you already deployed.
# Usage:
#   export WORKER_URL=https://ss6-connect-handshake.YOUR.workers.dev
#   export HANDSHAKE_HMAC='set-this-locally-never-in-chat'
#   bash examples/sign-and-post.sh
set -euo pipefail

if [[ -z "${WORKER_URL:-}" || -z "${HANDSHAKE_HMAC:-}" ]]; then
  echo "Set WORKER_URL and HANDSHAKE_HMAC in your shell. Do not paste them into chat."
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 - <<'PY' "$ROOT" "$WORKER_URL" "$HANDSHAKE_HMAC"
import hashlib, hmac, json, sys, urllib.request
root, url, secret = sys.argv[1], sys.argv[2].rstrip("/"), sys.argv[3]
pack = json.load(open(f"{root}/examples/sequence-payloads.json"))
for event in pack["events"]:
    raw = json.dumps(event, separators=(",", ":")).encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    req = urllib.request.Request(
        url + "/hook",
        data=raw,
        headers={"content-type": "application/json", "x-ss6-signature": sig},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            print(res.status, res.read().decode())
    except Exception as exc:
        print("ERROR", event.get("module"), exc)
PY
