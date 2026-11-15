import React, { useState } from 'react';
import {
  ArrowLeftRight,
  BatteryCharging,
  Bell,
  BellOff,
  CalendarClock,
  Clock,
  Cpu,
  Download,
  Eraser,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  LogOut,
  Pencil,
  Signal,
  Table,
  Thermometer,
  UserRound,
  X,
} from 'lucide-react';
import type { BedSlot, EspDevice, Ward, WardSettings } from '../types';
import {
  exportBedCsv,
  formatAdmitDateThai,
  formatClockThai,
  formatRelativeThai,
  formatStayDetailThai,
  getBedStatus,
  getStatusLabel,
} from '../utils/wardHelpers';
import { exportWardsToCsv, exportWardsToExcel } from '../utils/exportHelpers';
import { DEFAULT_FIREBASE_URL, DEFAULT_GOOGLE_SHEETS_URL, sendTelemetryToFirebase } from '../utils/firebaseSync';
import { TemperatureChart } from './TemperatureChart';
import { TimingModal } from './TimingModal';
import { TransferPatientModal } from './TransferPatientModal';

interface BedDetailModalProps {
  ward: Ward;
  allWards: Ward[];
  bed: BedSlot;
  device: EspDevice | undefined;
  allDevices: EspDevice[];
  settings: WardSettings;
  now: number;
  onClose: () => void;
  onPairDevice: (wardId: string, bedId: string, deviceId: string | null) => Promise<void>;
  onToggleMute: (wardId: string, bed: BedSlot) => Promise<void>;
  onClearTemp: (wardId: string, bedId: string) => Promise<void>;
  onUpdateAdmitDate: (wardId: string, bedId: string, admittedAt: number) => Promise<void>;
  onDischarge: (wardId: string, bedId: string) => Promise<void>;
  onSimulateTemp?: (deviceId: string, temp: number) => Promise<void>;
  onUpdatePatient?: (
    wardId: string,
    bedId: string,
    data: { name?: string; hn?: string; age?: string; notes?: string }
  ) => Promise<void>;
  onTransferPatient?: (
    fromWardId: string,
    fromBedId: string,
    toWardId: string,
    toBedId: string,
    moveDevice: boolean
  ) => Promise<void>;
}

