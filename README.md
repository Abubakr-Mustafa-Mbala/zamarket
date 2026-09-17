# ZaMarket

A Zambian multi-vendor marketplace with a commerce operating system underneath: founder products, vendors, resellers, orders, stock, landed cost, offers, commissions, payouts, and profit.

Stack: React (Vite) + Supabase + Netlify. No server to maintain — all business rules live in the database (`supabase/schema.sql`), so they can't be bypassed from the browser.

---

## Deploy (works entirely from a phone)

### 1. Supabase
1. Create a project at supabase.com.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and press **Run**. It's safe to run again later.
3. Go to **Authentication → Sign In / Providers → Email**. For testing, turn **Confirm email** off (turn it back on before launch).
4. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. GitHub (upload the zip, let Codespaces unpack it)
1. Create a new empty repository (tick "Add a README" so it isn't blank).
2. **Add file → Upload files** → upload `zamarket.zip` → **Commit changes**.
3. **Code → Codespaces → Create codespace on main**.
4. Paste this into the Codespaces AI chat:

   > Unzip zamarket.zip in the repository root. Move everything inside the extracted "zamarket" folder up to the repository root, so package.json, index.html, netlify.toml, src/ and supabase/ sit at the top level. Delete zamarket.zip, the empty zamarket folder, and any node_modules or dist folders. Then commit with the message "ZaMarket initial build" and push to main.

5. Back on the repo page, check that `package.json` and the `src` folder are at the top level.

### 3. Netlify
1. **Add new site → Import from GitHub** → pick the repo. Build command and publish folder are read from `netlify.toml`.
2. **Site configuration → Environment variables**, add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
3. **Deploys → Trigger deploy**.
4. In Supabase **Authentication → URL Configuration**, set **Site URL** to your Netlify address.

### 4. First login
Open `/login` and create an account. **The first account ever created becomes the founder.** Resellers and vendors sign up and apply on one form at `/apply/reseller` or `/apply/vendor` — customers don't need an account to order. Everyone after that starts as a customer. Add your co-founder or staff from **Team**.

---

## Daily flow

1. Customer orders on the site (or you record a WhatsApp/phone sale with **Record a sale**). Payment is pending.
2. You see it on the dashboard → call the customer → **Confirm**.
3. Outside Lusaka District? Set the delivery fee on the order after the call.
4. **Record payment** → Processing → Out for delivery → Delivered → **Completed**.
5. On completion, stock moves to sold, the reseller's commission and the vendor's payout are created automatically.
6. After the 24-hour grace period, pay people from **Finance → Who we owe**, then mark them paid.

## I bought goods (setting prices)

Home → **I bought goods**. Four short steps:

1. **What did you buy?** Type the name and take a photo — or tap something you already sell to restock it.
2. **How many, and what did you pay?** Price for each one, or the total. Any broken ones.
3. **Other costs.** Shipping, transport, storage/rent, anything else, and what you spend each time you sell one (bag, fuel, airtime). It shows what each one really cost you.
4. **Choose your price.** Three suggestions — small, good, big profit — or type your own. For any price it shows what you keep per item and in total if all sell, **when you sell it** and **when a reseller sells it**. It warns you if a price loses money.

Tap Save and the stock, cost and price are recorded together, and the product appears in the shop for customers and resellers. Restocking averages the new cost with your old stock.

Suggested prices protect your profit even when a reseller sells. "Good profit" follows the target in Settings; the other two are below and above it.

Purchases and Suppliers (for supplier credit and multi-product orders) are under Advanced mode.

## Pricing new stock ("I bought goods")

Enter what you bought, how many, what you paid, and every other cost (shipping, transport, storage/rent, anything else, plus what you spend per sale). The system works out what each one really cost you, then shows:

- **Minimum price** for your profit target on top of cost (default 50%, set in Settings, changeable per product). 50% on K1,100 = K1,650.
- **Minimum with resellers** — the price that still gives you 50% after the reseller's cut.
- **What you keep per item and in total if all sell**, side by side for when you sell it and when a reseller sells it, with warnings if a price falls under your target.

## Offers

Build offers in **Offers**. Each shows profit per deal and a preview of what customers see.

- **Product page:** Buy X get Y, bundles, % or K off, limited-time prices, free gifts and repeat-order prices appear as offer cards with a "Take this offer" button. Free delivery and deposit plans show as a note.
- **Checkout:** order bumps and upgrades appear as "Add" suggestions.
- **Cart:** a downsell appears only when someone removes that product.
- **Prices are set by the database, not the browser.** Offer dates and unit limits are enforced at checkout, units are given back if an order is cancelled, and offers below the price floor can't go live without a founder override and a reason.
- Manual sales (WhatsApp, phone) can apply an offer too.

## Receipts

Open any order → **Print receipt** (also **Delivery note** in Deliveries). Choose 58mm, 80mm or A4 and press Print. It shows items, offers, delivery, payments, balance due for cash-on-delivery, and signature lines.

To print from your phone on a Bluetooth thermal printer, install a print-service app such as RawBT (Android), pair the printer, then use Print → choose the printer. Set your business name, phone and footer in **Settings**.

## Key rules built in

- **Every sale is an order.** Online checkout and manual sales use the same `place_order` function.
- **Source, channel and seller are separate fields.** A reseller link sets seller = reseller; channel is where the sale happened.
- **Delivery zone.** Lusaka District gets the standard fee automatically. Everywhere else can still order; the fee is marked "pending" until you confirm it by phone.
- **Commissions** use the product's own rate if set, otherwise the global default (Settings). Percentage or flat.
- **Vendor split.** Settings → "Where the reseller commission comes from". *Out of the fee*: with a 20% fee and 10% commission, a K500 sale pays the vendor K400, the reseller K50, and the marketplace keeps K50 (the spec's example). *On top*: the vendor pays the fee and the commission.
- **Commission lifecycle:** Pending → Verified (only after grace period) → Approved → Paid. Cancel/refund/return reverses unpaid commissions and payouts.
- **Self-purchase flag:** if a reseller's phone matches the customer's, the commission is created as rejected.
- **Nothing financial is deleted.** Orders, payments, commissions and payouts can't be deleted — only cancelled or reversed.
- **Audit log** records price, commission, fee, status, stock, payment and settings changes.
- **Vendors** can only *request* cancellation. They can't publish products, change published prices, or see other vendors' data.
- **Founder money** (contributions/withdrawals) is tracked separately from revenue and expenses.

## State machines

**Order:** pending → confirmed / payment_pending / customer_unreachable / fraud_review → paid → processing → ready_for_dispatch → out_for_delivery → delivered / failed_delivery → completed. Cancel allowed until completion; completed/delivered can go to returned or refunded. Enforced in `order_transition_allowed()`.

**Payment:** pending → confirmed (part paid) → paid → refunded.
**Commission:** pending → verified → approved → paid; or rejected / reversed.
**Vendor payout:** pending → eligible → approved → paid; or cancelled.
**Product:** draft → submitted → published; or rejected; published ↔ out_of_stock (automatic); suspended.
**Vendor / reseller application:** pending → approved / rejected; approved → suspended → terminated.
**Offer:** draft → active → paused / expired → archived. Below the price floor needs a founder and a recorded reason.
**Purchase:** draft → ordered → paid → in_transit → received (adds stock, sets landed cost).
**Delivery:** fee_pending / fee_confirmed → assigned → out_for_delivery → delivered / failed → returned.

## Stock and cost

- Stock enters through **Purchases → Receive stock**. Shipping, transport and other costs are spread across items by value and divided by sellable units (received − damaged). Example: 100 × K60 + K600 extras, 3 damaged → **K68.04/unit**.
- Placing an order reserves founder stock; completing it marks it sold; cancelling releases it.
- Manual adjustments need a reason and are logged.

## Roles

| Role | Can see / do |
|---|---|
| Founder | Everything, including approvals, team, settings, founder money, audit |
| Ops / Finance / Delivery | Staff dashboard (orders, products, stock, money). Founder-only pages are hidden. |
| Reseller | Own sales, commissions, selling kits, referral link, record own sales |
| Vendor | Own products, orders containing their products, own payouts and reviews |
| Customer | Shop, apply to become reseller or vendor |

Row-level security in Supabase enforces this, not just the menu.

## Project layout

```
supabase/schema.sql        database, rules, state machines, security
src/lib/economics.js       landed cost, margin vs markup, simulator, offer economics
src/lib/auth.jsx           session handling (fixes the login-bounce bug)
src/pages/public/          store, product, cart, checkout, login, applications
src/pages/admin/           founder operating system
src/pages/reseller/        reseller portal
src/pages/vendor/          vendor portal
```

## Built now vs later

**Built now:** marketplace, catalog, checkout with pending payment, orders, manual sales, founder dashboard, product economics, pre-purchase simulator (bad/expected/good, BUY/TEST/DO NOT BUY), inventory, purchases with landed cost, suppliers, offer engine with price floor, reseller applications, referral links, selling kits, commissions, vendor applications, vendor products approval, vendor payouts, customer database, deliveries, reviews with verified purchase, expenses, founder money, marketing spend by source, reports, roles, audit log, simple/advanced mode.

**Architected for later (tables/columns exist, automation doesn't):**
- Airtel Money / MTN Money merchant payments — add a Netlify function that verifies the payment and calls `record_payment`. Payment methods and the `payments.reference` field already exist.
- Automatic commission verification after 24h (a scheduled Supabase function calling `set_commission_status`).
- Automated payouts, advanced fraud scoring, lead nurturing / follow-up messages, investor module, GPS delivery, tiered commissions, product variants.

## Photos

Products take image links. Easiest: Supabase **Storage → New bucket** (public) → upload → copy the public URL → paste into the product.

## Backups

Supabase takes daily backups on paid plans. On the free plan, export regularly from **Database → Backups** or run a `pg_dump`.
