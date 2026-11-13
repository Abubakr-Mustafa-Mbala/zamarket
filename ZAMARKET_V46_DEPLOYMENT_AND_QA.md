# ZaMarket V46 — Affiliate Promotions, Mobile Fixes and Academy

**Basis:** user-supplied `/mnt/data/zamarket.zip` (Nov 12, 2026), not the older V45 files.

## Changes made in source

1. **Poster choices**: Full-bleed Hero, Several Angles, Clean Catalogue and Editorial Split. The Emporium sheet remains in legacy drawing code only for compatibility; it is no longer selectable in the public/affiliate sharing components or Creative Studio.
2. **Choose any product image**: Shared `ProductPhotoPicker` supports all uploaded image URLs (not only the first four), with numbered thumbnails and a clear selected state. It is wired into product-page sharing, affiliate PromoKit and the seller/founder Creative Studio. Selected photo becomes poster lead, while Several Angles retains the remaining photos. Referral URL and QR do not change.
3. **Product navigation**: reset scroll to the top when the product ID or store route changes, so the gallery appears first instead of stale Q&A scroll position.
4. **Homepage**: retains the explicit hand-picked front-page slots. Removed auto vendor-hero fallback when there is no published founder marketing slot, to prevent unauthorized seller imagery from taking over the promotion area. Regular category shelves still show discovered inventory below curated picks.
5. **Mobile containment**: modal/editor constraints for phone width, one-column promotion editor on small screens, phone-safe thumbnail rails, overflow and wrapping safeguards. Disabled the mobile header blur effect as a low-risk flicker mitigation. This does not establish that every page or Android browser is flawless—run viewport QA below.
6. **Academy**: separate course package (16 modules, 80 structured lesson drafts), including teaching notes, demonstrations, exercises and knowledge checks. The current marketplace links to an external Academy using `training_url`. No new SQL migrations are introduced here.

## Installation

Do not extract the full reference ZIP over a newer Codespaces repository. Use `ZaMarket_V46_Changes_Only.zip` on your current branch, after committing or backing up your current work. Review the differences before committing.

1. Unzip the changes-only archive at the repository root, preserving `src/` and `tests/` paths. Do **not** copy the Academy package into `src/` unless integrating it through the supported Academy platform.
2. Run `npm ci`, `npm run check`, and `npm run build` in Codespaces. If any fails, do not push until investigated. Don't bypass hooks.
3. Test Android at 360px/390px/412px viewport widths: home, product page, store, affiliate Promotion Studio, poster picker, all poster formats, checkout, Motors and Journal. Ensure the document itself never scrolls sideways; intentional carousels may scroll inside their own bounds.
4. Test choosing photo 1, then 4, then the last uploaded photo; confirm exported poster actually changes and the QR still opens the tracked affiliate link.
5. Test the two new templates against bakery, clothing, equipment and multi-image product listings, and ensure facts/discounts are not invented.
6. Test navigation between two products, a product after scrolling deep into Q&A, and browser back/forward behavior.
7. Review home front-page picks from the admin before deployment. No seller category should occupy the curated window unless selected.
8. Ensure existing prices, cart, commissions, payouts, login, Supabase policies and ordering flows remain unchanged.
9. Push the verified branch to GitHub and confirm Netlify build succeeds. Test a fresh private browser session.

## Verification performed here

- `node --test tests/*.test.mjs`: **358 passed, 0 failed** (including four new V46 regression tests).
- `node --check` for changed plain-JavaScript source modules.
- **Not performed**: full npm production build with application dependencies; live Supabase integration; real-device screenshots; exhaustive responsive tests. Do not treat the source tests as proof of production quality.

## Academy import

`ZaMarket_Academy_Import_V46.zip` contains `course.json` (generic structured format), `lessons.csv` and `course.md`. These are **instructor drafts, not pre-recorded videos or complete word-for-word eight-minute scripts**. The developer must use the target Academy platform's actual import API or CMS; do not assume a direct JSON upload is supported. No Marketplace SQL changes required.
