-- Winner contact details, account recovery, seller-proposed giveaways and
-- the AI helper allowance.
--
-- Safe to run more than once. Changes no existing function: everything here
-- is a new column, a new table, a new function, or a tighter policy.

-- A phone number as its last nine digits, so 0977 123 456, +260 977 123 456
-- and 260977123456 are recognised as the same line.
create or replace function public.phone_key(p text) returns text
language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9), '');
$$;

-- =====================================================================
-- 1. Reaching a giveaway winner
-- =====================================================================
-- People sign in with Google, which gives an email address and no phone
-- number. Without one there is no way to ring a winner.

alter table public.giveaway_entries add column if not exists contact_phone text
  check (contact_phone is null or length(contact_phone) between 9 and 20);

-- The entrant gives, or corrects, the number to ring them on. It is stored on
-- their own entry and is never shown on the wheel or to another entrant.
create or replace function public.set_giveaway_contact(p_slug text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); digits text; cid uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(digits) < 9 or length(digits) > 15 then
    raise exception 'Enter a phone number we can reach you on, like 0977 123 456';
  end if;
  select id into cid from giveaway_campaigns where slug = p_slug;
  if cid is null then raise exception 'No such giveaway'; end if;
  update giveaway_entries set contact_phone = digits where campaign_id = cid and user_id = me;
  if not found then raise exception 'Enter the giveaway first'; end if;
  -- Kept on the profile too when it has none, so the next entry is one tap.
  update profiles set phone = digits where id = me and coalesce(trim(phone), '') = '';
  return jsonb_build_object('saved', true);
end $$;
revoke all on function public.set_giveaway_contact(text, text) from public, anon;
grant execute on function public.set_giveaway_contact(text, text) to authenticated;

-- What a signed-in entrant may know about their own entry: whether we can
-- reach them, and, after the draw, whether they won. Told only to them.
create or replace function public.my_giveaway_entry(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); e giveaway_entries%rowtype; cid uuid; w jsonb; st text; prof_phone text;
begin
  if me is null then return null; end if;
  select id into cid from giveaway_campaigns where slug = p_slug;
  if cid is null then return null; end if;
  select * into e from giveaway_entries where campaign_id = cid and user_id = me;
  if not found then return jsonb_build_object('entered', false); end if;
  select phone into prof_phone from profiles where id = me;
  select x into w
    from giveaway_draws d, jsonb_array_elements(d.winners) x
   where d.campaign_id = cid and (x->>'entry_id')::uuid = e.id
   limit 1;
  if w is not null then
    select status into st from giveaway_claims where campaign_id = cid and entry_id = e.id;
  end if;
  return jsonb_build_object(
    'entered', true,
    'phone', coalesce(e.contact_phone, nullif(trim(prof_phone), '')),
    'won', w is not null,
    'prize', w->>'prize',
    'claim_status', st);
end $$;
revoke all on function public.my_giveaway_entry(text) from public, anon;
grant execute on function public.my_giveaway_entry(text) to authenticated;

-- The list staff work from after a draw: who won, what, and how to reach
-- them. Staff and marketing only. A seller running a giveaway does not get
-- entrants' phone numbers; ZaMarket contacts the winner.
create or replace function public.giveaway_winner_contacts(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid; out jsonb;
begin
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;
  select id into cid from giveaway_campaigns where slug = p_slug;
  if cid is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'entry_id', e.id,
           'name', coalesce(nullif(trim(pr.full_name), ''), e.display_name),
           'prize', w->>'prize',
           'prize_rank', (w->>'prize_rank')::int,
           'phone', coalesce(e.contact_phone, nullif(trim(pr.phone), '')),
           'email', pr.email,
           'status', coalesce(cl.status, 'notified'),
           'note', coalesce(cl.note, ''),
           'updated_at', cl.updated_at
         ) order by (w->>'prize_rank')::int nulls last, e.created_at), '[]'::jsonb)
    into out
    from giveaway_draws d
    cross join lateral jsonb_array_elements(d.winners) w
    join giveaway_entries e on e.id = (w->>'entry_id')::uuid
    left join profiles pr on pr.id = e.user_id
    left join giveaway_claims cl on cl.campaign_id = d.campaign_id and cl.entry_id = e.id
   where d.campaign_id = cid;
  return out;
