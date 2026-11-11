-- 0006 · private storage bucket for exported CVs (DESIGN §2 "Export - decided")
--
-- Exports are kept at <user_id>/<application_id>/<cv_id>.<pdf|docx> and the path is
-- written to application_cvs.file_path. The bucket is private; these policies give each
-- signed-in user read/write on their own top-level folder only - the same posture as the
-- RLS on every table. The app reads the bucket name from CV_EXPORT_BUCKET.
--
-- Idempotent: safe on the live project and on a fresh project built from schema.sql.

insert into storage.buckets (id, name, public)
values ('cv-exports', 'cv-exports', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cv exports: own folder read') then
    create policy "cv exports: own folder read" on storage.objects for select to authenticated
      using (bucket_id = 'cv-exports' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cv exports: own folder write') then
    create policy "cv exports: own folder write" on storage.objects for insert to authenticated
      with check (bucket_id = 'cv-exports' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cv exports: own folder update') then
    create policy "cv exports: own folder update" on storage.objects for update to authenticated
      using (bucket_id = 'cv-exports' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
