/**
 * SS6-Connect Cloudflare handshake Worker
 * Combined hub: SS6-Connect + ROOT_OCEAN + GNAI TV
 * Controlled remediation only. B12 off. No production auto-deploy.
 *
 * Four production gates:
 * 1. Webhook cannot supply executable commands.
 * 2. Worker never pushes to a protected production branch.
 * 3. Allowed actions: ingest_evidence | request_candidate
 * 4. Failed HMAC / unknown action / secret-shaped fields = reject
 *
 * Four operational modules are evidence streams, not live fleet control:
 *   1 ingress   Live Ingress & Telemetry (packet summaries only)
 *   2 ledger    Ledger State & Cryptographic Checkpoints
 *   3 island    Island-Mode Isolation & Reconnect Simulation
 *   4 dashboard Admin dashboard health probe (no session tokens)
 */

const ALLOWED = new Set(["ingest_evidence", "request_candidate"]);
const MODULES = new Set(["ingress", "ledger", "island", "dashboard"]);
const FORBIDDEN_KEYS = new Set([
  "command",
  "commands",
  "exec",
  "script",
  "token",
  "session_token",
  "sessionToken",
  "password",
  "secret",
  "hmac",
  "private_key",
  "authorization"
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    if (request.method === "GET" && (path === "/" || path === "/health")) {
      return cors(json({
        ok: true,
        service: "ss6-connect-handshake",
        hub: env.HUB_NAME || "SS6-Connect Global Business Hub",
        combined: ["SS6-Connect", "ROOT_OCEAN", "GNAI TV"],
        mode: "controlled-remediation",
        b12: false,
        production_autodeploy: false,
        allowed_actions: [...ALLOWED],
        modules: [...MODULES],
        kv_bound: Boolean(env.SS6_EVIDENCE),
        github_repo: env.GITHUB_REPO || null,
        time: new Date().toISOString()
      }));
    }

    if (request.method === "GET" && path === "/handshake") {
      return cors(json({
        protocol: "ss6-handshake/2",
        pipeline: [
          "detector or operator POSTs signed /hook",
          "worker writes evidence to KV (if bound)",
          "request_candidate may fire GitHub repository_dispatch only",
          "CI opens candidate/* branch + PR",
          "tests + human approval required before promote",
          "failed canary rolls back to last approved artifact"
        ],
        gates: [
          "webhook cannot supply executable commands",
          "CI cannot push directly to protected main",
          "generated patches cannot deploy without tests and approval",
          "failed canary verification rolls back"
        ]
      }));
    }

    if (request.method === "GET" && path === "/sequence") {
      return cors(json(sequenceSpec()));
    }

    if (request.method === "GET" && path === "/evidence") {
      return listEvidence(env);
    }

    if (request.method === "POST" && path === "/hook") {
      return handleHook(request, env);
    }

    return cors(json({ error: "not_found" }, 404));
  }
};

function sequenceSpec() {
  return {
    protocol: "ss6-sequence/1",
    note: "Modules run as evidence ingest, not as live production mutation.",
    modules: [
      {
        id: 1,
        name: "ingress",
        title: "Live Ingress & Telemetry Streams",
        records: ["timestamp", "node_id", "status", "ttl_state", "metric_payload"],
        forbidden: "raw packet dumps, credentials, session tokens"
      },
      {
        id: 2,
        name: "ledger",
        title: "Ledger State & Cryptographic Checkpoints",
        records: ["blocks_verified", "head_hash", "integrity_status"],
        forbidden: "private keys, signing material"
      },
      {
        id: 3,
        name: "island",
        title: "Island-Mode Isolation & Reconnect Simulation",
        records: ["node_id", "severed_at", "recovered_at", "merge_conflicts"],
        forbidden: "remote shell, network cutover commands"
      },
      {
        id: 4,
        name: "dashboard",
        title: "System Administration Dashboard probe",
        records: ["gateway", "rbac_profile_name", "fleet_status"],
        forbidden: "live session tokens, admin passwords"
      }
    ]
  };
}

