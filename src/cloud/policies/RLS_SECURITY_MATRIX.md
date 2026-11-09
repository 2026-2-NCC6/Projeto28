# MOTION TENNIS — MATRIZ DE SEGURANÇA E ROW LEVEL SECURITY (RLS) (COMPATIBILIDADE REAL)

Este documento estabelece a especificação formal de controle de acesso (Least Privilege), privilégios SQL (GRANT/REVOKE), proteção de colunas, esquema privado de segredos e isolamento de dados do **Motion Tennis** no PostgreSQL (Supabase), estritamente alinhado com a modelagem do SQLite de produção e o `gameEngine.js`.

---

## 1. Perfis de Acesso (Roles) e Privilégios SQL

| Role | Identificação | Escopo de Permissões SQL |
| :--- | :--- | :--- |
| **`anon`** | `auth.role() = 'anon'` | Visitante não logado. Acesso de leitura **exclusivo** a aulas públicas da Academy (`status = 'published' AND is_published = TRUE`). **Zero** acesso a equipamentos, jogadores, partidas ou segredos. Não possui visualização pública de quadras (evita scraping). |
| **`authenticated`** | `auth.role() = 'authenticated'` | Atleta autenticado (`auth.uid()`). Acesso de leitura estritamente aos seus próprios dados e listagem de equipamentos ativos. Permissão de UPDATE restrita a colunas cosméticas (`display_name`, `avatar`) em `player_profiles`. Escrita direta em pareamentos bloqueada (exige RPC atômica). |
| **`equipment_notebook`** | Chave individual revogável (`EQUIPMENT_API_KEY`) | Notebook da quadra. **NÃO possui service_role.** Autentica-se chamando RPCs seguras (`issue_equipment_pairing_challenge_v1`, `sync_equipment_session_v1`, `record_equipment_heartbeat_v1`). Valida hash SHA-256 no schema privado (`private.equipment_secrets`). |
| **`service_role`** | Chave mestre privada do Supabase | **EXCLUSIVA** para migrações, rotinas manuais de auditoria administrativa (`reconcile_player_stats`) e manutenção. **NUNCA** distribuída a hardwares físicos ou aplicativos clientes. |

---

## 2. Matriz de Permissões por Tabela e View

