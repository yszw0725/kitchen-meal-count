-- Phase 1: 拡張機能・型・テーブル・インデックス
-- 設計書 §5.3, §5.4 に対応

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 型
-- ---------------------------------------------------------------------------

create type meal_type as enum ('breakfast', 'lunch', 'dinner');
create type app_role as enum ('admin', 'kitchen');
create type exception_type as enum ('absent', 'present');

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role app_role not null default 'kitchen',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table resident_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null,
  sort_order int not null,
  is_active boolean not null default true
);

create table residents (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references resident_groups (id),
  name text not null,
  kana text,
  meal_form text[],
  entered_on date not null default current_date,
  left_on date,
  sort_order int not null default 0,
  note text,
  constraint residents_meal_form_valid check (
    meal_form is null
    or meal_form <@ array['kizami', 'diet', 'araimiji', 'chomiji']::text[]
  )
);

create table resident_default_meals (
  resident_id uuid not null references residents (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0=日 .. 6=土
  meal meal_type not null,
  eats boolean not null,
  primary key (resident_id, weekday, meal)
);

-- import_batches は meal_exceptions / daily_meal_extras から参照されるため先に作成
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references profiles (id),
  uploaded_at timestamptz not null default now(),
  original_filename text not null,
  storage_path text not null,
  status text not null check (
    status in ('pending_confirmation', 'confirmed', 'failed', 'cancelled')
  ),
  diff_summary jsonb,
  error_detail text
);

create table meal_exceptions (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents (id),
  date date not null,
  meal meal_type not null,
  type exception_type not null,
  note text,
  source_batch_id uuid references import_batches (id),
  created_at timestamptz not null default now(),
  unique (resident_id, date, meal)
);

create table kitchen_overrides (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents (id),
  date date not null check (date = current_date),
  meal meal_type not null,
  type exception_type not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution in ('kept', 'overwritten')),
  unique (resident_id, date, meal)
);

create table daily_meal_extras (
  date date not null,
  meal meal_type not null,
  staff_count int not null default 0 check (staff_count >= 0),
  visitor_count int not null default 0 check (visitor_count >= 0),
  source_batch_id uuid references import_batches (id),
  updated_at timestamptz not null default now(),
  primary key (date, meal)
);

create table count_overrides (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  meal meal_type not null,
  group_id uuid not null references resident_groups (id),
  override_count int not null check (override_count >= 0),
  reason text not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  unique (date, meal, group_id)
);

create table change_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles (id),
  table_name text not null,
  record_pk text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before jsonb,
  after jsonb,
  summary text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- インデックス (設計書 §5.4)
-- ---------------------------------------------------------------------------

create index idx_meal_exceptions_date_meal on meal_exceptions (date, meal);
create index idx_meal_exceptions_resident_date on meal_exceptions (resident_id, date);
create index idx_residents_active_group on residents (group_id) where left_on is null;
create index idx_change_logs_created_at on change_logs (created_at desc);
