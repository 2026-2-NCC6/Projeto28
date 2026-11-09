import sys
import os
import re
import time
import math
import random
import logging
import argparse
from collections import deque
from typing import Optional, Dict, Any, Tuple

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

try:
    import requests
except ImportError:
    print("[ERRO FATAL] Biblioteca 'requests' não encontrada. Instale com: pip install requests")
    sys.exit(1)

try:
    import serial
    from serial.tools import list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False

DEFAULT_API_URL = os.environ.get("MOTION_TENNIS_API_URL", "http://localhost:3000/api/hardware/arduino/events")
DEFAULT_BAUD = 115200
DEFAULT_TIMEOUT_HTTP = 3.0
MAX_MICROS = 4294967296
MAX_RETRY_QUEUE = 100
DEFAULT_WALL_WIDTH_M = 3.0
DEFAULT_WALL_HEIGHT_M = 2.0
DEFAULT_PROPAGATION_SPEED_MPS = 340.0


class CleanFormatter(logging.Formatter):
    def format(self, record):
        msg = super().format(record)
        for sensitive_key in ["token", "bearer", "authorization", "secret", "password"]:
            if sensitive_key in msg.lower():
                msg = re.sub(rf'(?i)({sensitive_key}[:=]\s*)[\w\-._]+', r'\1[PROTEGIDO]', msg)
        return msg


logger = logging.getLogger("MotionTennisBridge")
logger.setLevel(logging.INFO)
ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(CleanFormatter("%(asctime)s %(message)s", datefmt="[%H:%M:%S]"))
logger.addHandler(ch)


class RawEvent:
    def __init__(self, event_id: str, sensor_id: str, timestamp_us: int):
        self.event_id = event_id
        self.sensor_id = sensor_id.upper()
        self.timestamp_us = timestamp_us % MAX_MICROS

    def to_dict(self, device_id: str, is_simulation: bool = False, session_id: str = "") -> Dict[str, Any]:
        scoped_id = f"evt_{session_id}_{self.event_id}" if session_id else str(self.event_id)
        payload: Dict[str, Any] = {
            "event_id": scoped_id,
            "raw_event_id": str(self.event_id),
            "device_id": device_id,
            "sensor_id": self.sensor_id,
            "timestamp_us": self.timestamp_us,
            "valid": True,
            "is_simulation": is_simulation
        }
        if session_id:
            payload["session_id"] = session_id
            payload["boot_id"] = session_id
        return payload


class RawImpact:
    def __init__(self, impact_id: str, t1_us: int, t2_us: int, t3_us: int, count: int):
        self.impact_id = impact_id
        self.t1_us = (t1_us % MAX_MICROS) if t1_us > 0 else 0
        self.t2_us = (t2_us % MAX_MICROS) if t2_us > 0 else 0
        self.t3_us = (t3_us % MAX_MICROS) if t3_us > 0 else 0
        self.count = count

    def to_dict(self, device_id: str, is_simulation: bool = False, session_id: str = "") -> Dict[str, Any]:
        scoped_id = f"imp_{session_id}_{self.impact_id}" if session_id else f"imp_{self.impact_id}"
        payload: Dict[str, Any] = {
            "event_id": scoped_id,
            "raw_impact_id": str(self.impact_id),
            "device_id": device_id,
            "valid": True,
            "is_simulation": is_simulation
        }
        if session_id:
            payload["session_id"] = session_id
            payload["boot_id"] = session_id
        if self.t1_us > 0:
            payload["t1_us"] = self.t1_us
        if self.t2_us > 0:
            payload["t2_us"] = self.t2_us
        if self.t3_us > 0:
            payload["t3_us"] = self.t3_us
        return payload


