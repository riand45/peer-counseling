-- =============================================================
-- Peer Counseling — Skema Database
-- Jalankan seluruh isi file ini di Supabase Dashboard > SQL Editor.
-- Aman dijalankan ulang (idempoten sebisa mungkin).
-- =============================================================

-- -------------------------------------------------------------
-- 1. Enum
-- -------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('kader', 'guru');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'topic') then
    create type public.topic as enum (
      'pertemanan', 'bullying', 'keluarga', 'akademik',
      'perasaan', 'lingkungan_sekolah', 'lainnya'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'kader_status') then
    create type public.kader_status as enum ('available', 'busy', 'offline');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type public.session_status as enum ('waiting', 'active', 'escalated', 'ended');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sender_role') then
    create type public.sender_role as enum ('student', 'kader', 'guru', 'system');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'escalation_status') then
    create type public.escalation_status as enum ('pending', 'acknowledged', 'resolved');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_reason') then
    create type public.report_reason as enum ('uncomfortable', 'unresponsive', 'need_teacher', 'other');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type public.report_status as enum ('open', 'reviewed');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'assignment_reason') then
    create type public.assignment_reason as enum ('assign', 'transfer', 'takeover');
  end if;
end$$;

-- -------------------------------------------------------------
-- 2. Tabel profiles (kader & guru; referensi auth.users)
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.app_role not null default 'kader',
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists bio text,
  add column if not exists topics public.topic[];

alter table public.profiles
  add column if not exists status public.kader_status not null default 'offline';

alter table public.profiles enable row level security;

-- -------------------------------------------------------------
-- 3. Helper: apakah user saat ini seorang guru?
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
-- 5. Drop tabel lama (skema awal, sebelum redesign)
-- -------------------------------------------------------------
drop table if exists public.counseling_sessions;

-- -------------------------------------------------------------
-- 6. Tabel student_identities
--    id di sini ADALAH local_id yang disimpan di localStorage
--    browser siswa. Dibuat lewat Server Action (service_role),
--    tidak pernah langsung dari klien.
-- -------------------------------------------------------------
create table if not exists public.student_identities (
  id uuid primary key default gen_random_uuid(),
  nickname text,
  avatar_seed text,
  created_at timestamptz not null default now()
);

alter table public.student_identities enable row level security;
-- Sengaja TANPA policy dan TANPA grant ke anon/authenticated:
-- hanya service_role (Server Action) yang boleh menyentuh tabel ini.

-- -------------------------------------------------------------
-- 7. Tabel sessions
-- -------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  student_local_id uuid not null references public.student_identities (id) on delete cascade,
  assigned_to uuid references public.profiles (id) on delete set null,
  topic public.topic not null,
  status public.session_status not null default 'waiting',
  started_at timestamptz,
  ended_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

-- -------------------------------------------------------------
-- 8. Tabel messages
-- -------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  sender_role public.sender_role not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.messages enable row level security;

-- -------------------------------------------------------------
-- 9. Tabel session_assignments (audit: assign/transfer/takeover)
-- -------------------------------------------------------------
create table if not exists public.session_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  from_id uuid references public.profiles (id) on delete set null,
  to_id uuid not null references public.profiles (id) on delete cascade,
  changed_by uuid not null references public.profiles (id) on delete cascade,
  reason public.assignment_reason not null,
  created_at timestamptz not null default now()
);

alter table public.session_assignments enable row level security;

-- -------------------------------------------------------------
-- 10. Tabel escalations
-- -------------------------------------------------------------
create table if not exists public.escalations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  kader_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  status public.escalation_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz
);

alter table public.escalations enable row level security;

-- -------------------------------------------------------------
-- 11. Tabel session_reports
-- -------------------------------------------------------------
create table if not exists public.session_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  reason public.report_reason not null,
  details text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.session_reports enable row level security;
-- Sengaja TANPA grant ke anon (student menulis lewat Server Action +
-- service_role). Hanya guru yang boleh membaca (lihat policy di bawah).

-- -------------------------------------------------------------
-- 12. Trigger: escalations -> sessions.status = 'escalated'
-- -------------------------------------------------------------
create or replace function public.handle_new_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sessions set status = 'escalated' where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists on_escalation_created on public.escalations;
create trigger on_escalation_created
  after insert on public.escalations
  for each row execute procedure public.handle_new_escalation();

-- -------------------------------------------------------------
-- 13. Trigger: messages -> sessions.last_message_at
-- -------------------------------------------------------------
create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sessions set last_message_at = new.created_at where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute procedure public.handle_new_message();

-- -------------------------------------------------------------
-- 14. GRANTS
--     anon: TIDAK ADA grant sama sekali untuk sessions/messages/
--     student_identities/session_reports/escalations/session_assignments.
--     Semua akses sisi student lewat Server Action + service_role.
--
--     PENTING: Supabase secara default menjalankan
--     `alter default privileges in schema public grant all on tables to
--     anon, authenticated` saat provisioning project — artinya setiap
--     tabel baru di schema public otomatis punya grant penuh untuk anon
--     & authenticated, TERLEPAS dari statement grant di bawah (yang
--     sifatnya cuma menambah, bukan mengganti). Untuk SELECT ini
--     berbahaya: RLS tanpa policy yang cocok cuma memfilter hasil jadi
--     kosong (sukses, 0 baris) — BUKAN error 42501 — jadi tanpa revoke
--     eksplisit di bawah, anon tetap bisa "berhasil" query tabel yang
--     seharusnya sama sekali tidak bisa diakses. Revoke dulu semuanya,
--     baru grant ulang persis yang dimaksud.
-- -------------------------------------------------------------
revoke all on public.profiles from anon, authenticated;
revoke all on public.student_identities from anon, authenticated;
revoke all on public.sessions from anon, authenticated;
revoke all on public.messages from anon, authenticated;
revoke all on public.session_assignments from anon, authenticated;
revoke all on public.escalations from anon, authenticated;
revoke all on public.session_reports from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select on public.profiles to anon;

