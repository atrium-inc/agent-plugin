---
name: buying-tv
description: How Atrium's TV supply is organized and how to size a budget. Use before recommending where a campaign should run, which tier to pick, what a budget will actually deliver, or when the user asks what networks they can advertise on.
---

# Buying TV on the Atrium Performance Network

The judgment in this file is the part that is hard to get right, and it is the
reason a general agent gives worse advice about television than this one should.
Read it before recommending supply or a budget.

## The four tiers

An advertiser picks a tier, not a list of channels. Four logos is a decision a
person can make; twenty is a research project.

| Tier | What it is | Who it suits |
|---|---|---|
| **Premium** | Top-tier streaming and premium originals — Disney+, Max, Paramount+, Peacock, Hulu | Brand-building, higher CPM, best when the offer is aspirational or the category is crowded |
| **Local** | Local broadcast and regional news in the advertiser's own DMAs — the big-four affiliates | Service businesses. A roofer in Mobile needs Mobile, and local news skews to homeowners who answer the phone |
| **Blended** | Premium reach plus local coverage | **The default.** Recommend this when the advertiser has not run TV before |
| **Auto** | Atrium chooses from budget and live performance | Someone who says "you pick", or a budget too small to split sensibly |

Two facts that keep advice honest:

- **Local means the big four**: FOX, ABC, NBC, CBS affiliates. It does not mean
  national cable. FOX News is a different product from a local FOX affiliate and
  costs differently — never treat them as the same thing.
- **Do not promise station groups.** TEGNA and Scripps come up constantly in
  conversation, and the linear catalog carries almost no TEGNA and puts Scripps
  outside the linear tier. Promising group coverage we cannot buy is the fastest
  way to lose a customer's trust.

## Always quote live counts, never remembered ones

Tier sizes move as supply changes. The product pulls them from the live catalog
at the moment it answers. If you state a number of stations or apps, it must
come from a tool call in this conversation — not from this file, and not from
memory. "Local covers hundreds of stations" is safe; a specific figure you did
not just fetch is not.

## Sizing a budget

Work in **cents** everywhere; the API does.

Impressions ≈ (budget ÷ CPM) × 1000. Atrium bids at roughly the 90th percentile
of the real CPMs in the selected supply, so a tier with one expensive outlier
does not price the whole buy.

Three sanity checks before you propose a number:

1. **Is it enough to be seen?** A budget spread thin across national premium
   inventory buys a handful of impressions per household and teaches the
   advertiser that TV does not work. Narrow the geography before lowering the
   ambition.
2. **Does the flight make sense?** Budget divided by days is what actually runs.
   A four-week flight on a small budget can fall below the point where anyone
   sees the spot twice.
3. **Is there an offer worth running?** Check `atrium_list_products`. TV that
   points at nothing specific produces impressions and no calls.

## Pixels: two kinds, and using the wrong one fails silently

- A **conversion** pixel measures an action.
- A **remarketing** pixel accumulates an audience you can advertise to again.

They are different objects. Retargeting off a conversion pixel reaches nobody
and reports zero — no error, just an empty campaign. If the user wants to
re-reach visitors, they need a remarketing pixel, and it must have been
collecting for a while before there is anyone in it.

## What good advice sounds like

Name a tier and say why *for this business*, in one sentence, then give the
numbers. "Blended, because you are a service business that needs local
credibility but nobody is searching for you yet" beats a table of options every
time. The tiers are the choice; your sentence is the advice.
