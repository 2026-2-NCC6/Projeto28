
#include <Arduino.h>

// -----------------------------------------------------------------------------
// DEFINIÇÃO DE PINOS
// -----------------------------------------------------------------------------
const uint8_t PIN_S1 = 2; // INT0 (Interrupção externa por hardware)
const uint8_t PIN_S2 = 3; // INT1 (Interrupção externa por hardware)
const uint8_t PIN_S3 = 4; // PCINT20 (Pin Change Interrupt no Port D)
const uint8_t PIN_LED = 13; // LED indicador de status onboard

// -----------------------------------------------------------------------------
// PARÂMETROS TEMPORAIS CONFIGURÁVEIS (EM MICROSSEGUNDOS)
// -----------------------------------------------------------------------------
// Tempo refratário por sensor: ignora rebotes/chatter do comparador durante o eco
const unsigned long SENSOR_REFRACTORY_US = 35000UL; // 35 ms

// Janela máxima para agrupar leituras de um mesmo impacto físico
unsigned long groupingWindowUs = 25000UL; // 25 ms (compatível com backend)

// Janela refratária global após fechar um impacto completo
const unsigned long GLOBAL_COOLDOWN_US = 50000UL; // 50 ms

// -----------------------------------------------------------------------------
// ESTRUTURAS E BUFFER CIRCULAR PARA TRANSFERÊNCIA ISR -> LOOP
// -----------------------------------------------------------------------------
struct RawDetection {
  uint8_t sensorId;       // 1 = S1, 2 = S2, 3 = S3
  unsigned long timestampUs;
};

const uint8_t QUEUE_SIZE = 32;
volatile RawDetection eventQueue[QUEUE_SIZE];
volatile uint8_t queueHead = 0;
volatile uint8_t queueTail = 0;
volatile uint16_t queueOverflowCount = 0;

// Timestamps voláteis do último disparo (para filtro refratário dentro das ISRs)
volatile unsigned long lastIsrUs_S1 = 0;
volatile unsigned long lastIsrUs_S2 = 0;
volatile unsigned long lastIsrUs_S3 = 0;

// Estado anterior do pino D4 para detecção precisa de borda no PCINT
volatile uint8_t lastPin4State = HIGH;

// Configuração de polaridade (padrão LOW para KY-037)
volatile uint8_t activeLevel = LOW;

// Contadores de diagnóstico acumulados
unsigned long totalDetectionsS1 = 0;
unsigned long totalDetectionsS2 = 0;
unsigned long totalDetectionsS3 = 0;
unsigned long repeatedTriggersIgnored = 0;
unsigned long impactsCompletedCount = 0;
unsigned long impactsIncompleteCount = 0;

unsigned long lastSeenUsS1 = 0;
unsigned long lastSeenUsS2 = 0;
unsigned long lastSeenUsS3 = 0;

// Modo de saída serial:
// false = CSV Stream estruturado (para ponte serial / Node.js)
// true  = Monitor textual legível (para humanos no Serial Monitor do Arduino IDE)
bool verboseMonitorMode = false;

// Identificador sequencial de eventos
unsigned long nextEventId = 1000;
unsigned long nextImpactId = 5000;

// -----------------------------------------------------------------------------
// ESTADO DE AGRUPAMENTO NO LOOP
// -----------------------------------------------------------------------------
struct ActiveImpactGroup {
  bool active;
  unsigned long impactId;
  unsigned long firstTimestampUs;
  unsigned long t1Us;
  unsigned long t2Us;
  unsigned long t3Us;
  bool hasS1;
  bool hasS2;
  bool hasS3;
  uint8_t count;
};

ActiveImpactGroup currentImpact = { false, 0, 0, 0, 0, 0, false, false, false, 0 };
unsigned long lastImpactFinishedAtUs = 0;

// -----------------------------------------------------------------------------
// ROTINAS DE INTERRUPÇÃO (ISRs RÁPIDAS — ZERO SERIAL DENTRO DA ISR)
// -----------------------------------------------------------------------------

