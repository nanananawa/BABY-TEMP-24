import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Building2,
  Cpu,
  FileSpreadsheet,
  Flame,
  LayoutGrid,
  Menu,
  Plus,
  Settings,
  Table,
  Thermometer,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { AddWardModal } from './components/AddWardModal';
import { AdmitModal } from './components/AdmitModal';
import { AlertsDrawer } from './components/AlertsDrawer';
import { BedDetailModal } from './components/BedDetailModal';
import { Esp32ConsoleView } from './components/Esp32ConsoleView';
import { ExportModal } from './components/ExportModal';
import { SettingsModal } from './components/SettingsModal';
import { WardFloorplan } from './components/WardFloorplan';
import type {
  BedSlot,
  EspDevice,
  ServerWsMessage,
  TemperatureReading,
  Ward,
  WardPresetShape,
  WardSettings,
  WardState,
  WardStructure,
  WardStructureType,
} from './types';
import {
  formatClockThai,
  formatRelativeThai,
  getBedStatus,
  playNotificationSound,
  triggerNotificationVibration,
} from './utils/wardHelpers';
import {
  DEFAULT_FIREBASE_URL,
  DEFAULT_GOOGLE_SHEETS_URL,
  FirebaseSyncManager,
  syncWardStateToFirebase,
} from './utils/firebaseSync';
import {
  loadPersistedWardState,
  savePersistedWardState,
  upsertPatientToDirectory,
} from './utils/defaultState';

type ActiveTab = 'floorplan' | 'devices';

