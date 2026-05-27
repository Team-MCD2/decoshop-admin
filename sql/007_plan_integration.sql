-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Plan Integration Schema & RPCs (schéma `plan.*` unifié)
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Schema namespace
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists plan;
grant usage on schema plan to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. plan.sections — Floor plan sections
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists plan.sections (
  id           text           primary key,
  number       integer,
  label        text           not null default '',
  description  text           not null default '',
  category     text           not null default '',
  icon         text           not null default '',
  color        text           not null default '#D4AF37',

  -- Position & size
  x            numeric(6, 2)  not null default 0,
  y            numeric(6, 2)  not null default 0,
  w            numeric(6, 2)  not null default 1.5,
  h            numeric(6, 2)  not null default 1.2,

  is_comptoir  boolean        not null default false,
  is_locked    boolean        not null default false,
  rotation     integer        not null default 0,

  created_at   timestamptz    not null default now(),
  updated_at   timestamptz    not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. plan.zones — Functional zones (entrance, cash, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists plan.zones (
  id           text           primary key,
  label        text           not null default '',
  type         text           not null default '',
  description  text           not null default '',
  icon         text           not null default '',
  color        text           not null default '#6366F1',

  x            numeric(6, 2)  not null default 0,
  y            numeric(6, 2)  not null default 0,
  w            numeric(6, 2)  not null default 1.5,
  h            numeric(6, 2)  not null default 1.2,
  rotation     integer        not null default 0,

  is_locked    boolean        not null default false,

  created_at   timestamptz    not null default now(),
  updated_at   timestamptz    not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. plan.shelves — Shelves stacked vertically within a section
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists plan.shelves (
  id           text           primary key,
  section_id   text           not null references plan.sections(id) on delete cascade,
  index        integer        not null default 0,
  hauteur_cm   integer        not null default 0,
  capacite     integer        not null default 12,

  created_at   timestamptz    not null default now(),
  updated_at   timestamptz    not null default now()
);

create index if not exists idx_shelves_section on plan.shelves (section_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. plan.shelf_items — Products placed on shelves
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists plan.shelf_items (
  id           text           primary key,
  shelf_id     text           not null references plan.shelves(id) on delete cascade,
  title        text           not null default '',
  sku          text           not null default '',
  vendor       text           not null default '',
  price        numeric(12, 2),
  qty          integer        not null default 1,
  image        text           not null default '',
  position     integer        not null default 0,
  article_id   text,

  created_at   timestamptz    not null default now(),
  updated_at   timestamptz    not null default now()
);

create index if not exists idx_shelf_items_shelf   on plan.shelf_items (shelf_id);
create index if not exists idx_shelf_items_article on plan.shelf_items (article_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS policies and grants
-- ─────────────────────────────────────────────────────────────────────────────
alter table plan.sections    enable row level security;
alter table plan.zones       enable row level security;
alter table plan.shelves     enable row level security;
alter table plan.shelf_items enable row level security;

grant select, insert, update, delete on plan.sections    to anon, authenticated;
grant select, insert, update, delete on plan.zones       to anon, authenticated;
grant select, insert, update, delete on plan.shelves     to anon, authenticated;
grant select, insert, update, delete on plan.shelf_items to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'plan' and tablename = 'sections' and policyname = 'sections_anon_all') then
    create policy sections_anon_all on plan.sections
      for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'plan' and tablename = 'zones' and policyname = 'zones_anon_all') then
    create policy zones_anon_all on plan.zones
      for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'plan' and tablename = 'shelves' and policyname = 'shelves_anon_all') then
    create policy shelves_anon_all on plan.shelves
      for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'plan' and tablename = 'shelf_items' and policyname = 'shelf_items_anon_all') then
    create policy shelf_items_anon_all on plan.shelf_items
      for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Updated-at triggers using app_meta.set_updated_at() helper
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_sections_updated_at' and tgrelid = 'plan.sections'::regclass) then
    create trigger trg_sections_updated_at
      before update on plan.sections
      for each row execute function app_meta.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_zones_updated_at' and tgrelid = 'plan.zones'::regclass) then
    create trigger trg_zones_updated_at
      before update on plan.zones
      for each row execute function app_meta.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_shelves_updated_at' and tgrelid = 'plan.shelves'::regclass) then
    create trigger trg_shelves_updated_at
      before update on plan.shelves
      for each row execute function app_meta.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_shelf_items_updated_at' and tgrelid = 'plan.shelf_items'::regclass) then
    create trigger trg_shelf_items_updated_at
      before update on plan.shelf_items
      for each row execute function app_meta.set_updated_at();
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. plan.article_id_exists helper
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function plan.article_id_exists(p_article_id text)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_exists boolean := false;
begin
  if nullif(p_article_id, '') is null then
    return false;
  end if;

  if to_regclass('public.articles') is null then
    return false;
  end if;

  execute 'select exists (select 1 from public.articles where id::text = $1)'
    into v_exists
    using p_article_id;

  return coalesce(v_exists, false);
exception
  when undefined_table or undefined_column or insufficient_privilege then
    return false;
end;
$$;

revoke all     on function plan.article_id_exists(text) from public;
grant  execute on function plan.article_id_exists(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. plan.load_layout() RPC
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function plan.load_layout()
returns jsonb
language plpgsql
stable
security invoker
set search_path = plan, public, pg_temp
as $$
declare
  v_section_count integer;
  v_zone_count    integer;
  v_sections      jsonb;
  v_zones         jsonb;
begin
  select count(*) into v_section_count from plan.sections;
  select count(*) into v_zone_count    from plan.zones;

  -- Sections with their shelves and items, all nested.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',         s.id,
        'number',     s.number,
        'label',      s.label,
        'desc',       s.description,
        'category',   s.category,
        'icon',       s.icon,
        'color',      s.color,
        'x',          s.x,
        'y',          s.y,
        'w',          s.w,
        'h',          s.h,
        'isComptoir', s.is_comptoir,
        'locked',     s.is_locked,
        'rotation',   s.rotation,
        'shelves',    coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id',         sh.id,
                'index',      sh.index,
                'hauteur_cm', sh.hauteur_cm,
                'capacite',   sh.capacite,
                'items',      coalesce(
                  (
                    select jsonb_agg(
                      jsonb_build_object(
                        'id',         it.id,
                        'title',      it.title,
                        'sku',        nullif(it.sku, ''),
                        'vendor',     nullif(it.vendor, ''),
                        'price',      it.price,
                        'qty',        it.qty,
                        'image',      nullif(it.image, ''),
                        'article_id', it.article_id
                      )
                      order by it.position, it.created_at
                    )
                    from plan.shelf_items it
                    where it.shelf_id = sh.id
                  ),
                  '[]'::jsonb
                )
              )
              order by sh.index
            )
            from plan.shelves sh
            where sh.section_id = s.id
          ),
          '[]'::jsonb
        )
      )
      order by s.number nulls last, s.id
    ),
    '[]'::jsonb
  ) into v_sections
  from plan.sections s;

  -- Zones (no children).
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',     z.id,
        'label',  z.label,
        'type',   z.type,
        'desc',   z.description,
        'icon',   z.icon,
        'color',  z.color,
        'x',      z.x,
        'y',      z.y,
        'w',      z.w,
        'h',      z.h,
        'locked', z.is_locked,
        'rotation', z.rotation
      )
      order by z.id
    ),
    '[]'::jsonb
  ) into v_zones
  from plan.zones z;

  return jsonb_build_object(
    'version',  1,
    'exists',   (v_section_count > 0 or v_zone_count > 0),
    'sections', v_sections,
    'zones',    v_zones
  );
