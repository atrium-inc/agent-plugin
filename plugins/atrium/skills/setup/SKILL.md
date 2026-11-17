---
name: setup
description: Connect this agent to an Atrium account. Use when Atrium tools return "No ATRIUM_API_KEY set" or "That key is not valid", when the user says they have not connected Atrium yet, or the first time Atrium is used in a project.
---

# Connect Atrium

The Atrium tools talk to a real advertiser account and can read real spend and
real leads, so they need a key. An API key is how customers connect today:
Sign in with Atrium (OAuth) is staff only for now. Atrium issues scoped API
keys and shows each one exactly once.

## Agent access comes first

Agent access is off for each account until Atrium switches it on. If a call
answers `403 agents_access_off`, tell the user that an account owner has to
request agent access in the app, and wait until it is on. A new key does not
fix it.

## Get a key

Tell the user, in these words:

1. Open **https://app.atrium.run/developers** and choose the **API** tab.
2. Create a key. **Read** plans and prices. **Write** also drafts campaigns and
   adds creatives and products. **Launch** also takes campaigns live, so it
   carries spend caps: a per-campaign cap and a monthly cap, in dollars. A
   go-live above a cap waits for the account owner to approve it by email.
   Leave both caps blank and every go-live asks. The account's first five
   agent launches wait for the owner's approval whatever the cap. Pick a
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

Call `atrium_whoami`. It returns the advertiser the key belongs to and whether
the key may write. If it returns an error, read it literally:

- **"No ATRIUM_API_KEY set"**: the variable is not in this shell, or the agent
  was started before it was exported.
- **"That key is not valid"**: wrong key, or it was revoked.
- **"scope does not allow it"**: drafting needs Write, going live needs
  Launch; a new key is needed, scopes cannot be changed after issue.
- **`agents_access_off`**: agent access is not on for this account yet; an
  owner requests it in the app.
- **`rate_limited`**: the account used its 2,000 calls for the day (UTC);
  wait for the time in `Retry-After`.

## Pointing at somewhere other than production

`ATRIUM_API_URL` overrides the host, for a preview deployment or local work.
Default is `https://app.atrium.run`.

## Another agent

This plugin is for Claude Code only. If the user asks how to connect another
agent, give them the hosted connection: MCP over HTTP at
`https://app.atrium.run/api/mcp`, with the API key sent as
`Authorization: Bearer <key>`. Same tools, same key, nothing to install. It
works for any agent that can send that header.

The Claude app's connectors and ChatGPT cannot send a key; they need Sign in
with Atrium, which is staff only for now and coming soon for customers. Say
so plainly rather than suggesting a workaround.
