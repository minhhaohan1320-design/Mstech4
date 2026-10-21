// ==============================================================
// TỆP 4: src/hooks/useStation.ts
// Đồng bộ hóa lệnh đọc cảm biến, đổi Wi-Fi, kiểm tra trạng thái Online và lưu lịch sử
// ==============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { ref, onValue, update, push, set } from 'firebase/database';
import { db } from '../lib/firebase';
import { SensorData, StationStatus, HistoryRecord, StationCommand } from '../types';

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
      const time = new Date();
      setHistory([{
        ...DEMO_DATA,
        timeStr: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')} ${time.getDate()}/${time.getMonth() + 1}`
      }]);
      return;
    }

    if (!deviceId) {
      setSensorData(null);
      setIsConnected(false);
      return;
    }

    const cleanId = deviceId.trim();
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
          const n = Number(raw.n ?? 0);
          const p = Number(raw.p ?? 0);
          const k = Number(raw.k ?? 0);
          const moisture = Number(raw.moisture ?? 0);
          const soilTemp = Number(raw.soilTemp ?? 0);
          const waterTemp = Number(raw.waterTemp ?? 0);
          const ph = Number(raw.ph ?? 0);
          const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : Date.now();

          const normalized: SensorData = {
            n,
            p,
            k,
            moisture,
            soilTemp,
            waterTemp,
            ph,
            timestamp,
            npk_data: { n: [n], p: [p], k: [k] },
            do_am_dat: [moisture],
            nhiet_do_dat: [soilTemp],
            ph_data: [ph],
            temp_nuoc: waterTemp,
          };

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

  // Gửi lệnh đo cảm biến 3 lần xuống ESP32-S3
  const triggerRead = useCallback(async () => {
    if (isDemo) {
      setIsCommanding(true);
      setTimeout(() => {
        setSensorData({
          ...DEMO_DATA,
          moisture: Number((40 + Math.random() * 5).toFixed(1)),
          soilTemp: Number((27 + Math.random() * 2).toFixed(1)),
          timestamp: Date.now(),
        });
        setIsCommanding(false);
      }, 1500);
      return;
    }

    if (!deviceId) return;
    setIsCommanding(true);

    try {
      const cmdRef = ref(db, `/Stations/${deviceId.trim()}/Command`);
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
      if (!deviceId || !ssid.trim()) return false;
      try {
        const cmdRef = ref(db, `/Stations/${deviceId.trim()}/Command`);
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
    [deviceId]
  );

  // Lưu bản ghi hiện tại vào History
  const saveToHistory = useCallback(
    async (zone?: string, cropName?: string) => {
      if (!deviceId || !sensorData || isDemo) return false;
      try {
        const historyRef = ref(db, `/Stations/${deviceId.trim()}/History`);
        const newRecordRef = push(historyRef);
        const now = new Date();
        const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await set(newRecordRef, {
          n: sensorData.n,
          p: sensorData.p,
          k: sensorData.k,
          moisture: sensorData.moisture,
          soilTemp: sensorData.soilTemp,
          waterTemp: sensorData.waterTemp,
          ph: sensorData.ph,
          timestamp: sensorData.timestamp || Date.now(),
          zone: zone || 'Khu A',
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
