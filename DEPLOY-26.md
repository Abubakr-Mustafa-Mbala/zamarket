# ZaMarket — update 26

## Order matters

1. Run **`supabase/run-in-supabase.sql`** in the Supabase SQL editor. You are
   a few updates behind — this one file contains all of them, so running it
   once catches you up completely.
2. Then upload the code and deploy.

This release changes `place_order` and `set_order_status`, so the SQL has to
be in place first. Running the file twice changes nothing — it was tested that
way, on a database built from nothing.

---

## 1. The new logo

The approved mark is in, everywhere it belongs: browser tab, Google search
result, Android and iPhone home screens, the installed app, the site header
and every poster the Creative Studio makes. The link-preview card that shows
in WhatsApp and Facebook is the new lockup too.

One change to what your partner sent. The full mark has a long sweep under
the letters, and below about 48px that sweep turns into a grey smear and the
letters stop reading — which matters because the 16 and 32px versions are
what Google shows beside your search result. So the big sizes use the full
mark and the small ones use the ZA monogram on its own, zoomed to fill the
frame. Standard practice, same brand, legible at every size.

Where the mark appears, it carries **zamarket.shop** under the name, the way
the approved lockup is built.

The full list of places it now prints, all drawn from one shared copy of the
paths so it cannot drift between them:

| Where | What it shows |
|---|---|
| Browser tab and Google result | monogram, 16/32/48 |
| Android and iPhone home screen | full mark |
| Installed app | full mark, plus a maskable version |
| Site header | mark beside the wordmark |
| Price list, collection, vendor spotlight | mark + ZAMARKET.SHOP · AN ONLINE MARKETPLACE |
| Product share poster | mark + ZaMarket + zamarket.shop in the footer band |
| Promo adverts and share cards | mark |
| Printed receipt | mark, in dark ink |
| Thermal receipt | mark, as a one-bit raster |
| WhatsApp and Facebook preview | full lockup |

Two things worth knowing. The shopping-bag glyph the posters used to draw has
gone. And the mark on the printed receipt is **dark**, not cream — the cream
version is nearly invisible on white paper, which is where a receipt prints.

After deploying: check the home-screen icon on your own Android phone. Google
can take a week or two to pick up a new favicon — that is Google's pace, not
something broken.

## 2. Everybody on the wheel

You were right and this was the wrong behaviour. The page used to receive the
first 300 names; a thousand entrants meant seven hundred people looking for
themselves on a recorded draw and not finding themselves.

Now every entry goes on the wheel — a thousand entries is a thousand slices,
two thousand is two thousand. Tested at 2,000: it holds a steady 62 frames a
second, and the hub shows the real count.

Three things came with it:

- **A full entry list under the wheel**, with a box to search. Anyone can
  type their name and see their entry, before the draw as well as after.
  This is the part that actually answers "was I even in it?" — nobody can
  read their own name off two thousand slices.
- **A longer spin that builds.** Eleven seconds, driven frame by frame from a
  speed curve that surges twice on the way down: fast, easing, fast again,
  then a long settle onto the winner. It never turns backwards.
- **The name under the pointer is shown as it spins**, so you watch real
  entrants flick past rather than a decoration.

The winner's slice is marked in gold. At two thousand entries a slice is a
fifth of a degree, so the marker is widened to something a camera can see —
it points at the winning slice, it does not pretend the slice was bigger.

## 3. Turning on the AI blog writer

You only need one new value.

1. Go to **platform.openai.com** → sign in → **API keys** → *Create new secret
   key*. Copy it. You only see it once.
2. Add credit: **Billing** → *Add payment method* → put something small on it,
   $5 is plenty. A ChatGPT subscription does not pay for the API; it is a
   separate account balance. At the model this uses a blog post costs a few
   ngwee, so $5 is hundreds of articles.
3. In **Netlify** → your site → **Site configuration** → **Environment
   variables** → *Add a variable*:

   | Key | Value |
   |---|---|
   | `OPENAI_API_KEY` | the key you just copied |

   Leave the scope as it is. Do **not** put `VITE_` in front of the name — that
   would publish your key inside the website where anyone could read it.
