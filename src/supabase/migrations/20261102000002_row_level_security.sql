-- ==============================================================================
-- MOTION TENNIS — MIGRAÇÃO 002: ROW LEVEL SECURITY & PRIVILÉGIOS (FASE 7B.3)
-- ==============================================================================
-- Descrição: Habilitação de RLS em todas as tabelas e aplicação de Least Privilege:
-- 1. REVOKE amplo de privilégios herdados em PUBLIC, anon e authenticated.
-- 2. Privilégios explícitos de coluna em player_profiles (apenas display_name, avatar e updated_at).
-- 3. Defesa de integridade com gatilho canônico centralizado na Migração 003.
-- 4. Bloqueio de inserção/modificação direta em equipment_pairings (apenas via RPC segura).
-- 5. Eliminação de listagens públicas de equipamentos para anon (zero exposição de hardware).
-- 6. Schema private estritamente inacessível a clientes da Data API.
-- Fonte Oficial Canônica: cloud/migrations/002_row_level_security.sql
-- ==============================================================================

-- 1. REVOGAÇÃO ESPECÍFICA DE PERMISSÕES NOS OBJETOS DO MOTION TENNIS (Least Privilege)
-- Revogações direcionadas estritamente às tabelas do Motion Tennis, preservando objetos e schemas de terceiros.
REVOKE ALL ON TABLE public.player_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.player_attributes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.equipments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.equipment_heartbeats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.equipment_pairings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.synced_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.synced_shots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.player_achievements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.academy_lessons FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.academy_progress FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sync_checkpoints FROM PUBLIC, anon, authenticated;

-- Proteção estrita do schema privado (isolado da Data API e de usuários autenticados/anônimos)
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.equipment_secrets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.equipment_pairing_challenges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.pairing_attempt_limits FROM PUBLIC, anon, authenticated;

-- Eliminação definitiva de view pública que expunha quadras a anônimos (Fase 7B.3)
DROP VIEW IF EXISTS public.v_public_equipments CASCADE;

-- 2. HABILITAÇÃO OBRIGATÓRIA DE RLS EM TODAS AS TABELAS DO PROJETO
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.equipment_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.equipment_pairing_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.pairing_attempt_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synced_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synced_shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_checkpoints ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 3. TABELA: player_profiles
-- ==============================================================================
GRANT SELECT ON public.player_profiles TO authenticated;
GRANT UPDATE (display_name, avatar, updated_at) ON public.player_profiles TO authenticated;
GRANT ALL ON public.player_profiles TO service_role;

CREATE POLICY "Athletes can view own profile"
    ON public.player_profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Athletes can update own visual profile"
    ON public.player_profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on player_profiles"
    ON public.player_profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- NOTA ARQUITETURAL: Privilégios de coluna acima garantem que 'authenticated'
-- somente emita UPDATE nas colunas (display_name, avatar, updated_at).
-- O gatilho de defesa em profundidade trg_protect_player_profile é definido
-- de forma canônica na Migração 003 (Funções e Triggers), evitando duplicidade.

-- ==============================================================================
-- 4. TABELA: player_attributes
-- ==============================================================================
GRANT SELECT ON public.player_attributes TO authenticated;
GRANT ALL ON public.player_attributes TO service_role;

CREATE POLICY "Athletes can view own attributes"
    ON public.player_attributes
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on player_attributes"
    ON public.player_attributes
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 5. TABELA: equipments
-- ==============================================================================
-- Acesso de leitura estritamente concedido a atletas autenticados (anon BLOQUEADO)
GRANT SELECT ON public.equipments TO authenticated;
GRANT ALL ON public.equipments TO service_role;

CREATE POLICY "Authenticated users view active equipments"
    ON public.equipments
    FOR SELECT
    TO authenticated
    USING (is_active = TRUE AND revoked_at IS NULL);

