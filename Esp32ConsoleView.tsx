import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Cpu,
  Pencil,
  PlugZap,
  Plus,
  Signal,
  Trash2,
  Unplug,
  X,
} from 'lucide-react';
import type { BedSlot, EspDevice, Ward, WardSettings } from '../types';
import { formatRelativeThai } from '../utils/wardHelpers';

interface WebSerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}

interface WebSerialApi {
  requestPort(): Promise<WebSerialPort>;
}

interface Esp32ConsoleViewProps {
  wards: Ward[];
  devices: EspDevice[];
  settings: WardSettings;
  now: number;
  onPairDevice: (wardId: string, bedId: string, deviceId: string | null) => Promise<void>;
  onDeleteDevice: (deviceId: string) => Promise<void>;
  onAddDevice?: (deviceId: string, label?: string) => Promise<void>;
  onUpdateDeviceName?: (deviceId: string, label: string) => Promise<void>;
}

export const Esp32ConsoleView: React.FC<Esp32ConsoleViewProps> = ({
  wards,
  devices,
  settings,
  now,
  onPairDevice,
  onDeleteDevice,
  onAddDevice,
  onUpdateDeviceName,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDeviceLabel, setNewDeviceLabel] = useState('');
  const [addDeviceError, setAddDeviceError] = useState<string | null>(null);

  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editLabelInput, setEditLabelInput] = useState('');

  const [usbConnected, setUsbConnected] = useState(false);
  const [usbStatus, setUsbStatus] = useState<string | null>(null);
  const [usbLastLine, setUsbLastLine] = useState<string | null>(null);
  const usbPortRef = useRef<WebSerialPort | null>(null);
  const usbReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const usbStopRef = useRef(false);

  const findDevicePlacement = (deviceId: string): { ward: Ward; bed: BedSlot } | null => {
    for (const w of wards) {
      const b = w.beds.find((slot) => slot.deviceId === deviceId);
      if (b) return { ward: w, bed: b };
    }
    return null;
  };

  const disconnectUsbSerial = async () => {
    usbStopRef.current = true;
    try {
      await usbReaderRef.current?.cancel();
    } catch {
      // ignore cancel errors
    }
    try {
      await usbPortRef.current?.close();
    } catch {
      // ignore close errors
    }
    usbReaderRef.current = null;
    usbPortRef.current = null;
    setUsbConnected(false);
    setUsbStatus('ตัดการเชื่อมต่อ USB แล้ว');
  };

  useEffect(() => {
    return () => {
      usbStopRef.current = true;
      void usbReaderRef.current?.cancel().catch(() => {});
      void usbPortRef.current?.close().catch(() => {});
    };
  }, []);

  const connectUsbSerial = async () => {
    const serialApi = (navigator as unknown as { serial?: WebSerialApi }).serial;
    if (!serialApi) {
      setUsbStatus('เบราว์เซอร์นี้ไม่รองรับ Web Serial (กรุณาใช้ Chrome / Edge บนคอมพิวเตอร์)');
      return;
    }

    try {
      const port = await serialApi.requestPort();
      await port.open({ baudRate: 115200 });
      usbPortRef.current = port;
      usbStopRef.current = false;
      setUsbConnected(true);
      setUsbStatus('เชื่อมต่อ USB สำเร็จ — กำลังรอรับค่าจากอุปกรณ์...');

      if (!port.readable) {
        setUsbStatus('พอร์ต USB ไม่มีช่องอ่านข้อมูล');
        return;
      }

      const decoder = new TextDecoder();
      const reader = port.readable.getReader();
      usbReaderRef.current = reader;

      let buffer = '';
      while (!usbStopRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          setUsbLastLine(line);
          const jsonStr = line.startsWith('TELEMETRY:')
            ? line.slice('TELEMETRY:'.length).trim()
            : line.startsWith('{') && line.endsWith('}')
              ? line
              : null;
          if (!jsonStr) continue;
          try {
            const payload = JSON.parse(jsonStr) as Record<string, unknown>;
            if (payload.deviceId || payload.device_id) {
              const res = await fetch('/api/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              const result = await res.json();
              if (res.ok) {
                setUsbStatus(
                  `รับค่า USB สำเร็จ: ${result.deviceId} -> ${Number(result.temperature).toFixed(1)}°C`
                );
              } else {
                setUsbStatus(`ข้อมูลจากบอร์ดไม่ผ่านเกณฑ์: ${result.error}`);
              }
            }
          } catch {
            // ignore non-JSON debug lines
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('policy') || msg.toLowerCase().includes('disallowed')) {
        setUsbStatus(
          'ถูกจำกัดสิทธิ์ USB ในกรอบ Preview — กรุณาเปิดลิงก์แอปนี้ใน "แท็บใหม่ของ Chrome" แล้วกดเชื่อมต่อ USB อีกครั้ง'
        );
      } else if (!msg.toLowerCase().includes('no port selected')) {
        setUsbStatus(`เชื่อมต่อ USB ไม่สำเร็จ: ${msg}`);
      }
      setUsbConnected(false);
    }
  };

  const handleSaveEditLabel = async (devId: string) => {
    if (onUpdateDeviceName && editLabelInput.trim()) {
      await onUpdateDeviceName(devId, editLabelInput.trim());
    }
    setEditingDeviceId(null);
  };

  const handleCreateDeviceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddDeviceError(null);
    const cleanId = newDeviceId.trim();
    if (!cleanId) {
      setAddDeviceError('กรุณากรอกรหัสอุปกรณ์');
      return;
    }
    if (onAddDevice) {
      await onAddDevice(cleanId, newDeviceLabel.trim() || cleanId);
    }
    setNewDeviceId('');
    setNewDeviceLabel('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Registered ESP32-S3 SuperMini Devices Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-teal-600" />
              อุปกรณ์เชื่อมต่อในระบบ ({devices.length} ตัว)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              รับค่าเซ็นเซอร์ DS18B20 จำนวน 4 ตัวต่อบอร์ด มาคำนวณค่าเฉลี่ยอัตโนมัติ (รองรับทั้ง Wi-Fi และสาย USB-C โดยตรง)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAddDeviceError(null);
                setNewDeviceId('');
                setNewDeviceLabel('');
                setShowAddModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              + เพิ่มอุปกรณ์ใหม่
            </button>

            {!usbConnected ? (
              <button
                type="button"
                onClick={() => void connectUsbSerial()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <PlugZap className="w-3.5 h-3.5 text-emerald-400" />
                เชื่อมต่อบอร์ดผ่านสาย USB-C
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void disconnectUsbSerial()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Unplug className="w-3.5 h-3.5" />
                ตัดการเชื่อมต่อ USB
              </button>
            )}
          </div>
        </div>

        {(usbStatus || usbLastLine) && (
          <div
            className={`mb-4 rounded-xl border px-3.5 py-2.5 text-xs space-y-1 ${
              usbConnected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            {usbStatus && <div className="font-semibold">{usbStatus}</div>}
            {usbLastLine && (
              <div className="font-mono-tabular text-[11px] opacity-80 truncate">
                Serial ล่าสุด: {usbLastLine}
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 font-semibold">รหัสอุปกรณ์</th>
                <th className="px-4 py-2.5 font-semibold">ผูกกับวอร์ด / เตียง</th>
                <th className="px-4 py-2.5 font-semibold">ค่า DS18B20 (4 ตัว)</th>
                <th className="px-4 py-2.5 font-semibold text-right">ค่าเฉลี่ยล่าสุด</th>
                <th className="px-4 py-2.5 font-semibold text-right">แบตเตอรี่</th>
                <th className="px-4 py-2.5 font-semibold text-right">WiFi</th>
                <th className="px-4 py-2.5 font-semibold">อัปเดตล่าสุด</th>
                <th className="px-4 py-2.5 font-semibold text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    ยังไม่มีอุปกรณ์ส่งข้อมูลเข้ามา
                  </td>
                </tr>
              ) : (
                devices.map((dev) => {
                  const placement = findDevicePlacement(dev.deviceId);
                  const sleepSec = (dev.deepSleepMinutes ?? 5) * 60;
                  const timeoutSec = Math.max(settings.offlineTimeoutSec || 600, sleepSec * 2 + 90);
                  const isOffline =
                    !dev.lastSeen || (now - dev.lastSeen) / 1000 > timeoutSec;
                  const temp = dev.temperature;
                  const tempColor =
                    temp === null
                      ? 'text-slate-400'
                      : temp >= settings.feverThreshold
                        ? 'text-rose-600'
                        : temp >= settings.watchThreshold
                          ? 'text-amber-600'
                          : 'text-emerald-600';

                  const selectVal = placement ? `${placement.ward.id}::${placement.bed.id}` : '';
                  const sensors = dev.sensors ?? [];

                  return (
                    <tr key={dev.deviceId} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5">
                        {editingDeviceId === dev.deviceId ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editLabelInput}
                              onChange={(e) => setEditLabelInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleSaveEditLabel(dev.deviceId);
                                if (e.key === 'Escape') setEditingDeviceId(null);
                              }}
                              placeholder="ตั้งชื่ออุปกรณ์..."
                              autoFocus
                              className="rounded-lg border border-teal-500 bg-white px-2 py-0.5 text-xs font-bold text-slate-900 w-32 focus:outline-none"
                            />
                            <button
                              type="button"
                              title="บันทึกชื่อ"
                              onClick={() => void handleSaveEditLabel(dev.deviceId)}
                              className="p-1 rounded-md bg-teal-600 text-white hover:bg-teal-700 cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              title="ยกเลิก"
                              onClick={() => setEditingDeviceId(null)}
                              className="p-1 rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="group/name flex items-center gap-1.5">
                            <div>
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-slate-900 text-xs">
                                  {dev.label || dev.deviceId}
                                </span>
                                <button
                                  type="button"
                                  title="แก้ไขชื่ออุปกรณ์"
                                  onClick={() => {
                                    setEditingDeviceId(dev.deviceId);
                                    setEditLabelInput(dev.label || dev.deviceId);
                                  }}
                                  className="opacity-0 group-hover/name:opacity-100 hover:opacity-100 p-0.5 text-slate-400 hover:text-teal-600 rounded transition-opacity cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="font-mono-tabular text-[11px] text-teal-700 font-semibold">
                                ID: {dev.deviceId}
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {isOffline ? 'ขาดสัญญาณ' : 'ออนไลน์'} · {dev.packetCount} pkts
                        </div>
                      </td>

                      <td className="px-4 py-2.5">
                        <select
                          value={selectVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                              const [wId, bId] = val.split('::');
                              void onPairDevice(wId, bId, dev.deviceId);
                            } else if (placement) {
                              void onPairDevice(placement.ward.id, placement.bed.id, null);
                            }
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-teal-500 focus:outline-none"
                        >
                          <option value="">-- ยังไม่ผูกเตียง --</option>
                          {wards.map((w) => (
                            <optgroup key={w.id} label={w.name}>
                              {w.beds.map((b) => (
                                <option key={b.id} value={`${w.id}::${b.id}`}>
                                  {w.shortName} · {b.label} {b.patient ? `(${b.patient.name})` : '(ว่าง)'}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-2.5">
                        {sensors.length > 0 ? (
                          <div className="flex flex-wrap gap-1 font-mono-tabular text-[10.5px]">
                            {[0, 1, 2, 3].map((idx) => {
                              const val = sensors[idx];
                              return (
                                <span
                                  key={idx}
                                  className={`rounded px-1.5 py-0.5 border ${
                                    val !== null && val !== undefined
                                      ? 'border-slate-200 bg-slate-50 text-slate-700'
                                      : 'border-rose-200 bg-rose-50 text-rose-600'
                                  }`}
                                >
                                  S{idx + 1}: {val !== null && val !== undefined ? val.toFixed(1) : 'หลุด'}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">ค่าเดี่ยว / ยังไม่มี 4 จุด</span>
                        )}
                      </td>

                      <td className={`px-4 py-2.5 text-right font-mono-tabular text-sm font-bold ${isOffline ? 'text-slate-400' : tempColor}`}>
                        {temp !== null ? `${temp.toFixed(1)} °C` : '--.-'}
                      </td>

                      <td className="px-4 py-2.5 text-right font-mono-tabular text-slate-600">
                        {dev.battery !== null ? `${dev.battery}%` : '--'}
                      </td>

                      <td className="px-4 py-2.5 text-right font-mono-tabular text-slate-500">
                        <span className="inline-flex items-center gap-1 justify-end">
                          <Signal className="w-3 h-3 text-sky-500" />
                          {dev.rssi !== null ? `${dev.rssi} dBm` : '--'}
                        </span>
                      </td>

                      <td className="px-4 py-2.5 font-mono-tabular text-slate-500">
                        {formatRelativeThai(dev.lastSeen, now)}
                      </td>

                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            title={`ลบอุปกรณ์ ${dev.deviceId} ออกจากรายการ`}
                            onClick={() => {
                              const confirmMsg = placement
                                ? `ต้องการลบอุปกรณ์ "${dev.label || dev.deviceId}" หรือไม่?\n\n(อุปกรณ์นี้ผูกอยู่กับ ${placement.ward.shortName} · ${placement.bed.label} - ระบบจะปลดการผูกเตียงด้วย)`
                                : `ต้องการลบอุปกรณ์ "${dev.label || dev.deviceId}" ออกจากระบบหรือไม่?`;
                              if (window.confirm(confirmMsg)) {
                                void onDeleteDevice(dev.deviceId);
                              }
                            }}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add Device Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-teal-600" />
                เพิ่มอุปกรณ์เข้าสู่ระบบ
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateDeviceSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  รหัสประจำตัวอุปกรณ์ (Device ID) *
                </label>
                <input
                  type="text"
                  required
                  value={newDeviceId}
                  onChange={(e) => setNewDeviceId(e.target.value)}
                  placeholder="เช่น baby4 หรือ device-04"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-tabular font-bold focus:border-teal-500 focus:outline-none"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[11px] text-slate-400">รหัสแนะนำ:</span>
                  {['baby1', 'baby2', 'baby3', 'baby4', 'baby5'].map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setNewDeviceId(id)}
                      className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-mono-tabular font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-700 cursor-pointer"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ชื่อเรียกอุปกรณ์ / หมายเลขเตียงประจำ
                </label>
                <input
                  type="text"
                  value={newDeviceLabel}
                  onChange={(e) => setNewDeviceLabel(e.target.value)}
                  placeholder="เช่น เครื่องวัดไข้ เตียง 04"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </div>
              {addDeviceError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700">
                  {addDeviceError}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  บันทึกอุปกรณ์
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
