-- Angielskie nazwy słowników dokładnie wg nazw polskich (uzupełnienie 0024).
update public.kategorie_uslug k set nazwa_en = v.en from (values
  ('zwijanie', 'Plate rolling / bending'), ('giecie_rur', 'Pipe bending'), ('ciecie', 'Laser / plasma cutting (cut parts as a service)'),
  ('obrobka', 'Machining (e.g. tubesheet drilling)'), ('pwht', 'Heat treatment (PWHT)'), ('malowanie', 'Shot blasting / painting'),
  ('trawienie', 'Pickling and passivation'), ('sekafenowanie', 'Sekaphen coating'), ('izolacja', 'Insulation'),
  ('ndt', 'NDT (RT/UT/PT/MT/VT)'), ('nft', 'Eddy current testing (ECT)'), ('proba', 'Pressure test'),
  ('odbiory', 'UDT / Notified Body inspections'), ('projekt', 'Design / fabrication documentation'),
  ('transport', 'Transport (normal / oversize)'), ('dzwig', 'Crane / equipment'), ('montaz', 'Disassembly / assembly'),
  ('pakowanie', 'Packing / crate')
) as v(kod, en) where k.kod = v.kod;

update public.kategorie_materialow k set nazwa_en = v.en from (values
  ('ksztaltowniki', 'Sections'), ('dennice', 'Heads'), ('blachy', 'Plates / cut parts'), ('rury_technologiczne', 'Process pipes and tubes'),
  ('rury_krocce', 'Nozzle pipes'), ('kolnierze', 'Flanges'), ('odkuwki', 'Forgings'), ('zlaczne', 'Fasteners'), ('uszczelki', 'Gaskets'),
  ('spawalnicze', 'Welding consumables'), ('antykorozyjne', 'Anti-corrosion materials (paints)'), ('prety', 'Bars'), ('inne', 'Other'),
  ('pomocnicze', 'Auxiliary materials (tools, abrasives)')
) as v(kod, en) where k.kod = v.kod;

update public.rodzaje_stali set nazwa_en = case kod
  when 'weglowa' then 'Carbon / low-alloy steel'
  when 'nierdzewna' then 'Austenitic stainless steel'
  else nazwa_en end;
