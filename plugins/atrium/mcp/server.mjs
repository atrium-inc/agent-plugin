#!/usr/bin/env node
/**
 * Atrium MCP server.
 *
 * A thin translation layer over Atrium's public v1 API — no business logic
 * lives here on purpose. The API already enforces the workspace boundary, the
 * read/write scope and the rate limit, so duplicating any of that in a client
 * the customer runs on their own machine would only create a second, weaker
 * copy of the rule.
 *
 * Hand-rolled JSON-RPC over stdio rather than the MCP SDK. The protocol surface
 * a server this small needs is three methods, and a zero-dependency file means
 * `node server.mjs` works the moment the plugin is installed — no install step,
 * no lockfile, nothing to go stale.
 *
 * WHAT THIS DELIBERATELY CANNOT DO: launch a campaign or move money. Every
 * write here stages something a human approves in the product, which is the
 * same rule the in-app chat follows. An agent that can spend a customer's
 * budget without them looking at it is not a feature.
 */

const BASE = process.env.ATRIUM_API_URL || 'https://app.atrium.run'
const KEY = process.env.ATRIUM_API_KEY || ''

// ── Tools ───────────────────────────────────────────────────────────────────
// Descriptions are written for the model, not for a docs page: they say when to
// reach for the tool, not merely what it returns.

const TOOLS = [
  {
    name: 'atrium_whoami',
    description:
      "Confirm the API key works and show which advertiser it belongs to, plus whether it may write. Call this first in a session, and any time a call fails — 'is my key right' is otherwise indistinguishable from 'the data is empty'.",
    inputSchema: { type: 'object', properties: {}, required: [] },
    call: () => api('/api/v1/me'),
  },
  {
    name: 'atrium_list_campaigns',
    description:
      'List this advertiser\'s TV campaigns with status, goal, budget and flight dates. Use it to answer "what am I running", to find a campaign by name before acting on it, or to check whether something has actually launched.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    call: () => api('/api/v1/campaigns'),
  },
  {
    name: 'atrium_list_leads',
    description:
      'Leads the Atrium tag recorded, newest first. This is the outcome of the advertising, so reach for it whenever the question is about results rather than about spend. Returns `truncated` when there are more than the limit — say so rather than reporting the page as the total.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Look-back window in days. Defaults to 30.' },
        limit: { type: 'number', description: 'Maximum leads to return.' },
      },
      required: [],
    },
    call: (a) => api(`/api/v1/leads${query({ days: a.days, limit: a.limit })}`),
  },
  {
    name: 'atrium_list_products',
    description:
      "The services or products this advertiser sells, with prices in cents. Campaigns are built around these, so read them before proposing what a spot should promote — inventing an offer the advertiser does not sell is the most common way to waste their time.",
    inputSchema: { type: 'object', properties: {}, required: [] },
    call: () => api('/api/v1/products'),
  },
  {
    name: 'atrium_add_product',
    description:
      'Add one product or service the advertiser sells. Requires a write-scoped key. Prices are CENTS — 18000 is $180.00. Confirm the price with the customer before calling; a wrong rate propagates into every campaign built on it.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What the customer calls it, e.g. "Roof inspection".' },
        description: { type: 'string' },
        category: { type: 'string', description: 'e.g. Repair, Installation, Maintenance.' },
        price_cents: { type: 'number', description: 'Cents. 18000 = $180.00.' },
        rate_type: { type: 'string', description: 'e.g. flat, hourly.' },
      },
      required: ['name'],
    },
    call: (a) => api('/api/v1/products', { method: 'POST', body: a }),
  },
]

// ── HTTP ────────────────────────────────────────────────────────────────────

function query(params) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')
  return q ? `?${q}` : ''
}

async function api(path, opts = {}) {
  if (!KEY) {
    return {
      error:
        'No ATRIUM_API_KEY set. Create a key in Atrium under Developers › API — it is shown once — then export ATRIUM_API_KEY and restart the agent.',
    }
  }
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${KEY}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
  } catch (err) {
    return { error: `Could not reach Atrium at ${BASE}: ${err?.message ?? 'network error'}` }
  }

  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { raw: text.slice(0, 500) }
  }

  if (res.ok) return body

  // The API already returns { error: { code, message } }. Pass its own words
  // through rather than replacing them with a generic failure — it knows why.
  const message = body?.error?.message || body?.error || `HTTP ${res.status}`
  if (res.status === 401) return { error: `${message} (the key is missing, wrong, or revoked)` }
  if (res.status === 403) return { error: `${message} (this key is read-only — a write needs a write-scoped key)` }
  return { error: String(message) }
}

// ── JSON-RPC over stdio ─────────────────────────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function reply(id, result) {
  if (id === undefined || id === null) return // a notification expects no answer
  send({ jsonrpc: '2.0', id, result })
}

/**
 * In-flight request count, so stdin closing does not kill a call mid-flight.
 * Found by piping a single request in and getting nothing back: stdin ends
 * immediately, 'end' fired, and process.exit(0) ran while fetch was still
 * awaiting. A host that keeps the pipe open would rarely hit it — which is
 * exactly the kind of bug that shows up once, in someone else's terminal.
 */
let inFlight = 0
let stdinClosed = false
function maybeExit() {
  if (stdinClosed && inFlight === 0) process.exit(0)
}

async function handle(msg) {
  const { id, method, params } = msg

  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'atrium', version: '0.1.0' },
    })
  }

  if (method === 'tools/list') {
    return reply(id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    })
  }

  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params?.name)
    if (!tool) {
      return reply(id, { content: [{ type: 'text', text: `Unknown tool: ${params?.name}` }], isError: true })
    }
    let out
    inFlight++
    try {
      out = await tool.call(params.arguments ?? {})
    } catch (err) {
      out = { error: err?.message ?? 'Tool failed.' }
    } finally {
      inFlight--
    }
    // isError so the model treats a failure as a failure rather than as data.
    reply(id, {
      content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
      isError: Boolean(out && out.error),
    })
    return maybeExit()
  }

  // Notifications (notifications/initialized and friends) carry no id.
  if (id !== undefined && id !== null) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
  }
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
    handle(msg)
  }
})
process.stdin.on('end', () => {
  stdinClosed = true
  maybeExit()
})
