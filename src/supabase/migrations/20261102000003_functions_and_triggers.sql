-- ==============================================================================
-- MOTION TENNIS — MIGRAÇÃO 003: FUNÇÕES, TRIGGERS E RPCS (COMPATIBILIDADE REAL)
-- ==============================================================================
-- 1. Gatilho de auditoria temporal set_updated_at().
-- 2. Gatilho de proteção protect_player_profile_fields() (bloqueia alteração indevida de XP/nível).
-- 3. RPC issue_equipment_pairing_challenge_v1(): notebook emite desafio temporário no schema private.
-- 4. RPC claim_equipment_pairing_v1(): atleta consome desafio atomicamente via conferência de hash SHA-256.
-- 5. RPC record_equipment_heartbeat_v1(): telemetria com proteção contra força bruta.
-- 6. RPC sync_equipment_session_v1(): ingestão atômica com validação de pareamento não expirado,
--    teto real de XP do gameEngine.js, tratamento rigoroso de idempotência/concorrência e sem reconciliação automática.
-- 7. View analítica com security_invoker = true: v_player_career_summary.
-- 8. Procedimento seguro administrativo: reconcile_player_stats() com fórmula e títulos oficiais do Motion Tennis.
-- Fonte Oficial Canônica: cloud/migrations/003_functions_and_triggers.sql
-- ==============================================================================

-- 1. GATILHO GENÉRICO DE TIMESTAMP ATUALIZADO
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_player_profiles_updated_at ON public.player_profiles;
CREATE TRIGGER trg_player_profiles_updated_at
    BEFORE UPDATE ON public.player_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_player_attributes_updated_at ON public.player_attributes;
CREATE TRIGGER trg_player_attributes_updated_at
    BEFORE UPDATE ON public.player_attributes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_equipments_updated_at ON public.equipments;
CREATE TRIGGER trg_equipments_updated_at
    BEFORE UPDATE ON public.equipments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_academy_lessons_updated_at ON public.academy_lessons;
