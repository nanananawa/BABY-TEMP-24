import React from 'react';
import { Bell, CheckCheck, Flame, Thermometer, X } from 'lucide-react';
import type { WardAlert } from '../types';
import { formatClockThai, formatRelativeThai } from '../utils/wardHelpers';

interface AlertsDrawerProps {
  alerts: WardAlert[];
  now: number;
  onClose: () => void;
  onAcknowledge: (alertId: string) => Promise<void>;
  onAcknowledgeAll: () => Promise<void>;
}

export const AlertsDrawer: React.FC<AlertsDrawerProps> = ({
  alerts,
  now,
  onClose,
  onAcknowledge,
  onAcknowledgeAll,
}) => {
  const unreadCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-50 text-amber-600">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                แจ้งเตือนอุณหภูมิ ({unreadCount} ใหม่)
              </h2>
              <p className="text-xs text-slate-500">
                บันทึกเหตุการณ์ไข้สูงและเฝ้าระวังจากทุกวอร์ด
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดแถบแจ้งเตือน"
            className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {unreadCount > 0 && (
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={onAcknowledgeAll}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              รับทราบทั้งหมด
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {alerts.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              ยังไม่มีการแจ้งเตือนในขณะนี้
            </div>
          ) : (
            alerts.map((alert) => {
              const isFever = alert.severity === 'fever';
              return (
                <div
                  key={alert.id}
                  className={`rounded-2xl border p-3.5 transition-colors ${
                    alert.acknowledged
                      ? 'border-slate-200 bg-slate-50/70 opacity-75'
                      : isFever
                        ? 'border-rose-200 bg-rose-50/70'
                        : 'border-amber-200 bg-amber-50/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${
                          isFever ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                        }`}
                      >
                        {isFever ? <Flame className="w-4 h-4" /> : <Thermometer className="w-4 h-4" />}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {alert.wardName ? `${alert.wardName} · ` : ''}{alert.bedLabel} · {alert.patientName}
                        </div>
                        <div className="text-[11px] font-mono-tabular text-slate-500">
                          {alert.deviceId} · {formatClockThai(alert.timestamp)} ({formatRelativeThai(alert.timestamp, now)})
                        </div>
                      </div>
                    </div>

                    <span
                      className={`font-mono-tabular text-sm font-bold ${
                        isFever ? 'text-rose-600' : 'text-amber-600'
                      }`}
                    >
                      {alert.temperature.toFixed(1)}°C
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate-700">{alert.message}</p>

                  {!alert.acknowledged && (
                    <div className="mt-2.5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onAcknowledge(alert.id)}
                        className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 cursor-pointer"
                      >
                        รับทราบเหตุการณ์
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
