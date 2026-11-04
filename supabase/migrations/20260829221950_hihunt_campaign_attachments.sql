alter table public.hr_campaigns
  add column if not exists poster_name text,
  add column if not exists poster_path text,
  add column if not exists poster_mime_type text;

alter table public.hr_campaigns
  add constraint hr_campaigns_poster_fields_complete_check
  check (
    (poster_name is null and poster_path is null and poster_mime_type is null)
    or (
      char_length(btrim(poster_name)) between 1 and 240
      and poster_path ~ '^drafts/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|gif|pdf)$'
      and poster_mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf')
    )
  );
