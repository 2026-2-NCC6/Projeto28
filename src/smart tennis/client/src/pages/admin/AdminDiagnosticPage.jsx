import React from 'react';
import IotDiagnosticPanel from '../../components/IotDiagnosticPanel';

export default function AdminDiagnosticPage() {
  return (
    <div className="space-y-6 animate-fadeIn font-mono">
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#08120B] border border-[#295437]">
        <div>
          <h1 className="text-2xl font-black text-[#F5F7F5] flex items-center space-x-2">
            <span>Diagnóstico IoT & Sensores KY-037</span>
          </h1>
          <p className="text-xs text-[#8C9891] mt-0.5">
            Monitoramento técnico em tempo real dos sensores acústicos, integridade dos pacotes e algoritmo TDOA.
          </p>
        </div>
      </div>

      
      <IotDiagnosticPanel />
    </div>
  );
}
