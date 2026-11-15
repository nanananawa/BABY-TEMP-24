import React, { useState } from 'react';
import {
  Clock,
  ExternalLink,
  Flame,
  Play,
  Settings,
  Smartphone,
  Table,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { NotificationSoundType, WardSettings } from '../types';
import {
  isVibrationSupported,
  NOTIFICATION_SOUNDS,
  playNotificationSound,
  triggerNotificationVibration,
} from '../utils/wardHelpers';
import { DEFAULT_FIREBASE_URL, DEFAULT_GOOGLE_SHEETS_URL } from '../utils/firebaseSync';

interface SettingsModalProps {
  settings: WardSettings;
  onClose: () => void;
  onSave: (next: WardSettings) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onClose,
  onSave,
}) => {
  const [hospitalName, setHospitalName] = useState(settings.hospitalName);
  const [watchThreshold, setWatchThreshold] = useState(String(settings.watchThreshold));
  const [feverThreshold, setFeverThreshold] = useState(String(settings.feverThreshold));
  const [offlineTimeoutSec, setOfflineTimeoutSec] = useState(String(settings.offlineTimeoutSec));
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled);
  const [soundType, setSoundType] = useState<NotificationSoundType>(settings.soundType ?? 'beep');
  const [vibrationEnabled, setVibrationEnabled] = useState(settings.vibrationEnabled ?? true);
  const [vibrationFeedback, setVibrationFeedback] = useState<string | null>(null);

  // Firebase & Google Sheets settings
  const [firebaseUrl, setFirebaseUrl] = useState(settings.firebaseUrl || DEFAULT_FIREBASE_URL);
  const [firebaseEnabled, setFirebaseEnabled] = useState(settings.firebaseEnabled ?? true);
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState(settings.googleSheetsUrl || DEFAULT_GOOGLE_SHEETS_URL);
  const [defaultActiveSeconds, setDefaultActiveSeconds] = useState(String(settings.defaultActiveSeconds || 15));
  const [defaultSleepMinutes, setDefaultSleepMinutes] = useState(String(settings.defaultSleepMinutes || 5));

  const [saving, setSaving] = useState(false);

  const vibrationSupported = isVibrationSupported();

  const handleTestVibration = () => {
    const ok = triggerNotificationVibration('fever');
    if (ok) {
      setVibrationFeedback('กำลังส่งสัญญาณสั่นแจ้งเตือน...');
    } else {
      setVibrationFeedback('เบราว์เซอร์/อุปกรณ์นี้ไม่มีมอเตอร์สั่น (รองรับบนมือถือ/แท็บเล็ต Android)');
    }
    setTimeout(() => setVibrationFeedback(null), 3200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        hospitalName: hospitalName.trim() || settings.hospitalName,
        watchThreshold: Number(watchThreshold) || 37.5,
        feverThreshold: Number(feverThreshold) || 38.5,
        offlineTimeoutSec: Math.max(5, Number(offlineTimeoutSec) || 60),
        soundEnabled,
        soundType,
        vibrationEnabled,
        firebaseUrl: firebaseUrl.trim() || DEFAULT_FIREBASE_URL,
        firebaseEnabled,
        googleSheetsUrl: googleSheetsUrl.trim() || DEFAULT_GOOGLE_SHEETS_URL,
        defaultActiveSeconds: Number(defaultActiveSeconds) || 15,
        defaultSleepMinutes: Number(defaultSleepMinutes) || 5,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 backdrop-blur px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 text-slate-700">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                ตั้งค่าเกณฑ์แจ้งเตือน เสียง และการสั่น
              </h2>
              <p className="text-xs text-slate-500">ปรับเกณฑ์อุณหภูมิ เลือกเสียงเตือน และเปิด/ปิดการสั่น</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดการตั้งค่า"
            className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ชื่อโรงพยาบาล / แผนก
            </label>
            <input
              type="text"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-amber-700 mb-1">
                เกณฑ์เฝ้าระวัง (°C)
              </label>
              <input
                type="number"
                step="0.1"
                min="35"
                max="42"
                value={watchThreshold}
                onChange={(e) => setWatchThreshold(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-tabular focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-rose-700 mb-1">
                เกณฑ์ไข้สูง (°C)
              </label>
              <input
                type="number"
                step="0.1"
                min="36"
                max="43"
                value={feverThreshold}
                onChange={(e) => setFeverThreshold(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-tabular focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              แจ้งเตือนเมื่ออุปกรณ์ขาดสัญญาณหลัง (วินาที)
            </label>
            <input
              type="number"
              min="5"
              max="600"
              value={offlineTimeoutSec}
              onChange={(e) => setOfflineTimeoutSec(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-tabular focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Sound Notification Section */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-teal-600 shrink-0" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-bold text-slate-800">เสียงแจ้งเตือนเมื่อพบไข้</div>
                  <div className="text-[11px] text-slate-500">เลือกเสียงเตือนที่ต้องการและกดฟังตัวอย่างได้</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSoundEnabled((v) => !v)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                  soundEnabled
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {soundEnabled ? 'เปิดอยู่' : 'ปิดอยู่'}
              </button>
            </div>

            {soundEnabled && (
              <div className="space-y-1.5 pt-1">
                {NOTIFICATION_SOUNDS.map((sound) => {
                  const selected = soundType === sound.id;
                  return (
                    <div
                      key={sound.id}
                      onClick={() => setSoundType(sound.id)}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors cursor-pointer ${
                        selected
                          ? 'border-teal-500 bg-teal-50/70'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            selected ? 'border-teal-600' : 'border-slate-300'
                          }`}
                        >
                          {selected && <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">{sound.label}</div>
                          <div className="text-[10.5px] text-slate-500 truncate">{sound.description}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSoundType(sound.id);
                          playNotificationSound(sound.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="w-2.5 h-2.5 text-teal-600" />
                        ทดสอบ
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Vibration Notification Section */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Smartphone className={`w-4 h-4 shrink-0 ${vibrationEnabled ? 'text-teal-600' : 'text-slate-400'}`} />
                <div>
                  <div className="text-xs font-bold text-slate-800">การสั่นแจ้งเตือน (Vibration)</div>
                  <div className="text-[11px] text-slate-500">
                    สั่นเตือนเมื่อมีไข้สูงหรือเฝ้าระวัง {vibrationSupported ? '(อุปกรณ์รองรับ)' : '(ขึ้นกับอุปกรณ์มือถือ)'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleTestVibration}
                  className="rounded-xl border border-slate-200 bg-white hover:bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer"
                >
                  ทดสอบสั่น
                </button>
                <button
                  type="button"
                  onClick={() => setVibrationEnabled((v) => !v)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    vibrationEnabled
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {vibrationEnabled ? 'เปิดอยู่' : 'ปิดอยู่'}
                </button>
              </div>
            </div>

            {vibrationFeedback && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-[11px] font-medium text-teal-800">
                {vibrationFeedback}
              </div>
            )}
          </div>

          {/* Firebase Realtime Database Section */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-600 fill-amber-500" />
                <span className="text-xs font-bold text-slate-800">
                  Firebase Realtime Database (ซิงค์อัตโนมัติ)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {firebaseEnabled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 px-2.5 py-0.5 text-[11px] font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    เชื่อมต่ออัตโนมัติเปิดอยู่
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 text-slate-600 px-2.5 py-0.5 text-[11px] font-medium">
                    ปิดการเชื่อมต่อ
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setFirebaseEnabled((v) => !v)}
                  className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    firebaseEnabled
                      ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                  title={firebaseEnabled ? 'คลิกเพื่อหยุดการซิงค์' : 'คลิกเพื่อเปิดการซิงค์อัตโนมัติ'}
                >
                  {firebaseEnabled ? 'ปิดการซิงค์' : 'เปิดใช้งาน'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-2.5 text-[11px] text-emerald-900 leading-relaxed">
              ✅ <strong>ระบบเชื่อมต่ออัตโนมัติ 100%:</strong> เมื่อเปิดหน้าเว็บ ระบบจะเชื่อมต่อกับ Firebase ดึงข้อมูลอุณหภูมิจากบอร์ด ESP32 มาแสดงบนเตียงอัตโนมัติทันที <strong>โดยที่คุณไม่ต้องคอยกดปุ่มเชื่อมต่อเอง</strong>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Firebase Realtime Database URL
              </label>
              <input
                type="url"
                value={firebaseUrl}
                onChange={(e) => setFirebaseUrl(e.target.value)}
                placeholder="https://babytemp-9beab-default-rtdb.asia-southeast1.firebasedatabase.app"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono-tabular focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Google Sheets Integration Section */}
          <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-teal-600" />
                <span className="text-xs font-bold text-slate-800">
                  Google Sheets รายงานประวัติอัตโนมัติ
                </span>
              </div>
              <button
                type="button"
                onClick={() => window.open(googleSheetsUrl, '_blank')}
                className="inline-flex items-center gap-1 rounded-xl bg-white border border-teal-300 hover:bg-teal-100 text-teal-800 px-2.5 py-1 text-[11px] font-semibold cursor-pointer"
              >
                <span>เปิดดูชีต</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Google Sheets / Apps Script Web App URL
              </label>
              <input
                type="url"
                value={googleSheetsUrl}
                onChange={(e) => setGoogleSheetsUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono-tabular focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Deep Sleep Timing Defaults */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-700" />
              <span className="text-xs font-bold text-slate-800">
                เกณฑ์เวลาทำงาน & Deep Sleep มาตรฐาน
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  เวลาทำงานมาตรฐาน (วินาที)
                </label>
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={defaultActiveSeconds}
                  onChange={(e) => setDefaultActiveSeconds(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono-tabular focus:border-teal-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  เวลาหลับประหยัดไฟมาตรฐาน (นาที)
                </label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  max="120"
                  value={defaultSleepMinutes}
                  onChange={(e) => setDefaultSleepMinutes(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono-tabular focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

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
              disabled={saving}
              className="rounded-xl bg-teal-600 hover:bg-teal-700 px-5 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