CREATE TRIGGER trg_academy_lessons_updated_at
    BEFORE UPDATE ON public.academy_lessons
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_academy_progress_updated_at ON public.academy_progress;
CREATE TRIGGER trg_academy_progress_updated_at
    BEFORE UPDATE ON public.academy_progress
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 1.1 PROVISIONAMENTO AUTOMÁTICO E SEGURO DE PERFIS (handle_new_auth_user)
-- ==============================================================================
-- Gatilho de sistema executado em auth.users quando um novo usuário se cadastra no Supabase Auth.
-- Cria o perfil inicial único e os 6 atributos esportivos normalizados com valores padrão oficiais.
-- Não sobrescreve perfis existentes e impede que um usuário crie perfil arbitrariamente para outro.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_display_name TEXT;
BEGIN
    v_display_name := COALESCE(
        NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
        NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
        NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
        NULLIF(split_part(NEW.email, '@', 1), ''),
        'Atleta'
    );
    -- Higienização e limite de tamanho
    v_display_name := SUBSTRING(v_display_name FROM 1 FOR 50);

    -- Provisiona o perfil de jogador com os valores padrão oficiais do Motion Tennis
    INSERT INTO public.player_profiles (
        user_id,
        display_name,
        avatar,
        level,
        xp,
        xp_next,
        title,
        total_matches,
        total_shots,
        total_hits,
        overall_accuracy,
        best_streak,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        v_display_name,
        '🎾',
        1,
        0,
        250,
        'Iniciante',
        0,
        0,
        0,
        0.00,
        0,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;

    -- Provisiona os 6 atributos esportivos oficiais (normalizados em paridade com o SQLite)
    INSERT INTO public.player_attributes (user_id, key, name, level, max_level, xp, xp_next)
    VALUES
        (NEW.id, 'precision', 'Precisão', 1, 10, 0, 1000),
        (NEW.id, 'consistency', 'Consistência', 1, 10, 0, 1000),
        (NEW.id, 'speed', 'Velocidade', 1, 10, 0, 1000),
        (NEW.id, 'control', 'Controle', 1, 10, 0, 1000),
        (NEW.id, 'reflex', 'Reflexo', 1, 10, 0, 1000),
        (NEW.id, 'strategy', 'Estratégia', 1, 10, 0, 1000)
    ON CONFLICT (user_id, key) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ==============================================================================
-- 2. GATILHO DE BLINDAGEM DE XP E PROGRESSÃO EM player_profiles
-- ==============================================================================
-- Defesa em profundidade complementar aos privilégios restritos de coluna.
-- Atletas autenticados NÃO podem alterar XP, nível, métricas ou last_synced_at.
-- RPCs internas autorizadas podem atualizar last_synced_at (sync_equipment_session_v1)
-- e recalcular estatísticas de carreira (reconcile_player_stats) via contexto transacional explícito.
CREATE OR REPLACE FUNCTION public.protect_player_profile_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_is_internal_sync BOOLEAN := COALESCE(current_setting('motion_tennis.internal_sync', true), 'false') = 'true';
    v_is_reconcile BOOLEAN := COALESCE(current_setting('motion_tennis.reconcile_authorized', true), 'false') = 'true';
BEGIN
    -- Imutabilidade do identificador do atleta e da data de criação
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Acesso negado: o user_id do atleta é estritamente imutável.';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Acesso negado: a data de criação do perfil é estritamente imutável.';
    END IF;

    -- Procedimento administrativo autorizado de reconciliação de carreira (reconcile_player_stats)
    IF v_is_reconcile THEN
        RETURN NEW;
    END IF;

    -- Ingestão autorizada de sessão via RPC interna (sync_equipment_session_v1)
    -- Permite atualização exclusiva de last_synced_at e updated_at
    IF v_is_internal_sync THEN
        IF NEW.xp IS DISTINCT FROM OLD.xp OR
           NEW.xp_next IS DISTINCT FROM OLD.xp_next OR
           NEW.level IS DISTINCT FROM OLD.level OR
           NEW.title IS DISTINCT FROM OLD.title OR
           NEW.total_matches IS DISTINCT FROM OLD.total_matches OR
           NEW.total_shots IS DISTINCT FROM OLD.total_shots OR
           NEW.total_hits IS DISTINCT FROM OLD.total_hits OR
           NEW.overall_accuracy IS DISTINCT FROM OLD.overall_accuracy OR
           NEW.best_streak IS DISTINCT FROM OLD.best_streak THEN
            RAISE EXCEPTION 'Acesso negado: sincronização de sessão não pode alterar estatísticas de carreira diretamente.';
        END IF;
        RETURN NEW;
    END IF;

    -- Em qualquer outro cenário (atualização direta de cliente ou requisição PostgREST):
    -- Bloqueio estrito de XP, nível, métricas esportivas e timestamp de sincronização
    IF NEW.xp IS DISTINCT FROM OLD.xp OR
       NEW.xp_next IS DISTINCT FROM OLD.xp_next OR
       NEW.level IS DISTINCT FROM OLD.level OR
       NEW.title IS DISTINCT FROM OLD.title OR
       NEW.total_matches IS DISTINCT FROM OLD.total_matches OR
       NEW.total_shots IS DISTINCT FROM OLD.total_shots OR
       NEW.total_hits IS DISTINCT FROM OLD.total_hits OR
       NEW.overall_accuracy IS DISTINCT FROM OLD.overall_accuracy OR
       NEW.best_streak IS DISTINCT FROM OLD.best_streak OR
       NEW.last_synced_at IS DISTINCT FROM OLD.last_synced_at THEN
        RAISE EXCEPTION 'Acesso negado: atletas podem atualizar unicamente display_name e avatar.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_player_profile_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_player_profile_fields() TO authenticated, service_role;

-- Elimina quaisquer duplicidades de gatilhos criados anteriormente
DROP TRIGGER IF EXISTS trg_protect_player_profile_fields ON public.player_profiles;
DROP TRIGGER IF EXISTS trg_protect_player_profile ON public.player_profiles;

CREATE TRIGGER trg_protect_player_profile
    BEFORE UPDATE ON public.player_profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_player_profile_fields();

-- ==============================================================================
-- 3. EMISSÃO SEGURA DE DESAFIO DE PAREAMENTO (issue_equipment_pairing_challenge_v1)
-- ==============================================================================
-- Exige código com alta entropia (mínimo 6 caracteres, rejeita padrões previsíveis),
-- serializa emissão via trava consultiva e armazena exclusivamente o hash SHA-256.
CREATE OR REPLACE FUNCTION public.issue_equipment_pairing_challenge_v1(
    p_equipment_id UUID,
    p_api_key TEXT,
    p_challenge_code TEXT,
    p_ttl_seconds INTEGER DEFAULT 300
)
RETURNS JSONB AS $$
DECLARE
    v_active BOOLEAN;
    v_revoked TIMESTAMPTZ;
    v_stored_hash TEXT;
    v_failed INTEGER;
    v_locked_until TIMESTAMPTZ;
    v_computed_hash TEXT;
    v_code_hash TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    SELECT e.is_active, e.revoked_at, s.api_key_hash, s.failed_attempts, s.locked_until
    INTO v_active, v_revoked, v_stored_hash, v_failed, v_locked_until
    FROM public.equipments e
    JOIN private.equipment_secrets s ON s.equipment_id = e.id
    WHERE e.id = p_equipment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    IF v_active IS NOT TRUE OR v_revoked IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'EQUIPMENT_REVOKED');
    END IF;

    IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'EQUIPMENT_TEMPORARILY_LOCKED');
    END IF;

    -- [AUTH_HARDENING] 1/3: hash armazenado NULL, vazio ou fora do formato SHA-256 hex (64 chars)
    -- nunca autentica. Falha fechada, sem revelar o motivo ao chamador.
    IF v_stored_hash IS NULL OR v_stored_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    -- [AUTH_HARDENING] 2/3: chave NULL ou vazia/somente espaços é rejeitada ANTES de qualquer hash.
    IF p_api_key IS NULL OR length(btrim(p_api_key)) = 0 THEN
        UPDATE private.equipment_secrets
        SET 
            failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
            updated_at = NOW()
        WHERE equipment_id = p_equipment_id;

        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    v_computed_hash := encode(extensions.digest(convert_to(p_api_key, 'UTF8'), 'sha256'), 'hex');

    -- [AUTH_HARDENING] 3/3: comparação segura contra NULL (IS DISTINCT FROM nunca retorna NULL).
    IF v_computed_hash IS DISTINCT FROM v_stored_hash THEN
        UPDATE private.equipment_secrets
        SET 
            failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
            updated_at = NOW()
        WHERE equipment_id = p_equipment_id;

        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    -- Validação de entropia: mínimo 6 caracteres alfanuméricos
    IF p_challenge_code IS NULL OR length(trim(p_challenge_code)) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CODE_ENTROPY');
    END IF;

    -- Bloqueio expresso de senhas e sequências triviais / previsíveis em produção
    IF trim(p_challenge_code) ~* '^(mt1234|123456|000000|111111|abcdef|password|teste|tennis)' THEN
        RETURN jsonb_build_object('success', false, 'error', 'PREDICTABLE_CODE_REJECTED');
    END IF;

    -- Trava consultiva de emissão para serializar criação concorrente na mesma quadra
    PERFORM pg_advisory_xact_lock(hashtext('issue_challenge:' || p_equipment_id::text));

    -- Invalida desafios anteriores não consumidos deste equipamento
    UPDATE private.equipment_pairing_challenges
    SET consumed_at = NOW()
    WHERE equipment_id = p_equipment_id AND consumed_at IS NULL;

    -- Insere novo desafio temporário com hash SHA-256 qualificado no schema extensions
    v_code_hash := encode(extensions.digest(convert_to(trim(p_challenge_code), 'UTF8'), 'sha256'), 'hex');
    v_expires_at := NOW() + (GREATEST(60, LEAST(600, COALESCE(p_ttl_seconds, 300))) || ' seconds')::INTERVAL;

    INSERT INTO private.equipment_pairing_challenges (
        id,
        equipment_id,
        challenge_code_hash,
        failed_attempts,
        locked_until,
        expires_at
    ) VALUES (
        gen_random_uuid(),
        p_equipment_id,
        v_code_hash,
        0,
        NULL,
        v_expires_at
    );

    RETURN jsonb_build_object(
        'success', true,
        'equipment_id', p_equipment_id,
        'expires_at', v_expires_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

REVOKE ALL ON FUNCTION public.issue_equipment_pairing_challenge_v1(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_equipment_pairing_challenge_v1(UUID, TEXT, TEXT, INTEGER) TO anon, authenticated, service_role;

-- ==============================================================================
-- 4. PAREAMENTO SEGURO E ATÔMICO COM LIMITAÇÃO DE TENTATIVAS (claim_equipment_pairing_v1)
-- ==============================================================================
-- Proteções obrigatórias:
-- 1. Limitação de tentativas por atleta e equipamento (bloqueio por 15 minutos após 5 erros).
-- 2. Consumo atômico estrito com verificação de hash SHA-256.
-- 3. Validação de expiração obrigatória (expires_at > NOW()).
-- 4. Serialização consultiva para impedir ataques concorrentes de corrida.
CREATE OR REPLACE FUNCTION public.claim_equipment_pairing_v1(
    p_hardware_code TEXT,
    p_pairing_code TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_equipment_id UUID;
    v_is_active BOOLEAN;
    v_revoked_at TIMESTAMPTZ;
    v_user_failed INTEGER;
    v_user_locked_until TIMESTAMPTZ;
    v_challenge_id UUID;
    v_ch_failed INTEGER;
    v_ch_locked TIMESTAMPTZ;
    v_consumed_id UUID;
    v_code_hash TEXT;
    v_pairing_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
    END IF;

    IF p_hardware_code IS NULL OR p_pairing_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'MISSING_PARAMETERS');
    END IF;

    SELECT id, is_active, revoked_at 
    INTO v_equipment_id, v_is_active, v_revoked_at
    FROM public.equipments
    WHERE hardware_code = trim(p_hardware_code);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'EQUIPMENT_NOT_FOUND');
    END IF;

    IF v_is_active IS NOT TRUE OR v_revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'EQUIPMENT_NOT_ACTIVE');
    END IF;

    -- Validação de rate limit por usuário e equipamento
    SELECT failed_attempts, locked_until
    INTO v_user_failed, v_user_locked_until
    FROM private.pairing_attempt_limits
    WHERE equipment_id = v_equipment_id AND user_id = v_user_id;

    IF v_user_locked_until IS NOT NULL AND v_user_locked_until > NOW() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PAIRING_ATTEMPTS_TEMPORARILY_LOCKED',
            'locked_until', v_user_locked_until
        );
    END IF;

    -- Trava transacional consultiva por atleta e equipamento
    PERFORM pg_advisory_xact_lock(hashtext('claim_pairing:' || v_equipment_id::text || ':' || v_user_id::text));

    -- Localiza o desafio ativo não expirado e não consumido
    SELECT id, failed_attempts, locked_until
    INTO v_challenge_id, v_ch_failed, v_ch_locked
    FROM private.equipment_pairing_challenges
    WHERE equipment_id = v_equipment_id
      AND expires_at > NOW()
      AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_challenge_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_OR_EXPIRED_PAIRING_CODE');
    END IF;

    IF v_ch_locked IS NOT NULL AND v_ch_locked > NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'CHALLENGE_TEMPORARILY_LOCKED');
    END IF;

    v_code_hash := encode(extensions.digest(convert_to(trim(p_pairing_code), 'UTF8'), 'sha256'), 'hex');

    -- Consumo atômico estrito: valida hash, expiração e garante uso único
    UPDATE private.equipment_pairing_challenges
    SET 
        consumed_at = NOW(),
        consumed_by_user_id = v_user_id
    WHERE id = v_challenge_id
      AND challenge_code_hash = v_code_hash
      AND expires_at > NOW()
      AND consumed_at IS NULL
    RETURNING id INTO v_consumed_id;

    -- Se não consumiu (código incorreto ou corrida): penaliza e bloqueia após tentativas excessivas
    IF v_consumed_id IS NULL THEN
        INSERT INTO private.pairing_attempt_limits (equipment_id, user_id, failed_attempts, locked_until, last_attempt_at)
        VALUES (v_equipment_id, v_user_id, 1, NULL, NOW())
        ON CONFLICT (equipment_id, user_id) DO UPDATE
        SET failed_attempts = private.pairing_attempt_limits.failed_attempts + 1,
            locked_until = CASE WHEN private.pairing_attempt_limits.failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
            last_attempt_at = NOW();

        UPDATE private.equipment_pairing_challenges
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
        WHERE id = v_challenge_id;

        RETURN jsonb_build_object('success', false, 'error', 'INVALID_OR_EXPIRED_PAIRING_CODE');
    END IF;

    -- Sucesso: limpa contador de erros do usuário
    UPDATE private.pairing_attempt_limits
    SET failed_attempts = 0, locked_until = NULL, last_attempt_at = NOW()
    WHERE equipment_id = v_equipment_id AND user_id = v_user_id;

    -- Cria ou atualiza o vínculo do atleta com a quadra com validade de 4 horas
    v_expires_at := NOW() + INTERVAL '4 hours';

    INSERT INTO public.equipment_pairings (
        id,
        equipment_id,
        user_id,
        pairing_role,
        is_active,
        paired_at,
        expires_at
    ) VALUES (
        gen_random_uuid(),
        v_equipment_id,
        v_user_id,
        'athlete',
        TRUE,
        NOW(),
        v_expires_at
    )
    ON CONFLICT (equipment_id, user_id) DO UPDATE
    SET 
        pairing_role = 'athlete',
        is_active = TRUE,
        paired_at = NOW(),
        expires_at = EXCLUDED.expires_at
    RETURNING id INTO v_pairing_id;

    RETURN jsonb_build_object(
        'success', true,
        'pairing_id', v_pairing_id,
        'equipment_id', v_equipment_id,
        'hardware_code', p_hardware_code,
        'user_id', v_user_id,
        'role', 'athlete',
        'expires_at', v_expires_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

REVOKE ALL ON FUNCTION public.claim_equipment_pairing_v1(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_equipment_pairing_v1(TEXT, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 5. TELEMETRIA DO NOTEBOOK (record_equipment_heartbeat_v1)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.record_equipment_heartbeat_v1(
    p_equipment_id UUID,
    p_api_key TEXT,
    p_heartbeat JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_active BOOLEAN;
    v_revoked TIMESTAMPTZ;
    v_stored_hash TEXT;
    v_failed INTEGER;
    v_locked_until TIMESTAMPTZ;
    v_computed_hash TEXT;
BEGIN
    SELECT e.is_active, e.revoked_at, s.api_key_hash, s.failed_attempts, s.locked_until
    INTO v_active, v_revoked, v_stored_hash, v_failed, v_locked_until
    FROM public.equipments e
    JOIN private.equipment_secrets s ON s.equipment_id = e.id
    WHERE e.id = p_equipment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    IF v_active IS NOT TRUE OR v_revoked IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'EQUIPMENT_REVOKED');
    END IF;

    IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'EQUIPMENT_TEMPORARILY_LOCKED');
    END IF;

    -- [AUTH_HARDENING] 1/3: hash armazenado NULL, vazio ou fora do formato SHA-256 hex (64 chars)
    -- nunca autentica. Falha fechada, sem revelar o motivo ao chamador.
    IF v_stored_hash IS NULL OR v_stored_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    -- [AUTH_HARDENING] 2/3: chave NULL ou vazia/somente espaços é rejeitada ANTES de qualquer hash.
    IF p_api_key IS NULL OR length(btrim(p_api_key)) = 0 THEN
        UPDATE private.equipment_secrets
        SET 
            failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
            updated_at = NOW()
        WHERE equipment_id = p_equipment_id;

        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    v_computed_hash := encode(extensions.digest(convert_to(p_api_key, 'UTF8'), 'sha256'), 'hex');

    -- [AUTH_HARDENING] 3/3: comparação segura contra NULL (IS DISTINCT FROM nunca retorna NULL).
    IF v_computed_hash IS DISTINCT FROM v_stored_hash THEN
        UPDATE private.equipment_secrets
        SET 
            failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
            updated_at = NOW()
        WHERE equipment_id = p_equipment_id;

        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    IF v_failed > 0 THEN
        UPDATE private.equipment_secrets SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
        WHERE equipment_id = p_equipment_id;
    END IF;

    INSERT INTO public.equipment_heartbeats (
        equipment_id,
        reported_at,
        client_ip,
        ping_ms,
        pending_outbox_count,
        db_integrity_ok
    ) VALUES (
        p_equipment_id,
        COALESCE((p_heartbeat->>'reported_at')::TIMESTAMPTZ, NOW()),
        p_heartbeat->>'client_ip',
        COALESCE((p_heartbeat->>'ping_ms')::INTEGER, 0),
        COALESCE((p_heartbeat->>'pending_outbox_count')::INTEGER, 0),
        COALESCE((p_heartbeat->>'db_integrity_ok')::BOOLEAN, TRUE)
    );

    UPDATE public.equipments
    SET 
        last_heartbeat_at = NOW(),
        app_version = COALESCE(p_heartbeat->>'app_version', app_version),
        updated_at = NOW()
    WHERE id = p_equipment_id;

    RETURN jsonb_build_object('success', true, 'timestamp', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

REVOKE ALL ON FUNCTION public.record_equipment_heartbeat_v1(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_equipment_heartbeat_v1(UUID, TEXT, JSONB) TO anon, authenticated, service_role;

-- ==============================================================================
-- 6. SINCRONIZAÇÃO IDEMPOTENTE E AUTORIZADA DE PARTIDAS (sync_equipment_session_v1)
-- ==============================================================================
-- Garantias rigorosas:
-- 1. Autorização verificável na origem com suporte a offline tardio:
--    - Partidas legítimas jogadas offline são aceitas mesmo se expires_at < NOW() no envio,
--      desde que started_at esteja dentro da janela de pareamento autorizada.
--    - Partidas iniciadas após a expiração do pareamento são terminantemente rejeitadas.
-- 2. Teto real de XP: derivado do gameEngine.js (xp_granted <= total_score + 500).
-- 3. Idempotência estrita e tratamento de concorrência:
--    - Serialização consultiva por trava transacional (pg_advisory_xact_lock)
--    - Reenvio do mesmo event_id com mesmo payload -> DUPLICATE_EVENT_IGNORED
--    - Mesmo event_id com payload divergente -> EVENT_ID_COLLISION_DIFFERENT_PAYLOAD
--    - Mesma local_session_id com mesmo payload -> SESSION_ALREADY_EXISTS
--    - Mesma local_session_id com dados divergentes -> SESSION_DATA_DIVERGENCE
--    - Inserção concorrente tratada via RETURNING id e validação completa contra divergência
-- 4. Sem reconciliação automática de XP (preserva regras do jogo).
-- 5. Atualização autorizada de last_synced_at protegida por contexto interno transacional.
CREATE OR REPLACE FUNCTION public.sync_equipment_session_v1(
    p_equipment_id UUID,
    p_api_key TEXT,
    p_event JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_active BOOLEAN;
    v_revoked TIMESTAMPTZ;
    v_equipment_created_at TIMESTAMPTZ;
    v_stored_hash TEXT;
    v_failed INTEGER;
    v_locked_until TIMESTAMPTZ;
    v_computed_hash TEXT;
    
    v_event_id TEXT;
    v_local_session_id TEXT;
    v_user_id UUID;
    v_session_uuid UUID;
    v_inserted_session_id UUID;
    v_payload JSONB;
    v_shots JSONB;
    v_shot JSONB;
    v_started_at TIMESTAMPTZ;
    v_ended_at TIMESTAMPTZ;
    v_mode TEXT;
    v_shots_count INTEGER;
    v_hits_count INTEGER;
    v_total_score INTEGER;
    v_xp_granted INTEGER;
    
    v_existing_checkpoint_details JSONB;
    v_existing_session RECORD;
    v_has_pairing_history BOOLEAN;
    v_is_authorized_window BOOLEAN;
    v_payload_fingerprint TEXT;
    v_inserted_checkpoint_id UUID;
BEGIN
    -- 1. Validação de credencial do equipamento
    SELECT e.is_active, e.revoked_at, e.created_at, s.api_key_hash, s.failed_attempts, s.locked_until
    INTO v_active, v_revoked, v_equipment_created_at, v_stored_hash, v_failed, v_locked_until
    FROM public.equipments e
    JOIN private.equipment_secrets s ON s.equipment_id = e.id
    WHERE e.id = p_equipment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    IF v_active IS NOT TRUE OR v_revoked IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'EQUIPMENT_REVOKED');
    END IF;

    IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'EQUIPMENT_TEMPORARILY_LOCKED');
    END IF;

    -- [AUTH_HARDENING] 1/3: hash armazenado NULL, vazio ou fora do formato SHA-256 hex (64 chars)
    -- nunca autentica. Falha fechada, sem revelar o motivo ao chamador.
    IF v_stored_hash IS NULL OR v_stored_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    -- [AUTH_HARDENING] 2/3: chave NULL ou vazia/somente espaços é rejeitada ANTES de qualquer hash.
    IF p_api_key IS NULL OR length(btrim(p_api_key)) = 0 THEN
        UPDATE private.equipment_secrets
        SET 
            failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
            updated_at = NOW()
        WHERE equipment_id = p_equipment_id;

        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    v_computed_hash := encode(extensions.digest(convert_to(p_api_key, 'UTF8'), 'sha256'), 'hex');

    -- [AUTH_HARDENING] 3/3: comparação segura contra NULL (IS DISTINCT FROM nunca retorna NULL).
    IF v_computed_hash IS DISTINCT FROM v_stored_hash THEN
        UPDATE private.equipment_secrets
        SET 
            failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
            updated_at = NOW()
        WHERE equipment_id = p_equipment_id;

        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    IF v_failed > 0 THEN
        UPDATE private.equipment_secrets SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
        WHERE equipment_id = p_equipment_id;
    END IF;

    -- 2. Validação estrutural de cabeçalhos e payload
    v_event_id := p_event->>'event_id';
    v_payload := p_event->'payload';

    IF v_event_id IS NULL OR length(trim(v_event_id)) = 0 OR v_payload IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_EVENT_STRUCTURE');
    END IF;

    v_local_session_id := v_payload->>'local_session_id';
    IF v_local_session_id IS NULL OR length(trim(v_local_session_id)) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'MISSING_LOCAL_SESSION_ID');
    END IF;

    -- Trava transacional consultiva para serializar submissões concorrentes da mesma sessão
    PERFORM pg_advisory_xact_lock(hashtext('session:' || p_equipment_id::text || ':' || v_local_session_id));

    v_user_id := (v_payload->>'user_id')::UUID;
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'USER_ID_REQUIRED');
    END IF;

    v_mode := v_payload->>'mode';
    v_started_at := (v_payload->>'started_at')::TIMESTAMPTZ;
    v_ended_at := (v_payload->>'ended_at')::TIMESTAMPTZ;
    v_shots_count := COALESCE((v_payload->>'shots_count')::INTEGER, 0);
    v_hits_count := COALESCE((v_payload->>'hits_count')::INTEGER, 0);
    v_total_score := COALESCE((v_payload->>'total_score')::INTEGER, 0);
    v_xp_granted := COALESCE((v_payload->>'xp_granted')::INTEGER, 0);

    -- Validação de consistência temporal e limites físicos
    IF v_started_at IS NULL OR v_ended_at IS NULL OR v_ended_at < v_started_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_SESSION_TIMESTAMPS');
    END IF;

    IF v_started_at > (NOW() + INTERVAL '5 minutes') THEN
        RETURN jsonb_build_object('success', false, 'error', 'SESSION_STARTED_IN_FUTURE');
    END IF;

    IF (v_ended_at - v_started_at) > INTERVAL '4 hours' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_SESSION_DURATION');
    END IF;

    IF v_equipment_created_at IS NOT NULL AND v_started_at < (v_equipment_created_at - INTERVAL '5 minutes') THEN
        RETURN jsonb_build_object('success', false, 'error', 'SESSION_PREDATES_EQUIPMENT');
    END IF;

    IF v_mode NOT IN ('free', 'single', 'clear_all') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_GAME_MODE');
    END IF;

    IF v_shots_count < 0 OR v_hits_count < 0 OR v_hits_count > v_shots_count THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCORE_METRICS');
    END IF;

    -- Validação física estrita de pontuação e XP baseada nas regras de gameEngine.js:
    -- A) Se não houve acertos, pontuação e XP devem ser rigorosamente 0
    IF v_hits_count = 0 AND (v_total_score > 0 OR v_xp_granted > 0) THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_ZERO_HITS_METRICS');
    END IF;

    -- B) Limite físico de pontuação por acerto (máx ~150-200 pts por acerto com todos os bônus)
    IF v_hits_count > 0 AND v_total_score > (v_hits_count * 200) THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCORE_EXCEEDS_PHYSICAL_LIMITS');
    END IF;

    -- C) Limite físico de XP por acerto (máx ~100-120 XP por acerto com bônus + 100 de vitória)
    IF v_xp_granted < 0 OR v_xp_granted > (v_total_score + 100) OR (v_hits_count > 0 AND v_xp_granted > (v_hits_count * 120 + 100)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'XP_EXCEEDS_PHYSICAL_LIMITS');
    END IF;

    -- Fingerprint canônico SHA-256 do payload para conferência criptográfica rigorosa
    v_payload_fingerprint := encode(extensions.digest(convert_to(
        v_local_session_id || '|' ||
        v_user_id::text || '|' ||
        v_mode || '|' ||
        v_total_score::text || '|' ||
        v_shots_count::text || '|' ||
        v_hits_count::text || '|' ||
        v_xp_granted::text || '|' ||
        to_char(v_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'UTF8'
    ), 'sha256'), 'hex');

    -- 3. Validação verificável de autorização da sessão na origem (offline-first tardio)
    -- A) Verifica se o atleta já possui registro de pareamento nesta quadra
    SELECT EXISTS (
        SELECT 1 FROM public.equipment_pairings
        WHERE equipment_id = p_equipment_id AND user_id = v_user_id
    ) OR EXISTS (
        SELECT 1 FROM private.equipment_pairing_challenges
        WHERE equipment_id = p_equipment_id AND consumed_by_user_id = v_user_id AND consumed_at IS NOT NULL
    ) INTO v_has_pairing_history;

    IF NOT v_has_pairing_history THEN
        RETURN jsonb_build_object('success', false, 'error', 'PLAYER_NEVER_PAIRED_WITH_EQUIPMENT');
    END IF;

    -- B) Comprovação verificável: a partida iniciou durante uma janela de pareamento autorizada?
    -- Permite sincronização tardia de partidas jogadas offline mesmo que expires_at < NOW(),
    -- mas REJEITA partidas iniciadas após o término do pareamento.
    SELECT (
        -- Janela do vínculo em equipment_pairings
        EXISTS (
            SELECT 1 FROM public.equipment_pairings ep
            WHERE ep.equipment_id = p_equipment_id
              AND ep.user_id = v_user_id
              AND ep.is_active = TRUE
              AND v_started_at >= (ep.paired_at - INTERVAL '5 minutes')
              AND v_started_at <= ep.expires_at
        )
        OR
        -- Janela imutável registrada em equipment_pairing_challenges
        EXISTS (
            SELECT 1 FROM private.equipment_pairing_challenges c
            WHERE c.equipment_id = p_equipment_id
              AND c.consumed_by_user_id = v_user_id
              AND c.consumed_at IS NOT NULL
              AND v_started_at >= (c.consumed_at - INTERVAL '5 minutes')
              AND v_started_at <= (c.consumed_at + INTERVAL '4 hours')
        )
    ) INTO v_is_authorized_window;

    IF NOT v_is_authorized_window THEN
        RETURN jsonb_build_object('success', false, 'error', 'PAIRING_EXPIRED_FOR_SESSION');
    END IF;

    -- 4. Verificação estrita de duplicidade e colisão de event_id
    SELECT details_json INTO v_existing_checkpoint_details
    FROM public.sync_checkpoints
    WHERE equipment_id = p_equipment_id AND event_id = v_event_id;

    IF FOUND THEN
        -- Rejeita se for atrelado a outro local_session_id OU se o fingerprint canônico divergir
        IF (v_existing_checkpoint_details->>'local_session_id' = v_local_session_id) AND
           (COALESCE(v_existing_checkpoint_details->>'payload_fingerprint', '') = v_payload_fingerprint OR
            ((v_existing_checkpoint_details->>'total_score')::INTEGER = v_total_score AND
             (v_existing_checkpoint_details->>'user_id')::UUID = v_user_id AND
             (v_existing_checkpoint_details->>'mode' = v_mode) AND
             (v_existing_checkpoint_details->>'shots_count')::INTEGER = v_shots_count AND
             (v_existing_checkpoint_details->>'hits_count')::INTEGER = v_hits_count AND
             (v_existing_checkpoint_details->>'xp_granted')::INTEGER = v_xp_granted AND
             (v_existing_checkpoint_details->>'started_at')::TIMESTAMPTZ = v_started_at)) THEN
            RETURN jsonb_build_object(
                'success', true,
                'status', 'DUPLICATE_EVENT_IGNORED',
                'idempotent', true,
                'event_id', v_event_id,
                'session_id', v_existing_checkpoint_details->>'session_id'
            );
        ELSE
            -- Mesmo event_id com payload diferente OU atrelado a outro local_session_id
            RETURN jsonb_build_object(
                'success', false,
                'error', 'EVENT_ID_COLLISION_DIFFERENT_PAYLOAD'
            );
        END IF;
    END IF;

    -- Verificação estrita se a sessão já existe por local_session_id
    SELECT s.id, s.user_id, s.mode, s.total_score, s.shots_count, s.hits_count, s.xp_granted, s.started_at
    INTO v_existing_session
    FROM public.synced_sessions s
    WHERE s.equipment_id = p_equipment_id AND s.local_session_id = v_local_session_id;

    IF FOUND THEN
        IF (v_existing_session.user_id = v_user_id) AND
           (v_existing_session.mode = v_mode) AND
           (v_existing_session.total_score = v_total_score) AND
           (v_existing_session.shots_count = v_shots_count) AND
           (v_existing_session.hits_count = v_hits_count) AND
           (v_existing_session.xp_granted = v_xp_granted) AND
           (v_existing_session.started_at = v_started_at) THEN
            -- Grava checkpoint idempotente caso estivesse ausente e valida retorno
            INSERT INTO public.sync_checkpoints (
                id, equipment_id, batch_id, event_id, entity_type, status, details_json
            ) VALUES (
                gen_random_uuid(),
                p_equipment_id,
                COALESCE(p_event->>'batch_id', 'single'),
                v_event_id,
                'SESSION',
                'SUCCESS',
                jsonb_build_object(
                    'local_session_id', v_local_session_id,
                    'session_id', v_existing_session.id,
                    'user_id', v_user_id,
                    'mode', v_mode,
                    'total_score', v_total_score,
                    'shots_count', v_shots_count,
                    'hits_count', v_hits_count,
                    'xp_granted', v_xp_granted,
                    'started_at', v_started_at,
                    'payload_fingerprint', v_payload_fingerprint
                )
            )
            ON CONFLICT (equipment_id, event_id) DO NOTHING
            RETURNING id INTO v_inserted_checkpoint_id;

            IF v_inserted_checkpoint_id IS NULL THEN
                -- Checkpoint já existia: valida correspondência
                SELECT details_json INTO v_existing_checkpoint_details
                FROM public.sync_checkpoints
                WHERE equipment_id = p_equipment_id AND event_id = v_event_id;

                IF v_existing_checkpoint_details->>'local_session_id' IS DISTINCT FROM v_local_session_id THEN
                    RETURN jsonb_build_object('success', false, 'error', 'EVENT_ID_COLLISION_DIFFERENT_PAYLOAD');
                END IF;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'status', 'SESSION_ALREADY_EXISTS',
                'idempotent', true,
                'session_id', v_existing_session.id
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'SESSION_DATA_DIVERGENCE'
            );
        END IF;
    END IF;

    -- 5. Inserção atômica da Sessão
    v_session_uuid := gen_random_uuid();

    INSERT INTO public.synced_sessions (
        id,
        user_id,
        equipment_id,
        local_session_id,
        mode,
        shots_count,
        hits_count,
        accuracy,
        total_score,
        duration_seconds,
        reactivations,
        is_simulation,
        wall_preset,
        wall_dimensions_json,
        sector_distribution_json,
        xp_granted,
        started_at,
        ended_at,
        synced_at
    ) VALUES (
        v_session_uuid,
        v_user_id,
        p_equipment_id,
        v_local_session_id,
        v_mode,
        v_shots_count,
        v_hits_count,
        COALESCE((v_payload->>'accuracy')::NUMERIC, 0.00),
        v_total_score,
        COALESCE((v_payload->>'duration_seconds')::INTEGER, 0),
        COALESCE((v_payload->>'reactivations')::INTEGER, 0),
        COALESCE((v_payload->>'is_simulation')::BOOLEAN, FALSE),
        COALESCE(v_payload->>'wall_preset', '3x2'),
        v_payload->'wall_dimensions_json',
        v_payload->'sector_distribution_json',
        v_xp_granted,
        v_started_at,
        v_ended_at,
        NOW()
    )
    ON CONFLICT (equipment_id, local_session_id) DO NOTHING
    RETURNING id INTO v_inserted_session_id;

    -- Tratamento estrito de concorrência se outra transação gravou milissegundos antes
    IF v_inserted_session_id IS NULL THEN
        SELECT s.id, s.user_id, s.mode, s.total_score, s.shots_count, s.hits_count, s.xp_granted, s.started_at
        INTO v_existing_session
        FROM public.synced_sessions s
        WHERE s.equipment_id = p_equipment_id AND s.local_session_id = v_local_session_id;

        IF FOUND AND
           (v_existing_session.user_id = v_user_id) AND
           (v_existing_session.mode = v_mode) AND
           (v_existing_session.total_score = v_total_score) AND
           (v_existing_session.shots_count = v_shots_count) AND
           (v_existing_session.hits_count = v_hits_count) AND
           (v_existing_session.xp_granted = v_xp_granted) AND
           (v_existing_session.started_at = v_started_at) THEN
            RETURN jsonb_build_object(
                'success', true,
                'status', 'CONCURRENT_INSERT_HANDLED',
                'idempotent', true,
                'session_id', v_existing_session.id
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'CONCURRENT_INSERT_DATA_DIVERGENCE'
            );
        END IF;
    END IF;

    -- Inserção dos disparos vinculados
    v_shots := v_payload->'shots';
    IF v_shots IS NOT NULL AND jsonb_typeof(v_shots) = 'array' THEN
        FOR v_shot IN SELECT * FROM jsonb_array_elements(v_shots)
        LOOP
            INSERT INTO public.synced_shots (
                id,
                session_id,
                x,
                y,
                sector_id,
                score,
                force_kmh,
                is_hit,
                is_bullseye,
                shot_time_offset_ms
            ) VALUES (
                gen_random_uuid(),
                v_session_uuid,
                (v_shot->>'x')::NUMERIC,
                (v_shot->>'y')::NUMERIC,
                (v_shot->>'sector_id')::INTEGER,
                COALESCE((v_shot->>'score')::INTEGER, 0),
                (v_shot->>'force_kmh')::NUMERIC,
                (v_shot->>'is_hit')::BOOLEAN,
                COALESCE((v_shot->>'is_bullseye')::BOOLEAN, FALSE),
                (v_shot->>'shot_time_offset_ms')::INTEGER
            );
        END LOOP;
    END IF;

    -- 6. Registro do Checkpoint de confirmação com validação explícita de retorno
    INSERT INTO public.sync_checkpoints (
        id,
        equipment_id,
        batch_id,
        event_id,
        entity_type,
        status,
        details_json
    ) VALUES (
        gen_random_uuid(),
        p_equipment_id,
        COALESCE(p_event->>'batch_id', 'single'),
        v_event_id,
        'SESSION',
        'SUCCESS',
        jsonb_build_object(
            'local_session_id', v_local_session_id,
            'session_id', v_session_uuid,
            'user_id', v_user_id,
            'mode', v_mode,
            'total_score', v_total_score,
            'shots_count', v_shots_count,
            'hits_count', v_hits_count,
            'xp_granted', v_xp_granted,
            'started_at', v_started_at,
            'payload_fingerprint', v_payload_fingerprint
        )
    )
    ON CONFLICT (equipment_id, event_id) DO NOTHING
    RETURNING id INTO v_inserted_checkpoint_id;

    IF v_inserted_checkpoint_id IS NULL THEN
        -- Colisão concorrente de event_id: valida se pertence à mesma sessão
        SELECT details_json INTO v_existing_checkpoint_details
        FROM public.sync_checkpoints
        WHERE equipment_id = p_equipment_id AND event_id = v_event_id;

        IF v_existing_checkpoint_details->>'local_session_id' IS DISTINCT FROM v_local_session_id OR
           v_existing_checkpoint_details->>'payload_fingerprint' IS DISTINCT FROM v_payload_fingerprint THEN
            RAISE EXCEPTION 'CHECKPOINT_COLLISION_DETECTED: event_id já registrado com payload divergente.';
        END IF;
    END IF;

    -- 7. Atualização de telemetria e timestamp de sincronização do perfil
    -- (Define contexto transacional motion_tennis.internal_sync para autorizar last_synced_at)
    -- NÃO executa reconciliação automática de XP
    PERFORM set_config('motion_tennis.internal_sync', 'true', true);
    UPDATE public.player_profiles SET last_synced_at = NOW(), updated_at = NOW() WHERE user_id = v_user_id;

    UPDATE public.equipments
    SET 
        last_sync_at = NOW(),
        last_heartbeat_at = NOW(),
        updated_at = NOW()
    WHERE id = p_equipment_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'SUCCESS',
        'idempotent', false,
        'session_id', v_session_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

