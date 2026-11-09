# MOTION TENNIS — FUNDAÇÃO CLOUD COM SUPABASE & POSTGRESQL (VERSÃO FINAL DE PRODUÇÃO)

Este repositório contém a fundação técnica definitiva da infraestrutura em nuvem do **Motion Tennis**, corrigida, blindada e em estrita compatibilidade com o SQLite de produção e os serviços do backend (`gameEngine.js`, `academyService.js`, `personalMatchService.js`).

---

## 1. Princípios de Segurança e Governança

1. **Autonomia Local e Resiliência Física (Offline-First):**
   - O notebook da quadra opera **100% de forma autônoma** via SQLite local (`smart_tennis.db`).
   - Os sensores KY-037, a ponte Python, o cálculo de localização, a pontuação, o cronômetro e os 3 modos de jogo **não dependem de internet** para funcionar.
   - Nenhuma transação com a nuvem bloqueia o loop de jogo em tempo real.

2. **Modelagem Fiel às Regras do Jogo e Gamificação:**
   - **Títulos Oficiais:** Exclusivamente os 6 títulos de `gameEngine.js` (`Iniciante`, `Praticante`, `Intermediário`, `Avançado`, `Competidor`, `Especialista`).
   - **Atributos Normalizados:** A tabela `player_attributes` reproduz fielmente a tabela `attributes` do SQLite com os 6 atributos (`precision`, `consistency`, `speed`, `control`, `reflex`, `strategy`), seus níveis (1-10), XP, objetivos e dicas do treinador, consumidos pelas páginas `EvolutionPage` e `StatisticsPage`.
   - **Academy sem Restrições Artificiais:** A tabela `academy_lessons` aceita múltiplos conteúdos por módulo (sem restrição artificial de `UNIQUE(module_key)`), utilizando IDs textuais (`prec_1`, `cons_1`, etc.) perfeitamente compatíveis com `academy_content` e o `seed_academy_catalog.sql`.

3. **Segurança Avançada de Pareamento e Proteção Anti-Brute-Force (Correção 1):**
   - **Limitação de Tentativas por Atleta e Equipamento:** A tabela `private.pairing_attempt_limits` isola tentativas inválidas por par `(equipment_id, user_id)`. Após 5 falhas consecutivas, a conta do atleta é temporariamente bloqueada para aquele equipamento por 15 minutos (`PAIRING_ATTEMPTS_TEMPORARILY_LOCKED`).
   - **Alta Entropia Obrigatória:** A emissão de desafios via `issue_equipment_pairing_challenge_v1` exige tamanho mínimo de 6 caracteres alfanuméricos e rejeita expressamente sequências triviais ou previsíveis (ex: `mt1234`, `123456`, `000000`, `abcdef`, `tennis`).
   - **Consumo Atômico de Uso Único:** O desafio é consumido atomicamente (`UPDATE ... WHERE consumed_at IS NULL RETURNING id`).
   - **Locks Consultivos:** Serialização estrita via `pg_advisory_xact_lock` impede ataques concorrentes de corrida.

4. **Idempotência Completa e Fingerprint Canônico (Correção 2):**
   - **Fingerprint SHA-256 Canônico:** A função `sync_equipment_session_v1` calcula uma assinatura determinística (`v_payload_fingerprint`) sobre os campos vitais da partida (`local_session_id`, `user_id`, `mode`, `total_score`, `shots_count`, `hits_count`, `xp_granted`, `started_at_utc`).
   - **Detecção de Colisão e Divergência:** Se um `event_id` já existente for retransmitido com dados divergentes (ou com outro `local_session_id`), o envio é sumariamente rejeitado (`EVENT_ID_COLLISION_DIFFERENT_PAYLOAD` ou `SESSION_DATA_DIVERGENCE`).
   - **Checkpoints Seguros:** Inserções concorrentes em `sync_checkpoints` utilizam `ON CONFLICT DO NOTHING RETURNING id` com conferência explícita, garantindo que retransmissões idempotentes retornem sucesso sem duplicar XP ou disparos.

5. **Provisionamento Automático e Seguro de Perfis (Correção 3):**
   - **Gatilho de Cadastro (`handle_new_auth_user`):** Ao cadastrar um usuário no Supabase Auth (`auth.users`), um gatilho automático cria seu registro correspondente em `public.player_profiles` (nível 1, XP 0, `xp_next = 250`, título 'Iniciante') e gera seus 6 atributos iniciais em `public.player_attributes`.
   - **Impossibilidade de Forja Arbitrária:** Os clientes autenticados (`authenticated`, `anon`) **não possuem permissão de INSERT** na tabela `player_profiles`. Todo provisionamento é gerenciado internamente pelo banco via `SECURITY DEFINER`.

