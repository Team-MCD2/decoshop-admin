// ============================================================
// lib/shopify/client.ts — Helpers fetch Shopify REST Admin API
// ============================================================

export interface ShopifyAddress {
  first_name: string;
  last_name: string;
  address1: string;
  city: string;
  province: string;
  country: string;
  zip: string;
}

export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  sku: string;
  price: string;
  fulfillment_status: string | null;
}

export interface ShopifyFulfillment {
  id: number;
  order_id: number;
  status: string;
  tracking_number: string | null;
  tracking_url: string | null;
  tracking_company: string | null;
  created_at: string;
  updated_at: string;
  line_items: ShopifyLineItem[];
}

export interface ShopifyOrder {
  id: number;
  name: string; // ex: "#1001"
  email: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
  line_items: ShopifyLineItem[];
  fulfillments: ShopifyFulfillment[];
  shipping_address: ShopifyAddress | null;
  customer: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

export interface ApiLogEntry {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  duration: number;
  ok: boolean;
}

export interface CreateFulfillmentPayload {
  order_id: number;
  tracking_number?: string;
  tracking_url?: string;
  tracking_company?: string;
  line_item_ids: number[];
  notify_customer?: boolean;
}

export interface UpdateTrackingPayload {
  tracking_number?: string;
  tracking_url?: string;
  tracking_company?: string;
  notify_customer?: boolean;
}

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL ?? '';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN ?? '';
const API_VERSION = '2024-10';

/** Vérifie que la config Shopify est présente et valide */
export function isConfigured(): boolean {
  if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) return false;
  if (SHOPIFY_STORE_URL.includes('your-store') || SHOPIFY_ACCESS_TOKEN.includes('xxxx')) return false;
  return true;
}

function baseUrl(): string {
  const store = SHOPIFY_STORE_URL.replace(/\/$/, '');
  const protocol = store.startsWith('http') ? '' : 'https://';
  return `${protocol}${store}/admin/api/${API_VERSION}`;
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
  };
}

export interface ShopifyResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
  log: ApiLogEntry;
}

async function shopifyFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ShopifyResponse<T>> {
  const url = `${baseUrl()}${path}`;
  const start = Date.now();

  let status = 0;
  let data: T | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(url, {
      method,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    status = res.status;
    const json = await res.json();

    if (!res.ok) {
      error = json.errors
        ? typeof json.errors === 'string'
          ? json.errors
          : JSON.stringify(json.errors)
        : `HTTP ${status}`;
    } else {
      data = json as T;
    }
  } catch (e: unknown) {
    status = 0;
    error = e instanceof Error ? e.message : 'Network error';
  }

  const duration = Date.now() - start;

  const log: ApiLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    method,
    url,
    status,
    duration,
    ok: error === null,
  };

  return { data, error, status, log };
}

/** Récupère les commandes (avec fulfillments) */
export function getOrders(params?: Record<string, string>) {
  const query = new URLSearchParams({
    status: 'any',
    limit: '50',
    ...params,
  }).toString();
  return shopifyFetch<{ orders: ShopifyOrder[] }>('GET', `/orders.json?${query}`);
}

/** Récupère les fulfillments d'une commande */
export function getFulfillments(orderId: number) {
  return shopifyFetch<{ fulfillments: ShopifyFulfillment[] }>(
    'GET',
    `/orders/${orderId}/fulfillments.json`,
  );
}

/** Crée un fulfillment pour une commande */
export function createFulfillment(payload: CreateFulfillmentPayload) {
  const { order_id, ...rest } = payload;
  return shopifyFetch<{ fulfillment: ShopifyFulfillment }>(
    'POST',
    `/orders/${order_id}/fulfillments.json`,
    {
      fulfillment: {
        ...rest,
        location_id: null,
      },
    },
  );
}

/** Met à jour le tracking d'un fulfillment */
export function updateTracking(fulfillmentId: number, payload: UpdateTrackingPayload) {
  return shopifyFetch<{ fulfillment: ShopifyFulfillment }>(
    'POST',
    `/fulfillments/${fulfillmentId}/update_tracking.json`,
    {
      fulfillment: {
        notify_customer: payload.notify_customer ?? false,
        tracking_info: {
          number: payload.tracking_number,
          url: payload.tracking_url,
          company: payload.tracking_company,
        },
      },
    },
  );
}

/** Annule un fulfillment */
export function cancelFulfillment(fulfillmentId: number) {
  return shopifyFetch<{ fulfillment: ShopifyFulfillment }>(
    'POST',
    `/fulfillments/${fulfillmentId}/cancel.json`,
  );
}
