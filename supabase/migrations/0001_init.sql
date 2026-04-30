-- Logly 초기 스키마: logs 테이블 + RLS 정책
-- 적용: Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 Run.

-- UUID 생성용 (대부분 프로젝트에 이미 활성화돼 있음)
create extension if not exists "pgcrypto";

-- logs 테이블
create table public.logs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  raw         text        not null,
  achievement text        not null,
  resume      text        not null,
  interview   text        not null,
  created_at  timestamptz not null default now()
);

-- 사용자별 최신순 조회 인덱스
create index logs_user_id_created_at_idx
  on public.logs (user_id, created_at desc);

-- RLS 활성화
alter table public.logs enable row level security;

-- 본인 데이터만 select/insert/update/delete
create policy "logs_select_own"
  on public.logs for select
  using (auth.uid() = user_id);

create policy "logs_insert_own"
  on public.logs for insert
  with check (auth.uid() = user_id);

create policy "logs_update_own"
  on public.logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "logs_delete_own"
  on public.logs for delete
  using (auth.uid() = user_id);
