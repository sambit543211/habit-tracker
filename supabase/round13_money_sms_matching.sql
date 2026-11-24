-- Sky · round 13: bank SMS matching. Already applied. Safe to re-run. Only adds things.
alter table public.expenses add column if not exists payee text;                          -- who the bank says you paid (from the SMS)
alter table public.expenses add column if not exists linked boolean not null default false;  -- your entry and the bank SMS matched as one payment
alter table public.expenses add column if not exists excluded boolean not null default false; -- "don't count" (own-account transfer, money lent…)
