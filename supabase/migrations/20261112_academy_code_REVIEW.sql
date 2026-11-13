-- Each affiliate's access code for Al-Halaqa, the academy where affiliates
-- are trained. Staff create the affiliate's academy account in Al-Halaqa,
-- then save the code here; the affiliate sees it on their Academy page
-- beside the link.
--
-- Who can see it: the affiliate themselves and staff (the existing
-- read_reseller policy). Who can change it: staff only (staff_reseller).
-- Safe to run more than once.

alter table public.resellers add column if not exists academy_code text
  check (academy_code is null or length(academy_code) between 1 and 60);

-- An applicant writes their own row once, when applying. They must not be
-- able to fill in an academy code then: only staff hand those out.
create or replace function public.resellers_academy_code_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    if tg_op = 'INSERT' then
      new.academy_code := null;
    elsif new.academy_code is distinct from old.academy_code then
      new.academy_code := old.academy_code;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_resellers_academy_code on public.resellers;
create trigger trg_resellers_academy_code before insert or update on public.resellers
  for each row execute function public.resellers_academy_code_guard();
