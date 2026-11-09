import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function ThemeToggle({ className = '', showLabel = false }) {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <button
      type="button"
      data-testid="theme-toggle-btn"
      aria-label={`Alternar tema visual (atualmente ${isDark ? 'Escuro' : 'Claro'})`}
      title={isDark ? 'Mudar para Tema Claro (Cinza-Azulado)' : 'Mudar para Tema Escuro (Sport Premium Dark)'}
      onClick={toggleTheme}
      className={`p-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 outline-none select-none ${
        isDark
          ? 'bg-[#18242E] text-[#B8F044] border border-[#344653] hover:border-[#B8F044]/60 hover:bg-[#22313D] shadow-sm'
          : 'bg-[#E8EDF1] text-[#142B3D] border border-[#B8C6D0] hover:border-[#142B3D] hover:bg-[#F4F6F8] shadow-sm'
      } ${className}`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-[#B8F044] transition-transform duration-300 hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 text-[#142B3D] transition-transform duration-300 hover:-rotate-12" />
      )}
      {showLabel && (
        <span className="text-xs font-bold uppercase tracking-wider">
          {isDark ? 'Tema Escuro' : 'Tema Claro'}
        </span>
      )}
    </button>
  );
}
