'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getOrders } from '@/lib/shopify/client'
import { revalidatePath } from 'next/cache'

/**
 * Server Action to manually fetch and synchronize orders from Shopify REST API.
 * Uses exact webhook mapping logic to upsert clients, orders, BLs, and items.
 */
export async function syncShopifyOrdersAction() {
  const supabase = createAdminClient()
  const start = Date.now()

  console.log('[shopify-sync] Manual Shopify orders synchronization initiated...')

  try {
    // 1. Fetch orders from Shopify
    const shopifyRes = await getOrders({ limit: '100' }) // Get latest 100 orders

    if (shopifyRes.error) {
      // Dissect Shopify API warning details
      console.group('[shopify-sync] Shopify API request failed');
      console.error('STATUS:', shopifyRes.status);
      console.error('URL:', shopifyRes.log.url);
      console.error('METHOD:', shopifyRes.log.method);
      console.error('DURATION:', shopifyRes.log.duration, 'ms');
      console.error('API ERROR:', shopifyRes.error);
      console.groupEnd();
      
      throw new Error(`Shopify API responded with status ${shopifyRes.status}: ${shopifyRes.error}`)
    }

    const orders = shopifyRes.data?.orders || []
    console.log(`[shopify-sync] Fetched ${orders.length} orders from Shopify. Processing...`)

    let successCount = 0
    let failureCount = 0

    for (const rawPayload of orders) {
      const payload = rawPayload as any
      const orderId = String(payload.id)
      const orderName = payload.name // e.g. "#1001"

      try {
        const customer = payload.customer
        const shipping = payload.shipping_address || payload.billing_address || {}
        
        const clientEmail = payload.email || customer?.email || ''
        const clientPhone = shipping.phone || payload.phone || customer?.phone || ''
        const clientLastName = shipping.last_name || customer?.last_name || 'Client'
        const clientFirstName = shipping.first_name || customer?.first_name || 'Anonyme'

        const shopifyCustomerId = customer?.id ? String(customer.id) : null

        // Resolve or upsert Client
        let clientId = null

        if (shopifyCustomerId) {
          const { data: existingClient, error: cErr } = await supabase
            .from('clients')
            .select('id')
            .eq('shopify_customer_id', shopifyCustomerId)
            .maybeSingle()
          
          if (cErr) throw cErr
          if (existingClient) clientId = existingClient.id
        }

        if (!clientId && clientEmail) {
          const { data: existingClient, error: cErr } = await supabase
            .from('clients')
            .select('id')
            .eq('email', clientEmail)
            .maybeSingle()
          
          if (cErr) throw cErr
          if (existingClient) clientId = existingClient.id
        }

        const clientPayload = {
          nom: clientLastName,
          prenom: clientFirstName,
          email: clientEmail || null,
          telephone: clientPhone || null,
          adresse_ligne1: shipping.address1 || 'Adresse non spécifiée',
          adresse_ligne2: shipping.address2 || null,
          code_postal: shipping.zip || null,
          ville: shipping.city || null,
          pays: shipping.country || 'France',
          latitude: shipping.latitude ? Number(shipping.latitude) : null,
          longitude: shipping.longitude ? Number(shipping.longitude) : null,
          shopify_customer_id: shopifyCustomerId,
        }

        if (clientId) {
          const { error: clientUpdateError } = await supabase
            .from('clients')
            .update(clientPayload)
            .eq('id', clientId)
          
          if (clientUpdateError) throw clientUpdateError
        } else {
          const { data: newClient, error: clientInsertError } = await supabase
            .from('clients')
            .insert(clientPayload)
            .select('id')
            .single()
          
          if (clientInsertError) throw clientInsertError
          clientId = newClient.id
        }

        // Resolve or upsert Commande
        let localCommandeId = null
        const { data: existingOrder, error: oErr } = await supabase
          .from('commandes')
          .select('id')
          .eq('shopify_order_id', orderId)
          .maybeSingle()

        if (oErr) throw oErr
        if (existingOrder) localCommandeId = existingOrder.id

        let orderStatus = 'en_preparation'
        if (payload.cancelled_at) {
          orderStatus = 'annulee'
        } else if (payload.fulfillment_status === 'fulfilled') {
          orderStatus = 'expediee'
        }

        const totalTax = payload.total_tax ? Number(payload.total_tax) : 0
        const totalPrice = payload.total_price ? Number(payload.total_price) : 0

        const orderPayload = {
          client_id: clientId,
          numero_commande: orderName,
          shopify_order_id: orderId,
          statut: orderStatus,
          montant_total_ttc: totalPrice,
          montant_total_ht: totalPrice - totalTax,
          montant_tva: totalTax,
          taux_tva: 20.00,
          date_commande: payload.created_at || new Date().toISOString(),
          notes: payload.note || null,
        }

        if (localCommandeId) {
          const { error: orderUpdateError } = await supabase
            .from('commandes')
            .update(orderPayload)
            .eq('id', localCommandeId)
          
          if (orderUpdateError) throw orderUpdateError
        } else {
          const { data: newOrder, error: orderInsertError } = await supabase
            .from('commandes')
            .insert(orderPayload)
            .select('id')
            .single()
          
          if (orderInsertError) throw orderInsertError
          localCommandeId = newOrder.id
        }

        // Resolve or create associated Delivery Note (bons_livraison)
        let blId = null
        const { data: existingBL, error: blErr } = await supabase
          .from('bons_livraison')
          .select('id, statut')
          .eq('commande_id', localCommandeId)
          .maybeSingle()

        if (blErr) throw blErr

        const deliveryMode = payload.shipping_lines?.length > 0 ? 'domicile' : 'retrait_magasin'

        const blPayload = {
          commande_id: localCommandeId,
          client_id: clientId,
          statut: existingBL?.statut || 'cree',
          mode_livraison: deliveryMode,
          montant_total_ttc: totalPrice,
        }

        if (existingBL) {
          blId = existingBL.id
          const { error: blUpdateError } = await supabase
            .from('bons_livraison')
            .update({
              montant_total_ttc: totalPrice,
              mode_livraison: deliveryMode,
            })
            .eq('id', blId)

          if (blUpdateError) throw blUpdateError
        } else {
          const { data: newBL, error: blInsertError } = await supabase
            .from('bons_livraison')
            .insert(blPayload)
            .select('id')
            .single()

          if (blInsertError) throw blInsertError
          blId = newBL.id
        }

        // Synchronize delivery note line items (lignes_bl)
        const { error: clearLinesError } = await supabase
          .from('lignes_bl')
          .delete()
          .eq('bl_id', blId)

        if (clearLinesError) throw clearLinesError

        const lineItems = payload.line_items || []
        if (lineItems.length > 0) {
          const dbLineItems = lineItems.map((item: any, idx: number) => {
            const isFragile = item.name?.toLowerCase().includes('miroir') || 
                              item.name?.toLowerCase().includes('verre') || 
                              item.name?.toLowerCase().includes('lanterne')

            return {
              bl_id: blId,
              article_id: String(item.id),
              designation: item.title,
              marque: 'DecoShop',
              modele: item.sku || 'SKU-GENERIC',
              quantite: item.quantity,
              prix_unitaire_ttc: Number(item.price),
              poids_kg: item.grams ? item.grams / 1000 : null,
              volume_m3: null,
              fragile: isFragile,
              ordre_tri: idx + 1,
            }
          })

          const { error: insertLinesError } = await supabase
            .from('lignes_bl')
            .insert(dbLineItems)

          if (insertLinesError) throw insertLinesError
        }

        successCount++
      } catch (orderError: any) {
        failureCount++
        console.group(`[shopify-sync] Failed to process order: ${orderName} (${orderId})`);
        console.error('CAUSE:', orderError.message || orderError);
        console.error('ORDER PAYLOAD:', payload);
        console.groupEnd();
      }
    }

    const duration = Date.now() - start
    console.log(`[shopify-sync] Manual sync completed in ${duration}ms. Success: ${successCount}, Failures: ${failureCount}`)

    revalidatePath('/admin/commandes')

    return { 
      success: true, 
      processed: orders.length, 
      synced: successCount, 
      failed: failureCount,
      duration_ms: duration 
    }

  } catch (err: any) {
    // Dissect top-level action error
    console.group('[shopify-sync] CRITICAL: Synchronization failure');
    console.error('WHEN:', new Date().toISOString());
    console.error('EXCEPTION:', err.message || err);
    console.error('STACK:', err.stack);
    console.groupEnd();

    return { 
      success: false, 
      error: "Une erreur réseau ou d'autorisation est survenue lors de la synchronisation avec Shopify." 
    }
  }
}