def parse_arduino_line(line: str) -> Tuple[str, Optional[Any]]:
    if not line:
        return ("IGNORED", "Linha vazia")
    cleaned = line.strip()
    if not cleaned or cleaned[0] in ("=", "-", "["):
        return ("IGNORED", "Linha de cabeçalho ou diagnóstico textual")

    parts = [p.strip() for p in cleaned.split(",")]
    tag = parts[0].upper()

    if tag == "STATUS":
        return ("STATUS", cleaned)

    if tag == "EVENT":
        if len(parts) != 4:
            return ("MALFORMED", f"EVENT requer 4 campos, recebido {len(parts)}: '{cleaned}'")
        event_id = parts[1]
        if not event_id:
            return ("MALFORMED", f"event_id vazio em: '{cleaned}'")
        raw_sensor = parts[2].upper()
        sensor_map = {"S1": "S1", "1": "S1", "S2": "S2", "2": "S2", "S3": "S3", "3": "S3"}
        sensor_id = sensor_map.get(raw_sensor)
        if not sensor_id:
            return ("MALFORMED", f"Identificador de sensor inválido: '{raw_sensor}'")
        try:
            ts_us = int(parts[3])
            if ts_us < 0:
                return ("MALFORMED", f"Timestamp negativo não permitido: {ts_us}")
        except ValueError:
            return ("MALFORMED", f"Timestamp não numérico: '{parts[3]}'")
        return ("EVENT", RawEvent(event_id, sensor_id, ts_us))

    if tag == "IMPACT":
        if len(parts) != 6:
            return ("MALFORMED", f"IMPACT requer exatamente 6 campos, recebido {len(parts)}: '{cleaned}'")
        impact_id = parts[1]
        if not impact_id:
            return ("MALFORMED", f"impact_id vazio em: '{cleaned}'")
        try:
            t1, t2, t3, count = int(parts[2]), int(parts[3]), int(parts[4]), int(parts[5])
            if count < 1 or count > 3:
                return ("MALFORMED", f"Contagem de sensores inválida: {count}")
            if t1 < 0 or t2 < 0 or t3 < 0:
                return ("MALFORMED", f"Timestamps negativos não permitidos em IMPACT: t1={t1}, t2={t2}, t3={t3}")
            active_count = sum(1 for t in (t1, t2, t3) if t > 0)
            if active_count != count:
                return ("MALFORMED", f"Inconsistência em IMPACT: contagem declarada {count} diverge dos timestamps informados ({active_count})")
        except ValueError:
            return ("MALFORMED", f"Valores numéricos de IMPACT inválidos em: '{cleaned}'")
        return ("IMPACT", RawImpact(impact_id, t1, t2, t3, count))

    return ("IGNORED", f"Linha com tag desconhecida: '{tag}'")


class NodeApiDispatcher:
    def __init__(self, api_url: str, timeout: float = DEFAULT_TIMEOUT_HTTP, token: Optional[str] = None):
        self.api_url = api_url
        self.timeout = timeout
        self.token = token
        self.session = requests.Session()
        self.retry_queue: deque = deque(maxlen=MAX_RETRY_QUEUE)
        self.sent_event_ids: set = set()
        self.sent_history: deque = deque(maxlen=500)
        self.total_dispatched = 0
        self.total_success = 0
        self.total_duplicate_409 = 0
        self.total_rejected_422 = 0
        self.total_errors = 0
        self.total_response_time_ms = 0.0

    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json", "User-Agent": "MotionTennis-IoT-Bridge/1.0"}
        if self.token:
            headers["X-IoT-Device-Token"] = self.token
        return headers

    def remember_id(self, event_id: str):
        if not event_id:
            return
        self.sent_event_ids.add(event_id)
        self.sent_history.append(event_id)
        if len(self.sent_history) > 500:
            self.sent_event_ids.discard(self.sent_history.popleft())

    def send_payload(self, payload: Dict[str, Any], attempt_retry: bool = True) -> Tuple[bool, int, Dict[str, Any]]:
        event_id = payload.get("event_id")
        self.total_dispatched += 1
        t0 = time.monotonic()
        try:
            resp = self.session.post(self.api_url, json=payload, headers=self._get_headers(), timeout=self.timeout)
            self.total_response_time_ms += (time.monotonic() - t0) * 1000.0
            status = resp.status_code
            try:
                body = resp.json()
            except Exception:
                body = {"raw": resp.text}

            if status in (200, 201):
                self.total_success += 1
                if event_id:
                    self.remember_id(event_id)
                return True, status, body
            if status == 409:
                self.total_duplicate_409 += 1
                if event_id:
                    self.remember_id(event_id)
                return False, status, body
            if status == 422:
                self.total_rejected_422 += 1
                return False, status, body
            if status in (400, 401, 403):
                self.total_errors += 1
                logger.warning(f"[HTTP {status}] Rejeição pelo backend: {body.get('error', 'Acesso negado ou formato inválido')}")
                return False, status, body

            self.total_errors += 1
            logger.error(f"[HTTP {status}] Erro interno do servidor Motion Tennis.")
            if attempt_retry:
                self.retry_queue.append(payload)
            return False, status, body
        except requests.exceptions.RequestException as exc:
            self.total_response_time_ms += (time.monotonic() - t0) * 1000.0
            self.total_errors += 1
            logger.error(f"[HTTP FALHA] Não foi possível conectar a {self.api_url}: {type(exc).__name__}")
            if attempt_retry:
                self.retry_queue.append(payload)
            return False, 0, {"error": str(exc)}

    def flush_retry_queue(self):
        if not self.retry_queue:
            return
        count = len(self.retry_queue)
        logger.info(f"[RECONEXÃO] Tentando reenviar {count} pacote(s) da fila de espera...")
        retried = 0
        while self.retry_queue and retried < count:
            item = self.retry_queue.popleft()
            ok, st, _ = self.send_payload(item, attempt_retry=False)
            if not ok and st == 0:
                self.retry_queue.appendleft(item)
                break
            retried += 1