REVOKE ALL ON FUNCTION public.sync_equipment_session_v1(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_equipment_session_v1(UUID, TEXT, JSONB) TO anon, authenticated, service_role;

-- ==============================================================================
-- 7. VIEW SEGURA DE CARREIRA COM SECURITY INVOKER (v_player_career_summary)
-- ==============================================================================
CREATE OR REPLACE VIEW public.v_player_career_summary WITH (security_invoker = true) AS
SELECT 
    p.user_id,
    p.display_name,
    p.avatar,
    p.level,
    p.xp,
    p.xp_next,
    p.title,
    p.total_matches,
    p.total_shots,
    p.total_hits,
    p.overall_accuracy,
    p.best_streak,
    COALESCE(
        jsonb_object_agg(
            a.key, 
            jsonb_build_object(
                'name', a.name,
                'level', a.level,
                'xp', a.xp,
                'xp_next', a.xp_next
            )
        ) FILTER (WHERE a.key IS NOT NULL),
        '{}'::jsonb
    ) AS attributes_summary,
    COUNT(DISTINCT ach.achievement_key) AS achievements_unlocked_count,
    COUNT(DISTINCT prog.lesson_id) FILTER (WHERE prog.completed = TRUE) AS completed_lessons_count,
    p.last_synced_at
FROM public.player_profiles p
LEFT JOIN public.player_attributes a ON a.user_id = p.user_id
LEFT JOIN public.player_achievements ach ON ach.user_id = p.user_id
LEFT JOIN public.academy_progress prog ON prog.user_id = p.user_id
GROUP BY 
    p.user_id, p.display_name, p.avatar, p.level, p.xp, p.xp_next, p.title,
    p.total_matches, p.total_shots, p.total_hits, p.overall_accuracy, p.best_streak,
    p.last_synced_at;

GRANT SELECT ON public.v_player_career_summary TO authenticated;
GRANT ALL ON public.v_player_career_summary TO service_role;

-- ==============================================================================
-- 8. RECONCILIAÇÃO OFICIAL DE ESTATÍSTICAS E TÍTULOS (ADMIN / SERVICE ROLE)
-- ==============================================================================
-- Fórmula real e títulos oficiais do Motion Tennis (gameEngine.js linhas 18-32 e 257-262)
-- Invocada estritamente de forma manual por service_role para fins de auditoria/reparo.
CREATE OR REPLACE FUNCTION public.reconcile_player_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_total_matches INTEGER := 0;
    v_total_shots INTEGER := 0;
    v_total_hits INTEGER := 0;
    v_accuracy NUMERIC(5,2) := 0.00;
    v_total_xp INTEGER := 0;
    v_calc_level INTEGER := 1;
    v_xp_for_next INTEGER := 250;
    v_remaining_xp INTEGER := 0;
    v_title TEXT := 'Iniciante';
BEGIN
    SELECT 
        COUNT(*),
        COALESCE(SUM(shots_count), 0),
        COALESCE(SUM(hits_count), 0),
        COALESCE(SUM(xp_granted), 0)
    INTO 
        v_total_matches,
        v_total_shots,
        v_total_hits,
        v_total_xp
    FROM public.synced_sessions
    WHERE user_id = p_user_id;

    IF v_total_shots > 0 THEN
        v_accuracy := ROUND((v_total_hits::NUMERIC / v_total_shots::NUMERIC) * 100.0, 2);
    ELSE
        v_accuracy := 0.00;
    END IF;

    -- Progressão oficial de Nível e XP do Motion Tennis (gameEngine.js linhas 257-262)
    v_calc_level := 1;
    v_xp_for_next := 250;
    v_remaining_xp := v_total_xp;

    WHILE v_remaining_xp >= v_xp_for_next LOOP
        v_remaining_xp := v_remaining_xp - v_xp_for_next;
        v_calc_level := v_calc_level + 1;
        v_xp_for_next := v_calc_level * 250;
    END LOOP;

    -- Títulos Oficiais do Motion Tennis (gameEngine.js linhas 18-25)
    IF v_calc_level >= 15 THEN
        v_title := 'Especialista';
    ELSIF v_calc_level >= 12 THEN
        v_title := 'Competidor';
    ELSIF v_calc_level >= 9 THEN
        v_title := 'Avançado';
    ELSIF v_calc_level >= 6 THEN
        v_title := 'Intermediário';
    ELSIF v_calc_level >= 3 THEN
        v_title := 'Praticante';
    ELSE
        v_title := 'Iniciante';
    END IF;

    -- Autoriza a atualização administrativa via contexto transacional explícito
    PERFORM set_config('motion_tennis.reconcile_authorized', 'true', true);

    UPDATE public.player_profiles
    SET 
        total_matches = v_total_matches,
        total_shots = v_total_shots,
        total_hits = v_total_hits,
        overall_accuracy = v_accuracy,
        xp = v_remaining_xp,
        level = v_calc_level,
        xp_next = v_xp_for_next,
        title = v_title,
        last_synced_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'matches', v_total_matches,
        'total_xp', v_total_xp,
        'current_xp', v_remaining_xp,
        'xp_next', v_xp_for_next,
        'level', v_calc_level,
        'title', v_title,
        'accuracy', v_accuracy
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.reconcile_player_stats(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_player_stats(UUID) TO service_role;
