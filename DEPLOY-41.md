# ZaMarket update 41

This one zip contains everything since update 38 (updates 39, 40 and 41).
The database part is TWO files. Run them in order in the Supabase SQL editor.

## 1. SQL (do this first)
1. zamarket-sql-part-1-of-2.sql  -> paste, Run, wait for "Success"
2. zamarket-sql-part-2-of-2.sql  -> paste, Run, wait for "Success"

Both are safe to run again if you are unsure whether one went through.
Together they are the same as supabase/run-in-supabase.sql (21 sections).

## 2. Code
Upload the zip to GitHub and deploy as usual. It replaces the whole repository.

New files
- netlify/functions/ai-assist.js
- src/components/NameHelp.jsx
- src/components/storefront/VendorStorefront.jsx
- src/components/storefront/VendorStorefront.css
- src/lib/aiAssist.js
- src/lib/pendingApplication.js
- src/lib/phone.js
- src/lib/productName.js
- src/pages/admin/DeliveryFund.jsx
- src/pages/admin/Recovery.jsx
- src/pages/public/Recover.jsx
- supabase/migrations/20261111_delivery_fund_REVIEW.sql
- supabase/migrations/20261111_winners_recovery_proposals_REVIEW.sql
- tests/applyAndDashboards.test.mjs
- tests/storefrontAndFund.test.mjs
- tests/update40.test.mjs

Replaced files
- netlify/edge-functions/seo.js
- src/App.jsx
- src/components/PayoutRequest.jsx, src/components/PriceMaths.jsx, src/components/Shell.jsx
- src/giveaway-premium.css, src/refinements.css, src/styles.css
- src/pages/admin/Products.jsx, src/pages/admin/Receipt.jsx, src/pages/admin/Setup.jsx
- src/pages/marketing/Giveaways.jsx, src/pages/marketing/Leads.jsx
- src/pages/public/AffiliateRecruitment.jsx, src/pages/public/Auth.jsx,
  src/pages/public/Giveaway.jsx, src/pages/public/Marketplace.jsx
- src/pages/reseller/Reseller.jsx
- src/pages/shared/CreativeStudio.jsx
- src/pages/vendor/Vendor.jsx
- supabase/run-in-supabase.sql
- tests/brandAssets.test.mjs

## 3. After deploying, check once
- Admin > Settings > Delivery: the four delivery-fund numbers.
- Admin > Delivery fund: the page opens.
- Any seller's shop: the new storefront.
