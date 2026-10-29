-- Phase 2: Notification Infrastructure, Durable Scheduler, and Realtime Queue Events
--
-- This migration establishes:
-- 1. Notification Preferences: user-configurable reminder intervals and channel toggles.
-- 2. In-App Notifications: persistent, queryable notification store with read states.
-- 3. Web Push Subscriptions: browser/device push endpoints and encryption keys.
-- 4. Durable Scheduler & Outbox: background notification jobs with atomic row locking.
-- 5. Delivery Attempt Ledger: status audit for Email, Push, and SMS channels.
-- 6. Row-Level Security: strictly isolates citizen and staff records.
-- 7. Supabase Realtime publication setup for live notification updates.
--
-- NOTE: In accordance with project instructions, this migration file is created
-- but NOT automatically applied to live Supabase without explicit approval.

begin;

-- 1. Notification Preferences
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  push_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  in_app_enabled boolean not null default true,
  reminder_intervals integer[] not null default '{1440, 60, 15}',
  notify_approaching_turn boolean not null default true,
  notify_delay boolean not null default true,
  notify_appointment_changes boolean not null default true,
  phone_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. In-App Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  type text not null check (
    type in (
      'appointment_confirmed',
      'appointment_reminder',
      'appointment_rescheduled',
      'appointment_cancelled',
      'queue_registered',
      'queue_approaching_turn',
      'queue_called',
      'queue_delayed',
      'queue_paused',
      'queue_resumed',
      'consultation_completed'
    )
  ),
  title text not null check (length(trim(title)) > 0),
  message text not null check (length(trim(message)) > 0),
  link text,
  metadata jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, read)
  where read = false;

-- 3. Web Push Subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id, is_active);

-- 4. Durable Scheduler & Notification Outbox
create table if not exists public.scheduled_notifications (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  event_type text not null,
  channel text not null check (channel in ('in_app', 'email', 'push', 'sms')),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed', 'cancelled')
  ),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  last_attempt_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  claimed_at timestamptz,
  claimed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_notifications_due_idx
  on public.scheduled_notifications(status, scheduled_for)
  where status in ('pending', 'failed');

create index if not exists scheduled_notifications_appointment_idx
  on public.scheduled_notifications(appointment_id, status);

-- 5. Delivery Attempt Ledger
create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  scheduled_notification_id uuid references public.scheduled_notifications(id) on delete set null,
  channel text not null check (channel in ('in_app', 'email', 'push', 'sms')),
  recipient text not null,
  provider text not null,
  provider_message_id text,
  status text not null check (
    status in ('pending', 'accepted', 'delivered', 'failed', 'bounced')
  ),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists delivery_attempts_notification_idx
  on public.notification_delivery_attempts(scheduled_notification_id, created_at desc);

-- 6. Updated Timestamp Trigger Function
create or replace function public.set_notification_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row
execute function public.set_notification_updated_at();

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row
execute function public.set_notification_updated_at();

drop trigger if exists scheduled_notifications_set_updated_at on public.scheduled_notifications;
create trigger scheduled_notifications_set_updated_at
before update on public.scheduled_notifications
for each row
execute function public.set_notification_updated_at();

-- 7. Row Level Security Policies

-- Preferences: user reads and mutates their own row
alter table public.notification_preferences enable row level security;

drop policy if exists "users manage own notification preferences" on public.notification_preferences;
create policy "users manage own notification preferences"
  on public.notification_preferences
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- In-App Notifications: user reads and updates their own records
alter table public.notifications enable row level security;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users update own notification read state" on public.notifications;
create policy "users update own notification read state"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Push Subscriptions: user manages their own device registrations
alter table public.push_subscriptions enable row level security;

drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Scheduled Notifications and Outbox: service role access only
alter table public.scheduled_notifications enable row level security;
alter table public.notification_delivery_attempts enable row level security;

grant select, insert, update on public.notification_preferences to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

grant all on public.notification_preferences to service_role;
grant all on public.notifications to service_role;
grant all on public.push_subscriptions to service_role;
grant all on public.scheduled_notifications to service_role;
grant all on public.notification_delivery_attempts to service_role;

-- 8. Supabase Realtime Publication Registration
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end;
$$;

commit;
