export interface TemperatureReading {
  timestamp: number;
  temperature: number;
  sensors?: (number | null)[];
  battery?: number | null;
  rssi?: number | null;
}

export interface EspDevice {
  deviceId: string;
  label?: string;
  temperature: number | null;
  sensors?: (number | null)[];
  validSensorCount?: number;
  battery: number | null;
  rssi: number | null;
  firmware?: string;
  lastSeen: number | null;
  packetCount: number;
  history: TemperatureReading[];
  activeWorkingSeconds?: number;
  deepSleepMinutes?: number;
}

export interface PatientInfo {
  name: string;
  hn: string;
  age?: string;
  notes?: string;
  admittedAt: number;
}

export interface BedSlot {
  id: string;
  bedNumber: string;
  label: string;
  row: 1 | 2;
  order: number;
  gridX: number;
  gridY: number;
  patient: PatientInfo | null;
  deviceId: string | null;
  muted: boolean;
}

export type WardStructureType = 'station' | 'corridor' | 'door' | 'zone';

export interface WardStructure {
  id: string;
  type: WardStructureType;
  label: string;
  gridX: number;
  gridY: number;
  colSpan: number;
  rowSpan: number;
}

export type WardPresetShape = 'standard' | 'single_row' | 'l_shape' | 'u_shape' | 'custom';

export interface WardLayout {
  gridCols: number;
  gridRows: number;
  shape: WardPresetShape;
  structures: WardStructure[];
}

export interface Ward {
  id: string;
  name: string;
  shortName: string;
  layout: WardLayout;
  beds: BedSlot[];
}

export interface WardAlert {
  id: string;
  wardId: string;
  wardName: string;
  bedId: string | null;
  bedLabel: string;
  patientName: string;
  deviceId: string;
  temperature: number;
  severity: 'watch' | 'fever' | 'offline';
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

export type NotificationSoundType = 'beep' | 'chime' | 'urgent' | 'bell' | 'pulse';

export interface WardSettings {
  hospitalName: string;
  watchThreshold: number;
  feverThreshold: number;
  offlineTimeoutSec: number;
  soundEnabled: boolean;
  soundType: NotificationSoundType;
  vibrationEnabled: boolean;
  firebaseUrl?: string;
  firebaseEnabled?: boolean;
  googleSheetsUrl?: string;
  defaultActiveSeconds?: number;
  defaultSleepMinutes?: number;
}

export interface WardState {
  wards: Ward[];
  devices: Record<string, EspDevice>;
  alerts: WardAlert[];
  settings: WardSettings;
  serverTime: number;
}

export interface PatientDirectoryEntry {
  hn: string;
  name: string;
  age: string;
  notes: string;
}

export type BedTempStatus = 'empty' | 'waiting' | 'normal' | 'watch' | 'fever' | 'offline';

export type ServerWsMessage =
  | { type: 'init'; state: WardState }
  | { type: 'state:sync'; state: WardState }
  | { type: 'telemetry:update'; device: EspDevice; alert?: WardAlert | null; serverTime: number }
  | { type: 'alert:created'; alert: WardAlert };
