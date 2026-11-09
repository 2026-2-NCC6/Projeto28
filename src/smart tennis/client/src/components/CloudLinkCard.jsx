import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CloudOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Link2,
  Unlink,
  Lock,
  Mail,
  ShieldCheck,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  getCloudConfig,
  getCloudStatus,
  linkOnlineAccount,
  unlinkOnlineAccount,
  getStoredCloudSession
} from '../services/cloudAuthService';
import { api } from '../services/api';
import { isEquipmentMode } from '../services/appEnvironment';

export default function CloudLinkCard({ onStatusChange }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    loadCloudData();
  }, []);

  const loadCloudData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [cfg, stat] = await Promise.all([
        getCloudConfig().catch(() => ({ configured: false })),
        getCloudStatus().catch(() => ({ linked: false }))
      ]);
      setConfig(cfg);
      setStatus(stat);
      if (onStatusChange) onStatusChange(stat);
    } catch (err) {
      setErrorMsg('Não foi possível verificar o status da nuvem com o servidor local.');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email || !password) {
      setErrorMsg('Informe o e-mail e a senha da sua conta online.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await linkOnlineAccount({ email, password });
      setSuccessMsg(result.message || 'Conta online vinculada com sucesso!');
      setPassword('');
      setShowForm(false);
      await loadCloudData();
    } catch (err) {
      setErrorMsg(err.message || 'Falha ao vincular conta online com o servidor Supabase.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const result = await unlinkOnlineAccount();
      setSuccessMsg(result.message || 'Conta online desvinculada.');
      setShowUnlinkConfirm(false);
      await loadCloudData();
    } catch (err) {
      setErrorMsg(err.message || 'Falha ao desvincular conta online.');
    } finally {
      setUnlinking(false);
    }
  };

  const handleAuthorizePairing = async () => {
    setPairingLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const session = getStoredCloudSession();
      if (!session?.accessToken) {
        setErrorMsg('Faça login com sua conta online para autorizar o pareamento deste equipamento.');
        return;
      }
      const res = await api.authorizeEquipmentPairing(session.accessToken);
      if (res.success) {
        setSuccessMsg(res.message || 'Equipamento autorizado e pareado com sucesso na nuvem!');
      } else {
        setErrorMsg(res.error || 'Falha ao autorizar pareamento do equipamento.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao conectar ao serviço de autorização.');
    } finally {
      setPairingLoading(false);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Data não informada';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const isLinked = Boolean(status?.linked && status?.identity);

  return (
    <div
      data-testid="cloud-link-card"
      className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] space-y-5 transition-all shadow-sm"
    >
      
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${
              isLinked
                ? 'bg-[#E8EDF1] dark:bg-[#18242E] border-[#B8F044] text-[#142B3D] dark:text-[#B8F044]'
                : 'bg-[#E8EDF1] dark:bg-[#18242E] border-amber-500/40 text-amber-500'
            }`}
          >
            {isLinked ? <Cloud className="w-5 h-5" /> : <CloudOff className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#142B3D] dark:text-[#F1F5F9] tracking-wide">
                Conta Online & Sincronização Cloud
              </h3>
            </div>
            <p className="text-xs text-[#475569] dark:text-[#A8BAC8] mt-0.5">
              Associação de identidade com o Supabase Auth para envio automático de partidas.
            </p>
          </div>
        </div>

        
        <button
          type="button"
          onClick={loadCloudData}
          disabled={loading || submitting}
          data-testid="btn-refresh-cloud-status"
          className="p-2 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] text-[#475569] dark:text-[#A8BAC8] hover:text-[#142B3D] dark:hover:text-[#F1F5F9] transition-colors disabled:opacity-50"
          title="Atualizar status da conexão online"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#B8F044]' : ''}`} />
        </button>
      </div>

      
      <div className="p-4 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <span
            data-testid="cloud-link-status-badge"
            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
              isLinked
                ? 'bg-[#B8F044]/20 text-[#142B3D] dark:text-[#B8F044] border-[#B8F044]/50'
                : config?.configured
                ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40'
                : 'bg-slate-200 dark:bg-zinc-900 text-slate-700 dark:text-zinc-400 border-slate-300 dark:border-zinc-700'
            }`}
          >
            {isLinked ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#B8F044]" />
                <span>CONTA ONLINE VINCULADA</span>
              </>
            ) : config?.configured ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>OFFLINE (SEM VÍNCULO ONLINE)</span>
              </>
            ) : (
              <span>NUVEM DESATIVADA NO SERVIDOR</span>
            )}
          </span>
        </div>

        <div className="text-[11px] font-mono text-[#475569] dark:text-[#A8BAC8]">
          {isLinked && status?.identity?.linkedAt && (
            <span>Vinculado em: {formatDate(status.identity.linkedAt)}</span>
          )}
          {!isLinked && config?.configured && (
            <span>Partidas salvas localmente aguardam vinculação</span>
          )}
        </div>
      </div>

      
      {errorMsg && (
        <div
          data-testid="cloud-link-error-msg"
          className="p-3.5 rounded-xl bg-rose-100 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-300 text-xs font-mono flex items-start space-x-2.5"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div
          data-testid="cloud-link-success-msg"
          className="p-3.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200 text-xs font-mono flex items-start space-x-2.5"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      
      {isLinked && (
        <div className="p-4 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#2563EB] dark:text-[#B8F044] font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Identidade Cloud Autenticada
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653]">
              <span className="text-[10px] font-mono text-[#475569] dark:text-[#A8BAC8] block">E-MAIL VINCULADO</span>
              <span className="font-bold text-[#142B3D] dark:text-[#F1F5F9] truncate block">
                {status.identity.email || '(sem e-mail no token)'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653]">
              <span className="text-[10px] font-mono text-[#475569] dark:text-[#A8BAC8] block">STATUS DA VINCULAÇÃO</span>
              <span className="font-bold text-[11px] text-[#2563EB] dark:text-[#B8F044] truncate block">
                Ativo na Nuvem
              </span>
            </div>
          </div>

          <p className="text-[11px] text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
            Suas partidas finalizadas neste equipamento agora são enfileiradas e sincronizadas
            automaticamente com o banco de dados do Supabase.
          </p>

          {isEquipmentMode() && (
            <div className="p-3 rounded-xl bg-[#0B151F]/30 dark:bg-[#1B2936]/40 border border-[#2563EB]/20 dark:border-[#B8F044]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-[#142B3D] dark:text-[#F1F5F9] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#2563EB] dark:text-[#B8F044]" />
                  <span>Pareamento com Notebook da Quadra</span>
                </span>
                <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] block">
                  Revalide a janela autorizada para envio de partidas à nuvem.
                </span>
              </div>
              <button
                type="button"
                onClick={handleAuthorizePairing}
                disabled={pairingLoading}
                className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] dark:bg-[#B8F044] dark:hover:bg-[#A3DE34] text-white dark:text-[#0A120E] text-xs font-bold font-mono transition-colors disabled:opacity-50 whitespace-nowrap self-stretch sm:self-auto text-center"
              >
                {pairingLoading ? 'Autorizando...' : 'Autorizar Pareamento'}
              </button>
            </div>
          )}

          
          <div className="pt-2 border-t border-[#B8C6D0] dark:border-[#344653] flex items-center justify-between">
            {!showUnlinkConfirm ? (
              <button
                type="button"
                onClick={() => setShowUnlinkConfirm(true)}
                data-testid="btn-unlink-cloud"
                className="text-xs font-mono text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1.5 transition-colors py-1 px-2"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Desvincular conta online</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 w-full justify-between">
                <span className="text-xs text-rose-600 dark:text-rose-300 font-mono">Confirmar desvinculação?</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUnlink}
                    disabled={unlinking}
                    className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold font-mono transition-colors disabled:opacity-50"
                  >
                    {unlinking ? 'Desvinculando...' : 'Sim, desvincular'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUnlinkConfirm(false)}
                    className="px-3 py-1 rounded-lg bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-xs font-mono text-[#475569] dark:text-[#A8BAC8] hover:text-[#142B3D] dark:hover:text-[#F1F5F9]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      
      {!isLinked && config?.configured && (
        <div className="space-y-4">
          {!showForm ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
              <p className="text-xs text-[#475569] dark:text-[#A8BAC8]">
                Conecte seu atleta a uma conta Supabase Auth existente para liberar a sincronização online.
              </p>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                data-testid="btn-open-cloud-link"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl btn-sport-lime font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-center space-x-2 shadow-sm transition-all shrink-0"
              >
                <Link2 className="w-4 h-4" />
                <span>Vincular Conta Online</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleLinkSubmit} className="p-4 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-[#B8C6D0] dark:border-[#344653] pb-2">
                <span className="text-xs font-mono uppercase tracking-wider text-[#2563EB] dark:text-[#B8F044] font-bold flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" /> Autenticar Conta Online
                </span>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-xs font-mono text-[#475569] dark:text-[#A8BAC8] hover:text-[#142B3D] dark:hover:text-[#F1F5F9]"
                >
                  Fechar
                </button>
              </div>

              <p className="text-[11px] text-[#475569] dark:text-[#A8BAC8]">
                Informe o e-mail e a senha cadastrados no Supabase Auth. Suas credenciais são enviadas diretamente ao servidor de autenticação seguro.
              </p>

              <div>
                <label className="block text-[11px] font-mono text-[#475569] dark:text-[#A8BAC8] mb-1.5 uppercase">
                  E-mail da Conta Online
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ex: nicolas@exemplo.com"
                    data-testid="input-cloud-email"
                    required
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] text-[#142B3D] dark:text-[#F1F5F9] text-xs font-mono focus:border-[#B8F044] focus:outline-none transition-colors"
                  />
                  <Mail className="w-3.5 h-3.5 text-[#475569] dark:text-[#A8BAC8] absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#475569] dark:text-[#A8BAC8] mb-1.5 uppercase">
                  Senha da Conta Online
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    data-testid="input-cloud-password"
                    required
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] text-[#142B3D] dark:text-[#F1F5F9] text-xs font-mono focus:border-[#B8F044] focus:outline-none transition-colors"
                  />
                  <Lock className="w-3.5 h-3.5 text-[#475569] dark:text-[#A8BAC8] absolute left-3 top-3" />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  data-testid="btn-submit-cloud-link"
                  className="flex-1 py-3 rounded-xl btn-sport-lime font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-center space-x-2 shadow-sm transition-all disabled:opacity-50"
                >
                  <Link2 className="w-4 h-4" />
                  <span>{submitting ? 'AUTENTICANDO & VINCULANDO...' : 'VINCULAR MINHA CONTA ONLINE'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={submitting}
                  className="px-4 py-3 rounded-xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] text-xs font-mono text-[#475569] dark:text-[#A8BAC8] hover:text-[#142B3D] dark:hover:text-[#F1F5F9] transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
