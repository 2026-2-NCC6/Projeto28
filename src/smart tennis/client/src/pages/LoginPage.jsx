import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  LogIn,
  UserPlus,
  Lock,
  User,
  Mail,
  ArrowLeft,
  ShieldAlert,
  Play,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  KeyRound
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isNativeMobile, isMobileDevice } from '../services/serverConfig';
import { isWebDemoMode, isEquipmentMode, isCloudOnlyMode } from '../services/appEnvironment';
import ThemeToggle from '../components/ui/ThemeToggle';

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState('login');
  
  const [emailOrUser, setEmailOrUser] = useState('');
  const [password, setPassword] = useState('');
  
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState(null);

  const [unconfirmedEmail, setUnconfirmedEmail] = useState(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendStatus, setResendStatus] = useState(null);

  const [error, setError] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const usernameInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  const { login, loginCloud, signupCloud, recoverPasswordCloud, resendConfirmationEmail, startGuest } = useAuth();
  const navigate = useNavigate();

  const canShowGuest = isEquipmentMode() && !isNativeMobile() && !isMobileDevice();

  const handleResendConfirmation = async () => {
    if (!unconfirmedEmail) return;
    setResendingEmail(true);
    setResendStatus(null);
    try {
      const res = await resendConfirmationEmail(unconfirmedEmail);
      setResendStatus({
        success: true,
        message: res?.message || 'E-mail de confirmação reenviado com sucesso! Verifique sua caixa de entrada e spam.'
      });
    } catch (err) {
      setResendStatus({
        success: false,
        message: err?.message || 'Falha ao reenviar e-mail de confirmação. Tente novamente mais tarde.'
      });
    } finally {
      setResendingEmail(false);
    }
  };

  const handlePlayAsGuest = async () => {
    if (!canShowGuest) {
      setError('O modo visitante está disponível apenas no equipamento físico da quadra.');
      return;
    }
    setActiveTab('guest');
    setError(null);
    setInfoMessage(null);

    setGuestLoading(true);
    try {
      await startGuest();
      navigate('/app/play');
    } catch (err) {
      setError(err.message || 'Falha ao iniciar modo visitante.');
    } finally {
      setGuestLoading(false);
    }
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setInfoMessage(null);

    const rawInput = (emailOrUser || '').trim();
    if (!rawInput || !password) {
      setError('Informe seu e-mail (ou usuário) e senha.');
      return;
    }

    const isEmail = rawInput.includes('@');
    const isMobile = isMobileDevice() || isNativeMobile();
    const isCloudMode = isCloudOnlyMode() || isMobile;

    if (isCloudMode && !isEmail) {
      setError('No celular ou acesso online, utilize o seu e-mail cadastrado (ex: atleta@exemplo.com).');
      return;
    }

    setLoading(true);

    try {
      if (isEmail) {
        try {
          const authUser = await loginCloud(rawInput.toLowerCase(), password);
          setInfoMessage('Login validado! Redirecionando...');
          setTimeout(() => {
            if (isMobile) {
              navigate('/mobile/dashboard');
            } else if (authUser?.role === 'admin') {
              navigate('/admin/overview');
            } else {
              navigate('/app/dashboard');
            }
          }, 350);
          return;
        } catch (cloudErr) {
          if (cloudErr.requiresConfirmation || (cloudErr.message && cloudErr.message.includes('confirmado'))) {
            setUnconfirmedEmail(rawInput.toLowerCase());
          }
          throw cloudErr;
        }
      } else {
        const localUser = await login(rawInput, password);
        setInfoMessage('Login validado! Redirecionando...');
        setTimeout(() => {
          if (isMobile) {
            navigate('/mobile/dashboard');
          } else if (localUser?.role === 'admin') {
            navigate('/admin/overview');
          } else {
            navigate('/app/dashboard');
          }
        }, 350);
        return;
      }
    } catch (err) {
      let msg = err.message || 'Falha na autenticação. Verifique suas credenciais.';
      if (msg.includes('UNEXPECTED_HTML_RESPONSE') || msg.includes('Failed to fetch') || msg.includes('NETWORK_ERROR') || msg.includes('NetworkError')) {
        if (isEmail) {
          msg = 'Falha ao conectar com o serviço online. Verifique sua conexão com a internet.';
        } else {
          msg = 'Servidor local da quadra inacessível. Utilize seu e-mail cadastrado para entrar via nuvem.';
        }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setUnconfirmedEmail(null);

    if (!signupName.trim() || !signupEmail.trim() || !signupPassword) {
      setError('Preencha todos os campos do formulário de cadastro.');
      return;
    }

    if (!signupEmail.includes('@') || !signupEmail.includes('.')) {
      setError('Informe um endereço de e-mail válido.');
      return;
    }

    if (signupPassword.length < 6) {
      setError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setError('As senhas digitadas não coincidem.');
      return;
    }

    setLoading(true);

    try {
      const res = await signupCloud(signupName.trim(), signupEmail.trim(), signupPassword);
      if (res.requiresConfirmation) {
        setUnconfirmedEmail(signupEmail.trim());
        setInfoMessage('Conta cadastrada com sucesso! Um link de confirmação foi enviado para o seu e-mail. Confirme para acessar.');
        setActiveTab('login');
        setEmailOrUser(signupEmail.trim());
      } else {
        setInfoMessage('Conta criada com sucesso! Redirecionando...');
        setTimeout(() => {
          navigate(isMobileDevice() ? '/mobile/dashboard' : '/app/dashboard');
        }, 800);
      }
    } catch (err) {
      setError(err.message || 'Falha ao realizar cadastro.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverPassword = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setRecoverySuccess(null);

    if (!recoveryEmail.trim() || !recoveryEmail.includes('@')) {
      setError('Informe um e-mail válido para recuperação de senha.');
      return;
    }

    setLoading(true);
    try {
      const res = await recoverPasswordCloud(recoveryEmail.trim());
      setRecoverySuccess(res.message || 'E-mail de recuperação enviado com sucesso!');
    } catch (err) {
      setError(err.message || 'Falha ao solicitar recuperação de senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#DCE3E8] dark:bg-[#101820] text-[#142B3D] dark:text-[#F1F5F9] flex flex-col justify-between p-4 sm:p-8 relative selection:bg-[#B8F044] selection:text-[#101820] font-sans transition-colors duration-200">
      
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#B8C6D0]/30 dark:bg-[#18242E]/50 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#B8F044]/15 dark:bg-[#B8F044]/5 rounded-full blur-[140px] pointer-events-none"></div>

      
      <div className="max-w-md w-full mx-auto flex items-center justify-between z-10">
        <Link
          to="/"
          className="inline-flex items-center space-x-2 text-xs font-bold text-[#475569] dark:text-[#A8BAC8] hover:text-[#142B3D] dark:hover:text-[#F1F5F9] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao Início</span>
        </Link>
        <ThemeToggle />
      </div>

      
      <div className="max-w-md w-full mx-auto my-auto z-10 py-6">
        <div className="p-6 sm:p-8 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-[0_12px_32px_-4px_rgba(16,24,32,0.18),0_4px_12px_-2px_rgba(16,24,32,0.08)] space-y-6">
          
          
          <div className="text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[#142B3D] dark:bg-[#0D1B2A] border border-[#B8F044]/50 flex items-center justify-center text-[#B8F044] shadow-sm">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="2.5" fill="#B8F044" />
              </svg>
            </div>
            <h1 className="text-2xl font-black tracking-wider text-[#142B3D] dark:text-[#F1F5F9]">
              <span>MOTION </span>
              <span className="text-[#2563EB] dark:text-[#60A5FA]">TENNIS</span>
            </h1>
            <p className="text-xs text-[#475569] dark:text-[#A8BAC8] font-medium">Plataforma Esportiva e Tecnológica</p>
          </div>

          
          <div className={`grid ${canShowGuest ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 p-1 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653]`}>
            <button
              type="button"
              data-testid="btn-enter-with-account"
              onClick={() => {
                setActiveTab('login');
                setShowRecovery(false);
                setError(null);
                setInfoMessage(null);
              }}
              className={`py-2 px-3 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
                activeTab === 'login'
                  ? 'bg-[#142B3D] dark:bg-[#0D1B2A] text-[#F4F6F8] dark:text-[#F1F5F9] shadow-sm'
                  : 'text-[#475569] dark:text-[#A8BAC8] hover:text-[#142B3D] dark:hover:text-[#F1F5F9]'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Entrar</span>
            </button>

            <button
              type="button"
              data-testid="btn-register-tab"
              onClick={() => {
                setActiveTab('signup');
                setShowRecovery(false);
                setError(null);
                setInfoMessage(null);
              }}
              className={`py-2 px-3 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
                activeTab === 'signup'
                  ? 'bg-[#142B3D] dark:bg-[#0D1B2A] text-[#F4F6F8] dark:text-[#F1F5F9] shadow-sm'
                  : 'text-[#475569] dark:text-[#A8BAC8] hover:text-[#142B3D] dark:hover:text-[#F1F5F9]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Criar Conta</span>
            </button>

            {canShowGuest && (
              <button
                type="button"
                data-testid="btn-play-as-guest"
                onClick={() => {
                  setActiveTab('guest');
                  setShowRecovery(false);
                  setError(null);
                  setInfoMessage(null);
                }}
                className={`py-2 px-3 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
                  activeTab === 'guest'
                    ? 'bg-[#2563EB] dark:bg-[#2563EB] text-white shadow-sm'
                    : 'text-[#2563EB] dark:text-[#60A5FA] hover:text-[#1D4ED8]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Visitante</span>
              </button>
            )}
          </div>

          
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-100 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-500/40 text-rose-900 dark:text-rose-200 text-xs flex items-start space-x-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-700 dark:text-rose-400" />
              <div className="leading-relaxed font-medium">
                <span>{error}</span>
              </div>
            </div>
          )}

          {infoMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-200 text-xs flex items-start space-x-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700 dark:text-emerald-400" />
              <div className="leading-relaxed font-medium">
                <span>{infoMessage}</span>
              </div>
            </div>
          )}

          
          {unconfirmedEmail && (
            <div
              data-testid="unconfirmed-email-banner"
              className="p-4 rounded-2xl bg-amber-100 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 text-xs space-y-2.5"
            >
              <div className="flex items-start space-x-2.5">
                <Mail className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
                <div className="leading-relaxed">
                  <span className="font-bold block">Confirmação de e-mail necessária:</span>
                  <span>
                    Enviamos um link de ativação para <strong>{unconfirmedEmail}</strong>. Verifique sua caixa de entrada e spam.
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-amber-300/80 dark:border-amber-700/60 flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#475569] dark:text-[#A8BAC8]">Não recebeu o e-mail?</span>
                <button
                  type="button"
                  data-testid="btn-resend-confirmation"
                  disabled={resendingEmail}
                  onClick={handleResendConfirmation}
                  className="px-3 py-1.5 rounded-lg bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 text-amber-900 dark:text-amber-100 text-xs font-bold transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${resendingEmail ? 'animate-spin' : ''}`} />
                  <span>{resendingEmail ? 'Reenviando...' : 'Reenviar confirmação'}</span>
                </button>
              </div>
              {resendStatus && (
                <div
                  className={`p-2 rounded-lg text-[11px] ${
                    resendStatus.success
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 border border-emerald-300'
                      : 'bg-rose-100 dark:bg-rose-950 text-rose-900 dark:text-rose-200 border border-rose-300'
                  }`}
                >
                  {resendStatus.message}
                </div>
              )}
            </div>
          )}

          
          {activeTab === 'login' && !showRecovery && (
            <form onSubmit={handleLogin} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-[#475569] dark:text-[#A8BAC8] mb-1.5 uppercase tracking-wider">
                  E-mail ou Usuário
                </label>
                <div className="relative">
                  <input
                    ref={usernameInputRef}
                    type="text"
                    inputMode={emailOrUser.includes('@') || emailOrUser === '' ? 'email' : 'text'}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    value={emailOrUser}
                    onChange={(e) => setEmailOrUser(e.target.value)}
                    placeholder="atleta@exemplo.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-[#142B3D] dark:text-[#F1F5F9] text-sm focus:border-[#B8F044] focus:bg-[#F4F6F8] dark:focus:bg-[#22313D] focus:outline-none transition-colors"
                    required
                  />
                  <Mail className="w-4 h-4 text-[#64748B] dark:text-[#A8BAC8] absolute left-3.5 top-3" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-[#475569] dark:text-[#A8BAC8] uppercase tracking-wider">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRecovery(true);
                      setRecoveryEmail(emailOrUser.includes('@') ? emailOrUser : '');
                    }}
                    className="text-xs font-bold text-[#2563EB] dark:text-[#60A5FA] hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <input
                    ref={passwordInputRef}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-[#142B3D] dark:text-[#F1F5F9] text-sm focus:border-[#B8F044] focus:bg-[#F4F6F8] dark:focus:bg-[#22313D] focus:outline-none transition-colors"
                    required
                  />
                  <Lock className="w-4 h-4 text-[#64748B] dark:text-[#A8BAC8] absolute left-3.5 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || guestLoading}
                className="w-full py-3.5 rounded-xl btn-sport-lime font-black text-xs tracking-wider uppercase flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
              >
                <span>{loading ? 'Entrando...' : 'Entrar'}</span>
              </button>

              
              {import.meta.env.DEV && canShowGuest && (
                <div data-testid="dev-shortcuts-panel" className="pt-3 border-t border-[#B8C6D0] dark:border-[#344653] space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[#475569] dark:text-[#A8BAC8]">
                    <span className="uppercase tracking-wider">Acesso Rápido (Dev):</span>
                    <span className="text-[#2563EB] dark:text-[#60A5FA]">Preencher usuário</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="dev-shortcut-nicolas"
                      onClick={() => {
                        setEmailOrUser('nicolas');
                        setPassword('');
                        setTimeout(() => passwordInputRef.current?.focus(), 50);
                      }}
                      className="py-2 px-3 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] hover:bg-[#F4F6F8] dark:hover:bg-[#22313D] text-xs font-bold text-[#142B3D] dark:text-[#F1F5F9] transition text-center shadow-xs"
                    >
                      👤 Nicolas
                    </button>
                    <button
                      type="button"
                      data-testid="dev-shortcut-admin"
                      onClick={() => {
                        setEmailOrUser('admin');
                        setPassword('');
                        setTimeout(() => passwordInputRef.current?.focus(), 50);
                      }}
                      className="py-2 px-3 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#FF7548] hover:bg-[#F4F6F8] dark:hover:bg-[#22313D] text-xs font-bold text-[#142B3D] dark:text-[#F1F5F9] transition text-center shadow-xs"
                    >
                      🛡️ Administrador
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          
          {activeTab === 'login' && showRecovery && (
            <form onSubmit={handleRecoverPassword} className="space-y-4 pt-1">
              <div className="flex items-center justify-between pb-1">
                <div className="text-xs uppercase tracking-wider text-[#2563EB] dark:text-[#60A5FA] font-bold flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Recuperar Senha</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowRecovery(false);
                    setRecoverySuccess(null);
                  }}
                  className="text-xs font-bold text-[#475569] dark:text-[#A8BAC8] hover:text-[#142B3D] dark:hover:text-[#F1F5F9]"
                >
                  Voltar ao login
                </button>
              </div>

              <p className="text-xs text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
                Informe seu e-mail cadastrado. Enviaremos um link para você redefinir sua senha.
              </p>

              <div>
                <label className="block text-xs font-bold text-[#475569] dark:text-[#A8BAC8] mb-1.5 uppercase tracking-wider">
                  E-mail
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder="atleta@exemplo.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-[#142B3D] dark:text-[#F1F5F9] text-sm focus:border-[#B8F044] focus:bg-[#F4F6F8] dark:focus:bg-[#22313D] focus:outline-none transition-colors"
                    required
                  />
                  <Mail className="w-4 h-4 text-[#64748B] dark:text-[#A8BAC8] absolute left-3.5 top-3" />
                </div>
              </div>

              {recoverySuccess && (
                <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 text-xs font-medium">
                  {recoverySuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl btn-sport-lime font-black text-xs tracking-wider uppercase flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
              >
                <span>{loading ? 'Enviando...' : 'Enviar Link de Recuperação'}</span>
              </button>
            </form>
          )}

          
          {activeTab === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-bold text-[#475569] dark:text-[#A8BAC8] mb-1 uppercase tracking-wider">
                  Nome Completo
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-[#142B3D] dark:text-[#F1F5F9] text-sm focus:border-[#B8F044] focus:bg-[#F4F6F8] dark:focus:bg-[#22313D] focus:outline-none transition-colors"
                    required
                  />
                  <User className="w-4 h-4 text-[#64748B] dark:text-[#A8BAC8] absolute left-3.5 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#475569] dark:text-[#A8BAC8] mb-1 uppercase tracking-wider">
                  E-mail
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-[#142B3D] dark:text-[#F1F5F9] text-sm focus:border-[#B8F044] focus:bg-[#F4F6F8] dark:focus:bg-[#22313D] focus:outline-none transition-colors"
                    required
                  />
                  <Mail className="w-4 h-4 text-[#64748B] dark:text-[#A8BAC8] absolute left-3.5 top-3" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#475569] dark:text-[#A8BAC8] mb-1 uppercase tracking-wider">
                    Senha (mín. 6)
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-[#142B3D] dark:text-[#F1F5F9] text-sm focus:border-[#B8F044] focus:bg-[#F4F6F8] dark:focus:bg-[#22313D] focus:outline-none transition-colors"
                      required
                    />
                    <Lock className="w-4 h-4 text-[#64748B] dark:text-[#A8BAC8] absolute left-3.5 top-3" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#475569] dark:text-[#A8BAC8] mb-1 uppercase tracking-wider">
                    Confirmar Senha
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-[#142B3D] dark:text-[#F1F5F9] text-sm focus:border-[#B8F044] focus:bg-[#F4F6F8] dark:focus:bg-[#22313D] focus:outline-none transition-colors"
                      required
                    />
                    <Lock className="w-4 h-4 text-[#64748B] dark:text-[#A8BAC8] absolute left-3.5 top-3" />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl btn-sport-lime font-black text-xs tracking-wider uppercase flex items-center justify-center space-x-2 transition-all disabled:opacity-50 mt-2"
              >
                <span>{loading ? 'Criando conta...' : 'Criar Conta'}</span>
              </button>
            </form>
          )}

          
          {canShowGuest && activeTab === 'guest' && (
            <div className="space-y-4 pt-1">
              <div className="p-4 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-xs space-y-2 text-[#475569] dark:text-[#A8BAC8]">
                <p className="text-[#142B3D] dark:text-[#F1F5F9] font-bold">
                  Acesso imediato para jogos rápidos sem necessidade de cadastro:
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Inicie o treino diretamente na parede;</li>
                  <li>Pontuação e telemetria funcionam em tempo real;</li>
                  <li>Sessão temporária e isolada.</li>
                </ul>
              </div>

              <button
                type="button"
                data-testid="btn-play-as-guest-action"
                onClick={handlePlayAsGuest}
                disabled={guestLoading}
                className="w-full py-3.5 rounded-xl btn-sport-blue font-black text-xs tracking-wider uppercase flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{guestLoading ? 'Iniciando...' : 'Jogar como Visitante'}</span>
              </button>
            </div>
          )}

        </div>
      </div>

      
      <div className="max-w-md w-full mx-auto text-center text-xs font-semibold text-[#64748B] dark:text-[#A8BAC8] z-10">
        MOTION TENNIS © 2026
      </div>
    </div>
  );
}
