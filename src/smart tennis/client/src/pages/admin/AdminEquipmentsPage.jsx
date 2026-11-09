import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Plus, 
  Trash2, 
  Edit2, 
  Users, 
  Radio, 
  CheckCircle2, 
  X, 
  UserPlus, 
  UserMinus 
} from 'lucide-react';
import { api } from '../../services/api';

export default function AdminEquipmentsPage() {
  const [equipments, setEquipments] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editEquipment, setEditEquipment] = useState(null);
  const [selectedEquipmentUsers, setSelectedEquipmentUsers] = useState(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('Quadra Principal');
  const [status, setStatus] = useState('online');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [eqs, usrs] = await Promise.all([
        api.admin.getEquipments(),
        api.admin.getUsers()
      ]);
      setEquipments(eqs || []);
      setAllUsers(usrs || []);
    } catch (e) {
      console.error('Erro ao carregar dados:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.admin.createEquipment({ code, name, location, status });
      setShowCreateModal(false);
      setCode('');
      setName('');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.admin.updateEquipment(editEquipment.id, {
        name: editEquipment.name,
        code: editEquipment.code,
        location: editEquipment.location,
        status: editEquipment.status
      });
      setEditEquipment(null);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza de que deseja excluir este equipamento? Todos os vínculos serão removidos.')) {
      try {
        await api.admin.deleteEquipment(id);
        loadData();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const openUsersModal = async (eq) => {
    try {
      const users = await api.admin.getEquipmentUsers(eq.id);
      setSelectedEquipmentUsers({ equipment: eq, users: users || [] });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddUserToEq = async (userId) => {
    if (!selectedEquipmentUsers) return;
    try {
      await api.admin.addEquipmentUser(selectedEquipmentUsers.equipment.id, userId);
      const updated = await api.admin.getEquipmentUsers(selectedEquipmentUsers.equipment.id);
      setSelectedEquipmentUsers({ ...selectedEquipmentUsers, users: updated });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemoveUserFromEq = async (userId) => {
    if (!selectedEquipmentUsers) return;
    try {
      await api.admin.removeEquipmentUser(selectedEquipmentUsers.equipment.id, userId);
      const updated = await api.admin.getEquipmentUsers(selectedEquipmentUsers.equipment.id);
      setSelectedEquipmentUsers({ ...selectedEquipmentUsers, users: updated });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#08120B] border border-[#295437]">
        <div>
          <h1 className="text-2xl font-black text-[#F5F7F5] flex items-center space-x-2">
            <Cpu className="w-6 h-6 text-amber-400" />
            <span>Gestão de Equipamentos Físicos</span>
          </h1>
          <p className="text-xs text-[#8C9891] mt-0.5">
            Cadastre, edite e vincule atletas às unidades físicas Motion Tennis.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-xl bg-amber-400 text-[#07110B] font-bold text-xs uppercase flex items-center space-x-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Equipamento</span>
        </button>
      </div>

      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {equipments.map((eq) => (
          <div
            key={eq.id}
            className="p-6 rounded-3xl bg-[#08120B] border border-[#295437] space-y-4 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono text-[#39FF88] uppercase tracking-wider font-bold">
                  ID #{eq.id} • {eq.code}
                </span>
                <h3 className="text-xl font-black text-[#F5F7F5] mt-0.5">
                  {eq.name}
                </h3>
                <p className="text-xs text-[#8C9891] mt-0.5">{eq.location}</p>
              </div>

              <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                eq.status === 'online' ? 'bg-[#39FF88]/20 text-[#39FF88]' : 'bg-rose-500/20 text-rose-400'
              }`}>
                ● {eq.status.toUpperCase()}
              </span>
            </div>

            
            <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-[#060D08] border border-[#1B3624] font-mono text-center text-xs">
              <div>
                <span className="text-[10px] text-[#8C9891]">JOGADORES</span>
                <div className="text-base font-bold text-[#F5F7F5]">{eq.users_count || 0}</div>
              </div>
              <div>
                <span className="text-[10px] text-[#8C9891]">TREINOS</span>
                <div className="text-base font-bold text-[#F5F7F5]">{eq.sessions_count || 0}</div>
              </div>
              <div>
                <span className="text-[10px] text-[#8C9891]">SENSORES</span>
                <div className="text-base font-bold text-[#39FF88]">3 KY-037</div>
              </div>
            </div>

            
            <div className="flex items-center justify-between pt-2 border-t border-[#1B3624]">
              <button
                onClick={() => openUsersModal(eq)}
                className="px-3 py-1.5 rounded-lg bg-[#102216] border border-[#39FF88]/40 text-[#39FF88] hover:bg-[#39FF88]/20 text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Ver Atletas ({eq.users_count || 0})</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setEditEquipment(eq)}
                  className="p-2 rounded-lg bg-[#060D08] border border-[#1B3624] text-[#8C9891] hover:text-[#F5F7F5]"
                  title="Editar Equipamento"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(eq.id)}
                  className="p-2 rounded-lg bg-[#060D08] border border-[#1B3624] text-[#8C9891] hover:text-rose-400"
                  title="Excluir Equipamento"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

          </div>
        ))}
      </div>

      
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-3xl bg-[#08120B] border-2 border-amber-400/50 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#F5F7F5]">Novo Equipamento Motion Tennis</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-[#8C9891] hover:text-[#F5F7F5]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[#8C9891] mb-1">CÓDIGO (ex: ST-003)</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">NOME DO EQUIPAMENTO</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="MOTION TENNIS #003"
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">LOCALIZAÇÃO / QUADRA</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                />
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">STATUS</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                >
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="maintenance">Manutenção</option>
                </select>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-amber-400 text-[#07110B] font-bold text-xs uppercase"
                >
                  Salvar Equipamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      
      {editEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-3xl bg-[#08120B] border-2 border-amber-400/50 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#F5F7F5]">Editar Equipamento #{editEquipment.id}</h3>
              <button onClick={() => setEditEquipment(null)} className="text-[#8C9891] hover:text-[#F5F7F5]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[#8C9891] mb-1">CÓDIGO</label>
                <input
                  type="text"
                  value={editEquipment.code}
                  onChange={(e) => setEditEquipment({ ...editEquipment, code: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">NOME</label>
                <input
                  type="text"
                  value={editEquipment.name}
                  onChange={(e) => setEditEquipment({ ...editEquipment, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">LOCALIZAÇÃO</label>
                <input
                  type="text"
                  value={editEquipment.location}
                  onChange={(e) => setEditEquipment({ ...editEquipment, location: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                />
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">STATUS</label>
                <select
                  value={editEquipment.status}
                  onChange={(e) => setEditEquipment({ ...editEquipment, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                >
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="maintenance">Manutenção</option>
                </select>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-amber-400 text-[#07110B] font-bold text-xs uppercase"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      
      {selectedEquipmentUsers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-lg w-full p-6 rounded-3xl bg-[#08120B] border-2 border-amber-400/50 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#F5F7F5]">
                  Atletas em {selectedEquipmentUsers.equipment.name}
                </h3>
                <span className="text-xs text-[#8C9891] font-mono">
                  {selectedEquipmentUsers.equipment.code} • {selectedEquipmentUsers.users.length} vinculados
                </span>
              </div>
              <button onClick={() => setSelectedEquipmentUsers(null)} className="text-[#8C9891] hover:text-[#F5F7F5]">
                <X className="w-5 h-5" />
              </button>
            </div>

            
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {selectedEquipmentUsers.users.length === 0 ? (
                <p className="text-xs text-[#8C9891] text-center py-4 font-mono">
                  Nenhum jogador vinculado a esta unidade ainda.
                </p>
              ) : (
                selectedEquipmentUsers.users.map((u) => (
                  <div
                    key={u.id}
                    className="p-3 rounded-xl bg-[#060D08] border border-[#1B3624] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <span>{u.avatar || '🎾'}</span>
                      <span className="font-bold text-[#F5F7F5]">{u.name}</span>
                      <span className="text-[#8C9891] font-mono">(@{u.username})</span>
                    </div>

                    <button
                      onClick={() => handleRemoveUserFromEq(u.id)}
                      className="text-rose-400 hover:text-rose-300 font-mono text-[11px] flex items-center space-x-1"
                      title="Desvincular do equipamento"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                      <span>Desvincular</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            
            <div className="pt-3 border-t border-[#1B3624] space-y-2">
              <span className="text-xs font-mono text-[#8C9891] uppercase">Vincular Novo Atleta:</span>
              <div className="flex gap-2">
                <select
                  id="selectUserToAdd"
                  className="flex-1 px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-xs text-white font-mono"
                >
                  <option value="">Selecione um jogador...</option>
                  {allUsers
                    .filter((u) => !selectedEquipmentUsers.users.some((su) => su.id === u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} (@{u.username})
                      </option>
                    ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    const sel = document.getElementById('selectUserToAdd');
                    if (sel && sel.value) handleAddUserToEq(sel.value);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-400 text-[#07110B] font-bold text-xs uppercase flex items-center space-x-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Vincular</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
