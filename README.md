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

The plugin is for coding agents that run tools over stdio; the hosted
connection is for everything else (Claude.ai connectors, ChatGPT, custom
agents). They are one server: the plugin's MCP server is a small stdio bridge
that sends every tool listing and tool call to the hosted connection, under
the key, and hands back its answer unchanged. The tools, their descriptions
and their rules cannot drift between the two. The bridge needs Node 18 or
later and has no dependencies.

## What it gives the agent

**Tools:** plan and price (`atrium_whoami`, `atrium_list_advertisers`,
`atrium_list_networks`, `atrium_estimate`, `atrium_list_products`), build
(`atrium_add_product`, `atrium_list_creatives`, `atrium_add_creative`,
`atrium_get_creative`, `atrium_create_campaign`, `atrium_update_campaign`),
launch (`atrium_launch_check`, `atrium_go_live`, `atrium_pause_campaign`,
`atrium_resume_campaign`), results (`atrium_list_campaigns`,
`atrium_get_campaign`, `atrium_delivery`, `atrium_delivery_breakdown`,
`atrium_list_leads`) and tidy up (`atrium_archive_campaign`,
`atrium_archive_creative`, `atrium_archive_product`). Every advertiser tool,
products included, takes an `advertiser_id`, so an agency key can act on any
of its clients. Lists page with a cursor.

**Skills:** `setup` (connect an account), `atrium` (how the product fits
together, and how to read its numbers honestly), `buying-tv` (how the supply
tiers work and how to size a budget), `buying-a-campaign` (the end-to-end
path: price, draft, check, go live, report, archive).

The skills are the point. Wrapping an API in tools lets an agent *call* Atrium;
the skills are what make it good at buying television.

## How money is kept safe

Going live needs a **launch** key, and every launch key carries a spend cap: a
per-campaign cap and a monthly cap, set in dollars when the key is made. A
go-live above a cap, or from a key with no cap at all, is held: the tool
answers `status: "approval_pending"`, and the account owner gets one email
with one Approve link, good for seven days. Nothing spends until they click.
The rule lives on the server, in the key, so no agent can loosen it. A
**test** key runs every step with nothing charged, and its go-live answers
say `test_mode: true`.

## Configuration

| Variable | Purpose |
|---|---|
| `ATRIUM_API_KEY` | Required. Created under Developers › API, shown once. |
| `ATRIUM_API_URL` | Optional. Defaults to `https://app.atrium.run`; the plugin talks to its `/api/mcp`. Must be https (http only for localhost). |

Keep the key in your shell environment. Never commit it.