// ISR do Sensor 1 (Pino D2 - INT0)
void isrSensor1() {
  unsigned long now = micros();
  if (digitalRead(PIN_S1) == activeLevel) {
    if ((now - lastIsrUs_S1) >= SENSOR_REFRACTORY_US || lastIsrUs_S1 == 0) {
      lastIsrUs_S1 = now;
      uint8_t nextHead = (queueHead + 1) % QUEUE_SIZE;
      if (nextHead != queueTail) {
        eventQueue[queueHead].sensorId = 1;
        eventQueue[queueHead].timestampUs = now;
        queueHead = nextHead;
      } else {
        queueOverflowCount++;
      }
    }
  }
}

// ISR do Sensor 2 (Pino D3 - INT1)
void isrSensor2() {
  unsigned long now = micros();
  if (digitalRead(PIN_S2) == activeLevel) {
    if ((now - lastIsrUs_S2) >= SENSOR_REFRACTORY_US || lastIsrUs_S2 == 0) {
      lastIsrUs_S2 = now;
      uint8_t nextHead = (queueHead + 1) % QUEUE_SIZE;
      if (nextHead != queueTail) {
        eventQueue[queueHead].sensorId = 2;
        eventQueue[queueHead].timestampUs = now;
        queueHead = nextHead;
      } else {
        queueOverflowCount++;
      }
    }
  }
}

// ISR do Sensor 3 (Pino D4 - PCINT20 no Port D)
// Nota técnica: O Arduino Uno só tem INT0 (D2) e INT1 (D3). O pino D4 utiliza
// Pin Change Interrupt (PCIE2 / PCINT20) com leitura direta do registrador PIND.
ISR(PCINT2_vect) {
  unsigned long now = micros();
  uint8_t pinState = (PIND & (1 << PIND4)) ? HIGH : LOW;

  // Dispara apenas na transição para o nível ativo (borda desejada)
  if (pinState == activeLevel && lastPin4State != activeLevel) {
    if ((now - lastIsrUs_S3) >= SENSOR_REFRACTORY_US || lastIsrUs_S3 == 0) {
      lastIsrUs_S3 = now;
      uint8_t nextHead = (queueHead + 1) % QUEUE_SIZE;
      if (nextHead != queueTail) {
        eventQueue[queueHead].sensorId = 3;
        eventQueue[queueHead].timestampUs = now;
        queueHead = nextHead;
      } else {
        queueOverflowCount++;
      }
    }
  }
  lastPin4State = pinState;
}

// -----------------------------------------------------------------------------
// CONFIGURAÇÃO DOS PINOS E INTERRUPÇÕES
// -----------------------------------------------------------------------------
void setupInterrupts() {
  // Configura pinos como entrada com pull-up interno para garantir nível estável
  pinMode(PIN_S1, INPUT_PULLUP);
  pinMode(PIN_S2, INPUT_PULLUP);
  pinMode(PIN_S3, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);

  // Anexa interrupções externas para D2 (INT0) e D3 (INT1)
  int mode = (activeLevel == LOW) ? FALLING : RISING;
  attachInterrupt(digitalPinToInterrupt(PIN_S1), isrSensor1, mode);
  attachInterrupt(digitalPinToInterrupt(PIN_S2), isrSensor2, mode);

  // Configura Pin Change Interrupt para D4 (PCINT20)
  cli(); // Desativa interrupções globais temporariamente
  PCICR |= (1 << PCIE2);    // Habilita interrupção de mudança de pino para Port D (PCINT16..23)
  PCMSK2 |= (1 << PCINT20); // Mascara apenas o pino digital 4 (PCINT20)
  lastPin4State = digitalRead(PIN_S3);
  sei(); // Reativa interrupções globais
}

// -----------------------------------------------------------------------------
// EMISSÃO DE MENSAGENS ESTRUTURADAS SERIAL
// -----------------------------------------------------------------------------

void printEventCsv(unsigned long evtId, uint8_t sId, unsigned long tsUs) {
  // Formato estruturado compatível com a ponte serial e backend Node.js:
  // EVENT,eventId,sensorId,timestampUs
  Serial.print(F("EVENT,"));
  Serial.print(evtId);
  Serial.print(F(",S"));
  Serial.print(sId);
  Serial.print(F(","));
  Serial.println(tsUs);
}

