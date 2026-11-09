

-- ------------------------------------------------------------------------------
-- 1. ESQUEMA (ADITIVO)
-- ------------------------------------------------------------------------------
ALTER TABLE public.equipments
    ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';

ALTER TABLE public.equipments DROP CONSTRAINT IF EXISTS chk_equipments_environment;
ALTER TABLE public.equipments
    ADD CONSTRAINT chk_equipments_environment CHECK (environment IN ('production', 'homologation'));

-- Equipamento oficial de homologação recebe ambiente homologation
UPDATE public.equipments
SET environment = 'homologation'
WHERE hardware_code = 'MT-HOMOLOG-001';

ALTER TABLE public.synced_sessions ADD COLUMN IF NOT EXISTS payload_fingerprint TEXT;
ALTER TABLE public.synced_sessions ADD COLUMN IF NOT EXISTS engine_rules_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.synced_shots ADD COLUMN IF NOT EXISTS shot_index INTEGER CHECK (shot_index >= 0);
ALTER TABLE public.synced_shots ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0);
ALTER TABLE public.synced_shots ADD COLUMN IF NOT EXISTS match_points INTEGER NOT NULL DEFAULT 0 CHECK (match_points >= 0);

-- Um impacto por posição em cada sessão: impede duplicação de impactos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_synced_shots_session_index
    ON public.synced_shots (session_id, shot_index) WHERE shot_index IS NOT NULL;

-- R1: substitui o teto incompatível (total_score + 500) pelo teto físico por impacto (maior XP
-- possível por impacto = 68, modo 'single' com alvo correto e velocidade > 95).
ALTER TABLE public.synced_sessions DROP CONSTRAINT IF EXISTS chk_sessions_xp;
ALTER TABLE public.synced_sessions DROP CONSTRAINT IF EXISTS chk_sessions_xp_physical;
ALTER TABLE public.synced_sessions
    ADD CONSTRAINT chk_sessions_xp_physical CHECK (xp_granted >= 0 AND xp_granted <= shots_count * 68);

-- ------------------------------------------------------------------------------
-- 2. REGRAS OFICIAIS DO JOGO (engine_rules_version = 1) — FONTE ÚNICA NO BANCO
-- ------------------------------------------------------------------------------
-- Derivadas de gameEngine.js registerHit (score base 85; XP = round(score/2)):
--   free      : (85,43) | com velocidade > 95: (90,48)
--   single    : acerto no alvo solicitado soma +30 score/+20 XP: (115,63) | (120,68)
--               acerto em outro setor:                           (85,43)  | (90,48)
--   clear_all : +15 score/+10 XP:                                (100,53) | (105,58)
--   miss      : (0,0)
CREATE OR REPLACE FUNCTION private.engine_shot_reward_valid_v1(p_mode TEXT, p_score INTEGER, p_xp INTEGER)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT CASE p_mode
        WHEN 'free'      THEN (p_score, p_xp) IN ((85, 43), (90, 48))
        WHEN 'single'    THEN (p_score, p_xp) IN ((85, 43), (90, 48), (115, 63), (120, 68))
        WHEN 'clear_all' THEN (p_score, p_xp) IN ((100, 53), (105, 58))
        ELSE FALSE
    END;
$$;

-- Pontos da PARTIDA por impacto (personalMatchService.js L962-996):
--   free: 85 | single: 1 | clear_all: 100, ou 600 no impacto que zera o último setor (+500 vitória)
CREATE OR REPLACE FUNCTION private.engine_match_points_valid_v1(p_mode TEXT, p_points INTEGER)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT CASE p_mode
        WHEN 'free'      THEN p_points IN (0, 85)
        WHEN 'single'    THEN p_points IN (0, 1)
        WHEN 'clear_all' THEN p_points IN (0, 100, 600)
        ELSE FALSE
    END;
$$;

