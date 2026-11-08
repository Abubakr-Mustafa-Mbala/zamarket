# ZaMarket Blog delete control — update for Codespaces

Based on the previously supplied ZaMarket Update 34, **including the earlier Journal navigation, homepage blog highlights, SEO heading and typography improvements**.

## Added
- **Delete** next to every draft and published article under Admin > Marketing > Blog > Posts.
- **Delete article** in the existing article editor.
- Confirmation dialog displaying the article title, requiring the word `DELETE` before proceeding.
- Database deletion of the selected post only, with error feedback and an automatic refresh of the blog list.
- Linked `post_products` records removed by the existing `ON DELETE CASCADE` foreign key.
- Uses the existing staff and marketing role Row Level Security policy; does not expose public deletion.
- Published articles disappear from the public Journal and homepage highlights after deletion. Old external links will become unavailable; search engine snippets may take time to disappear.

## Scope
Existing products, vendors, images stored in Supabase Storage, orders and financial records are **not** deleted. Uploaded article media are left in Storage deliberately, since they may be reused.

## Deployment — your familiar workflow
Upload **zamarket.zip** into the root of your GitHub repository. It contains a top-level `zamarket/` directory. Use your standard Codespaces AI prompt to unzip, copy the contents of `zamarket/` to the repository root, remove temporary ZIP/folder, run `npm install`, then `npm run build`, commit and push only after a successful build. The prompt should also run `npm run check` before pushing.

No new Supabase SQL migration is required **if** your existing Supabase database already has the staff-only `posts`/`post_products` permissions and cascade foreign key shown in `supabase/schema.sql`. Test deleting a dummy draft first, then verify that public readers can no longer open it.

Check: Admin > Marketing > Blog > Posts. Tap Delete beside an article or open the article and tap Delete article. Type DELETE exactly (uppercase).
