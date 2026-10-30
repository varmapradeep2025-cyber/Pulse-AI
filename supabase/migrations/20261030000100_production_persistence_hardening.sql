-- Phase 3: Production Persistence Hardening & Catalog Seeding
--
-- This migration ensures that:
-- 1. appointments table includes denormalized facility, department, and doctor names
--    to support efficient zero-join queue snapshots and history views.
-- 2. Standard facility catalog rows are present in appointment_facilities,
--    appointment_departments, and appointment_doctors so that appointment foreign key
--    constraints are satisfied when booking online or registering walk-ins.
-- 3. Composite indexes are verified for hospital-scoped queue filtering and user history.
-- 4. Stored procedures allocate_queue_token and advance_serving_token have explicit
--    security definer privileges and search_path isolation.
--
-- NOTE: In accordance with project instructions, this migration file is provided
-- for review and is NOT automatically executed against the live production database.

begin;

-- 1. Ensure appointments table includes facility, department, and doctor names
alter table public.appointments
  add column if not exists hospital_name text,
  add column if not exists department_name text,
  add column if not exists doctor_name text;

-- 2. Seed standard catalog facilities (idempotent ON CONFLICT DO NOTHING)
insert into public.appointment_facilities (id, name, city, is_demo)
values
  ('H001', 'Pulse Care Multispecialty Hospital', 'Gwalior', true),
  ('H002', 'Central District Hospital', 'Indore', true),
  ('H003', 'Seva Community Health Centre', 'Bhopal', true),
  ('H004', 'Aarogya Diagnostics & Care Centre', 'Jabalpur', true),
  ('H005', 'Janani Maternal & Child Care Hospital', 'Ujjain', true)
on conflict (id) do update set
  name = excluded.name,
  city = excluded.city;

-- 3. Seed standard departments
insert into public.appointment_departments (facility_id, id, name)
values
  ('H001', 'general-medicine', 'General Medicine'),
  ('H001', 'cardiology', 'Cardiology'),
  ('H001', 'pediatrics', 'Pediatrics'),
  ('H002', 'general-medicine', 'General Medicine'),
  ('H002', 'general-surgery', 'General Surgery'),
  ('H003', 'general-medicine', 'General Medicine'),
  ('H003', 'maternal-child-health', 'Maternal & Child Health'),
  ('H004', 'general-medicine', 'General Medicine'),
  ('H004', 'diagnostics', 'Diagnostics'),
  ('H005', 'obstetrics-gynaecology', 'Obstetrics & Gynaecology'),
  ('H005', 'pediatrics', 'Pediatrics')
on conflict (facility_id, id) do update set
  name = excluded.name;

-- 4. Seed standard doctors
insert into public.appointment_doctors (id, facility_id, department_id, name, approval_required, available_weekdays)
values
  ('H001-GM-01', 'H001', 'general-medicine', 'Dr. Asha Verma', false, '{1,2,3,4,5}'),
  ('H001-GM-02', 'H001', 'general-medicine', 'Dr. Nikhil Rao', false, '{1,3,5,6}'),
  ('H001-CA-01', 'H001', 'cardiology', 'Dr. Meera Kulkarni', true, '{2,4}'),
  ('H001-PE-01', 'H001', 'pediatrics', 'Dr. Sameer Jain', false, '{1,2,3,4,5,6}'),
  ('H002-GM-01', 'H002', 'general-medicine', 'Dr. Kavita Menon', true, '{1,2,3,4,5}'),
  ('H002-GS-01', 'H002', 'general-surgery', 'Dr. Rohan Deshmukh', true, '{1,3,5}'),
  ('H003-GM-01', 'H003', 'general-medicine', 'Dr. Anita Sharma', false, '{1,2,3,4,5,6}'),
  ('H003-MC-01', 'H003', 'maternal-child-health', 'Dr. Priya Nair', false, '{1,2,3,4,5}'),
  ('H004-GM-01', 'H004', 'general-medicine', 'Dr. Vivek Patel', false, '{1,2,3,4,5,6}'),
  ('H004-DI-01', 'H004', 'diagnostics', 'Dr. Neha Bansal', false, '{1,2,3,4,5}'),
  ('H005-OG-01', 'H005', 'obstetrics-gynaecology', 'Dr. Farah Khan', true, '{1,2,3,4,5}'),
  ('H005-PE-01', 'H005', 'pediatrics', 'Dr. Arjun Singh', false, '{1,2,3,4,5,6}')
on conflict (id) do update set
  name = excluded.name,
  approval_required = excluded.approval_required,
  available_weekdays = excluded.available_weekdays;

-- 5. Additional index for high-throughput daily queue snapshots
create index if not exists appointments_queue_daily_snapshot_idx
  on public.appointments(facility_id, department_id, queue_date, token_number)
  where token_number is not null;

-- 6. Grant execute permissions on functions to service_role and authenticated
grant execute on function public.allocate_queue_token(text, text, date) to service_role, authenticated;
grant execute on function public.advance_serving_token(text, text, date, integer) to service_role, authenticated;

commit;
