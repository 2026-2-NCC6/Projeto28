import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Award, Zap, X } from 'lucide-react';
import { playLevelUp } from '../services/sound';

export default function LevelUpModal({ data, onClose }) {
  useEffect(() => {
    if (data) {
      playLevelUp();
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#39FF88', '#16C96B', '#FFD166', '#FFFFFF']
        });
      } catch (e) {}
    }
  }, [data]);

  if (!data) return null;

  const isLevelUp = data.type === 'LEVEL_UP';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#0C1A11] border-2 border-[#39FF88] rounded-2xl p-6 shadow-neon-strong text-center overflow-hidden">
        
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8C9891] hover:text-[#F5F7F5] p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-40 h-40 bg-[#39FF88]/20 rounded-full blur-3xl pointer-events-none"></div>

        
        <div className="w-20 h-20 mx-auto rounded-2xl bg-[#102216] border border-[#39FF88]/60 flex items-center justify-center mb-4 shadow-neon">
          {isLevelUp ? (
            <Zap className="w-10 h-10 text-[#39FF88] animate-bounce" />
          ) : (
            <Trophy className="w-10 h-10 text-amber-400 animate-bounce" />
          )}
        </div>

        
        <span className="text-xs font-mono font-bold tracking-widest text-[#39FF88] uppercase bg-[#39FF88]/15 px-3 py-1 rounded-full">
          {isLevelUp ? 'NOVO NÍVEL ALCANÇADO!' : 'CONQUISTA DESBLOQUEADA!'}
        </span>

        <h3 className="text-2xl font-black text-[#F5F7F5] mt-3">
          {isLevelUp ? `NÍVEL ${data.level} — ${data.title}` : data.title}
        </h3>

        <p className="text-sm text-[#8C9891] mt-2">
          {isLevelUp
            ? 'Seu desempenho esportivo evoluiu! Novos atributos e treinos foram liberados na sua árvore de habilidades.'
            : data.description}
        </p>

        
        {data.xpReward && (
          <div className="mt-4 py-2 px-4 rounded-xl bg-[#102216] border border-[#1B3624] inline-block font-mono text-sm text-[#39FF88]">
            +{data.xpReward} XP BÔNUS CONCEDIDO
          </div>
        )}

        
        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full py-3 px-6 rounded-xl btn-neon font-bold text-sm tracking-wider uppercase"
          >
            CONTINUAR TREINANDO
          </button>
        </div>

      </div>
    </div>
  );
}
