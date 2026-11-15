import React, { useEffect, useState } from 'react';
import {
  Activity,
  BedDouble,
  Check,
  ChevronDown,
  ChevronUp,
  DoorOpen,
  Flame,
  Footprints,
  GripVertical,
  KeyRound,
  Monitor,
  MousePointerClick,
  Pencil,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  SquareDashed,
  Trash2,
} from 'lucide-react';
import type {
  BedSlot,
  EspDevice,
  Ward,
  WardPresetShape,
  WardSettings,
  WardStructure,
  WardStructureType,
} from '../types';
import { getBedStatus, getStatusLabel } from '../utils/wardHelpers';
import { BedCard } from './BedCard';
import { TransferPatientModal } from './TransferPatientModal';

type EditorTool = 'move' | 'bed' | 'station' | 'corridor' | 'door' | 'zone';

interface WardFloorplanProps {
  ward: Ward;
  allWards?: Ward[];
  totalWardsCount: number;
  devices: Record<string, EspDevice>;
  settings: WardSettings;
  now: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectBed: (bed: BedSlot) => void;
  onAdmitBed: (bed: BedSlot) => void;
  onToggleMute: (bed: BedSlot) => void;
  onOpenHnLookup: () => void;
  onUpdateWardName: (wardId: string, name: string, shortName: string) => Promise<void>;
  onDeleteWard: (wardId: string) => Promise<void>;
  onApplyPreset: (wardId: string, shape: WardPresetShape) => Promise<void>;
  onUpdateGridSize: (wardId: string, gridCols: number, gridRows: number) => Promise<void>;
  onAddBedAt: (wardId: string, gridX?: number, gridY?: number) => Promise<void>;
  onPlaceBed: (wardId: string, bedId: string, gridX: number, gridY: number) => Promise<void>;
  onRenameBed: (wardId: string, bedId: string, label: string) => Promise<void>;
  onDeleteBed: (wardId: string, bedId: string) => Promise<void>;
  onAddStructure: (wardId: string, type: WardStructureType, gridX: number, gridY: number) => Promise<void>;
  onUpdateStructure: (
    wardId: string,
    structId: string,
    patch: Partial<Pick<WardStructure, 'label' | 'gridX' | 'gridY' | 'colSpan' | 'rowSpan'>>
  ) => Promise<void>;
  onDeleteStructure: (wardId: string, structId: string) => Promise<void>;
  onTransferPatient?: (
    fromWardId: string,
    fromBedId: string,
    toWardId: string,
    toBedId: string,
    moveDevice: boolean
  ) => Promise<void>;
}

const PRESET_BUTTONS: Array<{ shape: WardPresetShape; label: string }> = [
  { shape: 'standard', label: '2 แถว + ทางเดินกลาง' },
  { shape: 'single_row', label: 'แถวเดียวริมทางเดิน' },
  { shape: 'l_shape', label: 'รูปตัว L' },
  { shape: 'u_shape', label: 'รูปตัว U / เคาน์เตอร์กลาง' },
];

const TOOL_BUTTONS: Array<{ tool: EditorTool; label: string }> = [
  { tool: 'move', label: 'ลากย้าย' },
  { tool: 'bed', label: '+ เตียง' },
  { tool: 'corridor', label: '+ ทางเดิน' },
  { tool: 'station', label: '+ เคาน์เตอร์' },
  { tool: 'door', label: '+ ประตู' },
  { tool: 'zone', label: '+ ห้อง/โซน' },
];

