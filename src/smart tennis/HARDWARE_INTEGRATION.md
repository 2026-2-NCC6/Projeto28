# 🔌 GUIA DE INTEGRAÇÃO DE HARDWARE — MOTION TENNIS

Este documento descreve detalhadamente como conectar o equipamento físico de treinamento (com microcontroladores **ESP32**, **Arduino**, **Raspberry Pi Pico** ou outros sensores) ao sistema **Motion Tennis**.

---

## 1. Visão Geral da Comunicação

O Motion Tennis disponibiliza duas formas principais de integração com o hardware físico:

1. **Via Wi-Fi / Rede Local (HTTP REST ou WebSocket)**:
   - Recomendado para **ESP32** ou **Raspberry Pi Pico W**.
   - O microcontrolador envia requisições HTTP POST diretamente para o servidor local.
2. **Via Cabo USB / Serial**:
   - Recomendado para **Arduino Uno/Mega/Nano**.
   - O Arduino envia os dados via porta serial (`COM3`, `COM4`, etc.) e um script leve de ponte (Python ou Node.js) encaminha para o Motion Tennis.

---

## 2. Especificação do Endpoint

### `POST /api/hardware/hit`

- **URL Local**: `http://127.0.0.1:3000/api/hardware/hit`
- **Método**: `POST`
- **Cabeçalhos**:
  - `Content-Type: application/json`

#### Formato do Payload JSON:

```json
{
  "sensor_id": 5,
  "speed": 98.4,
  "game_mode": "free",
  "equipment_id": 1,
  "user_id": 1
}
```

#### Descrição dos Campos:
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `sensor_id` | Número (1 a 11) | **Recomendado** | Número do sensor físico atingido (1 a 11). Sensor 5 é o Bullseye central. |
| `x`, `y` | Número (Float) | Alternativo | Coordenadas percentuais (0 a 100) caso use matriz resistiva ou câmera. |
| `speed` ou `force` | Número (Float) | Não | Velocidade do golpe em km/h ou intensidade do piezo. Padrão: 80. |
| `game_mode` | String | Não | Modo atual: `"free"` (livre), `"single"` (alvo único) ou `"clear_all"`. |
| `equipment_id` | Número | Não | ID do equipamento Motion Tennis (Padrão: 1). |
| `user_id` | Número | Não | ID do usuário/atleta associado (Padrão: 1). |

#### Exemplo de Resposta de Sucesso (`201 Created`):

```json
{
  "success": true,
  "message": "Jogada de hardware computada com sucesso",
  "data": {
    "shot": {
      "id": 142,
      "x": 50.2,
      "y": 48.9,
      "zone": "Centro / Na Mosca",
      "zone_id": 5,
      "force": 92.4,
      "score": 105,
      "is_hit": 1,
      "is_bullseye": 1,
      "source": "hardware",
      "sensor_id": "HW-ESP32-01",
      "created_at": "2026-10-01T17:30:00.000Z"
    },
    "player": {
      "level": 12,
      "title": "Competidor",
      "xp": 2500,
      "precision": 82.2,
      "total_shots": 436,
      "total_hits": 358
    }
  }
}
```

---

## 3. Código Exemplo para ESP32 (Wi-Fi HTTP)

Grave este código diretamente no seu microcontrolador ESP32 através da Arduino IDE ou PlatformIO.

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> // Instalar biblioteca ArduinoJson via Library Manager

// Configurações de Rede
const char* ssid = "SUA_REDE_WIFI";
const char* password = "SUA_SENHA_WIFI";

// Endereço do Servidor Motion Tennis (IP do computador na rede local)
const char* serverUrl = "http://192.168.1.100:3000/api/hardware/hit";

// Pinos dos Sensores Piezoelétricos (Matriz ou Analógicos)
const int PIEZO_PIN_CENTER = 34;
const int PIEZO_PIN_TOP = 35;
const int PIEZO_PIN_BOTTOM = 32;

const int THRESHOLD = 350; // Limiar de impacto para evitar falsos positivos

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("[MOTION TENNIS] Conectando ao Wi-Fi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[MOTION TENNIS] Wi-Fi Conectado!");
  Serial.print("IP ESP32: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  int centerVal = analogRead(PIEZO_PIN_CENTER);

  // Se detectar impacto acima do limiar
  if (centerVal > THRESHOLD) {
    Serial.print("[IMPACTO] Valor detectado: ");
    Serial.println(centerVal);

    // Triangulação básica ou estimativa de coordenadas (exemplo no centro)
    float coordX = 50.0 + ((float)random(-8, 8));
    float coordY = 50.0 + ((float)random(-8, 8));
    float speedKmh = map(centerVal, THRESHOLD, 4095, 65, 125);

    sendHitToServer(coordX, coordY, speedKmh, "ESP32-PIEZO-01");

    // Debounce para não registrar múltiplos impactos da mesma bola
    delay(400);
  }
  delay(10);
}

