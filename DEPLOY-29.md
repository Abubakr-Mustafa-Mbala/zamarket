# Update 29 — brand name and search discovery

**No database changes.** `run-in-supabase.sql` is unchanged at 15 sections.
If you ran it for update 28, there is nothing to run here. Code only.

## What changed

**The brand was spelled two ways.** Your logo, manifest and splash said
ZaMarket; page titles, meta descriptions, receipts, the workspace header
and every social caption said "ZA Market" with a space — 61 places in all,
plus 4 "ZAMarket" hashtags. Google learns a brand from its titles, so this
had to agree with itself before asking to be indexed. All now ZaMarket.
`ZAMARKET` in full caps is left alone: that is deliberate poster and badge
typography, not the name.

A test now walks `src/` and `netlify/` and fails the build on any other
spelling, so it cannot drift back.

**The giveaway pages were invisible to search in a second way.** Update 28
stopped them being marked noindex, but they were in no sitemap, so Google
had nothing to find. The sitemap now lists `/giveaways` and every live,
drawn or fulfilled giveaway. Drafts and scheduled ones are excluded, and a
test asserts they can never appear.

**A sitemap can no longer advertise a page that does not exist.** A new
test checks every static URL in the sitemap against the real router,
including parameterised routes. Verified by adding a fake URL and watching
the build fail.

214 tests pass, up from 211.
