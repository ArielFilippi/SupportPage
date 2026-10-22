-- ARIAE - esquema limpio para tickets
-- ATENCIÓN: borra la tabla tickets y sus datos actuales.
-- Si tenés datos reales que conservar, no ejecutes el DROP; hacé una migración en su lugar.

drop table if exists public.tickets cascade;

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique,
  title text not null check (char_length(title) between 3 and 160),
  device text not null check (char_length(device) between 1 and 120),
  os text check (os is null or char_length(os) <= 120),
  description text not null check (char_length(description) between 5 and 5000),
  reporter_name text not null default 'Anónimo' check (char_length(reporter_name) <= 160),
  reporter_email text check (reporter_email is null or char_length(reporter_email) <= 320),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_revision', 'resuelto', 'descartado')),
  admin_reply text check (admin_reply is null or char_length(admin_reply) <= 5000),
  created_at timestamptz not null default now()
);

create index tickets_created_at_idx on public.tickets (created_at desc);

alter table public.tickets enable row level security;

-- El público NO accede directamente a tickets.
revoke all on table public.tickets from anon;

-- En este proyecto, todo usuario autenticado será un docente creado manualmente.
revoke all on table public.tickets from authenticated;
grant select on table public.tickets to authenticated;
grant update (status, admin_reply) on table public.tickets to authenticated;

create policy "docentes pueden leer tickets"
on public.tickets
for select
to authenticated
using (true);

create policy "docentes pueden actualizar tickets"
on public.tickets
for update
to authenticated
using (true)
with check (true);
