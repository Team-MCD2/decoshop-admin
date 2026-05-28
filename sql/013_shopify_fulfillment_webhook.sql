-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Sync Shopify Fulfillment Trigger (Database Webhook)
-- ════════════════════════════════════════════════════════════════════════════

-- Ensure pg_net extension is enabled
create extension if not exists pg_net;

-- Trigger function to notify Next.js API of signature events
create or replace function public.trg_fn_sync_shopify_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload text;
begin
  -- Triggered when statut transitions to 'signe'
  if (NEW.statut = 'signe' and (OLD.statut is distinct from 'signe' or OLD.statut is null)) then
    v_payload := json_build_object('bl_id', NEW.id)::text;
    
    -- Perform asynchronous HTTP POST request to Next.js API route
    perform net.http_post(
      url := 'https://decoshop-adminn.vercel.app/api/shopify/sync-fulfillment',
      body := v_payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_ms := 10000
    );
  end if;
  return NEW;
end;
$$;

-- Drop trigger if exists
drop trigger if exists trg_sync_shopify_fulfillment on public.bons_livraison;

-- Create trigger
create trigger trg_sync_shopify_fulfillment
  after update of statut on public.bons_livraison
  for each row
  execute function public.trg_fn_sync_shopify_fulfillment();
