# ZaMarket update 43

Built on your V45 (the partner's storefront, Motors fix and delivery message),
with these changes on top:
- Every storefront colour now follows the seller's own theme from My shopfront.
  Shops that never chose one keep the approved violet.
- "Bold" and "Tinted" shops colour the whole page again.
- The seller's cover photo is shown as the store banner (it was at 10%).
- Shop by category is one slim row of small buttons instead of tall boxes.

## 1. SQL (two files, in order)
1. zamarket-sql-part-1-of-2.sql -> Run, wait for Success
2. zamarket-sql-part-2-of-2.sql -> Run
They now include the partner's delivery-message change (section 22).
Safe to run even if you already ran the previous two parts.

## 2. Code
Upload the zip to GitHub and deploy as usual. It replaces the whole repository.

Replaced files since V45
- src/components/storefront/VendorStorefront.jsx
- src/components/storefront/VendorStorefront.css
- supabase/run-in-supabase.sql
- tests/storefrontAndFund.test.mjs
No new files.
