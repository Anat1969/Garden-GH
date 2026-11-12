-- הוחל על פרויקט cultura-GH (ktqmwpbzcnzkhjskqisy) דרך כלי Supabase.
-- הפרויקט משותף לאפליקציות אחרות, לכן קידומת garden_ לטבלאות ו-garden-permits לדלי.
create table public.garden_projects (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  address text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.garden_price_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null,
  description text not null,
  unit text not null,
  price numeric not null,
  category text,
  verified boolean not null default false,
  source text,
  price_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.garden_projects enable row level security;
alter table public.garden_price_items enable row level security;
-- קריאה וכתיבה רק כש-owner_id = auth.uid() (select/insert/update/delete לכל טבלה)
-- דלי garden-permits פרטי, תיקייה לכל משתמש: <uid>/<project>.pdf
