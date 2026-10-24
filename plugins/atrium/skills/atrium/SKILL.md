---
name: atrium
description: Working with Atrium, TV and streaming advertising, campaigns, leads and products. Use whenever the user mentions Atrium, asks about their TV or CTV campaigns, their ad spend, the leads their advertising produced, or wants to plan a commercial.
---

# Atrium

Atrium is TV advertising for everyone: premium and local television, made fast, easy, and affordable. An advertiser describes
what they sell, Atrium makes the commercial, buys streaming and broadcast
inventory on the Atrium Performance Network, and measures the calls, texts and
bookings that come back.

## What the tools here can do

Plan and price: `atrium_whoami`, `atrium_list_advertisers`, `atrium_list_networks`,
`atrium_estimate`, `atrium_list_products`. Build: `atrium_add_product`,
`atrium_list_creatives`, `atrium_add_creative`, `atrium_get_creative`,
`atrium_create_campaign`, `atrium_update_campaign`. Launch: `atrium_launch_check`,
`atrium_go_live`, `atrium_pause_campaign`, `atrium_resume_campaign`. Results:
`atrium_list_campaigns`, `atrium_get_campaign`, `atrium_delivery`,
`atrium_delivery_breakdown`, `atrium_list_leads`. Tidy up:
`atrium_archive_campaign`, `atrium_archive_creative`, `atrium_archive_product`.

The tools come live from Atrium's hosted server every session, so their
descriptions are current. Where this file and a tool's description disagree,
the description wins.

Every advertiser tool takes `advertiser_id`, products included: `atrium_whoami`
gives it for an advertiser key (`advertiser.id`), and `atrium_list_advertisers`
gives an agency key its clients' ids.

**Money moves only under a launch key, and only under its cap.** A go-live
above the key's spend cap, or from a key with no cap, is held until the
account owner approves it by email. That rule lives on the server; you cannot
loosen it, and you should not try to route around it. Read `buying-a-campaign`
before launching or archiving anything.

## The order to do things in

Almost every real question starts the same way:

1. `atrium_whoami`: confirm which advertiser you are acting for, and what the
   key may do. Getting this wrong is worse than any other mistake here: an
   agency can have several advertisers, and advice built on the wrong one is
   confidently useless.
2. `atrium_list_products` with that `advertiser_id`: what they actually sell.
   Never propose a commercial around an offer that is not on this list without
   saying you are inventing it.
3. Then the question they asked.

## Reading results honestly

- `atrium_list_leads` pages like every list: when `has_more` is true, pass
  `next_cursor` back as `cursor`, with the same `days`, for the next page. Page
  to the end before giving a count; if you stop early, say "at least N", not "N".
- A go-live or resume answer with `test_mode: true` came from a test key:
  nothing changed. It is a rehearsal, never "your campaign is live".
- A campaign in `draft` has never delivered. Zero leads against a draft is not
  underperformance, it is a campaign that was never launched. Say so instead of
  analyzing it.
- Prices and budgets are **cents**. `18000` is `$180.00`. Format for the human;
  never do arithmetic on a formatted string.
- A brand-new campaign may legitimately have no numbers yet. Report that as "too
  early", not as zero.

## Related skills

- `setup`: connecting an account, and what each auth error means.
- `buying-tv`: how the supply tiers work and how to size a budget. Read it
  before recommending where a campaign should run.
- `buying-a-campaign`: the end-to-end path: price, draft, check, go live,
  report, archive. Read it before creating, launching or archiving anything.