end $$;
revoke all on function public.giveaway_winner_contacts(text) from public, anon;
grant execute on function public.giveaway_winner_contacts(text) to authenticated;

-- Recording where things stand with a winner. It cannot change who won.
create or replace function public.set_giveaway_claim(p_slug text, p_entry uuid, p_status text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;
  if p_status not in ('notified','contacted','confirmed','delivered','forfeited') then
    raise exception 'Unknown status';
  end if;
  select id into cid from giveaway_campaigns where slug = p_slug;
  if cid is null then raise exception 'No such giveaway'; end if;
  if not exists (
    select 1 from giveaway_draws d, jsonb_array_elements(d.winners) w
     where d.campaign_id = cid and (w->>'entry_id')::uuid = p_entry
  ) then raise exception 'That entry did not win this giveaway'; end if;
  insert into giveaway_claims (campaign_id, entry_id, status, note, updated_at)
  values (cid, p_entry, p_status, left(coalesce(p_note, ''), 1000), now())
  on conflict (campaign_id, entry_id) do update
    set status = excluded.status, note = excluded.note, updated_at = now();
  perform log_audit('giveaway.claim', 'giveaway_claims', p_entry, null,
    jsonb_build_object('campaign', p_slug, 'status', p_status));
end $$;
revoke all on function public.set_giveaway_claim(text, uuid, text, text) from public, anon;
grant execute on function public.set_giveaway_claim(text, uuid, text, text) to authenticated;

-- =====================================================================
-- 2. A seller proposes a giveaway; ZaMarket decides whether it runs
-- =====================================================================
-- The original policy let a seller write any campaign carrying their own
-- vendor id, including one already marked live. Nothing on screen used that,
-- but the database allowed it. Sellers now go through propose_giveaway, which
-- can only ever make a draft.

drop policy if exists giveaway_staff_all on public.giveaway_campaigns;
create policy giveaway_staff_all on public.giveaway_campaigns for all to authenticated
  using (is_staff() or can_market())
  with check (is_staff() or can_market());

drop policy if exists giveaway_vendor_read on public.giveaway_campaigns;
create policy giveaway_vendor_read on public.giveaway_campaigns for select to authenticated
  using (vendor_id is not null and vendor_id = my_vendor_id());

alter table public.giveaway_campaigns add column if not exists proposal_note text not null default ''
  check (length(proposal_note) <= 600);

create or replace function public.propose_giveaway(p_title text, p_product uuid, p_days int default 10, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := my_vendor_id(); p products%rowtype; base text; s text; n int := 0; new_id uuid; days int;
begin
  if v is null then raise exception 'Only an approved seller can propose a giveaway'; end if;
  if not exists (select 1 from vendors where id = v and status = 'approved') then
    raise exception 'Your shop must be approved first';
  end if;
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'Give the giveaway a title'; end if;
  select * into p from products where id = p_product and vendor_id = v;
  if not found then raise exception 'Choose one of your own products as the prize'; end if;
  if p.status <> 'published' then raise exception 'The prize must be a product that is live in your shop'; end if;
  -- Three waiting at once is plenty, and stops the list being flooded.
  if (select count(*) from giveaway_campaigns where vendor_id = v and status = 'draft') >= 3 then
    raise exception 'You already have three proposals waiting. We will answer those first.';
  end if;
  days := least(greatest(coalesce(p_days, 10), 3), 30);

  base := trim(both '-' from regexp_replace(lower(trim(p_title)), '[^a-z0-9]+', '-', 'g'));
  base := left(coalesce(nullif(base, ''), 'giveaway'), 48);
  if length(base) < 3 then base := base || '-giveaway'; end if;
  s := base;
  while exists (select 1 from giveaway_campaigns where slug = s) loop
    n := n + 1; s := left(base, 48) || '-' || n;
  end loop;

  insert into giveaway_campaigns (slug, title, product_id, prize_text, prize_value, winners,
                                  vendor_id, closes_at, status, prize_paid_by, proposal_note, created_by)
  values (s, left(trim(p_title), 140), p.id, left(p.name, 200), p.price, 1,
          v, now() + make_interval(days => days), 'draft', 'vendor',
          left(coalesce(p_note, ''), 600), auth.uid())
  returning id into new_id;
  perform log_audit('giveaway.proposed', 'giveaway_campaigns', new_id, null,
    jsonb_build_object('vendor', v, 'product', p.id, 'days', days));
  return jsonb_build_object('id', new_id, 'slug', s, 'status', 'draft');
end $$;
revoke all on function public.propose_giveaway(text, uuid, int, text) from public, anon;
grant execute on function public.propose_giveaway(text, uuid, int, text) to authenticated;

-- A seller may take back a proposal that has not been opened yet.
create or replace function public.withdraw_giveaway_proposal(p_slug text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update giveaway_campaigns set status = 'cancelled'
   where slug = p_slug and vendor_id = my_vendor_id() and status = 'draft';
  if not found then raise exception 'Only a proposal that is still waiting can be withdrawn'; end if;
end $$;
revoke all on function public.withdraw_giveaway_proposal(text) from public, anon;
grant execute on function public.withdraw_giveaway_proposal(text) to authenticated;

-- =====================================================================
-- 3. Getting a seller or affiliate back into an account they are locked out of
-- =====================================================================
-- Somebody who has lost both their password and their Google account cannot
-- sign in, and their earnings sit behind that login. They sign in with a new
-- Google account and ask. A founder rings the phone number ALREADY ON RECORD
-- for the shop or affiliate, and only then moves the account across.
--
-- What stops this being a way to steal earnings:
--   · the request never says whether the phone number matched anything;
--   · only a founder can approve, and must record that they rang the number
--     on record and what was said;
--   · the number on the request must be the number on the account;
--   · payouts from that account are paused for a waiting period afterwards,
--     so the real owner has time to object before any money moves;
--   · every decision is written to the audit log.

alter table public.vendors add column if not exists payout_hold_until timestamptz;
alter table public.resellers add column if not exists payout_hold_until timestamptz;

create table if not exists public.account_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('vendor','reseller')),
  claimed_phone text not null check (length(claimed_phone) between 9 and 20),
  claimed_name text not null default '' check (length(claimed_name) <= 140),
  note text not null default '' check (length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  matched_id uuid,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '' check (length(decision_note) <= 1000),
  created_at timestamptz not null default now()
);
create unique index if not exists account_recovery_one_pending
  on public.account_recovery_requests(requester) where status = 'pending';
alter table public.account_recovery_requests enable row level security;
revoke all on public.account_recovery_requests from anon, authenticated;
grant select on public.account_recovery_requests to authenticated;

drop policy if exists recovery_own_read on public.account_recovery_requests;
create policy recovery_own_read on public.account_recovery_requests for select to authenticated
  using (requester = auth.uid() or is_founder());

create or replace function public.request_account_recovery(p_kind text, p_phone text, p_name text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); digits text;
begin
  if me is null then raise exception 'Sign in with the Google account you want to use from now on'; end if;
  if p_kind not in ('vendor','reseller') then raise exception 'Say whether it is a shop or an affiliate account'; end if;
  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(digits) < 9 or length(digits) > 15 then
    raise exception 'Enter the phone number that is on the account';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the name on the account'; end if;
  if exists (select 1 from vendors where user_id = me) or exists (select 1 from resellers where user_id = me) then
    raise exception 'This login already has a shop or affiliate account';
  end if;
  if (select role::text from profiles where id = me) is distinct from 'customer' then
    raise exception 'Use a new, ordinary login for this request';
  end if;
  if exists (select 1 from account_recovery_requests where requester = me and status = 'pending') then
    raise exception 'You already have a request waiting. We will ring the number on the account.';
  end if;
  -- Three in thirty days is the most one login may ask.
  if (select count(*) from account_recovery_requests
       where requester = me and created_at > now() - interval '30 days') >= 3 then
    raise exception 'Too many requests. Please contact ZaMarket directly.';
  end if;
  insert into account_recovery_requests (requester, kind, claimed_phone, claimed_name, note)
  values (me, p_kind, digits, left(trim(p_name), 140), left(coalesce(p_note, ''), 1000));
  -- The same answer whether or not the number belongs to an account.
  return jsonb_build_object('received', true);
end $$;
revoke all on function public.request_account_recovery(text, text, text, text) from public, anon;
grant execute on function public.request_account_recovery(text, text, text, text) to authenticated;

-- What a founder sees: each waiting request beside the accounts whose phone
-- number on record matches it.
create or replace function public.account_recovery_queue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not is_founder() then raise exception 'Founders only'; end if;
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb) into out from (
    select r.id, r.kind, r.claimed_phone, r.claimed_name, r.note, r.status, r.created_at,
           r.decided_at, r.decision_note,
           rp.email as requester_email, rp.full_name as requester_name,
           case when r.kind = 'vendor' then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id', v.id, 'name', v.business_name, 'owner', v.owner_name,
                      'phone', v.phone, 'email', v.email, 'status', v.status,
                      'since', v.created_at)), '[]'::jsonb)
               from vendors v where phone_key(v.phone) = phone_key(r.claimed_phone))
           else (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id', a.id, 'name', a.full_name, 'owner', a.full_name,
                      'phone', a.phone, 'email', a.email, 'status', a.status,
                      'since', a.created_at)), '[]'::jsonb)
               from resellers a where phone_key(a.phone) = phone_key(r.claimed_phone))
           end as matches
      from account_recovery_requests r
      left join profiles rp on rp.id = r.requester
     where r.status = 'pending' or r.created_at > now() - interval '60 days'
  ) t;
  return out;
