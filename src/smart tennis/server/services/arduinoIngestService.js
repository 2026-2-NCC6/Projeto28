const crypto = require('crypto');
const {
  getNicolasAccount,
  getWallConfigForActor,
  signedMicrosDiff,
  estimateImpactLocationTDOA
} = require('./iotLocalizationService');
const { broadcastEvent } = require('./eventHub');

const VALID_SENSORS = new Set(['S1', 'S2', 'S3']);
const MAX_PROCESSED_EVENT_IDS = 1000;
const MAX_DIAGNOSTIC_LOG = 30;

let connectionState = {
  mode: 'simulation',
  port: 'COM3 (Aguardando Arduino / Ponte Serial)',
  baudRate: 115200,
  lastArduinoPacketAt: null,
  lastDeviceId: null,
  lastSessionId: null
};

const processedEventIds = new Set();
const processedEventQueue = [];
const pendingGroupsByDevice = new Map();
let lastHardwareDiagnostic = null;
let lastSimulatedDiagnostic = null;
const diagnosticHistory = [];

function normalizeSensorId(rawSensorId) {
  if (rawSensorId === undefined || rawSensorId === null) return null;
  const s = String(rawSensorId).trim().toUpperCase();
  if (s === 'S1' || s === '1' || s === 'SENSOR_1' || s === 'SENSOR-1') return 'S1';
  if (s === 'S2' || s === '2' || s === 'SENSOR_2' || s === 'SENSOR-2') return 'S2';
  if (s === 'S3' || s === '3' || s === 'SENSOR_3' || s === 'SENSOR-3') return 'S3';
  return null;
}

function rememberEventId(eventId) {
  const key = eventId ? String(eventId).trim() : '';
  if (!key) return;
  processedEventIds.add(key);
  processedEventQueue.push(key);
  if (processedEventQueue.length > MAX_PROCESSED_EVENT_IDS) {
    processedEventIds.delete(processedEventQueue.shift());
  }
}

function pushDiagnosticHistory(entry) {
  diagnosticHistory.unshift(entry);
  if (diagnosticHistory.length > MAX_DIAGNOSTIC_LOG) diagnosticHistory.pop();
}

function rejectReading({ eventId, deviceId, sensorId, timestampUs, status, groupingState, reason, message }) {
  const rec = {
    eventId,
    deviceId,
    sensorId,
    timestampUs: Number.isFinite(timestampUs) ? timestampUs : null,
    receivedAt: new Date().toISOString(),
    accepted: false,
    status,
    groupingState,
    reason,
    message
  };
  pushDiagnosticHistory(rec);
  return rec;
}

function recordSimulatedImpactDiagnostic({ xPct, yPct, sectorId, classification, gameMode, wallPreset }) {
  lastSimulatedDiagnostic = {
    category: 'SIMULATED_IMPACT',
    categoryLabel: '1. Impacto simulado',
    source: 'mouse_simulation',
    isArduinoHardware: false,
    receivedAt: new Date().toISOString(),
    xScreenPct: xPct ?? null,
    yScreenPct: yPct ?? null,
    sectorId: sectorId ?? null,
    classification: classification || 'SIMULATED',
    gameMode: gameMode || 'free',
    wallPreset: wallPreset || '3x2'
  };
  return lastSimulatedDiagnostic;
}

