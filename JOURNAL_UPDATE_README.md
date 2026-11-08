# ZaMarket Journal discoverability and article presentation — Update 34 follow-up

Base: `zamarket-update-34.zip` supplied in the conversation. This update keeps pricing, order handling, delivery, giveaway logic, Supabase schema and affiliate logic unchanged.

## Changes

1. Adds a prominent **Journal** link near the start of the public shopping category navigation. The mobile bottom bar remains unchanged; readers can also reach Journal through the existing compact footer, now labeled **The ZaMarket Journal**.
2. Adds **Stories worth discovering** to the public homepage after the first category shelf (or the initial product row), using the latest **three already-published posts**, their cover images, categories, summaries and links. Does not include drafts, fictional articles, or hardcoded products. No articles yet? The section stays hidden, while the Journal navigation remains available.
3. Replaces the old Journal introduction with: **Stories, guides and discoveries worth exploring. Get helpful buying advice, meet local businesses and find products you’ll love.** Updates matching browser and edge SEO descriptions.
4. Fixes public article headings pasted like `##Heading` without a space. Correct headings like `## Heading` continue to work. Applies to the existing public article and admin preview that use the shared renderer.
5. Tightens article body typography and heading separation on mobile, staying within the existing dark-violet design system.
6. Adds tests for those changes.

## Files changed

- `src/pages/public/Marketplace.jsx`
- `src/pages/public/Blog.jsx`
- `src/lib/icons.jsx`
- `src/refinements.css`
- `netlify/edge-functions/seo.js`
- `tests/refinement20.test.mjs` (old test amended to allow reader-focused Journal navigation while continuing to reject affiliate recruitment in the shopping strip)

## New files

- `src/components/JournalHighlights.jsx`
- `src/lib/articleHeadings.js`
- `tests/journalDiscovery.test.mjs`

## Deploy safely

1. Back up or commit existing work. Use the **update-only ZIP** if your local Codespaces branch contains more recent changes; review conflicts rather than overwriting them.
2. Extract files at the **repository root** (the folder with `package.json`), preserving relative paths.
3. Run `npm ci`, `npm run check` and `npm run build` in Codespaces.
4. Deploy to Netlify and check `/` and `/blog` from a fresh mobile browser without signing in.
5. On the homepage, check the Journal card appears when at least one post is published. Open a card and verify the full article, product links and share actions.
6. Check Markdown headings now render as headings even in already-published posts that contain `##Heading`.

**No Supabase SQL is required.** Homepage Journal previews use the existing public `blog_index` RPC, already used by `/blog`.

## Tests and limitations

- Node test suite: **262/262 passed**.
- TypeScript parser syntax validation: **passed** for all changed JS/JSX files.
- A complete Vite build was **not verified** in the current environment: dependencies were not locally cached and an online `npm ci` attempt timed out. Build in Codespaces before deploying.
- This does not change the content of an already-published article. The image caption beneath Rasma's full-cake photograph was incorrect in the user's screenshot; edit the article's Markdown to remove or correct that caption, then republish. The new code does not silently rewrite editorial content or images.
- No changes were made to current live Netlify deployment.
