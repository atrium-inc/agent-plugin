# Atrium agent plugin

Buy television from your coding agent. Plan, inspect and measure campaigns on
the Atrium Performance Network from Claude Code, Codex or Cursor.

```
/plugin marketplace add atrium-inc/agent-plugin
/plugin install atrium@atrium
```

Then run the bundled **setup** skill — it walks through creating an API key at
[app.go-atrium.com/developers](https://app.go-atrium.com/developers) and
exporting it.

## What it gives the agent

**Tools** — `atrium_whoami`, `atrium_list_campaigns`, `atrium_list_leads`,
`atrium_list_products`, `atrium_add_product`.

**Skills** — `setup` (connect an account), `atrium` (how the product fits
together, and how to read its numbers honestly), `buying-tv` (how the supply
tiers work, how to size a budget, and the mistakes that cost money).

The skills are the point. Wrapping an API in tools lets an agent *call* Atrium;
the skills are what make it good at buying television.

## What it deliberately will not do

Launch a campaign, or move money. Every write stages something a person approves
in the product — the same rule the in-app assistant follows. An agent that can
spend a budget without anyone looking at the price is not a feature.

## Configuration

| Variable | Purpose |
|---|---|
| `ATRIUM_API_KEY` | Required. Created under Developers › API, shown once. |
| `ATRIUM_API_URL` | Optional. Defaults to `https://app.go-atrium.com`. |

Keep the key in your shell environment. Never commit it.
