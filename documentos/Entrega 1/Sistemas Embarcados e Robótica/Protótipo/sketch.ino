#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// Instancia da IMU
Adafruit_MPU6050 mpu;

// Definicao dos pinos no ESP32-C3
#define PIN_SDA 8
#define PIN_SCL 9
#define PIN_BUTTON 3
#define PIN_INT 4

// Parametros de amostragem
const unsigned long SAMPLE_INTERVAL_MS = 10; // 100 Hz (10 ms por amostra)
const int TOTAL_SAMPLES = 100;               // Janela de 1 segundo = 100 amostras

// Variaveis de controle
unsigned long lastSampleTime = 0;
bool isRecording = false;
int sampleCount = 0;

void setup() {
  Serial.begin(115200);
  delay(200);

  // Configura botao com pull-up interno e pino de interrupcao
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_INT, INPUT);

  // Inicializa I2C nos pinos nativos do ESP32-C3
  Wire.begin(PIN_SDA, PIN_SCL);

  Serial.println("--- INICIALIZANDO DISPOSITIVO WEARABLE (TENIS IOT) ---");

  if (!mpu.begin()) {
    Serial.println("ERRO: MPU-6050 nao encontrado! Verifique as conexoes.");
    while (1) {
      delay(100);
    }
  }

  // Configuracoes para evitar saturacao em altas velocidades
  mpu.setAccelerometerRange(MPU6050_RANGE_16_G);    // Escala maxima de aceleracao: +/- 16g
  mpu.setGyroRange(MPU6050_RANGE_2000_DEG);        // Escala maxima de rotacao: +/- 2000 deg/s
  mpu.setFilterBandwidth(MPU6050_BAND_94_HZ);      // Filtro passa-baixa anti-ruido

  Serial.println("MPU-6050 configurado com sucesso!");
  Serial.println("Pressione o BOTAO VERDE para gravar uma janela de golpe (100 amostras).");
}

void loop() {
  unsigned long currentTime = millis();

  // 1. Checa acionamento do botao para disparar gravacao (ativo em nivel LOW)
  if (digitalRead(PIN_BUTTON) == LOW && !isRecording) {
    isRecording = true;
    sampleCount = 0;
    
    Serial.println("\n>>> GRAVACAO DE GOLPE INICIADA <<<");
    Serial.println("sample_idx,timestamp_ms,ax,ay,az,gx,gy,gz");
    delay(200); // Debounce simples do botao
  }

  // 2. Loop de amostragem a 100 Hz (executa a cada 10 ms)
  if (isRecording && (currentTime - lastSampleTime >= SAMPLE_INTERVAL_MS)) {
    lastSampleTime = currentTime;

    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    // Envia a amostra formatada em CSV
    Serial.printf("%d,%lu,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f\n",
                  sampleCount,
                  currentTime,
                  a.acceleration.x, a.acceleration.y, a.acceleration.z,
                  g.gyro.x, g.gyro.y, g.gyro.z);

    sampleCount++;

    // Finaliza a janela de captura apos 100 amostras (1 segundo)
    if (sampleCount >= TOTAL_SAMPLES) {
      isRecording = false;
      Serial.println(">>> GRAVACAO CONCLUIDA COM SUCESSO <<<\n");
    }
  }
}