grant select, update on public.sessions to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert on public.session_assignments to authenticated;
grant select, insert, update on public.escalations to authenticated;
grant select, update on public.session_reports to authenticated;

-- -------------------------------------------------------------
-- 15. RLS POLICIES — profiles
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
-- 16. RLS POLICIES — sessions
-- -------------------------------------------------------------
drop policy if exists "sessions: kader baca sesi sendiri" on public.sessions;
create policy "sessions: kader baca sesi sendiri"
  on public.sessions for select
  to authenticated
  using (assigned_to = auth.uid());

drop policy if exists "sessions: guru baca semua" on public.sessions;
create policy "sessions: guru baca semua"
  on public.sessions for select
  to authenticated
  using (public.is_guru());

drop policy if exists "sessions: kader update sesi sendiri" on public.sessions;
create policy "sessions: kader update sesi sendiri"
  on public.sessions for update
  to authenticated
  using (assigned_to = auth.uid())
  with check (true);

drop policy if exists "sessions: guru update semua" on public.sessions;
create policy "sessions: guru update semua"
  on public.sessions for update
  to authenticated
  using (public.is_guru())
  with check (public.is_guru());

-- -------------------------------------------------------------
-- 17. RLS POLICIES — messages
-- -------------------------------------------------------------
drop policy if exists "messages: kader baca sesi sendiri" on public.messages;
create policy "messages: kader baca sesi sendiri"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = messages.session_id
        and s.assigned_to = auth.uid()
    )
  );

drop policy if exists "messages: guru baca semua" on public.messages;
create policy "messages: guru baca semua"
  on public.messages for select
  to authenticated
  using (public.is_guru());

drop policy if exists "messages: kader kirim di sesi sendiri" on public.messages;
create policy "messages: kader kirim di sesi sendiri"
  on public.messages for insert
  to authenticated
  with check (
    sender_role = 'kader'
    and exists (
      select 1 from public.sessions s
      where s.id = messages.session_id
        and s.assigned_to = auth.uid()
    )
  );

drop policy if exists "messages: guru kirim" on public.messages;
create policy "messages: guru kirim"
  on public.messages for insert
  to authenticated
  with check (sender_role = 'guru' and public.is_guru());

-- -------------------------------------------------------------
-- 18. RLS POLICIES — session_assignments
-- -------------------------------------------------------------
drop policy if exists "session_assignments: authenticated baca" on public.session_assignments;
create policy "session_assignments: authenticated baca"
  on public.session_assignments for select
  to authenticated
  using (true);

drop policy if exists "session_assignments: authenticated tulis" on public.session_assignments;
create policy "session_assignments: authenticated tulis"
  on public.session_assignments for insert
  to authenticated
  with check (changed_by = auth.uid());

-- -------------------------------------------------------------
-- 19. RLS POLICIES — escalations
-- -------------------------------------------------------------
drop policy if exists "escalations: kader buat di sesi sendiri" on public.escalations;
create policy "escalations: kader buat di sesi sendiri"
  on public.escalations for insert
  to authenticated
  with check (
    kader_id = auth.uid()
    and exists (
      select 1 from public.sessions s
      where s.id = escalations.session_id
        and s.assigned_to = auth.uid()
    )
  );

drop policy if exists "escalations: kader baca milik sendiri" on public.escalations;
create policy "escalations: kader baca milik sendiri"
  on public.escalations for select
  to authenticated
  using (kader_id = auth.uid());

drop policy if exists "escalations: guru baca semua" on public.escalations;
create policy "escalations: guru baca semua"
  on public.escalations for select
  to authenticated
  using (public.is_guru());

drop policy if exists "escalations: guru update" on public.escalations;
create policy "escalations: guru update"
  on public.escalations for update
  to authenticated
  using (public.is_guru())
  with check (public.is_guru());

-- -------------------------------------------------------------
-- 20. RLS POLICIES — session_reports (guru-only; student lewat service_role)
-- -------------------------------------------------------------
drop policy if exists "session_reports: guru baca" on public.session_reports;
create policy "session_reports: guru baca"
  on public.session_reports for select
  to authenticated
  using (public.is_guru());

drop policy if exists "session_reports: guru update" on public.session_reports;
create policy "session_reports: guru update"
  on public.session_reports for update
  to authenticated
  using (public.is_guru())
  with check (public.is_guru());

-- -------------------------------------------------------------
-- 21. Backfill profile untuk user yang sudah ada (jika ada)
-- -------------------------------------------------------------
insert into public.profiles (id, full_name, role)
select
  u.id,
  u.raw_user_meta_data ->> 'full_name',
  coalesce((u.raw_user_meta_data ->> 'role')::public.app_role, 'kader')
from auth.users u
on conflict (id) do nothing;
