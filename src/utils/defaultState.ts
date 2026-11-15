import type { PatientDirectoryEntry, Ward, WardSettings, WardState } from '../types';
import { DEFAULT_FIREBASE_URL, DEFAULT_GOOGLE_SHEETS_URL } from './firebaseSync';

export const DEFAULT_PATIENT_DIRECTORY: PatientDirectoryEntry[] = [
  { hn: '670142', name: 'น้องพอใจ', age: '2 ปี 1 เดือน', notes: 'เฝ้าระวังไข้หลังรับยา' },
  { hn: '670189', name: 'น้องออโต้', age: '1 ปี 5 เดือน', notes: 'มีไข้สูง ติดตามอาการใกล้ชิด' },
  { hn: '670201', name: 'น้องมะลิ', age: '3 ปี 2 เดือน', notes: 'ไข้หวัดใหญ่สายพันธุ์ A' },
  { hn: '670202', name: 'น้องต้นกล้า', age: '11 เดือน', notes: 'สังเกตอาการติดเชื้อทางเดินหายใจ' },
  { hn: '670203', name: 'น้องใบบัว', age: '4 ปี', notes: 'พักฟื้นหลังให้สารน้ำ' },
  { hn: '670204', name: 'น้องภูมิ', age: '1 ปี 9 เดือน', notes: 'เฝ้าระวังอาการชักจากไข้สูง' },
  { hn: '670205', name: 'น้องข้าวหอม', age: '2 ปี 8 เดือน', notes: 'ตรวจติดตามอุณหภูมิทุก 15 นาที' },
];

export const DEFAULT_SETTINGS: WardSettings = {
  hospitalName: 'หอผู้ป่วยเด็ก (Pediatric Monitoring)',
  watchThreshold: 37.5,
  feverThreshold: 38.5,
  offlineTimeoutSec: 600,
  soundEnabled: true,
  soundType: 'beep',
  vibrationEnabled: true,
  firebaseUrl: DEFAULT_FIREBASE_URL,
  firebaseEnabled: true,
  googleSheetsUrl: DEFAULT_GOOGLE_SHEETS_URL,
};

export const DEFAULT_WARDS: Ward[] = [
  {
    id: 'ward-1',
    name: 'วอร์ดกุมารเวชกรรม A (Pediatric Ward)',
    shortName: 'กุมารฯ A',
    layout: {
      gridCols: 5,
      gridRows: 3,
      shape: 'custom',
      structures: [
        {
          id: 'ward-1-st-station',
          type: 'station',
          label: 'เคาน์เตอร์พยาบาลกลาง',
          gridX: 0,
          gridY: 0,
          colSpan: 2,
          rowSpan: 1,
        },
        {
          id: 'ward-1-st-door',
          type: 'door',
          label: 'ประตูทางเข้า',
          gridX: 0,
          gridY: 2,
          colSpan: 1,
          rowSpan: 1,
        },
      ],
    },
    beds: [
      {
        id: 'ward-1-bed-01',
        bedNumber: '01',
        label: 'เตียง 01',
        row: 1,
        order: 0,
        gridX: 3,
        gridY: 1,
        patient: {
          name: 'น้องพอใจ',
          hn: '670142',
          age: '2 ปี 1 เดือน',
          notes: 'เฝ้าระวังไข้หลังรับยา',
          admittedAt: Date.now() - 3600000 * 4,
        },
        deviceId: 'baby1',
        muted: false,
      },
      {
        id: 'ward-1-bed-02',
        bedNumber: '02',
        label: 'เตียง 02',
        row: 1,
        order: 1,
        gridX: 2,
        gridY: 0,
        patient: {
          name: 'น้องพอใจ',
          hn: '670142',
          age: '2 ปี 1 เดือน',
          notes: 'เฝ้าระวังไข้หลังรับยา',
          admittedAt: Date.now() - 3600000 * 4,
        },
        deviceId: 'baby3',
        muted: false,
      },
      {
        id: 'ward-1-bed-03',
        bedNumber: '03',
        label: 'เตียง 03',
        row: 1,
        order: 2,
        gridX: 3,
        gridY: 0,
        patient: null,
        deviceId: null,
        muted: false,
      },
      {
        id: 'ward-1-bed-04',
        bedNumber: '04',
        label: 'เตียง 04',
        row: 1,
        order: 3,
        gridX: 4,
        gridY: 0,
        patient: null,
        deviceId: null,
        muted: false,
      },
      {
        id: 'ward-1-bed-05',
        bedNumber: '05',
        label: 'เตียง 05',
        row: 1,
        order: 4,
        gridX: 2,
        gridY: 1,
        patient: null,
        deviceId: null,
        muted: false,
      },
      {
        id: 'ward-1-bed-06',
        bedNumber: '06',
        label: 'เตียง 06',
        row: 1,
        order: 5,
        gridX: 4,
        gridY: 1,
        patient: null,
        deviceId: null,
        muted: false,
      },
      {
        id: 'ward-1-bed-07',
        bedNumber: '07',
        label: 'เตียง 07',
        row: 2,
        order: 6,
        gridX: 1,
        gridY: 1,
        patient: null,
        deviceId: null,
        muted: false,
      },
    ],
  },
  {
    id: 'ward-2',
    name: 'วอร์ดทารกแรกเกิด (NICU)',
    shortName: 'NICU',
    layout: {
      gridCols: 5,
      gridRows: 3,
      shape: 'standard',
      structures: [
        {
          id: 'ward-2-st-station',
          type: 'station',
          label: 'เคาน์เตอร์พยาบาล NICU',
          gridX: 0,
          gridY: 0,
          colSpan: 2,
          rowSpan: 1,
        },
        {
          id: 'ward-2-st-door',
          type: 'door',
          label: 'ประตูปลอดเชื้อ',
          gridX: 0,
          gridY: 2,
          colSpan: 1,
          rowSpan: 1,
        },
      ],
    },
    beds: [
      {
        id: 'ward-2-bed-01',
        bedNumber: 'N1',
        label: 'ตู้อบ N1',
        row: 1,
        order: 0,
        gridX: 2,
        gridY: 0,
        patient: {
          name: 'น้องต้นกล้า',
          hn: '670202',
          age: '11 เดือน',
          notes: 'สังเกตอาการติดเชื้อทางเดินหายใจ',
          admittedAt: Date.now() - 3600000 * 12,
        },
        deviceId: null,
        muted: false,
      },
      {
        id: 'ward-2-bed-02',
        bedNumber: 'N2',
        label: 'ตู้อบ N2',
        row: 1,
        order: 1,
        gridX: 3,
        gridY: 0,
        patient: null,
        deviceId: null,
        muted: false,
      },
      {
        id: 'ward-2-bed-03',
        bedNumber: 'N3',
        label: 'ตู้อบ N3',
        row: 1,
        order: 2,
        gridX: 2,
        gridY: 1,
        patient: null,
        deviceId: null,
        muted: false,
      },
      {
        id: 'ward-2-bed-04',
        bedNumber: 'N4',
        label: 'ตู้อบ N4',
        row: 1,
        order: 3,
        gridX: 3,
        gridY: 1,
        patient: null,
        deviceId: null,
        muted: false,
      },
    ],
  },
];

