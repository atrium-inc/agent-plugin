#!/usr/bin/env node
/**
 * Atrium MCP server: a stdio bridge to the hosted connection.
 *
 * The tools live on the hosted server at https://app.atrium.run/api/mcp, with
 * their titles, annotations, input and output schemas and descriptions. This
 * file used to keep its own hand-written copy of them, and the copy drifted:
 * it still described go-live by HTTP status, paged leads by limit, had no
 * archive tools and no annotations, and negotiated a protocol version the
 * hosted server had moved past (2026-10-24). So it keeps no copy now.
 *
 *   initialize   answered here, so an agent connects before a key is set
 *   ping         answered here
 *   tools/list   sent to the hosted server as it came, under the key, and
 *   tools/call   its answer returned unchanged
 *   notifications  not forwarded: the hosted server is stateless
 *
 * A tool added or reworded there is here the moment it ships. No business
 * logic lives in this file: the API enforces the workspace boundary, scope,
 * spend caps, rate limits and the audit, on the server, where a customer's
 * own machine cannot loosen them.
 *
 * Zero dependencies: node built-ins and the global fetch (Node 18+), so
 * `node server.mjs` works the moment the plugin is installed. No install step,
 * no lockfile, nothing to go stale.
 *
 * MONEY. A launch-scoped key may take a campaign live, and the key's spend cap
 * decides whether a person looks first: a go-live above the cap (or from a key
 * with no cap) is held and the account owner gets one Approve link by email.
 * The rule lives on the server, in the key; nothing here can loosen it. A test
 * key (atr_test_) never spends.
 */

const ORIGIN = (process.env.ATRIUM_API_URL || 'https://app.atrium.run').trim().replace(/\/+$/, '')
const ENDPOINT = `${ORIGIN}/api/mcp`
const KEY = readKey()

/** What the hosted server speaks, newest first (lib/server/api/mcp.ts in the app). */
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26']
/** The hosted server's own serverInfo, so a client sees one server whichever way it connects. */
const SERVER_INFO = { name: 'atrium', version: '0.3.0' }

/** Set by initialize and sent on every forwarded request, as the Streamable HTTP transport asks. */
let protocolVersion = null

// JSON-RPC error codes for failures before the hosted server answers in its
// own words. The server-defined range, -32000 to -32099.
const KEY_ERROR = -32001 // no key, or the key was refused
const UPSTREAM_ERROR = -32002 // Atrium could not be reached, or did not answer in MCP

function readKey() {
  const key = (process.env.ATRIUM_API_KEY || '').trim()
  // A host that cannot expand "${ATRIUM_API_KEY}" in plugin.json may pass the
  // placeholder through as it is. That is no key, not a wrong one.
  return /^\$\{[^}]*\}$/.test(key) ? '' : key
}

const NO_KEY =
  `No ATRIUM_API_KEY set. Create a key at ${ORIGIN}/developers (API tab; it is shown once), ` +
  'export ATRIUM_API_KEY in the shell that starts the agent, and restart the agent. The setup skill walks through it.'

/**
 * The key rides on every request, so it goes only over https, or plain http
 * to this machine for local work.
 */
function endpointProblem() {
  let url
  try {
    url = new URL(ENDPOINT)
  } catch {
    return `ATRIUM_API_URL is not a URL: ${ORIGIN}`
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return null
  return `ATRIUM_API_URL must start with https:// (http:// only for localhost), so the key is never sent in the clear. It is ${ORIGIN}.`
}

// ── Messages ────────────────────────────────────────────────────────────────

const result = (id, value) => ({ jsonrpc: '2.0', id, result: value })
const rpcError = (id, code, message, data) => ({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } })
const isResponse = (m) => !!m && typeof m === 'object' && !Array.isArray(m) && m.jsonrpc === '2.0' && ('result' in m || 'error' in m)

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

async function handle(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return rpcError(null, -32600, 'Invalid request: a JSON-RPC 2.0 message is required.')
  const { id, method } = msg
  // No method: a response to a request this server never sends. Nothing to do.
  if (typeof method !== 'string') return id === undefined ? null : rpcError(id, -32600, 'Invalid request: a JSON-RPC 2.0 message with a method is required.')
  // No id: a notification (notifications/initialized and the rest). The
  // hosted server is stateless and answers none, so none is sent there.
  if (id === undefined) return null

  switch (method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion
      protocolVersion = PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0]
      return result(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: SERVER_INFO })
    }
    case 'ping':
      return result(id, {})
    case 'tools/list':
    case 'tools/call':
      return forward(msg)
    default:
      return rpcError(id, -32601, `Method not found: ${method}`)
  }
}

// ── The hosted server ───────────────────────────────────────────────────────

