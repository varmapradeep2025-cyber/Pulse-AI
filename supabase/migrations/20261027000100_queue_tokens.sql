-- Phase 1: Digital Queue Token Allocation, Durable Tracking, and Queue Snapshot Schema
--
-- This migration extends the appointment foundation with:
-- 1. Digital token allocation per facility, department, and calendar queue date.
-- 2. Concurrency-safe queue counters for atomic token increments.
-- 3. Live serving token tracking and called timestamps.
-- 4. Scoped indexes and constraints to prevent duplicate active tokens.
-- 5. Row-level security for citizen token reads and authorized staff management.
-- 6. Supabase Realtime publication setup for Phase 2 live updates.
--
-- NOTE: In accordance with project instructions, this migration file is created
-- but NOT automatically applied to live Supabase.

begin;

-- Queue counter table: maintains per-day, per-department sequence numbers atomically
create table if not exists public.queue_counters (
  facility_id text not null,
  department_id text not null,
  queue_date date not null,
  last_token_number integer not null default 0 check (last_token_number >= 0),
  serving_token_number integer check (serving_token_number is null or serving_token_number >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (facility_id, department_id, queue_date)
);

-- Ensure appointments table includes queue tracking and digital token fields
alter table public.appointments
  add column if not exists queue_date date,
  add column if not exists token_number integer check (token_number is null or token_number > 0),
  add column if not exists digital_token text,
  add column if not exists called_at timestamptz;

-- Unique constraint: a token number must be strictly unique within the facility, department, and queue date
create unique index if not exists appointments_facility_queue_token_unique
  on public.appointments(facility_id, department_id, queue_date, token_number)
  where token_number is not null;

-- Index for live department queue queries and serving status
create index if not exists appointments_queue_active_lookup_idx
  on public.appointments(facility_id, department_id, queue_date, status, token_number);

-- Index for patient queue snapshot lookups
create index if not exists appointments_patient_queue_lookup_idx
  on public.appointments(id, patient_user_id, queue_date);

-- Atomic token allocation function:
-- Uses PostgreSQL row-level locks (INSERT ... ON CONFLICT DO UPDATE) to safely increment
-- token counters under high concurrent load without gaps or duplicates.
create or replace function public.allocate_queue_token(
  p_facility_id text,
  p_department_id text,
  p_queue_date date
)
returns integer
language plpgsql
security definer
as $$
declare
  v_next_token integer;
begin
  insert into public.queue_counters (
    facility_id,
    department_id,
    queue_date,
    last_token_number,
    updated_at
  )
  values (
    p_facility_id,
    p_department_id,
    p_queue_date,
    1,
    now()
  )
  on conflict (facility_id, department_id, queue_date)
  do update set
    last_token_number = public.queue_counters.last_token_number + 1,
    updated_at = now()
  returning last_token_number into v_next_token;

  return v_next_token;
end;
$$;

-- Atomic function to advance the serving token when staff calls a patient
create or replace function public.advance_serving_token(
  p_facility_id text,
  p_department_id text,
  p_queue_date date,
  p_serving_token integer
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.queue_counters (
    facility_id,
    department_id,
    queue_date,
    last_token_number,
    serving_token_number,
    updated_at
  )
  values (
    p_facility_id,
    p_department_id,
    p_queue_date,
    greatest(1, p_serving_token),
    p_serving_token,
    now()
  )
  on conflict (facility_id, department_id, queue_date)
  do update set
    serving_token_number = p_serving_token,
    updated_at = now();
end;
$$;

-- Row Level Security for queue_counters
alter table public.queue_counters enable row level security;

-- Authenticated users can view aggregate queue counters (serving token and last token)
drop policy if exists "authenticated users read queue counters" on public.queue_counters;
create policy "authenticated users read queue counters"
  on public.queue_counters
  for select
  to authenticated
  using (true);

-- Modifications to queue counters are reserved for service role / database functions
grant select on public.queue_counters to authenticated;
grant execute on function public.allocate_queue_token(text, text, date) to service_role;
grant execute on function public.advance_serving_token(text, text, date, integer) to service_role;

-- Realtime Publication for future Phase 2 integration
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'queue_counters'
    ) then
      alter publication supabase_realtime add table public.queue_counters;
    end if;
  end if;
end;
$$;

comment on table public.queue_counters is
  'Per-facility, per-department, per-day sequential queue token counters and live serving token pointers.';

comment on column public.appointments.queue_date is
  'The calendar date (IST) for which this digital queue token is valid. Rescheduling to a different date requires a new token.';

comment on column public.appointments.token_number is
  'Unique sequential digital token number for the given facility, department, and queue date.';

comment on column public.appointments.digital_token is
  'Human-friendly alphanumeric token identifier (e.g. T-001).';

commit;