export const WardFloorplan: React.FC<WardFloorplanProps> = ({
  ward,
  allWards,
  totalWardsCount,
  devices,
  settings,
  now,
  isCollapsed,
  onToggleCollapse,
  onSelectBed,
  onAdmitBed,
  onToggleMute,
  onOpenHnLookup,
  onUpdateWardName,
  onDeleteWard,
  onApplyPreset,
  onUpdateGridSize,
  onAddBedAt,
  onPlaceBed,
  onRenameBed,
  onDeleteBed,
  onAddStructure,
  onUpdateStructure,
  onDeleteStructure,
  onTransferPatient,
}) => {
  const [editMode, setEditMode] = useState(false);
  const [activeTool, setActiveTool] = useState<EditorTool>('move');
  const [draftName, setDraftName] = useState(ward.name);
  const [draftShort, setDraftShort] = useState(ward.shortName);
  const [confirmDeleteWard, setConfirmDeleteWard] = useState(false);
  const [renamingStructId, setRenamingStructId] = useState<string | null>(null);
  const [structDraftLabel, setStructDraftLabel] = useState('');
  const [transferTargetBed, setTransferTargetBed] = useState<BedSlot | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  useEffect(() => {
    setDraftName(ward.name);
    setDraftShort(ward.shortName);
    setConfirmDeleteWard(false);
    setRenamingStructId(null);
  }, [ward.id, ward.name, ward.shortName]);

  const occupiedBeds = ward.beds.filter((b) => b.patient !== null);
  const emptyCount = ward.beds.length - occupiedBeds.length;

  let normalCount = 0;
  let feverCount = 0;
  let watchCount = 0;

  for (const bed of occupiedBeds) {
    const dev = bed.deviceId ? devices[bed.deviceId] : undefined;
    const st = getBedStatus(bed, dev, settings, now);
    if (st === 'normal') normalCount++;
    else if (st === 'fever') feverCount++;
    else if (st === 'watch') watchCount++;
  }

  const { gridCols, gridRows, structures } = ward.layout;

  // Build occupancy map to render interactive empty cells in Edit Mode
  const occupiedCells = new Set<string>();
  for (const b of ward.beds) {
    occupiedCells.add(`${b.gridX},${b.gridY}`);
  }
  for (const s of structures) {
    for (let dx = 0; dx < s.colSpan; dx++) {
      for (let dy = 0; dy < s.rowSpan; dy++) {
        occupiedCells.add(`${s.gridX + dx},${s.gridY + dy}`);
      }
    }
  }

  const emptyGridCells: Array<{ x: number; y: number }> = [];
  if (editMode) {
    for (let y = 0; y < gridRows; y++) {
      for (let x = 0; x < gridCols; x++) {
        if (!occupiedCells.has(`${x},${y}`)) {
          emptyGridCells.push({ x, y });
        }
      }
    }
  }

  const handleDropOnCell = (e: React.DragEvent, targetX: number, targetY: number) => {
    e.preventDefault();
    setDragOverCell(null);
    const raw = e.dataTransfer.getData('application/x-ward-item');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { kind: 'bed' | 'structure'; id: string };
      if (parsed.kind === 'bed') {
        void onPlaceBed(ward.id, parsed.id, targetX, targetY);
      } else if (parsed.kind === 'structure') {
        void onUpdateStructure(ward.id, parsed.id, { gridX: targetX, gridY: targetY });
      }
    } catch {
      // ignore invalid drag payload
    }
  };

  const handleEmptyCellClick = (x: number, y: number) => {
    if (!editMode) return;
    if (activeTool === 'bed') {
      void onAddBedAt(ward.id, x, y);
    } else if (
      activeTool === 'corridor' ||
      activeTool === 'station' ||
      activeTool === 'door' ||
      activeTool === 'zone'
    ) {
      void onAddStructure(ward.id, activeTool, x, y);
    }
  };

  const renderStructure = (struct: WardStructure) => {
    const isRenaming = renamingStructId === struct.id;
    const dragProps = editMode
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.setData(
              'application/x-ward-item',
              JSON.stringify({ kind: 'structure', id: struct.id })
            );
            e.dataTransfer.effectAllowed = 'move';
          },
        }
      : {};

    const editControlsOverlay = editMode && (
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1 pt-1 border-t border-slate-200/70">
        <button
          type="button"
          title="ลดความกว้าง"
          onClick={(e) => {
            e.stopPropagation();
            void onUpdateStructure(ward.id, struct.id, { colSpan: Math.max(1, struct.colSpan - 1) });
          }}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9.5px] font-mono-tabular font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          W-
        </button>
        <button
          type="button"
          title="เพิ่มความกว้าง"
          onClick={(e) => {
            e.stopPropagation();
            void onUpdateStructure(ward.id, struct.id, { colSpan: struct.colSpan + 1 });
          }}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9.5px] font-mono-tabular font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          W+
        </button>
        <button
          type="button"
          title="ลดความสูง"
          onClick={(e) => {
            e.stopPropagation();
            void onUpdateStructure(ward.id, struct.id, { rowSpan: Math.max(1, struct.rowSpan - 1) });
          }}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9.5px] font-mono-tabular font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          H-
        </button>
        <button
          type="button"
          title="เพิ่มความสูง"
          onClick={(e) => {
            e.stopPropagation();
            void onUpdateStructure(ward.id, struct.id, { rowSpan: struct.rowSpan + 1 });
          }}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9.5px] font-mono-tabular font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          H+
        </button>
        <button
          type="button"
          title="แก้ไขชื่อ"
          onClick={(e) => {
            e.stopPropagation();
            setStructDraftLabel(struct.label);
            setRenamingStructId(struct.id);
          }}
          className="inline-flex items-center justify-center w-5 h-5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          <Pencil className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          title="ลบออกจากผัง"
          onClick={(e) => {
            e.stopPropagation();
            void onDeleteStructure(ward.id, struct.id);
          }}
          className="inline-flex items-center justify-center w-5 h-5 rounded border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
    );

    const renameForm = isRenaming && (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (structDraftLabel.trim()) {
            void onUpdateStructure(ward.id, struct.id, { label: structDraftLabel.trim() });
          }
          setRenamingStructId(null);
        }}
        className="flex items-center gap-1 w-full mb-1"
      >
        <input
          type="text"
          autoFocus
          value={structDraftLabel}
          onChange={(e) => setStructDraftLabel(e.target.value)}
          className="w-full rounded border border-teal-400 bg-white px-1.5 py-0.5 text-[11px] font-semibold focus:outline-none"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center w-5 h-5 rounded bg-teal-600 text-white shrink-0 cursor-pointer"
        >
          <Check className="w-3 h-3" />
        </button>
      </form>
    );

    const gridStyle: React.CSSProperties = {
      gridColumn: `${struct.gridX + 1} / span ${struct.colSpan}`,
      gridRow: `${struct.gridY + 1} / span ${struct.rowSpan}`,
    };

    if (struct.type === 'station') {
      const isWide = struct.colSpan >= 2 && struct.rowSpan === 1;
      return (
        <div
          key={struct.id}
          style={gridStyle}
          {...dragProps}
          className={`bed-card-container min-w-0 overflow-hidden rounded-xl border border-teal-600/35 ward-station-grid p-2 flex ${
            isWide ? 'flex-row items-center justify-between gap-2' : 'flex-col justify-between gap-2'
          } ${editMode ? 'cursor-grab ring-1 ring-teal-400/50' : ''}`}
        >
          <div className={`min-w-0 rounded-lg border border-slate-200 bg-white p-2 shadow-xs ${isWide ? 'flex-1 flex flex-wrap items-center justify-between gap-2' : ''}`}>
            {renameForm}
            <div className={isWide ? 'text-left min-w-0' : 'text-center min-w-0'}>
              <h3 className="bed-patient-name font-display font-bold text-slate-900 flex items-center justify-center gap-1 truncate">
                {editMode && <GripVertical className="w-3 h-3 text-slate-400 shrink-0" />}
                <span className="truncate">{struct.label}</span>
              </h3>
              <p className="bed-meta-text text-slate-400 truncate">จุดสังเกตการณ์ & ตรวจการ</p>
            </div>

            <div
              className={`${isWide ? '' : 'mt-1.5'} flex flex-wrap items-center justify-between gap-1 rounded-lg border px-1.5 py-1 bed-meta-text font-semibold min-w-0 ${
                feverCount > 0
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <span className="inline-flex items-center gap-1 truncate min-w-0">
                <Monitor className="w-3 h-3 shrink-0" />
                <span className="truncate">มอนิเตอร์</span>
              </span>
              <span className={`truncate ${feverCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {feverCount > 0 ? `ไข้ ${feverCount}` : 'พร้อมดูแล'}
              </span>
            </div>

            <div className={`${isWide ? 'flex items-center gap-3' : 'mt-1.5 grid grid-cols-2 gap-1 pt-1.5 border-t border-slate-100'} text-center`}>
              <div className="min-w-0">
                <div className="bed-patient-name font-mono-tabular font-bold text-slate-900 leading-tight">
                  {occupiedBeds.length}
                </div>
                <div className="bed-meta-text text-slate-500 truncate">ครองเตียง</div>
              </div>
              <div className="min-w-0">
                <div className="bed-patient-name font-mono-tabular font-bold text-emerald-600 leading-tight">
                  {emptyCount}
                </div>
                <div className="bed-meta-text text-slate-500 truncate">เตียงว่าง</div>
              </div>
            </div>
          </div>

          {editControlsOverlay}
        </div>
      );
    }

    if (struct.type === 'corridor') {
      return (
        <div
          key={struct.id}
          style={gridStyle}
          {...dragProps}
          className={`bed-card-container min-w-0 overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-100/90 px-2 py-1.5 flex flex-col items-center justify-center text-center ${
            editMode ? 'cursor-grab ring-1 ring-slate-300' : ''
          }`}
        >
          {renameForm}
          <div className="bed-meta-text inline-flex items-center gap-1 font-semibold tracking-wide text-slate-500 max-w-full min-w-0">
            {editMode && <GripVertical className="w-3 h-3 text-slate-400 shrink-0" />}
            <Footprints className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{struct.label}</span>
          </div>
          {editControlsOverlay}
        </div>
      );
    }

    if (struct.type === 'door') {
      return (
        <div
          key={struct.id}
          style={gridStyle}
          {...dragProps}
          className={`bed-card-container min-w-0 overflow-hidden rounded-xl border-2 border-teal-600/60 bg-white px-2 py-1.5 flex flex-col items-center justify-center text-center shadow-xs ${
            editMode ? 'cursor-grab' : ''
          }`}
        >
          {renameForm}
          <div className="bed-meta-text inline-flex items-center gap-1 font-bold text-teal-800 max-w-full min-w-0">
            {editMode && <GripVertical className="w-3 h-3 text-slate-400 shrink-0" />}
            <DoorOpen className="w-3.5 h-3.5 text-teal-700 shrink-0" />
            <span className="truncate">{struct.label}</span>
          </div>
          {editControlsOverlay}
        </div>
      );
    }

    // 'zone' (custom room / isolation room / wall / med prep)
    return (
      <div
        key={struct.id}
        style={gridStyle}
        {...dragProps}
        className={`bed-card-container min-w-0 overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/60 px-2 py-1.5 flex flex-col items-center justify-center text-center ${
          editMode ? 'cursor-grab' : ''
        }`}
      >
        {renameForm}
        <div className="bed-meta-text inline-flex items-center gap-1 font-bold text-indigo-900 max-w-full min-w-0">
          {editMode && <GripVertical className="w-3 h-3 text-indigo-400 shrink-0" />}
          <SquareDashed className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="truncate">{struct.label}</span>
        </div>
        {editControlsOverlay}
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_6px_24px_-12px_rgba(15,23,42,0.08)] p-3 md:p-4">
      {/* Compact Ward Header Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-bold text-slate-900">
              {ward.name}
            </h2>
            <span className="inline-flex items-center rounded bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-teal-700">
              TOP VIEW · {gridCols}×{gridRows}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            กดที่เตียงเพื่อดูกราฟ/ล้างค่า หรือกด [ปรับผังวอร์ด] เพื่อจัดวางรูปทรงและตำแหน่งตามโรงพยาบาลจริง
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50/70 px-2.5 py-1 text-[11px] font-semibold text-slate-700 whitespace-nowrap shrink-0">
            <BedDouble className="w-3.5 h-3.5 text-sky-600" />
            <span className="font-mono-tabular">ครอง {occupiedBeds.length}/{ward.beds.length}</span>
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 whitespace-nowrap shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-mono-tabular">ปกติ {normalCount}</span>
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/90 px-2.5 py-1 text-[11px] font-semibold text-rose-700 whitespace-nowrap shrink-0">
            <Flame className="w-3.5 h-3.5 text-rose-600" />
            <span className="font-mono-tabular">มีไข้ {feverCount + watchCount}</span>
          </div>

          <button
            type="button"
            onClick={onOpenHnLookup}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1 text-[11px] font-semibold text-white shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <KeyRound className="w-3 h-3" />
            ดึงข้อมูล (HN)
          </button>

          <button
            type="button"
            onClick={() => {
              setEditMode((v) => !v);
              setActiveTool('move');
            }}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              editMode
                ? 'border-teal-600 bg-teal-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            {editMode ? 'เสร็จสิ้นการปรับผัง' : 'ปรับผังวอร์ด'}
          </button>

          <button
            type="button"
            onClick={onToggleCollapse}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3 h-3" />
                ขยายผัง
              </>
            ) : (
              <>
                <ChevronUp className="w-3 h-3" />
                ย่อผัง
              </>
            )}
          </button>
        </div>
      </div>

      {/* Flexible 2D Floorplan Editor Bar */}
      {editMode && !isCollapsed && (
        <div className="mb-3 rounded-xl border border-teal-200 bg-teal-50/55 p-3 space-y-2.5">
          {/* Row 1: Ward Rename + Grid Size + Delete Ward */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="ชื่อวอร์ด"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-teal-500 focus:outline-none w-48"
              />
              <input
                type="text"
                value={draftShort}
                onChange={(e) => setDraftShort(e.target.value)}
                placeholder="ชื่อย่อ"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-teal-500 focus:outline-none w-24"
              />
              <button
                type="button"
                onClick={() => void onUpdateWardName(ward.id, draftName, draftShort)}
                className="inline-flex items-center gap-1 rounded-lg bg-teal-600 hover:bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
              >
                <Check className="w-3 h-3" />
                บันทึกชื่อ
              </button>
            </div>

            {/* Grid Dimensions (Cols x Rows) */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
                <span className="font-semibold text-slate-600">กว้าง (คอลัมน์):</span>
                <button
                  type="button"
                  onClick={() => void onUpdateGridSize(ward.id, Math.max(3, gridCols - 1), gridRows)}
                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 cursor-pointer"
                >
                  -
                </button>
                <span className="font-mono-tabular font-bold px-1">{gridCols}</span>
                <button
                  type="button"
                  onClick={() => void onUpdateGridSize(ward.id, Math.min(10, gridCols + 1), gridRows)}
                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 cursor-pointer"
                >
                  +
                </button>
              </div>

              <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
                <span className="font-semibold text-slate-600">สูง (แถว):</span>
                <button
                  type="button"
                  onClick={() => void onUpdateGridSize(ward.id, gridCols, Math.max(2, gridRows - 1))}
                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 cursor-pointer"
                >
                  -
                </button>
                <span className="font-mono-tabular font-bold px-1">{gridRows}</span>
                <button
                  type="button"
                  onClick={() => void onUpdateGridSize(ward.id, gridCols, Math.min(8, gridRows + 1))}
                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 cursor-pointer"
                >
                  +
                </button>
              </div>

              {totalWardsCount > 1 && occupiedBeds.length === 0 && (
                !confirmDeleteWard ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteWard(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    ลบวอร์ด
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void onDeleteWard(ward.id)}
                      className="rounded-lg bg-rose-600 px-2.5 py-1 font-semibold text-white cursor-pointer"
                    >
                      ยืนยันลบ
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteWard(false)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-600 cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Row 2: Ward Shape Presets */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-1 border-t border-teal-200/70">
            <span className="font-semibold text-slate-700 mr-1">รูปแบบผังโรงพยาบาล:</span>
            {PRESET_BUTTONS.map((p) => (
              <button
                key={p.shape}
                type="button"
                onClick={() => void onApplyPreset(ward.id, p.shape)}
                className={`rounded-lg border px-2.5 py-1 font-semibold transition-colors cursor-pointer ${
                  ward.layout.shape === p.shape
                    ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Row 3: Interactive 2D Placement Tools */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-1 border-t border-teal-200/70">
            <span className="font-semibold text-slate-700 inline-flex items-center gap-1 mr-1">
              <MousePointerClick className="w-3.5 h-3.5 text-teal-700" />
              เครื่องมือวางบนช่องว่าง:
            </span>
            {TOOL_BUTTONS.map((t) => (
              <button
                key={t.tool}
                type="button"
                onClick={() => setActiveTool(t.tool)}
                className={`rounded-lg border px-2.5 py-1 font-semibold transition-colors cursor-pointer ${
                  activeTool === t.tool
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
            <span className="text-[10.5px] text-slate-500 ml-auto">
              {activeTool === 'move'
                ? 'ลากเตียง เคาน์เตอร์ หรือทางเดิน ไปวางช่องใดก็ได้'
                : 'คลิกที่ช่องว่าง (+ วางที่นี่) บนผังเพื่อเพิ่มองค์ประกอบ'}
            </span>
          </div>
        </div>
      )}

      {/* 2D Architectural Ward Grid */}
      {!isCollapsed ? (
        <div className="rounded-xl border-2 border-teal-700/75 ward-floor-grid overflow-x-auto p-2.5 md:p-3.5">
          <div
            className={`grid ${gridCols >= 7 ? 'gap-1.5' : 'gap-2.5'}`}
            style={{
              minWidth: `${Math.max(580, gridCols * 112)}px`,
              gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
              gridAutoRows: 'minmax(38px, auto)',
            }}
          >
            {/* Empty Drop / Place Cells (visible in Edit Mode) */}
            {editMode &&
              emptyGridCells.map(({ x, y }) => {
                const cellKey = `${x},${y}`;
                const isOver = dragOverCell === cellKey;
                return (
                  <button
                    key={`empty-${cellKey}`}
                    type="button"
                    style={{ gridColumn: `${x + 1} / span 1`, gridRow: `${y + 1} / span 1` }}
                    onClick={() => handleEmptyCellClick(x, y)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverCell(cellKey);
                    }}
                    onDragLeave={() => setDragOverCell(null)}
                    onDrop={(e) => handleDropOnCell(e, x, y)}
                    className={`min-h-[42px] rounded-xl border border-dashed flex flex-col items-center justify-center p-2 text-[10.5px] font-semibold transition-colors ${
                      isOver
                        ? 'border-teal-600 bg-teal-100/70 text-teal-800'
                        : activeTool === 'move'
                          ? 'border-slate-300/80 bg-white/40 text-slate-400'
                          : 'border-teal-400 bg-teal-50/40 text-teal-700 hover:bg-teal-100/60 cursor-pointer'
                    }`}
                  >
                    {activeTool === 'move' ? (
                      <span>วางที่นี่</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Plus className="w-3 h-3" />
                        วาง{TOOL_BUTTONS.find((t) => t.tool === activeTool)?.label.replace('+ ', '')}
                      </span>
                    )}
                  </button>
                );
              })}

            {/* Architectural Structures (Station, Corridor, Door, Zone) */}
            {structures.map((struct) => renderStructure(struct))}

            {/* Beds placed on 2D coordinates */}
            {ward.beds.map((bed) => (
              <div
                key={bed.id}
                style={{
                  gridColumn: `${bed.gridX + 1} / span 1`,
                  gridRow: `${bed.gridY + 1} / span 1`,
                }}
              >
                <BedCard
                  bed={bed}
                  wardId={ward.id}
                  device={bed.deviceId ? devices[bed.deviceId] : undefined}
                  settings={settings}
                  now={now}
                  editMode={editMode}
                  canDeleteBed={ward.beds.length > 1}
                  gridCols={gridCols}
                  onSelectBed={onSelectBed}
                  onAdmitBed={onAdmitBed}
                  onToggleMute={onToggleMute}
                  onDropItemOnCell={handleDropOnCell}
                  onRenameBed={(bedId, label) => void onRenameBed(ward.id, bedId, label)}
                  onDeleteBed={(bedId) => void onDeleteBed(ward.id, bedId)}
                  onOpenTransfer={(targetBed) => setTransferTargetBed(targetBed)}
                  onTransferPatient={onTransferPatient}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Collapsed Compact Strip View */
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
          {occupiedBeds.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-500">
              ยังไม่มีผู้ป่วยครองเตียงในวอร์ดนี้
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {occupiedBeds.map((bed) => {
                const dev = bed.deviceId ? devices[bed.deviceId] : undefined;
                const status = getBedStatus(bed, dev, settings, now);
                return (
                  <button
                    key={bed.id}
                    type="button"
                    onClick={() => onSelectBed(bed)}
                    className="flex items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-teal-400 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 truncate">
                        <span>{bed.label}</span>
                        <span className="text-slate-300">·</span>
                        <span className="truncate">{bed.patient?.name}</span>
                      </div>
                      <div className="text-[10px] font-mono-tabular text-slate-500 truncate">
                        {bed.deviceId ?? 'ไม่ระบุอุปกรณ์'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`font-mono-tabular text-sm font-bold ${
                          status === 'fever'
                            ? 'text-rose-600'
                            : status === 'watch'
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                        }`}
                      >
                        {dev?.temperature !== null && dev?.temperature !== undefined
                          ? `${dev.temperature.toFixed(1)}°C`
                          : '--.-°C'}
                      </div>
                      <div className="text-[10px] font-medium text-slate-500 inline-flex items-center gap-0.5">
                        <Activity className="w-2.5 h-2.5" />
                        {getStatusLabel(status)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {transferTargetBed && onTransferPatient && (
        <TransferPatientModal
          sourceWard={ward}
          sourceBed={transferTargetBed}
          allWards={allWards || [ward]}
          devices={devices}
          settings={settings}
          now={now}
          onClose={() => setTransferTargetBed(null)}
          onTransfer={onTransferPatient}
        />
      )}
    </section>
  );
};
