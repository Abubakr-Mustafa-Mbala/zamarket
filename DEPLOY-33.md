# Update 33 — fixes the SQL that would not run

Whole project. Contains everything up to 32.
**Run `supabase/run-in-supabase.sql` (16 sections) and deploy the code.**

## Why section 16 failed on your database

To put `front_rank` on the front page, section 16 read the definition of
`public_products` back as text and spliced a column into it. That depends
on the exact formatting Postgres happens to print, and your live view has
drifted from the one in `schema.sql`, so the splice found nothing and the
guard stopped — correctly, rather than corrupting the view.

That approach was wrong anyway. It had already caused two faults:
recreating the view lost its `security_invoker` setting, and the new
column was not granted to `anon`, which together would have taken the
marketplace down for logged-out visitors had they not cancelled out.

**Section 16 no longer touches `public_products` at all.** The pick is
published through a small view of its own, `front_page_picks`, which
exposes one number and reads products as its owner, so it needs no
column grants and no knowledge of how `public_products` is written.

Verified on three databases: a clean one, one already carrying the old
splice, and one whose `public_products` was deliberately rewritten to a
different shape. All run clean twice, and `public_products` is left
untouched.

If your database already has the old splice, re-running repairs it:
the column is granted to `anon` and the view is set back to
`security_invoker = on`.

## Also in this update

The crash screen now names the component that failed, e.g.
`in GiveawayCard ‹ GiveawayList`, instead of only an error message that
points nowhere. `vite.config.js` keeps component names through
minification so this survives a production build.

254 tests pass. 51 database rules pass on a database built from nothing.
