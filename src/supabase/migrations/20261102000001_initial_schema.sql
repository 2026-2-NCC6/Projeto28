-- ==============================================================================
-- MOTION TENNIS — MIGRAÇÃO 001: ESTRUTURA INICIAL DO BANCO (COMPATIBILIDADE REAL)
-- ==============================================================================
-- 1. Extensões criptográficas e schema privado (private).
-- 2. Tabela de segredos e desafios de pareamento isoladas no schema private.
-- 3. Perfis e Atributos normalizados em estrita conformidade com o SQLite e gameEngine.js.
-- 4. Academy com múltiplos conteúdos por módulo (id alfanumérico como no SQLite).
-- 5. Sessões e disparos sincronizados com retenção perpétua e teto matemático real de XP.
-- Fonte Oficial Canônica: cloud/migrations/001_initial_schema.sql
-- ==============================================================================

-- 1. EXTENSÕES OBRIGATÓRIAS (SCHEMA extensions NO SUPABASE)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- 2. SCHEMA PRIVADO PARA DADOS CRÍTICOS DE INFRAESTRUTURA
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 3. TABELA: player_profiles (Perfis de Atletas e Progressão Oficial)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.player_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    avatar TEXT DEFAULT '🎾',
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    xp_next INTEGER NOT NULL DEFAULT 250 CHECK (xp_next > 0),
    title TEXT NOT NULL DEFAULT 'Iniciante' CHECK (title IN ('Iniciante', 'Praticante', 'Intermediário', 'Avançado', 'Competidor', 'Especialista')),
    total_matches INTEGER NOT NULL DEFAULT 0 CHECK (total_matches >= 0),
    total_shots INTEGER NOT NULL DEFAULT 0 CHECK (total_shots >= 0),
    total_hits INTEGER NOT NULL DEFAULT 0 CHECK (total_hits >= 0),
    overall_accuracy NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (overall_accuracy >= 0.00 AND overall_accuracy <= 100.00),
    best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. TABELA: player_attributes (6 Atributos Esportivos Oficiais — Normalizados)
-- ==============================================================================
-- Estrutura idêntica à tabela 'attributes' do SQLite e compatível com EvolutionPage e StatisticsPage
CREATE TABLE IF NOT EXISTS public.player_attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.player_profiles(user_id) ON DELETE CASCADE,
    key TEXT NOT NULL CHECK (key IN ('precision', 'consistency', 'speed', 'control', 'reflex', 'strategy')),
    name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 10),
    max_level INTEGER NOT NULL DEFAULT 10,
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    xp_next INTEGER NOT NULL DEFAULT 1000 CHECK (xp_next > 0),
    objective TEXT,
    strong_points TEXT,
    improvement_points TEXT,
    coach_tip TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_player_attribute UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_player_attributes_user 
ON public.player_attributes(user_id);