export default function App() {
  const [wardState, setWardState] = useState<WardState>(loadPersistedWardState);
  const [wsConnected, setWsConnected] = useState(false);
  const [firebaseStatus, setFirebaseStatus] = useState<'connected' | 'connecting' | 'error' | 'polling'>('connecting');
  const firebaseManagerRef = useRef<FirebaseSyncManager | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lastPacketTime, setLastPacketTime] = useState<number | null>(null);

  const [activeWardId, setActiveWardId] = useState<string>('ward-1');
  const [activeTab, setActiveTab] = useState<ActiveTab>('floorplan');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isFloorplanCollapsed, setIsFloorplanCollapsed] = useState(false);

  const [selectedBedRef, setSelectedBedRef] = useState<{ wardId: string; bedId: string } | null>(null);
  const [admitModalBed, setAdmitModalBed] = useState<BedSlot | null | undefined>(undefined);
  const [addWardOpen, setAddWardOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const settingsRef = useRef<{
    soundEnabled: boolean;
    soundType: WardSettings['soundType'];
    vibrationEnabled: boolean;
  }>({
    soundEnabled: true,
    soundType: 'beep',
    vibrationEnabled: true,
  });

  const lastWardUpdatedAtRef = useRef<number>(0);

  const handleRemoteWardSync = useCallback(
    (remoteWards: Ward[], remoteSettings?: Partial<WardSettings>, remoteUpdatedAt?: number) => {
      if (remoteUpdatedAt && remoteUpdatedAt < lastWardUpdatedAtRef.current) {
        return;
      }
      if (remoteUpdatedAt) {
        lastWardUpdatedAtRef.current = remoteUpdatedAt;
      }

      setWardState((prev) => {
        if (!prev) return prev;
        if (JSON.stringify(prev.wards) === JSON.stringify(remoteWards)) {
          return prev;
        }
        const next: WardState = {
          ...prev,
          wards: remoteWards,
          settings: remoteSettings ? { ...prev.settings, ...remoteSettings } : prev.settings,
        };
        savePersistedWardState(next);
        return next;
      });
    },
    []
  );

  const persistAndSyncWardState = useCallback(
    (nextState: WardState) => {
      savePersistedWardState(nextState);
      const nowTs = Date.now();
      lastWardUpdatedAtRef.current = nowTs;
      const url = nextState.settings?.firebaseUrl || DEFAULT_FIREBASE_URL;
      const enabled = nextState.settings?.firebaseEnabled ?? true;
      if (enabled) {
        void syncWardStateToFirebase(url, nextState.wards, nextState.settings, nowTs);
      }
    },
    []
  );

  // Auto-seed Firebase if /wardState.json is empty on startup
  useEffect(() => {
    const url = wardState?.settings?.firebaseUrl || DEFAULT_FIREBASE_URL;
    const enabled = wardState?.settings?.firebaseEnabled ?? true;
    if (enabled && wardState) {
      fetch(`${url}/wardState.json`)
        .then((r) => r.json())
        .then((data) => {
          if (!data || !Array.isArray(data.wards) || data.wards.length === 0) {
            void syncWardStateToFirebase(url, wardState.wards, wardState.settings, Date.now());
          }
        })
        .catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (wardState) {
      settingsRef.current = {
        soundEnabled: wardState.settings.soundEnabled,
        soundType: wardState.settings.soundType ?? 'beep',
        vibrationEnabled: wardState.settings.vibrationEnabled ?? true,
      };
    }
  }, [wardState]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = (await res.json()) as WardState;
        setWardState(data);
        savePersistedWardState(data);
        setLastPacketTime(data.serverTime || Date.now());
      }
    } catch {
      // ignore transient startup network error or standalone mode
    }
  }, []);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  // Firebase Realtime Database SSE / Polling Listener
  useEffect(() => {
    const url = wardState?.settings?.firebaseUrl || DEFAULT_FIREBASE_URL;
    const enabled = wardState?.settings?.firebaseEnabled ?? true;

    if (!enabled) {
      if (firebaseManagerRef.current) {
        firebaseManagerRef.current.stop();
        firebaseManagerRef.current = null;
      }
      setFirebaseStatus('error');
      return;
    }

    if (!firebaseManagerRef.current) {
      firebaseManagerRef.current = new FirebaseSyncManager(
        url,
        (telemetry) => {
          setLastPacketTime(telemetry.timestamp);
          setWardState((prev) => {
            if (!prev) return prev;
            const existing = prev.devices[telemetry.deviceId];
            let history: TemperatureReading[] = [];

            if (telemetry.history && telemetry.history.length > 0) {
              history = [...telemetry.history];
            } else {
              history = existing?.history ? [...existing.history] : [];
              const last = history[history.length - 1];
              const isDuplicate =
                last &&
                (last.timestamp === telemetry.timestamp ||
                  (Math.abs(last.timestamp - telemetry.timestamp) < 5000 &&
                    last.temperature === telemetry.temperature));

              if (!isDuplicate) {
                history.push({
                  timestamp: telemetry.timestamp,
                  temperature: telemetry.temperature,
                  battery:
                    telemetry.battery !== null && telemetry.battery !== undefined
                      ? telemetry.battery
                      : existing?.battery ?? 95,
                  rssi: existing?.rssi ?? -50,
                });
              }
            }
            if (history.length > 50) history = history.slice(-50);

            const updatedDevice: EspDevice = {
              deviceId: telemetry.deviceId,
              label: existing?.label || telemetry.name || telemetry.deviceId,
              temperature: telemetry.temperature,
              battery:
                telemetry.battery !== null && telemetry.battery !== undefined
                  ? telemetry.battery
                  : existing?.battery ?? 95,
              rssi: existing?.rssi ?? -50,
              firmware: existing?.firmware || ' อุปกรณ์ ',
              lastSeen: telemetry.timestamp,
              packetCount: (existing?.packetCount ?? 0) + 1,
              history,
              activeWorkingSeconds:
                telemetry.activeWorkingSeconds ?? existing?.activeWorkingSeconds ?? 15,
              deepSleepMinutes:
                telemetry.deepSleepMinutes ?? existing?.deepSleepMinutes ?? 5,
            };

            // Trigger alert if high fever
            if (telemetry.temperature >= prev.settings.feverThreshold) {
              if (settingsRef.current.soundEnabled) {
                playNotificationSound(settingsRef.current.soundType);
              }
              if (settingsRef.current.vibrationEnabled) {
                triggerNotificationVibration('fever');
              }
            }

            const nextState: WardState = {
              ...prev,
              serverTime: telemetry.timestamp,
              devices: {
                ...prev.devices,
                [telemetry.deviceId]: updatedDevice,
              },
            };
            savePersistedWardState(nextState);
            return nextState;
          });
        },
        (status) => {
          setFirebaseStatus(status);
        },
        (remoteWards, remoteSettings, remoteUpdatedAt) => {
          handleRemoteWardSync(remoteWards, remoteSettings, remoteUpdatedAt);
        }
      );
      firebaseManagerRef.current.start();
    } else {
      firebaseManagerRef.current.setUrl(url);
    }
  }, [wardState?.settings?.firebaseUrl, wardState?.settings?.firebaseEnabled]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerWsMessage;
          if (msg.type === 'init' || msg.type === 'state:sync') {
            setWardState(msg.state);
            savePersistedWardState(msg.state);
            setLastPacketTime(msg.state.serverTime || Date.now());
          } else if (msg.type === 'telemetry:update') {
            setLastPacketTime(msg.serverTime);
            setWardState((prev) => {
              if (!prev) return prev;
              const nextAlerts = msg.alert
                ? [msg.alert, ...prev.alerts.filter((a) => a.id !== msg.alert!.id)].slice(0, 80)
                : prev.alerts;
              const nextState: WardState = {
                ...prev,
                serverTime: msg.serverTime,
                devices: {
                  ...prev.devices,
                  [msg.device.deviceId]: msg.device,
                },
                alerts: nextAlerts,
              };
              savePersistedWardState(nextState);
              return nextState;
            });
            if (msg.alert) {
              if (msg.alert.severity === 'fever' && settingsRef.current.soundEnabled) {
                playNotificationSound(settingsRef.current.soundType);
              }
              if (settingsRef.current.vibrationEnabled && msg.alert.severity !== 'offline') {
                triggerNotificationVibration(msg.alert.severity);
              }
            }
          }
        } catch {
          // ignore invalid frames
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const activeWard = useMemo(() => {
    if (!wardState || wardState.wards.length === 0) return null;
    return wardState.wards.find((w) => w.id === activeWardId) ?? wardState.wards[0];
  }, [wardState, activeWardId]);

  const devicesList = useMemo(() => {
    if (!wardState) return [];
    return Object.values(wardState.devices).sort((a, b) =>
      a.deviceId.localeCompare(b.deviceId)
    );
  }, [wardState]);

  const onlineDevicesCount = useMemo(() => {
    if (!wardState) return 0;
    return devicesList.filter((d) => {
      if (d.lastSeen === null) return false;
      const allowedSec = Math.max(
        wardState.settings.offlineTimeoutSec || 600,
        ((d.deepSleepMinutes || 5) * 60) + 120
      );
      return (now - d.lastSeen) / 1000 <= allowedSec;
    }).length;
  }, [devicesList, now, wardState]);

  const unreadAlertCount = useMemo(() => {
    if (!wardState) return 0;
    return wardState.alerts.filter((a) => !a.acknowledged).length;
  }, [wardState]);

  const selectedModalTarget = useMemo(() => {
    if (!wardState || !selectedBedRef) return null;
    const ward = wardState.wards.find((w) => w.id === selectedBedRef.wardId);
    const bed = ward?.beds.find((b) => b.id === selectedBedRef.bedId);
    if (!ward || !bed) return null;
    return { ward, bed };
  }, [wardState, selectedBedRef]);

  // --- Mutation Handlers (Local-First + Background API Sync) ---
  const handleCreateWard = async (payload: {
    name: string;
    shortName: string;
    bedCount: number;
    shape: WardPresetShape;
  }) => {
    const newId = `ward-${Date.now()}`;
    const newWard: Ward = {
      id: newId,
      name: payload.name,
      shortName: payload.shortName,
      layout: {
        gridCols: 5,
        gridRows: 3,
        shape: payload.shape,
        structures: [],
      },
      beds: Array.from({ length: payload.bedCount }, (_, i) => ({
        id: `${newId}-bed-${String(i + 1).padStart(2, '0')}`,
        bedNumber: String(i + 1).padStart(2, '0'),
        label: `เตียง ${String(i + 1).padStart(2, '0')}`,
        row: (i < Math.ceil(payload.bedCount / 2) ? 1 : 2) as 1 | 2,
        order: i,
        gridX: i % 5,
        gridY: Math.floor(i / 5),
        patient: null,
        deviceId: null,
        muted: false,
      })),
    };
    setWardState((prev) => {
      const next: WardState = { ...prev, wards: [...prev.wards, newWard] };
      persistAndSyncWardState(next);
      return next;
    });
    setActiveWardId(newId);

    try {
      const res = await fetch('/api/wards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ward?.id) setActiveWardId(data.ward.id);
      }
    } catch {}
  };

  const handleUpdateWardName = async (wardId: string, name: string, shortName: string) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => (w.id === wardId ? { ...w, name, shortName } : w)),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(`/api/wards/${encodeURIComponent(wardId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, shortName }),
      });
    } catch {}
  };

  const handleApplyPreset = async (wardId: string, shape: WardPresetShape) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => (w.id === wardId ? { ...w, layout: { ...w.layout, shape } } : w)),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(`/api/wards/${encodeURIComponent(wardId)}/layout/preset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shape }),
      });
    } catch {}
  };

  const handleUpdateGridSize = async (wardId: string, gridCols: number, gridRows: number) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => (w.id === wardId ? { ...w, layout: { ...w.layout, gridCols, gridRows } } : w)),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(`/api/wards/${encodeURIComponent(wardId)}/layout/grid`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gridCols, gridRows }),
      });
    } catch {}
  };

  const handleDeleteWard = async (wardId: string) => {
    setWardState((prev) => {
      const remaining = prev.wards.filter((w) => w.id !== wardId);
      const next: WardState = {
        ...prev,
        wards: remaining.length > 0 ? remaining : prev.wards,
      };
      persistAndSyncWardState(next);
      if (remaining.length > 0) setActiveWardId(remaining[0].id);
      return next;
    });
    try {
      await fetch(`/api/wards/${encodeURIComponent(wardId)}`, {
        method: 'DELETE',
      });
    } catch {}
  };

  const handleAddBedAt = async (wardId: string, gridX?: number, gridY?: number) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => {
          if (w.id !== wardId) return w;
          const nextNum = w.beds.length + 1;
          const numStr = String(nextNum).padStart(2, '0');
          const newBed: BedSlot = {
            id: `${wardId}-bed-${numStr}-${Date.now().toString(36)}`,
            bedNumber: numStr,
            label: `เตียง ${numStr}`,
            row: 1,
            order: w.beds.length,
            gridX: gridX ?? (w.beds.length % w.layout.gridCols),
            gridY: gridY ?? Math.floor(w.beds.length / w.layout.gridCols),
            patient: null,
            deviceId: null,
            muted: false,
          };
          return { ...w, beds: [...w.beds, newBed] };
        }),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(`/api/wards/${encodeURIComponent(wardId)}/beds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gridX, gridY }),
      });
    } catch {}
  };

  const handlePlaceBed = async (wardId: string, bedId: string, gridX: number, gridY: number) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => {
          if (w.id !== wardId) return w;
          return {
            ...w,
            beds: w.beds.map((b) => (b.id === bedId ? { ...b, gridX, gridY } : b)),
          };
        }),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(`/api/wards/${encodeURIComponent(wardId)}/beds/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bedId, gridX, gridY }),
      });
    } catch {}
  };

  const handleRenameBed = async (wardId: string, bedId: string, label: string) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => {
          if (w.id !== wardId) return w;
          return {
            ...w,
            beds: w.beds.map((b) => (b.id === bedId ? { ...b, label } : b)),
          };
        }),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(`/api/wards/${encodeURIComponent(wardId)}/beds/${encodeURIComponent(bedId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
    } catch {}
  };

  const handleDeleteBed = async (wardId: string, bedId: string) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => {
          if (w.id !== wardId) return w;
          return {
            ...w,
            beds: w.beds.filter((b) => b.id !== bedId),
          };
        }),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(`/api/wards/${encodeURIComponent(wardId)}/beds/${encodeURIComponent(bedId)}`, {
        method: 'DELETE',
      });
    } catch {}
  };

  const handleAddStructure = async (
    wardId: string,
    type: WardStructureType,
    gridX: number,
    gridY: number
  ) => {
    setWardState((prev) => {
      const structId = `${wardId}-st-${Date.now().toString(36)}`;
      const newStruct: WardStructure = {
        id: structId,
        type,
        label: type === 'station' ? 'เคาน์เตอร์พยาบาล' : type === 'door' ? 'ประตู' : 'โซน',
        gridX,
        gridY,
        colSpan: type === 'station' ? 2 : 1,
        rowSpan: 1,
      };
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) =>
          w.id === wardId ? { ...w, layout: { ...w.layout, structures: [...w.layout.structures, newStruct] } } : w
        ),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(`/api/wards/${encodeURIComponent(wardId)}/structures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, gridX, gridY }),
      });
    } catch {}
  };

  const handleUpdateStructure = async (
    wardId: string,
    structId: string,
    patch: Partial<Pick<WardStructure, 'label' | 'gridX' | 'gridY' | 'colSpan' | 'rowSpan'>>
  ) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => {
          if (w.id !== wardId) return w;
          return {
            ...w,
            layout: {
              ...w.layout,
              structures: w.layout.structures.map((s) => (s.id === structId ? { ...s, ...patch } : s)),
            },
          };
        }),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(`/api/wards/${encodeURIComponent(wardId)}/structures/${encodeURIComponent(structId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch {}
  };

  const handleDeleteStructure = async (wardId: string, structId: string) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => {
          if (w.id !== wardId) return w;
          return {
            ...w,
            layout: {
              ...w.layout,
              structures: w.layout.structures.filter((s) => s.id !== structId),
            },
          };
        }),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(`/api/wards/${encodeURIComponent(wardId)}/structures/${encodeURIComponent(structId)}`, {
        method: 'DELETE',
      });
    } catch {}
  };

  const handleAdmit = async (payload: {
    wardId: string;
    bedId: string;
    name: string;
    hn: string;
    age: string;
    notes: string;
    deviceId: string | null;
    admittedAt: number;
  }) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => {
          if (w.id !== payload.wardId) return w;
          return {
            ...w,
            beds: w.beds.map((b) => {
              if (b.id !== payload.bedId) return b;
              return {
                ...b,
                deviceId: payload.deviceId ?? b.deviceId,
                patient: {
                  name: payload.name,
                  hn: payload.hn,
                  age: payload.age,
                  notes: payload.notes,
                  admittedAt: payload.admittedAt || Date.now(),
                },
              };
            }),
          };
        }),
      };
      persistAndSyncWardState(next);
      void upsertPatientToDirectory(
        {
          hn: payload.hn,
          name: payload.name,
          age: payload.age,
          notes: payload.notes,
        },
        next.settings?.firebaseUrl || DEFAULT_FIREBASE_URL
      );
      return next;
    });

    try {
      await fetch(
        `/api/wards/${encodeURIComponent(payload.wardId)}/beds/${encodeURIComponent(payload.bedId)}/admit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
    } catch {}
  };

  const handleDischarge = async (wardId: string, bedId: string) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => {
          if (w.id !== wardId) return w;
          return {
            ...w,
            beds: w.beds.map((b) => (b.id === bedId ? { ...b, patient: null, deviceId: null } : b)),
          };
        }),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(
        `/api/wards/${encodeURIComponent(wardId)}/beds/${encodeURIComponent(bedId)}/discharge`,
        { method: 'POST' }
      );
    } catch {}
  };

  const handleTransferPatient = async (
    fromWardId: string,
    fromBedId: string,
    toWardId: string,
    toBedId: string,
    moveDevice: boolean = true
  ) => {
    if (fromWardId === toWardId && fromBedId === toBedId) return;

    setWardState((prev) => {
      const fromWard = prev.wards.find((w) => w.id === fromWardId);
      const fromBed = fromWard?.beds.find((b) => b.id === fromBedId);
      if (!fromBed || !fromBed.patient) return prev;

      const toWard = prev.wards.find((w) => w.id === toWardId);
      const toBed = toWard?.beds.find((b) => b.id === toBedId);
      if (!toBed) return prev;

      const sourcePatient = fromBed.patient;
      const sourceDevice = fromBed.deviceId;
      const targetPatient = toBed.patient;
      const targetDevice = toBed.deviceId;

      const nextWards = prev.wards.map((w) => {
        return {
          ...w,
          beds: w.beds.map((b) => {
            if (w.id === fromWardId && b.id === fromBedId) {
              return {
                ...b,
                patient: targetPatient ?? null,
                deviceId: moveDevice ? (targetDevice ?? null) : b.deviceId,
              };
            }
            if (w.id === toWardId && b.id === toBedId) {
              return {
                ...b,
                patient: sourcePatient,
                deviceId: moveDevice ? (sourceDevice ?? b.deviceId) : b.deviceId,
              };
            }
            return b;
          }),
        };
      });

      const nextState: WardState = {
        ...prev,
        wards: nextWards,
      };
      persistAndSyncWardState(nextState);
      return nextState;
    });

    try {
      await fetch(
        `/api/wards/${encodeURIComponent(fromWardId)}/beds/${encodeURIComponent(fromBedId)}/transfer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toWardId, toBedId, moveDevice }),
        }
      );
    } catch {}
  };

  const handlePairDevice = async (wardId: string, bedId: string, deviceId: string | null) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => {
          if (w.id !== wardId) return w;
          return {
            ...w,
            beds: w.beds.map((b) => (b.id === bedId ? { ...b, deviceId } : b)),
          };
        }),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(
        `/api/wards/${encodeURIComponent(wardId)}/beds/${encodeURIComponent(bedId)}/pair`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId }),
        }
      );
    } catch {}
  };

  const handleToggleMute = async (wardId: string, bed: BedSlot) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => {
          if (w.id !== wardId) return w;
          return {
            ...w,
            beds: w.beds.map((b) => (b.id === bed.id ? { ...b, muted: !bed.muted } : b)),
          };
        }),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(
        `/api/wards/${encodeURIComponent(wardId)}/beds/${encodeURIComponent(bed.id)}/mute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ muted: !bed.muted }),
        }
      );
    } catch {}
  };

  const handleClearTemp = async (wardId: string, bedId: string) => {
    setWardState((prev) => {
      const ward = prev.wards.find((w) => w.id === wardId);
      const bed = ward?.beds.find((b) => b.id === bedId);
      if (!bed?.deviceId) return prev;
      const deviceId = bed.deviceId;
      const device = prev.devices[deviceId];
      if (!device) return prev;
      const next: WardState = {
        ...prev,
        devices: {
          ...prev.devices,
          [deviceId]: { ...device, temperature: null },
        },
      };
      savePersistedWardState(next);
      return next;
    });
    try {
      await fetch(
        `/api/wards/${encodeURIComponent(wardId)}/beds/${encodeURIComponent(bedId)}/clear-temp`,
        { method: 'POST' }
      );
    } catch {}
  };

  const handleUpdateAdmitDate = async (wardId: string, bedId: string, admittedAt: number) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => {
          if (w.id !== wardId) return w;
          return {
            ...w,
            beds: w.beds.map((b) => {
              if (b.id !== bedId || !b.patient) return b;
              return {
                ...b,
                patient: {
                  ...b.patient,
                  admittedAt,
                },
              };
            }),
          };
        }),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(
        `/api/wards/${encodeURIComponent(wardId)}/beds/${encodeURIComponent(bedId)}/patient`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admittedAt }),
        }
      );
    } catch {}
  };

  const handleUpdatePatient = async (
    wardId: string,
    bedId: string,
    data: { name?: string; hn?: string; age?: string; notes?: string; admittedAt?: number }
  ) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        wards: prev.wards.map((w) => {
          if (w.id !== wardId) return w;
          return {
            ...w,
            beds: w.beds.map((b) => {
              if (b.id !== bedId || !b.patient) return b;
              return {
                ...b,
                patient: {
                  ...b.patient,
                  ...data,
                },
              };
            }),
          };
        }),
      };
      persistAndSyncWardState(next);
      return next;
    });
    try {
      await fetch(
        `/api/wards/${encodeURIComponent(wardId)}/beds/${encodeURIComponent(bedId)}/patient`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );
    } catch {}
  };

  const handleSaveSettings = async (next: WardSettings) => {
    setWardState((prev) => {
      const updated: WardState = { ...prev, settings: next };
      persistAndSyncWardState(updated);
      return updated;
    });
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
    } catch {}
  };

  const handleAckAlert = async (alertId: string) => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        alerts: prev.alerts.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)),
      };
      savePersistedWardState(next);
      return next;
    });
    try {
      await fetch(`/api/alerts/${encodeURIComponent(alertId)}/ack`, {
        method: 'POST',
      });
    } catch {}
  };

  const handleAckAllAlerts = async () => {
    setWardState((prev) => {
      const next: WardState = {
        ...prev,
        alerts: prev.alerts.map((a) => ({ ...a, acknowledged: true })),
      };
      savePersistedWardState(next);
      return next;
    });
    try {
      await fetch('/api/alerts/ack-all', { method: 'POST' });
    } catch {}
  };

  const handleAddDevice = async (deviceId: string, label?: string) => {
    const cleanId = deviceId.trim();
    if (!cleanId) return;
    const cleanLabel = (label || cleanId).trim();

    setWardState((prev) => {
      if (!prev) return prev;
      const existing = prev.devices[cleanId];
      const newDev: EspDevice = existing
        ? { ...existing, label: cleanLabel }
        : {
            deviceId: cleanId,
            label: cleanLabel,
            firmware: ' อุปกรณ์ ',
            temperature: null,
            battery: 100,
            rssi: -50,
            lastSeen: null,
            packetCount: 0,
            history: [],
            activeWorkingSeconds: 15,
            deepSleepMinutes: 5,
          };
      const next: WardState = {
        ...prev,
        devices: {
          ...prev.devices,
          [cleanId]: newDev,
        },
      };
      savePersistedWardState(next);
      return next;
    });

    try {
      const url = wardState?.settings?.firebaseUrl || DEFAULT_FIREBASE_URL;
      await fetch(`${url}/babies/${encodeURIComponent(cleanId)}/name.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanLabel),
      });
    } catch {}
  };

  const handleUpdateDeviceName = async (deviceId: string, label: string) => {
    const cleanLabel = label.trim();
    if (!cleanLabel) return;
    setWardState((prev) => {
      if (!prev || !prev.devices[deviceId]) return prev;
      const next: WardState = {
        ...prev,
        devices: {
          ...prev.devices,
          [deviceId]: {
            ...prev.devices[deviceId],
            label: cleanLabel,
          },
        },
      };
      savePersistedWardState(next);
      return next;
    });

    try {
      const url = wardState?.settings?.firebaseUrl || DEFAULT_FIREBASE_URL;
      await fetch(`${url}/babies/${encodeURIComponent(deviceId)}/name.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanLabel),
      });
    } catch {}
  };

  const handleDeleteDevice = async (deviceId: string) => {
    setWardState((prev) => {
      if (!prev) return prev;
      const nextDevices = { ...prev.devices };
      delete nextDevices[deviceId];

      // Also unpair from any beds using this device
      const nextWards = prev.wards.map((w) => ({
        ...w,
        beds: w.beds.map((b) => (b.deviceId === deviceId ? { ...b, deviceId: null } : b)),
      }));

      const next: WardState = {
        ...prev,
        wards: nextWards,
        devices: nextDevices,
      };
      persistAndSyncWardState(next);
      return next;
    });

    try {
      const url = wardState?.settings?.firebaseUrl || DEFAULT_FIREBASE_URL;
      await fetch(`${url}/babies/${encodeURIComponent(deviceId)}.json`, {
        method: 'DELETE',
      });
    } catch {}

    try {
      await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, {
        method: 'DELETE',
      });
    } catch {}
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7F9]">
      {/* Top Hospital Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-[1220px] px-4 md:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="เปิดเมนูหลัก"
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs shrink-0">
                <Thermometer className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-base font-extrabold tracking-tight text-slate-900 leading-tight truncate">
                  Baby Temp 24
                </h1>
                <p className="text-[10.5px] text-slate-500 truncate">
                  Smart Fever Monitor (Hospital)
                </p>
              </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveTab('floorplan')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'floorplan'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-teal-600" />
              แผนผังวอร์ด ({wardState?.wards.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('devices')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'devices'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-teal-600" />
              อุปกรณ์ ({devicesList.length})
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {/* Google Sheets Shortcut */}
            <button
              type="button"
              onClick={() => {
                const url = wardState?.settings.googleSheetsUrl || DEFAULT_GOOGLE_SHEETS_URL;
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
              aria-label="เปิด Google Sheets"
              title="เปิด Google Sheets รายงานสด"
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
            >
              <Table className="w-4 h-4" />
            </button>

            {/* Export Excel / CSV */}
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              aria-label="ส่งออกรายงาน Excel หรือ CSV"
              title="ส่งออกรายงาน Excel (.xls) หรือ CSV"
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setAlertsOpen(true)}
              aria-label="ดูรายการแจ้งเตือน"
              className="relative inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-amber-500 hover:bg-amber-50 transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-rose-600 text-[10px] font-bold font-mono-tabular text-white">
                  {unreadAlertCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="ตั้งค่าระบบ"
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Slide-out Navigation Drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex bg-slate-900/40 backdrop-blur-[2px]">
          <div className="w-72 bg-white h-full shadow-2xl border-r border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="font-display text-base font-bold text-slate-900">เมนูหลักระบบ</div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('floorplan');
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                    activeTab === 'floorplan'
                      ? 'bg-teal-50 text-teal-800'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  แผนผังเตียงผู้ป่วย (Top View)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('devices');
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                    activeTab === 'devices'
                      ? 'bg-teal-50 text-teal-800'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Cpu className="w-4 h-4" />
                  ดูคอนโซล & ประวัติ
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAddWardOpen(true);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Building2 className="w-4 h-4" />
                  เพิ่มวอร์ดผู้ป่วยใหม่
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAlertsOpen(true);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Bell className="w-4 h-4" />
                    แจ้งเตือนอุณหภูมิ
                  </span>
                  {unreadAlertCount > 0 && (
                    <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-mono-tabular font-bold text-rose-700">
                      {unreadAlertCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(true);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  ส่งออกรายงาน Excel & CSV
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const url = wardState?.settings.googleSheetsUrl || DEFAULT_GOOGLE_SHEETS_URL;
                    window.open(url, '_blank', 'noopener,noreferrer');
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Table className="w-4 h-4 text-teal-600" />
                  เปิด Google Sheets
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(true);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                  ตั้งค่าระบบ / Firebase / เกณฑ์ไข้
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-[1220px] flex-1 px-4 md:px-6 py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-xs text-[11.5px]">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 font-semibold ${
                wsConnected || firebaseStatus === 'connected' || firebaseStatus === 'polling'
                  ? 'text-emerald-700'
                  : 'text-amber-700'
              }`}
            >
              {wsConnected || firebaseStatus === 'connected' || firebaseStatus === 'polling' ? (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              )}
              {wsConnected
                ? 'ระบบเรียลไทม์ออนไลน์ (Node.js)'
                : firebaseStatus === 'connected' || firebaseStatus === 'polling'
                ? 'เชื่อมต่อ Firebase อัตโนมัติแล้ว (ซิงค์สด)'
                : 'กำลังเชื่อมต่อ Firebase อัตโนมัติ...'}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="text-slate-600 font-medium">
              อุปกรณ์ออนไลน์ {onlineDevicesCount}/{devicesList.length} ตัว
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'floorplan' ? 'devices' : 'floorplan')}
              className="text-[11.5px] font-semibold text-teal-700 hover:text-teal-800 underline underline-offset-2 cursor-pointer"
            >
              {activeTab === 'floorplan'
                ? 'ดูข้อมูลและสถานะอุปกรณ์'
                : 'กลับไปแผนผังวอร์ด'}
            </button>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="font-mono-tabular text-slate-500">
              อัปเดต: {formatRelativeThai(lastPacketTime, now)}
              {lastPacketTime ? ` (${formatClockThai(lastPacketTime)})` : ''}
            </span>
          </div>
        </div>

        {/* Multi-Ward Selector Tabs */}
        {wardState && activeTab === 'floorplan' && (
          <div className="flex flex-wrap items-center gap-2">
            {wardState.wards.map((ward) => {
              const occupied = ward.beds.filter((b) => b.patient !== null);
              const hasFever = occupied.some((b) => {
                const dev = b.deviceId ? wardState.devices[b.deviceId] : undefined;
                return getBedStatus(b, dev, wardState.settings, now) === 'fever';
              });
              const isSelected = activeWard?.id === ward.id;
              return (
                <button
                  key={ward.id}
                  type="button"
                  onClick={() => setActiveWardId(ward.id)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'border-teal-600 bg-teal-600 text-white shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{ward.shortName || ward.name}</span>
                  <span
                    className={`font-mono-tabular text-[11px] rounded px-1.5 py-0.2 ${
                      isSelected ? 'bg-teal-700/70 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {occupied.length}/{ward.beds.length}
                  </span>
                  {hasFever && (
                    <span
                      className={`text-[10px] font-bold rounded px-1.5 py-0.2 ${
                        isSelected ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      มีไข้
                    </span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setAddWardOpen(true)}
              className="inline-flex items-center gap-1 rounded-xl border border-dashed border-teal-400 bg-teal-50/50 hover:bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              เพิ่มวอร์ด
            </button>
          </div>
        )}

        {/* Loading or Active View */}
        {!wardState || !activeWard ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            กำลังโหลดข้อมูลแผนผังวอร์ด...
          </div>
        ) : activeTab === 'floorplan' ? (
          <WardFloorplan
            ward={activeWard}
            allWards={wardState.wards}
            totalWardsCount={wardState.wards.length}
            devices={wardState.devices}
            settings={wardState.settings}
            now={now}
            isCollapsed={isFloorplanCollapsed}
            onToggleCollapse={() => setIsFloorplanCollapsed((v) => !v)}
            onSelectBed={(bed) => setSelectedBedRef({ wardId: activeWard.id, bedId: bed.id })}
            onAdmitBed={(bed) => setAdmitModalBed(bed)}
            onToggleMute={(bed) => void handleToggleMute(activeWard.id, bed)}
            onOpenHnLookup={() => setAdmitModalBed(null)}
            onUpdateWardName={handleUpdateWardName}
            onDeleteWard={handleDeleteWard}
            onApplyPreset={handleApplyPreset}
            onUpdateGridSize={handleUpdateGridSize}
            onAddBedAt={handleAddBedAt}
            onPlaceBed={handlePlaceBed}
            onRenameBed={handleRenameBed}
            onDeleteBed={handleDeleteBed}
            onAddStructure={handleAddStructure}
            onUpdateStructure={handleUpdateStructure}
            onDeleteStructure={handleDeleteStructure}
            onTransferPatient={handleTransferPatient}
          />
        ) : (
          <Esp32ConsoleView
            wards={wardState.wards}
            devices={devicesList}
            settings={wardState.settings}
            now={now}
            onPairDevice={handlePairDevice}
            onDeleteDevice={handleDeleteDevice}
            onAddDevice={handleAddDevice}
            onUpdateDeviceName={handleUpdateDeviceName}
          />
        )}
      </main>

      {/* Modals & Drawers */}
      {wardState && selectedModalTarget && (
        <BedDetailModal
          ward={selectedModalTarget.ward}
          allWards={wardState.wards}
          bed={selectedModalTarget.bed}
          device={
            selectedModalTarget.bed.deviceId
              ? wardState.devices[selectedModalTarget.bed.deviceId]
              : undefined
          }
          allDevices={devicesList}
          settings={wardState.settings}
          now={now}
          onClose={() => setSelectedBedRef(null)}
          onPairDevice={handlePairDevice}
          onToggleMute={handleToggleMute}
          onClearTemp={handleClearTemp}
          onUpdateAdmitDate={handleUpdateAdmitDate}
          onDischarge={handleDischarge}
          onUpdatePatient={handleUpdatePatient}
          onTransferPatient={handleTransferPatient}
        />
      )}

      {wardState && activeWard && admitModalBed !== undefined && (
        <AdmitModal
          ward={activeWard}
          allWards={wardState.wards}
          initialBed={admitModalBed}
          devices={devicesList}
          onClose={() => setAdmitModalBed(undefined)}
          onAdmit={handleAdmit}
        />
      )}

      {addWardOpen && (
        <AddWardModal
          onClose={() => setAddWardOpen(false)}
          onCreateWard={handleCreateWard}
        />
      )}

      {wardState && alertsOpen && (
        <AlertsDrawer
          alerts={wardState.alerts}
          now={now}
          onClose={() => setAlertsOpen(false)}
          onAcknowledge={handleAckAlert}
          onAcknowledgeAll={handleAckAllAlerts}
        />
      )}

      {wardState && settingsOpen && (
        <SettingsModal
          settings={wardState.settings}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      )}

      {wardState && exportOpen && (
        <ExportModal
          wards={wardState.wards}
          devices={wardState.devices}
          settings={wardState.settings}
          activeWardId={activeWardId}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