REVOKE ALL ON FUNCTION private.engine_shot_reward_valid_v1(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.engine_match_points_valid_v1(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. AUTENTICAÇÃO ÚNICA DE EQUIPAMENTO (reutilizada pelas RPCs novas)
-- ------------------------------------------------------------------------------
-- Falha fechada: chave NULL/vazia, hash armazenado inválido e chave incorreta nunca autenticam.
CREATE OR REPLACE FUNCTION private.authenticate_equipment_v1(p_equipment_id UUID, p_api_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_active BOOLEAN;
    v_revoked TIMESTAMPTZ;
    v_created_at TIMESTAMPTZ;
    v_environment TEXT;
    v_stored_hash TEXT;
    v_failed INTEGER;
    v_locked_until TIMESTAMPTZ;
    v_computed_hash TEXT;
BEGIN
    SELECT e.is_active, e.revoked_at, e.created_at, e.environment, s.api_key_hash, s.failed_attempts, s.locked_until
    INTO v_active, v_revoked, v_created_at, v_environment, v_stored_hash, v_failed, v_locked_until
    FROM public.equipments e
    JOIN private.equipment_secrets s ON s.equipment_id = e.id
    WHERE e.id = p_equipment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    IF v_active IS NOT TRUE OR v_revoked IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'EQUIPMENT_REVOKED');
    END IF;

    IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'EQUIPMENT_TEMPORARILY_LOCKED');
    END IF;

    IF v_stored_hash IS NULL OR v_stored_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    IF p_api_key IS NULL OR length(btrim(p_api_key)) = 0 THEN
        UPDATE private.equipment_secrets
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
            updated_at = NOW()
        WHERE equipment_id = p_equipment_id;
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    v_computed_hash := encode(extensions.digest(convert_to(p_api_key, 'UTF8'), 'sha256'), 'hex');

    IF v_computed_hash IS DISTINCT FROM v_stored_hash THEN
        UPDATE private.equipment_secrets
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
            updated_at = NOW()
        WHERE equipment_id = p_equipment_id;
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    IF v_failed > 0 THEN
        UPDATE private.equipment_secrets
        SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
        WHERE equipment_id = p_equipment_id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'environment', v_environment, 'equipment_created_at', v_created_at);
END;
$$;

