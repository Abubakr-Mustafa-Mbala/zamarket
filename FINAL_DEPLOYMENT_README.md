# ZaMarket — Consolidated Source Package (10 November 2026)

## What this is

A merged source snapshot assembled from:
1. `ZaMarket_Affiliate_Motors_Upgrade_Full_Reference.zip` (itself including the November 8 Journal 2.0 code and earlier vehicle success-fee feature);
2. `ZaMarket_Affiliate_Studio_Redesign_Changes_Only.zip`;
3. `ZaMarket_Affiliate_Hub_Goals_Changes_Only.zip`.

The resulting project includes the Journal, vehicle listings and success-fee workflows, affiliate-linked product sharing, a revised affiliate promotion studio, Google-first login/recovery features, and the affiliate dashboard with personal monthly commission goals.

**This is NOT a verified production deployment.** It is a reviewed source package, not a live website capture. Only source-level verification was possible here. Also, the earlier eight-screen design montage was an illustration; not every illustrated screen is implemented pixel-for-pixel.

## Verification performed in the working environment

- `node --test tests/*.test.mjs` — **298 tests passed, zero failed**.
- TypeScript JavaScript/JSX parser inspected **143 source files with zero parse errors**.
- `npm ci --offline` was unable to install a missing npm package from the empty offline cache. Consequently **ESLint, a Vite production build, Supabase/live integrations and real-device sharing remain unverified here**.

## How to install SAFELY in the active Codespaces repository

**Preferred: Use the accompanying `ZaMarket_Final_Changes_Only_2026-11-10.zip`, not this full snapshot, if your current Codespaces repository contains additional changes.**

1. In Codespaces, save/commit the current repository first. Confirm clean state: `git status`.
2. Create a separate branch: `git switch -c feature/zamarket-consolidated-20261110`.
3. Review the changed-files ZIP against your current repository and merge only the relevant updates. Do not blindly replace any newer files.
4. On a system with npm registry access:
   ```bash
   npm ci
   npm run check
   npm run build
   ```
   Stop and inspect failures before deployment.
5. Check the Supabase `supabase/migrations/` folder. **Review and apply only missing migrations once**, in this order:
   - `20261109_vehicle_success_fee_REVIEW.sql` (for seller-funded car commissions)
   - `20261109_affiliate_vehicle_rewards_REVIEW.sql` (for affiliate reward estimates)
   - `20261109_affiliate_monthly_earnings_goals_REVIEW.sql` (for private monthly goals)
   **Do NOT rerun Journal 2.0 SQL or blanket `run-in-supabase.sql` if previously applied.** Use a staging database or a backup and verify table/function dependencies first.
6. Check Supabase Authentication redirect URLs, Google OAuth, and password reset flows before account changes. Never delete or recreate existing user IDs to make Google login work.
7. Test anonymously and as founder, vendor and approved affiliate on both mobile and desktop:
   - Marketplace homepage and Journal 2.0 published article access, cards and sharing
   - Public Motors search and individual vehicle photos/enquiry flow
   - Seller success-fee agreement and private commission details
   - Affiliate referral links from ordinary public product pages and WhatsApp rich previews
   - Product-first affiliate promotion studio and poster image output
   - Affiliate goal changes save/refresh with correct commission totals, not gross sales
   - Commission attribution, commission status/payout safeguards, cancelled/refunded orders
   - Google login, account-linking and password recovery without losing account access
8. Only when checks pass, commit your reviewed branch, open/merge a PR using your normal process, and check the Netlify production deploy and browser console. Do **not** force-push to recover a failed commit.

## Important limitations and data safeguards

- This ZIP may be older than unshared changes currently present in your Codespaces repository. Compare and merge rather than overwrite.
- Vehicle commission figures are estimates before deal close and seller fee receipt.
- Monthly earnings goals are private planning targets and do not change payout rates or stored financial history.
- Public promo images should use real marketplace imagery and verified claims; preview/mockup assets aren't part of live catalogue data.
- Secure OpenAI and Supabase credentials belong in Netlify server-side environment settings, never in frontend code or the ZIP.

## File layout

- `src/` React/Vite application code
- `netlify/` functions and SEO edge processing
- `supabase/migrations/` SQL to review before applying
- `tests/` source-level contract tests

Do not extract the whole archived `zamarket/` folder on top of a newer repository without reviewing differences first.
