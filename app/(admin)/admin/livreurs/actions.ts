'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function generateTemporaryPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `Deco-${code}`
}

// Register a new driver and send their login details via Resend
export async function inviteDriverAction(email: string, nom: string, prenom: string, telephone: string) {
  try {
    const supabaseAdmin = createAdminClient()
    const password = generateTemporaryPassword()
    
    // Create user directly (so they don't need to do invitation confirmation page)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
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

    // Send credentials via Resend API
    const resendApiKey = process.env.RESEND_API_KEY
    if (resendApiKey && data?.user) {
      const baseUrl = process.env.NEXT_PUBLIC_LIVREUR_URL || 'http://localhost:5173'
      const loginUrl = baseUrl.endsWith('/') ? `${baseUrl}login/` : `${baseUrl}/login/`
      
      const htmlContent = `
<!doctype html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="utf-8">
  <title>Bienvenue chez DecoShop</title>
</head>
<body style="margin:0;padding:0;background-color:#FAF7F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#FAF7F0;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:16px;padding:32px 24px;border:1px solid #e5e7eb;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <tr>
            <td>
              <div style="text-align:center;margin-bottom:24px;">
                <span style="display:inline-block;background-color:#1e3a8a;color:#facc15;padding:8px 20px;border-radius:999px;font-weight:bold;font-size:14px;letter-spacing:0.05em;box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                  DECOSHOP TOULOUSE
                </span>
              </div>
              <h2 style="font-family:serif;font-size:22px;color:#1e3a8a;margin-top:0;margin-bottom:16px;text-align:center;">
                Bienvenue dans l'équipe, ${prenom} !
              </h2>
              <p style="margin-top:0;margin-bottom:16px;font-size:15px;line-height:1.6;color:#334155;">
                Votre compte de livreur a été créé. Vous pouvez maintenant vous connecter à votre application mobile pour gérer vos livraisons et consulter vos tournées.
              </p>
              
              <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:24px 0;">
                <h3 style="margin-top:0;margin-bottom:12px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#475569;">
                  Vos identifiants de connexion
                </h3>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="padding:4px 0;font-size:14px;color:#64748b;width:120px;"><strong>Email :</strong></td>
                    <td style="padding:4px 0;font-size:14px;color:#0f172a;font-family:monospace;font-weight:bold;">${email}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:14px;color:#64748b;width:120px;"><strong>Mot de passe :</strong></td>
                    <td style="padding:4px 0;font-size:14px;color:#0f172a;font-family:monospace;font-weight:bold;">${password}</td>
                  </tr>
                </table>
              </div>

              <div style="text-align:center;margin:32px 0 24px 0;">
                <a href="${loginUrl}" target="_blank" rel="noopener"
                   style="display:inline-block;background-color:#1e3a8a;color:#facc15;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:bold;font-size:15px;box-shadow:0 4px 6px rgba(30, 58, 138, 0.25);">
                  Accéder à mon espace livreur
                </a>
              </div>

              <p style="margin-top:0;margin-bottom:8px;font-size:13px;color:#64748b;text-align:center;">
                Pour des raisons de sécurité, veuillez modifier votre mot de passe depuis la page de profil lors de votre première connexion.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin-top:24px;margin-bottom:0;font-size:11px;color:#94a3b8;text-align:center;">
          DecoShop Toulouse &bull; Espace Livreur &bull; © 2026
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`
      const sendEmailPayload = (from: string) => ({
        from,
        to: [email],
        subject: `Bienvenue chez DecoShop Toulouse · Vos identifiants`,
        html: htmlContent,
        text: `Bonjour ${prenom},\n\nVotre compte livreur DecoShop a été créé.\n\nEmail : ${email}\nMot de passe : ${password}\n\nAccédez à votre espace : ${loginUrl}`
      })

      try {
        let mailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`
          },
          body: JSON.stringify(sendEmailPayload('DecoShop <noreply@decoshop.fr>'))
        })

        if (!mailRes.ok) {
          const errText = await mailRes.text()
          console.warn('Welcome email via noreply@decoshop.fr failed:', errText)
          if (errText.includes('validation_error') || errText.includes('domain') || mailRes.status === 400 || mailRes.status === 403) {
            console.info('Attempting fallback welcome email via onboarding@resend.dev...')
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resendApiKey}`
              },
              body: JSON.stringify(sendEmailPayload('DecoShop <onboarding@resend.dev>'))
            })
          }
        }
      } catch (mailErr) {
        console.error('Failed to send welcome email:', mailErr)
      }
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

// Send password reset link to driver
export async function resetDriverPasswordAction(email: string) {
  try {
    const supabaseAdmin = createAdminClient()
    const baseUrl = process.env.NEXT_PUBLIC_LIVREUR_URL || 'http://localhost:5173'
    const redirectUrl = baseUrl.endsWith('/') ? `${baseUrl}reset-password` : `${baseUrl}/reset-password`
    
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Une erreur inconnue est survenue' }
  }
}
