# ZaMarket Vendor Storefront V43 — based on Update 42

## Changes

- **Single Shop by category section.** Removed the duplicate category chips and "Shop by collection" strip.
- **Real categories only.** Category tiles use existing `store_sections` or the product category and a real product photo; no invented photos or illustrated categories.
- **One product catalogue.** Selecting a category filters the product grid; product cards do not appear twice across "featured" and category sections. Products marked featured in the store appear first when browsing all products.
- **Responsive mobile layout.** Two category/product cards per row on phones; four category cards and three product cards per row on larger screens. Preserves the existing responsive header behavior.
- **Store identity.** The store name, logo/initials, location and product count stay in the hero. **No member-since date** is displayed.
- **Optional delivery line.** The store owner or authorized staff can edit **Store delivery message** in **Vendor → My shopfront**. It displays beneath the product count, e.g. `Delivery in Zambia` or `Free delivery in Lusaka` *only when explicitly set*. Empty means no delivery promise shown. It does **not** alter checkout, delivery fees, pricing or the delivery fund. Confirm the real delivery coverage and charges before advertising free delivery.
- The current cart, store sharing, affiliate referral links, product pricing, offer discounts, special vehicle/service sections and vendor themes are retained.

## Install in an existing Codespaces repository

1. Back up or commit your current branch first. **Do not overwrite any newer changes** made after Update 42.
2. Use the **changes-only ZIP** and merge these files with your latest code. The full ZIP is a snapshot based strictly on `zamarket-update-42.zip`.
3. Review and execute **only** `supabase/migrations/20261112_storefront_delivery_message_REVIEW.sql` in Supabase SQL Editor. Do not re-run any previous migrations or the full schema.
4. Redeploy the frontend after the SQL migration. Set **Vendor → My shopfront → Store delivery message** for sellers who have approved delivery arrangements.
5. Run `npm ci`, `npm run check`, and `npm run build` in Codespaces before committing/pushing. No npm dependencies were available for a production build in the build environment where this patch was prepared.
6. Inspect on a real phone and desktop: private/anonymous store page, switching categories, scrolling to products, adding to cart, sharing, and editing the delivery line.

## Validation performed

- `node --test tests/*.test.mjs`: **349/349 passed**.
- JSX syntax parsing with TypeScript transpileModule: **passed** for the two modified JSX files.
- No direct live Supabase SQL execution and no live Netlify deployment were performed.

## Notes

The migration adds the optional `vendors.store_delivery_message` column and appends it to the `public_vendors` view while retaining its security-invoker setting. Public read permission is granted only for this column, not private seller data. Existing values default to NULL, so all current shops continue to work with no new delivery statement until edited.

If the live database's `public_vendors` view differs from Update 42, review that view's definition and adjust the migration rather than replacing newer columns. Do not deploy the frontend before verifying the migration succeeds, or saving an edited shopfront may fail.
