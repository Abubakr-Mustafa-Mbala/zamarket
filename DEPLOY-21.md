# ZaMarket — update 21

## Order matters

1. **Run `supabase/run-in-supabase.sql` in the Supabase SQL editor first.**
2. Then upload the code and deploy.

The SQL changes `place_order`, so the new code expects it to be there already.
Running the file twice changes nothing — it was tested that way.

## The loading error

The fault you kept hitting is fixed. What was happening:

Each page of the site is a separate file whose name contains a code for its
contents, and deploying changes those names. A phone still holding the previous
version of the site — a tab left open, the installed app, or a network that
cached the page — asked for a file name that no longer existed. The page then
could not open, and two things made it permanent:

- the "Try again" button re-drew the same page, which asked for the same
  missing file. It could never have worked.
- refreshing fetched the same stale page from the same cache, so it asked for
  the same missing file again. That is why a good connection made no difference.

Four changes:

- The site now recognises that failure and clears the browser out and reloads
  itself, once a minute at most so a phone can never get into a reload loop.
- The marketplace had no error boundary at all, so one failed page took the
  whole shop down to a black screen. It has one now.
- `netlify.toml` tells browsers and mobile networks never to keep the page
  itself, only the page files, which is what prevents this happening again.
- A missing page file now returns a plain 404 instead of the site's HTML, so if
  anything like this recurs the message will say what is actually wrong.

Anyone currently stuck will be fixed by the first load after deploying.

## Netlify environment variables

Already set, unchanged: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

New, and only needed if you want the AI blog writer:

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | from platform.openai.com — **not** a VITE_ name, it must stay on the server |
| `OPENAI_BLOG_MODEL` | optional. Leave unset unless the writer reports the model was rejected |

OpenAI API billing is separate from a ChatGPT subscription; the account needs
credit on it. At the model this uses, a draft costs a few ngwee.

## What is in this update

- The loading error, above.
- Giveaway page rebuilt: prize, countdown, how to enter, free entry, the
  vendor's other products, their real offers, the rules, and three doors out.
- A "Live giveaway" link appears in the shop only while a campaign is open.
- Creative Studio price lists, collections and vendor spotlights redrawn to a
  premium standard, with six colour themes plus your own background and accent,
  exported at double resolution.
- AI blog writer in Marketing → Blog, staff-only, capped, never auto-publishes.
- Product names can no longer lose a word when they wrap on a poster.

## Checked before sending

- 128 automated tests pass.
- The full SQL file runs clean on a fresh database, twice.
- All 101 database functions the site calls exist after running it.
- The AI usage caps were tested against a real database: a customer is refused,
  a marketer gets 6 an hour and 20 a day.
- 39 posters rendered and every QR code decoded to the correct shop link.
- Production build succeeds.

Not checked: the live site itself, and the AI writer against a real OpenAI key.