export const INITIAL_WARD_STATE: WardState = {
  wards: DEFAULT_WARDS,
  devices: {},
  alerts: [],
  settings: DEFAULT_SETTINGS,
  serverTime: Date.now(),
};

export const WARD_STATE_STORAGE_KEY = 'babytemp_hospital_ward_state_v2';

export function loadPersistedWardState(): WardState {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(WARD_STATE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as WardState;
        if (parsed && Array.isArray(parsed.wards) && parsed.wards.length > 0) {
          // ensure settings and devices object exist
          const mergedSettings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
          if (!mergedSettings.firebaseUrl) {
            mergedSettings.firebaseUrl = DEFAULT_FIREBASE_URL;
          }
          if (typeof mergedSettings.firebaseEnabled !== 'boolean') {
            mergedSettings.firebaseEnabled = true;
          }
          return {
            ...INITIAL_WARD_STATE,
            ...parsed,
            settings: mergedSettings,
            devices: parsed.devices || {},
            alerts: parsed.alerts || [],
          };
        }
      }
    } catch (e) {
      console.warn('Failed to parse localStorage ward state', e);
    }
  }
  return INITIAL_WARD_STATE;
}

export function savePersistedWardState(state: WardState): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(WARD_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota exceeded
    }
  }
}

export const PATIENT_DIRECTORY_STORAGE_KEY = 'babytemp_patient_directory_v2';

export function loadPatientDirectory(): PatientDirectoryEntry[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(PATIENT_DIRECTORY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const map = new Map<string, PatientDirectoryEntry>();
          for (const d of DEFAULT_PATIENT_DIRECTORY) {
            map.set(d.hn.trim().toLowerCase(), d);
          }
          for (const p of parsed) {
            if (p && p.hn) {
              map.set(p.hn.trim().toLowerCase(), p);
            }
          }
          return Array.from(map.values());
        }
      }
    } catch {}
  }
  return [...DEFAULT_PATIENT_DIRECTORY];
}

export function savePatientDirectory(list: PatientDirectoryEntry[]): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PATIENT_DIRECTORY_STORAGE_KEY, JSON.stringify(list));
    } catch {}
  }
}

export async function upsertPatientToDirectory(
  entry: PatientDirectoryEntry,
  firebaseUrl?: string
): Promise<PatientDirectoryEntry[]> {
  const current = loadPatientDirectory();
  const map = new Map<string, PatientDirectoryEntry>();
  for (const item of current) {
    map.set(item.hn.trim().toLowerCase(), item);
  }
  map.set(entry.hn.trim().toLowerCase(), {
    hn: entry.hn.trim(),
    name: entry.name.trim(),
    age: entry.age?.trim() || '',
    notes: entry.notes?.trim() || '',
  });
  const updated = Array.from(map.values());
  savePatientDirectory(updated);

  if (firebaseUrl) {
    try {
      const cleanUrl = firebaseUrl.endsWith('/') ? firebaseUrl.slice(0, -1) : firebaseUrl;
      await fetch(`${cleanUrl}/patientDirectory/${encodeURIComponent(entry.hn.trim())}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch {}
  }

  return updated;
}

export function findPatientInWardsOrDirectory(
  queryHn: string,
  allWards?: Ward[],
  directory?: PatientDirectoryEntry[]
): PatientDirectoryEntry | null {
  const clean = queryHn.trim().toLowerCase();
  if (!clean) return null;

  // 1. Check current directory
  const dir = directory && directory.length > 0 ? directory : loadPatientDirectory();
  const foundInDir = dir.find((p) => p.hn.trim().toLowerCase() === clean);
  if (foundInDir) return foundInDir;

  // 2. Check all beds across all wards
  if (allWards) {
    for (const w of allWards) {
      for (const b of w.beds) {
        if (b.patient && b.patient.hn && b.patient.hn.trim().toLowerCase() === clean) {
          return {
            hn: b.patient.hn.trim(),
            name: b.patient.name.trim(),
            age: b.patient.age?.trim() || '',
            notes: b.patient.notes?.trim() || '',
          };
        }
      }
    }
  }

  return null;
}
