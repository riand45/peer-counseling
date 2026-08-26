-- =============================================================
-- Peer Counseling — Skema Database
-- Jalankan seluruh isi file ini di Supabase Dashboard > SQL Editor.
-- Aman dijalankan ulang (idempoten sebisa mungkin).
-- =============================================================

-- -------------------------------------------------------------
-- 1. Peran aplikasi
-- -------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('kader', 'guru');
  end if;
end$$;

-- -------------------------------------------------------------
-- 2. Tabel profiles (authorization layer, referensi auth.users)
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.app_role not null default 'kader',
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- -------------------------------------------------------------
-- 3. Helper: apakah user saat ini seorang guru?
--    SECURITY DEFINER agar tidak memicu rekursi RLS pada profiles.
-- -------------------------------------------------------------
create or replace function public.is_guru()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'guru'
  );
$$;

-- -------------------------------------------------------------
-- 4. Trigger: auto-buat profile saat user baru signup
-- -------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(
      (new.raw_user_meta_data ->> 'role')::public.app_role,
      'kader'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -------------------------------------------------------------
-- 5. Tabel counseling_sessions (riwayat konseling student anonymous)
-- -------------------------------------------------------------
create table if not exists public.counseling_sessions (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  student_local_id text,
  topic text,
  message text,
  status text not null default 'open',
  handled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.counseling_sessions enable row level security;

-- -------------------------------------------------------------
-- 6. GRANTS
-- -------------------------------------------------------------
grant select, update on public.profiles to authenticated;
grant select on public.profiles to anon;

-- Student anonymous (anon) boleh membuat sesi konseling.
grant insert on public.counseling_sessions to anon;
-- Kader/guru (authenticated) mengelola sesi.
grant select, update on public.counseling_sessions to authenticated;

-- -------------------------------------------------------------
-- 7. RLS POLICIES — profiles
-- -------------------------------------------------------------
drop policy if exists "profiles: baca profil sendiri" on public.profiles;
create policy "profiles: baca profil sendiri"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles: guru baca semua" on public.profiles;
create policy "profiles: guru baca semua"
  on public.profiles for select
  to authenticated
  using (public.is_guru());

drop policy if exists "profiles: update profil sendiri" on public.profiles;
create policy "profiles: update profil sendiri"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles: guru update semua" on public.profiles;
create policy "profiles: guru update semua"
  on public.profiles for update
  to authenticated
  using (public.is_guru())
  with check (public.is_guru());

-- -------------------------------------------------------------
-- 8. RLS POLICIES — counseling_sessions
-- -------------------------------------------------------------
-- Student anonymous boleh menambah sesi (tanpa login).
drop policy if exists "sessions: anon insert" on public.counseling_sessions;
create policy "sessions: anon insert"
  on public.counseling_sessions for insert
  to anon
  with check (true);

-- Authenticated (kader/guru) juga boleh menambah, mis. via dashboard.
drop policy if exists "sessions: authenticated insert" on public.counseling_sessions;
create policy "sessions: authenticated insert"
  on public.counseling_sessions for insert
  to authenticated
  with check (true);

-- Hanya kader/guru yang bisa melihat sesi.
drop policy if exists "sessions: authenticated select" on public.counseling_sessions;
create policy "sessions: authenticated select"
  on public.counseling_sessions for select
  to authenticated
  using (true);

-- Hanya kader/guru yang bisa memperbarui sesi (mis. menutup / menandai ditangani).
drop policy if exists "sessions: authenticated update" on public.counseling_sessions;
create policy "sessions: authenticated update"
  on public.counseling_sessions for update
  to authenticated
  using (true)
  with check (true);

-- -------------------------------------------------------------
-- 9. Backfill profile untuk user yang sudah ada (jika ada)
-- -------------------------------------------------------------
insert into public.profiles (id, full_name, role)
select
  u.id,
  u.raw_user_meta_data ->> 'full_name',
  coalesce((u.raw_user_meta_data ->> 'role')::public.app_role, 'kader')
from auth.users u
on conflict (id) do nothing;