REVOKE ALL ON FUNCTION private.authenticate_equipment_v1(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. CARREIRA: RECÁLCULO IDEMPOTENTE A PARTIR DAS SESSÕES SINCRONIZADAS
-- ------------------------------------------------------------------------------
-- Função pura do estado persistido: executar N vezes produz o mesmo resultado (nenhum XP
-- é "somado"; sempre recalculado do zero), logo retransmissões nunca duplicam XP/conquistas.
-- Entram na carreira: sessões reais e as simuladas SOMENTE de equipamento 'homologation'.
-- Fórmulas idênticas ao gameEngine.js: nível residual (xp_next = nível * 250, inicial 250),
-- 6 títulos oficiais, atributos (updateAttributes, xp_next 1000, máx. nível 10).
CREATE OR REPLACE FUNCTION private.recompute_player_progress_v1(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_matches INTEGER := 0;
    v_shots INTEGER := 0;
    v_hits INTEGER := 0;
    v_xp BIGINT := 0;
    v_accuracy NUMERIC(5,2) := 0.00;
    v_level INTEGER := 1;
    v_xp_next INTEGER := 250;
    v_remaining BIGINT := 0;
    v_title TEXT := 'Iniciante';
    v_has_bullseye BOOLEAN := FALSE;
    v_has_speed BOOLEAN := FALSE;
    v_g_precision BIGINT; v_g_consistency BIGINT; v_g_speed BIGINT;
    v_g_control BIGINT; v_g_reflex BIGINT; v_g_strategy BIGINT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('progress:' || p_user_id::text));

    SELECT COUNT(*), COALESCE(SUM(s.shots_count), 0), COALESCE(SUM(s.xp_granted), 0)
    INTO v_matches, v_shots, v_xp
    FROM public.synced_sessions s
    JOIN public.equipments e ON e.id = s.equipment_id
    WHERE s.user_id = p_user_id AND (s.is_simulation = FALSE OR e.environment = 'homologation');

    SELECT
        COUNT(*) FILTER (WHERE sh.is_hit IS TRUE),
        COALESCE(BOOL_OR(sh.is_bullseye IS TRUE), FALSE),
        COALESCE(BOOL_OR(COALESCE(sh.force_kmh, 0) >= 100), FALSE),
        COALESCE(SUM(5 + CASE WHEN sh.is_bullseye IS TRUE THEN 25 WHEN sh.is_hit IS TRUE THEN 12 ELSE 2 END), 0),
        COALESCE(SUM(5 + CASE WHEN sh.is_hit IS TRUE THEN 12 ELSE 0 END), 0),
        COALESCE(SUM(5 + CASE WHEN COALESCE(sh.force_kmh, 0) > 90 THEN 20 ELSE 8 END), 0),
        COALESCE(SUM(5 + CASE WHEN sh.sector_id IN (1, 3, 7, 9, 10, 11) THEN 18 ELSE 8 END), 0),
        COALESCE(SUM(5 + CASE WHEN s.mode = 'single' THEN 18 ELSE 10 END), 0),
        COALESCE(SUM(5 + CASE WHEN s.mode = 'clear_all' THEN 20 ELSE 10 END), 0)
    INTO v_hits, v_has_bullseye, v_has_speed,
         v_g_precision, v_g_consistency, v_g_speed, v_g_control, v_g_reflex, v_g_strategy
    FROM public.synced_shots sh
    JOIN public.synced_sessions s ON s.id = sh.session_id
    JOIN public.equipments e ON e.id = s.equipment_id
    WHERE s.user_id = p_user_id AND (s.is_simulation = FALSE OR e.environment = 'homologation');

    IF v_shots > 0 THEN
        v_accuracy := ROUND((v_hits::NUMERIC / v_shots::NUMERIC) * 100.0, 2);
    END IF;

    v_remaining := v_xp;
    WHILE v_remaining >= v_xp_next LOOP
        v_remaining := v_remaining - v_xp_next;
        v_level := v_level + 1;
        v_xp_next := v_level * 250;
    END LOOP;

    v_title := CASE
        WHEN v_level <= 2 THEN 'Iniciante'
        WHEN v_level <= 5 THEN 'Praticante'
        WHEN v_level <= 8 THEN 'Intermediário'
        WHEN v_level <= 11 THEN 'Avançado'
        WHEN v_level <= 14 THEN 'Competidor'
        ELSE 'Especialista'
    END;

    PERFORM set_config('motion_tennis.reconcile_authorized', 'true', true);
    UPDATE public.player_profiles
    SET total_matches = v_matches,
        total_shots = v_shots,
        total_hits = v_hits,
        overall_accuracy = v_accuracy,
        xp = v_remaining::INTEGER,
        level = v_level,
        xp_next = v_xp_next,
        title = v_title,
        last_synced_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id;
    PERFORM set_config('motion_tennis.reconcile_authorized', 'false', true);

    -- Atributos: fórmula fechada equivalente ao updateAttributes (um nível por impacto, xp_next fixo).
    UPDATE public.player_attributes a
    SET level = LEAST(a.max_level, 1 + (g.total / a.xp_next)::INTEGER),
        xp = (g.total - a.xp_next::BIGINT * (LEAST(a.max_level, 1 + (g.total / a.xp_next)::INTEGER) - 1))::INTEGER,
        updated_at = NOW()
    FROM (VALUES
        ('precision', v_g_precision), ('consistency', v_g_consistency), ('speed', v_g_speed),
        ('control', v_g_control), ('reflex', v_g_reflex), ('strategy', v_g_strategy)
    ) AS g(key, total)
    WHERE a.user_id = p_user_id AND a.key = g.key;

    -- Conquistas (regras de gameEngine.checkAchievements). Idempotente e monotônica: nunca relock.
    INSERT INTO public.player_achievements (user_id, achievement_key, metadata_json)
    SELECT p_user_id, c.key, jsonb_build_object('source', 'recompute_v1')
    FROM (VALUES
        ('first_shot', v_shots >= 1),
        ('bullseye', v_has_bullseye),
        ('shots_100', v_shots >= 100),
        ('shots_500', v_shots >= 500),
        ('prec_80', v_shots >= 10 AND v_accuracy >= 80),
        ('speed_demon', v_has_speed)
    ) AS c(key, ok)
    WHERE c.ok
    ON CONFLICT (user_id, achievement_key) DO NOTHING;

    RETURN jsonb_build_object(
        'matches', v_matches, 'shots', v_shots, 'hits', v_hits, 'accuracy', v_accuracy,
        'total_xp', v_xp, 'level', v_level, 'xp', v_remaining, 'xp_next', v_xp_next, 'title', v_title
    );
END;
$$;

REVOKE ALL ON FUNCTION private.recompute_player_progress_v1(UUID) FROM PUBLIC, anon, authenticated;

-- reconcile_player_stats (service_role, manual) passa a delegar à fonte única de verdade.
CREATE OR REPLACE FUNCTION public.reconcile_player_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_progress JSONB;
BEGIN
    v_progress := private.recompute_player_progress_v1(p_user_id);
    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'matches', v_progress->'matches',
        'total_xp', v_progress->'total_xp',
        'current_xp', v_progress->'xp',
        'xp_next', v_progress->'xp_next',
        'level', v_progress->'level',
        'title', v_progress->'title',
        'accuracy', v_progress->'accuracy'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_player_stats(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_player_stats(UUID) TO service_role;

-- ------------------------------------------------------------------------------
-- 5. SINCRONIZAÇÃO DE PARTIDA v2 (idempotência total, validação por impacto)
-- ------------------------------------------------------------------------------
-- Códigos de erro DEFINITIVOS (não adianta reenviar): INVALID_*, *_MISMATCH_WITH_SHOTS,
-- XP_EXCEEDS_PHYSICAL_LIMITS, SCORE_EXCEEDS_PHYSICAL_LIMITS, EVENT_ID_COLLISION_DIFFERENT_PAYLOAD,
-- SESSION_DATA_DIVERGENCE, PLAYER_NEVER_PAIRED_WITH_EQUIPMENT, PAIRING_EXPIRED_FOR_SESSION,
-- SIMULATION_NOT_ALLOWED_IN_PRODUCTION, SESSION_PREDATES_EQUIPMENT.
-- Códigos que exigem ATENÇÃO/espera: INVALID_CREDENTIALS, EQUIPMENT_REVOKED, EQUIPMENT_TEMPORARILY_LOCKED.
CREATE OR REPLACE FUNCTION public.sync_equipment_session_v2(
    p_equipment_id UUID,
    p_api_key TEXT,
    p_event JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_auth JSONB;
    v_environment TEXT;
    v_equipment_created_at TIMESTAMPTZ;

    v_event_id TEXT;
    v_payload JSONB;
    v_shots JSONB;
    v_shot JSONB;
    v_local_session_id TEXT;
    v_user_id UUID;
    v_mode TEXT;
    v_wall_preset TEXT;
    v_started_at TIMESTAMPTZ;
    v_ended_at TIMESTAMPTZ;
    v_duration INTEGER;
    v_shots_count INTEGER;
    v_hits_count INTEGER;
    v_total_score INTEGER;
    v_xp_granted INTEGER;
    v_reactivations INTEGER;
    v_is_simulation BOOLEAN;
    v_rules_version INTEGER;

    v_idx INTEGER;
    v_x NUMERIC;
    v_y NUMERIC;
    v_sector INTEGER;
    v_is_hit BOOLEAN;
    v_score INTEGER;
    v_xp INTEGER;
    v_points INTEGER;
    v_force NUMERIC;
    v_bullseye BOOLEAN;
    v_offset INTEGER;
    v_sum_points INTEGER := 0;
    v_sum_xp INTEGER := 0;
    v_match_hits INTEGER := 0;
    v_zero_point_hits INTEGER := 0;
    v_big_bonus INTEGER := 0;

    v_err_state TEXT;
    v_err_msg TEXT;
    v_fingerprint TEXT;
    v_header TEXT;
    v_shots_canon TEXT;
    v_sector_distribution JSONB;

    v_checkpoint JSONB;
    v_existing_session_id UUID;
    v_existing_fingerprint TEXT;
    v_has_pairing_history BOOLEAN;
    v_is_authorized_window BOOLEAN;
    v_session_uuid UUID;
    v_inserted_checkpoint_id UUID;
    v_progress JSONB;
BEGIN
    -- 1. Autenticação do equipamento (fonte única, falha fechada)
    v_auth := private.authenticate_equipment_v1(p_equipment_id, p_api_key);
    IF (v_auth->>'ok')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', v_auth->>'error');
    END IF;
    v_environment := v_auth->>'environment';
    v_equipment_created_at := (v_auth->>'equipment_created_at')::TIMESTAMPTZ;

    -- 2. Estrutura do envelope
    IF p_event IS NULL OR jsonb_typeof(p_event) <> 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_EVENT_STRUCTURE');
    END IF;

    v_event_id := p_event->>'event_id';
    v_payload := p_event->'payload';

    IF v_event_id IS NULL OR length(btrim(v_event_id)) = 0 OR length(v_event_id) > 64
       OR p_event->>'event_type' IS DISTINCT FROM 'MATCH_FINISHED'
       OR v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_EVENT_STRUCTURE');
    END IF;

    -- 3. Parsing e validação rigorosa (qualquer falha => erro definitivo, nunca exceção opaca)
    BEGIN
        v_local_session_id := v_payload->>'local_session_id';
        IF v_local_session_id IS NULL OR length(btrim(v_local_session_id)) = 0 OR length(v_local_session_id) > 100 THEN
            RAISE EXCEPTION 'MISSING_LOCAL_SESSION_ID' USING ERRCODE = 'MT001';
        END IF;

        IF jsonb_typeof(v_payload->'user_id') IS DISTINCT FROM 'string' THEN
            RAISE EXCEPTION 'USER_ID_REQUIRED' USING ERRCODE = 'MT001';
        END IF;
        v_user_id := (v_payload->>'user_id')::UUID;

        IF jsonb_typeof(v_payload->'is_simulation') IS DISTINCT FROM 'boolean' THEN
            RAISE EXCEPTION 'INVALID_PAYLOAD_IS_SIMULATION_REQUIRED' USING ERRCODE = 'MT001';
        END IF;
        v_is_simulation := (v_payload->>'is_simulation')::BOOLEAN;

        v_rules_version := (v_payload->>'engine_rules_version')::INTEGER;
        IF v_rules_version IS DISTINCT FROM 1 THEN
            RAISE EXCEPTION 'UNSUPPORTED_ENGINE_RULES_VERSION' USING ERRCODE = 'MT001';
        END IF;

        v_mode := v_payload->>'mode';
        IF v_mode IS NULL OR v_mode NOT IN ('free', 'single', 'clear_all') THEN
            RAISE EXCEPTION 'INVALID_GAME_MODE' USING ERRCODE = 'MT001';
        END IF;

        v_wall_preset := COALESCE(NULLIF(btrim(v_payload->>'wall_preset'), ''), '3x2');
        IF length(v_wall_preset) > 20 THEN
            RAISE EXCEPTION 'INVALID_PAYLOAD_WALL_PRESET' USING ERRCODE = 'MT001';
        END IF;

        v_started_at := (v_payload->>'started_at')::TIMESTAMPTZ;
        v_ended_at := (v_payload->>'ended_at')::TIMESTAMPTZ;
        IF v_started_at IS NULL OR v_ended_at IS NULL OR v_ended_at < v_started_at THEN
            RAISE EXCEPTION 'INVALID_SESSION_TIMESTAMPS' USING ERRCODE = 'MT001';
        END IF;
        IF v_started_at > (NOW() + INTERVAL '5 minutes') THEN
            RAISE EXCEPTION 'SESSION_STARTED_IN_FUTURE' USING ERRCODE = 'MT001';
        END IF;
        IF (v_ended_at - v_started_at) > INTERVAL '4 hours' THEN
            RAISE EXCEPTION 'INVALID_SESSION_DURATION' USING ERRCODE = 'MT001';
        END IF;
        IF v_equipment_created_at IS NOT NULL AND v_started_at < (v_equipment_created_at - INTERVAL '5 minutes') THEN
            RAISE EXCEPTION 'SESSION_PREDATES_EQUIPMENT' USING ERRCODE = 'MT001';
        END IF;

        v_duration := (v_payload->>'duration_seconds')::INTEGER;
        IF v_duration IS NULL OR v_duration < 0 OR v_duration > 14400
           OR ABS(v_duration - EXTRACT(EPOCH FROM (v_ended_at - v_started_at))) > 120 THEN
            RAISE EXCEPTION 'INVALID_SESSION_DURATION' USING ERRCODE = 'MT001';
        END IF;

        v_shots_count := (v_payload->>'shots_count')::INTEGER;
        v_hits_count := (v_payload->>'hits_count')::INTEGER;
        v_total_score := (v_payload->>'total_score')::INTEGER;
        v_xp_granted := (v_payload->>'xp_granted')::INTEGER;
        v_reactivations := COALESCE((v_payload->>'reactivations')::INTEGER, 0);

        IF v_shots_count IS NULL OR v_hits_count IS NULL OR v_total_score IS NULL OR v_xp_granted IS NULL
           OR v_shots_count < 0 OR v_hits_count < 0 OR v_total_score < 0 OR v_xp_granted < 0
           OR v_reactivations < 0 OR v_hits_count > v_shots_count OR v_shots_count > 5000 THEN
            RAISE EXCEPTION 'INVALID_SCORE_METRICS' USING ERRCODE = 'MT001';
        END IF;

        v_shots := v_payload->'shots';
        IF v_shots IS NULL OR jsonb_typeof(v_shots) <> 'array' OR jsonb_array_length(v_shots) <> v_shots_count THEN
            RAISE EXCEPTION 'SHOTS_COUNT_MISMATCH' USING ERRCODE = 'MT001';
        END IF;

        -- Validação impacto a impacto (regras oficiais do gameEngine, engine_rules_version = 1)
        IF v_shots_count > 0 THEN
            FOR v_idx IN 0 .. v_shots_count - 1 LOOP
                v_shot := v_shots->v_idx;
                IF jsonb_typeof(v_shot) <> 'object'
                   OR jsonb_typeof(v_shot->'x') IS DISTINCT FROM 'number'
                   OR jsonb_typeof(v_shot->'y') IS DISTINCT FROM 'number'
                   OR jsonb_typeof(v_shot->'is_hit') IS DISTINCT FROM 'boolean'
                   OR jsonb_typeof(v_shot->'score') IS DISTINCT FROM 'number'
                   OR jsonb_typeof(v_shot->'xp') IS DISTINCT FROM 'number'
                   OR jsonb_typeof(v_shot->'match_points') IS DISTINCT FROM 'number' THEN
                    RAISE EXCEPTION 'INVALID_SHOT_FORMAT' USING ERRCODE = 'MT001';
                END IF;

                v_x := (v_shot->>'x')::NUMERIC;
                v_y := (v_shot->>'y')::NUMERIC;
                v_is_hit := (v_shot->>'is_hit')::BOOLEAN;
                v_score := (v_shot->>'score')::INTEGER;
                v_xp := (v_shot->>'xp')::INTEGER;
                v_points := (v_shot->>'match_points')::INTEGER;
                v_sector := (v_shot->>'sector_id')::INTEGER;
                v_force := (v_shot->>'force_kmh')::NUMERIC;
                v_bullseye := COALESCE((v_shot->>'is_bullseye')::BOOLEAN, FALSE);
                v_offset := (v_shot->>'shot_time_offset_ms')::INTEGER;

                IF v_x < 0 OR v_x > 100 OR v_y < 0 OR v_y > 100
                   OR (v_sector IS NOT NULL AND (v_sector < 1 OR v_sector > 12))
                   OR (v_force IS NOT NULL AND (v_force < 0 OR v_force > 400))
                   OR (v_offset IS NOT NULL AND (v_offset < 0 OR v_offset > (v_duration * 1000 + 180000))) THEN
                    RAISE EXCEPTION 'INVALID_SHOT_RANGE' USING ERRCODE = 'MT001';
                END IF;

                IF v_is_hit THEN
                    IF v_sector IS NULL THEN
                        RAISE EXCEPTION 'INVALID_SHOT_HIT_WITHOUT_SECTOR' USING ERRCODE = 'MT001';
                    END IF;
                    IF NOT private.engine_shot_reward_valid_v1(v_mode, v_score, v_xp) THEN
                        RAISE EXCEPTION 'XP_EXCEEDS_PHYSICAL_LIMITS' USING ERRCODE = 'MT001';
                    END IF;
                    IF NOT private.engine_match_points_valid_v1(v_mode, v_points) THEN
                        RAISE EXCEPTION 'SCORE_EXCEEDS_PHYSICAL_LIMITS' USING ERRCODE = 'MT001';
                    END IF;
                ELSE
                    IF v_score <> 0 OR v_xp <> 0 OR v_points <> 0 OR v_bullseye THEN
                        RAISE EXCEPTION 'INVALID_SHOT_MISS_WITH_REWARD' USING ERRCODE = 'MT001';
                    END IF;
                END IF;

                v_sum_points := v_sum_points + v_points;
                v_sum_xp := v_sum_xp + v_xp;
                IF v_points > 0 THEN v_match_hits := v_match_hits + 1; END IF;
                IF v_is_hit AND v_points = 0 THEN v_zero_point_hits := v_zero_point_hits + 1; END IF;
                IF v_points > 500 THEN v_big_bonus := v_big_bonus + 1; END IF;
            END LOOP;
        END IF;

        IF v_sum_points <> v_total_score THEN
            RAISE EXCEPTION 'SCORE_MISMATCH_WITH_SHOTS' USING ERRCODE = 'MT001';
        END IF;
        IF v_match_hits <> v_hits_count THEN
            RAISE EXCEPTION 'HITS_MISMATCH_WITH_SHOTS' USING ERRCODE = 'MT001';
        END IF;
        IF v_sum_xp <> v_xp_granted THEN
            RAISE EXCEPTION 'XP_MISMATCH_WITH_SHOTS' USING ERRCODE = 'MT001';
        END IF;
        IF v_big_bonus > 1 THEN
            RAISE EXCEPTION 'SCORE_EXCEEDS_PHYSICAL_LIMITS' USING ERRCODE = 'MT001';
        END IF;
        -- Reativações só existem no modo clear_all e equivalem a acertos que valem 0 ponto.
        IF v_reactivations <> (CASE WHEN v_mode = 'clear_all' THEN v_zero_point_hits ELSE 0 END) THEN
            RAISE EXCEPTION 'INVALID_REACTIVATIONS' USING ERRCODE = 'MT001';
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
            IF v_err_state = 'MT001' THEN
                RETURN jsonb_build_object('success', false, 'error', v_err_msg);
            END IF;
            RETURN jsonb_build_object('success', false, 'error', 'INVALID_PAYLOAD_FORMAT');
    END;

    -- 4. Simulação nunca entra em equipamento de produção
    IF v_is_simulation AND v_environment IS DISTINCT FROM 'homologation' THEN
        RETURN jsonb_build_object('success', false, 'error', 'SIMULATION_NOT_ALLOWED_IN_PRODUCTION');
    END IF;

    -- 5. Fingerprint canônico SHA-256: sessão + TODOS os impactos (ordem preservada)
    v_header := 'v2|' || v_local_session_id || '|' || v_user_id::TEXT || '|' || v_mode || '|' ||
                v_is_simulation::TEXT || '|' ||
                to_char(v_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
                to_char(v_ended_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
                v_duration::TEXT || '|' || v_total_score::TEXT || '|' || v_shots_count::TEXT || '|' ||
                v_hits_count::TEXT || '|' || v_xp_granted::TEXT || '|' || v_reactivations::TEXT || '|' ||
                v_wall_preset;

    SELECT COALESCE(string_agg(
        concat_ws('~',
            (t.idx - 1)::TEXT,
            round((t.elem->>'x')::NUMERIC, 3)::TEXT,
            round((t.elem->>'y')::NUMERIC, 3)::TEXT,
            COALESCE(t.elem->>'sector_id', ''),
            (t.elem->>'is_hit')::BOOLEAN::TEXT,
            (t.elem->>'score')::INTEGER::TEXT,
            (t.elem->>'xp')::INTEGER::TEXT,
            (t.elem->>'match_points')::INTEGER::TEXT,
            COALESCE(round((t.elem->>'force_kmh')::NUMERIC, 2)::TEXT, ''),
            COALESCE((t.elem->>'is_bullseye')::BOOLEAN, FALSE)::TEXT,
            COALESCE((t.elem->>'shot_time_offset_ms')::INTEGER::TEXT, '')
        ), '|' ORDER BY t.idx), '')
    INTO v_shots_canon
    FROM jsonb_array_elements(v_shots) WITH ORDINALITY AS t(elem, idx);

    v_fingerprint := encode(extensions.digest(convert_to(v_header || '#' || v_shots_canon, 'UTF8'), 'sha256'), 'hex');

    -- 6. Serialização: trava por evento e por sessão (ordem fixa => sem deadlock)
    PERFORM pg_advisory_xact_lock(hashtext('event:' || p_equipment_id::TEXT || ':' || v_event_id));
    PERFORM pg_advisory_xact_lock(hashtext('session:' || p_equipment_id::TEXT || ':' || v_local_session_id));

    -- 7. Idempotência por event_id (consulta ANTES da autorização: evento já confirmado é sempre reconhecido)
    SELECT details_json INTO v_checkpoint
    FROM public.sync_checkpoints
    WHERE equipment_id = p_equipment_id AND event_id = v_event_id;

    IF FOUND THEN
        IF v_checkpoint->>'local_session_id' = v_local_session_id
           AND v_checkpoint->>'payload_fingerprint' = v_fingerprint THEN
            RETURN jsonb_build_object(
                'success', true, 'code', 'DUPLICATE_EVENT_IGNORED', 'status', 'DUPLICATE_EVENT_IGNORED', 'idempotent', true,
                'event_id', v_event_id, 'session_id', v_checkpoint->>'session_id'
            );
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'EVENT_ID_COLLISION_DIFFERENT_PAYLOAD');
    END IF;

    -- 8. Idempotência por local_session_id
    SELECT s.id, s.payload_fingerprint INTO v_existing_session_id, v_existing_fingerprint
    FROM public.synced_sessions s
    WHERE s.equipment_id = p_equipment_id AND s.local_session_id = v_local_session_id;

    IF FOUND THEN
        IF v_existing_fingerprint IS NOT DISTINCT FROM v_fingerprint THEN
            INSERT INTO public.sync_checkpoints (id, equipment_id, batch_id, event_id, entity_type, status, details_json)
            VALUES (
                gen_random_uuid(), p_equipment_id, COALESCE(NULLIF(p_event->>'batch_id', ''), 'single'),
                v_event_id, 'SESSION', 'SUCCESS',
                jsonb_build_object(
                    'local_session_id', v_local_session_id, 'session_id', v_existing_session_id,
                    'user_id', v_user_id, 'payload_fingerprint', v_fingerprint
                )
            )
            ON CONFLICT (equipment_id, event_id) DO NOTHING;

            RETURN jsonb_build_object(
                'success', true, 'code', 'SESSION_ALREADY_EXISTS', 'status', 'SESSION_ALREADY_EXISTS', 'idempotent', true,
                'session_id', v_existing_session_id
            );
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'SESSION_DATA_DIVERGENCE');
    END IF;

    -- 9. Autorização verificável (somente para sessões NOVAS): vínculo atleta-equipamento
    --    e partida iniciada dentro de uma janela de pareamento autorizada (suporta offline tardio).
    SELECT EXISTS (
        SELECT 1 FROM public.equipment_pairings WHERE equipment_id = p_equipment_id AND user_id = v_user_id
    ) OR EXISTS (
        SELECT 1 FROM private.equipment_pairing_challenges
        WHERE equipment_id = p_equipment_id AND consumed_by_user_id = v_user_id AND consumed_at IS NOT NULL
    ) INTO v_has_pairing_history;

    IF NOT v_has_pairing_history THEN
        RETURN jsonb_build_object('success', false, 'error', 'PLAYER_NEVER_PAIRED_WITH_EQUIPMENT');
    END IF;

    SELECT (
        EXISTS (
            SELECT 1 FROM public.equipment_pairings ep
            WHERE ep.equipment_id = p_equipment_id AND ep.user_id = v_user_id AND ep.is_active = TRUE
              AND v_started_at >= (ep.paired_at - INTERVAL '5 minutes')
              AND v_started_at <= ep.expires_at
        )
        OR EXISTS (
            SELECT 1 FROM private.equipment_pairing_challenges c
            WHERE c.equipment_id = p_equipment_id AND c.consumed_by_user_id = v_user_id
              AND c.consumed_at IS NOT NULL
              AND v_started_at >= (c.consumed_at - INTERVAL '5 minutes')
              AND v_started_at <= (c.consumed_at + INTERVAL '4 hours')
        )
    ) INTO v_is_authorized_window;

    IF NOT v_is_authorized_window THEN
        RETURN jsonb_build_object('success', false, 'error', 'PAIRING_EXPIRED_FOR_SESSION');
    END IF;

    -- 10. Persistência atômica (sessão -> impactos -> checkpoint -> carreira, mesma transação)
    SELECT COALESCE(jsonb_object_agg(k, c), '{}'::JSONB) INTO v_sector_distribution
    FROM (
        SELECT (elem->>'sector_id') AS k, COUNT(*) AS c
        FROM jsonb_array_elements(v_shots) AS elem
        WHERE (elem->>'is_hit')::BOOLEAN IS TRUE AND elem->>'sector_id' IS NOT NULL
        GROUP BY elem->>'sector_id'
    ) d;

    v_session_uuid := gen_random_uuid();

    INSERT INTO public.synced_sessions (
        id, user_id, equipment_id, local_session_id, mode, shots_count, hits_count, accuracy,
        total_score, duration_seconds, reactivations, is_simulation, wall_preset,
        sector_distribution_json, xp_granted, started_at, ended_at, synced_at,
        payload_fingerprint, engine_rules_version
    ) VALUES (
        v_session_uuid, v_user_id, p_equipment_id, v_local_session_id, v_mode, v_shots_count, v_hits_count,
        CASE WHEN v_shots_count > 0 THEN ROUND((v_hits_count::NUMERIC / v_shots_count::NUMERIC) * 100.0, 2) ELSE 0.00 END,
        v_total_score, v_duration, v_reactivations, v_is_simulation, v_wall_preset,
        v_sector_distribution, v_xp_granted, v_started_at, v_ended_at, NOW(),
        v_fingerprint, v_rules_version
    );

    INSERT INTO public.synced_shots (
        id, session_id, shot_index, x, y, sector_id, score, xp, match_points,
        force_kmh, is_hit, is_bullseye, shot_time_offset_ms
    )
    SELECT
        gen_random_uuid(), v_session_uuid, (t.idx - 1)::INTEGER,
        round((t.elem->>'x')::NUMERIC, 3), round((t.elem->>'y')::NUMERIC, 3),
        (t.elem->>'sector_id')::INTEGER,
        (t.elem->>'score')::INTEGER, (t.elem->>'xp')::INTEGER, (t.elem->>'match_points')::INTEGER,
        round((t.elem->>'force_kmh')::NUMERIC, 2),
        (t.elem->>'is_hit')::BOOLEAN,
        COALESCE((t.elem->>'is_bullseye')::BOOLEAN, FALSE),
        (t.elem->>'shot_time_offset_ms')::INTEGER
    FROM jsonb_array_elements(v_shots) WITH ORDINALITY AS t(elem, idx);

    INSERT INTO public.sync_checkpoints (id, equipment_id, batch_id, event_id, entity_type, status, details_json)
    VALUES (
        gen_random_uuid(), p_equipment_id, COALESCE(NULLIF(p_event->>'batch_id', ''), 'single'),
        v_event_id, 'SESSION', 'SUCCESS',
        jsonb_build_object(
            'local_session_id', v_local_session_id, 'session_id', v_session_uuid,
            'user_id', v_user_id, 'payload_fingerprint', v_fingerprint
        )
    )
    ON CONFLICT (equipment_id, event_id) DO NOTHING
    RETURNING id INTO v_inserted_checkpoint_id;

    IF v_inserted_checkpoint_id IS NULL THEN
        RAISE EXCEPTION 'CHECKPOINT_COLLISION_DETECTED: estado inesperado após travas consultivas.';
    END IF;

    -- Carreira derivada do estado persistido (idempotente: nunca "soma" XP)
    v_progress := private.recompute_player_progress_v1(v_user_id);

    UPDATE public.equipments
    SET last_sync_at = NOW(), last_heartbeat_at = NOW(), updated_at = NOW()
    WHERE id = p_equipment_id;

    RETURN jsonb_build_object(
        'success', true, 'code', 'SUCCESS', 'status', 'SUCCESS', 'idempotent', false,
        'session_id', v_session_uuid, 'progress', v_progress
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. PRIVILÉGIOS: RPCs de equipamento SOMENTE para service_role (Edge Function)
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.sync_equipment_session_v2(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_equipment_session_v2(UUID, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.issue_equipment_pairing_challenge_v1(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_equipment_pairing_challenge_v1(UUID, TEXT, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.record_equipment_heartbeat_v1(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_equipment_heartbeat_v1(UUID, TEXT, JSONB) TO service_role;

-- v1 aposentada: regras de XP incompatíveis com o jogo (R1) e fingerprint incompleto (R4).
REVOKE ALL ON FUNCTION public.sync_equipment_session_v1(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role;

-- claim_equipment_pairing_v1 continua exclusiva do atleta autenticado (auth.uid()).
REVOKE ALL ON FUNCTION public.claim_equipment_pairing_v1(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_equipment_pairing_v1(TEXT, TEXT) TO authenticated, service_role;
