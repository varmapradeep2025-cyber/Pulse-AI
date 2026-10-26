begin;

create table if not exists public.inventory_import_batches (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references auth.users(id) on delete set null,
  original_filename text not null check (length(trim(original_filename)) > 0),
  file_sha256 text not null check (length(file_sha256) = 64),
  dataset_kind text not null check (dataset_kind in ('synthetic', 'real')),
  correction_mode text not null check (correction_mode in ('reject', 'replace')),
  status text not null check (status in ('previewed', 'imported', 'rejected')),
  reporting_period_start date,
  reporting_period_end date,
  row_count integer not null default 0 check (row_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  replacement_count integer not null default 0 check (replacement_count >= 0),
  hospital_ids bigint[] not null default '{}'::bigint[],
  file_errors jsonb not null default '[]'::jsonb,
  file_warnings jsonb not null default '[]'::jsonb,
  validation_results jsonb not null default '[]'::jsonb,
  staged_rows jsonb,
  created_at timestamptz not null default now(),
  imported_at timestamptz,
  expires_at timestamptz not null,
  constraint inventory_import_batches_period_order check (
    reporting_period_start is null
    or reporting_period_end is null
    or reporting_period_end >= reporting_period_start
  )
);

create index if not exists inventory_import_batches_uploader_idx
  on public.inventory_import_batches(uploaded_by, created_at desc);

create index if not exists inventory_import_batches_recent_idx
  on public.inventory_import_batches(created_at desc);

create index if not exists inventory_import_batches_status_idx
  on public.inventory_import_batches(status, expires_at);

create index if not exists inventory_import_batches_hospitals_idx
  on public.inventory_import_batches using gin(hospital_ids);

create table if not exists public.inventory_daily_reports (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.inventory_import_batches(id) on delete restrict,
  uploaded_by uuid references auth.users(id) on delete set null,
  report_key text not null,
  report_date date not null,
  is_synthetic boolean not null,
  hospital_id bigint not null references public.hospitals(id),
  medicine_id bigint not null references public.medicines(id),
  medicine_name text not null check (length(trim(medicine_name)) > 0),
  unit text not null check (length(trim(unit)) > 0),
  opening_stock numeric(14, 2) not null check (opening_stock >= 0),
  quantity_received numeric(14, 2) not null check (quantity_received >= 0),
  quantity_dispensed numeric(14, 2) not null check (quantity_dispensed >= 0),
  quantity_expired_or_written_off numeric(14, 2) not null default 0 check (
    quantity_expired_or_written_off >= 0
  ),
  adjustments numeric(14, 2) not null default 0,
  closing_stock numeric(14, 2) not null check (closing_stock >= 0),
  minimum_stock_level numeric(14, 2) not null check (minimum_stock_level >= 0),
  safety_stock numeric(14, 2) check (safety_stock >= 0),
  reserved_stock numeric(14, 2) check (reserved_stock >= 0),
  pending_order_quantity numeric(14, 2) check (pending_order_quantity >= 0),
  supplier_id text,
  order_date date,
  expected_delivery_date date,
  actual_delivery_date date,
  typical_lead_time_days integer check (typical_lead_time_days >= 0),
  stockout_flag boolean,
  unmet_demand_quantity numeric(14, 2) check (unmet_demand_quantity >= 0),
  data_source text,
  created_at timestamptz not null default now(),
  imported_at timestamptz not null default now(),
  constraint inventory_daily_reports_key_unique unique (report_key, is_synthetic),
  constraint inventory_daily_reports_balance check (
    abs(
      closing_stock
      - (
        opening_stock
        + quantity_received
        - quantity_dispensed
        - quantity_expired_or_written_off
        + adjustments
      )
    ) < 0.000001
  ),
  constraint inventory_daily_reports_delivery_order check (
    expected_delivery_date is null
    or order_date is null
    or expected_delivery_date >= order_date
  )
);

create index if not exists inventory_daily_reports_lookup_idx
  on public.inventory_daily_reports(report_key, is_synthetic);

create index if not exists inventory_daily_reports_date_idx
  on public.inventory_daily_reports(is_synthetic, report_date desc);

create index if not exists inventory_daily_reports_hospital_idx
  on public.inventory_daily_reports(hospital_id, report_date desc);

create index if not exists inventory_daily_reports_batch_idx
  on public.inventory_daily_reports(batch_id);

alter table public.inventory_import_batches enable row level security;
alter table public.inventory_daily_reports enable row level security;

revoke all on table public.inventory_import_batches from anon, authenticated;
revoke all on table public.inventory_daily_reports from anon, authenticated;

grant select, insert, update, delete on table public.inventory_import_batches to service_role;
grant select, insert, update, delete on table public.inventory_daily_reports to service_role;

create or replace function public.commit_inventory_import(
  p_batch_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch record;
  v_conflicts integer := 0;
  v_imported integer := 0;
  v_imported_at timestamptz := now();
begin
  select *
  into v_batch
  from public.inventory_import_batches
  where id = p_batch_id
    and uploaded_by = p_user_id
  for update;

  if not found then
    raise exception 'BATCH_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_batch.status = 'imported' then
    return jsonb_build_object(
      'batch_id', v_batch.id,
      'status', 'imported',
      'dataset_kind', v_batch.dataset_kind,
      'imported_count', v_batch.accepted_count,
      'replaced_count', v_batch.replacement_count,
      'rejected_count', v_batch.rejected_count,
      'reporting_period_start', v_batch.reporting_period_start,
      'reporting_period_end', v_batch.reporting_period_end,
      'imported_at', v_batch.imported_at
    );
  end if;

  if v_batch.status <> 'previewed' then
    raise exception 'BATCH_NOT_IMPORTABLE' using errcode = 'P0001';
  end if;

  if v_batch.expires_at <= now() then
    raise exception 'BATCH_EXPIRED' using errcode = 'P0001';
  end if;

  if v_batch.staged_rows is null
    or jsonb_typeof(v_batch.staged_rows) <> 'array'
    or jsonb_array_length(v_batch.staged_rows) = 0
  then
    raise exception 'NO_ACCEPTED_ROWS' using errcode = 'P0001';
  end if;

  select count(*)
  into v_conflicts
  from jsonb_to_recordset(v_batch.staged_rows) as x(
    report_date date,
    hospital_id bigint,
    medicine_id bigint
  )
  join public.inventory_daily_reports r
    on r.report_date = x.report_date
   and r.hospital_id = x.hospital_id
   and r.medicine_id = x.medicine_id
   and r.is_synthetic = (v_batch.dataset_kind = 'synthetic');

  if v_batch.correction_mode = 'reject' and v_conflicts > 0 then
    raise exception 'EXISTING_REPORTS' using errcode = 'P0001';
  end if;

  insert into public.inventory_daily_reports (
    batch_id,
    uploaded_by,
    report_key,
    report_date,
    is_synthetic,
    hospital_id,
    medicine_id,
    medicine_name,
    unit,
    opening_stock,
    quantity_received,
    quantity_dispensed,
    quantity_expired_or_written_off,
    adjustments,
    closing_stock,
    minimum_stock_level,
    safety_stock,
    reserved_stock,
    pending_order_quantity,
    supplier_id,
    order_date,
    expected_delivery_date,
    actual_delivery_date,
    typical_lead_time_days,
    stockout_flag,
    unmet_demand_quantity,
    data_source,
    imported_at
  )
  select
    v_batch.id,
    v_batch.uploaded_by,
    x.report_date::text || '|' || x.hospital_id::text || '|' || x.medicine_id::text,
    x.report_date,
    v_batch.dataset_kind = 'synthetic',
    x.hospital_id,
    x.medicine_id,
    x.medicine_name,
    x.unit,
    x.opening_stock,
    x.quantity_received,
    x.quantity_dispensed,
    x.quantity_expired_or_written_off,
    x.adjustments,
    x.closing_stock,
    x.minimum_stock_level,
    x.safety_stock,
    x.reserved_stock,
    x.pending_order_quantity,
    x.supplier_id,
    x.order_date,
    x.expected_delivery_date,
    x.actual_delivery_date,
    x.typical_lead_time_days,
    x.stockout_flag,
    x.unmet_demand_quantity,
    x.data_source,
    v_imported_at
  from jsonb_to_recordset(v_batch.staged_rows) as x(
    report_date date,
    hospital_id bigint,
    medicine_id bigint,
    medicine_name text,
    unit text,
    opening_stock numeric,
    quantity_received numeric,
    quantity_dispensed numeric,
    quantity_expired_or_written_off numeric,
    adjustments numeric,
    closing_stock numeric,
    minimum_stock_level numeric,
    safety_stock numeric,
    reserved_stock numeric,
    pending_order_quantity numeric,
    supplier_id text,
    order_date date,
    expected_delivery_date date,
    actual_delivery_date date,
    typical_lead_time_days integer,
    stockout_flag boolean,
    unmet_demand_quantity numeric,
    data_source text
  )
  on conflict (report_key, is_synthetic) do update set
    batch_id = excluded.batch_id,
    uploaded_by = excluded.uploaded_by,
    medicine_name = excluded.medicine_name,
    unit = excluded.unit,
    opening_stock = excluded.opening_stock,
    quantity_received = excluded.quantity_received,
    quantity_dispensed = excluded.quantity_dispensed,
    quantity_expired_or_written_off = excluded.quantity_expired_or_written_off,
    adjustments = excluded.adjustments,
    closing_stock = excluded.closing_stock,
    minimum_stock_level = excluded.minimum_stock_level,
    safety_stock = excluded.safety_stock,
    reserved_stock = excluded.reserved_stock,
    pending_order_quantity = excluded.pending_order_quantity,
    supplier_id = excluded.supplier_id,
    order_date = excluded.order_date,
    expected_delivery_date = excluded.expected_delivery_date,
    actual_delivery_date = excluded.actual_delivery_date,
    typical_lead_time_days = excluded.typical_lead_time_days,
    stockout_flag = excluded.stockout_flag,
    unmet_demand_quantity = excluded.unmet_demand_quantity,
    data_source = excluded.data_source,
    imported_at = excluded.imported_at
  where v_batch.correction_mode = 'replace';

  get diagnostics v_imported = row_count;

  if v_imported <> v_batch.accepted_count then
    raise exception 'IMPORT_RETRY_REQUIRED' using errcode = 'P0001';
  end if;

  update public.inventory_import_batches
  set
    status = 'imported',
    imported_at = v_imported_at,
    replacement_count = v_conflicts,
    staged_rows = null
  where id = v_batch.id;

  return jsonb_build_object(
    'batch_id', v_batch.id,
    'status', 'imported',
    'dataset_kind', v_batch.dataset_kind,
    'imported_count', v_imported,
    'replaced_count', v_conflicts,
    'rejected_count', v_batch.rejected_count,
    'reporting_period_start', v_batch.reporting_period_start,
    'reporting_period_end', v_batch.reporting_period_end,
    'imported_at', v_imported_at
  );
end;
$$;

revoke all on function public.commit_inventory_import(uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_inventory_import(uuid, uuid) to service_role;

commit;
