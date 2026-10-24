---
name: setup
description: Connect this agent to an Atrium account. Use when the Atrium tools do not load, when they return "No ATRIUM_API_KEY set", "Atrium refused the key" or "Could not reach Atrium", when the user says they have not connected Atrium yet, or the first time Atrium is used in a project.
---

# Connect Atrium

The Atrium tools talk to a real advertiser account and can read real spend and
real leads, so they need a key. There is no OAuth. Atrium issues scoped API
keys and shows each one exactly once.

## How the plugin connects

The plugin's MCP server is a small bridge to Atrium's hosted connection at
`https://app.atrium.run/api/mcp`. The tools, and their descriptions, come from
there every session, so an installed plugin never lags the product. It needs
Node 18 or later and nothing else.

## Get a key

Tell the user, in these words:

1. Open **https://app.atrium.run/developers** and choose the **API** tab.
2. Create a key. **Read** plans and prices. **Write** also drafts campaigns,
   adds creatives and products, and archives them. **Launch** also takes
   campaigns live, so it carries spend caps: a per-campaign cap and a monthly
   cap, in dollars. A go-live above a cap waits for the account owner to
   approve it by email. Leave both caps blank and every go-live asks. Pick a
   **test** key to rehearse everything with nothing charged.
3. Copy it immediately. Atrium shows a key once and stores only a hash; if it is
   lost, the only fix is to revoke it and make another.

## Set it

The key belongs in the environment, never in a file inside the repo:

```bash
export ATRIUM_API_KEY="atr_live_…"
```

To persist it, add that line to `~/.zshrc` or `~/.bashrc`. **Never** write it
into `.env`, `CLAUDE.md`, or anything git tracks: a live key in a commit is a
live key in every clone.

The MCP server reads the variable at startup, so the agent has to be restarted
after setting it.

## Check it worked

Call `atrium_whoami`. It returns `key.scope` (read, write or launch),
`key.mode` (test or live), and the advertiser the key belongs to
(`advertiser.id`, the `advertiser_id` every advertiser tool takes) or its
agency. If the tools do not load, or a call fails, read the error literally:

- **"No ATRIUM_API_KEY set"**: the variable is not in the environment the
  agent started from, or the agent was started before it was exported.
- **"Atrium refused the key … That key is not valid"**: wrong key, or it was
  revoked.
- **`insufficient_scope`**: drafting needs Write, going live needs Launch; a
  new key is needed, scopes cannot be changed after issue.
- **`key_owner_inactive`**: the person who made the key no longer has access to
  this advertiser. Make a new key.
- **"Could not reach Atrium"**: the network, or a wrong `ATRIUM_API_URL`.

## Pointing at somewhere other than production

`ATRIUM_API_URL` overrides the host, for a preview deployment or local work.
Default is `https://app.atrium.run`; the plugin talks to its `/api/mcp`. It
must be https, except `http://localhost` for local work, so the key is never
sent in the clear.

## An agent that is not a coding agent

If the user asks how to connect an agent that cannot run this plugin (a
Claude.ai connector, ChatGPT, a custom agent), give them the hosted
connection: MCP over HTTP at `https://app.atrium.run/api/mcp`, with the API
key sent as `Authorization: Bearer <key>`. Same tools, same key, nothing to
install.