6. **Privilégios Mínimos Explícitos Objeto por Objeto (Correção 4):**
   - Substituição completa de comandos genéricos `REVOKE ALL ON ALL TABLES` por revogações explícitas tabela por tabela nas 11 entidades do Motion Tennis.
   - Preserva tabelas e extensões de terceiros presentes no PostgreSQL.
   - Atletas autenticados possuem privilégios de coluna estritos: apenas `UPDATE (display_name, avatar, updated_at)` em seus próprios perfis.

7. **Autorização de Sessões Offline e Limitação Arquitetural (Correção 5):**
   - **Sincronização Tardia Legítima:** O notebook pode reenviar partidas jogadas offline mesmo após a expiração do pareamento, desde que o timestamp de início da partida (`started_at`) tenha ocorrido comprovadamente **dentro da janela autorizada** do pareamento (`started_at <= pairing.expires_at`). Partidas iniciadas após a expiração são rejeitadas (`PAIRING_EXPIRED_FOR_SESSION`).
   - **Limitação Arquitetural de Relógio:** Como o notebook da quadra não dispõe de um módulo criptográfico inviolável (HSM/TPM de quadra ou timestamp assinado por terceiros), os carimbos de data/hora offline dependem do relógio local da máquina. Embora o banco imponha validações rígidas (não permitir início no futuro e duração de 10s a 4h), a integridade física do relógio da quadra depende da segurança do sistema operacional do notebook.
   - **Diretriz de Homologação:** A ingestão de partidas em ambiente de produção real deve ser mantida em modo controlado/piloto até que seja implementado um mecanismo de chave privada em hardware físico ou token assinado de sessão na origem.

8. **Teto Físico de XP e Pontuação Rigorosa (Correção 6):**
   - A função `sync_equipment_session_v1` aplica as regras físicas de pontuação de `gameEngine.js`:
     * Partidas com zero acertos (`hits_count = 0`) exigem pontuação zero e 0 XP (`INVALID_ZERO_HITS_METRICS`).
     * A pontuação total máxima não pode exceder `hits_count * 200` (`SCORE_EXCEEDS_PHYSICAL_LIMITS`).
     * O XP concedido não pode ultrapassar `total_score + 100` e nem `hits_count * 120 + 100` (`XP_EXCEEDS_PHYSICAL_LIMITS`).
   - A função administrativa `reconcile_player_stats` utiliza a progressão oficial de `gameEngine.js`: `level * 250` XP por nível e os 6 títulos oficiais.

---

## 2. Estrutura de Arquivos e Fonte Canônica de Migrações

```
cloud/
├── contracts/
│   ├── equipment_heartbeat.json        # Contrato de telemetria a cada 60s
│   ├── match_finished_event.json       # Contrato de outbox de partida finalizada
│   ├── pairing_challenge_request.json  # Contrato de emissão de desafio pelo notebook
│   └── pairing_claim_request.json      # Contrato de reivindicação de pareamento pelo atleta
├── env.example                         # Template seguro sem service_role
├── examples/
│   ├── seed_academy_catalog.sql        # Carga dos 18 slots da Academy como draft
│   └── supabase_client_sample.js       # Exemplo de cliente Node.js com RPCs seguras
├── migrations/                         # FONTE OFICIAL CANÔNICA DE MIGRAÇÕES
│   ├── 001_initial_schema.sql          # DDL com atributos normalizados, constraints e schema private
│   ├── 002_row_level_security.sql      # RLS objeto por objeto, privilégios de coluna e bloqueio direto
│   └── 003_functions_and_triggers.sql  # RPCs seguras, anti-brute-force, fingerprint e teto físico de XP
├── policies/
│   └── RLS_SECURITY_MATRIX.md          # Matriz formal de papéis, permissões e RPCs
├── README.md                           # Guia oficial de implantação e operação
└── tests/
    └── test_cloud_foundation.js        # Suíte automatizada de validação estática e segurança
```

> **IMPORTANTE — REGRAS DE EXECUÇÃO:**
> A pasta `cloud/migrations/` é a **fonte oficial canônica**.
> A pasta `supabase/migrations/` é um espelho sincronizado com nomenclatura timestamp para o Supabase CLI.
> **ATENÇÃO:** Nunca execute os dois diretórios no mesmo banco para evitar conflitos! Escolha apenas um fluxo (SQL Editor web ou Supabase CLI).

---

## 3. Guia de Primeira Implantação Manual (Sem Execução Automática)

### Opção A: Implantação em Banco PostgreSQL Descartável / Staging Local
Para validar a compilação completa do banco antes de subir para o Supabase:

1. Suba uma instância limpa do PostgreSQL (Docker ou local) com a extensão `pgcrypto`:
   ```bash
   docker run --name postgres-test -e POSTGRES_PASSWORD=test_pass -p 5432:5432 -d postgres:15
   ```
