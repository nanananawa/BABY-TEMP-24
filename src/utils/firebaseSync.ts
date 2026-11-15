import type { Ward, WardSettings } from '../types';

export const DEFAULT_FIREBASE_URL =
  'https://babytemp-9beab-default-rtdb.asia-southeast1.firebasedatabase.app';

export const DEFAULT_GOOGLE_SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbz_DQARLMfFcrrF4ufRFl3m5Do6QcGuiF2Y0BGRFe1lp-pmgIX3U8PoY3mZ5ngxVsqDPw/exec';

export interface FirebaseTelemetryPayload {
  deviceId: string;
  temperature: number;
  battery?: number | null;
  name?: string;
  timestamp: number;
  activeWorkingSeconds?: number;
  deepSleepMinutes?: number;
  history?: Array<{
    timestamp: number;
    temperature: number;
    battery?: number | null;
    rssi?: number | null;
  }>;
}

export type FirebaseUpdateCallback = (payload: FirebaseTelemetryPayload) => void;
export type FirebaseStatusCallback = (status: 'connected' | 'connecting' | 'error' | 'polling') => void;
export type FirebaseWardSyncCallback = (
  wards: Ward[],
  settings?: Partial<WardSettings>,
  updatedAt?: number
) => void;

function cleanFirebaseUrl(rawUrl: string): string {
  let url = (rawUrl || DEFAULT_FIREBASE_URL).trim();
  if (!url) url = DEFAULT_FIREBASE_URL;
  if (url.endsWith('/')) url = url.slice(0, -1);
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url;
}

export class FirebaseSyncManager {
  private eventSource: EventSource | null = null;
  private wardEventSource: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private wardPeriodicTimer: ReturnType<typeof setInterval> | null = null;
  private wardReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentUrl: string = DEFAULT_FIREBASE_URL;
  private onUpdate: FirebaseUpdateCallback | null = null;
  private onStatus: FirebaseStatusCallback | null = null;
  private onWardSync: FirebaseWardSyncCallback | null = null;
  private isDestroyed = false;

