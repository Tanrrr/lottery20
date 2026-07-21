create table leagues (
  id uuid primary key default gen_random_uuid(),
  commissioner_token text not null unique,
  viewer_token text not null unique,
  name text not null,
  mode text not null check (mode in ('random', 'weighted')),
  status text not null default 'setup' check (status in ('setup', 'live', 'complete')),
  reveal_order jsonb,
  revealed_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  name text not null,
  weight integer
);

create table draft_results (
  league_id uuid not null references leagues(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  slot integer not null,
  primary key (league_id, team_id)
);

create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

create index teams_league_id_idx on teams(league_id);
create index draft_results_league_id_idx on draft_results(league_id);

-- All access goes through the Next.js server using the service_role key.
-- RLS is enabled with no policies, so the anon key (used only for realtime
-- subscriptions in the browser) cannot read or write these tables directly.
alter table leagues enable row level security;
alter table teams enable row level security;
alter table draft_results enable row level security;
alter table rate_limits enable row level security;
