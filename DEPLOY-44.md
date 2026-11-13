# ZaMarket update 44: checked and fixed on top of your v46

## 1. SQL (two files, in order)
1. zamarket-sql-part-1-of-2.sql -> Run, wait for Success
2. zamarket-sql-part-2-of-2.sql -> Run
Everything up to now, plus the academy code (section 23). Safe to run again
even if you ran earlier versions of these two files.

## 2. Code
Upload the zip to GitHub and deploy as usual. It replaces the whole repository.

New files
- supabase/migrations/20261112_academy_code_REVIEW.sql

Replaced files (compared with your v46)
- src/components/storefront/VendorStorefront.css
- src/components/storefront/VendorStorefront.jsx
- src/lib/cart.jsx
- src/lib/productPoster.js
- src/pages/admin/Partners.jsx
- src/pages/public/Marketplace.jsx
- src/pages/reseller/Training.jsx
- src/refinements.css
- supabase/run-in-supabase.sql
- tests/departmentShelves.test.mjs
- tests/frontPagePick.test.mjs
- tests/storefrontAndFund.test.mjs

## 3. After deploying
- Settings > Vendors and affiliates: put the Al-Halaqa link in
  "Link to the academy where affiliates are trained" (the full https address).
- Affiliates > open an approved affiliate > "Academy code (from Al-Halaqa)":
  paste the code you created for them in Al-Halaqa, then Save.
- Marketing > Front page: choose the products that should lead the home page.
