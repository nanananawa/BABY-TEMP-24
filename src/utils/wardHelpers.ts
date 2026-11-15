import type {
  BedSlot,
  BedTempStatus,
  EspDevice,
  NotificationSoundType,
  WardSettings,
} from '../types';

export function getBedStatus(
  bed: BedSlot,
  device: EspDevice | undefined,
  settings: WardSettings,
  now: number
): BedTempStatus {
  if (!bed.patient) return 'empty';
  if (!bed.deviceId || !device || device.temperature === null || device.lastSeen === null) {
    return 'waiting';
  }
  const ageSec = (now - device.lastSeen) / 1000;
  // Adaptive Timeout: เผื่อเวลา Deep Sleep ของบอร์ด + เวลาเชื่อม WiFi และส่งข้อมูล (อย่างน้อย 2 รอบส่ง + 90 วินาที)
  // ป้องกันไม่ให้ขึ้น "ขาดสัญญาณ" สลับไปมาก่อนที่บอร์ดจะส่งแพ็กเกจใหม่
  const sleepSec = (device.deepSleepMinutes ?? 5) * 60;
  const timeoutSec = Math.max(settings.offlineTimeoutSec || 600, sleepSec * 2 + 90);
  if (ageSec > timeoutSec) {
    return 'offline';
  }
  if (device.temperature >= settings.feverThreshold) {
    return 'fever';
  }
  if (device.temperature >= settings.watchThreshold) {
    return 'watch';
  }
  return 'normal';
}

export function getStatusLabel(status: BedTempStatus): string {
  switch (status) {
    case 'normal':
      return 'ปกติ';
    case 'watch':
      return 'เฝ้าระวัง';
    case 'fever':
      return 'ไข้สูง';
    case 'offline':
      return 'ขาดสัญญาณ';
    case 'waiting':
      return 'รอสัญญาณ';
    default:
      return 'ว่าง';
  }
}

export function getStayDaysCount(admittedAt: number, now: number): number {
  const diffMs = Math.max(0, now - admittedAt);
  return Math.max(1, Math.floor(diffMs / 86_400_000) + 1);
}

export function formatStayBadgeThai(admittedAt: number, now: number): string {
  const diffMs = Math.max(0, now - admittedAt);
  const fullDays = Math.floor(diffMs / 86_400_000);
  if (fullDays < 1) {
    const hours = Math.max(1, Math.floor(diffMs / 3_600_000));
    return `อยู่ ${hours} ชม.`;
  }
  return `อยู่มา ${fullDays} วัน`;
}

export function formatStayDetailThai(admittedAt: number, now: number): string {
  const diffMs = Math.max(0, now - admittedAt);
  const fullDays = Math.floor(diffMs / 86_400_000);
  const remHours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  if (fullDays === 0) {
    return `อยู่มาแล้ว ${Math.max(1, remHours)} ชั่วโมง (วันที่ 1)`;
  }
  return `อยู่มาแล้ว ${fullDays} วัน ${remHours} ชั่วโมง (วันที่ ${fullDays + 1})`;
}

