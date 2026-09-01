#!/usr/bin/env bash
# Create Cloudflare KV namespaces for ss6-connect-handshake and print wrangler.toml ids.
# Run in your terminal after: npx wrangler login
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: npx wrangler login"
  exit 1
fi

echo "Creating production + preview KV: SS6_EVIDENCE"
PROD_OUT="$(npx wrangler kv namespace create SS6_EVIDENCE)"
PREV_OUT="$(npx wrangler kv namespace create SS6_EVIDENCE --preview)"
echo "$PROD_OUT"
echo "$PREV_OUT"

PROD_ID="$(printf '%s\n' "$PROD_OUT" | sed -n 's/.*id = "\([^\"]*\)".*/\1/p' | tail -1)"
PREV_ID="$(printf '%s\n' "$PREV_OUT" | sed -n 's/.*id = "\([^\"]*\)".*/\1/p' | tail -1)"

if [[ -z "$PROD_ID" || -z "$PREV_ID" ]]; then
  echo "Could not parse ids from wrangler output. Paste them into wrangler.toml manually."
  exit 1
fi

python3 - "$ROOT/wrangler.toml" "$PROD_ID" "$PREV_ID" <<'PY'
from pathlib import Path
import sys
path, prod, prev = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
text = path.read_text()
block = f'''[[kv_namespaces]]\nbinding = "SS6_EVIDENCE"\nid = "{prod}"\npreview_id = "{prev}"\n'''
if "REPLACE_SS6_EVIDENCE_ID" in text:
    text = text.replace("# [[kv_namespaces]]\n# binding = \"SS6_EVIDENCE\"\n# id = \"REPLACE_SS6_EVIDENCE_ID\"\n# preview_id = \"REPLACE_SS6_EVIDENCE_PREVIEW_ID\"\n", block)
    text = text.replace("REPLACE_SS6_EVIDENCE_ID", prod, 1).replace("REPLACE_SS6_EVIDENCE_PREVIEW_ID", prev, 1)
elif 'binding = "SS6_EVIDENCE"' not in text:
    text = text.replace("[vars]", block + "\n[vars]", 1)
else:
    import re
    text = re.sub(r'id = "[^"]+"', f'id = "{prod}"', text, count=1)
    text = re.sub(r'preview_id = "[^"]+"', f'preview_id = "{prev}"', text, count=1)
path.write_text(text)
print(f"Updated wrangler.toml\n  SS6_EVIDENCE id={prod}\n  preview_id={prev}")
PY

echo
echo "Next:"
echo "  npx wrangler secret put HANDSHAKE_HMAC"
echo "  npx wrangler deploy"
echo "  curl https://ss6-connect-handshake.<account>.workers.dev/health"
echo "Health should show kv_bound: true"