function finalizeGroup(group, reason, wallCfg) {
  const t1Us = group.readings.S1?.timestampUs ?? null;
  const t2Us = group.readings.S2?.timestampUs ?? null;
  const t3Us = group.readings.S3?.timestampUs ?? null;

  const presentSensors = ['S1', 'S2', 'S3'].filter((k) => Boolean(group.readings[k]));
  const missingSensors = ['S1', 'S2', 'S3'].filter((k) => !group.readings[k]);
  const isComplete = presentSensors.length === 3;
  const isSingleSpikeNoise = !isComplete && presentSensors.length === 1 && reason === 'WINDOW_EXPIRED_INCOMPLETE';

  const tdoa = estimateImpactLocationTDOA({
    t1Us,
    t2Us,
    t3Us,
    presetOrDims: { width: wallCfg.widthM, height: wallCfg.heightM },
    sensorOffsetsCm: wallCfg.sensorOffsetsCm,
    calibration: wallCfg.calibration
  });

  const isSimulatedDevice = Boolean(
    group.isSimulation || (group.deviceId && String(group.deviceId).toUpperCase().includes('SIMULAT'))
  );

  let category = 'HARDWARE_UNLOCATED';
  let categoryLabel = 'Impacto detectado';

  if (isSimulatedDevice) {
    if (isComplete && tdoa.status === 'valid' && tdoa.locationReliable) {
      category = 'SIMULATED_TDOA_LOCATED';
      categoryLabel = 'Simulação: Impacto sintético localizado pelo TDOA';
    } else {
      category = 'SIMULATED_UNLOCATED';
      categoryLabel = 'Simulação: Impacto sintético sem localização confiável';
    }
  } else if (!isComplete) {
    category = 'HARDWARE_INCOMPLETE';
    categoryLabel = isSingleSpikeNoise
      ? `Hardware Real: Disparo isolado em ${presentSensors[0]} (ruído/bancada)`
      : `Hardware Real: Leitura incompleta (${presentSensors.length}/3 sensores)`;
  } else if (tdoa.reason === 'CALIBRATION_REQUIRED' || !wallCfg.calibration?.calibrated) {
    category = 'HARDWARE_AWAITING_CALIBRATION';
    categoryLabel = 'Hardware Real: 3/3 sensores detectados — Aguardando calibração';
  } else if (tdoa.status === 'valid' && tdoa.locationReliable) {
    category = 'HARDWARE_LOCATED';
    categoryLabel = 'Hardware Real: Impacto físico localizado com sucesso';
  } else {
    category = 'HARDWARE_REJECTED';
    categoryLabel = `Hardware Real: Rejeitado (${tdoa.reason || 'inconsistência física'})`;
  }

  const groupingState = isSingleSpikeNoise ? 'NOISE_OR_INCOMPLETE' : isComplete ? 'COMPLETE_3_OF_3' : 'INCOMPLETE';
  const groupingLabel = isSingleSpikeNoise
    ? `Disparo isolado em ${presentSensors[0]} sem confirmação de ${missingSensors.join(' e ')} (ruído ou leitura incompleta)`
    : isComplete
      ? 'Agrupamento completo (S1, S2 e S3 dentro da janela temporal)'
      : `Leitura incompleta (${presentSensors.length}/3 sensores — ausente: ${missingSensors.join(', ')})`;

  const record = {
    groupId: group.groupId,
    eventId: group.lastEventId || group.groupId,
    sessionId: group.sessionId || null,
    deviceId: group.deviceId,
    receivedAt: new Date().toISOString(),
    isArduinoHardware: !isSimulatedDevice,
    isSimulation: isSimulatedDevice,
    category,
    categoryLabel,
    groupingState,
    groupingLabel,
    finalizeReason: reason,
    presentSensors,
    missingSensors,
    duplicateSensorTriggersIgnored: group.duplicateSensorTriggers || 0,
    wallPreset: wallCfg.preset,
    wallWidthM: wallCfg.widthM,
    wallHeightM: wallCfg.heightM,
    sensors: wallCfg.sensors,
    t1Us,
    t2Us,
    t3Us,
    dt21Us: tdoa.dt21Us,
    dt31Us: tdoa.dt31Us,
    dt32Us: tdoa.dt32Us,
    estimationStatus: tdoa.status,
    estimationStatusLabel: tdoa.classificationLabel,
    estimationReason: isComplete ? tdoa.reason : 'INCOMPLETE_READINGS',
    estimationMessage: isComplete
      ? tdoa.message
      : `Leitura incompleta (${presentSensors.length}/3): faltou resposta de ${missingSensors.join(', ')}.`,
    calibrated: Boolean(wallCfg.calibration?.calibrated),
    propagationSpeedMps: wallCfg.calibration?.propagationSpeedMps || null,
    xMeters: isComplete ? tdoa.xMeters : null,
    yMeters: isComplete ? tdoa.yMeters : null,
    xNormalized: isComplete ? tdoa.xNormalized : null,
    yNormalized: isComplete ? tdoa.yNormalized : null,
    screenXPct: isComplete ? tdoa.screenXPct : null,
    screenYPct: isComplete ? tdoa.screenYPct : null,
    sectorId: isComplete ? tdoa.sectorId : null,
    sectorClassification: isComplete ? tdoa.sectorClassification : null,
    residualRmsM: isComplete ? tdoa.residualRmsM : null,
    residualMaxM: isComplete ? tdoa.residualMaxM : null
  };

  lastHardwareDiagnostic = record;
  pushDiagnosticHistory(record);
  broadcastEvent('IOT_DIAGNOSTIC_UPDATED', record);
  return record;
}

