---
name: buying-a-campaign
description: The playbook for buying TV on Atrium end to end with the tools here. Use whenever the user wants to run, launch, buy, or set up a TV campaign, price a budget, or take a draft live. Read it before calling atrium_create_campaign or atrium_go_live.
---

# Buying a campaign, start to finish

The tools map to one path. Follow it in order; every step exists because the
one after it fails without it.

## 1. Know who you are buying for

`atrium_whoami`. Note the key's scope: `read` can plan and price only, `write`
can draft, `launch` can take a campaign live. An agency key must name an
advertiser on every call; `atrium_list_advertisers` gives the ids. A test key
(`atr_test_`) runs every step for real except the ones that spend.

## 2. Know what they sell and what they have to air

`atrium_list_products` (advertiser keys) for the offer. `atrium_list_creatives`
for commercials. A campaign cannot go live without at least one creative whose
status is `ready` and `airable` is true. If there is none, add one with
`atrium_add_creative` from a public video URL and poll `atrium_get_creative`
until it is ready. If they have no video at all, say so: the commercial is made
in Atrium Studio, in the product, not here.

## 3. Price it before you draft it

`atrium_estimate` with the exact strategy you intend to draft. It returns the
audience range, the TV ads and households the budget buys, the CPM range, and
which side is the ceiling. Read `buying-tv` for how to choose the tier and size
the budget.

Show the customer the estimate in their own units before drafting: "$2,500 over
30 days in Georgia on blended supply buys roughly 130,000 to 180,000 TV ads,
reaching about 37,000 to 51,000 households." Say it is an estimate. Never quote
a number you did not just fetch.

If `limited_by` is `budget`, the budget runs out before the audience does, which
is normal. If it is `targeting`, the budget is bigger than the audience can
absorb: widen the geography or lower the budget rather than overpaying for
frequency.

## 4. Draft it

`atrium_create_campaign` with the same strategy. It comes back as a `draft`.
Nothing airs and nothing is charged. Fix anything the API refuses: unknown
network names come from `atrium_list_networks`, and a strategy on local
stations cannot be nationwide.

## 5. Check it

`atrium_launch_check`. Three kinds of answer:

- A `block` issue stops go-live. Fix it: attach a ready creative, set a
  landing page in the product, add funds, and so on. Then check again.
- `acknowledgements_required` lists the warnings go-live will ask about:
  `nationwide`, `no_keyword`, `no_pixel`. Each is a real choice. Tell the
  customer what each means in one sentence and get a yes before you
  acknowledge it.
- `funds.covered: false` means the wallet does not cover the budget. Only a
  person can add funds, in the product.

## 6. Go live

`atrium_go_live` with the acknowledgements the customer agreed to. Three answers:

- **200, the campaign is live.** Say when it starts and that the wallet is
  charged as ads air.
- **202, `approval_pending`.** The key is above its spend cap, or has no cap,
  so the account owner has an email with one Approve link. Tell the customer
  exactly that, including the budget and that the link lasts seven days.
  Nothing spends until the owner clicks. Poll `atrium_get_campaign` for
  `status: active` if they want to wait. Do not go live again to "retry":
  that only replaces the pending request with a new email.
- **An error.** Read its message; it says what to fix.

Never call go-live without a launch check first, and never acknowledge a
warning the customer did not agree to.

## 7. Report back

`atrium_delivery` for what ran and what it cost, `atrium_delivery_breakdown`
for where, `atrium_list_leads` for what came back. Data lags about a day. A
campaign that went live today has no numbers yet; say "too early", not zero.

## What to say when asked to spend

Every launch runs the same checks a person gets in the Atrium app, and the key's
spend cap decides whether the owner looks first. You cannot loosen either.
If the customer wants a higher cap, that is set on the Atrium Developers page
by an owner or admin, not here.
