import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Trash2, 
  Edit2, 
  Key, 
  CheckCircle2, 
  XCircle, 
  X, 
  ShieldAlert, 
  UserCheck,
  Search,
  Eye,
  Award,
  Calendar,
  Mail,
  Cpu
} from 'lucide-react';
import { api } from '../../services/api';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('player');
  const [selectedEqId, setSelectedEqId] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [uList, eqList] = await Promise.all([
        api.admin.getUsers(),
        api.admin.getEquipments()
      ]);
      setUsers(uList || []);
      setEquipments(eqList || []);
    } catch (e) {
      console.error('Erro ao carregar usuários:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.admin.createUser({
        username,
        name,
        password,
        role,
        equipment_id: selectedEqId ? Number(selectedEqId) : null
      });
      setShowCreateModal(false);
      setUsername('');
      setName('');
      setPassword('');
      setSelectedEqId('');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.admin.updateUser(editUser.id, {
        name: editUser.name,
        role: editUser.role,
        status: editUser.status,
        equipment_id: editUser.equipment_id ? Number(editUser.equipment_id) : null
      });
      setEditUser(null);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza de que deseja excluir este usuário? O histórico esportivo associado também será removido.')) {
      try {
        await api.admin.deleteUser(id);
        loadData();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    try {
      await api.admin.resetUserPassword(resetUser.id, newPassword);
      setResetUser(null);
      setNewPassword('');
      alert('Senha redefinida com sucesso.');
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleUserStatus = async (u) => {
    const nextStatus = u.status === 'active' ? 'inactive' : 'active';
    try {
      await api.admin.updateUser(u.id, { status: nextStatus });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      u.name?.toLowerCase().includes(term) ||
      u.username?.toLowerCase().includes(term) ||
      u.cloud_email?.toLowerCase().includes(term) ||
      u.equipment_name?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 animate-fadeIn font-mono">
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#08120B] border border-[#295437]">
        <div>
          <h1 className="text-2xl font-black text-[#F5F7F5] flex items-center space-x-2">
            <Users className="w-6 h-6 text-amber-400" />
            <span>Gestão de Contas & Usuários</span>
          </h1>
          <p className="text-xs text-[#8C9891] mt-0.5">
            Cadastro de atletas, busca, consulta de perfil e gerenciamento de permissões.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-xl bg-amber-400 text-[#07110B] font-bold text-xs uppercase flex items-center space-x-2 hover:bg-amber-300 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Usuário</span>
        </button>
      </div>

      
      <div className="p-4 rounded-2xl bg-[#08120B] border border-[#295437] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#8C9891] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, @username ou e-mail cloud..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-xs text-[#F5F7F5] placeholder-[#8C9891] focus:outline-none focus:border-amber-400"
          />
        </div>
        <div className="text-xs text-[#8C9891] flex items-center self-center sm:self-auto">
          Exibindo <span className="text-[#F5F7F5] font-bold mx-1">{filteredUsers.length}</span> de {users.length} usuários
        </div>
      </div>

      
      <div className="p-6 rounded-3xl bg-[#08120B] border border-[#295437] space-y-4 overflow-x-auto">
        {loading ? (
          <div className="py-8 text-center text-[#8C9891] text-xs">Carregando usuários...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-8 text-center text-[#8C9891] text-xs">
            Nenhum usuário encontrado para a busca "{searchTerm}".
          </div>
        ) : (
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-[#1B3624] text-[#8C9891]">
                <th className="pb-3">ATLETA / USER</th>
                <th className="pb-3">PERFIL (ROLE)</th>
                <th className="pb-3">EQUIPAMENTO VINCULADO</th>
                <th className="pb-3">NÍVEL & XP</th>
                <th className="pb-3">STATUS</th>
                <th className="pb-3 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1B3624]">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-[#060D08]/60 transition-colors">
                  <td className="py-4">
                    <div className="flex items-center space-x-3">
                      <span className="text-lg">{u.avatar || '🎾'}</span>
                      <div>
                        <span className="font-bold text-[#F5F7F5] block">{u.name}</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[#8C9891] text-[11px]">@{u.username}</span>
                          {u.cloud_email && (
                            <span className="text-[10px] text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-400/30 font-mono">
                              ☁ {u.cloud_email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      u.role === 'admin'
                        ? 'bg-amber-400/20 text-amber-400 border border-amber-400/40'
                        : 'bg-[#39FF88]/20 text-[#39FF88] border border-[#39FF88]/40'
                    }`}>
                      {u.role === 'admin' ? 'Administrador' : 'Atleta'}
                    </span>
                  </td>

                  <td className="py-4 text-[#8C9891]">
                    {u.equipment_name || 'Nenhum'}
                  </td>

                  <td className="py-4">
                    {u.level ? (
                      <span className="text-[#39FF88] font-bold">
                        LV. {u.level} ({u.xp} XP)
                      </span>
                    ) : (
                      <span className="text-[#8C9891]">---</span>
                    )}
                  </td>

                  <td className="py-4">
                    <button
                      onClick={() => toggleUserStatus(u)}
                      className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        u.status === 'active'
                          ? 'bg-[#39FF88]/15 text-[#39FF88] hover:bg-[#39FF88]/25'
                          : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25'
                      }`}
                      title="Clique para alternar status ativo/inativo"
                    >
                      <span>●</span>
                      <span>{u.status === 'active' ? 'ATIVO' : 'INATIVO'}</span>
                    </button>
                  </td>

                  <td className="py-4 text-right">
                    <div className="flex items-center justify-end space-x-1.5">
                      <button
                        onClick={() => setProfileUser(u)}
                        className="p-1.5 rounded-lg bg-[#060D08] border border-[#1B3624] text-[#8C9891] hover:text-cyan-300 transition"
                        title="Consultar Perfil Completo"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setResetUser(u)}
                        className="p-1.5 rounded-lg bg-[#060D08] border border-[#1B3624] text-[#8C9891] hover:text-amber-400 transition"
                        title="Redefinir Senha"
                      >
                        <Key className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditUser({ ...u, equipment_id: u.equipment_id || '' })}
                        className="p-1.5 rounded-lg bg-[#060D08] border border-[#1B3624] text-[#8C9891] hover:text-[#F5F7F5] transition"
                        title="Editar Permissões e Dados"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="p-1.5 rounded-lg bg-[#060D08] border border-[#1B3624] text-[#8C9891] hover:text-rose-400 transition"
                        title="Excluir Usuário"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      
      {profileUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-3xl bg-[#08120B] border-2 border-cyan-400/50 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#1B3624]">
              <div className="flex items-center space-x-2.5">
                <span className="text-2xl">{profileUser.avatar || '🎾'}</span>
                <div>
                  <h3 className="text-base font-bold text-[#F5F7F5]">{profileUser.name}</h3>
                  <span className="text-[11px] text-[#8C9891]">@{profileUser.username}</span>
                </div>
              </div>
              <button onClick={() => setProfileUser(null)} className="text-[#8C9891] hover:text-[#F5F7F5]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-[#060D08] border border-[#1B3624] space-y-1">
                <div className="text-[10px] text-[#8C9891] uppercase font-bold flex items-center gap-1.5">
                  <Mail className="w-3 h-3 text-cyan-400" />
                  <span>Identidade Cloud Supabase</span>
                </div>
                <div className="text-xs text-[#F5F7F5] break-all">
                  {profileUser.cloud_email || 'Conta exclusivamente local no equipamento'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-[#060D08] border border-[#1B3624] space-y-1">
                  <div className="text-[10px] text-[#8C9891] uppercase font-bold flex items-center gap-1.5">
                    <Award className="w-3 h-3 text-[#39FF88]" />
                    <span>Nível & XP</span>
                  </div>
                  <div className="text-sm font-black text-[#39FF88]">
                    Nível {profileUser.level || 1} • {profileUser.xp || 0} XP
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#060D08] border border-[#1B3624] space-y-1">
                  <div className="text-[10px] text-[#8C9891] uppercase font-bold flex items-center gap-1.5">
                    <Cpu className="w-3 h-3 text-amber-400" />
                    <span>Equipamento</span>
                  </div>
                  <div className="text-xs font-bold text-[#F5F7F5] truncate">
                    {profileUser.equipment_name || 'Nenhum'}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#060D08] border border-[#1B3624] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#8C9891] uppercase font-bold block">Permissão do Sistema</span>
                  <span className="font-bold text-[#F5F7F5]">
                    {profileUser.role === 'admin' ? 'Administrador' : 'Atleta (Jogador)'}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  profileUser.status === 'active'
                    ? 'bg-[#39FF88]/15 text-[#39FF88] border border-[#39FF88]/40'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/40'
                }`}>
                  {profileUser.status === 'active' ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setProfileUser(null)}
                className="w-full py-2.5 rounded-xl bg-[#0C1A11] border border-[#1B3624] text-[#F5F7F5] font-bold hover:bg-[#1B3624] transition"
              >
                Fechar Consulta
              </button>
            </div>
          </div>
        </div>
      )}

      
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-3xl bg-[#08120B] border-2 border-amber-400/50 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#F5F7F5]">Novo Usuário Motion Tennis</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-[#8C9891] hover:text-[#F5F7F5]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[#8C9891] mb-1">USUÁRIO (USERNAME)</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ex: roger.federer"
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">NOME COMPLETO</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Roger Federer"
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">SENHA INICIAL</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">TIPO DE USUÁRIO (ROLE)</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                >
                  <option value="player">Jogador (Atleta)</option>
                  <option value="admin">Administrador do Sistema</option>
                </select>
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">EQUIPAMENTO INICIAL</label>
                <select
                  value={selectedEqId}
                  onChange={(e) => setSelectedEqId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                >
                  <option value="">Nenhum equipamento vinculado</option>
                  {equipments.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name} ({eq.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-amber-400 text-[#07110B] font-bold text-xs uppercase hover:bg-amber-300 transition"
                >
                  Criar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-3xl bg-[#08120B] border-2 border-amber-400/50 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#F5F7F5]">Editar Usuário @{editUser.username}</h3>
              <button onClick={() => setEditUser(null)} className="text-[#8C9891] hover:text-[#F5F7F5]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[#8C9891] mb-1">NOME</label>
                <input
                  type="text"
                  value={editUser.name}
                  onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">ROLE (PERMISSÃO)</label>
                <select
                  value={editUser.role}
                  onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                >
                  <option value="player">Jogador (Atleta)</option>
                  <option value="admin">Administrador do Sistema</option>
                </select>
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">STATUS</label>
                <select
                  value={editUser.status}
                  onChange={(e) => setEditUser({ ...editUser, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo (Bloqueado)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#8C9891] mb-1">EQUIPAMENTO</label>
                <select
                  value={editUser.equipment_id}
                  onChange={(e) => setEditUser({ ...editUser, equipment_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                >
                  <option value="">Nenhum equipamento</option>
                  {equipments.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name} ({eq.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-amber-400 text-[#07110B] font-bold text-xs uppercase hover:bg-amber-300 transition"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      
      {resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-3xl bg-[#08120B] border-2 border-amber-400/50 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#F5F7F5]">Redefinir Senha</h3>
              <button onClick={() => setResetUser(null)} className="text-[#8C9891] hover:text-[#F5F7F5]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#8C9891]">
              Redefinindo senha para o usuário <strong>{resetUser.name}</strong> (@{resetUser.username}).
            </p>

            <form onSubmit={handleResetPassword} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[#8C9891] mb-1">NOVA SENHA</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nova senha (mínimo 4 caracteres)"
                  className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-white"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-amber-400 text-[#07110B] font-bold text-xs uppercase hover:bg-amber-300 transition"
                >
                  Confirmar Nova Senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