async function resolveReferenceWallConfig(actor = null) {
  if (actor) return getWallConfigForActor(actor);
  const nicolas = await getNicolasAccount();
  return getWallConfigForActor(nicolas ? { type: 'user', userId: nicolas.id } : null);
}

async function ingestSensorReading(rawReading = {}, wallCfg = null) {
  const cfg = wallCfg || (await resolveReferenceWallConfig());
  const groupingWindowUs = Number(cfg.calibration?.groupingWindowUs || 25000);
  const minSignalLevel = Number(cfg.calibration?.minSignalLevel || 0);

  const rawEventId = rawReading.event_id ?? rawReading.eventId ?? rawReading.id ?? null;
  const sessionId = rawReading.session_id ?? rawReading.sessionId ?? rawReading.boot_id ?? rawReading.bootId ?? null;
  const eventId = rawEventId && sessionId && !String(rawEventId).includes(String(sessionId))
    ? `${sessionId}_${rawEventId}`
    : rawEventId;
  const deviceId = String(rawReading.device_id ?? rawReading.deviceId ?? 'ARDUINO_MAIN').trim() || 'ARDUINO_MAIN';
  const rawSensor = rawReading.sensor_id ?? rawReading.sensorId ?? rawReading.sensor;
  const sensorId = normalizeSensorId(rawSensor);
  const rawTs = rawReading.timestamp_us ?? rawReading.timestampUs ?? rawReading.timestamp;
  const timestampUs = rawTs !== null && rawTs !== undefined && rawTs !== '' ? Number(rawTs) : NaN;
  const isValidFlag = rawReading.valid !== undefined ? Boolean(rawReading.valid) : true;
  const signalLevel = rawReading.signal_level ?? rawReading.signalLevel ?? rawReading.amplitude ?? null;

  if (eventId && processedEventIds.has(String(eventId).trim())) {
    return rejectReading({
      eventId: String(eventId).trim(),
      deviceId,
      sensorId,
      timestampUs,
      status: 'REJECTED_DUPLICATE_EVENT',
      groupingState: 'DUPLICATE_EVENT',
      reason: 'DUPLICATE_EVENT_ID',
      message: `Evento duplicado (${eventId}) descartado.`
    });
  }

  if (!isValidFlag) {
    if (eventId) rememberEventId(eventId);
    return rejectReading({
      eventId: eventId || `noise_${Date.now()}`,
      deviceId,
      sensorId,
      timestampUs,
      status: 'REJECTED_INVALID_READING',
      groupingState: 'NOISE_REJECTED',
      reason: 'READING_MARKED_INVALID',
      message: 'Leitura marcada como inválida pelo microcontrolador (ruído descartado).'
    });
  }

  if (signalLevel !== null && Number.isFinite(Number(signalLevel)) && minSignalLevel > 0 && Number(signalLevel) < minSignalLevel) {
    if (eventId) rememberEventId(eventId);
    return rejectReading({
      eventId: eventId || `noise_${Date.now()}`,
      deviceId,
      sensorId,
      timestampUs,
      status: 'REJECTED_NOISE',
      groupingState: 'NOISE_REJECTED',
      reason: 'BELOW_NOISE_THRESHOLD',
      message: `Sinal (${signalLevel}) abaixo do limiar de ruído (${minSignalLevel}).`
    });
  }

  if (!sensorId || !VALID_SENSORS.has(sensorId) || !Number.isFinite(timestampUs) || timestampUs < 0) {
    return rejectReading({
      eventId: eventId || `bad_${Date.now()}`,
      deviceId,
      sensorId: rawSensor || null,
      timestampUs,
      status: 'REJECTED_MALFORMED',
      groupingState: 'INVALID_FORMAT',
      reason: !sensorId ? 'INVALID_SENSOR_ID' : 'INVALID_TIMESTAMP_US',
      message: !sensorId
        ? `Identificador de sensor inválido (${rawSensor}). Use apenas S1, S2 ou S3.`
        : 'Timestamp em microssegundos ausente ou inválido.'
    });
  }

  if (eventId) rememberEventId(eventId);
  connectionState.lastArduinoPacketAt = new Date().toISOString();
  connectionState.lastDeviceId = deviceId;

  const isSim = Boolean(rawReading.is_simulation || rawReading.isSimulation || deviceId.toUpperCase().includes('SIMULAT'));
  if (!isSim && connectionState.mode !== 'connected') connectionState.mode = 'connected';

  let finalizedPreviousGroup = null;
  let currentGroup = pendingGroupsByDevice.get(deviceId) || null;

  if (currentGroup) {
    const deltaFromFirstUs = signedMicrosDiff(timestampUs, currentGroup.firstTimestampUs);
    if (deltaFromFirstUs === null || Math.abs(deltaFromFirstUs) > groupingWindowUs) {
      finalizedPreviousGroup = finalizeGroup(currentGroup, 'WINDOW_EXPIRED_INCOMPLETE', cfg);
      pendingGroupsByDevice.delete(deviceId);
      currentGroup = null;
    }
  }

  if (!currentGroup) {
    currentGroup = {
      groupId: `grp_${crypto.randomUUID()}`,
      deviceId,
      sessionId: sessionId || null,
      isSimulation: isSim,
      firstTimestampUs: timestampUs,
      lastEventId: eventId || null,
      createdAtMs: Date.now(),
      duplicateSensorTriggers: 0,
      readings: {}
    };
    pendingGroupsByDevice.set(deviceId, currentGroup);
  }

  if (currentGroup.readings[sensorId]) {
    currentGroup.duplicateSensorTriggers += 1;
    if (signedMicrosDiff(timestampUs, currentGroup.readings[sensorId].timestampUs) < 0) {
      currentGroup.readings[sensorId] = {
        eventId: eventId || currentGroup.readings[sensorId].eventId,
        sensorId,
        timestampUs: Math.round(timestampUs)
      };
    }
    return {
      accepted: false,
      duplicateSensorInGroup: true,
      status: 'DUPLICATE_SENSOR_IN_GROUP',
      groupingState: 'WAITING_OTHER_SENSORS',
      reason: 'SENSOR_ALREADY_TRIGGERED_IN_GROUP',
      message: `Disparo repetido do sensor ${sensorId} dentro da mesma janela temporal ignorado (preservado primeiro pulso).`,
      groupId: currentGroup.groupId,
      presentSensors: Object.keys(currentGroup.readings),
      finalizedPreviousGroup
    };
  }

  currentGroup.readings[sensorId] = {
    eventId: eventId || `${deviceId}_${sensorId}_${timestampUs}`,
    sensorId,
    timestampUs: Math.round(timestampUs)
  };
  if (eventId) currentGroup.lastEventId = eventId;
  if (signedMicrosDiff(timestampUs, currentGroup.firstTimestampUs) < 0) {
    currentGroup.firstTimestampUs = Math.round(timestampUs);
  }

  const presentSensors = Object.keys(currentGroup.readings);
  if (presentSensors.length === 3) {
    pendingGroupsByDevice.delete(deviceId);
    const completedImpact = finalizeGroup(currentGroup, 'ALL_THREE_SENSORS_RECEIVED', cfg);
    return {
      accepted: true,
      status: 'IMPACT_GROUP_COMPLETED',
      groupingState: 'COMPLETE_3_OF_3',
      impact: completedImpact,
      finalizedPreviousGroup
    };
  }

  return {
    accepted: true,
    status: 'READING_BUFFERED',
    groupingState: 'WAITING_OTHER_SENSORS',
    groupId: currentGroup.groupId,
    presentSensors,
    missingSensors: ['S1', 'S2', 'S3'].filter((s) => !currentGroup.readings[s]),
    finalizedPreviousGroup
  };
}