-- ==============================================================================
-- 5. TABELA: equipments (Notebooks das Quadras)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.equipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hardware_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    wall_preset TEXT NOT NULL DEFAULT '3x2' CHECK (wall_preset IN ('3x2', '3x3', '4x3', 'custom')),
    wall_width_m NUMERIC(4,2) DEFAULT 3.00 CHECK (wall_width_m > 0),
    wall_height_m NUMERIC(4,2) DEFAULT 2.00 CHECK (wall_height_m > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    app_version TEXT,
    last_sync_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 6. TABELA PRIVADA: equipment_secrets (Hash SHA-256 e Proteção contra Força Bruta)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS private.equipment_secrets (
    equipment_id UUID PRIMARY KEY REFERENCES public.equipments(id) ON DELETE CASCADE,
    key_prefix TEXT NOT NULL,
    api_key_hash TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 7. TABELA PRIVADA: equipment_pairing_challenges (Desafios Temporários para QR Code)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS private.equipment_pairing_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL REFERENCES public.equipments(id) ON DELETE CASCADE,
    challenge_code_hash TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    consumed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenges_lookup 
ON private.equipment_pairing_challenges (equipment_id, challenge_code_hash, expires_at)
WHERE consumed_at IS NULL;

-- Tabela de limitação de tentativas de pareamento por atleta e quadra (anti-bruteforce)
CREATE TABLE IF NOT EXISTS private.pairing_attempt_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL REFERENCES public.equipments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pairing_attempt_limit UNIQUE (equipment_id, user_id)
);

-- ==============================================================================
-- 8. TABELA: equipment_heartbeats (Telemetria Temporal do Notebook)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.equipment_heartbeats (
    id BIGSERIAL PRIMARY KEY,
    equipment_id UUID NOT NULL REFERENCES public.equipments(id) ON DELETE CASCADE,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_ip TEXT,
    ping_ms INTEGER DEFAULT 0,
    pending_outbox_count INTEGER DEFAULT 0,
    db_integrity_ok BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_heartbeats_time 
ON public.equipment_heartbeats (equipment_id, reported_at DESC);

-- ==============================================================================
-- 9. TABELA: equipment_pairings (Vínculos Ativos Atleta-Quadra)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.equipment_pairings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL REFERENCES public.equipments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.player_profiles(user_id) ON DELETE CASCADE,
    pairing_role TEXT NOT NULL DEFAULT 'athlete' CHECK (pairing_role = 'athlete'),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '4 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_equipment_user_pairing UNIQUE (equipment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pairings_active 
ON public.equipment_pairings (equipment_id, user_id, is_active, expires_at);

-- ==============================================================================
-- 10. TABELA: synced_sessions (Sessões de Jogo e Treino Transmitidas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.synced_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.player_profiles(user_id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL REFERENCES public.equipments(id) ON DELETE RESTRICT,
    local_session_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('free', 'single', 'clear_all')),
    shots_count INTEGER NOT NULL CHECK (shots_count >= 0),
    hits_count INTEGER NOT NULL CHECK (hits_count >= 0),
    accuracy NUMERIC(5,2) NOT NULL CHECK (accuracy >= 0.00 AND accuracy <= 100.00),
    total_score INTEGER NOT NULL CHECK (total_score >= 0),
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
    reactivations INTEGER NOT NULL DEFAULT 0 CHECK (reactivations >= 0),
    is_simulation BOOLEAN NOT NULL DEFAULT FALSE,
    wall_preset TEXT NOT NULL DEFAULT '3x2',
    wall_dimensions_json JSONB,
    sector_distribution_json JSONB,
    xp_granted INTEGER NOT NULL DEFAULT 0 CHECK (xp_granted >= 0),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_equipment_local_session UNIQUE (equipment_id, local_session_id),
    CONSTRAINT chk_sessions_dates CHECK (ended_at >= started_at),
    CONSTRAINT chk_sessions_xp CHECK (xp_granted >= 0 AND xp_granted <= (total_score + 500))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_date 
ON public.synced_sessions (user_id, started_at DESC);

-- ==============================================================================
-- 11. TABELA: synced_shots (Impactos Individuais da Bola)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.synced_shots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.synced_sessions(id) ON DELETE CASCADE,
    x NUMERIC(6,3),
    y NUMERIC(6,3),
    sector_id INTEGER CHECK (sector_id >= 1 AND sector_id <= 12),
    score INTEGER NOT NULL DEFAULT 0,
    force_kmh NUMERIC(5,2),
    is_hit BOOLEAN,
    is_bullseye BOOLEAN DEFAULT FALSE,
    shot_time_offset_ms INTEGER CHECK (shot_time_offset_ms >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shots_session 
ON public.synced_shots (session_id);

-- ==============================================================================
-- 12. TABELA: player_achievements (Conquistas Desbloqueadas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.player_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.player_profiles(user_id) ON DELETE CASCADE,
    achievement_key TEXT NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata_json JSONB,
    CONSTRAINT uq_player_achievement UNIQUE (user_id, achievement_key)
);

-- ==============================================================================
-- 13. TABELA: academy_lessons (Catálogo Oficial da Academy — Compatibilidade Real)
-- ==============================================================================
-- Permite múltiplos conteúdos por módulo (sem UNIQUE em module_key)
-- Identificador textual id idêntico ao SQLite academy_content ('prec_1', 'cons_1', etc.)
CREATE TABLE IF NOT EXISTS public.academy_lessons (
    id TEXT PRIMARY KEY,
    module_key TEXT NOT NULL CHECK (module_key IN ('precision', 'consistency', 'speed', 'control', 'reflex', 'strategy')),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    instructor TEXT DEFAULT '',
    level TEXT NOT NULL DEFAULT 'Iniciante' CHECK (level IN ('Iniciante', 'Intermediário', 'Avançado')),
    duration TEXT NOT NULL DEFAULT '00:00',
    youtube_video_id TEXT,
    youtube_url TEXT,
    embed_url TEXT,
    thumbnail_url TEXT,
    slot_number INTEGER,
    display_order INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_published_requires_video CHECK (
        (is_published = FALSE) OR 
        (is_published = TRUE AND status = 'published' AND embed_url IS NOT NULL AND length(trim(embed_url)) >= 11)
    )
);

CREATE INDEX IF NOT EXISTS idx_academy_module_order 
ON public.academy_lessons (module_key, display_order);

-- ==============================================================================
-- 14. TABELA: academy_progress (Progresso Individual do Atleta na Academy)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.academy_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.player_profiles(user_id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    last_position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (last_position_seconds >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_lesson_progress UNIQUE (user_id, lesson_id)
);

-- ==============================================================================
-- 15. TABELA: sync_checkpoints (Controle de Idempotência Exactly-Once)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sync_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL REFERENCES public.equipments(id) ON DELETE CASCADE,
    batch_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    details_json JSONB,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_equipment_event_checkpoint UNIQUE (equipment_id, event_id)
);
