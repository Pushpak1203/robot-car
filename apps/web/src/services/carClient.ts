/**
 * Direct Client Service for ESP32 AI RC Car
 * Handles dual WebSocket (Port 81) & REST API (Port 80) communication
 */

export interface TelemetryData {
  version: number;
  type: 'telemetry';
  timestamp_ms: number;
  mode: 'manual' | 'voice' | 'obstacle_avoidance' | 'follow_target';
  motion: 'stopped' | 'forward' | 'reverse' | 'turning_left' | 'turning_right' | 'estop_locked' | 'recovering';
  distance_cm: number;
  speed: number;
  obstacle: boolean;
  fault: string | null;
  rssi?: number;
  active_clients?: number;
  voice_keyword?: string | null;
}

export interface DiagnosticsData {
  uptime_sec: number;
  free_heap_bytes: number;
  min_free_heap_bytes: number;
  wifi_rssi: number;
  wifi_ip: string;
  wifi_ssid: string;
  ws_client_count: number;
  last_command_id: string;
  last_command_time_ms: number;
  loop_latency_us: number;
  sensor_read_time_us: number;
  mic_dma_errors: number;
  estop_active: boolean;
}

type TelemetryListener = (telemetry: TelemetryData) => void;
type ConnectionListener = (connected: boolean, latencyMs: number) => void;

class CarClient {
  private host: string = '192.168.4.1'; // Default AP IP
  private ws: WebSocket | null = null;
  private wsConnected: boolean = false;
  private reconnectTimer: number | null = null;
  private telemetryListeners: Set<TelemetryListener> = new Set();
  private connectionListeners: Set<ConnectionListener> = new Set();
  private latencyMs: number = 0;
  private pingIntervalTimer: number | null = null;

  constructor() {
    // Check localStorage for saved IP
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('esp32_car_ip');
      if (saved) this.host = saved;
    }
  }

  public getHost(): string {
    return this.host;
  }

  public setHost(newHost: string): void {
    const clean = newHost.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    this.host = clean;
    if (typeof window !== 'undefined') {
      localStorage.setItem('esp32_car_ip', clean);
    }
    this.reconnect();
  }

  public connect(): void {
    if (typeof window === 'undefined') return;
    this.disconnect();

    const wsUrl = `ws://${this.host}:81`;
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.wsConnected = true;
        this.notifyConnection(true);
        this.startPingTracker();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'telemetry') {
            this.notifyTelemetry(data as TelemetryData);
          }
        } catch (e) {
          console.warn('[WS] Parse error', e);
        }
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
        this.notifyConnection(false);
        this.stopPingTracker();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        if (this.wsConnected) {
          this.wsConnected = false;
          this.notifyConnection(false);
        }
      };
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPingTracker();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.wsConnected = false;
    this.notifyConnection(false);
  }

  public reconnect(): void {
    this.disconnect();
    this.connect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  private startPingTracker(): void {
    this.stopPingTracker();
    this.pingIntervalTimer = window.setInterval(async () => {
      if (!this.wsConnected) return;
      const start = Date.now();
      try {
        const res = await fetch(`http://${this.host}/api/status`, { signal: AbortSignal.timeout(1200) });
        if (res.ok) {
          this.latencyMs = Date.now() - start;
          this.notifyConnection(true);
        }
      } catch {
        // HTTP failed but WS might be running
      }
    }, 2500);
  }

  private stopPingTracker(): void {
    if (this.pingIntervalTimer) {
      clearInterval(this.pingIntervalTimer);
      this.pingIntervalTimer = null;
    }
  }

  public onTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  public onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.wsConnected, this.latencyMs);
    return () => this.connectionListeners.delete(listener);
  }

  private notifyTelemetry(t: TelemetryData): void {
    this.telemetryListeners.forEach((l) => l(t));
  }

  private notifyConnection(connected: boolean): void {
    this.connectionListeners.forEach((l) => l(connected, this.latencyMs));
  }

  public async sendCommand(
    action: 'forward' | 'reverse' | 'left' | 'right' | 'stop' | 'estop' | 'estop_reset',
    mode: 'manual' | 'voice' | 'obstacle_avoidance' | 'follow_target' = 'manual',
    speed: number = 60,
    leaseMs: number = 500
  ): Promise<boolean> {
    const id = `cmd_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const payload = JSON.stringify({
      version: 1,
      type: 'command',
      id,
      mode,
      action,
      speed,
      lease_ms: leaseMs,
    });

    // Prefer WebSocket for instant transmission
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
      return true;
    }

    // Fallback to REST API
    try {
      const res = await fetch(`http://${this.host}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(1000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async emergencyStop(): Promise<boolean> {
    // Send via both WS and dedicated REST endpoint for absolute safety
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          version: 1,
          type: 'command',
          id: `estop_${Date.now()}`,
          action: 'estop',
        })
      );
    }
    try {
      const res = await fetch(`http://${this.host}/api/estop`, {
        method: 'POST',
        signal: AbortSignal.timeout(800),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async resetEmergencyStop(): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          version: 1,
          type: 'command',
          id: `estop_reset_${Date.now()}`,
          action: 'estop_reset',
        })
      );
    }
    try {
      const res = await fetch(`http://${this.host}/api/estop/reset`, {
        method: 'POST',
        signal: AbortSignal.timeout(800),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async fetchDiagnostics(): Promise<DiagnosticsData | null> {
    try {
      const res = await fetch(`http://${this.host}/api/diagnostics`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        return (await res.json()) as DiagnosticsData;
      }
    } catch {
      // Ignored
    }
    return null;
  }
}

export const carClient = new CarClient();