4. Redeploy (pushing the code does this anyway).

### Using it

**Marketing → Blog → Write a post.** Type the phrase someone would search for,
optionally tick the products the article should mention, then **Generate
article draft**.

What it will not do: it never publishes by itself, it cannot browse the web,
and it only uses prices and product details read from your own catalogue on
the server — it cannot invent a product or a price. It gives you a list of
things to check before you publish. Check them. It is a first draft, not a
finished article, and the parts that make an article rank are the parts only
you can write: what you actually know about buying this thing in Lusaka.

If it ever says the model was rejected, OpenAI has renamed it. Add
`OPENAI_BLOG_MODEL` in Netlify with a current model name — no code change.

---

## 4. The SEO checklist

You said you had not started. Here it is in order, shortest first. Everything
below is done on other people's websites, not in your code.

1. **Google Search Console** — go to search.google.com/search-console, add
   `zamarket.shop` as a *Domain* property, and verify it with the DNS record
   it gives you (add it wherever your domain is registered). Nothing else on
   this list works until this is done.
2. **Submit the sitemap** — in Search Console → *Sitemaps* → enter `sitemap.xml`
   → Submit. Your site already generates it.
3. **Request indexing for the homepage** — Search Console → *URL inspection* →
   paste `https://zamarket.shop` → *Request indexing*. Do the same for two or
   three of your best product pages. This is the fastest way onto Google.
4. **Check a product page renders for Google** — URL inspection → *Test live
   URL* → *View tested page*. You should see the product name and price in the
   HTML. If you do, your product pages can rank individually.
5. **Rich results test** — search.google.com/test/rich-results, paste a product
   URL. It should find Product data with a price. That is what puts the price
   under your listing in Google.
6. **Google Business Profile** — business.google.com. A Lusaka business with a
   verified profile shows up for "near me" searches that the website alone
   will not reach.
7. **Bing Webmaster Tools** — bing.com/webmasters, import straight from Search
   Console in one click. Small traffic, no extra work.
8. **Check the WhatsApp preview** — send yourself `zamarket.shop` and a product
   link. Both should show the new dark branding and the product photo.

Do 1, 2 and 3 today. The rest can follow over the week.

---

## 5. The giveaway page now follows the approved design

Built to the visual reference, on live Supabase data. All three states:

- **A — entries open.** Hero with the gold accent word and the prize rosette,
  countdown, reassurance chips, numbered steps, free entry with the optional
  unticked consent box, the vendor's products, their real offers, the rules.
  The referral offer is not shown at this stage.
- **B — winner announced.** The wheel, then "Didn't win? You can still earn."
  with the fixed-reward-not-a-percentage comparison, your link and balance,
  the progress bar towards the prize value, how it works, the products you
  can share with what each pays, and what happens when the timer runs out.
- **C — offer expired.** The offer is closed, what you earned is still shown
  and still owed, and the two ordinary routes are offered instead: the
  customer referral reward, and the affiliate programme.

Three deliberate differences from the reference, all of them corrections:

- The progress bar is labelled as money earned towards the prize's price, not
  as the prize. It is yours to spend on anything.
- Earned money is shown separately from money still clearing, because a
  refund can still take the second one back.
- State C is worded as the earning offer ending rather than the giveaway
  ending, since the page still shows the winner after the draw.

## 6. The draw: several prizes, and a screen to record it on

**Several prizes.** A campaign can now hand out a list of them: first prize to
two people, second to one, third to one. Winners are drawn in order — the
first name out takes first prize. Stock is held back for every prize, not
just the first, and the prize list locks once the draw has happened.

Set it up in **Marketing → Giveaways → Add more prizes**, before you open the
campaign. Leave it empty and the campaign behaves exactly as before.

**The reveal screen.** On a drawn campaign, *Open the reveal screen* gives you
a full-screen sequence to record on your phone, in this order:

1. The prize
2. The vendor's products
3. Their current offers
4. The draw, and the winners

Advance with the arrows at the bottom or the left/right keys. Nothing else on
the site is on screen, so the recording is postable as it is.

