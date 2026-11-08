# ZaMarket Journal — Editorial Design Upgrade

This package is based on the previous ZaMarket Update 34 / Journal & Blog Delete bundle. It focuses on the **public Journal** and blog **editor preview** only.

## Changes

- Added `src/journal-editorial.css` (loaded last) for a readable, editorial design scoped to Journal pages.
- Improved public Journal index headline, card hierarchy, story descriptions, image proportions, and mobile sizing.
- Improved article headline, category label, byline, estimated reading time, section headings, paragraph rhythm, quotes, image captions and inline-photo height.
- Polished the existing linked-product and sharing areas **without changing their business logic**.
- Made the Blog editor's Preview use the new heading and article-body typography.
- Added `tests/journalEditorial.test.mjs` to protect the new presentation.

The post body, database records, product selections, image URLs and pricing remain untouched. The existing published carrot-cake article will automatically receive the styles after deployment.

## Scope and safety

No Supabase migration and no new environment variables are required.
Do not replace more recent repository edits without reviewing the diff. The previous obsolete `src/pages/admin/AffiliateAcademy.jsx` and `src/pages/reseller/AcademyExtras.jsx` should remain absent if already removed.

## Validation

- `node --test tests/*.test.mjs`: **267 passed**.
- CSS parsed with no syntax errors.
- Mobile editorial preview rendered successfully in Chromium and the computed fonts checked.
- Full `npm run check` and production `npm run build` must run in Codespaces: dependency installation was not completed in the artifact environment.

## Deploy with the existing GitHub → Codespaces method

Upload the supplied `zamarket.zip` to the GitHub repository root and ask the Codespaces assistant to:

1. Inspect the clean branch and ZIP (top-level `zamarket/`).
2. Compare the ZIP with the repository and preserve newer unrelated work.
3. Extract and overlay `zamarket/` into the root; keep the existing app architecture and dependencies.
4. Verify `src/journal-editorial.css`, its import in `src/main.jsx`, the Journal changes in `src/pages/public/Blog.jsx`, and the new test.
5. Remove the uploaded ZIP and extracted directory (do **not** remove unrelated archives).
6. Run `npm install`, `npm run check`, `npm run build`.
7. If all pass and the diff is limited to the intended update, commit and push to `main`. Otherwise stop and report the failure.

## After deployment

Check `/blog` and your carrot-cake article in a fresh mobile browser, especially the heading hierarchy and inline-photo height. Existing image captions in the database still require manual editorial correction if they do not accurately describe the photos.