| Objeto / Tabela | anon | authenticated | equipment_notebook (via RPC) | service_role | Mecanismo de Hardening |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `player_profiles` | ❌ Bloqueado | **SELECT** (próprio `user_id`),<br>**UPDATE** (`display_name`, `avatar`) | ❌ Sem acesso direto | **FULL** | **Dupla camada:** `GRANT UPDATE (display_name, avatar)` + Gatilho `protect_player_profile_fields` (bloqueia alteração de `xp`, `xp_next`, `level`, `title`, etc.). Títulos restritos aos 6 oficiais. |
| `player_attributes` | ❌ Bloqueado | **SELECT** (próprio atleta) | ❌ Sem acesso direto | **FULL** | **Normalizada:** 6 atributos esportivos com `(user_id, key)` único, compatível com `attributes` do SQLite e páginas `EvolutionPage` e `StatisticsPage`. Escrita exclusiva de rotinas seguras. |
| `equipments` | ❌ Bloqueado | **SELECT** (apenas ativos) | **SELECT / UPDATE** (telemetria) | **FULL** | Consulta de quadras restrita a usuários logados; não exposta a `anon`. |
| `private.equipment_secrets` | ❌ **BLOQUEIO TOTAL** | ❌ **BLOQUEIO TOTAL** | ❌ Acesso interno à RPC | **FULL** | **SCHEMA PRIVADO:** Inacessível na Data API (PostgREST). Controle de 5 tentativas e bloqueio temporário. |
| `private.equipment_pairing_challenges` | ❌ **BLOQUEIO TOTAL** | ❌ **BLOQUEIO TOTAL** | ❌ Acesso interno à RPC | **FULL** | **SCHEMA PRIVADO:** Tabela dedicada para desafios temporários (TTL 300s). Armazena hash SHA-256, consumida atomicamente. |
| `equipment_heartbeats`| ❌ Bloqueado | ❌ Bloqueado | **INSERT** (via RPC) | **FULL** | Telemetria temporal com janela de 150s para cálculo dinâmico de status online. |
| `equipment_pairings` | ❌ Bloqueado | **SELECT, DELETE** (próprio id) | ❌ Sem acesso direto | **FULL** | **Escrita direta bloqueada:** Pareamento ativo só pode ser criado via RPC `claim_equipment_pairing_v1` com consumo atômico de desafio não expirado. Role `'athlete'` estrito. |
| `synced_sessions` | ❌ Bloqueado | **SELECT** (próprio `user_id`) | **INSERT** (via RPC atômica) | **FULL** | **IMUTÁVEL:** Check `ended_at >= started_at` e teto matemático real de XP (`xp_granted <= total_score + 500`). Retenção perpétua com `ON DELETE RESTRICT` no `equipment_id`. |
| `synced_shots` | ❌ Bloqueado | **SELECT** (via `session_id`) | **INSERT** (via RPC atômica) | **FULL** | **Integridade estrita:** Sem redundância de `user_id`. `force_kmh` e `is_hit` sem valores fictícios (preservam NULL). |
| `player_achievements`| ❌ Bloqueado | **SELECT** (próprio `user_id`) | ❌ Sem acesso direto | **FULL** | Conquistas desbloqueadas gravadas unicamente por procedimentos seguros. |
| `academy_lessons` | **SELECT** (`published`) | **SELECT** (`published`) | ❌ Sem acesso direto | **FULL** | **Múltiplas aulas por módulo:** `id` textual compatível com SQLite (`prec_1`, `cons_1`, etc.), sem `UNIQUE(module_key)`. Rascunhos privados. Constraint `chk_published_requires_video`. |
| `academy_progress` | ❌ Bloqueado | **FULL** (próprio `user_id`) | ❌ Sem acesso direto | **FULL** | Atleta rastreia suas próprias aulas concluídas. |
| `sync_checkpoints` | ❌ Bloqueado | ❌ Bloqueado | **INSERT, SELECT** (via RPC) | **FULL** | Idempotência atômica gravada **após** a inserção de sessão e tiros. Detecta colisão de `event_id` ou `local_session_id` com payload divergente. |
| `v_player_career_summary` | ❌ Bloqueado | **SELECT** (próprio `user_id`) | ❌ Sem acesso direto | **FULL** | **SECURITY INVOKER = TRUE:** A view executa sob as regras RLS do usuário chamador, agregando atributos via JSON. |

---

## 3. Matriz de Permissões de Execução em Funções (EXECUTE)

| Função SQL | PUBLIC | anon | authenticated | service_role | Justificativa de Segurança |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `set_updated_at()` | ❌ REVOKED | ❌ REVOKED | **GRANT** | **GRANT** | Gatilho interno de integridade temporal. |
| `is_equipment_online(UUID)` | ❌ REVOKED | ❌ REVOKED | **GRANT** | **GRANT** | Cálculo dinâmico online/offline (janela 150s). |
| `record_equipment_heartbeat_v1(...)` | ❌ REVOKED | **GRANT** | **GRANT** | **GRANT** | Notebook envia ping autenticando via hash SHA-256 no schema privado. |
| `issue_equipment_pairing_challenge_v1(...)` | ❌ REVOKED | **GRANT** | **GRANT** | **GRANT** | Equipamento autenticado emite desafio de pareamento com código alfanumérico e TTL de 300 segundos. |
| `claim_equipment_pairing_v1(...)` | ❌ REVOKED | ❌ REVOKED | **GRANT** | **GRANT** | Atleta logado vincula smartphone à quadra conferindo o hash do código e consumindo atomicamente o desafio. |
| `sync_equipment_session_v1(...)` | ❌ REVOKED | **GRANT** | **GRANT** | **GRANT** | Ingestão atômica. Valida se atleta está ativamente pareado à quadra com vínculo NÃO expirado (`expires_at > NOW()`), teto real de XP e concorrência estrita. |
| `reconcile_player_stats(UUID)` | ❌ **REVOKED** | ❌ **REVOKED** | ❌ **REVOKED** | **GRANT** | **ADMIN EXCLUSIVO:** Fórmula real de títulos e níveis do `gameEngine.js`. Não é chamada automaticamente. |
| `protect_player_profile_fields()` | ❌ REVOKED | ❌ REVOKED | **GRANT** | **GRANT** | Gatilho que impede atleta de alterar XP ou níveis. |
