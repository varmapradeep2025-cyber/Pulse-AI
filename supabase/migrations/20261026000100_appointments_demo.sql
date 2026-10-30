-- Appointments and tokenless queue foundation.
--
-- This migration is intentionally NOT applied by the application. The current
-- implementation uses a process-local demo service because the repository has
-- no verified appointment schema or catalog data. Review the existing database
-- before applying this file.
--
-- No appointment catalog rows are seeded here. Demo availability must never be
-- inserted as real hospital, doctor, or slot data.

begin;

create table if not exists public.appointment_facilities (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  city text not null default '',
  is_demo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.appointment_departments (
  id text not null,
  facility_id text not null references public.appointment_facilities(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  primary key (facility_id, id)
);

create table if not exists public.appointment_doctors (
  id text primary key,
  facility_id text not null,
  department_id text not null,
  name text not null check (length(trim(name)) > 0),
  approval_required boolean not null default false,
  available_weekdays smallint[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (facility_id, department_id)
    references public.appointment_departments(facility_id, id)
    on delete cascade
);

create table if not exists public.appointment_slots (
  slot_id text primary key,
  facility_id text not null,
  department_id text not null,
  doctor_id text not null references public.appointment_doctors(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint appointment_slot_time_order check (ends_at > starts_at),
  constraint appointment_slot_doctor_start_unique unique (doctor_id, starts_at),
  foreign key (facility_id, department_id)
    references public.appointment_departments(facility_id, id)
    on delete cascade
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  patient_user_id uuid references auth.users(id) on delete set null,
  patient_name text not null check (
    length(trim(patient_name)) between 2 and 80
  ),
  facility_id text not null references public.appointment_facilities(id),
  department_id text not null,
  doctor_id text not null references public.appointment_doctors(id),
  slot_id text references public.appointment_slots(slot_id) on delete set null,
  scheduled_at timestamptz not null,
  status text not null default 'confirmed' check (
    status in (
      'requested',
      'confirmed',
      'checked_in',
      'waiting',
      'in_consultation',
      'completed',
      'cancelled',
      'missed'
    )
  ),
  source text not null default 'online' check (
    source in ('online', 'walk_in', 'assisted')
  ),
  created_by_user_id uuid references auth.users(id) on delete set null,
  checked_in_at timestamptz,
  consultation_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  missed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (facility_id, department_id)
    references public.appointment_departments(facility_id, id)
);

-- No token number is stored or issued. Arrival is represented only by an
-- explicit checked_in status and checked_in_at timestamp.

create unique index if not exists appointments_active_slot_unique
  on public.appointments(slot_id)
  where slot_id is not null
    and status not in ('cancelled', 'missed');

create index if not exists appointments_patient_user_idx
  on public.appointments(patient_user_id, scheduled_at desc);

create index if not exists appointments_facility_queue_idx
  on public.appointments(facility_id, department_id, scheduled_at, status);

create table if not exists public.appointment_events (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_role text not null check (actor_role in ('patient', 'staff')),
  created_at timestamptz not null default now()
);

create index if not exists appointment_events_appointment_idx
  on public.appointment_events(appointment_id, created_at);

create or replace function public.set_appointment_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists appointments_set_updated_at on public.appointments;

create trigger appointments_set_updated_at
before update on public.appointments
for each row
execute function public.set_appointment_updated_at();

create or replace function public.is_appointment_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'appointment_staff') = 'true',
      false
    )
    or coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'appointment_staff',
      false
    );
$$;

alter table public.appointment_facilities enable row level security;
alter table public.appointment_departments enable row level security;
alter table public.appointment_doctors enable row level security;
alter table public.appointment_slots enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_events enable row level security;

drop policy if exists "authenticated users read appointment catalog" on public.appointment_facilities;
create policy "authenticated users read appointment catalog"
  on public.appointment_facilities
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated users read appointment departments" on public.appointment_departments;
create policy "authenticated users read appointment departments"
  on public.appointment_departments
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated users read appointment doctors" on public.appointment_doctors;
create policy "authenticated users read appointment doctors"
  on public.appointment_doctors
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated users read appointment slots" on public.appointment_slots;
create policy "authenticated users read appointment slots"
  on public.appointment_slots
  for select
  to authenticated
  using (true);

drop policy if exists "patients and staff read appointments" on public.appointments;
create policy "patients and staff read appointments"
  on public.appointments
  for select
  to authenticated
  using (
    patient_user_id = auth.uid()
    or public.is_appointment_staff()
  );

drop policy if exists "patients and staff read appointment events" on public.appointment_events;
create policy "patients and staff read appointment events"
  on public.appointment_events
  for select
  to authenticated
  using (
    public.is_appointment_staff()
    or exists (
      select 1
      from public.appointments
      where appointments.id = appointment_events.appointment_id
        and appointments.patient_user_id = auth.uid()
    )
  );

-- Writes are deliberately backend-only. The Express service uses the
-- service-role client after validating the user's Supabase bearer token.
-- Do not add direct client insert/update/delete policies without adding the
-- same ownership, transition, conflict, and staff checks at the database edge.

grant select on public.appointment_facilities to authenticated;
grant select on public.appointment_departments to authenticated;
grant select on public.appointment_doctors to authenticated;
grant select on public.appointment_slots to authenticated;
grant select on public.appointments to authenticated;
grant select on public.appointment_events to authenticated;

comment on table public.appointments is
  'Appointment records. Demo catalog rows are not real hospital operations unless separately reviewed and populated.';

comment on column public.appointments.status is
  'Legal transitions are enforced by the appointment service: requested -> confirmed/cancelled; confirmed -> waiting/cancelled/missed; checked_in -> waiting/cancelled (legacy); waiting -> in_consultation/cancelled/missed; in_consultation -> completed. Check-in sets waiting directly so no extra queue step is required.';

comment on column public.appointments.reference is
  'Patient-facing reference only. This is not a queue token.';

commit;