async function ingestArduinoPayload(payload = {}, actor = null) {
  const cfg = await resolveReferenceWallConfig(actor);

  if (
    payload &&
    (payload.t1_us !== undefined || payload.t2_us !== undefined || payload.t3_us !== undefined ||
     payload.t1Us !== undefined || payload.t2Us !== undefined || payload.t3Us !== undefined)
  ) {
    const rawEventId = payload.event_id || payload.eventId || null;
    const sessionId = payload.session_id || payload.sessionId || payload.boot_id || payload.bootId || null;
    const baseEventId = rawEventId && sessionId && !String(rawEventId).includes(String(sessionId))
      ? `${sessionId}_${rawEventId}`
      : rawEventId;
    if (sessionId) connectionState.lastSessionId = sessionId;

    if (baseEventId && processedEventIds.has(String(baseEventId).trim())) {
      return {
        accepted: false,
        duplicate: true,
        status: 'REJECTED_DUPLICATE_EVENT',
        groupingState: 'DUPLICATE_EVENT',
        reason: 'DUPLICATE_EVENT_ID',
        message: `Evento duplicado (${baseEventId}) rejeitado.`
      };
    }

    const deviceId = payload.device_id || payload.deviceId || 'ARDUINO_MAIN';
    const valid = payload.valid !== undefined ? Boolean(payload.valid) : true;
    if (!valid) {
      if (baseEventId) rememberEventId(baseEventId);
      return {
        accepted: false,
        status: 'REJECTED_INVALID_READING',
        groupingState: 'NOISE_REJECTED',
        reason: 'READING_MARKED_INVALID'
      };
    }

    const prev = pendingGroupsByDevice.get(deviceId);
    if (prev) {
      finalizeGroup(prev, 'SUPERSEDED_BY_PACKET', cfg);
      pendingGroupsByDevice.delete(deviceId);
    }

    const isSim = Boolean(payload.is_simulation || payload.isSimulation || deviceId.toUpperCase().includes('SIMULAT'));
    if (!isSim && connectionState.mode !== 'connected') connectionState.mode = 'connected';

    const pairs = [
      ['S1', payload.t1_us ?? payload.t1Us ?? null],
      ['S2', payload.t2_us ?? payload.t2Us ?? null],
      ['S3', payload.t3_us ?? payload.t3Us ?? null]
    ];
    const syntheticReadings = pairs
      .filter(([, ts]) => ts !== null && ts !== undefined && ts !== '')
      .map(([sensor_id, timestamp_us]) => ({
        event_id: baseEventId ? `${baseEventId}_${sensor_id}` : null,
        session_id: sessionId,
        sensor_id,
        timestamp_us,
        device_id: deviceId,
        valid: true,
        is_simulation: isSim
      }));

    if (baseEventId) rememberEventId(baseEventId);
    if (syntheticReadings.length === 0) {
      return { accepted: false, status: 'REJECTED_MALFORMED', groupingState: 'INVALID_FORMAT', reason: 'EMPTY_READINGS' };
    }

    const stepResults = [];
    let completedImpact = null;
    for (const r of syntheticReadings) {
      const res = await ingestSensorReading(r, cfg);
      stepResults.push(res);
      if (res.impact) completedImpact = res.impact;
      if (res.finalizedPreviousGroup && !completedImpact) completedImpact = res.finalizedPreviousGroup;
    }
    if (completedImpact && baseEventId) completedImpact.eventId = baseEventId;

    const leftover = pendingGroupsByDevice.get(deviceId);
    if (leftover) {
      pendingGroupsByDevice.delete(deviceId);
      const incompleteImpact = finalizeGroup(leftover, 'INCOMPLETE_PACKET', cfg);
      return {
        accepted: false,
        status: 'REJECTED_INCOMPLETE_PACKET',
        groupingState: 'INCOMPLETE',
        reason: 'INCOMPLETE_READINGS',
        impact: incompleteImpact,
        steps: stepResults
      };
    }

    if (completedImpact && completedImpact.groupingState !== 'COMPLETE_3_OF_3') {
      return {
        accepted: false,
        status: 'REJECTED_OUT_OF_WINDOW',
        groupingState: completedImpact.groupingState,
        reason: 'READINGS_OUTSIDE_GROUPING_WINDOW',
        impact: completedImpact,
        steps: stepResults
      };
    }

    return {
      accepted: true,
      status: 'PACKET_PROCESSED',
      groupingState: completedImpact ? completedImpact.groupingState : 'COMPLETE_3_OF_3',
      impact: completedImpact,
      steps: stepResults
    };
  }

  if (Array.isArray(payload?.readings)) {
    const results = [];
    let lastImpact = null;
    for (const r of payload.readings) {
      const res = await ingestSensorReading(r, cfg);
      results.push(res);
      if (res.impact) lastImpact = res.impact;
      else if (res.finalizedPreviousGroup) lastImpact = res.finalizedPreviousGroup;
    }

    if (payload.finalize_pending || payload.finalizePending) {
      const flushed = await flushPendingGroups(cfg);
      if (flushed.length > 0 && !lastImpact) lastImpact = flushed[flushed.length - 1];
    }

    const allAccepted = results.length > 0 && results.every((r) => r.accepted);
    return {
      accepted: Boolean(lastImpact && lastImpact.groupingState === 'COMPLETE_3_OF_3') || allAccepted,
      status: lastImpact ? lastImpact.groupingState : 'BATCH_PROCESSED',
      groupingState: lastImpact ? lastImpact.groupingState : 'WAITING_OTHER_SENSORS',
      impact: lastImpact,
      results
    };
  }

  const singleRes = await ingestSensorReading(payload, cfg);
  if ((payload?.finalize_pending || payload?.finalizePending) && pendingGroupsByDevice.size > 0) {
    const flushed = await flushPendingGroups(cfg);
    if (flushed.length > 0) {
      return {
        ...singleRes,
        accepted: false,
        status: 'REJECTED_INCOMPLETE_READING',
        groupingState: 'INCOMPLETE',
        reason: 'INCOMPLETE_READINGS',
        impact: flushed[0]
      };
    }
  }
  return singleRes;
}

