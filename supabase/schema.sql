-- Objectifs journaliers par utilisateur
create table user_goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null unique,
  calories   integer not null default 2000,
  proteins   integer not null default 150,
  carbs      integer not null default 200,
  fats       integer not null default 70,
  fibers     integer not null default 30,
  updated_at timestamptz default now()
);

-- Repas
create table meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  date       date not null,
  name       text not null default 'Repas',
  raw_input  text,
  calories   numeric(8,1) not null default 0,
  proteins   numeric(8,1) not null default 0,
  carbs      numeric(8,1) not null default 0,
  fats       numeric(8,1) not null default 0,
  fibers      numeric(8,1) not null default 0,
  ingredients jsonb,
  created_at  timestamptz default now()
);

-- Activités sportives
create table activities (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  date            date not null,
  name            text not null,
  type            text not null default 'sport',
  calories_burned numeric(8,1) not null,
  created_at      timestamptz default now()
);

-- Sécurité : chaque utilisateur ne voit que ses données
alter table user_goals enable row level security;
alter table meals       enable row level security;
alter table activities  enable row level security;

create policy "own goals"      on user_goals  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own meals"      on meals       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own activities" on activities  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
