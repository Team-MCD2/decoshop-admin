import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyShopifyWebhook } from '@/lib/shopify/verify-webhook'

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const start = Date.now()

  try {
    const rawBody = await request.text()
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256')
    const topicHeader = request.headers.get('x-shopify-topic')

    // 1. Verify webhook authenticity (Spec §5.2)
    const isValid = verifyShopifyWebhook(rawBody, hmacHeader)
    if (!isValid) {
      console.warn('Shopify webhook: Invalid HMAC signature.')
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const payload = JSON.parse(rawBody)
    const orderId = String(payload.id)
    const orderName = payload.name || `Order-${orderId}`
    
    console.log(`Processing Shopify Webhook: Topic=${topicHeader}, Order=${orderName} (ID=${orderId})`)

    // Supported webhook topics
    const allowedTopics = ['orders/create', 'orders/updated', 'orders/cancelled', 'orders/delete']
    if (!allowedTopics.includes(topicHeader || '')) {
      return NextResponse.json({ success: true, ignored: true, message: `Topic ${topicHeader} ignored.` })
    }

    // Handle order cancellation
    if (topicHeader === 'orders/cancelled') {
      console.log(`[shopify-webhook] Order cancelled: ${orderName} (${orderId})`)
      
      const { data: order } = await supabase
        .from('commandes')
        .update({ statut: 'annulee', updated_at: new Date().toISOString() })
        .eq('shopify_order_id', orderId)
        .select('id')
        .maybeSingle()

      if (order) {
        await supabase
          .from('bons_livraison')
          .update({ statut: 'abandon', updated_at: new Date().toISOString() })
          .eq('commande_id', order.id)
          .not('statut', 'in', '("signe","livre")')
      }

      return NextResponse.json({ success: true, message: 'Order marked as cancelled locally.' })
    }

    // Handle order deletion
    if (topicHeader === 'orders/delete') {
      console.log(`[shopify-webhook] Order deleted: ${orderId}`)

      const { data: order } = await supabase
        .from('commandes')
        .select('id')
        .eq('shopify_order_id', orderId)
        .maybeSingle()

      if (order) {
        try {
          const { data: bls } = await supabase
            .from('bons_livraison')
            .select('id')
            .eq('commande_id', order.id)

          if (bls) {
            for (const bl of bls) {
              await supabase.from('lignes_bl').delete().eq('bl_id', bl.id)
              await supabase.from('bons_livraison').delete().eq('id', bl.id)
            }
          }

          const { error: delOrderError } = await supabase
            .from('commandes')
            .delete()
            .eq('id', order.id)

          if (delOrderError) throw delOrderError
          console.log(`[shopify-webhook] Successfully deleted order ${orderId} locally.`)
        } catch (delError: any) {
          console.warn(`[shopify-webhook] Failed to hard-delete order ${orderId}, falling back to cancelling status:`, delError.message)
          await supabase
            .from('commandes')
            .update({ statut: 'annulee', updated_at: new Date().toISOString() })
            .eq('id', order.id)
        }
      }

      return NextResponse.json({ success: true, message: 'Order deletion processed locally.' })
    }

    const customer = payload.customer
    const shipping = payload.shipping_address || payload.billing_address || {}
    
    const clientEmail = payload.email || customer?.email || ''
    const clientPhone = shipping.phone || payload.phone || customer?.phone || ''
    const clientLastName = shipping.last_name || customer?.last_name || 'Client'
    const clientFirstName = shipping.first_name || customer?.first_name || 'Anonyme'

    const shopifyCustomerId = customer?.id ? String(customer.id) : null

    // 2. Resolve or upsert Client record
    let clientId = null

    // Query by shopify_customer_id first
    if (shopifyCustomerId) {
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id')
        .eq('shopify_customer_id', shopifyCustomerId)
        .maybeSingle()
      
      if (existingClient) {
        clientId = existingClient.id
      }
    }

    // fallback query by email
    if (!clientId && clientEmail) {
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id')
        .eq('email', clientEmail)
        .maybeSingle()
      
      if (existingClient) {
        clientId = existingClient.id
      }
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
      // Update existing client
      const { error: clientUpdateError } = await supabase
        .from('clients')
        .update(clientPayload)
        .eq('id', clientId)
      
      if (clientUpdateError) throw clientUpdateError
    } else {
      // Insert new client
      const { data: newClient, error: clientInsertError } = await supabase
        .from('clients')
        .insert(clientPayload)
        .select('id')
        .single()
      
      if (clientInsertError) throw clientInsertError
      clientId = newClient.id
    }

    // 3. Resolve or upsert Commande record
    let localCommandeId = null
    const { data: existingOrder } = await supabase
      .from('commandes')
      .select('id')
      .eq('shopify_order_id', orderId)
      .maybeSingle()

    if (existingOrder) {
      localCommandeId = existingOrder.id
    }

    // Map Shopify financial and fulfillment statuses to local enums
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

    // 4. Resolve or create associated Delivery Note (bons_livraison)
    let blId = null
    const { data: existingBL } = await supabase
      .from('bons_livraison')
      .select('id, statut')
      .eq('commande_id', localCommandeId)
      .maybeSingle()

    const deliveryMode = payload.shipping_lines?.length > 0 ? 'domicile' : 'retrait_magasin'

    const blPayload = {
      commande_id: localCommandeId,
      client_id: clientId,
      statut: existingBL?.statut || 'cree', // Keep state if it already progressed (e.g. en_route, livre)
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
        .insert({
          ...blPayload,
          // DB trigger trg_auto_numero_bl generates numero_bl automatically
        })
        .select('id')
        .single()

      if (blInsertError) throw blInsertError
      blId = newBL.id
    }

    // 5. Synchronize delivery note line items (lignes_bl)
    // Clear old lines and insert updated ones
    const { error: clearLinesError } = await supabase
      .from('lignes_bl')
      .delete()
      .eq('bl_id', blId)

    if (clearLinesError) throw clearLinesError

    const lineItems = payload.line_items || []
    if (lineItems.length > 0) {
      const dbLineItems = lineItems.map((item: any, idx: number) => {
        // Simple heuristic for volume / fragile tags in shopify item details
        const isFragile = item.name?.toLowerCase().includes('miroir') || 
                          item.name?.toLowerCase().includes('verre') || 
                          item.name?.toLowerCase().includes('lanterne')

        return {
          bl_id: blId,
          article_id: String(item.id),
          designation: item.title,
          marque: 'DecoShop', // Default brand
          modele: item.sku || 'SKU-GENERIC',
          quantite: item.quantity,
          prix_unitaire_ttc: Number(item.price),
          poids_kg: item.grams ? item.grams / 1000 : null,
          volume_m3: null, // Left for manual override or webhook properties
          fragile: isFragile,
          ordre_tri: idx + 1,
        }
      })

      const { error: insertLinesError } = await supabase
        .from('lignes_bl')
        .insert(dbLineItems)

      if (insertLinesError) throw insertLinesError
    }

    const duration = Date.now() - start
    console.log(`Successfully processed Shopify Webhook for order ${orderName} in ${duration}ms.`)

    return NextResponse.json({
      success: true,
      commande_id: localCommandeId,
      bl_id: blId,
      duration_ms: duration,
    })

  } catch (error: any) {
    console.error('CRITICAL: Shopify Webhook failure:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