void printImpactCsv(unsigned long impId, unsigned long t1, unsigned long t2, unsigned long t3, uint8_t count) {
  // Formato estruturado de pacote consolidado de impacto:
  // IMPACT,impactId,t1_us,t2_us,t3_us,sensorCount
  // Valores não detectados são informados como 0 (sem fabricar timestamps fictícios)
  Serial.print(F("IMPACT,"));
  Serial.print(impId);
  Serial.print(F(","));
  Serial.print(t1);
  Serial.print(F(","));
  Serial.print(t2);
  Serial.print(F(","));
  Serial.print(t3);
  Serial.print(F(","));
  Serial.println(count);
}

void finalizeCurrentImpact(const char* reason) {
  if (!currentImpact.active) return;

  if (currentImpact.count == 3) {
    impactsCompletedCount++;
    digitalWrite(PIN_LED, HIGH);
    if (verboseMonitorMode) {
      Serial.println(F("\n=================================================="));
      Serial.print(F("🎾 IMPACTO DETECTADO (3/3 SENSORES) - ID: #"));
      Serial.println(currentImpact.impactId);
      Serial.print(F("  S1 (Canto Inf. Esq.): ")); Serial.print(currentImpact.t1Us); Serial.println(F(" us"));
      Serial.print(F("  S2 (Canto Sup. Esq.): ")); Serial.print(currentImpact.t2Us); Serial.println(F(" us"));
      Serial.print(F("  S3 (Canto Inf. Dir.): ")); Serial.print(currentImpact.t3Us); Serial.println(F(" us"));
      long dt21 = (long)(currentImpact.t2Us - currentImpact.t1Us);
      long dt31 = (long)(currentImpact.t3Us - currentImpact.t1Us);
      Serial.print(F("  Diferencas de tempo: dt21=")); Serial.print(dt21);
      Serial.print(F(" us | dt31=")); Serial.print(dt31); Serial.println(F(" us"));
      Serial.println(F("=================================================="));
    } else {
      printImpactCsv(currentImpact.impactId, currentImpact.t1Us, currentImpact.t2Us, currentImpact.t3Us, 3);
    }
  } else {
    impactsIncompleteCount++;
    if (verboseMonitorMode) {
      Serial.print(F("[AVISO] Leitura incompleta descartada ("));
      Serial.print(currentImpact.count);
      Serial.print(F("/3) - "));
      Serial.println(reason);
    } else {
      // Registra pacote incompleto sem inventar dados
      printImpactCsv(
        currentImpact.impactId,
        currentImpact.hasS1 ? currentImpact.t1Us : 0UL,
        currentImpact.hasS2 ? currentImpact.t2Us : 0UL,
        currentImpact.hasS3 ? currentImpact.t3Us : 0UL,
        currentImpact.count
      );
    }
  }

  currentImpact.active = false;
  lastImpactFinishedAtUs = micros();
  digitalWrite(PIN_LED, LOW);
}