class SyntheticScenarioGenerator:
    def __init__(
        self,
        wall_w: float = DEFAULT_WALL_WIDTH_M,
        wall_h: float = DEFAULT_WALL_HEIGHT_M,
        speed_mps: float = DEFAULT_PROPAGATION_SPEED_MPS,
        seed: Optional[int] = None
    ):
        self.wall_w = wall_w
        self.wall_h = wall_h
        self.speed_mps = speed_mps
        self.base_micros = 10_000_000
        if seed is not None:
            random.seed(seed)

    def calculate_timestamps_for_point(self, x: float, y: float, base_us: Optional[int] = None) -> Tuple[int, int, int]:
        base = base_us if base_us is not None else self.base_micros
        d1 = math.hypot(x - 0.0, y - 0.0)
        d2 = math.hypot(x - 0.0, y - self.wall_h)
        d3 = math.hypot(x - self.wall_w, y - 0.0)
        t1 = int(base + (d1 / self.speed_mps) * 1_000_000) % MAX_MICROS
        t2 = int(base + (d2 / self.speed_mps) * 1_000_000) % MAX_MICROS
        t3 = int(base + (d3 / self.speed_mps) * 1_000_000) % MAX_MICROS
        return t1, t2, t3

    def _point_packet(self, name: str, event_id: str, x: float, y: float, expected: str) -> Dict[str, Any]:
        t1, t2, t3 = self.calculate_timestamps_for_point(x, y)
        return {
            "name": name,
            "event_id": event_id,
            "payload": {
                "event_id": event_id,
                "device_id": "BRIDGE_SIMULATOR",
                "t1_us": t1,
                "t2_us": t2,
                "t3_us": t3,
                "valid": True,
                "is_simulation": True
            },
            "expected": expected
        }

    def generate_scenario(self, scenario_name: str, step: int = 1) -> Dict[str, Any]:
        self.base_micros = (self.base_micros + 500_000) % MAX_MICROS
        event_id = f"sim_{scenario_name}_{step}_{int(time.time())}"

        point_presets = {
            "center": ("Centro da Parede (3/3 Sensores)", 1.50, 1.00, "3. Impacto sintético localizado pelo algoritmo (Simulação)"),
            "top_left": ("Canto Superior Esquerdo - Próximo S2", 0.40, 1.80, "Setor 1 ou 2 localizado com S2 adiantado"),
            "bottom_left": ("Canto Inferior Esquerdo - Próximo S1", 0.40, 0.30, "Setor 4 localizado com S1 adiantado"),
            "bottom_right": ("Canto Inferior Direito - Próximo S3", 2.60, 0.30, "Setor 6 localizado com S3 adiantado")
        }
        if scenario_name in point_presets:
            name, x, y, expected = point_presets[scenario_name]
            return self._point_packet(name, event_id, x, y, expected)

        if scenario_name == "incomplete_2":
            t1, t2, _ = self.calculate_timestamps_for_point(1.20, 1.50)
            return {
                "name": "Leitura Incompleta (2/3 Sensores - S3 ausente)",
                "event_id": event_id,
                "payload": {"event_id": event_id, "device_id": "BRIDGE_SIMULATOR", "t1_us": t1, "t2_us": t2, "valid": True, "is_simulation": True},
                "expected": "REJECTED_INCOMPLETE_PACKET ou INCOMPLETE (HTTP 422)"
            }

        if scenario_name == "isolated_1":
            return {
                "name": "Ruído Isolado (1/3 Sensor - S1 apenas)",
                "event_id": event_id,
                "payload": {"event_id": event_id, "device_id": "BRIDGE_SIMULATOR", "sensor_id": "S1", "timestamp_us": self.base_micros, "valid": True, "is_simulation": True, "finalize_pending": True},
                "expected": "NOISE_OR_INCOMPLETE / Descartado"
            }

        if scenario_name == "duplicate":
            dup_id = f"sim_fixed_dup_id_{step // 2}"
            return self._point_packet("Evento Duplicado (Teste de Idempotência)", dup_id, 1.50, 1.00, "HTTP 409 (REJECTED_DUPLICATE_EVENT)")

        if scenario_name == "out_of_order":
            t1, t2, t3 = self.calculate_timestamps_for_point(0.20, 0.30)
            readings = [
                {"event_id": f"{event_id}_S3", "sensor_id": "S3", "timestamp_us": t3, "device_id": "BRIDGE_SIMULATOR", "valid": True, "is_simulation": True},
                {"event_id": f"{event_id}_S1", "sensor_id": "S1", "timestamp_us": t1, "device_id": "BRIDGE_SIMULATOR", "valid": True, "is_simulation": True},
                {"event_id": f"{event_id}_S2", "sensor_id": "S2", "timestamp_us": t2, "device_id": "BRIDGE_SIMULATOR", "valid": True, "is_simulation": True}
            ]
            return {
                "name": "Pacotes Fora de Ordem (S3 antes de S1)",
                "event_id": event_id,
                "payload": {"readings": readings, "finalize_pending": True},
                "expected": "Agrupamento temporal backend reordena e aceita"
            }

        if scenario_name == "rollover":
            return {
                "name": "Rollover de 32 bits de micros() (4.294.967.295 -> 0)",
                "event_id": event_id,
                "payload": {"event_id": event_id, "device_id": "BRIDGE_SIMULATOR", "t1_us": MAX_MICROS - 2296, "t2_us": 1500, "t3_us": 3800, "valid": True, "is_simulation": True},
                "expected": "Diferença com sinal módulo 2^32 calculada sem erro negativo"
            }

        return self._point_packet(f"Impacto Padrão ({scenario_name})", event_id, 1.50, 1.00, "Sucesso")