CREATE POLICY "Service role full access on equipments"
    ON public.equipments
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 6. TABELAS DO SCHEMA PRIVADO (private.equipment_secrets, challenges & rate_limits)
-- ==============================================================================
-- Totalmente fora da Data API. Acesso reservado exclusivamente a service_role e RPCs.
GRANT ALL ON private.equipment_secrets TO service_role;
GRANT ALL ON private.equipment_pairing_challenges TO service_role;
GRANT ALL ON private.pairing_attempt_limits TO service_role;

CREATE POLICY "Service role only access on equipment_secrets"
    ON private.equipment_secrets
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role only access on pairing challenges"
    ON private.equipment_pairing_challenges
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role only access on pairing attempt limits"
    ON private.pairing_attempt_limits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 7. TABELA: equipment_heartbeats
-- ==============================================================================
GRANT ALL ON public.equipment_heartbeats TO service_role;

CREATE POLICY "Service role full access on equipment_heartbeats"
    ON public.equipment_heartbeats
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 8. TABELA: equipment_pairings
-- ==============================================================================
-- Atleta pode apenas CONSULTAR e DESCONECTAR (DELETE) seu próprio pareamento.
-- Inserções e alterações diretas são BLOQUEADAS (exigem RPC claim_equipment_pairing_v1).
GRANT SELECT, DELETE ON public.equipment_pairings TO authenticated;
GRANT ALL ON public.equipment_pairings TO service_role;

CREATE POLICY "Athletes can view own pairings"
    ON public.equipment_pairings
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Athletes can delete own pairings"
    ON public.equipment_pairings
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on equipment_pairings"
    ON public.equipment_pairings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 9. TABELA: synced_sessions
-- ==============================================================================
GRANT SELECT ON public.synced_sessions TO authenticated;
GRANT ALL ON public.synced_sessions TO service_role;

CREATE POLICY "Athletes can view own sessions"
    ON public.synced_sessions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on synced_sessions"
    ON public.synced_sessions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 10. TABELA: synced_shots
-- ==============================================================================
GRANT SELECT ON public.synced_shots TO authenticated;
GRANT ALL ON public.synced_shots TO service_role;

-- Atleta visualiza disparos cuja sessão pertence a ele
CREATE POLICY "Athletes can view own shots"
    ON public.synced_shots
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.synced_sessions s
            WHERE s.id = synced_shots.session_id
              AND s.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role full access on synced_shots"
    ON public.synced_shots
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 11. TABELA: player_achievements
-- ==============================================================================
GRANT SELECT ON public.player_achievements TO authenticated;
GRANT ALL ON public.player_achievements TO service_role;

CREATE POLICY "Athletes can view own achievements"
    ON public.player_achievements
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on player_achievements"
    ON public.player_achievements
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 12. TABELA: academy_lessons
-- ==============================================================================
GRANT SELECT ON public.academy_lessons TO anon, authenticated;
GRANT ALL ON public.academy_lessons TO service_role;

CREATE POLICY "Public read published academy lessons"
    ON public.academy_lessons
    FOR SELECT
    TO anon, authenticated
    USING (is_published = TRUE AND status = 'published');

CREATE POLICY "Service role full access on academy_lessons"
    ON public.academy_lessons
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 13. TABELA: academy_progress
-- ==============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_progress TO authenticated;
GRANT ALL ON public.academy_progress TO service_role;

CREATE POLICY "Athletes can view own academy progress"
    ON public.academy_progress
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Athletes can track own academy progress"
    ON public.academy_progress
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Athletes can update own academy progress"
    ON public.academy_progress
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Athletes can delete own academy progress"
    ON public.academy_progress
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on academy_progress"
    ON public.academy_progress
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 14. TABELA: sync_checkpoints
-- ==============================================================================
GRANT ALL ON public.sync_checkpoints TO service_role;

CREATE POLICY "Service role only access on sync_checkpoints"
    ON public.sync_checkpoints
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