// -----------------------------------------------------------------------------
// RELATÓRIO DE DIAGNÓSTICO DE BANCADA
// -----------------------------------------------------------------------------
void printDiagnosticSnapshot() {
  unsigned long now = micros();
  uint8_t rawS1 = digitalRead(PIN_S1);
  uint8_t rawS2 = digitalRead(PIN_S2);
  uint8_t rawS3 = digitalRead(PIN_S3);

  Serial.println(F("\n========================================================"));
  Serial.println(F("   MOTION TENNIS — DIAGNOSTICO DE BANCADA (3x KY-037)  "));
  Serial.println(F("========================================================"));
  Serial.print(F("Tempo microcontrolador: ")); Serial.print(now / 1000UL); Serial.println(F(" ms"));
  Serial.print(F("Polaridade ativa:       ")); Serial.println(activeLevel == LOW ? F("LOW (0V / Borda Descida)") : F("HIGH (5V / Borda Subida)"));
  Serial.print(F("Modo de saida serial:   ")); Serial.println(verboseMonitorMode ? F("Monitor Textual") : F("CSV Stream (Producao)"));
  Serial.print(F("Janela de agrupamento:  ")); Serial.print(groupingWindowUs); Serial.println(F(" us"));
  Serial.println(F("--------------------------------------------------------"));
  
  // Status de cada sensor
  Serial.print(F("S1 (D2 - Inf. Esq.): Cont=")); Serial.print(totalDetectionsS1);
  Serial.print(F(" | Sinal atual=")); Serial.print(rawS1 == LOW ? F("LOW") : F("HIGH"));
  if (rawS1 == activeLevel) Serial.print(F(" [ALERTA: DISPARADO/PRESO - REGULAR TRIMPOT]"));
  else Serial.print(F(" [OK - Repouso]"));
  Serial.println();

  Serial.print(F("S2 (D3 - Sup. Esq.): Cont=")); Serial.print(totalDetectionsS2);
  Serial.print(F(" | Sinal atual=")); Serial.print(rawS2 == LOW ? F("LOW") : F("HIGH"));
  if (rawS2 == activeLevel) Serial.print(F(" [ALERTA: DISPARADO/PRESO - REGULAR TRIMPOT]"));
  else Serial.print(F(" [OK - Repouso]"));
  Serial.println();

  Serial.print(F("S3 (D4 - Inf. Dir.): Cont=")); Serial.print(totalDetectionsS3);
  Serial.print(F(" | Sinal atual=")); Serial.print(rawS3 == LOW ? F("LOW") : F("HIGH"));
  if (rawS3 == activeLevel) Serial.print(F(" [ALERTA: DISPARADO/PRESO - REGULAR TRIMPOT]"));
  else Serial.print(F(" [OK - Repouso]"));
  Serial.println();

  Serial.println(F("--------------------------------------------------------"));
  Serial.print(F("Impactos completos (3/3):   ")); Serial.println(impactsCompletedCount);
  Serial.print(F("Impactos incompletos:       ")); Serial.println(impactsIncompleteCount);
  Serial.print(F("Disparos repetidos filtrados: ")); Serial.println(repeatedTriggersIgnored);
  Serial.print(F("Perdas por fila cheia:      ")); Serial.println(queueOverflowCount);
  Serial.println(F("========================================================\n"));
}

void printHelpMenu() {
  Serial.println(F("\n--- COMANDOS DISPONIVEIS NO SERIAL MONITOR ---"));
  Serial.println(F("  ? ou H : Exibe este menu de ajuda"));
  Serial.println(F("  D      : Exibe o relatorio de diagnostico e estado dos sensores"));
  Serial.println(F("  M      : Alterna entre saida CSV estruturada e modo Monitor textual"));
  Serial.println(F("  R      : Zera contadores estatisticos de teste"));
  Serial.println(F("  P      : Inverte polaridade ativa (LOW <-> HIGH)"));
  Serial.println(F("  1      : Simula pulso de teste de bancada no Sensor 1"));
  Serial.println(F("  2      : Simula pulso de teste de bancada no Sensor 2"));
  Serial.println(F("  3      : Simula pulso de teste de bancada no Sensor 3"));
  Serial.println(F("----------------------------------------------\n"));
}