def run_simulation_mode(args, dispatcher: NodeApiDispatcher):
    logger.info("==============================================================")
    logger.info("  🎾 MOTION TENNIS — PONTE IoT EM MODO SIMULAÇÃO SINTÉTICA   ")
    logger.info("==============================================================")
    logger.info(f" Destino da API: {dispatcher.api_url} | Cenário: {args.scenario} | Intervalo: {args.interval}s\n")

    generator = SyntheticScenarioGenerator(seed=args.seed)
    scenarios_pool = ["center", "top_left", "incomplete_2", "isolated_1", "out_of_order", "rollover", "duplicate"]
    selected_scenarios = scenarios_pool if args.scenario == "all" else [args.scenario]
    step = 0

    try:
        while True:
            step += 1
            scenario_name = selected_scenarios[(step - 1) % len(selected_scenarios)]
            scenario = generator.generate_scenario(scenario_name, step=step)

            logger.info(f"[SIMULAÇÃO #{step}] Executando: {scenario['name']}")
            ok, status, resp = dispatcher.send_payload(scenario["payload"])

            if ok:
                diag = resp.get("impact") or resp
                cat_label = diag.get("categoryLabel", "Aceito")
                sector = diag.get("sectorId")
                rms = diag.get("residualRmsM")
                sec_text = f"Setor {sector}" if sector else "Área Neutra / Sem Setor"
                rms_text = f" | Resíduo: {rms}m" if rms is not None else ""
                logger.info(f"  -> HTTP {status} OK | {cat_label} | {sec_text}{rms_text}")
            elif status == 409:
                logger.info("  -> HTTP 409 CONFLITO (Idempotência confirmada: evento duplicado rejeitado)")
            elif status == 422:
                logger.info("  -> HTTP 422 REJEITADO (Leitura incompleta ou ruído descartado como esperado)")
            else:
                logger.warning(f"  -> HTTP {status} | Resposta: {resp}")

            dispatcher.flush_retry_queue()
            if args.count > 0 and step >= args.count:
                logger.info("\n[CONCLUÍDO] Quantidade especificada de eventos simulados atingida.")
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        logger.info("\n[ENCERRANDO] Simulação interrompida pelo operador.")

    print_final_summary(dispatcher, mode="SIMULAÇÃO SINTÉTICA")


