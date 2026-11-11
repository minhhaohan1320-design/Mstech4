// ==============================================================
// TỆP 4: src/hooks/useStation.ts
// Đồng bộ hóa lệnh đọc cảm biến, đổi Wi-Fi, kiểm tra trạng thái Online và lưu lịch sử
// ==============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { ref, onValue, update, push, set } from 'firebase/database';
import { db } from '../lib/firebase';
import { SensorData, StationStatus, HistoryRecord, StationCommand } from '../types';
import { parseStationId, normalizeSensorData } from '../utils/stationLogic';

const DEMO_DATA: SensorData = {
  n: 15,
  p: 20,
  k: 35,
  moisture: 42.5,
  soilTemp: 27.8,
  waterTemp: 25.4,
  ph: 6.8,
  timestamp: Date.now(),
  npk_data: { n: [15], p: [20], k: [35] },
  do_am_dat: [42.5],
  nhiet_do_dat: [27.8],
  ph_data: [6.8],
  temp_nuoc: 25.4,
};

function createDemoHistory(): HistoryRecord[] {
  const now = Date.now();
  const samples = [
    { offsetMin: -180, n: 14, p: 18, k: 32, moisture: 40.2, soilTemp: 26.5, waterTemp: 24.8, ph: 6.6 },
    { offsetMin: -120, n: 15, p: 19, k: 34, moisture: 41.8, soilTemp: 27.1, waterTemp: 25.0, ph: 6.7 },
    { offsetMin: -60, n: 16, p: 21, k: 36, moisture: 43.0, soilTemp: 27.5, waterTemp: 25.2, ph: 6.8 },
    { offsetMin: 0, n: 15, p: 20, k: 35, moisture: 42.5, soilTemp: 27.8, waterTemp: 25.4, ph: 6.8 },
  ];

  return samples.map((s, idx) => {
    const ts = now + s.offsetMin * 60 * 1000;
    const d = new Date(ts);
    const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate()}/${d.getMonth() + 1}`;
    const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      ...normalizeSensorData(s, ts),
      id: `demo-${idx + 1}`,
      zone: 'Khu vực 1',
      cropName: 'Vải thiều',
      dateStr,
      timeStr,
    };
  });
}

export function useStation(deviceId: string | null, isDemo: boolean = false) {
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [status, setStatus] = useState<StationStatus>({ online: false, lastSeen: 0 });
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isCommanding, setIsCommanding] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const commandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isDemo) {
      setSensorData(DEMO_DATA);
      setStatus({ online: true, lastSeen: Date.now() });
      setIsConnected(true);
      setHistory(createDemoHistory());
      setError(null);
      return;
    }

    const cleanId = deviceId ? parseStationId(deviceId) : '';
    if (!cleanId) {
      setSensorData(null);
      setIsConnected(false);
      return;
    }

    const dataRef = ref(db, `/Stations/${cleanId}/Data`);
    const cmdRef = ref(db, `/Stations/${cleanId}/Command`);
    const statusRef = ref(db, `/Stations/${cleanId}/Status`);
    const historyRef = ref(db, `/Stations/${cleanId}/History`);

    // 1. Lắng nghe dữ liệu cảm biến từ ESP32-S3
    const unsubData = onValue(
      dataRef,
      (snapshot) => {
        setIsConnected(true);
        if (snapshot.exists()) {
          const raw = snapshot.val();
          const normalized = normalizeSensorData(raw, Date.now());
          setSensorData(normalized);
          setError(null);
        }
      },
      (err) => {
        console.error('Lỗi đọc Firebase Data:', err);
        setIsConnected(false);
        setError(err.message);
      }
    );

    // 2. Lắng nghe trạng thái cờ lệnh read_soil
    const unsubCmd = onValue(cmdRef, (snapshot) => {
      if (snapshot.exists()) {
        const cmd = snapshot.val();
        const isReading = Boolean(cmd.read_soil);
        setIsCommanding(isReading);

        if (!isReading && commandTimeoutRef.current) {
          clearTimeout(commandTimeoutRef.current);
          commandTimeoutRef.current = null;
        }
      } else {
        setIsCommanding(false);
      }
    });

    // 3. Lắng nghe trạng thái Online / Heartbeat
    const unsubStatus = onValue(statusRef, (snapshot) => {
      if (snapshot.exists()) {
        const st = snapshot.val();
        const lastSeen = typeof st.lastSeen === 'number' ? st.lastSeen : Date.now();
        const isRecent = Date.now() - lastSeen < 120000;
        setStatus({
          online: Boolean(st.online) && isRecent,
          lastSeen,
          rssi: st.rssi,
        });
      }
    });

    // 4. Lắng nghe lịch sử đo
    const unsubHistory = onValue(historyRef, (snapshot) => {
      if (snapshot.exists()) {
        const rawHist = snapshot.val();
        const list: HistoryRecord[] = Object.keys(rawHist).map((key) => {
          const item = rawHist[key];
          const time = new Date(item.timestamp || Date.now());
          const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')} ${time.getDate()}/${time.getMonth() + 1}`;
          return {
            id: key,
            ...item,
            timeStr,
          };
        });
        list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setHistory(list);
      } else {
        setHistory([]);
      }
    });

    return () => {
      unsubData();
      unsubCmd();
      unsubStatus();
      unsubHistory();
      if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
    };
  }, [deviceId, isDemo]);

  // Gửi lệnh đo cảm biến xuống ESP32-S3 (hoặc mô phỏng trong bản Demo)
  const triggerRead = useCallback(async () => {
    if (isDemo) {
      setIsCommanding(true);
      setTimeout(() => {
        const now = Date.now();
        const updated: SensorData = normalizeSensorData(
          {
            n: Math.round(14 + Math.random() * 6),
            p: Math.round(18 + Math.random() * 6),
            k: Math.round(32 + Math.random() * 8),
            moisture: Number((40 + Math.random() * 6).toFixed(1)),
            soilTemp: Number((26.5 + Math.random() * 2.5).toFixed(1)),
            waterTemp: Number((24.5 + Math.random() * 2).toFixed(1)),
            ph: Number((6.4 + Math.random() * 0.6).toFixed(1)),
            timestamp: now,
          },
          now
        );
        setSensorData(updated);
        const d = new Date(now);
        const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate()}/${d.getMonth() + 1}`;
        const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        setHistory((prev) => [
          ...prev,
          {
            ...updated,
            id: `demo-${now}`,
            zone: 'Khu vực 1',
            cropName: 'Vải thiều',
            dateStr,
            timeStr,
          },
        ]);
        setIsCommanding(false);
      }, 900);
      return;
    }

    const cleanId = deviceId ? parseStationId(deviceId) : '';
    if (!cleanId) return;
    setIsCommanding(true);

    try {
      const cmdRef = ref(db, `/Stations/${cleanId}/Command`);
      await update(cmdRef, { read_soil: true });

      if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = setTimeout(async () => {
        setIsCommanding(false);
        await update(cmdRef, { read_soil: false }).catch(() => {});
      }, 15000);
    } catch (err: any) {
      console.error('Lỗi gửi lệnh đo:', err);
      setIsCommanding(false);
      setError(err.message);
    }
  }, [deviceId, isDemo]);

  // Gửi lệnh đổi Wi-Fi khớp với esp32_mstech_station.ino
  const updateWifi = useCallback(
    async (ssid: string, pass: string) => {
      if (isDemo) {
        return true;
      }
      const cleanId = deviceId ? parseStationId(deviceId) : '';
      if (!cleanId || !ssid.trim()) return false;
      try {
        const cmdRef = ref(db, `/Stations/${cleanId}/Command`);
        await update(cmdRef, {
          wifi_ssid: ssid.trim(),
          wifi_pass: pass,
          update_wifi: true,
        });
        return true;
      } catch (err: any) {
        console.error('Lỗi cập nhật Wi-Fi:', err);
        setError(err.message);
        return false;
      }
    },
    [deviceId, isDemo]
  );

  // Lưu bản ghi hiện tại vào History
  const saveToHistory = useCallback(
    async (zone?: string, cropName?: string) => {
      if (!sensorData) return false;
      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} ${now.getDate()}/${now.getMonth() + 1}`;

      if (isDemo) {
        setHistory((prev) => [
          ...prev,
          {
            ...sensorData,
            id: `demo-${Date.now()}`,
            timestamp: Date.now(),
            zone: zone || 'Khu vực 1',
            cropName: cropName || 'Vải thiều',
            dateStr,
            timeStr,
          },
        ]);
        return true;
      }

      const cleanId = deviceId ? parseStationId(deviceId) : '';
      if (!cleanId) return false;
      try {
        const historyRef = ref(db, `/Stations/${cleanId}/History`);
        const newRecordRef = push(historyRef);
        await set(newRecordRef, {
          n: sensorData.n,
          p: sensorData.p,
          k: sensorData.k,
          moisture: sensorData.moisture,
          soilTemp: sensorData.soilTemp,
          waterTemp: sensorData.waterTemp,
          ph: sensorData.ph,
          timestamp: sensorData.timestamp || Date.now(),
          zone: zone || 'Khu vực 1',
          cropName: cropName || 'Cây trồng',
          dateStr,
        });
        return true;
      } catch (err: any) {
        console.error('Lỗi lưu lịch sử:', err);
        setError(err.message);
        return false;
      }
    },
    [deviceId, sensorData, isDemo]
  );

  // Các trường tương thích ngược với App.tsx và Dashboard.tsx
  const isOnline = status.online;
  const commandState: StationCommand = {
    read_soil: isCommanding,
    update_wifi: false,
  };
  const lastUpdated = sensorData?.timestamp
    ? new Date(sensorData.timestamp).toLocaleTimeString('vi-VN')
    : null;
  const historyData = history;
  const sendMeasureCommand = triggerRead;

  return {
    sensorData,
    status,
    history,
    isConnected,
    isCommanding,
    error,
    triggerRead,
    updateWifi,
    saveToHistory,

    // Tương thích ngược:
    isOnline,
    commandState,
    lastUpdated,
    historyData,
    sendMeasureCommand,
  };
}
