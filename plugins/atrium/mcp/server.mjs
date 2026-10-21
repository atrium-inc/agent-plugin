#!/usr/bin/env node
/**
 * Atrium MCP server.
 *
 * A thin translation layer over Atrium's public v1 API. No business logic
 * lives here on purpose. The API already enforces the workspace boundary, the
 * read/write scope and the rate limit, so duplicating any of that in a client
 * the customer runs on their own machine would only create a second, weaker
 * copy of the rule.
 *
 * Hand-rolled JSON-RPC over stdio rather than the MCP SDK. The protocol surface
 * a server this small needs is three methods, and a zero-dependency file means
 * `node server.mjs` works the moment the plugin is installed: no install step,
 * no lockfile, nothing to go stale.
 *
 * MONEY. Since 2026-10-21 a launch-scoped key may take a campaign live, and
 * the key's spend cap decides whether a person looks first: a go-live above
 * the cap (or from a key with no cap) is parked and the account owner gets one
 * Approve link by email. The rule lives on the server, in the key; nothing
 * here can loosen it. A test key (atr_test_) never spends.
 */

import { randomUUID } from 'node:crypto'

const BASE = process.env.ATRIUM_API_URL || 'https://app.atrium.run'
const KEY = process.env.ATRIUM_API_KEY || ''

// ── Tools ───────────────────────────────────────────────────────────────────
// Descriptions are written for the model, not for a docs page: they say when to
// reach for the tool, not merely what it returns.

// Idempotency keys: the creating calls require one. Random per call, so a
// retried tool call with a different body never replays the wrong response.
const idem = () => ({ 'Idempotency-Key': randomUUID() })

// Agency keys name the advertiser on every call; an advertiser key acts on its
// own. `atrium_whoami` returns the id to use.
const ADV = { advertiser_id: { type: 'string', description: 'The advertiser id, from atrium_whoami (advertiser.id) or atrium_list_advertisers. Required.' } }
const STRATEGY = {
  type: 'object',
  description: 'One strategy: where the ads run. geography is required: { nationwide: true } or { states: ["GA"] } or { zips: [...] }.',
  properties: {
    name: { type: 'string' },
    supply: { type: 'string', enum: ['premium', 'local', 'blended', 'auto'], description: 'The tier. Omit or "auto" to let the named networks decide; blended when none are named.' },
    networks: { type: 'array', items: { type: 'string' }, description: 'Catalog network names from atrium_list_networks. Omit for the whole tier.' },
    geography: { type: 'object', properties: { nationwide: { type: 'boolean' }, states: { type: 'array', items: { type: 'string' } }, zips: { type: 'array', items: { type: 'string' } } } },
    creative_ids: { type: 'array', items: { type: 'string' }, description: 'Creatives of this advertiser to air. Each must be ready.' },
    screens: { type: 'string', enum: ['tv', 'tv_and_online', 'online'], description: 'Default tv.' },
  },
  required: ['geography'],
}

