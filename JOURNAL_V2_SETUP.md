# ZaMarket Journal 2.0 — deployment and review

## What is implemented

- A new editorial article layout using the existing product and article records; purple-dark photo hero and calm reading surface.
- Category-sensitive reading palettes: food/bakery → warm ivory; tools/equipment/electronics → soft stone; beds/home/living → quiet sage. Founder may override with ivory, stone, sage, cocoa, or midnight violet for each article.
- Publisher credit and a linked, explicitly chosen featured vendor. If none is chosen, use the first published linked product's approved vendor.
- Journal categories derived from existing published posts; no fictional or empty categories.
- A restrained reading layout, heading anchors, desktop contents navigation, accessible mobile single-column layout, and controlled inline image sizes.
- Reader likes (one toggle per signed-in user), moderated comments (signed-in readers; pending until staff approval), public share controls, and staff engagement dashboard.
- Admin "Export PDF": opens a print-ready article in a new tab. Select **Save as PDF** in the browser print dialog. This is print-to-PDF, not a direct generated PDF file.
- Approximate engagement events (engaged sessions, product clicks, share actions) without collecting names, emails, or IP addresses in the event table. Metrics are directional, not search rankings or validated purchase counts.

## Required Supabase SQL — apply BEFORE publishing the frontend

1. Back up the Supabase project/database, and verify that your production Supabase project is selected.
2. Open **Supabase → SQL Editor**.
3. Open `supabase/migrations/20261108_journal_v2_REVIEW.sql` from this archive (or use the separately provided SQL file).
4. Review it, run the entire script, and confirm success. This creates new columns, tables, and staff-protected RPCs. **Do not** re-run all older migrations or the full `run-in-supabase.sql` merely for this update.
5. In Table Editor, confirm `posts.reading_theme`, `posts.featured_vendor_id`, `journal_likes`, `journal_comments`, and `journal_events` exist.

The UI will still display existing articles if the new RPCs are temporarily unavailable, but likes, comments, analytics and persistent theme/vendor choices require this migration. New article saves will fail until the columns are present.

## GitHub / Codespaces (normal workflow)

Upload the `zamarket.zip` file to your GitHub repository root. Start Codespaces and give your AI coding assistant this task:

> **Fresh ZaMarket Journal 2.0 installation**. Before changing anything, inspect the branch, working tree and `zamarket.zip`. Confirm the archive has a `zamarket/` folder. Compare the archive with the repository and stop for review if unrelated newer code would be overwritten. Extract it and copy its contents to the repository root, preserving unrelated files. Do not restore the obsolete Academy components. Remove only the temporary extracted folder and the uploaded ZIP. Run `npm install`, then `npm run check`, then `npm run build`. Verify the Journal 2.0 CSS, components, category themes, admin export, comments and analytics code are present. If the checks and build pass, review the diff. Commit `ZaMarket Journal 2.0 editorial update` and push to `origin/main`. If any check or build fails, do **not** commit or push; show the error.

## After Netlify publishes

1. Open `/blog` in a new incognito window. Only actual published articles and their categories should appear.
2. Open the carrot-cake article: verify cover, ivory reading surface, heading typography, vendor name and real product link.
3. Test a home/bedding article (automatic **sage**) and equipment article (automatic **stone**) when those categories have actual posts.
4. Log in as staff → Marketing → Blog; change a post's reading palette/featured vendor, save and check the public article.
5. In a customer account, like and submit a comment. Confirm comment starts pending, then approve it from the Blog manager. Anonymous visitors can read/share but not like/comment.
6. As staff, open a published article for editing, choose **Export PDF** and use the browser's **Save as PDF** action.
7. Confirm the dashboard shows reads, likes, approved comments, engaged sessions and product-click/share actions. No numbers should be fabricated.
8. Confirm normal store, cart, checkout, affiliates, giveaways, AI Blog Writer and admin workflows still work on both mobile and PC.

## Verification limits and production safety

- Source-level automated tests: 273 passed in the artifact-generation environment.
- JavaScript/JSX parse: 138 source files parsed without errors.
- Journal V2 CSS parsed without syntax errors.
- Static browser check of this CSS/representative article at 390px and 1440px: no horizontal overflow. **This is not a production screenshot.**
- The full Vite production build could not be executed here because the dependency installation timed out. Codespaces build is therefore a strict release gate.
- Existing article text, published data, products, prices, orders, delivery and commission calculations have not been altered.
- SEO metadata, sitemap, and sharing remain. Good design and schema do not guarantee a Google ranking; Google/Bing site ownership and external reporting remain separate tasks.
