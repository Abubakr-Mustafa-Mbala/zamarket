-- Everybody goes on the wheel.
--
-- giveaway_public used to send the first 300 display names. With a thousand
-- entries that meant seven hundred people looking for themselves on a
-- recorded draw and not finding themselves. It does not matter that the
-- caption said so: what people see is a wheel they are not on, and the next
-- campaign they do not bother entering.
--
-- So the whole entry list goes out. The names are already only a first name
-- and an initial, so this adds no personal information — a 2,000-entry draw
-- is roughly 30KB of text, which is less than one product photograph.
--
-- The ceiling exists only so a runaway campaign cannot send a payload big
-- enough to hang a phone. It is set far above any realistic draw, and the
-- page still says plainly when it has been reached.
create or replace function public.giveaway_public(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; d giveaway_draws%rowtype;
begin
  select * into c from giveaway_campaigns where slug = p_slug
     and status in ('live','closed','drawn','fulfilled');
  if not found then return null; end if;
  select * into d from giveaway_draws where campaign_id = c.id;

  return jsonb_build_object(
    'slug', c.slug, 'title', c.title, 'description', c.description,
    'prize_text', c.prize_text, 'prize_value', c.prize_value,
    'winners', giveaway_winner_count(c.id), 'status', c.status, 'terms', c.terms,
    'area', c.area, 'min_age', c.min_age,
    'opens_at', c.opens_at, 'closes_at', c.closes_at,
    'product', (select jsonb_build_object('name', p.name, 'slug', p.slug,
                  'images', p.images, 'price', p.price, 'vendor_slug', v.slug,
                  'vendor_name', v.business_name, 'status', p.status,
                  'fulfilment', p.fulfilment, 'lead_time_days', p.lead_time_days,
                  'stock_available', p.stock_available, 'owner_type', p.owner_type)
                from products p left join vendors v on v.id = p.vendor_id
                where p.id = coalesce(
                  (select gp.product_id from giveaway_prizes gp
                    where gp.campaign_id = c.id and gp.product_id is not null
                    order by gp.rank limit 1),
                  c.product_id)),
    'prizes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rank', gp.rank, 'winners', gp.winners,
               'name', coalesce(p.name, gp.prize_text),
               'slug', p.slug, 'images', p.images,
               'value', coalesce(gp.prize_value, p.price),
               'vendor_name', v.business_name)
             order by gp.rank)
        from giveaway_prizes gp
        left join products p on p.id = gp.product_id
        left join vendors v on v.id = p.vendor_id
       where gp.campaign_id = c.id), '[]'::jsonb),
    'entries', (select count(*) from giveaway_entries where campaign_id = c.id and eligible),
    'mine', (select exists (select 1 from giveaway_entries
               where campaign_id = c.id and user_id = auth.uid())),
    -- Every eligible entry, in the order people entered.
    'names', coalesce((select jsonb_agg(x.display_name)
                from (select display_name from giveaway_entries
                       where campaign_id = c.id and eligible
                       order by created_at limit 20000) x), '[]'::jsonb),
    'result', case when d.campaign_id is null then null
                   else jsonb_build_object('winners', d.winners, 'drawn_at', d.drawn_at,
                                           'entry_count', d.entry_count) end
  );
end $$;

grant execute on function public.giveaway_public(text) to anon, authenticated;