def select_serial_port(requested_port: Optional[str]) -> str:
    if not SERIAL_AVAILABLE:
        raise RuntimeError("Módulo 'pyserial' não disponível no ambiente Python.")
    if requested_port:
        return requested_port.strip().upper()

    ports = list(list_ports.comports())
    if not ports:
        raise RuntimeError("Nenhuma porta serial COM encontrada no Windows. Conecte o Arduino Uno ou use --mode sim.")

    logger.info("\nPORTAS SERIAIS DETECTADAS NO WINDOWS:")
    for idx, p in enumerate(ports, 1):
        logger.info(f"  {idx} - {p.device}: {p.description}")
    if len(ports) == 1:
        logger.info(f"\nSelecionando automaticamente a única porta disponível: {ports[0].device}")
        return ports[0].device

    print("\nInforme o número da porta COM desejada (ou Ctrl+C para cancelar): ", end="")
    try:
        val = int(input().strip())
        if 1 <= val <= len(ports):
            return ports[val - 1].device
        raise ValueError("Opção fora do intervalo.")
    except Exception as e:
        raise RuntimeError(f"Seleção de porta serial inválida: {e}")


def run_serial_mode(args, dispatcher: NodeApiDispatcher):
    if not SERIAL_AVAILABLE:
        logger.error("[ERRO FATAL] O pacote 'pyserial' não está instalado. Execute: pip install pyserial")
        sys.exit(1)

    port_name = select_serial_port(args.port)
    logger.info("==============================================================")
    logger.info("  🎾 MOTION TENNIS — PONTE IoT EM MODO SERIAL REAL (ARDUINO) ")
    logger.info("==============================================================")
    logger.info(f" Porta: {port_name} @ {args.baud} | API: {dispatcher.api_url} | Modo: {args.forward_mode.upper()}\n")

    ser = None
    backoff = 2.0
    confirmed_connection = False
    boot_seq = 1
    session_id = f"s{int(time.time())}_{boot_seq}"
    last_impact_id: Optional[int] = None

    try:
        while True:
            if ser is None or not ser.is_open:
                try:
                    logger.info(f"[SERIAL] Tentando abrir porta {port_name} a {args.baud} baud...")
                    ser = serial.Serial(port_name, args.baud, timeout=1.0)
                    time.sleep(1.8)
                    ser.reset_input_buffer()
                    boot_seq += 1
                    session_id = f"s{int(time.time())}_{boot_seq}"
                    last_impact_id = None
                    logger.info(f"[SERIAL] Porta {port_name} aberta (sessão {session_id}). Aguardando pacotes do firmware...")
                    backoff = 2.0
                except (serial.SerialException, OSError) as err:
                    logger.warning(f"[SERIAL FALHA] Não foi possível conectar a {port_name}: {err} (nova tentativa em {backoff:.1f}s)")
                    time.sleep(backoff)
                    backoff = min(backoff * 1.5, 15.0)
                    continue

            try:
                raw_bytes = ser.readline()
                if not raw_bytes:
                    continue
                line = raw_bytes.decode("utf-8", errors="ignore").strip()
                if not line:
                    continue

                tag, parsed = parse_arduino_line(line)

                if tag == "STATUS":
                    boot_seq += 1
                    session_id = f"s{int(time.time())}_{boot_seq}"
                    last_impact_id = None
                    if not confirmed_connection:
                        confirmed_connection = True
                        logger.info(f"[CONEXÃO CONFIRMADA] Handshake do Arduino recebido: '{parsed}'")
                    continue

                if tag == "MALFORMED":
                    logger.warning(f"[LINHA MALFORMADA] Descartada: {parsed}")
                    continue
                if tag == "IGNORED":
                    continue

                if tag == "EVENT":
                    evt: RawEvent = parsed
                    logger.info(f"[EVENTO SENSOR] {evt.sensor_id} disparou em {evt.timestamp_us} µs (ID #{evt.event_id})")
                    if args.forward_mode == "events":
                        payload = evt.to_dict(device_id="ARDUINO_UNO", is_simulation=False, session_id=session_id)
                        ok, st, _ = dispatcher.send_payload(payload)
                        if ok:
                            logger.info(f"  -> Encaminhado EVENT #{evt.event_id} (HTTP {st})")

                elif tag == "IMPACT":
                    imp: RawImpact = parsed
                    try:
                        curr_id = int(imp.impact_id)
                        if last_impact_id is not None and curr_id <= last_impact_id:
                            boot_seq += 1
                            session_id = f"s{int(time.time())}_{boot_seq}"
                        last_impact_id = curr_id
                    except (ValueError, TypeError):
                        pass

                    logger.info(f"[PACOTE IMPACTO] ID #{imp.impact_id} ({session_id}) | Contagem: {imp.count}/3 | S1={imp.t1_us} S2={imp.t2_us} S3={imp.t3_us}")
                    if args.forward_mode in ("impact", "both"):
                        payload = imp.to_dict(device_id="ARDUINO_UNO", is_simulation=False, session_id=session_id)
                        ok, st, body = dispatcher.send_payload(payload)
                        if ok:
                            diag = body.get("impact") or body
                            cat_label = diag.get("categoryLabel", "Aceito")
                            sector = diag.get("sectorId")
                            sec_text = f"Setor {sector}" if sector else "Área Neutra / Sem Setor"
                            logger.info(f"  -> HTTP {st} | {cat_label} | {sec_text}")
                        else:
                            logger.warning(f"  -> HTTP {st} | Rejeitado: {body.get('reason', body)}")

                dispatcher.flush_retry_queue()
            except (serial.SerialException, OSError) as err:
                logger.error(f"[SERIAL ERRO] Conexão com {port_name} perdida: {err}")
                try:
                    if ser:
                        ser.close()
                except Exception:
                    pass
                ser = None
                confirmed_connection = False
                time.sleep(2.0)
    except KeyboardInterrupt:
        logger.info("\n[ENCERRANDO] Encerramento solicitado pelo operador.")
    finally:
        if ser and ser.is_open:
            try:
                ser.close()
                logger.info(f"[SERIAL] Porta {port_name} fechada com segurança.")
            except Exception:
                pass

    print_final_summary(dispatcher, mode=f"SERIAL REAL ({port_name})")


