-- Number on the app icon (open promises today). Off by default.
alter table public.profiles add column if not exists icon_badge boolean not null default false;
