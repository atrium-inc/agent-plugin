---
name: buying-a-campaign
description: The playbook for buying TV on Atrium end to end with the tools here. Use whenever the user wants to run, launch, buy, or set up a TV campaign, price a budget, take a draft live, or archive a campaign, creative or product. Read it before calling atrium_create_campaign, atrium_go_live or any archive tool.
---

# Buying a campaign, start to finish

The tools map to one path. Follow it in order; every step exists because the
one after it fails without it.

Every answer is a tool result, success or error, never an HTTP status. Read its
fields: `status` on a success, `error.code` on a refusal.

## 1. Know who you are buying for

`atrium_whoami`. Note the key's scope: `read` can plan and price only, `write`
can draft, `launch` can take a campaign live. An agency key must name an
advertiser on every call; `atrium_list_advertisers` gives the ids. A test key
(`atr_test_`) runs every step for real except the ones that spend.

## 2. Know what they sell and what they have to air

`atrium_list_products` with the `advertiser_id` for the offer; an agency key
reads a client's products the same way. `atrium_list_creatives` for
commercials.

Only a creative with `airable: true` can go on a campaign. `ready` is not
enough: a ready video that is not 15, 30 or 60 seconds, or whose length could
not be read, is not airable. A campaign cannot go live without at least one
airable creative on each strategy.

If there is none, add one with `atrium_add_creative` from a public https video
URL, then poll `atrium_get_creative` about every 5 seconds until `status` is
`ready` or `failed`:

- Processing usually takes a minute or two and **never more than 15 minutes**
  from when it was added. Still processing then, it reads `failed` with
  `processing_timeout`: stop polling and add it again.
- A link whose server does not answer fails within about 20 seconds with
  `source_unreachable`. Ask the customer for a public https link to the video
  file itself.
- A failed creative carries `error.code` and a message naming the link. Say
  what it says.

If they have no video at all, say so: the commercial is made in Atrium Studio,
in the product, not here.

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

`atrium_launch_check`. It says what go-live would say, without doing it:

- `ready` is true when nothing blocks.
- `issues` lists blocks and warnings, each with a `resolution`: the tool that
  fixes it, or `in_app` with the `url` of the screen where the customer fixes
  it (a website on the Brand page, funds on the Wallet page, a text keyword on
  the Chat TV page, a conversion pixel). Hand an in-app fix to the customer
  with its `url`; the message names the screen but carries no link. Fix every
  block, then check again.
- `acknowledgements.outstanding` lists the questions go-live asks:
  `nationwide` (a strategy runs across the whole country), `no_keyword` (no
  text keyword is attached), `no_pixel` (the website has no tracking tag, so
  site leads are not counted). Each is a real choice. Tell the customer what
  it means in one sentence and get a yes before you acknowledge it. Pass the
  answers as `acknowledge` to see them accepted.
- `funds` (with `covered: false`) means the wallet does not cover the budget.
  Only a person can add funds, on the Wallet page.

## 6. Go live

`atrium_go_live` with the acknowledgements the customer agreed to. Read the
result:

- **`status: "live"`** with the `campaign`: it is live. Say when it starts and
  that the wallet is charged as ads air.
- **`status: "approval_pending"`** with `approval`: every check passed, but the
  key's spend cap sends it to the account owner. `approval.message` says why,
  with the amounts (`reason` is `no_cap`, `campaign_cap` or `monthly_cap`). The
  owner has one email with an Approve link that lasts seven days
  (`approval.expires_at`). Tell the customer exactly that, with the budget.
  Nothing spends until the owner approves. Poll `atrium_get_campaign` for
  `status: active` if they want to wait. Do not go live again to "retry": that
  only replaces the pending request with a new email.
- **An error result.** `error.code` says which:
  - `launch_blocked`: `error.issues` lists every block, each with its
    `resolution`. Fix them, run the launch check, then go live again.
  - `needs_acknowledgement`: `error.required` names the questions still
    unanswered. Ask the customer; never answer for them.
  - `insufficient_funds`: the wallet does not cover the budget, counting what
    its other live campaigns still have to spend. Only a person can add funds.
  - `already_live`, `not_live` (it has ended) or `archived`: nothing to fix.
    Say so.
  - Anything else: read `error.message`; it says what to fix.
- **`test_mode: true`** on any of these: a test key got exactly the answer a
  live key would, and nothing changed. No campaign went live, no approval was
  held, no email was sent. Call it a rehearsal.

Success and the `launch_blocked`, `needs_acknowledgement` and
`insufficient_funds` refusals carry `acknowledgements: { accepted, outstanding }`.

`atrium_resume_campaign` answers the same way (`status: "live"`, or
`needs_acknowledgement` or `insufficient_funds`), and never waits on the spend
cap. `atrium_pause_campaign` stops spending at once.

Never call go-live without a launch check first, and never acknowledge a
warning the customer did not agree to.

## 7. Report back

`atrium_delivery` for what ran and what it cost, `atrium_delivery_breakdown`
for where, `atrium_list_leads` for what came back. Leads page with a cursor:
when `has_more` is true, pass `next_cursor` back as `cursor`, with the same
`days`. Data lags about a day. A campaign that went live today has no numbers
yet; say "too early", not zero.

## 8. Tidy up: archiving

Archiving cannot be undone over the API. Confirm with the customer every time,
naming the thing by name.

- **`atrium_archive_campaign`**: a draft, or a campaign that has ended. Never a
  live one, and never a paused one that has launched (it can still be resumed);
  those are refused with the reason. To stop spending, pause; archiving is not
  for that. An archived campaign drops out of `atrium_list_campaigns`, cannot be
  changed or go live, and still reads by id with `archived_at`, so an ended
  campaign keeps its delivery history.
- **`atrium_archive_creative`**: a creative that failed or will not be used.
  Refused with `creative_in_use` while it is on a campaign that has not ended
  (the message names the campaign), or while it is still processing.
- **`atrium_archive_product`**: a product or service the advertiser no longer
  sells. It is switched off, so the text assistant stops offering it.

Lists leave archived items out. Pass `include_archived: true` to
`atrium_list_campaigns`, `atrium_list_creatives` or `atrium_list_products` to
see them.

## What to say when asked to spend

Every launch runs the same checks a person gets in the Atrium app, and the key's
spend cap decides whether the owner looks first. You cannot loosen either.
If the customer wants a higher cap, that is set on the Atrium Developers page
by an owner or admin, not here.