**The wheel.** It is much bigger, and the ring is now made of real entries in
the order people entered, with the winner's slice wherever they actually are.
The hub shows the true entry count. With more than 300 entries the caption
says how many the wheel is showing and that all of them were in the draw, and
names flick past while it spins so the size of the draw is visible on camera.

One thing to be careful about when you record: the result is decided and
written down the moment you press **Draw the winners**, not when you spin. The
spin reveals it. So say "let's reveal who was drawn", never "let's see who the
wheel picks" — and if you want the recording to cover the actual moment of
decision, press *Draw the winners* on camera too. If you have not looked at
the result first, the reveal is a genuine surprise to you as well.

## 7. The homepage is organised now

Your complaint was right: cupcakes were landing next to toilet cleaner and a
bench saw, because the page took turns between *sellers* without caring what
the product was.

It now groups by department first and takes turns between sellers *inside*
each one. So "Food & cakes" holds food, and a baker still is not buried by a
hardware shop that uploaded twenty things this morning.

- A department needs at least three products to get its own shelf.
- Anything thinner goes into a "More on ZaMarket" shelf at the end, so a
  seller with one listing never disappears from the front page.
- Which department leads rotates daily, with departments stocked by several
  shops going first.
- With fewer than two full shelves it falls back to the single row you had.

---

## 8. Rewards for the people who did not win

A non-winner can earn a **fixed amount of kwacha** for every new customer they
bring, for a limited period, without buying anything first.

It is the same money an affiliate earns, in the same ledger, paid the same
way. Affiliates are completely unaffected — they keep their percentage terms
and their work is never interrupted by a campaign.

### The number that decides everything

At a 10% fee, **a K15 reward needs a K150 order to break even.** Below that,
every referral loses money.

The system will not let you get this wrong. When you pick a product people may
promote, it checks whether the commission on that sale can pay the reward, and
refuses if it cannot — with the price that would work:

> This sale earns K2.20 but the reward is K15.00. Raise the price above
> K150.00, lower the reward, or have the vendor fund it.

### Running one

**Marketing → Giveaways**, on a campaign that has been drawn → *Reward the
people who did not win*.

1. Set the reward per sale, and add the products people may promote.
2. Set the total budget and the most one person can earn, on the campaign
   itself. **Do this before you open it** — they cannot be raised afterwards.
3. Press *Open the earning period*. Everyone who entered and lost gets a link
   and the number of days you set. Winners do not.
4. The panel then shows orders brought, sales, your commission, rewards owed,
   budget left, and whether you are ahead or behind.

### What it refuses to pay for, automatically

- the same order twice
- an order an affiliate is already being paid for
- a customer who has bought before (the reward is for *new* customers)
- someone referring themselves, including a phone number written differently
- a product you did not approve
- anything past the per-person cap or the campaign budget
- an order placed outside the published window

A refund reverses the reward, exactly as it does for an affiliate.

### Before you run one

Three things are outside the software and worth an hour of someone's time:

- **Tax.** Paying many individuals may create a withholding obligation. Ask
  your accountant once, before the first payout, not after.
- **The promotion rules.** Free entry keeps the giveaway itself clear of the
  lottery definition. Paying non-customers to introduce buyers is a different
  thing and worth checking under the Competition and Consumer Protection Act.
- **It is not a pyramid.** Nobody earns from recruiting anybody — only from a
  real sale to a new customer. That is the line that keeps it clean, and the
  database has no way to pay for a recruitment, so it cannot drift.

---

## Checked before sending

- 185 automated tests pass, including a new one that catches CSS variables
  pointing at tokens that do not exist — a silent fault that had made one
  button render as dark text on no background.
- The full SQL runs clean on a database built from nothing, twice.
- All 106 database functions the site calls exist afterwards.
- **15 money rules were run against a real database**, from clean state: the
  affordability guard, double payment, repeat customers, self-referral,
  affiliate priority, unapproved products, the per-person cap, the budget
  ceiling stopping at exactly K50 of K120 of demand, and refund reversal.
- Production build succeeds.

Not checked: the live site, and the AI writer against a real OpenAI key.