function toDateInputValue(epochMs: number): string {
  const d = new Date(epochMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const BedDetailModal: React.FC<BedDetailModalProps> = ({
  ward,
  allWards,
  bed,
  device,
  allDevices,
  settings,
  now,
  onClose,
  onPairDevice,
  onToggleMute,
  onClearTemp,
  onUpdateAdmitDate,
  onDischarge,
  onUpdatePatient,
  onTransferPatient,
}) => {
  const [selectedDeviceId, setSelectedDeviceId] = useState(bed.deviceId ?? '');
  const [customDeviceId, setCustomDeviceId] = useState('');
  const [confirmDischarge, setConfirmDischarge] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [confirmClearTemp, setConfirmClearTemp] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [admitDateStr, setAdmitDateStr] = useState(
    bed.patient ? toDateInputValue(bed.patient.admittedAt) : toDateInputValue(now)
  );
  const [busy, setBusy] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [activeWorkingSec, setActiveWorkingSec] = useState<number>(device?.activeWorkingSeconds ?? 15);
  const [deepSleepMin, setDeepSleepMin] = useState<number>(device?.deepSleepMinutes ?? 5);

  // Edit Patient (Name, HN, Age, Notes)
  const [editingPatient, setEditingPatient] = useState(false);
  const [editName, setEditName] = useState(bed.patient?.name ?? '');
  const [editHn, setEditHn] = useState(bed.patient?.hn ?? '');
  const [editAge, setEditAge] = useState(bed.patient?.age ?? '');
  const [editNotes, setEditNotes] = useState(bed.patient?.notes ?? '');

  if (!bed.patient) return null;

  const handleSavePatient = async () => {
    if (!editName.trim() || !editHn.trim()) return;
    setBusy(true);
    try {
      if (onUpdatePatient) {
        await onUpdatePatient(ward.id, bed.id, {
          name: editName.trim(),
          hn: editHn.trim(),
          age: editAge.trim(),
          notes: editNotes.trim(),
        });
      } else {
        await fetch(
          `/api/wards/${encodeURIComponent(ward.id)}/beds/${encodeURIComponent(bed.id)}/patient`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: editName.trim(),
              hn: editHn.trim(),
              age: editAge.trim(),
              notes: editNotes.trim(),
            }),
          }
        );
      }
      setEditingPatient(false);
    } finally {
      setBusy(false);
    }
  };

  const status = getBedStatus(bed, device, settings, now);
  const history = device?.history ?? [];
  const recentRows = [...history].reverse().slice(0, 8);

  const handleSimulateTemp = async (tempVal: number) => {
    const targetDevId = bed.deviceId || 'ESP32-S3-01';
    setSimulating(true);
    try {
      await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: targetDevId,
          temperature: tempVal,
          sensors: [tempVal, tempVal, tempVal, tempVal],
          battery: 95,
          rssi: -55,
        }),
      }).catch(() => {});

      if (settings.firebaseUrl || settings.firebaseEnabled) {
        await sendTelemetryToFirebase(
          settings.firebaseUrl || DEFAULT_FIREBASE_URL,
          targetDevId,
          tempVal,
          95,
          bed.patient?.name || ''
        ).catch(() => {});
      }
    } finally {
      setSimulating(false);
    }
  };

  const handleExportExcel = () => {
    exportWardsToExcel(allWards, { [device?.deviceId || '']: device! }, settings, {
      scope: 'single',
      selectedBedId: bed.id,
    });
  };

  const handleExportCsv = () => {
    exportWardsToCsv(allWards, { [device?.deviceId || '']: device! }, settings, {
      scope: 'single',
      selectedBedId: bed.id,
    });
  };

  const handleOpenGoogleSheets = () => {
    const url = settings.googleSheetsUrl || DEFAULT_GOOGLE_SHEETS_URL;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const findDeviceOwner = (devId: string): string | null => {
    for (const w of allWards) {
      const b = w.beds.find((slot) => slot.deviceId === devId && slot.id !== bed.id);
      if (b) return `${w.shortName} · ${b.label}`;
    }
    return null;
  };

  const handleSavePair = async () => {
    setBusy(true);
    try {
      const targetId = customDeviceId.trim() || selectedDeviceId.trim() || null;
      await onPairDevice(ward.id, bed.id, targetId);
      setCustomDeviceId('');
      if (targetId) setSelectedDeviceId(targetId);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmClearTemp = async () => {
    setBusy(true);
    try {
      await onClearTemp(ward.id, bed.id);
      setConfirmClearTemp(false);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAdmitDate = async () => {
    const parsed = new Date(`${admitDateStr}T08:00:00`).getTime();
    if (!Number.isFinite(parsed)) return;
    setBusy(true);
    try {
      await onUpdateAdmitDate(ward.id, bed.id, Math.min(Date.now(), parsed));
      setEditingDate(false);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDischarge = async () => {
    setBusy(true);
    try {
      await onDischarge(ward.id, bed.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* Top Modal Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-100 bg-white/95 backdrop-blur px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-white whitespace-nowrap shrink-0">
              {ward.shortName} · {bed.label}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-lg font-bold text-slate-900 truncate">
                  {bed.patient.name}
                </h2>
                {bed.patient.hn ? (
                  <span className="font-mono-tabular text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-lg shrink-0">
                    HN: {bed.patient.hn}
                  </span>
                ) : (
                  <span className="font-mono-tabular text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg shrink-0">
                    ยังไม่มี HN
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditName(bed.patient?.name || '');
                    setEditHn(bed.patient?.hn || '');
                    setEditAge(bed.patient?.age || '');
                    setEditNotes(bed.patient?.notes || '');
                    setEditingPatient(!editingPatient);
                  }}
                  className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 cursor-pointer shadow-2xs"
                >
                  {editingPatient ? '✕ ปิดแก้ไข' : '✏️ แก้ไขข้อมูล/HN'}
                </button>
                {onTransferPatient && (
                  <button
                    type="button"
                    onClick={() => setTransferOpen(true)}
                    className="rounded-lg border border-teal-300 bg-teal-50 hover:bg-teal-100 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800 cursor-pointer shadow-2xs inline-flex items-center gap-1"
                  >
                    <ArrowLeftRight className="w-3 h-3 text-teal-600" />
                    ย้ายเตียง
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono-tabular truncate">
                {bed.patient.age ? `อายุ ${bed.patient.age}` : ''}
                {bed.patient.notes ? ` · ${bed.patient.notes}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Patient Edit Panel */}
        {editingPatient && (
          <div className="bg-amber-50/80 border-b border-amber-200 px-6 py-4">
            <div className="text-xs font-bold text-amber-900 mb-2 flex items-center gap-1.5">
              <span>✏️</span> แก้ไขข้อมูลประจำตัวผู้ป่วยเด็ก และหมายเลข HN
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  รหัสประจำตัว HN <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editHn}
                    onChange={(e) => setEditHn(e.target.value)}
                    placeholder="เช่น HN-00123"
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const rand = Math.floor(1000 + Math.random() * 9000);
                      setEditHn(`HN-${rand}`);
                    }}
                    className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-2 py-1 text-[11px] text-slate-700 font-medium cursor-pointer"
                  >
                    สุ่ม
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ชื่อ-นามสกุล <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="เช่น ด.ช. ธนกร มั่งคั่ง"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  อายุ (เดือน / วัน / ปี)
                </label>
                <input
                  type="text"
                  value={editAge}
                  onChange={(e) => setEditAge(e.target.value)}
                  placeholder="เช่น 1 เดือน 15 วัน"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  หมายเหตุ / อาการเฝ้าระวัง
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="เช่น สังเกตไข้หลังฉีดวัคซีน"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-amber-200/60">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditingPatient(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={busy || !editName.trim() || !editHn.trim()}
                onClick={handleSavePatient}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {busy ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข HN / ข้อมูล'}
              </button>
            </div>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Stay Duration Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-sky-100 text-sky-700">
                <CalendarClock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-sky-900 font-mono-tabular">
                  {formatStayDetailThai(bed.patient.admittedAt, now)}
                </div>
                <div className="text-[11px] text-sky-700">
                  เข้ารับการรักษาเมื่อ {formatAdmitDateThai(bed.patient.admittedAt)}
                </div>
              </div>
            </div>

            {!editingDate ? (
              <button
                type="button"
                onClick={() => {
                  setAdmitDateStr(toDateInputValue(bed.patient!.admittedAt));
                  setEditingDate(true);
                }}
                className="rounded-lg border border-sky-200 bg-white hover:bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 cursor-pointer"
              >
                แก้ไขวันเข้าพัก
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={admitDateStr}
                  max={toDateInputValue(now)}
                  onChange={(e) => setAdmitDateStr(e.target.value)}
                  className="rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs font-mono-tabular focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSaveAdmitDate}
                  className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  onClick={() => setEditingDate(false)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 cursor-pointer"
                >
                  ยกเลิก
                </button>
              </div>
            )}
          </div>

          {/* Live Telemetry Summary Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Temperature KPI */}
            <div
              className={`rounded-2xl border p-4 ${
                status === 'fever'
                  ? 'border-rose-200 bg-rose-50/70'
                  : status === 'watch'
                    ? 'border-amber-200 bg-amber-50/70'
                    : status === 'normal'
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <Thermometer className="w-4 h-4" />
                  อุณหภูมิปัจจุบัน
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                    status === 'fever'
                      ? 'bg-rose-100 text-rose-700'
                      : status === 'watch'
                        ? 'bg-amber-100 text-amber-700'
                        : status === 'normal'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {getStatusLabel(status)}
                </span>
              </div>
              <div
                className={`mt-2 font-mono-tabular text-3xl font-bold ${
                  status === 'fever'
                    ? 'text-rose-600'
                    : status === 'watch'
                      ? 'text-amber-600'
                      : status === 'normal'
                        ? 'text-emerald-600'
                        : 'text-slate-500'
                }`}
              >
                {device?.temperature !== null && device?.temperature !== undefined
                  ? `${device.temperature.toFixed(1)} °C`
                  : '--.- °C'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 font-mono-tabular">
                อัปเดตล่าสุด: {formatRelativeThai(device?.lastSeen ?? null, now)}
              </div>
            </div>

            {/* Paired ESP32-S3 Info */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-teal-600" />
                  โมดูลอุปกรณ์
                </span>
                <span className="font-mono-tabular text-[11px] text-slate-400">
                  {device ? `${device.packetCount} pkts` : 'ยังไม่เชื่อม'}
                </span>
              </div>
              <div className="mt-2 font-mono-tabular text-base font-bold text-slate-900 truncate">
                {bed.deviceId ?? 'ยังไม่ได้ผูกอุปกรณ์'}
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs font-mono-tabular text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <BatteryCharging className={`w-3.5 h-3.5 ${device?.battery !== null && device?.battery !== undefined ? 'text-emerald-600' : 'text-slate-400'}`} />
                  {device?.battery !== null && device?.battery !== undefined
                    ? `${device.battery}%`
                    : '--%'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Signal className={`w-3.5 h-3.5 ${device?.rssi !== null && device?.rssi !== undefined ? 'text-sky-600' : 'text-slate-400'}`} />
                  {device?.rssi !== null && device?.rssi !== undefined
                    ? `${device.rssi} dBm`
                    : '-- dBm'}
                </span>
              </div>
            </div>

            {/* Quick Actions (Mute, Clear Temp, CSV) */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 flex flex-col justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <UserRound className="w-4 h-4 text-slate-500" />
                ควบคุม & จัดการค่าวัด
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => onToggleMute(ward.id, bed)}
                  className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                    bed.muted
                      ? 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                      : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  {bed.muted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                  {bed.muted ? 'ปิดเสียงอยู่' : 'เปิดเสียงเตือน'}
                </button>

                <button
                  type="button"
                  onClick={() => exportBedCsv(bed, device, ward.name)}
                  disabled={history.length === 0}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>

                {!confirmClearTemp ? (
                  <button
                    type="button"
                    disabled={!bed.deviceId || (history.length === 0 && device?.temperature === null)}
                    onClick={() => setConfirmClearTemp(true)}
                    className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40 cursor-pointer"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    ล้างค่าอุณหภูมิ
                  </button>
                ) : (
                  <div className="flex items-center gap-1 w-full pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleConfirmClearTemp}
                      className="rounded-lg bg-rose-600 hover:bg-rose-700 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                    >
                      ยืนยันล้างค่า
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearTemp(false)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Timing & Deep Sleep Panel */}
          <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50/70 to-emerald-50/70 p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-teal-600 text-white shadow-xs">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">
                  รอบการทำงาน & โหมดประหยัดพลังงาน (อุปกรณ์)
                </div>
                <div className="text-[11px] text-teal-800 font-mono-tabular font-medium">
                  สถานะปัจจุบัน: ทำงาน {activeWorkingSec} วินาที • หลับพัก {deepSleepMin} นาที
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTimingOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-teal-300 hover:bg-teal-50 px-3.5 py-1.5 text-xs font-bold text-teal-800 shadow-xs cursor-pointer transition-colors"
            >
              <span>⏱️ ปรับเวลา Deep Sleep</span>
            </button>
          </div>

          {/* Quick Temperature Simulation Buttons */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800 inline-flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-purple-600" />
                ทดสอบจำลองวัดไข้ (Simulation Test)
              </span>
              <span className="text-[11px] text-slate-500">
                กดเพื่อทดสอบเสียงเตือนและระบบไข้เรียลไทม์
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                disabled={simulating}
                onClick={() => handleSimulateTemp(36.8)}
                className="rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 p-2 text-center text-xs font-bold text-emerald-800 cursor-pointer transition-colors disabled:opacity-50"
              >
                36.8°C (ปกติ)
              </button>
              <button
                type="button"
                disabled={simulating}
                onClick={() => handleSimulateTemp(37.8)}
                className="rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 p-2 text-center text-xs font-bold text-amber-800 cursor-pointer transition-colors disabled:opacity-50"
              >
                37.8°C (ไข้ต่ำ)
              </button>
              <button
                type="button"
                disabled={simulating}
                onClick={() => handleSimulateTemp(38.8)}
                className="rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 p-2 text-center text-xs font-bold text-rose-800 cursor-pointer transition-colors disabled:opacity-50"
              >
                38.8°C (ไข้สูง 🔔)
              </button>
              <button
                type="button"
                disabled={simulating}
                onClick={() => handleSimulateTemp(39.8)}
                className="rounded-xl border border-purple-300 bg-purple-50 hover:bg-purple-100 p-2 text-center text-xs font-bold text-purple-800 cursor-pointer transition-colors disabled:opacity-50"
              >
                39.8°C (วิกฤต 🚨)
              </button>
            </div>
          </div>

          {/* Export & Google Sheets Panel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-800">ส่งออกประวัติ & บันทึกค่าวัด</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>ส่งออก Excel (.xls)</span>
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={handleOpenGoogleSheets}
                className="inline-flex items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors"
              >
                <Table className="w-3.5 h-3.5" />
                <span>เปิด Google Sheets</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Real-Time Temperature Graph */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              กราฟแนวโน้มอุณหภูมิแบบเรียลไทม์ ({history.length} จุดข้อมูลล่าสุด)
            </h3>
            <TemperatureChart history={history} settings={settings} />
          </div>

          {/* Reassign ESP32-S3 Device ID */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="text-sm font-bold text-slate-900">
              เปลี่ยน / ผูกรหัสอุปกรณ์ประจำเตียง
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              เลือกรหัสอุปกรณ์ที่ตรวจพบในระบบ หรือพิมพ์รหัสอุปกรณ์ใหม่ที่ตั้งไว้
            </p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2.5">
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  setCustomDeviceId('');
                }}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono-tabular text-slate-800 focus:border-teal-500 focus:outline-none"
              >
                <option value="">-- ไม่ผูกอุปกรณ์ --</option>
                {allDevices.map((d) => {
                  const usedBy = findDeviceOwner(d.deviceId);
                  return (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.deviceId}
                      {d.temperature !== null ? ` (${d.temperature.toFixed(1)}°C)` : ''}
                      {usedBy ? ` — ใช้อยู่ที่ ${usedBy}` : ' — ว่าง'}
                    </option>
                  );
                })}
              </select>

              <input
                type="text"
                value={customDeviceId}
                onChange={(e) => setCustomDeviceId(e.target.value)}
                placeholder="หรือพิมพ์รหัสใหม่ เช่น baby5"
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono-tabular text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
              />

              <button
                type="button"
                disabled={busy}
                onClick={handleSavePair}
                className="rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
              >
                บันทึกรหัสอุปกรณ์
              </button>
            </div>
          </div>

          {/* Recent Readings Table */}
          {recentRows.length > 0 && (
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-700">
                บันทึกค่าวัดล่าสุด
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-2 font-semibold">เวลา</th>
                      <th className="px-4 py-2 font-semibold">รหัสอุปกรณ์</th>
                      <th className="px-4 py-2 font-semibold text-right">อุณหภูมิเฉลี่ย</th>
                      <th className="px-4 py-2 font-semibold text-center">สถานะ</th>
                      <th className="px-4 py-2 font-semibold text-right">แบตเตอรี่</th>
                      <th className="px-4 py-2 font-semibold text-right">สัญญาณ WiFi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-mono-tabular">
                    {recentRows.map((row, i) => {
                      const isFever = row.temperature >= settings.feverThreshold;
                      const isWatch = row.temperature >= settings.watchThreshold;
                      return (
                        <tr key={`${row.timestamp}-${i}`} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-600">{formatClockThai(row.timestamp)}</td>
                          <td className="px-4 py-2 text-slate-700">{device?.deviceId}</td>
                          <td
                            className={`px-4 py-2 text-right font-bold ${
                              isFever
                                ? 'text-rose-600'
                                : isWatch
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                            }`}
                          >
                            {row.temperature.toFixed(1)} °C
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                isFever
                                  ? 'bg-rose-100 text-rose-700'
                                  : isWatch
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {isFever ? 'ไข้สูง' : isWatch ? 'เฝ้าระวัง' : 'ปกติ'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-slate-600">
                            {row.battery !== null && row.battery !== undefined ? `${row.battery}%` : '--'}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-500">
                            {row.rssi !== null && row.rssi !== undefined ? `${row.rssi} dBm` : '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer Discharge Action */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            {!confirmDischarge ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDischarge(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 px-3.5 py-2 text-xs font-semibold text-rose-700 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  จำหน่ายผู้ป่วยออกจากเตียง
                </button>

                {onTransferPatient && (
                  <button
                    type="button"
                    onClick={() => setTransferOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50 hover:bg-teal-100 px-3.5 py-2 text-xs font-semibold text-teal-800 transition-colors cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-teal-600" />
                    ย้ายเตียงผู้ป่วย
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-rose-700">
                  ยืนยันการจำหน่าย {bed.patient.name} ออกจาก{bed.label}?
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirmDischarge}
                  className="rounded-xl bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                >
                  ยืนยันจำหน่าย
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDischarge(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 px-5 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>

      {transferOpen && onTransferPatient && (
        <TransferPatientModal
          sourceWard={ward}
          sourceBed={bed}
          allWards={allWards}
          devices={allDevices.reduce((acc, d) => ({ ...acc, [d.deviceId]: d }), {})}
          settings={settings}
          now={now}
          onClose={() => {
            setTransferOpen(false);
            onClose();
          }}
          onTransfer={onTransferPatient}
        />
      )}

      {timingOpen && (
        <TimingModal
          deviceId={bed.deviceId || 'ESP32-S3-01'}
          patientName={bed.patient?.name}
          bedLabel={bed.label}
          firebaseUrl={settings.firebaseUrl || DEFAULT_FIREBASE_URL}
          currentActiveSeconds={activeWorkingSec}
          currentSleepMinutes={deepSleepMin}
          onClose={() => setTimingOpen(false)}
          onSaved={(active, sleep) => {
            setActiveWorkingSec(active);
            setDeepSleepMin(sleep);
          }}
        />
      )}
    </div>
  );
};