async function flushPendingGroups(wallCfg = null, maxAgeMs = 0) {
  const cfg = wallCfg || (await resolveReferenceWallConfig());
  const now = Date.now();
  const flushed = [];
  for (const [deviceId, grp] of pendingGroupsByDevice.entries()) {
    if (maxAgeMs <= 0 || now - grp.createdAtMs >= maxAgeMs) {
      pendingGroupsByDevice.delete(deviceId);
      flushed.push(finalizeGroup(grp, 'WINDOW_EXPIRED_INCOMPLETE', cfg));
    }
  }
  return flushed;
}

function setHardwareConnectionMode(mode, extra = {}) {
  if (mode === 'simulation' || mode === 'connected') connectionState.mode = mode;
  if (extra.port) connectionState.port = String(extra.port);
  if (extra.baudRate) connectionState.baudRate = Number(extra.baudRate);
  return { ...connectionState };
}

async function getIotDiagnosticsState(actor = null) {
  const wallCfg = await resolveReferenceWallConfig(actor);
  await flushPendingGroups(wallCfg, 250);

  return {
    wall: {
      preset: wallCfg.preset,
      label: wallCfg.label,
      shortLabel: wallCfg.shortLabel,
      widthM: wallCfg.widthM,
      heightM: wallCfg.heightM,
      aspectRatio: wallCfg.aspectRatio,
      bottomRightHasSensor: true,
      topRightHasSensor: false
    },
    sensors: wallCfg.sensors,
    sensorList: wallCfg.sensorList,
    sensorOffsetsCm: wallCfg.sensorOffsetsCm,
    calibration: wallCfg.calibration,
    hardwareConnection: {
      ...connectionState,
      statusLabel: connectionState.mode === 'connected' ? 'Conectado (Arduino / Serial)' : 'Modo Simulação (Sem dependência obrigatória de hardware)'
    },
    pendingGroups: Array.from(pendingGroupsByDevice.values()).map((g) => ({
      groupId: g.groupId,
      deviceId: g.deviceId,
      firstTimestampUs: g.firstTimestampUs,
      presentSensors: Object.keys(g.readings),
      missingSensors: ['S1', 'S2', 'S3'].filter((s) => !g.readings[s])
    })),
    lastArduinoEvent: lastHardwareDiagnostic,
    lastSimulatedImpact: lastSimulatedDiagnostic,
    recentEvents: diagnosticHistory.slice(0, 15)
  };
}

module.exports = {
  recordSimulatedImpactDiagnostic,
  ingestArduinoPayload,
  setHardwareConnectionMode,
  getIotDiagnosticsState
};
