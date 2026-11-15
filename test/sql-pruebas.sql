\set ON_ERROR_STOP on
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
set role authenticated;
-- A crea casa
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select public.crear_hogar('Casa A') as hogar_a \gset
select codigo from hogares where id = :'hogar_a' \gset
-- B se une con el código
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select public.unirse_hogar(lower(:'codigo')) = :'hogar_a' as b_unido;
insert into articulos (id, hogar_id, nombre, unidad, categoria) values ('10000000-0000-0000-0000-000000000001', :'hogar_a', 'Arroz', 'g', 'Despensa');
select public.sumar_despensa('10000000-0000-0000-0000-000000000001', 1000) as tras_sumar;
select public.sumar_despensa('10000000-0000-0000-0000-000000000001', -1500) as tras_restar_no_negativo;
insert into recetas (id, hogar_id, nombre, raciones) values ('20000000-0000-0000-0000-000000000001', :'hogar_a', 'Arroz a la cubana', 4);
insert into receta_ingredientes (hogar_id, receta_id, articulo_id, cantidad) values (:'hogar_a','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',300);
insert into plan_comidas (hogar_id, fecha, momento, receta_id, raciones) values (:'hogar_a', current_date, 'cena', '20000000-0000-0000-0000-000000000001', 2);
insert into lista_compra (hogar_id, articulo_id, cantidad) values (:'hogar_a','10000000-0000-0000-0000-000000000001', 1000);
-- C, de otra casa, no ve nada de A ni puede escribir
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select public.crear_hogar('Casa C') <> :'hogar_a' as c_otra_casa;
select (select count(*) from recetas) + (select count(*) from despensa) + (select count(*) from lista_compra) + (select count(*) from articulos) + (select count(*) from hogares where id = :'hogar_a') as c_ve_de_a;
\set ON_ERROR_STOP off
insert into recetas (hogar_id, nombre) values (:'hogar_a', 'intruso');
select public.sumar_despensa('10000000-0000-0000-0000-000000000001', 5);
\set ON_ERROR_STOP on
-- A ve todo
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select count(*) as a_recetas, (select cantidad from despensa) as a_despensa from recetas;
reset role;
select count(*) as recetas_intrusas from recetas where nombre = 'intruso';
