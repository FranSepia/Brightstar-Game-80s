-- ─── TABLA DE PUNTAJES ────────────────────────────────────────────────────────
-- Pegar entero en Supabase > SQL Editor > New query > Run.
--
-- La idea de seguridad es una sola: la anon key viaja en el bundle del juego y
-- cualquiera la puede leer, así que la base NO puede confiar en quien llama.
-- Por eso leer es libre, escribir directo está prohibido, y la única forma de
-- cargar un puntaje es una función que valida del lado del servidor.

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  -- El nombre se guarda ya normalizado (mayúsculas, sin espacios al borde).
  -- Es único: un nombre es un jugador y queda su mejor puntaje.
  name       text        not null unique,
  score      integer     not null,
  created_at timestamptz not null default now(),
  constraint scores_name_len check (char_length(name) between 1 and 10),
  constraint scores_score_ok check (score between 1 and 1000000)
);

create index if not exists scores_score_idx on public.scores (score desc);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- Sin esto, la anon key permite leer, modificar y BORRAR la tabla entera desde
-- la consola del navegador. Es el paso que no se puede saltear.
alter table public.scores enable row level security;

-- Leer: cualquiera. Es un ranking público.
drop policy if exists "ranking publico" on public.scores;
create policy "ranking publico"
  on public.scores for select
  to anon, authenticated
  using (true);

-- Insertar, modificar y borrar: nadie. Al no existir políticas para esas
-- operaciones, RLS las niega por defecto. La escritura pasa solo por la
-- función de abajo.

-- ─── ALTA DE PUNTAJE ──────────────────────────────────────────────────────────
-- security definer = corre con los permisos del dueño de la tabla, así que
-- puede escribir aunque el jugador no pueda. Toda la validación vive acá,
-- donde el jugador no la puede modificar.
create or replace function public.submit_score(p_name text, p_score integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  v_name := upper(btrim(coalesce(p_name, '')));

  if v_name = '' or char_length(v_name) > 10 then
    raise exception 'nombre invalido';
  end if;

  if p_score is null or p_score < 1 or p_score > 1000000 then
    raise exception 'puntaje invalido';
  end if;

  insert into public.scores (name, score)
  values (v_name, p_score)
  on conflict (name) do update
    set score      = greatest(scores.score, excluded.score),
        created_at = now();
end;
$$;

-- Que la pueda llamar el juego (anon), y nadie más por las dudas.
revoke all on function public.submit_score(text, integer) from public;
grant execute on function public.submit_score(text, integer) to anon, authenticated;