export function formatAdmitDateThai(admittedAt: number): string {
  return new Date(admittedAt).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatRelativeThai(timestamp: number | null, now: number): string {
  if (!timestamp) return 'ยังไม่มีข้อมูล';
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 5) return 'เมื่อสักครู่';
  if (diffSec < 60) return `${diffSec} วินาทีที่แล้ว`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr} ชั่วโมงที่แล้ว`;
}

export function formatClockThai(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatShortTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function exportBedCsv(bed: BedSlot, device: EspDevice | undefined, wardName?: string) {
  const rows = [
    [
      'Ward',
      'Bed',
      'Patient',
      'HN',
      'AdmittedAt',
      'DeviceID',
      'Timestamp',
      'ISO_Time',
      'Avg_Temperature_C',
      'DS18B20_1',
      'DS18B20_2',
      'DS18B20_3',
      'DS18B20_4',
      'Battery_Pct',
      'RSSI_dBm',
    ].join(','),
  ];
  const history = device?.history ?? [];
  for (const point of history) {
    const s = point.sensors ?? [];
    rows.push(
      [
        `"${wardName ?? ''}"`,
        `"${bed.label}"`,
        `"${bed.patient?.name ?? ''}"`,
        `"${bed.patient?.hn ?? ''}"`,
        `"${bed.patient ? new Date(bed.patient.admittedAt).toISOString() : ''}"`,
        `"${device?.deviceId ?? ''}"`,
        point.timestamp,
        `"${new Date(point.timestamp).toISOString()}"`,
        point.temperature.toFixed(1),
        s[0] !== null && s[0] !== undefined ? s[0].toFixed(1) : '',
        s[1] !== null && s[1] !== undefined ? s[1].toFixed(1) : '',
        s[2] !== null && s[2] !== undefined ? s[2].toFixed(1) : '',
        s[3] !== null && s[3] !== undefined ? s[3].toFixed(1) : '',
        point.battery ?? '',
        point.rssi ?? '',
      ].join(',')
    );
  }
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `babytemp_${bed.bedNumber}_${device?.deviceId ?? 'node'}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const NOTIFICATION_SOUNDS: Array<{
  id: NotificationSoundType;
  label: string;
  description: string;
}> = [
  { id: 'beep', label: 'บี๊บมาตรฐาน (Clinical Beep)', description: 'เสียงบี๊บคู่ 880Hz มาตรฐานมอนิเตอร์โรงพยาบาล' },
  { id: 'chime', label: 'กระดิ่งนุ่มนวล (Soft Chime)', description: 'โทนเสียง C-E-G นุ่มนวล ไม่รบกวนเด็กหลับ' },
  { id: 'urgent', label: 'ไซเรนไข้สูง (Urgent Alarm)', description: 'เสียงเตือน 2 โทนสูง-ต่ำ 3 จังหวะชัดเจน' },
  { id: 'bell', label: 'ระฆังพยาบาล (Nurse Bell)', description: 'เสียงระฆังเรียกพยาบาลกังวานใส' },
  { id: 'pulse', label: 'พัลส์ถี่ (Rapid Pulse)', description: 'เสียงจังหวะสั้นต่อเนื่อง 4 ครั้ง' },
];

let audioCtx: AudioContext | null = null;

function scheduleTone(
  ctx: AudioContext,
  startOffset: number,
  duration: number,
  freq: number,
  type: OscillatorType = 'sine',
  peakGain = 0.09,
  endFreq?: number
) {
  const startTime = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
  }
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

export function playNotificationSound(soundType: NotificationSoundType = 'beep') {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!audioCtx) {
      audioCtx = new AudioContextCtor();
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }

    switch (soundType) {
      case 'chime':
        scheduleTone(audioCtx, 0, 0.24, 523.25, 'sine', 0.08); // C5
        scheduleTone(audioCtx, 0.14, 0.26, 659.25, 'sine', 0.08); // E5
        scheduleTone(audioCtx, 0.28, 0.36, 783.99, 'sine', 0.07); // G5
        break;
      case 'urgent':
        [0, 0.26, 0.52].forEach((offset) => {
          if (!audioCtx) return;
          scheduleTone(audioCtx, offset, 0.11, 987.77, 'triangle', 0.11); // B5
          scheduleTone(audioCtx, offset + 0.11, 0.11, 740.0, 'triangle', 0.1); // F#5
        });
        break;
      case 'bell':
        scheduleTone(audioCtx, 0, 0.45, 1046.5, 'sine', 0.09); // C6
        scheduleTone(audioCtx, 0.01, 0.42, 1567.98, 'sine', 0.035); // harmonic
        scheduleTone(audioCtx, 0.34, 0.5, 1318.51, 'sine', 0.08); // E6
        break;
      case 'pulse':
        [0, 0.11, 0.22, 0.33].forEach((offset) => {
          if (!audioCtx) return;
          scheduleTone(audioCtx, offset, 0.08, 1174.66, 'square', 0.045); // D6 soft square
        });
        break;
      case 'beep':
      default:
        [0, 0.22].forEach((offset) => {
          if (!audioCtx) return;
          scheduleTone(audioCtx, offset, 0.16, 880, 'sine', 0.085);
        });
        break;
    }
  } catch {
    // Ignore autoplay restriction before first user interaction
  }
}

export function playFeverAlarmBeep() {
  playNotificationSound('beep');
}

export function isVibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function triggerNotificationVibration(
  severity: 'fever' | 'watch' | 'test' = 'fever'
): boolean {
  try {
    if (!isVibrationSupported()) return false;
    if (severity === 'watch') {
      return navigator.vibrate([160, 90, 160]);
    }
    return navigator.vibrate([260, 110, 260, 110, 400]);
  } catch {
    return false;
  }
}
