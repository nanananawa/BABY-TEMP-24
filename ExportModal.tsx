import React, { useState } from 'react';
import { ExternalLink, FileSpreadsheet, FileText, Table, X } from 'lucide-react';
import type { BedSlot, EspDevice, Ward, WardSettings } from '../types';
import { exportWardsToCsv, exportWardsToExcel } from '../utils/exportHelpers';

interface ExportModalProps {
  wards: Ward[];
  devices: Record<string, EspDevice>;
  settings: WardSettings;
  activeWardId: string;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  wards,
  devices,
  settings,
  activeWardId,
  onClose,
}) => {
  const [scope, setScope] = useState<'ward' | 'all' | 'single'>('ward');
  const [selectedWardId, setSelectedWardId] = useState<string>(activeWardId);
  const [selectedBedId, setSelectedBedId] = useState<string>('');

  const currentWard = wards.find((w) => w.id === selectedWardId) || wards[0];
  const occupiedBedsInWard = currentWard ? currentWard.beds.filter((b) => b.patient !== null) : [];

  const handleExportExcel = () => {
    exportWardsToExcel(wards, devices, settings, {
      scope,
      wardId: selectedWardId,
      selectedBedId: selectedBedId || undefined,
    });
    onClose();
  };

  const handleExportCsv = () => {
    exportWardsToCsv(wards, devices, settings, {
      scope,
      wardId: selectedWardId,
      selectedBedId: selectedBedId || undefined,
    });
    onClose();
  };

  const handleOpenGoogleSheets = () => {
    const url = settings.googleSheetsUrl || 'https://docs.google.com/spreadsheets';
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-gradient-to-r from-emerald-50/70 to-teal-50/70">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-600 text-white shadow-xs">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                ส่งออกรายงาน & สถิติอุณหภูมิ
              </h3>
              <p className="text-xs text-slate-500">
                ส่งออกเป็นไฟล์ Microsoft Excel (.xls), CSV หรือเปิด Google Sheets
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
          {/* Scope Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              ขอบเขตข้อมูลที่ต้องการส่งออก
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setScope('ward')}
                className={`rounded-xl border p-2.5 text-center text-xs font-semibold transition-colors cursor-pointer ${
                  scope === 'ward'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                เฉพาะวอร์ดนี้
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`rounded-xl border p-2.5 text-center text-xs font-semibold transition-colors cursor-pointer ${
                  scope === 'all'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                ทุกวอร์ดรวมกัน
              </button>
              <button
                type="button"
                onClick={() => setScope('single')}
                className={`rounded-xl border p-2.5 text-center text-xs font-semibold transition-colors cursor-pointer ${
                  scope === 'single'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                เลือกรายบุคคล
              </button>
            </div>
          </div>

          {/* Conditional Selectors */}
          {scope === 'ward' && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">เลือกวอร์ด</label>
              <select
                value={selectedWardId}
                onChange={(e) => setSelectedWardId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
              >
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.beds.filter((b) => b.patient).length} ผู้ป่วย)
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === 'single' && (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">วอร์ด</label>
                <select
                  value={selectedWardId}
                  onChange={(e) => {
                    setSelectedWardId(e.target.value);
                    setSelectedBedId('');
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                >
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">เลือกผู้ป่วยเด็ก</label>
                <select
                  value={selectedBedId}
                  onChange={(e) => setSelectedBedId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- กรุณาเลือกเตียงผู้ป่วย --</option>
                  {occupiedBedsInWard.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}: {b.patient?.name} (HN: {b.patient?.hn || '-'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Export Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white p-3.5 text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ดาวน์โหลด Excel (.xls)</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 p-3.5 text-xs font-bold transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>ดาวน์โหลด CSV (.csv)</span>
            </button>
          </div>

          {/* Google Sheets Option */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Table className="w-3.5 h-3.5 text-teal-600" />
                Google Sheets รายงานสด
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                เปิดตารางบันทึกข้อมูลแยกแท็บเด็กแต่ละคนอัตโนมัติ
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenGoogleSheets}
              className="inline-flex items-center gap-1 rounded-xl bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-800 px-3 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer transition-colors"
            >
              <span>เปิดชีต</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
