# Update 31 — sharing articles, and nothing hidden from browsing

**No database changes.** `run-in-supabase.sql` is unchanged at 16 sections.
If you ran it for update 30, there is nothing to run. Code only.

## 1. Any article can be turned into a picture

A blog link pasted into WhatsApp is a grey rectangle nobody opens. Every
published article now has a **Share this** block at the foot of the page
with:

- **Status / story picture** — 1080x1920, for WhatsApp status, Instagram
  and Facebook stories
- **Feed post picture** — 1080x1350, for Instagram and Facebook feeds
- **Send on WhatsApp** and **Facebook** — straight to the share sheet
- **Copy words and link** — the headline, the summary and the address

The picture is the cover photo, the category, the headline at a size you
can read at arm's length, the opening lines, and the ZaMarket mark with
zamarket.shop under it. The link preview card (1200x630) uses the same
drawing, so a pasted link looks like the article too.

This sits on the **public** page on purpose. A customer, an affiliate, a
vendor and you all get the same buttons, and nobody has to sign in.

Instagram has no share link — no app can post there on your behalf — so
the honest answer is the picture: save it, post it from Instagram, paste
the words. The page says exactly that rather than pretending otherwise.

All three shapes were rendered in a real browser and looked at, not just
written. Three faults were found and fixed that way: the category label
collided with the headline, the address ran straight through the logo,
and the summary silently vanished leaving a dead band.

## 2. Products nobody could browse to

A product's department is what puts it on a category tile and in a shelf
on the front page. Leaving it blank was allowed, and a blank one then
counted toward no tile and belonged to no shelf — it existed, it was for
sale, and only someone searching its name could find it. Nothing in the
app flagged this.

**Marketing → Front page** now opens with a warning listing every
published product that has no department, each with a dropdown to file it
in one click. The warning disappears when there is nothing left to fix.

241 tests pass, up from 228.
