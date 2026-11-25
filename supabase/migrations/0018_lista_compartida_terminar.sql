-- Botón «He terminado» en el enlace de la lista (WhatsApp) y aviso en la app.
-- Quien compra pulsa «He terminado»: se guarda cuándo y cuántas cosas cogió.
-- La app lo ve al momento (tiempo real) y avisa hasta que alguien de la casa toca «Vale».
-- Solo añade columnas y una función; no toca datos.

alter table public.listas_compartidas add column if not exists terminada_en timestamptz;
alter table public.listas_compartidas add column if not exists cogidas integer;
alter table public.listas_compartidas add column if not exists total integer;
alter table public.listas_compartidas add column if not exists visto boolean not null default false;

grant update (visto) on public.listas_compartidas to authenticated;

-- Para que la app se entere al momento.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listas_compartidas') then
    alter publication supabase_realtime add table public.listas_compartidas;
  end if;
end $$;

-- Ver la lista: ahora también dice si ya se terminó.
create or replace function public.ver_lista_compartida(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e public.listas_compartidas;
begin
  select * into e from public.listas_compartidas where token = p_token and caduca_en > now();
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'titulo', e.titulo,
    'caduca_en', e.caduca_en,
    'terminada_en', e.terminada_en,
    'cosas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nombre', c.nombre, 'detalle', c.detalle, 'categoria', c.categoria,
               'cogido', public.lista_compartida_fila(e, c) is not null) order by c.orden)
        from public.lista_compartida_cosas c where c.enlace_id = e.id), '[]'::jsonb));
end;
$$;

-- «He terminado» (p_terminada = true) o «Seguir marcando» (false). Devuelve la lista.
create or replace function public.terminar_lista_compartida(p_token text, p_terminada boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.listas_compartidas;
  hechas integer;
  todas integer;
begin
  select * into e from public.listas_compartidas where token = p_token and caduca_en > now() for update;
  if not found then
    raise exception 'Este enlace ya ha caducado';
  end if;
  if p_terminada then
    select count(*) filter (where public.lista_compartida_fila(e, c) is not null), count(*)
      into hechas, todas
      from public.lista_compartida_cosas c where c.enlace_id = e.id;
    update public.listas_compartidas
       set terminada_en = now(), cogidas = hechas, total = todas, visto = false
     where id = e.id;
  else
    update public.listas_compartidas set terminada_en = null, cogidas = null, total = null, visto = false
     where id = e.id;
  end if;
  return public.ver_lista_compartida(p_token);
end;
$$;

revoke all on function public.terminar_lista_compartida(text, boolean) from public;
grant execute on function public.terminar_lista_compartida(text, boolean) to anon, authenticated;
