-- recipes-service sqlite schema v1

create table if not exists recipes (
  id text primary key,
  slug text not null unique,
  status text not null,
  access text not null,
  title text not null,
  submitted_at text,
  validated_at text,
  updated_at text,
  payload text not null
);

create index if not exists recipes_status_idx on recipes(status);
create index if not exists recipes_access_idx on recipes(access);

create table if not exists recipe_revisions (
  id text primary key,
  recipe_id text not null,
  actor_name text,
  event text not null,
  created_at text not null,
  payload text not null
);

create index if not exists recipe_revisions_recipe_idx on recipe_revisions(recipe_id, created_at desc);

create table if not exists publications (
  id text primary key,
  actor_name text,
  published_count integer not null default 0,
  output text,
  created_at text not null,
  payload text not null
);

create table if not exists audit_log (
  id text primary key,
  actor_name text,
  recipe_slug text,
  event text not null,
  created_at text not null,
  payload text not null
);

create index if not exists audit_log_event_idx on audit_log(event, created_at desc);
