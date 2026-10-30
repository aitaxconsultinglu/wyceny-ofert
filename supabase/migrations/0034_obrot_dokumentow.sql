-- Obracanie dokumentów (skan w poziomie / w pionie): plik w magazynie nadpisywany obróconą wersją - zapis "upsert"
-- wymaga prawa do zmiany obiektu. Tylko pracownik i tylko plik istniejącego dokumentu (jak przy dodawaniu).
create policy dok_zmiana on storage.objects for update to authenticated
  using (bucket_id = 'dokumenty' and public.jest_pracownikiem()
         and exists (select 1 from public.dokumenty d where d.id = public.dokument_z_sciezki(name)))
  with check (bucket_id = 'dokumenty' and public.jest_pracownikiem()
              and exists (select 1 from public.dokumenty d where d.id = public.dokument_z_sciezki(name)));
