import React, { useState } from 'react';
import {
  ArrowLeftRight,
  Bell,
  BellOff,
  CalendarClock,
  Check,
  ClipboardList,
  Cpu,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { BedSlot, EspDevice, WardSettings } from '../types';
import { formatStayBadgeThai, getBedStatus, getStatusLabel } from '../utils/wardHelpers';

interface BedCardProps {
  bed: BedSlot;
  wardId?: string;
  device: EspDevice | undefined;
  settings: WardSettings;
  now: number;
  editMode: boolean;
  canDeleteBed: boolean;
  gridCols: number;
  onSelectBed: (bed: BedSlot) => void;
  onAdmitBed: (bed: BedSlot) => void;
  onToggleMute: (bed: BedSlot) => void;
  onDropItemOnCell: (e: React.DragEvent, gridX: number, gridY: number) => void;
  onRenameBed: (bedId: string, label: string) => void;
  onDeleteBed: (bedId: string) => void;
  onOpenTransfer?: (bed: BedSlot) => void;
  onTransferPatient?: (
    fromWardId: string,
    fromBedId: string,
    toWardId: string,
    toBedId: string,
    moveDevice: boolean
  ) => Promise<void>;
}

export const BedCard: React.FC<BedCardProps> = ({
  bed,
  wardId,
  device,
  settings,
  now,
  editMode,
  canDeleteBed,
  gridCols,
  onSelectBed,
  onAdmitBed,
  onToggleMute,
  onDropItemOnCell,
  onRenameBed,
  onDeleteBed,
  onOpenTransfer,
  onTransferPatient,
}) => {
  const [renaming, setRenaming] = useState(false);
  const [draftLabel, setDraftLabel] = useState(bed.label);
  const [dragOver, setDragOver] = useState(false);
  const [patientDragOver, setPatientDragOver] = useState(false);

  const status = getBedStatus(bed, device, settings, now);
  const isDense = gridCols >= 7;
  const minHeightClass = gridCols >= 8 ? 'min-h-[104px]' : gridCols >= 6 ? 'min-h-[114px]' : 'min-h-[124px]';
  const cardPaddingClass = isDense ? 'p-1.5' : 'p-2.5';

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (draftLabel.trim()) {
      onRenameBed(bed.id, draftLabel.trim());
    }
    setRenaming(false);
  };

  const handleDragOverCommon = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-patient-transfer')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      if (!patientDragOver) setPatientDragOver(true);
      return;
    }
    if (editMode) {
      e.preventDefault();
      setDragOver(true);
    }
  };

  const handleDragLeaveCommon = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setPatientDragOver(false);
      if (editMode) setDragOver(false);
    }
  };

  const handleDropCommon = (e: React.DragEvent) => {
    const patientRaw = e.dataTransfer.getData('application/x-patient-transfer');
    if (patientRaw) {
      e.preventDefault();
      e.stopPropagation();
      setPatientDragOver(false);
      try {
        const parsed = JSON.parse(patientRaw);
        if (parsed.fromBedId && parsed.fromBedId !== bed.id && onTransferPatient) {
          void onTransferPatient(
            parsed.fromWardId || wardId || '',
            parsed.fromBedId,
            wardId || '',
            bed.id,
            true
          );
        }
      } catch {}
      return;
    }

    if (editMode) {
      e.preventDefault();
      setDragOver(false);
      onDropItemOnCell(e, bed.gridX, bed.gridY);
    }
  };

  const dragProps = editMode
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.setData('application/x-ward-item', JSON.stringify({ kind: 'bed', id: bed.id }));
          e.dataTransfer.effectAllowed = 'move';
        },
        onDragOver: handleDragOverCommon,
        onDragLeave: handleDragLeaveCommon,
        onDrop: handleDropCommon,
      }
    : {
        onDragOver: handleDragOverCommon,
        onDragLeave: handleDragLeaveCommon,
        onDrop: handleDropCommon,
      };

  if (!bed.patient) {
    return (
      <div
        {...dragProps}
        onClick={() => {
          if (!editMode && !renaming) onAdmitBed(bed);
        }}
        role={editMode ? undefined : 'button'}
        tabIndex={editMode ? -1 : 0}
        onKeyDown={(e) => {
          if (!editMode && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onAdmitBed(bed);
          }
        }}
        className={`@container bed-card-container group relative flex flex-col justify-between ${minHeightClass} ${cardPaddingClass} h-full w-full rounded-xl border border-dashed text-left transition-all duration-150 overflow-hidden ${
          patientDragOver
            ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400'
            : dragOver
            ? 'border-teal-600 bg-teal-50 ring-2 ring-teal-400/40'
            : editMode
              ? 'border-slate-300 bg-slate-50/90 cursor-grab'
              : 'border-slate-300 bg-white/85 hover:border-teal-500 hover:bg-teal-50/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500'
        }`}
      >
        {patientDragOver && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-emerald-600/90 text-white font-bold p-2 text-center rounded-xl pointer-events-none">
            <ArrowLeftRight className="w-5 h-5 mb-1 animate-bounce" />
            <span className="text-xs">ย้ายมา {bed.label}</span>
            <span className="text-[10px] font-normal text-emerald-100">ปล่อยเพื่อย้ายทันที</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-1 w-full min-w-0">
          {renaming ? (
            <form onSubmit={handleRenameSubmit} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 w-full">
              <input
                type="text"
                autoFocus
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                className="w-full min-w-0 rounded border border-teal-400 px-1.5 py-0.5 text-[11px] font-semibold focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center w-5 h-5 rounded bg-teal-600 text-white shrink-0 cursor-pointer"
              >
                <Check className="w-3 h-3" />
              </button>
            </form>
          ) : (
            <>
              <span className="bed-meta-text inline-flex items-center gap-0.5 rounded-md bg-slate-500 px-1.5 py-0.5 font-semibold text-white whitespace-nowrap shrink-0 max-w-[65%] truncate">
                {editMode && <GripVertical className="w-2.5 h-2.5 opacity-80 shrink-0" />}
                <span className="truncate">{bed.label}</span>
              </span>
              <span className="bed-meta-text font-mono-tabular text-teal-600 font-semibold truncate min-w-0">
                {bed.deviceId ? bed.deviceId : 'ว่าง'}
              </span>
            </>
          )}
        </div>

        {editMode ? (
          <div className="my-auto flex flex-col items-center justify-center gap-1 py-1">
            <span className="bed-meta-text font-medium text-slate-400 text-center">ลากย้ายช่องได้</span>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <button
                type="button"
                title="เปลี่ยนชื่อเตียง"
                onClick={(e) => {
                  e.stopPropagation();
                  setDraftLabel(bed.label);
                  setRenaming(true);
                }}
                className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <Pencil className="w-2.5 h-2.5" />
                ชื่อ
              </button>
              {canDeleteBed && (
                <button
                  type="button"
                  title="ลบเตียงว่าง"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteBed(bed.id);
                  }}
                  className="inline-flex items-center gap-0.5 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-100 cursor-pointer"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  ลบ
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="my-auto flex flex-col items-center justify-center py-1 text-center min-w-0">
            <span className="bed-patient-name inline-flex items-center gap-0.5 font-semibold text-slate-700 group-hover:text-teal-700 leading-tight">
              <Plus className="w-3 h-3 shrink-0" />
              <span className="truncate">รับเด็กเข้าเตียง</span>
            </span>
            {bed.deviceId &&
            device &&
            device.lastSeen !== null &&
            (now - device.lastSeen) / 1000 <= settings.offlineTimeoutSec &&
            device.temperature !== null ? (
              <span className="bed-meta-text mt-1 inline-flex items-center gap-1 rounded bg-teal-50 border border-teal-200 px-1.5 py-0.5 font-mono-tabular font-bold text-teal-700 max-w-full truncate">
                <Wifi className="w-2.5 h-2.5 shrink-0" />
                สด {device.temperature.toFixed(1)}°C
              </span>
            ) : (
              <span className="bed-meta-text mt-0.5 text-slate-400 truncate max-w-full">
                คลิกเพื่อลงทะเบียน
              </span>
            )}
          </div>
        )}

        <div className="h-0.5" aria-hidden="true" />
      </div>
    );
  }

  const cardBorderClass =
    status === 'fever'
      ? 'border-2 border-rose-500 ring-2 ring-rose-500/15 shadow-[0_4px_14px_-4px_rgba(244,63,94,0.3)]'
      : status === 'watch'
        ? 'border-2 border-amber-400 ring-2 ring-amber-400/15 shadow-[0_4px_12px_-4px_rgba(245,158,11,0.22)]'
        : status === 'normal'
          ? 'border-2 border-teal-400 shadow-[0_4px_12px_-4px_rgba(20,184,166,0.18)]'
          : 'border-2 border-slate-300 shadow-xs';

  const tempBoxClass =
    status === 'fever'
      ? 'bg-rose-50 border border-rose-100'
      : status === 'watch'
        ? 'bg-amber-50 border border-amber-100'
        : status === 'normal'
          ? 'bg-emerald-50 border border-emerald-100'
          : 'bg-slate-50 border border-slate-200';

  const tempTextClass =
    status === 'fever'
      ? 'text-rose-600'
      : status === 'watch'
        ? 'text-amber-600'
        : status === 'normal'
          ? 'text-emerald-600'
          : 'text-slate-500';

  const statusTagClass =
    status === 'fever'
      ? 'bg-rose-100 text-rose-700'
      : status === 'watch'
        ? 'bg-amber-100 text-amber-700'
        : status === 'normal'
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-slate-200 text-slate-600';

  const isConnected = status === 'normal' || status === 'watch' || status === 'fever';
  const battery = device?.battery ?? null;
  const batteryClass =
    battery === null || battery === undefined
      ? 'bg-slate-100 text-slate-400'
      : battery <= 25
        ? 'bg-rose-50 text-rose-700 border border-rose-200'
        : battery <= 75
          ? 'bg-amber-50 text-amber-700 border border-amber-200'
          : 'bg-emerald-50 text-emerald-700 border border-emerald-200';

  return (
    <div
      {...dragProps}
      role={editMode ? undefined : 'button'}
      tabIndex={editMode ? -1 : 0}
      onClick={() => {
        if (!editMode && !renaming) onSelectBed(bed);
      }}
      onKeyDown={(e) => {
        if (!editMode && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelectBed(bed);
        }
      }}
      className={`@container bed-card-container relative flex flex-col justify-between ${minHeightClass} ${cardPaddingClass} h-full w-full rounded-xl bg-white text-left transition-all duration-150 overflow-hidden ${
        patientDragOver
          ? 'ring-2 ring-amber-500 bg-amber-50/50'
          : dragOver
          ? 'ring-2 ring-teal-500 bg-teal-50/30'
          : editMode
            ? 'cursor-grab'
            : 'cursor-pointer hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600'
      } ${cardBorderClass}`}
    >
      {patientDragOver && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-amber-600/95 text-white font-bold p-2 text-center rounded-xl pointer-events-none">
          <ArrowLeftRight className="w-5 h-5 mb-1 animate-spin" />
          <span className="text-xs">สลับเตียงกับ {bed.patient.name}</span>
          <span className="text-[10px] font-normal text-amber-100">ปล่อยเพื่อสลับเตียง</span>
        </div>
      )}

      {/* Top Row: Bed Label + ESP32-S3 ID */}
      <div className="flex items-center justify-between gap-1 min-w-0">
        {renaming ? (
          <form onSubmit={handleRenameSubmit} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 w-full">
            <input
              type="text"
              autoFocus
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              className="w-full min-w-0 rounded border border-teal-400 px-1.5 py-0.5 text-[11px] font-semibold focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center w-5 h-5 rounded bg-teal-600 text-white shrink-0 cursor-pointer"
            >
              <Check className="w-3 h-3" />
            </button>
          </form>
        ) : (
          <>
            <span className="bed-meta-text inline-flex items-center gap-0.5 rounded-md bg-slate-800 px-1.5 py-0.5 font-semibold text-white whitespace-nowrap shrink-0 max-w-[55%] truncate">
              {editMode && <GripVertical className="w-2.5 h-2.5 opacity-80 shrink-0" />}
              <span className="truncate">{bed.label}</span>
            </span>
            <span
              title={bed.deviceId ? `รหัสอุปกรณ์: ${bed.deviceId}` : 'ยังไม่ระบุรหัสอุปกรณ์'}
              className="bed-meta-text inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono-tabular font-medium text-slate-600 min-w-0 truncate"
            >
              <Cpu className="w-2.5 h-2.5 shrink-0 text-teal-600" />
              <span className="truncate">{bed.deviceId ?? 'ยังไม่ผูก'}</span>
            </span>
          </>
        )}
      </div>

      {/* Patient Name + HN + Stay Days */}
      <div
        draggable={!editMode && !!bed.patient}
        onDragStart={(e) => {
          if (!bed.patient) return;
          e.stopPropagation();
          e.dataTransfer.setData(
            'application/x-patient-transfer',
            JSON.stringify({
              fromWardId: wardId,
              fromBedId: bed.id,
              patientName: bed.patient.name,
            })
          );
          e.dataTransfer.effectAllowed = 'move';
        }}
        title="คลิกปุ่มย้าย หรือลากชื่อผู้ป่วยไปวางเตียงอื่นเพื่อย้ายได้ทันที"
        className={`mt-1 flex flex-col gap-1 min-w-0 p-1 -mx-1 rounded-lg transition-colors ${
          !editMode ? 'cursor-grab active:cursor-grabbing hover:bg-slate-50 border border-transparent hover:border-teal-200' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-1 w-full min-w-0">
          <div className="min-w-0 flex-1 flex items-center gap-1">
            {!editMode && <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 shrink-0" />}
            <h3 className="bed-patient-name font-bold text-slate-900 truncate" title={bed.patient.name}>
              {bed.patient.name}
            </h3>
          </div>
          {onOpenTransfer && !editMode && (
            <button
              type="button"
              title={`ย้าย ${bed.patient.name} ไปเตียงอื่น`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenTransfer(bed);
              }}
              className="inline-flex items-center gap-0.5 rounded border border-teal-300 bg-teal-50 hover:bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 transition-colors cursor-pointer shadow-2xs shrink-0"
            >
              <ArrowLeftRight className="w-2.5 h-2.5 text-teal-600" />
              <span>ย้าย</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 w-full min-w-0 flex-wrap">
          {bed.patient.hn && (
            <span className="text-[10px] font-mono-tabular font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded px-1.5 py-0.2 shrink-0">
              HN {bed.patient.hn}
            </span>
          )}
          <span
            title="จำนวนวันที่เข้ารับการรักษา"
            className="bed-meta-text inline-flex items-center gap-0.5 font-semibold text-sky-700 bg-sky-50 border border-sky-100 rounded px-1 py-0.2 whitespace-nowrap shrink-0 font-mono-tabular"
          >
            <CalendarClock className="w-2.5 h-2.5 shrink-0" />
            {formatStayBadgeThai(bed.patient.admittedAt, now)}
          </span>
        </div>
      </div>

      {/* Fluid Temperature + Connection/Fever Status Box */}
      <div className={`mt-1 flex flex-wrap items-center justify-between gap-1 rounded-lg ${isDense ? 'px-1.5 py-1' : 'px-2 py-1.5'} min-w-0 ${tempBoxClass}`}>
        <div className={`flex items-baseline font-mono-tabular shrink-0 ${tempTextClass}`}>
          <span className="bed-temp-value font-bold tracking-tight">
            {device?.temperature !== null && device?.temperature !== undefined
              ? device.temperature.toFixed(1)
              : '--.-'}
          </span>
          <span className="bed-temp-unit ml-0.5 font-semibold">°C</span>
        </div>

        <span className={`bed-status-badge inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-semibold min-w-0 max-w-full truncate ${statusTagClass}`}>
          {status === 'offline' || status === 'waiting' ? (
            <WifiOff className="w-2.5 h-2.5 shrink-0" />
          ) : (
            <Wifi className="w-2.5 h-2.5 shrink-0 opacity-75" />
          )}
          <span className="truncate">{getStatusLabel(status)}</span>
        </span>
      </div>

      {/* Bottom Controls Row */}
      {editMode ? (
        <div className="mt-1 flex items-center justify-between gap-1 pt-0.5 min-w-0">
          <span className="bed-meta-text text-slate-400 truncate">ลากย้ายช่องได้</span>
          <button
            type="button"
            title="เปลี่ยนชื่อเตียง"
            onClick={(e) => {
              e.stopPropagation();
              setDraftLabel(bed.label);
              setRenaming(true);
            }}
            className="bed-meta-text inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <Pencil className="w-2.5 h-2.5" />
            ชื่อเตียง
          </button>
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-1 min-w-0">
          <span className={`bed-meta-text inline-flex items-center rounded px-1.5 py-0.5 font-mono-tabular font-semibold whitespace-nowrap shrink-0 ${batteryClass}`}>
            {battery !== null && battery !== undefined ? `${battery}%` : '--%'}
          </span>

          <button
            type="button"
            title={bed.muted ? 'เปิดเสียงเตือนเตียงนี้' : 'ปิดเสียงเตือนชั่วคราว'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute(bed);
            }}
            className={`inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors cursor-pointer shrink-0 ${
              bed.muted
                ? 'border-slate-200 bg-slate-100 text-slate-400 hover:text-slate-600'
                : 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100'
            }`}
          >
            {bed.muted ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
          </button>

          <button
            type="button"
            title="ดูค่าวัด กราฟ และประวัติ"
            onClick={(e) => {
              e.stopPropagation();
              onSelectBed(bed);
            }}
            className="bed-meta-text inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ClipboardList className="w-2.5 h-2.5 text-slate-500 shrink-0" />
            <span className="hidden @[145px]:inline">ดูค่าวัด</span>
          </button>
        </div>
      )}
    </div>
  );
};