def print_final_summary(dispatcher: NodeApiDispatcher, mode: str):
    avg_resp = (dispatcher.total_response_time_ms / dispatcher.total_dispatched) if dispatcher.total_dispatched > 0 else 0.0
    logger.info("\n==============================================================")
    logger.info("   MOTION TENNIS IoT — RELATÓRIO FINAL DA PONTE SERIAL       ")
    logger.info("==============================================================")
    logger.info(f" Modo: {mode} | Disparos: {dispatcher.total_dispatched} | Sucesso: {dispatcher.total_success}")
    logger.info(f" Duplicatas (409): {dispatcher.total_duplicate_409} | Incompletos (422): {dispatcher.total_rejected_422} | Erros: {dispatcher.total_errors}")
    logger.info(f" Fila residual: {len(dispatcher.retry_queue)} | Tempo médio: {avg_resp:.1f} ms")
    logger.info("==============================================================\n")


def main():
    parser = argparse.ArgumentParser(description="Ponte de Comunicação Serial / Simulação IoT para Motion Tennis")
    parser.add_argument("--mode", "-m", choices=["sim", "simulation", "serial"], default="sim")
    parser.add_argument("--sim", action="store_true")
    parser.add_argument("--port", "-p", type=str, default=None)
    parser.add_argument("--baud", "-b", type=int, default=DEFAULT_BAUD)
    parser.add_argument("--api-url", type=str, default=DEFAULT_API_URL)
    parser.add_argument("--forward-mode", choices=["impact", "events", "both"], default="impact")
    parser.add_argument("--scenario", "-s", choices=["all", "center", "top_left", "incomplete_2", "isolated_1", "duplicate", "out_of_order", "rollover"], default="all")
    parser.add_argument("--interval", "-i", type=float, default=1.5)
    parser.add_argument("--count", "-c", type=int, default=10)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--token", type=str, default=None)

    args = parser.parse_args()
    mode = "sim" if args.sim else args.mode
    dispatcher = NodeApiDispatcher(api_url=args.api_url, token=args.token)

    if mode in ("sim", "simulation"):
        run_simulation_mode(args, dispatcher)
    else:
        run_serial_mode(args, dispatcher)


if __name__ == "__main__":
    main()
