# Update 34 — the giveaway admin crash

**No database changes.** `run-in-supabase.sql` is unchanged at 16 sections.
If you ran it for update 33, there is nothing to run. Code only.

## What was wrong

The crash was not on the public giveaway page at all — it was the
**admin form for creating a giveaway**. The error screen said so once it
started reporting the component: `in Select ‹ Field ‹ NewGiveaway`.

Three `<Select>` elements in that screen were written with `<option>`
children instead of the `options` prop the component expects. `options`
was therefore undefined, `options.map` threw, and React unmounted the
whole page — which is the blank screen you saw.

Fixed in two ways:

1. The "Who pays the rewards" Select now passes its choices properly.
2. `Select` itself no longer trusts the caller. `options` defaults to an
   empty list, and children are rendered as well, so both styles work. An
   empty dropdown is a visible, recoverable mistake; a blank page is not.

A test now walks every `.jsx` file and fails the build if any Select is
left with no choices at all.

That is three separate faults this one error-reporting change has found.
It was worth making the screen say where it broke.

258 tests pass, up from 254.
