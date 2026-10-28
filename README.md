# Atrium agent plugin

Buy television from your coding agent. Plan, inspect and measure campaigns on
the Atrium Performance Network from Claude Code, Codex or Cursor.

```
/plugin marketplace add atrium-inc/agent-plugin
/plugin install atrium@atrium
```

Then run the bundled **setup** skill. It walks through creating an API key at
[app.atrium.run/developers](https://app.atrium.run/developers) and
exporting it.

## No install: the hosted connection

Any agent that speaks MCP (Model Context Protocol) over HTTP can use the same
tools with nothing installed. Point it at `https://app.atrium.run/api/mcp`
with the API key as the bearer token:

```
Authorization: Bearer atr_live_...
```

Same 23 tools, same rules. The plugin is a thin bridge: every message a coding
agent sends over stdio is forwarded to the hosted connection under the key, so
the tool list and the rules live in one place and the plugin is never behind
them. The hosted connection is for everything else (Claude.ai connectors,
ChatGPT, custom agents).

## What it gives the agent

**Tools:** plan and price (`atrium_whoami`, `atrium_list_advertisers`,
`atrium_list_networks`, `atrium_estimate`), build (`atrium_add_creative`,
`atrium_create_campaign`, `atrium_update_campaign`, `atrium_add_product`,
`atrium_list_creatives`, `atrium_get_creative`, `atrium_list_products`,
`atrium_archive_campaign`, `atrium_archive_creative`, `atrium_archive_product`),
launch (`atrium_launch_check`, `atrium_go_live`, `atrium_pause_campaign`,
`atrium_resume_campaign`) and results (`atrium_list_campaigns`,
`atrium_get_campaign`, `atrium_delivery`, `atrium_delivery_breakdown`,
`atrium_list_leads`).

**Skills:** `setup` (connect an account), `atrium` (how the product fits
together, and how to read its numbers honestly), `buying-tv` (how the supply
tiers work and how to size a budget), `buying-a-campaign` (the end-to-end
path: price, draft, check, go live, report).

The skills are the point. Wrapping an API in tools lets an agent *call* Atrium;
the skills are what make it good at buying television.

## How money is kept safe

Going live needs a **launch** key, and every launch key carries a spend cap: a
per-campaign cap and a monthly cap, set in dollars when the key is made. A
go-live above a cap, or from a key with no cap at all, is parked, and the
account owner gets one email with one Approve link. Nothing spends until they
click. The rule lives on the server, in the key, so no agent can loosen it. A
**test** key runs every step with nothing charged.

## Configuration

| Variable | Purpose |
|---|---|
| `ATRIUM_API_KEY` | Required. Created under Developers › API, shown once. |
| `ATRIUM_API_URL` | Optional. Defaults to `https://app.atrium.run`. |

Keep the key in your shell environment. Never commit it.