// -----------------------------------------------------------------------------
// PROCESSAMENTO DE COMANDOS DIGITADOS NA SERIAL
// -----------------------------------------------------------------------------
void handleSerialCommands() {
  while (Serial.available() > 0) {
    char cmd = (char)Serial.read();
    if (cmd == '\r' || cmd == '\n' || cmd == ' ') continue;

    switch (cmd) {
      case '?':
      case 'h':
      case 'H':
        printHelpMenu();
        break;

      case 'd':
      case 'D':
        printDiagnosticSnapshot();
        break;

      case 'm':
      case 'M':
        verboseMonitorMode = !verboseMonitorMode;
        Serial.print(F("Modo de saida alterado para: "));
        Serial.println(verboseMonitorMode ? F("Monitor Textual Legivel") : F("CSV Stream Estruturado (EVENT/IMPACT)"));
        break;

      case 'r':
      case 'R':
        totalDetectionsS1 = 0;
        totalDetectionsS2 = 0;
        totalDetectionsS3 = 0;
        repeatedTriggersIgnored = 0;
        impactsCompletedCount = 0;
        impactsIncompleteCount = 0;
        queueOverflowCount = 0;
        Serial.println(F("[RESET] Contadores de diagnostico zerados."));
        break;

      case 'p':
      case 'P':
        activeLevel = (activeLevel == LOW) ? HIGH : LOW;
        setupInterrupts();
        Serial.print(F("[POLARIDADE] Nivel ativo alterado para: "));
        Serial.println(activeLevel == LOW ? F("LOW (0V)") : F("HIGH (5V)"));
        break;

      // Comandos de simulação sintética de bancada (para testes sem raquete)
      case '1': {
        uint8_t nextHead = (queueHead + 1) % QUEUE_SIZE;
        eventQueue[queueHead].sensorId = 1;
        eventQueue[queueHead].timestampUs = micros();
        queueHead = nextHead;
        Serial.println(F("[TESTE] Disparo simulado injetado em S1"));
        break;
      }
      case '2': {
        uint8_t nextHead = (queueHead + 1) % QUEUE_SIZE;
        eventQueue[queueHead].sensorId = 2;
        eventQueue[queueHead].timestampUs = micros();
        queueHead = nextHead;
        Serial.println(F("[TESTE] Disparo simulado injetado em S2"));
        break;
      }
      case '3': {
        uint8_t nextHead = (queueHead + 1) % QUEUE_SIZE;
        eventQueue[queueHead].sensorId = 3;
        eventQueue[queueHead].timestampUs = micros();
        queueHead = nextHead;
        Serial.println(F("[TESTE] Disparo simulado injetado em S3"));
        break;
      }

      default:
        Serial.print(F("Comando desconhecido: '"));
        Serial.print(cmd);
        Serial.println(F("'. Digite '?' para ajuda."));
        break;
    }
  }
}

// -----------------------------------------------------------------------------
// SETUP PRINCIPAL
// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 2500) {
    // Aguarda conexão da porta USB nativa em alguns clones/placas
  }

  setupInterrupts();

  Serial.println(F("\n========================================================"));
  Serial.println(F("  MOTION TENNIS — FIRMWARE DE SENSORES KY-037 ONLINE    "));
  Serial.println(F("  Mapeamento: S1->D2(INT0) | S2->D3(INT1) | S3->D4(PCINT)"));
  Serial.println(F("  Baud Rate:  115200 | Resolucao micros(): ~4 us         "));
  Serial.println(F("  Digite '?' no Serial Monitor para exibir os comandos   "));
  Serial.println(F("========================================================"));

  // Emite um banner inicial em CSV para verificação de conexão pelo software receptor
  Serial.println(F("STATUS,READY,ARDUINO_UNO,115200,S1_D2,S2_D3,S3_D4"));
}