const TOOLS = [
  // ── Account ──
  {
    name: 'atrium_whoami',
    description:
      "Confirm the API key works and show what it may do: its scope (read, write or launch), whether it is a test key, and the advertiser or agency it belongs to. Call this first in a session, and any time a call fails. A test key (atr_test_) runs every check and never spends.",
    inputSchema: { type: 'object', properties: {}, required: [] },
    call: () => api('/api/v1/me'),
  },
  {
    name: 'atrium_list_advertisers',
    description: 'Agency keys only: the client advertisers this key may act on, with ids. An advertiser key acts on itself; use atrium_whoami for its id.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    call: () => api('/api/v1/advertisers'),
  },
  // ── Catalog ──
  {
    name: 'atrium_list_networks',
    description:
      'The networks and streaming apps a strategy can name, with the tier each belongs to. Use it before naming networks, and to quote live counts rather than remembered ones. Filter by tier (premium or local) or a search term. No prices here; use atrium_estimate for cost.',
    inputSchema: { type: 'object', properties: { tier: { type: 'string', enum: ['premium', 'local'] }, q: { type: 'string', description: 'A search term, e.g. "food".' }, cursor: { type: 'string' } }, required: [] },
    call: (a) => api(`/api/v1/catalog/networks${query({ tier: a.tier, q: a.q, cursor: a.cursor })}`),
  },
  // ── Pricing ──
  {
    name: 'atrium_estimate',
    description:
      'Price a buy BEFORE drafting it: the households a targeting could reach, the TV ads and households a budget buys, the CPM range those figures were computed at, and whether the budget or the targeting is the ceiling. Same math and same supply as the Atrium app. Read scope, nothing is written. Call it with the exact strategy you would draft, so the number you quote is the number that launches. Budget is CENTS.',
    inputSchema: {
      type: 'object',
      properties: { ...ADV, budget_cents: { type: 'number', description: 'Cents. 250000 = $2,500. Minimum 10000.' }, flight_start: { type: 'string', description: 'YYYY-MM-DD' }, flight_end: { type: 'string', description: 'YYYY-MM-DD' }, strategy: STRATEGY },
      required: ['advertiser_id', 'budget_cents', 'flight_start', 'flight_end', 'strategy'],
    },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/estimate`, { method: 'POST', body: { budget_cents: a.budget_cents, flight_start: a.flight_start, flight_end: a.flight_end, strategy: a.strategy } }),
  },
  // ── Creatives ──
  {
    name: 'atrium_list_creatives',
    description: 'The commercials this advertiser has, with status (processing, ready, failed), whether each is airable, and the spec findings. A campaign needs at least one ready creative on each strategy before it can go live.',
    inputSchema: { type: 'object', properties: { ...ADV, cursor: { type: 'string' } }, required: ['advertiser_id'] },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/creatives${query({ cursor: a.cursor })}`),
  },
  {
    name: 'atrium_add_creative',
    description:
      'Add a commercial from a public https video URL (MP4, MOV or WebM; 15 or 30 seconds is the spec, 60 max). Requires write scope. Atrium fetches it, converts it to the TV delivery spec and checks it; poll atrium_get_creative until status is ready or failed. Name must be unique per advertiser.',
    inputSchema: { type: 'object', properties: { ...ADV, name: { type: 'string' }, source_url: { type: 'string', description: 'A public https URL of the video file.' } }, required: ['advertiser_id', 'name', 'source_url'] },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/creatives`, { method: 'POST', headers: idem(), body: { name: a.name, source_url: a.source_url } }),
  },
  {
    name: 'atrium_get_creative',
    description: 'One creative by id: status, airable, spec findings, video_url. Poll this after atrium_add_creative; processing takes a minute or two.',
    inputSchema: { type: 'object', properties: { ...ADV, creative_id: { type: 'string' } }, required: ['advertiser_id', 'creative_id'] },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/creatives/${enc(a.creative_id)}`),
  },
  // ── Campaigns ──
  {
    name: 'atrium_list_campaigns',
    description:
      'This advertiser\'s campaigns with status (draft, paused, active, ended), goal, budget, spend, flight dates and strategies. Use it to answer "what am I running", to find a campaign by name before acting on it, or to see whether a go-live that was sent for approval has gone active.',
    inputSchema: { type: 'object', properties: { ...ADV, status: { type: 'string', enum: ['draft', 'paused', 'active', 'ended'] }, cursor: { type: 'string' } }, required: ['advertiser_id'] },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/campaigns${query({ status: a.status, cursor: a.cursor })}`),
  },
  {
    name: 'atrium_get_campaign',
    description: 'One campaign by id, with its strategies and health.',
    inputSchema: { type: 'object', properties: { ...ADV, campaign_id: { type: 'string' } }, required: ['advertiser_id', 'campaign_id'] },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/campaigns/${enc(a.campaign_id)}`),
  },
  {
    name: 'atrium_create_campaign',
    description:
      'Draft a campaign. Requires write scope. Nothing airs and nothing is charged until go-live. Budget is CENTS for the whole flight (10000 minimum). One to five strategies, each with a geography. Networks must be catalog names (atrium_list_networks). Price it with atrium_estimate first and show the customer the number before drafting.',
    inputSchema: {
      type: 'object',
      properties: {
        ...ADV,
        name: { type: 'string' },
        goal: { type: 'string', enum: ['awareness', 'clicks', 'calls', 'forms'] },
        budget_cents: { type: 'number', description: 'Cents, the flight total. 250000 = $2,500.' },
        flight_start: { type: 'string', description: 'YYYY-MM-DD, today or later.' },
        flight_end: { type: 'string', description: 'YYYY-MM-DD, after flight_start.' },
        strategies: { type: 'array', items: STRATEGY, minItems: 1, maxItems: 5 },
      },
      required: ['advertiser_id', 'name', 'goal', 'budget_cents', 'flight_start', 'flight_end', 'strategies'],
    },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/campaigns`, { method: 'POST', headers: idem(), body: { name: a.name, goal: a.goal, budget_cents: a.budget_cents, flight_start: a.flight_start, flight_end: a.flight_end, strategies: a.strategies } }),
  },
  {
    name: 'atrium_update_campaign',
    description: 'Change a campaign. Drafts take any field, including replacing the strategies (write scope). A launched campaign takes name, goal, budget and dates only, under launch scope, and the budget can never drop below what was spent.',
    inputSchema: {
      type: 'object',
      properties: { ...ADV, campaign_id: { type: 'string' }, name: { type: 'string' }, goal: { type: 'string', enum: ['awareness', 'clicks', 'calls', 'forms'] }, budget_cents: { type: 'number' }, flight_start: { type: 'string' }, flight_end: { type: 'string' }, strategies: { type: 'array', items: STRATEGY } },
      required: ['advertiser_id', 'campaign_id'],
    },
    call: (a) => {
      const { advertiser_id, campaign_id, ...fields } = a
      return api(`/api/v1/advertisers/${enc(advertiser_id)}/campaigns/${enc(campaign_id)}`, { method: 'PATCH', body: fields })
    },
  },
  {
    name: 'atrium_launch_check',
    description:
      'What go-live would say, without doing it: blockers, warnings, which acknowledgements it needs (nationwide, no_keyword, no_pixel), a missing landing page, and whether the wallet covers the budget. Always call this before atrium_go_live and fix every block first. Never returns prices.',
    inputSchema: { type: 'object', properties: { ...ADV, campaign_id: { type: 'string' } }, required: ['advertiser_id', 'campaign_id'] },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/campaigns/${enc(a.campaign_id)}/launch-check`),
  },
  {
    name: 'atrium_go_live',
    description:
      'Take a campaign live. Requires launch scope. Pass the acknowledgements the launch check asked for. Three answers: 200 and the campaign is live; 202 approval_pending and the campaign waits for the account owner, who gets an email with one Approve link (the key is above its spend cap, or has none); or a 4xx with what blocked it. On 202, tell the customer the owner has to approve, then poll atrium_get_campaign for status active. A test key answers would_go_live and changes nothing.',
    inputSchema: { type: 'object', properties: { ...ADV, campaign_id: { type: 'string' }, acknowledge: { type: 'array', items: { type: 'string', enum: ['nationwide', 'no_keyword', 'no_pixel'] } } }, required: ['advertiser_id', 'campaign_id'] },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/campaigns/${enc(a.campaign_id)}/go-live`, { method: 'POST', headers: idem(), body: { acknowledge: a.acknowledge ?? [] } }),
  },
  {
    name: 'atrium_pause_campaign',
    description: 'Stop a live campaign. Launch scope. Nothing spends until it is resumed.',
    inputSchema: { type: 'object', properties: { ...ADV, campaign_id: { type: 'string' } }, required: ['advertiser_id', 'campaign_id'] },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/campaigns/${enc(a.campaign_id)}/pause`, { method: 'POST', body: {} }),
  },
  {
    name: 'atrium_resume_campaign',
    description: 'Resume a paused campaign that already launched. Launch scope. Applies the acknowledgement and funds gates again.',
    inputSchema: { type: 'object', properties: { ...ADV, campaign_id: { type: 'string' }, acknowledge: { type: 'array', items: { type: 'string' } } }, required: ['advertiser_id', 'campaign_id'] },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/campaigns/${enc(a.campaign_id)}/resume`, { method: 'POST', body: { acknowledge: a.acknowledge ?? [] } }),
  },
  // ── Results ──
  {
    name: 'atrium_delivery',
    description:
      'What the advertising delivered: impressions, TV ads aired, online video, spend, by campaign over a date range (default the last 7 days, up to 90). Pass campaign_id for a daily breakdown of one campaign. Data lags about a day; a campaign that went live today may legitimately show nothing yet.',
    inputSchema: { type: 'object', properties: { ...ADV, campaign_id: { type: 'string', description: 'Optional. One campaign, by day.' }, start: { type: 'string', description: 'YYYY-MM-DD' }, end: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['advertiser_id'] },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}${a.campaign_id ? `/campaigns/${enc(a.campaign_id)}` : ''}/delivery${query({ start: a.start, end: a.end })}`),
  },
  {
    name: 'atrium_delivery_breakdown',
    description: 'Where one campaign delivered: the top networks and apps, or the states, over a date range. Use it to answer "where did my ads run".',
    inputSchema: { type: 'object', properties: { ...ADV, campaign_id: { type: 'string' }, by: { type: 'string', enum: ['networks', 'states'] }, start: { type: 'string' }, end: { type: 'string' } }, required: ['advertiser_id', 'campaign_id', 'by'] },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/campaigns/${enc(a.campaign_id)}/delivery/${a.by === 'states' ? 'states' : 'networks'}${query({ start: a.start, end: a.end })}`),
  },
  {
    name: 'atrium_list_leads',
    description:
      'Leads the advertising produced, newest first: texts from TV viewers and website form or call leads. This is the outcome, so reach for it whenever the question is about results rather than spend. has_more means there are more than the limit; say "at least N".',
    inputSchema: { type: 'object', properties: { ...ADV, days: { type: 'number', description: '1 to 90. Default 7.' }, limit: { type: 'number', description: '1 to 500. Default 100.' } }, required: ['advertiser_id'] },
    call: (a) => api(`/api/v1/advertisers/${enc(a.advertiser_id)}/leads${query({ days: a.days, limit: a.limit })}`),
  },
  // ── Products (workspace routes, advertiser keys) ──
  {
    name: 'atrium_list_products',
    description: "The services or products this advertiser sells, with prices in cents. Campaigns are built around these, so read them before proposing what a spot should promote. Advertiser keys only.",
    inputSchema: { type: 'object', properties: {}, required: [] },
    call: () => api('/api/v1/products'),
  },
  {
    name: 'atrium_add_product',
    description: 'Add one product or service the advertiser sells. Requires a write-scoped advertiser key. Prices are CENTS. Confirm the price with the customer before calling.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' }, price_cents: { type: 'number', description: 'Cents. 18000 = $180.00.' }, rate_type: { type: 'string', description: 'e.g. flat, hourly.' } },
      required: ['name'],
    },
    call: (a) => api('/api/v1/products', { method: 'POST', body: a }),
  },
]

const enc = (v) => encodeURIComponent(String(v ?? ''))

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
        'No ATRIUM_API_KEY set. Create a key in Atrium under Developers › API (it is shown once), then export ATRIUM_API_KEY and restart the agent.',
    }
  }
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${KEY}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers ?? {}),
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
  // through rather than replacing them with a generic failure. It knows why.
  const message = body?.error?.message || body?.error || `HTTP ${res.status}`
  if (res.status === 401) return { error: `${message} (the key is missing, wrong, or revoked)` }
  if (res.status === 403) return { error: `${message} (this key's scope does not allow it: drafting needs write, going live needs launch)` }
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
 * awaiting. A host that keeps the pipe open would rarely hit it, which is
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
      serverInfo: { name: 'atrium', version: '0.2.0' },
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
