import React, { useEffect, useState } from 'react';
import { CalendarClock, Cpu, KeyRound, Search, UserPlus, X } from 'lucide-react';
import type { BedSlot, EspDevice, PatientDirectoryEntry, Ward } from '../types';
import { DEFAULT_FIREBASE_URL } from '../utils/firebaseSync';
import {
  findPatientInWardsOrDirectory,
  loadPatientDirectory,
  savePatientDirectory,
  upsertPatientToDirectory,
} from '../utils/defaultState';

interface AdmitModalProps {
  ward: Ward;
  allWards: Ward[];
  initialBed: BedSlot | null;
  devices: EspDevice[];
  onClose: () => void;
  onAdmit: (payload: {
    wardId: string;
    bedId: string;
    name: string;
    hn: string;
    age: string;
    notes: string;
    deviceId: string | null;
    admittedAt: number;
  }) => Promise<void>;
}

function toDateInputValue(epochMs: number): string {
  const d = new Date(epochMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const AdmitModal: React.FC<AdmitModalProps> = ({
  ward,
  allWards,
  initialBed,
  devices,
  onClose,
  onAdmit,
}) => {
  const emptyBeds = ward.beds.filter((b) => !b.patient);
  const [bedId, setBedId] = useState(initialBed?.id ?? emptyBeds[0]?.id ?? '');
  const [hn, setHn] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [notes, setNotes] = useState('');
  const [admitDaysAgo, setAdmitDaysAgo] = useState(0);
  const [admitDateStr, setAdmitDateStr] = useState(toDateInputValue(Date.now()));
  const [selectedDevice, setSelectedDevice] = useState('');
  const [customDevice, setCustomDevice] = useState('');
  const [directory, setDirectory] = useState<PatientDirectoryEntry[]>([]);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // 1. Load local directory + built-in directory
    const localDir = loadPatientDirectory();
    const map = new Map<string, PatientDirectoryEntry>();
    for (const item of localDir) {
      if (item.hn) map.set(item.hn.trim().toLowerCase(), item);
    }

    // 2. Scan all beds across all wards to harvest any previously entered patients
    for (const w of allWards) {
      for (const b of w.beds) {
        if (b.patient && b.patient.hn) {
          map.set(b.patient.hn.trim().toLowerCase(), {
            hn: b.patient.hn.trim(),
            name: b.patient.name.trim(),
            age: b.patient.age?.trim() || '',
            notes: b.patient.notes?.trim() || '',
          });
        }
      }
    }
    const combined = Array.from(map.values());
    setDirectory(combined);

    // 3. Sync from Firebase /patientDirectory.json
    fetch(`${DEFAULT_FIREBASE_URL}/patientDirectory.json`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === 'object') {
          const list = Array.isArray(data) ? data : Object.values(data);
          for (const item of list as PatientDirectoryEntry[]) {
            if (item && item.hn && item.name) {
              map.set(item.hn.trim().toLowerCase(), item);
            }
          }
          const merged = Array.from(map.values());
          setDirectory(merged);
          savePatientDirectory(merged);
        }
      })
      .catch(() => {});

    // 4. Try legacy API as well
    fetch('/api/patients')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.patients)) {
          for (const item of data.patients) {
            if (item && item.hn) {
              map.set(item.hn.trim().toLowerCase(), item);
            }
          }
          const merged = Array.from(map.values());
          setDirectory(merged);
          savePatientDirectory(merged);
        }
      })
      .catch(() => {});
  }, [allWards]);

  const findDeviceOwner = (devId: string): string | null => {
    for (const w of allWards) {
      const b = w.beds.find((slot) => slot.deviceId === devId);
      if (b) return `${w.shortName} · ${b.label}`;
    }
    return null;
  };

  useEffect(() => {
    const unpaired = devices.find((d) => !findDeviceOwner(d.deviceId));
    if (unpaired && !selectedDevice) {
      setSelectedDevice(unpaired.deviceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices]);

  const handleLookupHn = async (targetHn?: string) => {
    const query = (targetHn ?? hn).trim();
    if (!query) {
      setLookupMsg('กรุณากรอกรหัส HN เพื่อดึงข้อมูล');
      return;
    }
    setLookupMsg(null);

    // 1. Search locally in directory and all active beds first (instant)
    const found = findPatientInWardsOrDirectory(query, allWards, directory);
    if (found) {
      setHn(found.hn);
      setName(found.name);
      setAge(found.age || '');
      setNotes(found.notes || '');
      setLookupMsg(`พบข้อมูลผู้ป่วย: ${found.name}`);
      return;
    }

    // 2. Search Firebase /patientDirectory/${query}.json
    try {
      const res = await fetch(`${DEFAULT_FIREBASE_URL}/patientDirectory/${encodeURIComponent(query)}.json`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.name) {
          setHn(data.hn || query);
          setName(data.name);
          setAge(data.age || '');
          setNotes(data.notes || '');
          setLookupMsg(`พบข้อมูลผู้ป่วย: ${data.name}`);
          void upsertPatientToDirectory(data, DEFAULT_FIREBASE_URL);
          return;
        }
      }
    } catch {}

    // 3. Fallback to /api/patients
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.patient) {
          setHn(data.patient.hn);
          setName(data.patient.name);
          setAge(data.patient.age || '');
          setNotes(data.patient.notes || '');
          setLookupMsg(`พบข้อมูลผู้ป่วย: ${data.patient.name}`);
          void upsertPatientToDirectory(data.patient, DEFAULT_FIREBASE_URL);
          return;
        }
      }
    } catch {}

    // 4. Not found in any directory
    setLookupMsg(`ยังไม่พบประวัติรหัส ${query} ในระบบ (สามารถกรอกชื่อผู้ป่วยเด็กด้านล่างเพื่อบันทึกใหม่ได้เลยครับ)`);
  };

  const handleSelectDaysAgo = (days: number) => {
    setAdmitDaysAgo(days);
    setAdmitDateStr(toDateInputValue(Date.now() - days * 86_400_000));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!bedId) {
      setError('ไม่มีเตียงว่างสำหรับรับผู้ป่วยในวอร์ดนี้');
      return;
    }
    if (!hn.trim()) {
      setError('กรุณาระบุรหัส HN ของเด็ก (เช่น 670142 หรือกดปุ่มสุ่มรหัส)');
      return;
    }
    if (!name.trim()) {
      setError('กรุณาระบุชื่อผู้ป่วยเด็ก');
      return;
    }

    const admittedAt =
      admitDaysAgo === 0 && admitDateStr === toDateInputValue(Date.now())
        ? Date.now()
        : new Date(`${admitDateStr}T08:00:00`).getTime() || Date.now();

    const finalDeviceId = customDevice.trim() || selectedDevice.trim() || null;
    setSubmitting(true);
    try {
      // Permanently save patient to directory so it can always be pulled by HN in the future
      void upsertPatientToDirectory(
        {
          hn: hn.trim(),
          name: name.trim(),
          age: age.trim(),
          notes: notes.trim(),
        },
        DEFAULT_FIREBASE_URL
      );

      await onAdmit({
        wardId: ward.id,
        bedId,
        name: name.trim(),
        hn: hn.trim(),
        age: age.trim(),
        notes: notes.trim(),
        deviceId: finalDeviceId,
        admittedAt: Math.min(Date.now(), admittedAt),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-teal-50 text-teal-700">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                รับเด็กเข้าเตียง ({ward.shortName})
              </h2>
              <p className="text-xs text-slate-500">
                ดึงข้อมูลจากรหัส HN หรือลงทะเบียนใหม่พร้อมระบุรหัสอุปกรณ์
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Select Bed */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              เลือกเตียงผู้ป่วย ({ward.name})
            </label>
            <select
              value={bedId}
              onChange={(e) => setBedId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none"
            >
              {emptyBeds.length === 0 ? (
                <option value="">ไม่มีเตียงว่างในวอร์ดนี้</option>
              ) : (
                emptyBeds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label} (ว่าง)
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Patient Details & HN */}
          <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-teal-900 inline-flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-teal-700" />
                ข้อมูลผู้ป่วยเด็ก & รหัสประจำตัว (HN)
              </span>
              <button
                type="button"
                onClick={() => {
                  const autoHn = `HN-${new Date().getFullYear().toString().slice(-2)}${Math.floor(1000 + Math.random() * 9000)}`;
                  setHn(autoHn);
                  setLookupMsg(`สร้างรหัส ${autoHn} แล้ว (กรอกชื่อผู้ป่วยเด็กด้านล่างเพื่อบันทึกประวัติ)`);
                }}
                className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 underline cursor-pointer"
              >
                + สุ่มสร้างรหัส HN
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              {/* HN Input Field */}
              <div className="min-w-0">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  รหัส HN (Hospital Number) *
                </label>
                <div className="relative flex items-center min-w-0">
                  <input
                    type="text"
                    required
                    value={hn}
                    onChange={(e) => {
                      setHn(e.target.value);
                      setLookupMsg(null);
                    }}
                    placeholder="เช่น 670142 หรือ HN-001"
                    className="w-full min-w-0 rounded-xl border border-slate-300 bg-white pl-3 pr-16 py-2 text-sm font-mono-tabular font-bold text-slate-900 focus:border-teal-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    title="ดึงข้อมูลจากรหัส HN ในทะเบียน"
                    onClick={() => handleLookupHn()}
                    className="absolute right-1 top-1 bottom-1 inline-flex items-center gap-1 rounded-lg bg-teal-600 hover:bg-teal-700 px-2.5 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>ดึง</span>
                  </button>
                </div>
              </div>

              {/* Patient Name */}
              <div className="min-w-0">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  ชื่อผู้ป่วยเด็ก *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น น้องมะลิ"
                  className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>

            {lookupMsg && (
              <p className="text-xs text-teal-800 font-medium bg-teal-100/60 rounded-lg px-2.5 py-1">
                {lookupMsg}
              </p>
            )}

            {/* Quick HN Suggestions */}
            {directory.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] text-slate-500 font-medium">ทะเบียนตัวอย่าง/ล่าสุด:</span>
                {directory.slice(0, 8).map((p) => (
                  <button
                    key={p.hn}
                    type="button"
                    onClick={() => handleLookupHn(p.hn)}
                    className="rounded-lg border border-teal-200 bg-white hover:bg-teal-50 px-2 py-0.5 text-[11px] font-mono-tabular font-semibold text-teal-800 cursor-pointer transition-colors"
                  >
                    {p.hn} ({p.name})
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-teal-200/50 min-w-0">
              <div className="min-w-0">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  อายุ
                </label>
                <input
                  type="text"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="เช่น 2 ปี 4 เดือน"
                  className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div className="min-w-0">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  อาการ / หมายเหตุ
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น เฝ้าระวังไข้หลังให้ยา"
                  className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <CalendarClock className="w-3.5 h-3.5 text-sky-600" />
              วันที่เข้ารับการรักษา
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <input
                type="date"
                value={admitDateStr}
                max={toDateInputValue(Date.now())}
                onChange={(e) => {
                  setAdmitDateStr(e.target.value);
                  setAdmitDaysAgo(-1);
                }}
                className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono-tabular focus:border-teal-500 focus:outline-none"
              />
              <div className="flex flex-wrap gap-1">
                {[0, 1, 2, 3, 5].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleSelectDaysAgo(d)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                      admitDaysAgo === d
                        ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {d === 0 ? 'วันนี้' : `อยู่มา ${d} วัน`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Device Pairing */}
          <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-3.5 space-y-2.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Cpu className="w-3.5 h-3.5 text-teal-600" />
              ผูกกับรหัสอุปกรณ์
            </label>
            <select
              value={selectedDevice}
              onChange={(e) => {
                setSelectedDevice(e.target.value);
                setCustomDevice('');
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono-tabular focus:border-teal-500 focus:outline-none"
            >
              <option value="">-- ยังไม่ระบุอุปกรณ์ --</option>
              {devices.map((d) => {
                const usedBy = findDeviceOwner(d.deviceId);
                return (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.deviceId}
                    {d.temperature !== null ? ` (${d.temperature.toFixed(1)}°C)` : ''}
                    {usedBy ? ` — ใช้อยู่ที่ ${usedBy}` : ' — พร้อมใช้งาน'}
                  </option>
                );
              })}
            </select>
            <input
              type="text"
              value={customDevice}
              onChange={(e) => setCustomDevice(e.target.value)}
              placeholder="หรือพิมพ์รหัสอุปกรณ์ใหม่ เช่น baby4"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono-tabular focus:border-teal-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting || emptyBeds.length === 0}
              className="rounded-xl bg-teal-600 hover:bg-teal-700 px-5 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'กำลังบันทึก...' : 'รับเด็กเข้าเตียง'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
