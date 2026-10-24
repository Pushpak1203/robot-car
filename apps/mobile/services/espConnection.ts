import { MobileTelemetry, MotionAction, DrivingMode } from '../types';

type TelemetryCallback = (telemetry: MobileTelemetry) => void;
type ConnectionCallback = (connected: boolean) => void;

class EspConnectionService {
  private ipAddress: string = '192.168.4.1';
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private telemetryCallbacks: Set<TelemetryCallback> = new Set();
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  private reconnectInterval: any = null;

  public getIp(): string {
    return this.ipAddress;
  }

  public setIp(ip: string): void {
    this.ipAddress = ip.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    this.reconnect();
  }

  public connect(): void {
    this.disconnect();
    try {
      const url = `ws://${this.ipAddress}:81`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connected = true;
        this.notifyConnection(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'telemetry') {
            this.notifyTelemetry(data);
          }
        } catch {}
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.notifyConnection(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.connected = false;
        this.notifyConnection(false);
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.notifyConnection(false);
  }

  public reconnect(): void {
    this.disconnect();
    this.connect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) return;
    this.reconnectInterval = setTimeout(() => {
      this.reconnectInterval = null;
      this.connect();
    }, 2500);
  }

  public onTelemetry(cb: TelemetryCallback): () => void {
    this.telemetryCallbacks.add(cb);
    return () => this.telemetryCallbacks.delete(cb);
  }

  public onConnectionChange(cb: ConnectionCallback): () => void {
    this.connectionCallbacks.add(cb);
    cb(this.connected);
    return () => this.connectionCallbacks.delete(cb);
  }

  private notifyTelemetry(t: MobileTelemetry) {
    this.telemetryCallbacks.forEach((cb) => cb(t));
  }

  private notifyConnection(c: boolean) {
    this.connectionCallbacks.forEach((cb) => cb(c));
  }

  public sendCommand(
    action: MotionAction,
    mode: DrivingMode = 'manual',
    speed: number = 60,
    leaseMs: number = 500
  ): void {
    const payload = JSON.stringify({
      version: 1,
      type: 'command',
      id: `m_cmd_${Date.now()}`,
      mode,
      action,
      speed,
      lease_ms: leaseMs,
    });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      // Fallback HTTP POST
      fetch(`http://${this.ipAddress}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {});
    }
  }

  public emergencyStop(): void {
    this.sendCommand('estop', 'manual', 0, 1000);
    fetch(`http://${this.ipAddress}/api/estop`, { method: 'POST' }).catch(() => {});
  }

  public resetEmergencyStop(): void {
    this.sendCommand('estop_reset', 'manual', 0, 1000);
    fetch(`http://${this.ipAddress}/api/estop/reset`, { method: 'POST' }).catch(() => {});
  }
}

export const espConnection = new EspConnectionService();