void sendHitToServer(float x, float y, float speed, const char* sensorId) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<200> doc;
    doc["x"] = x;
    doc["y"] = y;
    doc["speed"] = speed;
    doc["sensor_id"] = sensorId;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);

    if (httpResponseCode > 0) {
      Serial.print("[HTTP OK] Resposta: ");
      Serial.println(httpResponseCode);
    } else {
      Serial.print("[HTTP ERRO] Falha no envio: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  } else {
    Serial.println("[AVISO] Wi-Fi desconectado!");
  }
}
```

---

## 4. Código Exemplo para Arduino (Serial USB)

Para placas conectadas via cabo USB (Arduino Uno, Nano, Mega):

```cpp
// Código Arduino Uno: Leitura de Piezo e envio via Serial
const int SENSOR_PIN = A0;
const int THRESHOLD = 120;

void setup() {
  Serial.begin(115200);
}

void loop() {
  int sensorValue = analogRead(SENSOR_PIN);

  if (sensorValue > THRESHOLD) {
    // Calcula velocidade aproximada baseada na tensão de pico
    float speed = map(sensorValue, THRESHOLD, 1023, 60, 120);

    // Formato CSV simples: X,Y,VELOCIDADE,SENSOR_ID
    // Exemplo: 50.0,50.0,85.5,ARDUINO-01
    Serial.print("50.0,50.0,");
    Serial.print(speed);
    Serial.println(",ARDUINO-01");

    delay(350); // Debounce
  }
  delay(5);
}
```

---

## 5. Script de Ponte Serial USB (Python Bridge)

Caso utilize o Arduino via porta COM, salve este script como `serial_bridge.py` para encaminhar automaticamente os dados para o Motion Tennis:

```python
import serial
import requests
import time

# Configurações da Porta Serial e Servidor
SERIAL_PORT = 'COM3' # Ajuste para a porta do seu Arduino no Gerenciador de Dispositivos
BAUD_RATE = 115200
API_URL = 'http://127.0.0.1:3000/api/hardware/hit'

print(f"[BRIDGE] Conectando à porta {SERIAL_PORT}...")
try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    time.sleep(2)
    print("[BRIDGE] Conexão serial estabelecida. Aguardando impactos do Motion Tennis...")

    while True:
        line = ser.readline().decode('utf-8', errors='ignore').strip()
        if line:
            # Formato esperado: X,Y,VELOCIDADE,SENSOR_ID
            parts = line.split(',')
            if len(parts) >= 3:
                payload = {
                    "x": float(parts[0]),
                    "y": float(parts[1]),
                    "speed": float(parts[2]),
                    "sensor_id": parts[3] if len(parts) > 3 else "ARDUINO-SERIAL"
                }
                try:
                    resp = requests.post(API_URL, json=payload, timeout=1)
                    print(f"[IMPACTO ENVIADO] X={payload['x']} Y={payload['y']} Vel={payload['speed']} km/h -> Status {resp.status_code}")
                except Exception as e:
                    print(f"[ERRO API] Não foi possível enviar para o Motion Tennis: {e}")

except serial.SerialException as e:
    print(f"[ERRO SERIAL] Não foi possível abrir {SERIAL_PORT}: {e}")
```

---

## 6. Mapeamento dos Sensores no Alvo (Zonas 1 a 9)

O alvo de treinamento do Motion Tennis é dividido em uma grade de coordenadas normalizadas de 0 a 100:

```
(0, 0) ────────────────────────────────── (100, 0)
  │    ZONA 1      │    ZONA 2      │    ZONA 3    │
  │ Sup. Esquerda  │ Sup. Centro    │ Sup. Direita │
  ├────────────────┼────────────────┼──────────────┤
  │    ZONA 4      │    ZONA 5      │    ZONA 6    │
  │ Meio Esquerda  │ NA MOSCA (50)  │ Meio Direita │
  ├────────────────┼────────────────┼──────────────┤
  │    ZONA 7      │    ZONA 8      │    ZONA 9    │
  │ Inf. Esquerda  │ Fundo Centro   │ Inf. Direita │
(0, 100) ──────────────────────────────── (100, 100)
```

- **Centro / Na Mosca**: Círculo com raio de 12 unidades ao redor de `(50.0, 50.0)`. Concede pontuação máxima (100 pts) e +50 XP.
- **Cantos Estratégicos (1, 3, 7, 9)**: Golpes de alta precisão (85 a 90 pts) com foco nos atributos de Controle e Precisão.
