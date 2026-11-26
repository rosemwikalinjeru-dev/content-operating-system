-- Private storage buckets. Object paths are "<user_id>/<random-uuid>.<ext>".
-- No public buckets; downloads use short-lived signed URLs created server-side.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('uploads', 'uploads', false, 2147483648, array[
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/webm',
    'image/png', 'image/jpeg', 'image/webp',
    'application/pdf', 'text/plain', 'text/markdown'
  ]),
  ('renders', 'renders', false, 2147483648, array[
    'video/mp4', 'image/png', 'image/jpeg', 'application/pdf', 'application/zip',
    'audio/mpeg', 'audio/wav', 'text/vtt', 'application/x-subrip', 'text/plain'
  ]),
  ('brand', 'brand', false, 52428800, array[
    'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'font/ttf', 'font/otf', 'font/woff2'
  ])
on conflict (id) do nothing;

-- Owner can read and upload inside their own folder of the three app buckets.
create policy "contentos_owner_select"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('uploads', 'renders', 'brand')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "contentos_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('uploads', 'brand')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Renders are written only by the media worker (service role). Original uploads are never
-- deleted or overwritten from the client: deletion of source media needs explicit approval
-- and runs server-side.
