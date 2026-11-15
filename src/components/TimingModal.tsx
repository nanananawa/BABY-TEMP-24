import React, { useState } from 'react';
import { Clock, Moon, Play, Save, X, Zap } from 'lucide-react';
import { saveTimingToFirebase } from '../utils/firebaseSync';

interface TimingModalProps {
  deviceId: string;
  patientName?: string;
  bedLabel?: string;
  firebaseUrl: string;
  currentActiveSeconds?: number;
  currentSleepMinutes?: number;
  onClose: () => void;
  onSaved: (activeSec: number, sleepMin: number) => void;
}

const ACTIVE_OPTIONS = [
  { val: 10, label: '10 วินาที (เร็วพิเศษ)' },
  { val: 15, label: '15 วินาที (แนะนำสำหรับ WiFi)' },
  { val: 30, label: '30 วินาที (เสถียรภาพสูง)' },
  { val: 60, label: '60 วินาที (1 นาที)' },
];

const SLEEP_OPTIONS = [
  { val: 1, label: '1 นาที (ทดสอบระบบ / เฝ้าระวังวิกฤต)' },
  { val: 2, label: '2 นาที (เฝ้าระวังไข้สูงต่อเนื่อง)' },
  { val: 5, label: '5 นาที (มาตรฐานแนะนำ ประหยัดแบตเตอรี่)' },
  { val: 10, label: '10 นาที (อาการคงที่)' },
  { val: 15, label: '15 นาที (ประหยัดแบตเตอรี่มาก)' },
  { val: 30, label: '30 นาที' },
  { val: 60, label: '60 นาที (1 ชั่วโมง)' },
];

export const TimingModal: React.FC<TimingModalProps> = ({
  deviceId,
  patientName,
  bedLabel,
  firebaseUrl,
  currentActiveSeconds = 15,
  currentSleepMinutes = 5,
  onClose,
  onSaved,
}) => {
  const [activeSec, setActiveSec] = useState<number>(currentActiveSeconds);
  const [sleepMin, setSleepMin] = useState<number>(currentSleepMinutes);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg('กำลังส่งการตั้งค่าไปยัง Firebase...');
    try {
      const ok = await saveTimingToFirebase(firebaseUrl, deviceId, activeSec, sleepMin);
      if (ok) {
        setStatusMsg('✅ ซิงค์การตั้งค่าสำเร็จ! อุปกรณ์จะปรับเวลาทำงานในรอบตื่นถัดไป');
        setTimeout(() => {
          onSaved(activeSec, sleepMin);
          onClose();
        }, 800);
      } else {
        setStatusMsg('⚠️ บันทึกในเบราว์เซอร์แล้ว (ไม่สามารถส่งเข้า Firebase ได้)');
        setTimeout(() => {
          onSaved(activeSec, sleepMin);
          onClose();
        }, 1000);
      }
    } catch {
      onSaved(activeSec, sleepMin);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-gradient-to-r from-teal-50/70 to-emerald-50/70">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-teal-600 text-white shadow-xs">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                ตั้งเวลาทำงาน & Deep Sleep
              </h3>
              <p className="text-xs text-slate-500">
                {patientName ? `${patientName} · ` : ''}{bedLabel || deviceId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Active Working Time */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Zap className="w-4 h-4 text-amber-500" />
              เวลาทำงาน (Active Time ก่อนเข้า Sleep)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ACTIVE_OPTIONS.map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setActiveSec(opt.val)}
                  className={`rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                    activeSec === opt.val
                      ? 'border-teal-600 bg-teal-50/80 text-teal-900 font-bold shadow-xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs'
                  }`}
                >
                  <div className="text-xs font-semibold">{opt.label}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              💡 บอร์ดจะตื่นขึ้นมาต่อ WiFi วัดอุณหภูมิ และส่งเข้า Firebase ภายในระยะเวลานี้
            </p>
          </div>

          {/* Deep Sleep Duration */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Moon className="w-4 h-4 text-indigo-500" />
              เวลาหลับประหยัดพลังงาน (Deep Sleep)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
              {SLEEP_OPTIONS.map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setSleepMin(opt.val)}
                  className={`rounded-xl border p-2 text-left transition-colors cursor-pointer ${
                    sleepMin === opt.val
                      ? 'border-indigo-600 bg-indigo-50/80 text-indigo-900 font-bold shadow-xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs'
                  }`}
                >
                  <div className="text-xs font-semibold">{opt.label}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              🔋 ยิ่งตั้งเวลาหลับนาน อุปกรณ์จะยิ่งประหยัดแบตเตอรี่ได้สูงสุดถึงหลายสัปดาห์
            </p>
          </div>

          {/* Summary Box */}
          <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-3 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">รอบการทำงานที่จะส่ง:</span>
            <span className="font-bold text-teal-800 font-mono-tabular">
              ทำงาน {activeSec} วิ • หลับ {sleepMin} นาที
            </span>
          </div>

          {statusMsg && (
            <div className="text-xs text-center font-medium text-slate-700 p-2 bg-slate-50 rounded-xl border border-slate-200">
              {statusMsg}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 px-5 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'กำลังบันทึก...' : 'บันทึกรอบเวลา'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