/** One request to the hosted server. Its JSON-RPC answer comes back unchanged; anything else becomes a JSON-RPC error. */
async function forward(msg) {
  const { id } = msg
  if (!KEY) return rpcError(id, KEY_ERROR, NO_KEY)
  const bad = endpointProblem()
  if (bad) return rpcError(id, UPSTREAM_ERROR, bad)

  let res
  let text
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(protocolVersion ? { 'MCP-Protocol-Version': protocolVersion } : {}),
        'User-Agent': `atrium-agent-plugin (node ${process.version})`,
      },
      body: JSON.stringify(msg),
      // Never follow a redirect: it would carry the key, or drop the POST, to
      // wherever it points. Say where it pointed instead.
      redirect: 'manual',
    })
    text = await res.text()
  } catch (err) {
    const why = err?.cause?.code || err?.cause?.message || err?.message || 'network error'
    // A call that failed after it was sent may have run: a go-live cut off
    // mid-answer can still be live. Say so rather than invite a blind retry.
    const neverSent = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(err?.cause?.code)
    const base = `Could not reach Atrium at ${ENDPOINT} (${why}). Check the connection${process.env.ATRIUM_API_URL ? ' and ATRIUM_API_URL' : ''}`
    const mayHaveRun = msg.method === 'tools/call' && !neverSent
    return rpcError(
      id,
      UPSTREAM_ERROR,
      mayHaveRun
        ? `${base}. The call may have reached Atrium before the connection failed: read the current state (atrium_get_campaign after a go-live) before calling it again.`
        : `${base}, then try again.`,
    )
  }

  const type = res.headers.get('content-type') || ''
  const answer = type.includes('text/event-stream') ? fromEventStream(text, id) : parseJson(text)

  if (isResponse(answer)) {
    // A refusal before the hosted server read the message (an unsupported
    // version, a body it could not parse, its own 500) carries id null. The
    // agent waits on its own id, so give it back; the words stay the server's.
    return answer.id === id ? answer : { ...answer, id }
  }

  const apiError = answer && typeof answer === 'object' ? answer.error : undefined
  const said = typeof apiError?.message === 'string' ? apiError.message : ''
  const data = { http_status: res.status, ...(apiError ? { error: apiError } : {}) }

  if (res.status === 401) {
    return rpcError(
      id,
      KEY_ERROR,
      `Atrium refused the key in ATRIUM_API_KEY: ${said || 'That key is not valid.'} It is mistyped or was revoked. ` +
        `Create a key at ${ORIGIN}/developers (API tab), export ATRIUM_API_KEY, and restart the agent.`,
      data,
    )
  }
  if (res.status === 429) {
    const wait = res.headers.get('retry-after')
    return rpcError(id, UPSTREAM_ERROR, `Atrium is rate limiting this key: ${said || 'Too many requests.'}${wait ? ` Try again in ${wait} seconds.` : ''}`, { ...data, ...(wait ? { retry_after_seconds: Number(wait) } : {}) })
  }
  if (res.status >= 300 && res.status < 400) {
    const to = res.headers.get('location')
    return rpcError(id, UPSTREAM_ERROR, `Atrium answered ${ENDPOINT} with a redirect${to ? ` to ${to}` : ''}. Set ATRIUM_API_URL to the origin it names.`, data)
  }
  const code = typeof apiError?.code === 'string' ? ` (${apiError.code})` : ''
  const what = said || (text ? 'an answer that is not MCP' : 'no answer')
  return rpcError(id, UPSTREAM_ERROR, `Atrium answered HTTP ${res.status}${code} at ${ENDPOINT}: ${what}.${process.env.ATRIUM_API_URL ? ' Check ATRIUM_API_URL.' : ''}`, data)
}

/**
 * The transport lets a server answer a POST with an event stream whose events
 * carry JSON-RPC messages, the response among them. The hosted server answers
 * with plain JSON today; this keeps the bridge working if that changes.
 */
function fromEventStream(text, id) {
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
    const msg = data ? parseJson(data) : undefined
    if (isResponse(msg) && msg.id === id) return msg
  }
  return undefined
}

// ── JSON-RPC over stdio ─────────────────────────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

async function answer(msg) {
  try {
    return await handle(msg)
  } catch (err) {
    // A bug here must answer the agent, not leave it waiting or kill the server.
    const id = msg && typeof msg === 'object' && !Array.isArray(msg) ? msg.id : undefined
    return id === undefined ? null : rpcError(id, -32603, `Internal error in the Atrium plugin: ${err?.message ?? String(err)}`)
  }
}

/**
 * In-flight count, so stdin closing does not kill a call mid-flight. Found by
 * piping a single request in and getting nothing back: stdin ends at once,
 * 'end' fired, and the process exited while fetch was still awaiting.
 */
let inFlight = 0
let stdinClosed = false

function maybeExit() {
  if (!stdinClosed || inFlight > 0) return
  // A pipe write is asynchronous on macOS: let the last answer reach it first.
  process.stdout.write('', () => process.exit(0))
}

async function dispatch(line) {
  const parsed = parseJson(line)
  if (parsed === undefined) {
    send(rpcError(null, -32700, 'Parse error: each line must be one JSON-RPC message.'))
    return
  }
  inFlight++
  try {
    if (Array.isArray(parsed)) {
      // A batch (2025-03-26): each message answered, the answers as one batch.
      if (!parsed.length) send(rpcError(null, -32600, 'Invalid request: an empty batch.'))
      const answers = (await Promise.all(parsed.map(answer))).filter(Boolean)
      if (answers.length) send(answers)
    } else {
      const out = await answer(parsed)
      if (out) send(out)
    }
  } finally {
    inFlight--
    maybeExit()
  }
}

if (!KEY) process.stderr.write(`[atrium] ${NO_KEY}\n`)

// The agent is gone: nothing left to answer.
process.stdout.on('error', () => process.exit(0))

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  // One JSON message per line. Split on newlines and keep any partial tail.
  let nl
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim()
    buffer = buffer.slice(nl + 1)
    if (line) dispatch(line)
  }
})
process.stdin.on('end', () => {
  stdinClosed = true
  // A last message with no newline after it is still a message.
  const tail = buffer.trim()
  buffer = ''
  if (tail) dispatch(tail)
  maybeExit()
})
