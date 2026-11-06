# Update 28 — coupons

The whole project, not a patch. Contains updates 22 through 27 plus the
coupon work.

## Order

1. Run `supabase/run-in-supabase.sql` in the Supabase SQL editor.
   15 sections now, safe to run more than once. Sections you have already
   run (including the `public_offers` hotfix, section 14) change nothing.
2. Upload the zip, extract over the repo, `npm install`, `npm run build`,
   commit, push.
3. Remove and re-add the home-screen app so Android picks up the new icon.

## What was actually wrong with coupons

The coupon system was *mostly already built* — the table, the funding
split, the admin screen, and the apportionment of a discount across order
lines at settlement. What was missing was the parts that make it work and
the parts that make it safe.

**Nobody could use a coupon at all.** `place_order` read
`payload->>'coupon'`, and nothing in the app ever sent it. There was no
coupon field at checkout. Added, with live validation so the total on
screen is the total the database will charge. The page sends only the
code — never an amount — so a customer cannot invent a discount.

**`per_customer_limit` was stored but never read.** One person could use
the same coupon over and over until the overall `usage_limit` ran out.
Now enforced, matched by phone number.

**No way to give a coupon to specific people.** Every coupon was a public
code. There is now a recipient list: on the founder's coupon screen you
can paste phone numbers, one per line, with a name after a comma. Only
those people can use the code, whoever else gets hold of it.

**A founder could spend a seller's money without asking.** A coupon the
founder writes against a seller now saves as `awaiting_vendor`: it is
dead, no customer can use it, and it cannot be switched on by editing it.
It appears on that seller's new Coupons page, and on their home screen,
with what it will cost them. It only starts working once they accept.
A seller creating their own coupon has agreed to it by making it.

**The percentage-fee settlement path ignored discounts entirely.** There
are two settlement paths. The `vendor_take_home` path already charged the
discount to whoever funded it. The other path — taken whenever a vendor
product has no `vendor_price` recorded — ignored `o.discount` completely.
The customer paid the discounted total but the seller was settled on the
full amount, so ZaMarket silently absorbed every discount on those lines,
including ones the seller had agreed to fund. Both paths now behave the
same way.

**The confirmation screen showed the wrong total.** `place_order` returned
`'total', sub + fee`, with the discount left out. The order row was right,
but that returned number is what `Checkout.jsx` prints on the confirmation
page and reports as the purchase value, so anyone using a coupon was told
they had paid full price.

**A loss ZaMarket chose to take was hidden.** `marketplace_fee` was
floored at zero on one path. When ZaMarket funds a discount bigger than
its margin on a line, the honest figure is negative — it is paying the
seller more than the customer paid. Flooring it made the row fail to add
up (gross 73, seller 90, ZaMarket 0) and hid the subsidy. It now records
the real number. **Expect to see negative marketplace fees on orders where
you funded a large discount. That is correct.** The seller is paid their
agreed take in full either way; this only changes what the record says you
earned.

## Proof

31 money rules run against a real Postgres built from nothing, including:

- a seller-funded discount comes off the seller's net; ZaMarket keeps its fee
- a ZaMarket-funded discount leaves the seller whole and comes off ZaMarket's share
- `gross = net + fee + commission` on every settlement row, both paths
- a targeted coupon works for the named person and is refused for anyone else
- the same person cannot use a one-per-person coupon twice; a different person can
- a seller-funded coupon is refused until accepted, and after being declined
- a seller's coupon is refused on another seller's basket
- minimum order, expiry, not-yet-started, fully-used and over-the-basket caps
- a huge discount never produces a negative payout

211 unit tests pass (206 before this change).

## Nothing else moved

No change to product pricing, delivery fees, commission rates, vendor
payout percentages, category organisation or corporate lunch services.
