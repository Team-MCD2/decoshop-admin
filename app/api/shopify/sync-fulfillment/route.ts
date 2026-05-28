import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getShopifyLocations,
  getFulfillmentOrders,
  createFulfillmentModern,
  updateOrderNotesAndAttributes
} from '@/lib/shopify/client'

export async function POST(request: NextRequest) {
  const start = Date.now()
  const supabase = createAdminClient()

  try {
    const payload = await request.json()
    console.log('[shopify-sync-fulfillment] Received trigger payload:', JSON.stringify(payload))

    // Support both direct triggers and Supabase DB webhooks
    let blId = payload.bl_id
    let record = payload.record

    if (!blId && record) {
      blId = record.id
    }

    if (!blId) {
      return NextResponse.json({ success: false, error: 'Missing bl_id in payload.' }, { status: 400 })
    }

    // 1. Fetch the local BL and associated order/client/signature details
    const { data: bl, error: blError } = await supabase
      .from('bons_livraison')
      .select('*, clients(*), commandes(*), signatures_electroniques(*)')
      .eq('id', blId)
      .maybeSingle()

    if (blError || !bl) {
      console.error(`[shopify-sync-fulfillment] Failed to retrieve BL ${blId}:`, blError)
      return NextResponse.json({ success: false, error: 'BL not found.' }, { status: 404 })
    }

    // 2. Only sync back if status is 'signe'
    if (bl.statut !== 'signe') {
      console.log(`[shopify-sync-fulfillment] BL ${bl.numero_bl} is in status "${bl.statut}" (not "signe"). Sync skipped.`)
      return NextResponse.json({ success: true, message: 'Sync skipped: status is not signed.' })
    }

    const shopifyOrderId = bl.commandes?.shopify_order_id
    if (!shopifyOrderId || shopifyOrderId.startsWith('manual-')) {
      console.log(`[shopify-sync-fulfillment] BL ${bl.numero_bl} is a manual order without a real Shopify Order ID. Sync skipped.`)
      return NextResponse.json({ success: true, message: 'Sync skipped: manual local-only order.' })
    }

    console.log(`[shopify-sync-fulfillment] Syncing BL ${bl.numero_bl} (Shopify Order ID: ${shopifyOrderId}) to Shopify...`)

    // 3. Get Shopify Locations to find the first active location ID
    const locationsRes = await getShopifyLocations()
    if (locationsRes.error || !locationsRes.data?.locations?.length) {
      console.error('[shopify-sync-fulfillment] Failed to fetch Shopify locations:', locationsRes.error)
      return NextResponse.json({ success: false, error: 'Shopify locations fetch failed.' }, { status: 500 })
    }

    const activeLocation = locationsRes.data.locations.find((l: any) => l.active) || locationsRes.data.locations[0]
    const locationId = activeLocation.id

    // 4. Fetch the open Fulfillment Orders for this order
    const fulfillmentOrdersRes = await getFulfillmentOrders(shopifyOrderId)
    if (fulfillmentOrdersRes.error || !fulfillmentOrdersRes.data?.fulfillment_orders) {
      console.error('[shopify-sync-fulfillment] Failed to fetch Shopify fulfillment orders:', fulfillmentOrdersRes.error)
      return NextResponse.json({ success: false, error: 'Shopify fulfillment orders fetch failed.' }, { status: 500 })
    }

    // Filter open/in-progress fulfillment orders
    const openFulfillmentOrders = fulfillmentOrdersRes.data.fulfillment_orders.filter(
      (fo: any) => fo.status === 'open' || fo.status === 'in_progress'
    )

    if (openFulfillmentOrders.length === 0) {
      console.log(`[shopify-sync-fulfillment] Order ${shopifyOrderId} has no open fulfillment orders (already fulfilled). Skipping fulfillment creation.`)
    } else {
      // 5. Create fulfillment for the open fulfillment orders
      const fulfillmentPayload = {
        fulfillment: {
          message: `Livraison effectuée et signée. BL: ${bl.numero_bl}`,
          notify_customer: false,
          location_id: locationId,
          line_items_by_fulfillment_order: openFulfillmentOrders.map((fo: any) => ({
            fulfillment_order_id: fo.id,
            fulfillment_order_line_items: fo.line_items.map((li: any) => ({
              id: li.id,
              quantity: li.quantity
            }))
          }))
        }
      }

      console.log('[shopify-sync-fulfillment] Creating fulfillment with payload:', JSON.stringify(fulfillmentPayload))
      const createRes = await createFulfillmentModern(fulfillmentPayload)

      if (createRes.error) {
        console.error('[shopify-sync-fulfillment] Shopify fulfillment creation failed:', createRes.error)
        // Note: Do not abort here, we still want to try updating note attributes if possible
      } else {
        console.log(`[shopify-sync-fulfillment] Shopify fulfillment created successfully for BL ${bl.numero_bl}`)
      }
    }

    // 6. Update note attributes on the Shopify Order with signature link and delivery details
    const host = request.headers.get('host') || 'decoshop-admin.vercel.app'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    
    // Retrieve token from signature table or use a dummy hash if missing
    const sigToken = bl.signatures_electroniques?.token || ''
    const signatureLink = sigToken ? `${protocol}://${host}/sign/${sigToken}` : ''

    const signataire = bl.signatures_electroniques?.signe_par_parent
      ? `${bl.signatures_electroniques.parent_nom} (Tiers, ${bl.signatures_electroniques.parent_lien || 'Proche'})`
      : `${bl.clients?.prenom || ''} ${bl.clients?.nom || ''}`.trim() || 'Client'

    const deliveryDate = bl.date_signature || bl.date_livraison_effective || new Date().toISOString()
    const formattedDate = new Date(deliveryDate).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })

    const noteAttributes = [
      { name: 'Livraison Statut', value: 'Livré & Signé' },
      { name: 'Livré le', value: formattedDate },
      { name: 'Signataire', value: signataire },
      { name: 'Lien Signature Preuve', value: signatureLink }
    ]

    console.log('[shopify-sync-fulfillment] Updating Shopify order notes and attributes:', JSON.stringify(noteAttributes))
    const updateNotesRes = await updateOrderNotesAndAttributes(
      shopifyOrderId,
      `Livré et signé par ${signataire} le ${formattedDate}. BL: ${bl.numero_bl}`,
      noteAttributes
    )

    if (updateNotesRes.error) {
      console.error('[shopify-sync-fulfillment] Failed to update Shopify order notes:', updateNotesRes.error)
    } else {
      console.log(`[shopify-sync-fulfillment] Shopify order notes updated successfully for order ${shopifyOrderId}`)
    }

    // 7. Update local order status to 'expediee' or 'livree' to match Shopify
    await supabase
      .from('commandes')
      .update({ statut: 'livree', updated_at: new Date().toISOString() })
      .eq('id', bl.commande_id)

    const duration = Date.now() - start
    console.log(`[shopify-sync-fulfillment] Completed sync for BL ${bl.numero_bl} in ${duration}ms`)

    return NextResponse.json({
      success: true,
      bl_id: blId,
      shopify_order_id: shopifyOrderId,
      duration_ms: duration
    })

  } catch (err: any) {
    console.error('[shopify-sync-fulfillment] CRITICAL: Sync failure:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
