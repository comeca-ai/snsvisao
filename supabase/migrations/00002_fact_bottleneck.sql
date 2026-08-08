-- Taxonomia do "quero vender mais": qual gargalo comercial um goal ataca.
-- Alimenta conselho específico e o futuro motor de conexões.
alter table facts
  add column bottleneck text
  check (bottleneck in ('aquisicao', 'conversao', 'ticket', 'retencao', 'posicionamento'));

create index facts_bottleneck_idx on facts (tenant_id, bottleneck)
  where bottleneck is not null;
