'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Invite a new driver via Supabase Auth Admin API
export async function inviteDriverAction(email: string, nom: string, prenom: string, telephone: string) {
  try {
    const supabaseAdmin = createAdminClient()
    
    // Invite driver (redirect to PWA domain)
    const redirectUrl = process.env.NEXT_PUBLIC_LIVREUR_URL || 'http://localhost:5173'
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectUrl,
      data: {
        nom,
        prenom,
        telephone,
        role: 'livreur',
        preferred_language: 'fr'
      }
    })

    if (error) {
      return { success: false, error: error.message }
    }

    // Force update profile active flag if successfully created by trigger (default is false)
    if (data?.user?.id) {
      const supabase = await createClient()
      await supabase
        .from('profiles')
        .update({ is_active: true })
        .eq('id', data.user.id)
    }

    revalidatePath('/admin/livreurs')
    return { success: true, user: data?.user }
  } catch (err: any) {
    return { success: false, error: err.message || 'Une erreur inconnue est survenue' }
  }
}

// Update driver profile details
export async function updateDriverAction(
  id: string,
  patch: {
    nom: string
    prenom: string
    telephone: string
    is_active: boolean
    vehicle_type: 'voiture' | 'utilitaire' | 'camionnette' | 'camion' | null
    vehicle_capacity_m3: number | null
    vehicle_immatriculation: string | null
    zones_couvertes: string[]
  }
) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('profiles')
      .update({
        nom: patch.nom,
        prenom: patch.prenom,
        telephone: patch.telephone,
        is_active: patch.is_active,
        vehicle_type: patch.vehicle_type || null,
        vehicle_capacity_m3: patch.vehicle_capacity_m3 || null,
        vehicle_immatriculation: patch.vehicle_immatriculation || null,
        zones_couvertes: patch.zones_couvertes || [],
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/admin/livreurs')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Une erreur inconnue est survenue' }
  }
}

// Delete driver via Supabase Auth Admin API (auth.admin.deleteUser)
export async function deleteDriverAction(id: string) {
  try {
    const supabaseAdmin = createAdminClient()
    
    // Delete user from auth (cascades to profiles table)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id)
    if (authError) {
      return { success: false, error: authError.message }
    }

    revalidatePath('/admin/livreurs')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Une erreur inconnue est survenue' }
  }
}
