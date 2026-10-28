#!/usr/bin/env node
/**
 * Atrium MCP server for coding agents: a bridge from stdio to the hosted
 * connection at https://app.atrium.run/api/mcp.
 *
 * Until 2026-10-27 this file carried its own copy of every tool, and it
 * drifted: the hosted connection gained tools, output schemas, annotations
 * and a newer protocol version that this copy never saw. Now every message
 * the agent sends over stdio is forwarded as-is to the hosted endpoint under
 * the customer's key, and the answer is written back. The tool list, the
 * rules (scope, spend caps, the owner's approval, the daily call cap, the
 * access switch) and the audit trail all live in one place, on the server,
 * and this file cannot be behind them or loosen them.
 *
 * Zero dependencies on purpose: `node server.mjs` works the moment the
 * plugin is installed. Node 18 or later (global fetch).
 *
 * MONEY. A launch-scoped key may take a campaign live. The account's review
 * rule and the key's spend caps decide whether the owner looks first; a held
 * go-live answers approval_pending and the owner gets one Approve link. A
 * test key (atr_test_) never spends.
 */

const BASE = (process.env.ATRIUM_API_URL || 'https://app.atrium.run').replace(/\/+$/, '')
const KEY = process.env.ATRIUM_API_KEY || ''
const ENDPOINT = `${BASE}/api/mcp`
const VERSION = '0.3.0'

const NO_KEY =
  'No ATRIUM_API_KEY set. Make a key on the Agents page in Atrium (app.atrium.run/agents, shown once), export ATRIUM_API_KEY, and restart the agent.'

// The protocol version the hosted server agreed to at initialize. Sent on
// every later request, as the transport spec asks.
let protocolVersion = null

// ── stdio ───────────────────────────────────────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function isNotification(msg) {
  return msg.id === undefined || msg.id === null
}

/** A tool-shaped failure, so the model reads it as a failure and not as data. */
function toolFailure(id, text) {
  send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } })
}

function rpcFailure(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

// ── the bridge ──────────────────────────────────────────────────────────────

async function forward(msg) {
  const headers = {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': `atrium-agent-plugin/${VERSION} node/${process.versions.node}`,
  }
  if (protocolVersion && msg.method !== 'initialize') headers['MCP-Protocol-Version'] = protocolVersion
  const res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(msg) })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  return { status: res.status, body, text }
}

async function handle(msg) {
  const { id, method } = msg

  if (!KEY) {
    // Let the host finish its handshake and show the server as connected, so
    // the one thing it says is where the key comes from.
    if (method === 'initialize') {
      return send({ jsonrpc: '2.0', id, result: { protocolVersion: msg.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'atrium', version: VERSION }, instructions: NO_KEY } })
    }
    if (isNotification(msg)) return
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: [] } })
    if (method === 'tools/call') return toolFailure(id, NO_KEY)
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} })
    return rpcFailure(id, -32601, `Method not found: ${method}`)
  }

  let out
  try {
    out = await forward(msg)
  } catch (err) {
    if (isNotification(msg)) return
    const text = `Could not reach Atrium at ${BASE}: ${err?.message ?? 'network error'}`
    return method === 'tools/call' ? toolFailure(id, text) : rpcFailure(id, -32000, text)
  }

  if (isNotification(msg)) return // 202, nothing to relay

  // A JSON-RPC answer, whatever its HTTP status (a step-up 403 carries one).
  if (out.body && typeof out.body === 'object' && out.body.jsonrpc === '2.0') {
    if (method === 'initialize' && out.body.result?.protocolVersion) protocolVersion = out.body.result.protocolVersion
    return send({ ...out.body, id })
  }

  // The partner API's own envelope: a refusal before any protocol handling
  // (no key, a revoked key, the access switch, a rate or daily cap). Its own
  // words, so the agent can tell the person what to do.
  const message = out.body?.error?.message || (out.text ? out.text.slice(0, 300) : `HTTP ${out.status}`)
  const hint =
    out.status === 401 ? ' (the key is missing, wrong, or revoked)'
    : out.status === 403 ? ''
    : out.status === 429 ? ' (try again later)'
    : ''
  const text = `${message}${hint}`
  return method === 'tools/call' ? toolFailure(id, text) : rpcFailure(id, -32000, text)
}

/**
 * In-flight request count, so stdin closing does not kill a call mid-flight.
 * Found by piping a single request in and getting nothing back: stdin ends
 * immediately, 'end' fired, and process.exit(0) ran while fetch was still
 * awaiting.
 */
let inFlight = 0
let stdinClosed = false
function maybeExit() {
  if (stdinClosed && inFlight === 0) process.exit(0)
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  // One JSON object per line. Split on newlines and keep any partial tail.
  let nl
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim()
    buffer = buffer.slice(nl + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue // a malformed line must not kill the server
    }
    inFlight++
    handle(msg).catch((err) => { if (!isNotification(msg)) rpcFailure(msg.id, -32603, err?.message ?? 'Internal error') }).finally(() => { inFlight--; maybeExit() })
  }
})
process.stdin.on('end', () => {
  stdinClosed = true
  maybeExit()
})
