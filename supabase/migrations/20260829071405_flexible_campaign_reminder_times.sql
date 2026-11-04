alter table public.campaign_reminder_deliveries
  drop constraint if exists campaign_reminder_deliveries_offset_hours_check;

alter table public.campaign_reminder_deliveries
  add constraint campaign_reminder_deliveries_offset_hours_check
  check (offset_hours > 0);
