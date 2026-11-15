import React, { useState } from 'react';
import {
  ArrowLeftRight,
  Bed,
  Check,
  Cpu,
  RefreshCw,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import type { BedSlot, EspDevice, Ward, WardSettings } from '../types';

interface TransferPatientModalProps {
  sourceWard: Ward;
  sourceBed: BedSlot;
  allWards: Ward[];
  devices: Record<string, EspDevice>;
  settings: WardSettings;
  now: number;
  onClose: () => void;
  onTransfer: (
    fromWardId: string,
    fromBedId: string,
    toWardId: string,
    toBedId: string,
    moveDevice: boolean
  ) => Promise<void>;
}

export const TransferPatientModal: React.FC<TransferPatientModalProps> = ({
  sourceWard,
  sourceBed,
  allWards,
  devices,
  onClose,
  onTransfer,
}) => {
  const [selectedWardId, setSelectedWardId] = useState<string>(sourceWard.id);
  const [moveDevice, setMoveDevice] = useState<boolean>(true);
  const [targetBedId, setTargetBedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!sourceBed.patient) {
    return null;
  }

  const selectedWard = allWards.find((w) => w.id === selectedWardId) || sourceWard;

  // List of possible target beds (excluding the current bed in the current ward)
  const availableBeds = selectedWard.beds.filter(
    (b) => !(selectedWard.id === sourceWard.id && b.id === sourceBed.id)
  );

  const emptyBeds = availableBeds.filter((b) => !b.patient);
  const occupiedBeds = availableBeds.filter((b) => !!b.patient);

  const selectedTargetBed = availableBeds.find((b) => b.id === targetBedId);

  const handleExecuteTransfer = async (toBed: BedSlot) => {
    setBusy(true);
    try {
      await onTransfer(
        sourceWard.id,
        sourceBed.id,
        selectedWard.id,
        toBed.id,
        moveDevice
      );
      setSuccessMsg(
        toBed.patient
          ? `สลับเตียงระหว่าง ${sourceBed.patient?.name} กับ ${toBed.patient.name} เรียบร้อยแล้ว`
          : `ย้าย ${sourceBed.patient?.name} ไปยัง ${toBed.label} (${selectedWard.shortName || selectedWard.name}) สำเร็จแล้ว`
      );
      setTimeout(() => {
        onClose();
      }, 900);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 md:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-teal-50/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-teal-600 text-white shadow-xs shrink-0">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                ย้ายเตียงผู้ป่วย
              </h2>
              <p className="text-xs text-slate-500 truncate">
                เลือกเตียงปลายทางที่ต้องการย้ายหรือสลับเตียง
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Banner */}
        {successMsg ? (
          <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
            <div className="text-base font-bold text-slate-900">{successMsg}</div>
            <p className="text-xs text-slate-500">กำลังบันทึกข้อมูลแผนผัง...</p>
          </div>
        ) : (
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Current Patient Summary Card */}
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-teal-600/10 text-teal-700 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-sm text-slate-900 truncate">
                      {sourceBed.patient.name}
                    </span>
                    {sourceBed.patient.hn && (
                      <span className="text-[11px] font-mono-tabular font-bold bg-white border border-teal-200 text-teal-700 px-1.5 py-0.2 rounded">
                        HN {sourceBed.patient.hn}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 flex items-center gap-2 mt-0.5">
                    <span>
                      ปัจจุบัน: <strong>{sourceBed.label}</strong> ({sourceWard.shortName || sourceWard.name})
                    </span>
                    {sourceBed.deviceId && (
                      <span className="inline-flex items-center gap-0.5 text-slate-500 font-mono-tabular">
                        <Cpu className="w-3 h-3 text-teal-600" />
                        {sourceBed.deviceId}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Move Device Option Toggle */}
            {sourceBed.deviceId && (
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer hover:bg-slate-100/70 transition-colors">
                <input
                  type="checkbox"
                  checked={moveDevice}
                  onChange={(e) => setMoveDevice(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-800">
                    ย้ายอุปกรณ์ ({sourceBed.deviceId}) ตามผู้ป่วยไปด้วย
                  </span>
                  <p className="text-[11px] text-slate-500">
                    {moveDevice
                      ? 'บอร์ดจะถูกย้ายไปผูกกับเตียงปลายทางให้อัตโนมัติ'
                      : 'ทิ้งอุปกรณ์ไว้ที่เตียงเดิม และไม่ย้ายบอร์ด'}
                  </p>
                </div>
              </label>
            )}

            {/* Ward Selector (if multiple wards exist) */}
            {allWards.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  เลือกวอร์ดปลายทาง
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {allWards.map((w) => {
                    const emptyCount = w.beds.filter((b) => !b.patient).length;
                    const isSelected = w.id === selectedWardId;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setSelectedWardId(w.id)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-teal-600 text-white shadow-xs'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{w.shortName || w.name}</span>
                        <span
                          className={`text-[10px] rounded px-1.5 py-0.2 ${
                            isSelected ? 'bg-teal-700/80 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          ว่าง {emptyCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Beds Section */}
            <div className="space-y-3">
              {/* Empty Beds Group */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <Bed className="w-3.5 h-3.5 text-emerald-600" />
                    เตียงว่างในวอร์ด ({emptyBeds.length} เตียง)
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    คลิกเพื่อย้ายได้ทันที
                  </span>
                </div>

                {emptyBeds.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                    ไม่มีเตียงว่างในวอร์ดนี้ (สามารถเลือกสลับเตียงกับผู้ป่วยท่านอื่นด้านล่างได้)
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {emptyBeds.map((bed) => (
                      <button
                        key={bed.id}
                        type="button"
                        disabled={busy}
                        onClick={() => handleExecuteTransfer(bed)}
                        className="group flex flex-col items-start justify-between p-2.5 rounded-xl border-2 border-emerald-300/80 bg-emerald-50/40 hover:bg-emerald-100/70 hover:border-emerald-500 text-left transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-xs text-slate-900 group-hover:text-emerald-800">
                            {bed.label}
                          </span>
                          <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.2 rounded">
                            ว่าง
                          </span>
                        </div>
                        <div className="mt-2 text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          <span>ย้ายมาที่นี่</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Occupied Beds Group (Swap) */}
              {occupiedBeds.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                      เตียงที่มีผู้ป่วยอยู่แล้ว (คลิกเพื่อสลับเตียง)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {occupiedBeds.map((bed) => (
                      <button
                        key={bed.id}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `ต้องการสลับเตียงระหว่าง "${sourceBed.patient?.name}" (${sourceBed.label}) และ "${bed.patient?.name}" (${bed.label}) หรือไม่?`
                            )
                          ) {
                            handleExecuteTransfer(bed);
                          }
                        }}
                        className="group flex items-center justify-between p-2.5 rounded-xl border border-amber-200 bg-amber-50/40 hover:bg-amber-100/70 hover:border-amber-400 text-left transition-all cursor-pointer"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-xs text-slate-900 truncate">
                            {bed.label}: {bed.patient?.name}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            HN {bed.patient?.hn || '-'}
                          </div>
                        </div>
                        <span className="text-[10.5px] font-semibold text-amber-800 bg-amber-100/80 px-2 py-1 rounded-lg shrink-0 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" />
                          สลับเตียง
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
};