2. Execute sequencialmente os arquivos canônicos:
   ```bash
   psql -h localhost -U postgres -d postgres -f cloud/migrations/001_initial_schema.sql
   psql -h localhost -U postgres -d postgres -f cloud/migrations/002_row_level_security.sql
   psql -h localhost -U postgres -d postgres -f cloud/migrations/003_functions_and_triggers.sql
   psql -h localhost -U postgres -d postgres -f cloud/examples/seed_academy_catalog.sql
   ```

### Opção B: Implantação no Painel Web do Supabase (SQL Editor)

1. **Criar o Projeto:**
   - Acesse [https://supabase.com](https://supabase.com) e autentique-se.
   - Crie um novo projeto (ex: `Motion Tennis Dev`).
   - Selecione a região `South America (São Paulo) - sa-east-1`.
   - Escolha o plano `Free Tier`.

2. **Aplicar Migrações no SQL Editor:**
   - Acesse **SQL Editor** no menu lateral.
   - Abra **New query**.
   - Cole e execute o arquivo `cloud/migrations/001_initial_schema.sql` (Verifique se exibiu `Success. No rows returned`).
   - Abra nova query, cole e execute `cloud/migrations/002_row_level_security.sql`.
   - Abra nova query, cole e execute `cloud/migrations/003_functions_and_triggers.sql`.
   - Abra nova query, cole e execute `cloud/examples/seed_academy_catalog.sql` (insere os 18 rascunhos base da Academy).

3. **Verificar a Criação das Tabelas e Políticas:**
   - No **Table Editor**, confira se as 11 tabelas públicas possuem o indicador verde de **RLS Ativo**.
   - Observe que as tabelas `private.equipment_secrets`, `private.equipment_pairing_challenges` e `private.pairing_attempt_limits` estão ocultas da Data API.

4. **Cadastrar o Primeiro Equipamento da Quadra:**
   No **SQL Editor**, cadastre o notebook com sua credencial gerada via hash SHA-256:
   ```sql
   -- 1. Equipamento na tabela pública
   INSERT INTO public.equipments (id, hardware_code, name, location, wall_preset)
   VALUES ('a0000000-0000-0000-0000-000000000001', 'COURT_NOTEBOOK_01', 'Quadra Principal', 'FECAP', '3x2');

   -- 2. Credencial no schema privado (substitua a chave por um segredo forte em produção)
   INSERT INTO private.equipment_secrets (equipment_id, key_prefix, api_key_hash)
   VALUES (
       'a0000000-0000-0000-0000-000000000001',
       'mt_eq_',
       encode(extensions.digest('minha_chave_secreta_quadra_01', 'sha256'), 'hex')
   );
   ```

---

## 4. O que foi Validado vs O que Permanece Pendente

- **VALIDADO COM SUCESSO (Testes Automatizados Locais — 87 Assertions 100% Green):**
  - Conformidade estática de todo o DDL PostgreSQL, constraints e tipagens.
  - Verificação de políticas de RLS e ausência de SELECT anônimo em equipamentos e credenciais.
  - Isolamento estrito de segredos e desafios no schema `private`.
  - Sistema anti-brute-force com limitação em `private.pairing_attempt_limits` e bloqueio de 15 min após 5 falhas.
  - Rejeição de códigos de desafio fracos ou previsíveis e exigência de entropia mínima (6+ chars).
  - Fingerprint SHA-256 canônico em `sync_equipment_session_v1` com detecção de colisões divergentes.
  - Validação física de XP e pontuação baseada estritamente no `gameEngine.js` (zero hits = 0 pts/xp, score <= hits * 200, XP <= hits * 120 + 100).
  - Provisionamento automático de perfis via trigger em `auth.users` sem possibilidade de forja por clientes.
  - Preservação da integridade do banco SQLite local `smart_tennis.db` (todas as tabelas e dados intactos).
  - Espelhamento 100% idêntico entre `cloud/migrations/` e `supabase/migrations/`.

- **LIMITAÇÕES QUE PERMANECEM E PENDÊNCIAS:**
  - **Diferenciação Estática vs Live:** Os testes automatizados em `cloud/tests/test_cloud_foundation.js` realizam análises de sintaxe, contratos, segurança estática e regex de regras SQL. Eles **NÃO substituem** a execução em uma engine PostgreSQL real conectada via TCP/IP.
  - **Relógio Físico de Quadra:** O notebook não possui carimbo de tempo inviolável baseado em hardware (HSM/TPM). As partidas offline dependem do relógio do sistema operacional local. A ingestão em produção deve ser acompanhada até que haja assinatura de origem.
  - **Implantação Remota Não Executada:** Nenhuma migração ou comando SQL foi executado remotamente nesta fase. O ambiente Supabase definitivo ainda deve ser criado manualmente pelo responsável.