async function listEvidence(env) {
  if (!env.SS6_EVIDENCE) {
    return cors(json({ ok: true, items: [], kv_bound: false }));
  }
  const listed = await env.SS6_EVIDENCE.list({ prefix: "evt:", limit: 20 });
  const items = [];
  for (const key of listed.keys) {
    const raw = await env.SS6_EVIDENCE.get(key.name);
    if (raw) items.push(JSON.parse(raw));
  }
  items.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
  return cors(json({ ok: true, items, kv_bound: true }));
}

async function handleHook(request, env) {
  const raw = await request.text();
  const sig = request.headers.get("x-ss6-signature") || "";

  if (!env.HANDSHAKE_HMAC) {
    return cors(json({ error: "hmac_secret_not_configured" }, 503));
  }

  const expected = await hmacHex(env.HANDSHAKE_HMAC, raw);
  if (!timingSafeEqual(sig.replace(/^sha256=/i, ""), expected)) {
    return cors(json({ error: "invalid_signature" }, 401));
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return cors(json({ error: "invalid_json" }, 400));
  }

  if (containsForbidden(body)) {
    return cors(json({
      error: "executable_or_secret_payload_rejected",
      hint: "Webhook cannot supply commands, tokens, or secrets."
    }, 400));
  }

  const action = String(body.action || "");
  if (!ALLOWED.has(action)) {
    return cors(json({
      error: "action_not_allowed",
      hint: "Webhook cannot supply executable commands."
    }, 400));
  }

  const moduleName = String(body.module || "ingress");
  if (!MODULES.has(moduleName)) {
    return cors(json({ error: "unknown_module", allowed: [...MODULES] }, 400));
  }

  const evidence = {
    id: crypto.randomUUID(),
    action,
    module: moduleName,
    received_at: new Date().toISOString(),
    summary: String(body.summary || "").slice(0, 500),
    source: String(body.source || "unknown").slice(0, 80),
    sha: String(body.sha || "").slice(0, 64),
    metrics: sanitizeMetrics(body.metrics)
  };

  if (env.SS6_EVIDENCE) {
    await env.SS6_EVIDENCE.put(`evt:${evidence.id}`, JSON.stringify(evidence), {
      expirationTtl: 60 * 60 * 24 * 30
    });
    const cursorKey = `mod:${moduleName}:latest`;
    await env.SS6_EVIDENCE.put(cursorKey, evidence.id, {
      expirationTtl: 60 * 60 * 24 * 30
    });
  }

  let dispatch = { attempted: false };
  if (action === "request_candidate" && env.GITHUB_DISPATCH_TOKEN && env.GITHUB_REPO) {
    dispatch = await fireDispatch(env, evidence);
  }

  return cors(json({
    ok: true,
    evidence_id: evidence.id,
    action,
    module: moduleName,
    kv_stored: Boolean(env.SS6_EVIDENCE),
    github_dispatch: dispatch
  }));
}

function containsForbidden(obj) {
  if (!obj || typeof obj !== "object") return false;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (typeof obj[key] === "object" && containsForbidden(obj[key])) return true;
  }
  return false;
}

function sanitizeMetrics(metrics) {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return null;
  const out = {};
  for (const [k, v] of Object.entries(metrics)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 120);
    else if (typeof v === "boolean") out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

async function fireDispatch(env, evidence) {
  const [owner, repo] = String(env.GITHUB_REPO).split("/");
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "ss6-connect-handshake",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      event_type: "ss6-candidate-request",
      client_payload: {
        evidence_id: evidence.id,
        module: evidence.module,
        summary: evidence.summary,
        sha: evidence.sha
      }
    })
  });
  return { attempted: true, status: res.status, ok: res.status === 204 };
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function cors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Headers", "content-type, x-ss6-signature");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return new Response(res.body, { status: res.status, headers: h });
}
