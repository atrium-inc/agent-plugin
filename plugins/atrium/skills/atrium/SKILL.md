---
name: atrium
description: Working with Atrium — TV and streaming advertising, campaigns, leads and products. Use whenever the user mentions Atrium, asks about their TV or CTV campaigns, their ad spend, the leads their advertising produced, or wants to plan a commercial.
---

# Atrium

Atrium is a lead-generation platform for television. An advertiser describes
what they sell, Atrium makes the commercial, buys streaming and broadcast
inventory on the Atrium Performance Network, and measures the calls, texts and
bookings that come back.

## What the tools here can and cannot do

Read: `atrium_whoami`, `atrium_list_campaigns`, `atrium_list_leads`,
`atrium_list_products`. Write: `atrium_add_product` only.

**Nothing here launches a campaign or moves money.** That is deliberate, not an
oversight — spending an advertiser's budget is a decision a person makes while
looking at the price. If the user asks you to launch, say plainly that launching
happens in the product and point them at
`https://app.go-atrium.com/campaigns`.

## The order to do things in

Almost every real question starts the same way:

1. `atrium_whoami` — confirm which advertiser you are acting for. Getting this
   wrong is worse than any other mistake here: an agency can have several, and
   advice built on the wrong one is confidently useless.
2. `atrium_list_products` — what they actually sell. Never propose a commercial
   around an offer that is not on this list without saying you are inventing it.
3. Then the question they asked.

## Reading results honestly

- `atrium_list_leads` returns `truncated: true` when there is more than one
  page. Say "at least N" rather than "N" when it does.
- A campaign in `draft` has never delivered. Zero leads against a draft is not
  underperformance, it is a campaign that was never launched — say so instead of
  analyzing it.
- Prices and budgets are **cents**. `18000` is `$180.00`. Format for the human;
  never do arithmetic on a formatted string.
- A brand-new campaign may legitimately have no numbers yet. Report that as "too
  early", not as zero.

## Related skills

- `setup` — connecting an account, and what each auth error means.
- `buying-tv` — how the supply tiers work and how to size a budget. Read it
  before recommending where a campaign should run.
