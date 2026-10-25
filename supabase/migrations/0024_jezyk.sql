-- Dwujęzyczność (runda 2): język interfejsu w profilu użytkownika i angielskie nazwy słowników z bazy.

alter table public.profiles add column jezyk text not null default 'pl' check (jezyk in ('pl', 'en'));

/** Zmiana własnego języka interfejsu (profil zmienia tylko administrator - ta jedna kolumna dla każdego). */
create function public.ustaw_jezyk(p_jezyk text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_jezyk not in ('pl', 'en') then raise exception 'Nieznany język: %', p_jezyk; end if;
  update public.profiles set jezyk = p_jezyk where id = auth.uid();
end $$;
revoke execute on function public.ustaw_jezyk(text) from public, anon;
grant execute on function public.ustaw_jezyk(text) to authenticated;

-- Słowniki: nazwa angielska (brak = nazwa polska).
alter table public.kategorie_materialow add column nazwa_en text;
alter table public.kategorie_uslug add column nazwa_en text;
alter table public.rodzaje_stali add column nazwa_en text;
alter table public.klauzule add column tekst_en text;

update public.rodzaje_stali set nazwa_en = case kod
  when 'weglowa' then 'Carbon steel' when 'nierdzewna' then 'Stainless steel' when 'kwasoodporna' then 'Acid-resistant steel'
  when 'stopowa' then 'Alloy steel' when 'aluminium' then 'Aluminium' when 'miedz' then 'Copper' else null end
where nazwa_en is null;

update public.kategorie_materialow set nazwa_en = case kod
  when 'blachy' then 'Plates' when 'odkuwki' then 'Flanges and other forgings' when 'kolnierze' then 'Flanges'
  when 'rury_technologiczne' then 'Process pipes and tubes' when 'rury_krocce' then 'Nozzle pipes' when 'dennice' then 'Heads'
  when 'prety' then 'Bars' when 'ksztaltowniki' then 'Sections' when 'zlaczne' then 'Fasteners' when 'uszczelki' then 'Gaskets'
  when 'spawalnicze' then 'Welding consumables' when 'antykorozyjne' then 'Anti-corrosion' when 'armatura' then 'Valves and fittings'
  when 'izolacja' then 'Insulation' when 'inne' then 'Other' else null end
where nazwa_en is null;

update public.kategorie_uslug set nazwa_en = case kod
  when 'malowanie' then 'Painting' when 'srutowanie' then 'Shot blasting' when 'piaskowanie' then 'Sandblasting'
  when 'trawienie' then 'Pickling' when 'sekafenowanie' then 'Sekaphen coating' when 'pwht' then 'PWHT (heat treatment)'
  when 'obrobka_cieplna' then 'Heat treatment' when 'giecie' then 'Bending' when 'obrobka' then 'Machining' when 'ciecie' then 'Cutting'
  when 'izolacja' then 'Insulation' when 'montaz' then 'Assembly' when 'ndt' then 'NDT' when 'rtg' then 'Radiography (RT)'
  when 'ut' then 'Ultrasonic testing (UT)' when 'pt' then 'Penetrant testing (PT)' when 'udt' then 'UDT acceptance'
  when 'proba' then 'Pressure test' when 'odbiory' then 'Inspections and acceptance' when 'projekt' then 'Design'
  when 'dokumentacja' then 'Documentation' when 'transport' then 'Transport' when 'atesty' then 'Certificates' else null end
where nazwa_en is null;
