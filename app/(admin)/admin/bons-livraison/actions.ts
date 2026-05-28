'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createShopifyOrder, getOrders, getShopifyOrder } from '@/lib/shopify/client'
import { revalidatePath } from 'next/cache'

interface ManualOrderForm {
  client_nom: string
  client_prenom: string
  client_email: string
  client_telephone: string
  client_adresse: string
  mode_livraison: 'domicile' | 'retrait_magasin'
  livreur_id: string
  date_livraison_prevue: string
  creneau: 'matin' | 'apres_midi' | 'soir' | ''
  items: { designation: string; quantite: number; prix_unitaire: number }[]
}

export async function createManualOrderAction(formData: ManualOrderForm) {
  const supabase = createAdminClient()
  const start = Date.now()

  console.log('[manual-order-creation] Manual order creation initiated for:', formData.client_nom)

  try {
    // 1. Calculate total amount
    const totalAmount = formData.items.reduce((s, it) => s + it.quantite * it.prix_unitaire, 0)
    if (totalAmount <= 0) {
      return { success: false, error: 'Le montant total de la commande doit être supérieur à 0.' }
    }

    // 2. Build Shopify Order payload
    const shopifyOrderPayload = {
      line_items: formData.items.map((it) => ({
        title: it.designation,
        price: it.prix_unitaire.toString(),
        quantity: it.quantite,
        sku: 'MAN-SKU'
      })),
      email: formData.client_email.trim() || undefined,
      phone: formData.client_telephone.trim() || undefined,
      shipping_address: {
        first_name: formData.client_prenom.trim() || 'Anonyme',
        last_name: formData.client_nom.trim() || 'Client',
        address1: formData.client_adresse.trim() || 'Adresse non spécifiée',
        phone: formData.client_telephone.trim() || undefined,
        city: 'Toulouse', // Default region
        country: 'France'
      },
      financial_status: 'paid' // Create directly as a paid order
    }

    console.log('[manual-order-creation] Sending payload to Shopify:', JSON.stringify(shopifyOrderPayload))

    // 3. Call Shopify API to create the order
    const shopifyRes = await createShopifyOrder(shopifyOrderPayload)

    if (shopifyRes.error || !shopifyRes.data?.order) {
      console.error('[manual-order-creation] Shopify API error:', shopifyRes.error, 'status:', shopifyRes.status)
      return {
        success: false,
        error: `Erreur d'intégration Shopify (${shopifyRes.status}) : ${shopifyRes.error || 'Impossible de créer la commande.'}`
      }
    }

    const shopifyOrder = shopifyRes.data.order
    const shopifyOrderId = String(shopifyOrder.id)
    const shopifyOrderName = shopifyOrder.name // e.g. "#1009"

    console.log(`[manual-order-creation] Order created on Shopify: ${shopifyOrderName} (ID: ${shopifyOrderId}). Inserting locally...`)

    // 4. Resolve or insert Client record
    let clientId = null
    const shopifyCustomerId = shopifyOrder.customer?.id ? String(shopifyOrder.customer.id) : null

    if (shopifyCustomerId) {
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id')
        .eq('shopify_customer_id', shopifyCustomerId)
        .maybeSingle()
      
      if (existingClient) clientId = existingClient.id
    }

    if (!clientId && formData.client_email.trim()) {
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id')
        .eq('email', formData.client_email.trim())
        .maybeSingle()
      
      if (existingClient) clientId = existingClient.id
    }

    const clientPayload = {
      nom: formData.client_nom.trim(),
      prenom: formData.client_prenom.trim() || null,
      email: formData.client_email.trim() || null,
      telephone: formData.client_telephone.trim() || null,
      adresse_ligne1: formData.client_adresse.trim(),
      shopify_customer_id: shopifyCustomerId
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

    // 5. Insert Commande record
    const { data: newOrder, error: orderInsertError } = await supabase
      .from('commandes')
      .insert({
        client_id: clientId,
        numero_commande: shopifyOrderName,
        shopify_order_id: shopifyOrderId,
        statut: 'en_preparation',
        montant_total_ttc: totalAmount,
        date_commande: new Date().toISOString()
      })
      .select('id')
      .single()

    if (orderInsertError) throw orderInsertError

    // 6. Insert Delivery Note (Bons Livraison)
    const { data: newBL, error: blInsertError } = await supabase
      .from('bons_livraison')
      .insert({
        commande_id: newOrder.id,
        client_id: clientId,
        statut: formData.livreur_id ? 'assigne' : 'cree',
        mode_livraison: formData.mode_livraison,
        livreur_id: formData.livreur_id || null,
        creneau: formData.creneau || null,
        date_livraison_prevue: formData.date_livraison_prevue || null,
        montant_total_ttc: totalAmount
      })
      .select('id, numero_bl')
      .single()

    if (blInsertError) throw blInsertError

    // 7. Insert line items
    const dbLineItems = formData.items.map((it, idx) => {
      const isFragile = it.designation.toLowerCase().includes('miroir') || 
                        it.designation.toLowerCase().includes('verre') || 
                        it.designation.toLowerCase().includes('lanterne')
      return {
        bl_id: newBL.id,
        designation: it.designation,
        quantite: it.quantite,
        prix_unitaire_ttc: it.prix_unitaire,
        fragile: isFragile,
        ordre_tri: idx + 1
      }
    })

    const { error: lineInsertError } = await supabase
      .from('lignes_bl')
      .insert(dbLineItems)

    if (lineInsertError) throw lineInsertError

    const duration = Date.now() - start
    console.log(`[manual-order-creation] Successfully created manual order ${shopifyOrderName} and sync-inserted locally in ${duration}ms.`)

    revalidatePath('/admin/bons-livraison')
    return { success: true, numero_bl: newBL.numero_bl }

  } catch (err: any) {
    console.error('[manual-order-creation] CRITICAL failure:', err)
    return { success: false, error: err.message || 'Une erreur serveur inconnue est survenue.' }
  }
}

export interface ImportOrderForm {
  shopify_order_id: string
  numero_commande: string
  client_nom: string
  client_prenom: string
  client_email: string
  client_telephone: string
  client_adresse: string
  mode_livraison: 'domicile' | 'retrait_magasin'
  livreur_id: string
  date_livraison_prevue: string
  creneau: 'matin' | 'apres_midi' | 'soir' | ''
  items: { designation: string; quantite: number; prix_unitaire: number }[]
  shopify_customer_id: string | null
}

export async function getUnfulfilledShopifyOrdersAction() {
  const supabase = createAdminClient()
  try {
    const { data: localCommandes, error: dbError } = await supabase
      .from('v_commandes_sans_bl')
      .select('*, clients(*)')
      .order('date_commande', { ascending: false })

    if (dbError) {
      console.error('[get-unfulfilled-orders] Database error:', dbError)
      throw dbError
    }

    return {
      success: true,
      orders: (localCommandes || []).map(c => ({
        id: c.shopify_order_id || c.id,
        name: c.numero_commande,
        email: c.clients?.email || '',
        total_price: String(c.montant_total_ttc),
        customer_name: c.clients ? `${c.clients.prenom || ''} ${c.clients.nom || ''}`.trim() : 'Client Anonyme',
        shipping_address: c.clients ? {
          first_name: c.clients.prenom || '',
          last_name: c.clients.nom || '',
          address1: c.clients.adresse_ligne1 || '',
          city: c.clients.ville || '',
          zip: c.clients.code_postal || '',
          phone: c.clients.telephone || ''
        } : null,
        line_items: [],
        customer: c.clients ? {
          id: c.clients.shopify_customer_id || '',
          first_name: c.clients.prenom || '',
          last_name: c.clients.nom || '',
          email: c.clients.email || ''
        } : null
      }))
    }
  } catch (err: any) {
    console.error('[get-unfulfilled-orders] Error:', err)
    return { success: false, error: err.message || 'Une erreur inconnue est survenue.' }
  }
}

export async function createBlFromShopifyOrderAction(formData: ImportOrderForm) {
  const supabase = createAdminClient()
  const start = Date.now()

  console.log('[import-shopify-order] Importing Shopify order:', formData.numero_commande)

  try {
    const totalAmount = formData.items.reduce((s, it) => s + it.quantite * it.prix_unitaire, 0)
    if (totalAmount <= 0) {
      return { success: false, error: 'Le montant total de la commande doit être supérieur à 0.' }
    }

    let clientId = null
    const shopifyCustomerId = formData.shopify_customer_id

    if (shopifyCustomerId) {
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id')
        .eq('shopify_customer_id', shopifyCustomerId)
        .maybeSingle()
      
      if (existingClient) clientId = existingClient.id
    }

    if (!clientId && formData.client_email.trim()) {
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id')
        .eq('email', formData.client_email.trim())
        .maybeSingle()
      
      if (existingClient) clientId = existingClient.id
    }

    const clientPayload = {
      nom: formData.client_nom.trim(),
      prenom: formData.client_prenom.trim() || null,
      email: formData.client_email.trim() || null,
      telephone: formData.client_telephone.trim() || null,
      adresse_ligne1: formData.client_adresse.trim(),
      shopify_customer_id: shopifyCustomerId
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

    const { data: existingOrder } = await supabase
      .from('commandes')
      .select('id')
      .eq('shopify_order_id', formData.shopify_order_id)
      .maybeSingle()

    if (existingOrder) {
      return { success: false, error: `La commande ${formData.numero_commande} a déjà été synchronisée localement.` }
    }

    const { data: newOrder, error: orderInsertError } = await supabase
      .from('commandes')
      .insert({
        client_id: clientId,
        numero_commande: formData.numero_commande,
        shopify_order_id: formData.shopify_order_id,
        statut: 'en_preparation',
        montant_total_ttc: totalAmount,
        date_commande: new Date().toISOString()
      })
      .select('id')
      .single()

    if (orderInsertError) throw orderInsertError

    const { data: newBL, error: blInsertError } = await supabase
      .from('bons_livraison')
      .insert({
        commande_id: newOrder.id,
        client_id: clientId,
        statut: formData.livreur_id ? 'assigne' : 'cree',
        mode_livraison: formData.mode_livraison,
        livreur_id: formData.livreur_id || null,
        creneau: formData.creneau || null,
        date_livraison_prevue: formData.date_livraison_prevue || null,
        montant_total_ttc: totalAmount
      })
      .select('id, numero_bl')
      .single()

    if (blInsertError) throw blInsertError

    const dbLineItems = formData.items.map((it, idx) => {
      const isFragile = it.designation.toLowerCase().includes('miroir') || 
                        it.designation.toLowerCase().includes('verre') || 
                        it.designation.toLowerCase().includes('lanterne')
      return {
        bl_id: newBL.id,
        designation: it.designation,
        quantite: it.quantite,
        prix_unitaire_ttc: it.prix_unitaire,
        fragile: isFragile,
        ordre_tri: idx + 1
      }
    })

    const { error: lineInsertError } = await supabase
      .from('lignes_bl')
      .insert(dbLineItems)

    if (lineInsertError) throw lineInsertError

    const duration = Date.now() - start
    console.log(`[import-shopify-order] Successfully imported order ${formData.numero_commande} and created BL ${newBL.numero_bl} in ${duration}ms.`)

    revalidatePath('/admin/bons-livraison')
    return { success: true, numero_bl: newBL.numero_bl }

  } catch (err: any) {
    console.error('[import-shopify-order] CRITICAL failure:', err)
    return { success: false, error: err.message || 'Une erreur serveur inconnue est survenue.' }
  }
}

export async function getShopifyOrderLineItemsAction(shopifyOrderId: string) {
  try {
    if (!shopifyOrderId) {
      return { success: false, error: 'Identifiant de commande manquant' }
    }
    const res = await getShopifyOrder(shopifyOrderId)
    if (res.error || !res.data?.order) {
      console.error('[get-shopify-order-details] Shopify error:', res.error)
      return { success: false, error: res.error || 'Impossible de charger les détails de cette commande' }
    }
    const order = res.data.order
    return {
      success: true,
      line_items: order.line_items || []
    }
  } catch (err: any) {
    console.error('[get-shopify-order-details] Error:', err)
    return { success: false, error: err.message || 'Une erreur inconnue est survenue.' }
  }
}
