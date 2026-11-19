-- 33. Requests from a seller's store: "Can I have lunch on Saturday too?",
--     an event order, something not on the shop. The customer leaves a name,
--     a phone and what they need; it becomes a lead for the team (with the
--     seller attached), the full request in its history, and the team
--     answers on WhatsApp or by phone. At most 3 requests an hour per phone.
--     Run after section 32. Safe to run more than once.

create or replace function submit_store_request(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v vendors%rowtype;
  v_name text := left(trim(coalesce(payload->>'name', '')), 80);
  v_phone text := norm_phone(payload->>'phone');
  v_what text := left(trim(coalesce(payload->>'what', '')), 600);
  v_when text := left(trim(coalesce(payload->>'when', '')), 80);
  v_kind text := case payload->>'kind' when 'extra_day' then 'Extra lunch day' when 'event' then 'Event or group order' when 'special' then 'Special order' else 'Request' end;
  v_reply text := case payload->>'reply' when 'call' then 'a phone call' else 'WhatsApp' end;
  v_lead uuid;
begin
  select * into v from vendors where slug = lower(coalesce(payload->>'store', '')) and status = 'approved' limit 1;
  if not found then raise exception 'This shop is not taking requests right now'; end if;
  if v_name = '' then raise exception 'Please enter your name'; end if;
  if length(v_phone) < 10 then raise exception 'Please enter a full phone number, e.g. 0977 123 456'; end if;
  if length(v_what) < 5 then raise exception 'Please say what you would like'; end if;
  if (select count(*) from lead_activities a join leads l on l.id = a.lead_id
      where l.phone = v_phone and a.note like 'Request%' and a.created_at > now() - interval '1 hour') >= 3 then
    raise exception 'We already have your requests. We will get back to you soon.';
  end if;
  v_lead := upsert_lead(v_name, v_phone, 'organic', left(v_kind || ' for ' || v.business_name || ': ' || v_what, 240), null, null, v.id, null, null, 'request');
  insert into lead_activities (lead_id, kind, note)
  values (v_lead, 'note', left('Request (' || v_kind || ') for ' || v.business_name || coalesce(', wanted ' || nullif(v_when, ''), '') || ': ' || v_what || '. Reply by ' || v_reply || '.', 1000));
  return jsonb_build_object('reference', 'R' || right(replace(v_lead::text, '-', ''), 6));
end $$;

revoke all on function submit_store_request(jsonb) from public;
grant execute on function submit_store_request(jsonb) to anon, authenticated;
