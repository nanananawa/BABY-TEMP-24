import React, { useState } from 'react';
import { Building2, Plus, X } from 'lucide-react';
import type { WardPresetShape } from '../types';

interface AddWardModalProps {
  onClose: () => void;
  onCreateWard: (payload: {
    name: string;
    shortName: string;
    bedCount: number;
    shape: WardPresetShape;
  }) => Promise<void>;
}

const SHAPE_OPTIONS: Array<{ value: WardPresetShape; title: string; desc: string }> = [
  { value: 'standard', title: '2 แถว + ทางเดินกลาง', desc: 'ผังมาตรฐาน เคาน์เตอร์ด้านข้าง' },
  { value: 'single_row', title: 'ทางเดินเดี่ยว (1 แถว)', desc: 'เตียงเรียงฝั่งเดียวริมทางเดิน' },
  { value: 'l_shape', title: 'รูปตัว L (L-Shape)', desc: 'เตียงโอบ 2 ปีกมุมฉาก' },
  { value: 'u_shape', title: 'รูปตัว U / เคาน์เตอร์กลาง', desc: 'เคาน์เตอร์ตรงกลาง เตียงล้อมรอบ' },
];

export const AddWardModal: React.FC<AddWardModalProps> = ({ onClose, onCreateWard }) => {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [bedCount, setBedCount] = useState(8);
  const [shape, setShape] = useState<WardPresetShape>('standard');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onCreateWard({
        name: name.trim(),
        shortName: shortName.trim() || name.trim().slice(0, 14),
        bedCount,
        shape,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-teal-50 text-teal-700">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                เพิ่มวอร์ดผู้ป่วยใหม่
              </h2>
              <p className="text-xs text-slate-500">เลือกรูปแบบผังวอร์ดและปรับแต่งเพิ่มเติมได้ภายหลัง</p>
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
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ชื่อวอร์ด *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น วอร์ดไอซียูเด็ก (PICU)"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ชื่อย่อบนแท็บ
              </label>
              <input
                type="text"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="เช่น PICU"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                จำนวนเตียงเริ่มต้น
              </label>
              <input
                type="number"
                min={2}
                max={16}
                value={bedCount}
                onChange={(e) => setBedCount(Number(e.target.value) || 8)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-tabular focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              รูปแบบลักษณะผังวอร์ดเริ่มต้น
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SHAPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setShape(opt.value)}
                  className={`rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                    shape === opt.value
                      ? 'border-teal-600 bg-teal-50/70 ring-1 ring-teal-600'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-900">{opt.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
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
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 px-5 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {submitting ? 'กำลังสร้าง...' : 'สร้างวอร์ด'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
