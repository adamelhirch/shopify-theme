-- recipes-service schema v1
-- reference schema to migrate from JSON store to PostgreSQL

create table actors (
  id text primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('admin', 'editor', 'partner')),
  token_hash text,
  organization text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recipes (
  id uuid primary key,
  slug text not null unique,
  status text not null check (status in ('draft', 'pending', 'approved', 'rejected', 'archived')),
  access text not null check (access in ('free', 'member')),
  title text not null,
  page_url text,
  eyebrow text,
  subtitle text,
  summary text,
  description text,
  category text,
  difficulty jsonb not null default '{}'::jsonb,
  timing jsonb not null default '{}'::jsonb,
  serves integer,
  hero jsonb not null default '{}'::jsonb,
  search_terms jsonb not null default '[]'::jsonb,
  product jsonb not null default '{}'::jsonb,
  ingredient_groups jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  tips jsonb not null default '[]'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  submitted_by_actor_id text references actors(id),
  submitted_by_name text,
  submitted_by_type text,
  submitted_at timestamptz,
  validated_by_actor_id text references actors(id),
  validated_by_name text,
  validated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recipe_revisions (
  id uuid primary key,
  recipe_id uuid not null references recipes(id) on delete cascade,
  actor_id text references actors(id),
  actor_name text,
  event text not null,
  snapshot jsonb not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table moderation_notes (
  id uuid primary key,
  recipe_id uuid not null references recipes(id) on delete cascade,
  actor_id text references actors(id),
  actor_name text,
  status text not null,
  note text,
  created_at timestamptz not null default now()
);

create table publications (
  id uuid primary key,
  actor_id text references actors(id),
  actor_name text,
  published_count integer not null default 0,
  output text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key,
  actor_id text references actors(id),
  actor_name text,
  recipe_id uuid references recipes(id),
  recipe_slug text,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index recipes_status_idx on recipes(status);
create index recipes_access_idx on recipes(access);
create index recipe_revisions_recipe_idx on recipe_revisions(recipe_id, created_at desc);
create index moderation_notes_recipe_idx on moderation_notes(recipe_id, created_at desc);
create index audit_log_event_idx on audit_log(event, created_at desc);
