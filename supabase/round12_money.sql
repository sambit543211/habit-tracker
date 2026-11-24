-- Sky · round 12: Money (expenses). Already applied. Safe to re-run. Only adds things.
create table if not exists public.expenses (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  amount numeric(12,2) not null check (amount > 0),
  category text,            -- category id; null = "to sort" (e.g. from a bank SMS)
  mode text,                -- Cash, UPI, Card…
  note text,
  source text not null default 'app',  -- app | voice | sms
  sms_ref text,             -- hash of the bank SMS, so the same SMS is never logged twice
  at timestamptz not null default now()
);
create index if not exists expenses_user_day on public.expenses (user_id, day);
create unique index if not exists expenses_sms_once on public.expenses (user_id, sms_ref) where sms_ref is not null;
alter table public.expenses enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'expenses' and policyname = 'own rows') then
    create policy "own rows" on public.expenses for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;
grant select, insert, update, delete on public.expenses to authenticated;
alter table public.profiles add column if not exists money jsonb;  -- {categories:[{id,name,emoji,budget}], modes:[], merchants:{shop:categoryId}}