end $$;
revoke all on function public.account_recovery_queue() from public, anon;
grant execute on function public.account_recovery_queue() to authenticated;

create or replace function public.decide_account_recovery(
  p_request uuid, p_approve boolean, p_target uuid default null,
  p_called boolean default false, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r account_recovery_requests%rowtype; old_uid uuid; on_record text; mail text;
        hold_days int; hold_until timestamptz;
begin
  if not is_founder() then raise exception 'Founders only'; end if;
  select * into r from account_recovery_requests where id = p_request for update;
  if not found then raise exception 'No such request'; end if;
  if r.status <> 'pending' then raise exception 'That request has already been decided'; end if;

  if not p_approve then
    update account_recovery_requests
       set status = 'declined', decided_by = auth.uid(), decided_at = now(),
           decision_note = left(coalesce(p_note, ''), 1000)
     where id = r.id;
    perform log_audit('account.recovery_declined', 'account_recovery_requests', r.id, null,
      jsonb_build_object('kind', r.kind), left(coalesce(p_note, ''), 500));
    return jsonb_build_object('status', 'declined');
  end if;

  if not coalesce(p_called, false) then
    raise exception 'Ring the phone number on record first, and confirm that you did';
  end if;
  if length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'Write down who you spoke to and what they said';
  end if;
  if p_target is null then raise exception 'Choose the account to recover'; end if;
  if exists (select 1 from vendors where user_id = r.requester)
     or exists (select 1 from resellers where user_id = r.requester) then
    raise exception 'The new login already has a shop or affiliate account';
  end if;
  if (select role::text from profiles where id = r.requester) is distinct from 'customer' then
    raise exception 'The new login is not an ordinary customer login';
  end if;

  if r.kind = 'vendor' then
    select user_id, phone into old_uid, on_record from vendors where id = p_target for update;
  else
    select user_id, phone into old_uid, on_record from resellers where id = p_target for update;
  end if;
  if not found then raise exception 'No such account'; end if;
  if phone_key(on_record) is distinct from phone_key(r.claimed_phone) then
    raise exception 'The number on the request is not the number on that account';
  end if;
  if old_uid = r.requester then raise exception 'That login already owns this account'; end if;

  hold_days := greatest(coalesce((select (value #>> '{}')::int from settings where key = 'recovery_hold_days'), 7), 1);
  hold_until := now() + make_interval(days => hold_days);
  select email into mail from profiles where id = r.requester;

  if r.kind = 'vendor' then
    update vendors set user_id = r.requester, email = coalesce(mail, email), payout_hold_until = hold_until
     where id = p_target;
    update profiles set role = 'vendor' where id = r.requester and role = 'customer';
  else
    update resellers set user_id = r.requester, email = coalesce(mail, email), payout_hold_until = hold_until
     where id = p_target;
    update profiles set role = 'reseller' where id = r.requester and role = 'customer';
  end if;

  -- The old login keeps existing as an ordinary customer and no longer opens
  -- the shop. Staff roles are never touched from here.
  if old_uid is not null
     and not exists (select 1 from vendors where user_id = old_uid)
     and not exists (select 1 from resellers where user_id = old_uid) then
    update profiles set role = 'customer' where id = old_uid and role in ('vendor', 'reseller');
  end if;

  update account_recovery_requests
     set status = 'approved', matched_id = p_target, decided_by = auth.uid(), decided_at = now(),
         decision_note = left(trim(p_note), 1000)
   where id = r.id;
  perform log_audit('account.recovered', case when r.kind = 'vendor' then 'vendors' else 'resellers' end,
    p_target, jsonb_build_object('user_id', old_uid),
    jsonb_build_object('user_id', r.requester, 'payout_hold_until', hold_until),
    left(trim(p_note), 500));
  return jsonb_build_object('status', 'approved', 'payout_hold_until', hold_until);
end $$;
revoke all on function public.decide_account_recovery(uuid, boolean, uuid, boolean, text) from public, anon;
grant execute on function public.decide_account_recovery(uuid, boolean, uuid, boolean, text) to authenticated;

insert into public.settings (key, value, description)
values ('recovery_hold_days', '7', 'Days payouts stay paused on an account after it is moved to a new login')
on conflict (key) do nothing;

-- The pause itself. A trigger rather than a change to request_payout, so
-- whichever version of that function is live, the pause holds.
create or replace function public.payout_hold_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare until timestamptz;
begin
  if new.vendor_id is not null then
    select payout_hold_until into until from vendors where id = new.vendor_id;
  elsif new.reseller_id is not null then
    select payout_hold_until into until from resellers where id = new.reseller_id;
  end if;
  if until is not null and until > now() then
    raise exception 'Payouts on this account are paused until % because its login was changed. Your earnings are safe and nothing is lost.',
      to_char(until at time zone 'Africa/Lusaka', 'DD Mon YYYY');
  end if;
  return new;
end $$;
drop trigger if exists trg_payout_hold on public.payouts;
create trigger trg_payout_hold before insert on public.payouts
  for each row execute function public.payout_hold_guard();

-- =====================================================================
-- 4. Allowance for the small AI helpers (plain product names, lead messages)
-- =====================================================================
-- Each use costs a little money, so each signed-in person gets a fixed number
-- an hour and a day. Sellers may use the listing helper; only staff and
-- marketing may use the lead helper.

create table if not exists public.ai_assist_uses (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  task text not null check (task in ('listing','lead')),
  created_at timestamptz not null default now()
);
create index if not exists ai_assist_uses_user_idx on public.ai_assist_uses(user_id, created_at desc);
alter table public.ai_assist_uses enable row level security;
revoke all on public.ai_assist_uses from anon, authenticated;

create or replace function public.claim_ai_assist(p_task text) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); staff boolean; per_hour int := 12; per_day int := 30;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  staff := is_staff() or can_market();
  if p_task = 'lead' then
    if not staff then raise exception 'Marketing permission required' using errcode = '42501'; end if;
  elsif p_task = 'listing' then
    if not (staff or exists (select 1 from vendors where user_id = uid and status = 'approved')) then
      raise exception 'Only sellers and staff can use this' using errcode = '42501';
    end if;
  else
    raise exception 'Unknown task';
  end if;
  perform pg_advisory_xact_lock(hashtext('assist:' || uid::text));
  if staff then per_hour := 40; per_day := 150; end if;
  if (select count(*) from ai_assist_uses where user_id = uid and created_at >= now() - interval '1 hour') >= per_hour
     or (select count(*) from ai_assist_uses where user_id = uid and created_at >= now() - interval '1 day') >= per_day then
    return false;
  end if;
  insert into ai_assist_uses (user_id, task) values (uid, p_task);
  return true;
end $$;
revoke all on function public.claim_ai_assist(text) from public, anon;
grant execute on function public.claim_ai_assist(text) to authenticated;
