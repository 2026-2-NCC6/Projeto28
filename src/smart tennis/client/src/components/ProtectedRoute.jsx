import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, requireAdmin = false, allowGuest = false }) {
  const { loading, isAuthenticated, isGuest, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07110B] flex items-center justify-center text-xs font-mono text-[#39FF88]">
        <div className="flex items-center space-x-2 animate-pulse">
          <span className="w-2.5 h-2.5 rounded-full bg-[#39FF88]"></span>
          <span>Verificando sessão...</span>
        </div>
      </div>
    );
  }

  if (isGuest && !allowGuest) {
    return <Navigate to="/app/play" replace />;
  }

  if (!isAuthenticated && !(allowGuest && isGuest)) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#07110B] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[#0C1A11] border-2 border-rose-500/40 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-950/40 border border-rose-500 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-[#F5F7F5]">Acesso Restrito</h2>
          <p className="text-xs text-[#8C9891]">
            Esta área é exclusiva para administradores do Motion Tennis. Sua sessão atual não possui permissão para acessar estas configurações.
          </p>
          <div className="pt-2">
            <Link
              to={isGuest ? '/app/play' : '/app/dashboard'}
              className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl btn-neon font-bold text-xs uppercase"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{isGuest ? 'Voltar ao Jogo' : 'Voltar ao Meu Dashboard'}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return children;
}

export default ProtectedRoute;
