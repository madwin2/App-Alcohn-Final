# Base de datos (Supabase / Postgres 17)

- Proyecto único para Alcohn AI y la tienda web (región sa-east-1). Extensiones: `pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`.
- Realtime publica: `clientes`, `ordenes`, `sellos`, `tareas`, `programa`, `notificaciones`, `notificacion_destinatarios`.

## Fuentes y su confiabilidad

| Fuente | Estado |
|---|---|
| **DB en vivo** | Fuente de verdad |
| `migration_*.sql` (raíz) | Historia; no garantiza el estado actual (algunas funciones se redefinieron varias veces) |
| `src/lib/supabase/setup-migration.sql`, `database_schema.sql`, `database_documentation.md`, `database_estructure.md` | Desactualizados |
| `src/lib/supabase/types.ts` | Generado en algún momento; faltan columnas nuevas (el código usa `as any` en muchos lugares) |

## Cómo verificar el estado real (consultas de solo lectura)

```sql
-- Columnas de una tabla
select column_name, data_type, column_default from information_schema.columns
where table_schema='public' and table_name='sellos' order by ordinal_position;

-- CHECK constraints (valores permitidos de estados)
select conrelid::regclass, pg_get_constraintdef(oid) from pg_constraint
where contype='c' and connamespace='public'::regnamespace;

-- Triggers
select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers where trigger_schema='public';

-- Código de una función
select prosrc from pg_proc where proname='registrar_rehacer';

-- Cron
select jobname, schedule, command, active from cron.job;

-- RLS y políticas
select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r';
select tablename, policyname, cmd, roles, qual from pg_policies where schemaname='public';
```

⚠️ Varias funciones SQL contienen la **anon key** y URLs escritas en el código fuente (`enviar_webhook_pedido`, `enviar_confirmacion_web_order`, `enviar_meta_conversion`) y una IP/puerto del bot (`reintentar_webhooks_fallidos`). No copiarlas a documentos.

## Seguridad a nivel de filas

Ver [09-roles-permissions](../09-roles-permissions/README.md) y [audits/seguridad.md](../audits/seguridad.md).