end;
$$;

comment on function plan.load_layout() is
  'Returns the full DecoShop floor plan as a single JSON snapshot, '
  'shaped identically to the client-side SavedLayout type.';

revoke all     on function plan.load_layout() from public;
grant  execute on function plan.load_layout() to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. plan.replace_layout(payload jsonb) RPC
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function plan.replace_layout(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = plan, public, pg_temp
as $$
declare
  v_section_count integer := 0;
  v_zone_count    integer := 0;
  v_shelf_count   integer := 0;
  v_item_count    integer := 0;
  v_dropped_items integer := 0;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'plan.replace_layout: payload must be a JSON object'
      using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_payload->'sections', '[]'::jsonb)) <> 'array' then
    raise exception 'plan.replace_layout: payload.sections must be an array'
      using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_payload->'zones', '[]'::jsonb)) <> 'array' then
    raise exception 'plan.replace_layout: payload.zones must be an array'
      using errcode = '22023';
  end if;

  delete from plan.zones where true;
  delete from plan.sections where true;

  insert into plan.zones (
    id, label, type, description, icon, color,
    x, y, w, h, is_locked, rotation
  )
  select
    coalesce(z->>'id',    'zone-' || gen_random_uuid()::text),
    coalesce(z->>'label', ''),
    coalesce(z->>'type',  ''),
    coalesce(z->>'desc',  ''),
    coalesce(z->>'icon',  ''),
    coalesce(z->>'color', '#6366F1'),
    coalesce((z->>'x')::numeric, 0),
    coalesce((z->>'y')::numeric, 0),
    coalesce((z->>'w')::numeric, 1),
    coalesce((z->>'h')::numeric, 1),
    coalesce((z->>'locked')::boolean, false),
    coalesce((z->>'rotation')::integer, 0)
  from jsonb_array_elements(coalesce(p_payload->'zones', '[]'::jsonb)) as z;
  get diagnostics v_zone_count = row_count;

  insert into plan.sections (
    id, number, label, description, category, icon, color,
    x, y, w, h, is_comptoir, is_locked, rotation
  )
  select
    coalesce(s->>'id', 'sec-' || gen_random_uuid()::text),
    nullif(s->>'number', '')::integer,
    coalesce(s->>'label', ''),
    coalesce(s->>'desc',  ''),
    coalesce(s->>'category', ''),
    coalesce(s->>'icon',  ''),
    coalesce(s->>'color', '#D4AF37'),
    coalesce((s->>'x')::numeric, 0),
    coalesce((s->>'y')::numeric, 0),
    coalesce((s->>'w')::numeric, 1.5),
    coalesce((s->>'h')::numeric, 1.2),
    coalesce((s->>'isComptoir')::boolean, false),
    coalesce((s->>'locked')::boolean, false),
    coalesce((s->>'rotation')::integer, 0)
  from jsonb_array_elements(coalesce(p_payload->'sections', '[]'::jsonb)) as s;
  get diagnostics v_section_count = row_count;

  with src as (
    select
      s->>'id' as section_id,
      sh
    from
      jsonb_array_elements(coalesce(p_payload->'sections', '[]'::jsonb)) as s,
      jsonb_array_elements(coalesce(s->'shelves', '[]'::jsonb))           as sh
  )
  insert into plan.shelves (
    id, section_id, index, hauteur_cm, capacite
  )
  select
    coalesce(sh->>'id', section_id || '-shelf-' || (sh->>'index')),
    section_id,
    coalesce((sh->>'index')::integer, 0),
    coalesce((sh->>'hauteur_cm')::integer, 0),
    coalesce((sh->>'capacite')::integer, 12)
  from src;
  get diagnostics v_shelf_count = row_count;

  with src as (
    select
      sh->>'id' as shelf_id,
      it,
      row_number() over (partition by sh->>'id' order by 1) - 1 as position
    from
      jsonb_array_elements(coalesce(p_payload->'sections', '[]'::jsonb))   as s,
      jsonb_array_elements(coalesce(s->'shelves',       '[]'::jsonb))      as sh,
      jsonb_array_elements(coalesce(sh->'items',        '[]'::jsonb))      as it
  )
  insert into plan.shelf_items (
    id, shelf_id, title, sku, vendor, price, qty, image, position, article_id
  )
  select
    coalesce(it->>'id', 'item-' || gen_random_uuid()::text),
    shelf_id,
    coalesce(it->>'title', ''),
    coalesce(it->>'sku',    ''),
    coalesce(it->>'vendor', ''),
    nullif(it->>'price', '')::numeric,
    coalesce((it->>'qty')::integer, 1),
    coalesce(it->>'image', ''),
    position::integer,
    case
      when it->>'article_id' is null or it->>'article_id' = '' then null
      when plan.article_id_exists(it->>'article_id') then it->>'article_id'
      else null
    end
  from src;
  get diagnostics v_item_count = row_count;

  select count(*) into v_dropped_items
  from
    jsonb_array_elements(coalesce(p_payload->'sections', '[]'::jsonb))   as s,
    jsonb_array_elements(coalesce(s->'shelves',       '[]'::jsonb))      as sh,
    jsonb_array_elements(coalesce(sh->'items',        '[]'::jsonb))      as it
  where
    it->>'article_id' is not null
    and it->>'article_id' <> ''
    and not plan.article_id_exists(it->>'article_id');

  return jsonb_build_object(
    'sections_inserted',      v_section_count,
    'zones_inserted',         v_zone_count,
    'shelves_inserted',       v_shelf_count,
    'items_inserted',         v_item_count,
    'article_ids_unresolved', v_dropped_items,
    'saved_at',               now()
  );
end;
$$;

comment on function plan.replace_layout(jsonb) is
  'Atomic snapshot save: replaces the entire floor plan with the JSON payload.';

revoke all     on function plan.replace_layout(jsonb) from public;
grant  execute on function plan.replace_layout(jsonb) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Register migration
-- ─────────────────────────────────────────────────────────────────────────────
insert into public._migrations (filename, app, checksum)
values ('007_plan_integration.sql', 'plan', null)
on conflict (filename) do nothing;
