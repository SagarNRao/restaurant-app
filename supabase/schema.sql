-- ============================================================
-- Restaurant Attendance & Salary System — base schema
-- Run this in the Supabase SQL editor (or `supabase db push`)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type user_role as enum ('owner', 'manager', 'employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type leave_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------- Branches ----------
-- Each owner can have multiple branches.
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  location text,
  created_at timestamptz not null default now()
);

-- ---------- Profiles ----------
-- One row per auth user. Encodes the role + hierarchy:
--   owner:    owner_id = null,            manager_id = null
--   manager:  owner_id = <their owner>,    manager_id = null
--   employee: owner_id = <their owner>,    manager_id = <their manager>
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null,
  owner_id uuid references auth.users(id),
  manager_id uuid references auth.users(id),
  branch_id uuid references branches(id),
  created_at timestamptz not null default now()
);

create index if not exists profiles_owner_id_idx on profiles(owner_id);
create index if not exists profiles_manager_id_idx on profiles(manager_id);

-- ---------- Attendance ----------
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid references branches(id),
  check_in timestamptz not null default now(),
  check_out timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists attendance_employee_id_idx on attendance(employee_id);

-- ---------- Leave requests ----------
create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references auth.users(id) on delete cascade,
  manager_id uuid references auth.users(id),
  start_date date not null,
  end_date date not null,
  reason text,
  status leave_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists leave_requests_employee_id_idx on leave_requests(employee_id);
create index if not exists leave_requests_manager_id_idx on leave_requests(manager_id);

-- ============================================================
-- Row Level Security
-- Kept intentionally simple: no helper functions, just direct
-- column checks against auth.uid().
-- ============================================================

alter table branches enable row level security;
alter table profiles enable row level security;
alter table attendance enable row level security;
alter table leave_requests enable row level security;

-- ---------- profiles ----------
-- You can see your own row, your owner can see you, your manager can see you.
create policy "profiles_select" on profiles for select
using (
  id = auth.uid() or owner_id = auth.uid() or manager_id = auth.uid()
);

-- Only the owner can edit rows of people under them (this is how role changes happen).
create policy "profiles_update_by_owner" on profiles for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Anyone can update their own non-role fields (e.g. full_name) — app code should
-- avoid sending role changes here; for stricter enforcement, move role to its own
-- table later.
create policy "profiles_update_self" on profiles for update
using (id = auth.uid())
with check (id = auth.uid());

-- ---------- branches ----------
create policy "branches_select" on branches for select
using (
  owner_id = auth.uid()
  or id in (select branch_id from profiles where id = auth.uid())
);

create policy "branches_owner_manage" on branches for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- ---------- attendance ----------
create policy "attendance_select" on attendance for select
using (
  employee_id = auth.uid()
  or employee_id in (select id from profiles where manager_id = auth.uid())
  or employee_id in (select id from profiles where owner_id = auth.uid())
);

create policy "attendance_insert_self" on attendance for insert
with check (employee_id = auth.uid());

create policy "attendance_update_self" on attendance for update
using (employee_id = auth.uid())
with check (employee_id = auth.uid());

-- ---------- leave_requests ----------
create policy "leave_select" on leave_requests for select
using (
  employee_id = auth.uid()
  or manager_id = auth.uid()
  or employee_id in (select id from profiles where owner_id = auth.uid())
);

create policy "leave_insert_self" on leave_requests for insert
with check (employee_id = auth.uid());

-- Manager approves/rejects requests of people who report to them.
create policy "leave_update_manager" on leave_requests for update
using (manager_id = auth.uid())
with check (manager_id = auth.uid());