// -----------------------------------------------------------------------------
// LOOP PRINCIPAL
// -----------------------------------------------------------------------------
void loop() {
  // 1. Processa comandos recebidos pela porta serial
  handleSerialCommands();

  // 2. Esvazia a fila de eventos capturados de forma atômica
  RawDetection currentEvent;
  bool hasEvent = false;

  cli();
  if (queueHead != queueTail) {
    currentEvent.sensorId = eventQueue[queueTail].sensorId;
    currentEvent.timestampUs = eventQueue[queueTail].timestampUs;
    queueTail = (queueTail + 1) % QUEUE_SIZE;
    hasEvent = true;
  }
  sei();

  unsigned long nowUs = micros();

  // 3. Processa novo evento se retirado da fila
  if (hasEvent) {
    unsigned long evtId = nextEventId++;

    if (currentEvent.sensorId == 1) {
      totalDetectionsS1++;
      lastSeenUsS1 = currentEvent.timestampUs;
    } else if (currentEvent.sensorId == 2) {
      totalDetectionsS2++;
      lastSeenUsS2 = currentEvent.timestampUs;
    } else if (currentEvent.sensorId == 3) {
      totalDetectionsS3++;
      lastSeenUsS3 = currentEvent.timestampUs;
    }

    // Emite linha de evento individual
    if (!verboseMonitorMode) {
      printEventCsv(evtId, currentEvent.sensorId, currentEvent.timestampUs);
    } else {
      Serial.print(F("[EVENTO] Sensor S"));
      Serial.print(currentEvent.sensorId);
      Serial.print(F(" disparou em "));
      Serial.print(currentEvent.timestampUs);
      Serial.println(F(" us"));
    }

    // 4. Lógica de agrupamento por janela temporal (TDOA)
    if (!currentImpact.active) {
      // Inicia novo grupo de impacto com a primeira leitura que chegou
      currentImpact.active = true;
      currentImpact.impactId = nextImpactId++;
      currentImpact.firstTimestampUs = currentEvent.timestampUs;
      currentImpact.t1Us = 0;
      currentImpact.t2Us = 0;
      currentImpact.t3Us = 0;
      currentImpact.hasS1 = false;
      currentImpact.hasS2 = false;
      currentImpact.hasS3 = false;
      currentImpact.count = 0;
    }

    // Verifica se a leitura ainda está dentro da janela de agrupamento do impacto ativo
    long dtFromFirst = (long)(currentEvent.timestampUs - currentImpact.firstTimestampUs);

    if (dtFromFirst >= 0 && (unsigned long)dtFromFirst <= groupingWindowUs) {
      // Sensor 1
      if (currentEvent.sensorId == 1) {
        if (!currentImpact.hasS1) {
          currentImpact.hasS1 = true;
          currentImpact.t1Us = currentEvent.timestampUs;
          currentImpact.count++;
        } else {
          repeatedTriggersIgnored++;
        }
      }
      // Sensor 2
      else if (currentEvent.sensorId == 2) {
        if (!currentImpact.hasS2) {
          currentImpact.hasS2 = true;
          currentImpact.t2Us = currentEvent.timestampUs;
          currentImpact.count++;
        } else {
          repeatedTriggersIgnored++;
        }
      }
      // Sensor 3
      else if (currentEvent.sensorId == 3) {
        if (!currentImpact.hasS3) {
          currentImpact.hasS3 = true;
          currentImpact.t3Us = currentEvent.timestampUs;
          currentImpact.count++;
        } else {
          repeatedTriggersIgnored++;
        }
      }

      // Se os 3 sensores já responderam, finaliza o grupo imediatamente
      if (currentImpact.count == 3) {
        finalizeCurrentImpact("COMPLETO_3_DE_3");
      }
    } else {
      // O evento recebido ultrapassou a janela temporal do impacto anterior!
      // Finaliza o impacto anterior como incompleto e inicia um novo com a leitura atual
      finalizeCurrentImpact("EXPIRADO_JANELA_TEMPORAL");

      currentImpact.active = true;
      currentImpact.impactId = nextImpactId++;
      currentImpact.firstTimestampUs = currentEvent.timestampUs;
      currentImpact.t1Us = (currentEvent.sensorId == 1) ? currentEvent.timestampUs : 0UL;
      currentImpact.t2Us = (currentEvent.sensorId == 2) ? currentEvent.timestampUs : 0UL;
      currentImpact.t3Us = (currentEvent.sensorId == 3) ? currentEvent.timestampUs : 0UL;
      currentImpact.hasS1 = (currentEvent.sensorId == 1);
      currentImpact.hasS2 = (currentEvent.sensorId == 2);
      currentImpact.hasS3 = (currentEvent.sensorId == 3);
      currentImpact.count = 1;
    }
  }

  // 5. Timeout da janela de agrupamento: fecha impacto que ficou incompleto após expirar o tempo
  if (currentImpact.active) {
    long elapsedSinceFirst = (long)(nowUs - currentImpact.firstTimestampUs);
    if (elapsedSinceFirst > (long)groupingWindowUs) {
      finalizeCurrentImpact("TIMEOUT_JANELA_SEM_OUTROS_SENSORES");
    }
  }
}
