-- 36. Meta Pixel (Facebook and Instagram ads), off until you paste an ID.
--
-- Adds a meta_pixel_id setting (empty = nothing from Facebook is loaded) and
-- lets visitors who are not signed in read the two tracking IDs, so the
-- Pixel and Google Analytics also work for shoppers, not only for people
-- who are signed in. Both IDs are public by nature (they appear in the page
-- for every visitor); no secret, price rule or customer detail is opened.

insert into settings (key, value, description) values
  ('meta_pixel_id', '""', 'Meta Pixel ID (numbers only, from Meta Events Manager). Leave empty and nothing from Facebook is loaded.')
on conflict (key) do nothing;

select ensure_policy('read_settings', 'settings', 'select',
  'key like ''company_%'' or key like ''social_%'' or key in (''local_delivery_fee'',''currency'',''delivery_included'',''departments'',''reseller_terms'',''vendor_terms'',''verification_on'',''analytics_id'',''meta_pixel_id'') or (auth.uid() is not null and key <> ''founder_emails'') or is_founder()');
