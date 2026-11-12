# ZaMarket V44 — Motors page hotfix and cleaner global navigation

**Base:** ZaMarket Update 43. **Scope:** frontend-only. **New Supabase SQL:** none.

## Confirmed root cause

`src/pages/public/Motors.jsx` uses `photoOf(cars?.[0])` while `cars` is initially `null`. The `photoOf` helper attempted to access `p.images` without checking whether `p` was present. This triggered `Cannot read properties of undefined (reading 'images')` on a fresh visit to `/motors`.

## Changes

1. `src/pages/public/Motors.jsx`: make vehicle image lookup, specification lookup and location lookup safe when fields or the entire vehicle are missing. The page can show a neutral hero while data loads and preserve existing loading, error and empty-result states.
2. `src/pages/public/Marketplace.jsx`: remove department links (e.g., Home & Kitchen and Food & Cakes) from the upper navigation. Keep Today's deals, Motors, Journal, Stores and an active giveaway link when relevant. The large illustrated category rail appears **on the homepage only**, instead of being repeated across other pages.
3. Update two previous tests that expected the old global category rail, and add dedicated regression tests for the Motors crash and new navigation behavior.

## Deploy in the current Codespaces repository

1. Ensure the latest uncommitted work is safely saved/committed; do not overwrite recent work from a stale project snapshot.
2. Apply only the files in `ZaMarket_V44_Motors_Nav_Hotfix_Changes_Only.zip` to your current branch and review `git diff`.
3. Run `npm ci`, `npm run check` and `npm run build`.
4. Test `/motors` in a **new private/incognito browser** (a page with no cars should not crash either). Test home, Journal, Stores, an individual product, and category search.
5. Commit and push after successful verification so Netlify deploys the corrected code.

**Do not rerun Supabase migrations.** This hotfix does not change database structures or vehicle deal calculations.

## Tests performed in the preparation environment

- `node --test tests/*.test.mjs` — **351 passed, 0 failed**.
- TypeScript's JSX/JS parser — **152 files parsed, 0 syntax errors**.
- `npm ci --offline` could not complete because the package `yocto-queue` is not cached in this environment. Therefore **production build and live deployment have not been verified here**.

## Expected visible result

- Motors no longer displays the `reading 'images'` error on its initial render.
- Main upper bar: Today's deals · Motors · Journal · Stores (plus a live giveaway if relevant).
- Product departments stay accessible via the homepage's category icons and the fixed bottom `Categories` button; they no longer duplicate in the upper bar.