  constructor(
    url: string = DEFAULT_FIREBASE_URL,
    onUpdate?: FirebaseUpdateCallback,
    onStatus?: FirebaseStatusCallback,
    onWardSync?: FirebaseWardSyncCallback
  ) {
    this.currentUrl = cleanFirebaseUrl(url);
    if (onUpdate) this.onUpdate = onUpdate;
    if (onStatus) this.onStatus = onStatus;
    if (onWardSync) this.onWardSync = onWardSync;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityOrOnline);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleVisibilityOrOnline);
    }
  }

  private handleVisibilityOrOnline = () => {
    if (this.isDestroyed) return;
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      void this.fetchWardState();
      void this.pollBabiesJson();
      if (!this.wardEventSource) {
        this.connectWardEventSource();
      }
      if (!this.eventSource) {
        this.connectEventSource();
      }
    }
  };

  public start() {
    this.stop();
    this.isDestroyed = false;
    this.connectEventSource();
    this.connectWardEventSource();

    // Low-frequency heartbeat timer (every 6s) ensuring mobile phones never fall out of sync
    if (!this.wardPeriodicTimer) {
      this.wardPeriodicTimer = setInterval(() => {
        if (!this.isDestroyed) {
          void this.fetchWardState();
        }
      }, 6000);
    }
  }

  public setUrl(newUrl: string) {
    const cleaned = cleanFirebaseUrl(newUrl);
    if (cleaned !== this.currentUrl) {
      this.currentUrl = cleaned;
      this.start();
    }
  }

  public stop() {
    this.isDestroyed = true;
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        // ignore
      }
      this.eventSource = null;
    }
    if (this.wardEventSource) {
      try {
        this.wardEventSource.close();
      } catch {
        // ignore
      }
      this.wardEventSource = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.wardPeriodicTimer) {
      clearInterval(this.wardPeriodicTimer);
      this.wardPeriodicTimer = null;
    }
    if (this.wardReconnectTimer) {
      clearTimeout(this.wardReconnectTimer);
      this.wardReconnectTimer = null;
    }
    if (this.sseReconnectTimer) {
      clearTimeout(this.sseReconnectTimer);
      this.sseReconnectTimer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityOrOnline);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleVisibilityOrOnline);
    }
    this.onStatus?.('error');
  }

  private connectWardEventSource() {
    if (this.isDestroyed || !this.onWardSync) return;
    if (this.wardReconnectTimer) {
      clearTimeout(this.wardReconnectTimer);
      this.wardReconnectTimer = null;
    }
    try {
      this.wardEventSource = new EventSource(`${this.currentUrl}/wardState.json`);
      const handleWardMsg = (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          this.parseWardEvent(payload);
        } catch {
          // ignore
        }
      };
      this.wardEventSource.addEventListener('put', handleWardMsg);
      this.wardEventSource.addEventListener('patch', handleWardMsg);
      this.wardEventSource.onerror = () => {
        if (this.wardEventSource) {
          try {
            this.wardEventSource.close();
          } catch {
            // ignore
          }
          this.wardEventSource = null;
        }
        if (!this.isDestroyed && !this.wardReconnectTimer) {
          this.wardReconnectTimer = setTimeout(() => {
            this.wardReconnectTimer = null;
            this.connectWardEventSource();
            void this.fetchWardState();
          }, 4000);
        }
      };
    } catch {
      if (!this.isDestroyed && !this.wardReconnectTimer) {
        this.wardReconnectTimer = setTimeout(() => {
          this.wardReconnectTimer = null;
          this.connectWardEventSource();
        }, 5000);
      }
    }
  }

  private parseWardEvent(payload: { path?: string; data?: unknown }) {
    if (!payload || !this.onWardSync) return;
    const path = payload.path || '';
    const data = payload.data;
    if (path === '' || path === '/') {
      if (data && typeof data === 'object') {
        const obj = data as {
          wards?: Ward[];
          settings?: Partial<WardSettings>;
          updatedAt?: number;
        };
        if (Array.isArray(obj.wards) && obj.wards.length > 0) {
          this.onWardSync(obj.wards, obj.settings, obj.updatedAt);
        }
      }
    } else if (path === '/wards' && Array.isArray(data) && data.length > 0) {
      this.onWardSync(data as Ward[]);
    } else {
      // Sub-path change, re-fetch full wardState
      void this.fetchWardState();
    }
  }

  public async fetchWardState(): Promise<{
    wards?: Ward[];
    settings?: Partial<WardSettings>;
    updatedAt?: number;
  } | null> {
    if (this.isDestroyed) return null;
    try {
      const res = await fetch(`${this.currentUrl}/wardState.json`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          const obj = data as {
            wards?: Ward[];
            settings?: Partial<WardSettings>;
            updatedAt?: number;
          };
          if (Array.isArray(obj.wards) && obj.wards.length > 0) {
            this.onWardSync?.(obj.wards, obj.settings, obj.updatedAt);
            return obj;
          }
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  private connectEventSource() {
    if (this.isDestroyed) return;
    this.onStatus?.('connecting');

    // Immediate snapshot fetch so UI receives data instantly without waiting for SSE stream handshake
    this.pollBabiesJson();
    void this.fetchWardState();

    const streamUrl = `${this.currentUrl}/babies.json`;
    try {
      this.eventSource = new EventSource(streamUrl);

      const handleMessage = (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          this.parseFirebaseEvent(payload);
        } catch {
          // ignore invalid parse
        }
      };

      this.eventSource.addEventListener('put', handleMessage);
      this.eventSource.addEventListener('patch', handleMessage);

      this.eventSource.onopen = () => {
        if (!this.isDestroyed) {
          this.onStatus?.('connected');
        }
      };

      this.eventSource.onerror = () => {
        if (this.eventSource) {
          try {
            this.eventSource.close();
          } catch {
            // ignore
          }
          this.eventSource = null;
        }
        if (!this.isDestroyed) {
          this.onStatus?.('polling');
          this.startPollingFallback();
        }
      };
    } catch {
      this.startPollingFallback();
    }

    // Also fetch legacy /baby/current.json once
    this.fetchLegacyNode();
  }

  private startPollingFallback() {
    if (this.pollTimer) return;
    this.pollBabiesJson();
    this.pollTimer = setInterval(() => {
      this.pollBabiesJson();
    }, 4000);
  }

  private async pollBabiesJson() {
    if (this.isDestroyed) return;
    try {
      const res = await fetch(`${this.currentUrl}/babies.json`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          this.parseAllBabies(data);
          this.onStatus?.('connected');
        }
      }
    } catch {
      this.onStatus?.('error');
    }

    // Also check ward state periodically so both PC and phone stay in 100% sync
    void this.fetchWardState();
  }

  private async fetchLegacyNode() {
    try {
      const res = await fetch(`${this.currentUrl}/baby/current.json`);
      if (res.ok) {
        const item = await res.json();
        if (item && typeof item === 'object') {
          this.handleBabyCurrent('baby1', item);
        }
      }
    } catch {
      // ignore
    }
  }

  private parseFirebaseEvent(payload: { path?: string; data?: unknown }) {
    if (!payload) return;
    const path = payload.path || '';
    const data = payload.data;
    const parts = path.split('/').filter(Boolean);

    if (path === '' || path === '/') {
      if (data && typeof data === 'object') {
        this.parseAllBabies(data as Record<string, unknown>);
      }
    } else if (parts.length === 1) {
      const bId = parts[0];
      if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>;
        if (obj.current && typeof obj.current === 'object') {
          this.handleBabyCurrent(bId, obj.current as Record<string, unknown>);
        } else if ('temp' in obj) {
          this.handleBabyCurrent(bId, obj);
        }
      }
    } else if (parts.length >= 2) {
      const bId = parts[0];
      const field = parts[1];
      if (field === 'current' && data && typeof data === 'object') {
        this.handleBabyCurrent(bId, data as Record<string, unknown>);
      } else if (field === 'current' && parts.length === 3 && parts[2] === 'temp') {
        const temp = Number(data);
        if (!isNaN(temp)) {
          this.onUpdate?.({
            deviceId: bId,
            temperature: Math.round(temp * 10) / 10,
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  private parseAllBabies(babies: Record<string, unknown>) {
    for (const key of Object.keys(babies)) {
      const b = babies[key];
      if (b && typeof b === 'object') {
        const obj = b as Record<string, unknown>;
        if (obj.current && typeof obj.current === 'object') {
          this.handleBabyCurrent(key, obj.current as Record<string, unknown>, obj);
        } else if ('temp' in obj) {
          this.handleBabyCurrent(key, obj);
        }
      }
    }
  }

  private handleBabyCurrent(
    key: string,
    curr: Record<string, unknown>,
    parent?: Record<string, unknown>
  ) {
    const rawTemp = curr.temp ?? curr.temperature;
    const tempNum = Number(rawTemp);
    if (isNaN(tempNum) || tempNum <= 0 || tempNum > 60) return;

    const deviceId = String(curr.deviceId || key);
    const battery = curr.battery !== undefined ? Number(curr.battery) : null;
    const name = curr.name ? String(curr.name) : undefined;
    const activeWorkingSeconds = parent?.activeWorkingSeconds
      ? Number(parent.activeWorkingSeconds)
      : undefined;
    const deepSleepMinutes = parent?.deepSleepMinutes
      ? Number(parent.deepSleepMinutes)
      : undefined;

    // Use genuine timestamp recorded by ESP32 (updatedAt), fallback to Date.now() only if completely absent
    const rawTime = curr.updatedAt ?? curr.timestamp ?? curr.time;
    let packetTime = typeof rawTime === 'number' ? rawTime : Number(rawTime);
    if (isNaN(packetTime) || packetTime <= 0) {
      packetTime = Date.now();
    }

    // Parse actual history from Firebase if present
    const historyList: Array<{
      timestamp: number;
      temperature: number;
      battery?: number | null;
      rssi?: number | null;
    }> = [];

    if (parent?.history && typeof parent.history === 'object') {
      const histObj = parent.history as Record<string, Record<string, unknown>>;
      for (const hKey of Object.keys(histObj)) {
        const item = histObj[hKey];
        if (item && typeof item === 'object') {
          const hTemp = Number(item.temp ?? item.temperature);
          const hTime = Number(item.updatedAt ?? item.timestamp ?? item.time);
          if (!isNaN(hTemp) && hTemp > 0 && !isNaN(hTime) && hTime > 0) {
            historyList.push({
              timestamp: hTime,
              temperature: Math.round(hTemp * 10) / 10,
              battery: item.battery !== undefined ? Number(item.battery) : null,
              rssi: item.rssi !== undefined ? Number(item.rssi) : -50,
            });
          }
        }
      }
      historyList.sort((a, b) => a.timestamp - b.timestamp);
    }

    // Ensure the current reading is in the history list if not duplicate
    if (historyList.length === 0) {
      historyList.push({
        timestamp: packetTime,
        temperature: Math.round(tempNum * 10) / 10,
        battery: !isNaN(battery as number) ? battery : null,
        rssi: -50,
      });
    } else {
      const last = historyList[historyList.length - 1];
      if (Math.abs(last.timestamp - packetTime) > 3000 || last.temperature !== Math.round(tempNum * 10) / 10) {
        historyList.push({
          timestamp: packetTime,
          temperature: Math.round(tempNum * 10) / 10,
          battery: !isNaN(battery as number) ? battery : null,
          rssi: -50,
        });
      }
    }

    this.onUpdate?.({
      deviceId,
      temperature: Math.round(tempNum * 10) / 10,
      battery: !isNaN(battery as number) ? battery : null,
      name,
      timestamp: packetTime,
      activeWorkingSeconds,
      deepSleepMinutes,
      history: historyList.length > 0 ? historyList : undefined,
    });
  }
}

/**
 * Send Timing (Active seconds & Deep Sleep minutes) to Firebase for a specific device
 */
export async function saveTimingToFirebase(
  firebaseUrl: string,
  deviceId: string,
  activeSeconds: number,
  sleepMinutes: number
): Promise<boolean> {
  const cleanUrl = cleanFirebaseUrl(firebaseUrl);
  try {
    const promises = [
      fetch(`${cleanUrl}/babies/${encodeURIComponent(deviceId)}/activeWorkingSeconds.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeSeconds),
      }),
      fetch(`${cleanUrl}/babies/${encodeURIComponent(deviceId)}/deepSleepMinutes.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sleepMinutes),
      }),
      // Also update global settings fallback
      fetch(`${cleanUrl}/settings/activeWorkingSeconds.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeSeconds),
      }),
      fetch(`${cleanUrl}/settings/deepSleepMinutes.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sleepMinutes),
      }),
    ];
    await Promise.all(promises);
    return true;
  } catch (err) {
    console.error('Failed to save timing to Firebase:', err);
    return false;
  }
}

/**
 * Send simulated/tested temperature telemetry to Firebase
 */
export async function sendTelemetryToFirebase(
  firebaseUrl: string,
  deviceId: string,
  temp: number,
  battery: number = 95,
  patientName: string = ''
): Promise<boolean> {
  const cleanUrl = cleanFirebaseUrl(firebaseUrl);
  const now = Date.now();
  const payload = {
    name: patientName || deviceId,
    deviceId,
    temp: Math.round(temp * 10) / 10,
    battery,
    level: temp >= 39.5 ? 'วิกฤต' : temp >= 38.5 ? 'ไข้สูง' : temp >= 37.5 ? 'ไข้ต่ำ' : 'ปกติ',
    sensors: 1,
    updatedAt: now,
  };

  try {
    await fetch(`${cleanUrl}/babies/${encodeURIComponent(deviceId)}/current.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // Append to history
    await fetch(`${cleanUrl}/babies/${encodeURIComponent(deviceId)}/history.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (err) {
    console.error('Failed to send telemetry to Firebase:', err);
    return false;
  }
}

/**
 * Sync entire hospital wards & bed layout to Firebase so all devices (PC, Mobile, Tablet) stay in 100% sync
 */
export async function syncWardStateToFirebase(
  firebaseUrl: string,
  wards: Ward[],
  settings?: Partial<WardSettings>,
  updatedAt?: number
): Promise<boolean> {
  const cleanUrl = cleanFirebaseUrl(firebaseUrl);
  try {
    const res = await fetch(`${cleanUrl}/wardState.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wards,
        settings: settings
          ? {
              hospitalName: settings.hospitalName,
              watchThreshold: settings.watchThreshold,
              feverThreshold: settings.feverThreshold,
            }
          : undefined,
        updatedAt: updatedAt || Date.now(),
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Failed to sync wardState to Firebase:', err);
    return false;
  }
}
