'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldAlert, 
  Download, 
  Trash2, 
  Lock, 
  Unlock, 
  Loader2, 
  RefreshCw 
} from 'lucide-react';
import { 
  getSuperadminChallengeAction, 
  verifySuperadminPowAction, 
  checkSuperadminUnlockStatusAction, 
  downloadDatabaseBackupAction, 
  wipeDatabaseAction, 
  lockSuperadminSessionAction 
} from './actions';
import { solveChallengeSync, PowChallenge, PowSolution } from '@/lib/security/pow';

export default function SuperadminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // PoW State
  const [powChallenge, setPowChallenge] = useState<PowChallenge | null>(null);
  const [powSolving, setPowSolving] = useState(false);
  const [powProgress, setPowProgress] = useState(0);

  // Action states
  const [downloading, setDownloading] = useState(false);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);

  // Initial check
  useEffect(() => {
    async function initCheck() {
      try {
        const isUnlocked = await checkSuperadminUnlockStatusAction();
        setUnlocked(isUnlocked);
      } catch (err: any) {
        setError(err.message || "Erreur d'authentification.");
      } finally {
        setLoading(false);
      }
    }
    initCheck();
  }, []);

  // Handle request challenge & solve
  const handleSolveChallenge = async () => {
    setError(null);
    setPowSolving(true);
    setPowProgress(0);

    try {
      // 1. Get challenge
      const challenge = await getSuperadminChallengeAction();
      setPowChallenge(challenge);

      // Small delay to let UI render the loading state
      await new Promise((r) => setTimeout(r, 200));

      // 2. Solve PoW (sync on the main thread, but with progress ticks)
      const nonce = solveChallengeSync(challenge, (attempts) => {
        setPowProgress(attempts);
      });

      // 3. Submit solution
      const sol: PowSolution = {
        salt: challenge.salt,
        timestamp: challenge.timestamp,
        signature: challenge.signature,
        nonce
      };

      const result = await verifySuperadminPowAction(sol);
      if (result.success) {
        setUnlocked(true);
        setSuccess("Accès superadmin déverrouillé avec succès.");
      }
    } catch (err: any) {
      setError(err.message || "Échec de la vérification Proof-of-Work.");
    } finally {
      setPowSolving(false);
      setPowChallenge(null);
    }
  };

  // Download Backup
  const handleDownloadBackup = async () => {
    setError(null);
    setSuccess(null);
    setDownloading(true);

    try {
      const backupJsonString = await downloadDatabaseBackupAction();
      
      // Trigger browser download
      const blob = new Blob([backupJsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `decoshop_db_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setHasDownloaded(true);
      setSuccess("Sauvegarde téléchargée avec succès. Le bouton de réinitialisation est désormais actif.");
    } catch (err: any) {
      setError(err.message || "Échec du téléchargement.");
    } finally {
      setDownloading(false);
    }
  };

  // Wipe Database
  const handleWipeDatabase = async () => {
    if (wipeConfirmText !== 'EFFACER LA BASE DE DONNEES') {
      setError("Le texte de confirmation est incorrect.");
      return;
    }

    setError(null);
    setSuccess(null);
    setWiping(true);
    setPowProgress(0);

    try {
      // Wiping requires a FRESH PoW challenge verification to prevent automated replays
      const challenge = await getSuperadminChallengeAction();
      
      // Solve PoW
      const nonce = solveChallengeSync(challenge, (attempts) => {
        setPowProgress(attempts);
      });

      const sol: PowSolution = {
        salt: challenge.salt,
        timestamp: challenge.timestamp,
        signature: challenge.signature,
        nonce
      };

      const result = await wipeDatabaseAction(wipeConfirmText, sol);
      if (result.success) {
        setUnlocked(false);
        setHasDownloaded(false);
        setWipeConfirmText('');
        setShowWipeConfirm(false);
        setSuccess("LA BASE DE DONNEES A ETE REINITIALISEE. Toutes les données opérationnelles ont été purgées.");
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "Échec de la réinitialisation de la base.");
    } finally {
      setWiping(false);
    }
  };

  // Lock session
  const handleLockSession = async () => {
    await lockSuperadminSessionAction();
    setUnlocked(false);
    setHasDownloaded(false);
    setSuccess("Session superadmin verrouillée.");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-navy mb-4" />
        <p className="text-sm text-muted">Vérification de la session sécurisée...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-navy-100 shadow-sm">
        <div>
          <h1 className="text-3xl font-bold font-display text-navy mb-1 flex items-center gap-2">
            <ShieldAlert className="w-8 h-8 text-yellow" />
            Contrôle Super-Administration
          </h1>
          <p className="text-sm text-muted">Accès aux opérations critiques de base de données.</p>
        </div>
        {unlocked && (
          <button
            onClick={handleLockSession}
            className="flex items-center gap-2 bg-navy hover:bg-navy-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-all shadow-sm shrink-0"
          >
            <Lock className="w-4 h-4 text-yellow" />
            Verrouiller la session
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3 animate-shake">
          <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700 font-semibold">{error}</div>
        </div>
      )}

      {success && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-4 flex items-start gap-3">
          <Unlock className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div className="text-sm text-green-700 font-semibold">{success}</div>
        </div>
      )}

      {/* Verification Gate (Locked view) */}
      {!unlocked ? (
        <div className="bg-white rounded-2xl border border-navy-100 p-8 shadow-md max-w-xl mx-auto text-center space-y-6">
          <div className="inline-flex p-4 bg-navy-50 rounded-full text-navy mb-2">
            <Lock className="w-12 h-12 text-navy" />
          </div>
          
          <h2 className="text-2xl font-bold font-display text-navy">Défi Cryptographique Requis</h2>
          
          <p className="text-sm text-muted leading-relaxed">
            Cet espace contient des contrôles destructeurs et nécessite de prouver l&apos;activité d&apos;un client légitime 
            par le biais d&apos;un défi Proof-of-Work (PoW). Le CPU de votre navigateur va résoudre une équation SHA-256 (environ 2-5 secondes).
          </p>

          <div className="pt-4">
            {powSolving ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 text-navy font-bold">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Calcul cryptographique en cours...
                </div>
                <div className="w-full bg-navy-50 rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="bg-yellow h-full transition-all duration-200" 
                    style={{ width: `${Math.min((powProgress / 100000) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted">
                  Essais de hachage : {powProgress.toLocaleString()} nonces testés.
                </p>
              </div>
            ) : (
              <button
                onClick={handleSolveChallenge}
                className="w-full flex items-center justify-center gap-2 bg-yellow hover:bg-yellow-600 text-navy font-bold px-6 py-3.5 rounded-xl transition-all shadow-md transform hover:scale-105"
              >
                <RefreshCw className="w-5 h-5 animate-spin-slow" />
                Résoudre le défi PoW &amp; Déverrouiller
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Control Panel (Unlocked view) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Backup */}
          <div className="bg-white rounded-2xl border border-navy-100 p-6 shadow-sm flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <div className="inline-flex p-3 bg-green-50 rounded-xl text-green-600">
                <Download className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-navy font-display">Sauvegarde de la Base</h3>
              <p className="text-sm text-muted leading-relaxed">
                Téléchargez l&apos;intégralité des données opérationnelles de production au format JSON. 
                Ce fichier contient les tables clients, commandes, bons de livraison, lignes d&apos;articles et historiques.
              </p>
            </div>
            
            <button
              onClick={handleDownloadBackup}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-800 text-white font-bold px-4 py-3 rounded-xl transition-all shadow-sm disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Génération du JSON...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Sauvegarder les Données (JSON)
                </>
              )}
            </button>
          </div>

          {/* Card 2: Nuclear wipe */}
          <div className="bg-white rounded-2xl border border-red-100 p-6 shadow-sm flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <div className="inline-flex p-3 bg-red-50 rounded-xl text-red-600 animate-pulse">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-red-600 font-display">Réinitialisation Complète</h3>
              <p className="text-sm text-muted leading-relaxed">
                Purgez l&apos;ensemble de la base de données opérationnelle. 
                Cette action est irréversible. Les profils d&apos;administrateurs (Fayssal et Superadmin) ne seront pas supprimés.
              </p>
              
              {!hasDownloaded && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium leading-relaxed">
                  ⚠️ Par mesure de sécurité, vous devez d&apos;abord télécharger la sauvegarde JSON ci-contre pour activer ce bouton.
                </div>
              )}
            </div>

            {showWipeConfirm ? (
              <div className="space-y-4 pt-4 border-t border-red-50">
                <div className="space-y-2">
                  <label htmlFor="wipe-confirmation" className="block text-xs font-bold text-red-700 uppercase tracking-wider">
                    Tapez &quot;EFFACER LA BASE DE DONNEES&quot; pour valider
                  </label>
                  <input
                    id="wipe-confirmation"
                    type="text"
                    placeholder="CONFIRMATION EN MAJUSCULES"
                    value={wipeConfirmText}
                    onChange={(e) => setWipeConfirmText(e.target.value)}
                    className="w-full rounded-xl border border-red-200 bg-white py-3 px-4 text-sm text-ink placeholder-muted outline-none focus:ring-2 focus:ring-red-200 transition-all font-mono"
                    disabled={wiping}
                  />
                </div>

                {wiping ? (
                  <div className="space-y-2 text-center">
                    <div className="flex items-center justify-center gap-2 text-red-600 font-bold text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Résolution du défi de sécurité pour réinitialisation...
                    </div>
                    <p className="text-[10px] text-muted">
                      Nonces testés : {powProgress.toLocaleString()}
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowWipeConfirm(false)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-ink font-semibold px-4 py-2.5 rounded-xl text-sm transition-all"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleWipeDatabase}
                      disabled={wipeConfirmText !== 'EFFACER LA BASE DE DONNEES'}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Déclencher la purge
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowWipeConfirm(true)}
                disabled={!hasDownloaded}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-3 rounded-xl transition-all shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-5 h-5" />
                Réinitialiser la Base (Wipe)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
