# ZaMarket — Affiliate, Creative Studio, Account Access & Motors Upgrade

Prepared 9 November 2026. This is **source code**, not a live deployment. It is based on the previously supplied **ZaMarket Motors Full Reference** archive, which itself included Journal 2.0. Use the **changes-only archive** to integrate into your current Codespaces branch; your live repository may contain more recent files than this reference source.

## What was actually changed

**Affiliate and sharing**
- Ordinary public product sharing now uses a logged-in approved affiliate's `/r/<code>/<slug>` URL; the same link is used for the promotional image QR code and caption. Other visitors use ordinary public links.
- Netlify SEO edge metadata for affiliate URLs returns the real public product title, image and description for WhatsApp/Facebook link previews. The attribution URL remains the shared URL; the search canonical points at the standard public product page. Real crawler behavior still needs testing.
- The affiliate hub highlights promotion actions and earnings. The selling guide now includes genuine product photos, realistic sales plans, real affiliate links and channel-specific messages. The Academy keeps the detailed training separate from the dashboard.
- The affiliate promotion tool now uses the shared real-image, real-price product-poster renderer. Full-bleed Hero and Several Angles remain, with new light Product Spotlight and adaptive Benefits Spotlight. Legacy formats remain internally for compatibility but are not promoted as default choices. Extra gallery shots show the entire photograph without arbitrary heavy crops.
- Wording no longer assumes unconditional delivery in Lusaka. Vehicle ads tell customers to enquire instead of promising parcel fulfilment.

**Account access**
- Google sign-in is primary. Existing email/password logins remain available.
- Password recovery via a server-delivered Supabase recovery email and `/reset-password` page has been added.
- Already signed-in users can request linking their Google identity to their existing account; no account, partner role, or earnings are moved automatically. This requires the Supabase Auth identity-linking configuration and correct redirect allowlist, as described below.

**ZaMarket Motors**
- New `/motors` discovery page, real public vehicle listings, search/filters, photography and responsive dark-purple cards.
- Dedicated vehicle presentation with gallery, specs, description, seller and enquiry/viewing actions, integrated with the existing enquiry workflow.
- The earlier Motors seller agreement, per-vehicle success fee, affiliate share of seller fee and fee-collection guard remain in the full reference project. The new **optional** `affiliate_vehicle_reward_estimates()` RPC provides estimated kwacha payouts to approved affiliates only; no private seller fees are revealed to anonymous visitors.
- Public Motors page added to sitemap and SEO metadata.

**Not changed**: vendor settlement rates, customer purchase prices, delivery-price engine, account IDs, payout records, the live Supabase database, or the live production site. Vendor dashboard redesign and other ideas not yet specified are not silently included.

## Recommended installation: integrate changes-only, do not overwrite your live work blindly

1. Open your existing Codespaces repository. Commit or back up current work, and confirm the Journal 2.0 push is safely present.
2. Create a feature branch, e.g. `git switch -c feature/affiliate-motors-20261109`.
3. Review file-by-file changes from `ZaMarket_Affiliate_Motors_Upgrade_Changes_Only.zip`; merge them into the current repository. If the same file has newer edits, **merge** rather than blindly replacing it.
4. Run in Codespaces (with internet/dependencies):
   ```bash
   npm ci
   npm run check
   npm run build
   ```
5. Test the desktop and mobile customer, affiliate, admin and vendor flows. In particular, from an approved affiliate login share a product from the **ordinary** marketplace and confirm the full URL `/r/<affiliate-code>/<product-slug>`; open that link in incognito, complete a **test** order and verify attribution. Verify that genuine WhatsApp image previews load for the referral URL on a second device.
6. Review/apply the SQL migration **only if not already applied**, in this order:
   - `supabase/migrations/20261109_vehicle_success_fee_REVIEW.sql` (included in full project; from the earlier Motors upgrade)
   - `supabase/migrations/20261109_affiliate_vehicle_rewards_REVIEW.sql` (this update, optional read-only estimates)
   **Do not rerun unrelated Journal 2.0 SQL.** The migrations must be reviewed against the live Supabase schema and existing agreements before production execution.
7. Check Supabase Authentication -> URL Configuration and allow `https://zamarket.shop/reset-password` and the login/account OAuth callbacks as needed. Google sign-in must be configured; manual identity linking must be enabled for existing signed-in users. Test with a non-admin test account before using on founder, vendor or affiliate accounts.
8. Publish via your existing reviewed GitHub PR/merge and Netlify pipeline only after the build and integration tests pass. Do not force-push or overwrite uncommitted Codespaces work.

## Verification carried out in the working container

- `node --test tests/*.test.mjs`: **292 passed, zero failed**.
- Changed/new JS and JSX: TypeScript syntax parser reported no parse diagnostics.
- A full Vite production build and ESLint were **not** completed because this isolated container could not install npm dependencies (`npm ci` failed). The repository's Codespaces `npm run check` and `npm run build` are mandatory before deployment.
- Browser-generated poster appearance, WhatsApp crawler preview, Google OAuth, recovery emails, real checkout attribution and Supabase migrations were **not** tested live. Test them before launch.

## Common pitfalls

- The referral link preview only works if the Netlify SEO edge function is active in production and the listing has a publicly accessible HTTPS product image. Preview caches may retain old metadata; verify using a fresh share URL and crawler inspection.
- Google login is not a reliable *sole* recovery path. Keep password reset and support-assisted identity verification. Never move earnings based on a name or a phone call alone.
- Do not claim `verified seller`, `free delivery`, a service history, or particular product benefits unless those claims are independently supported by actual records.
- Vehicle commissions are estimates until the seller's fee is collected from a closed, verified sale; changing a negotiation price changes the final calculation.
- Promotional images use actual catalogue photos; if there is no photo, the poster needs an authentic one from the seller. Do not substitute unrelated stock images.
