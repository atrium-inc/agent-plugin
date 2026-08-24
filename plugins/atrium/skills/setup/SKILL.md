---
name: setup
description: Connect this agent to an Atrium account. Use when Atrium tools return "No ATRIUM_API_KEY set" or "That key is not valid", when the user says they have not connected Atrium yet, or the first time Atrium is used in a project.
---

# Connect Atrium

The Atrium tools talk to a real advertiser account and can read real spend and
real leads, so they need a key. There is no OAuth — Atrium issues scoped API
keys and shows each one exactly once.

## Get a key

Tell the user, in these words:

1. Open **https://app.go-atrium.com/developers** and choose the **API** tab.
2. Create a key. Pick **Read** unless they specifically want the agent to add
   products — **Write** is only needed for `atrium_add_product`.
3. Copy it immediately. Atrium shows a key once and stores only a hash; if it is
   lost, the only fix is to revoke it and make another.

## Set it

The key belongs in the environment, never in a file inside the repo:

```bash
export ATRIUM_API_KEY="atr_live_…"
```

To persist it, add that line to `~/.zshrc` or `~/.bashrc`. **Never** write it
into `.env`, `CLAUDE.md`, or anything git tracks — a live key in a commit is a
live key in every clone.

The MCP server reads the variable at startup, so the agent has to be restarted
after setting it.

## Check it worked

Call `atrium_whoami`. It returns the advertiser the key belongs to and whether
the key may write. If it returns an error, read it literally:

- **"No ATRIUM_API_KEY set"** — the variable is not in this shell, or the agent
  was started before it was exported.
- **"That key is not valid"** — wrong key, or it was revoked.
- **"read-only"** on a write — the key has the Read scope; a new key is needed,
  scopes cannot be changed after issue.

## Pointing at somewhere other than production

`ATRIUM_API_URL` overrides the host, for a preview deployment or local work.
Default is `https://app.go-atrium.com`.
