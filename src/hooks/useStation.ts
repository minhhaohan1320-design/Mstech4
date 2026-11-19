// ==============================================================
// TỆP 4: src/hooks/useStation.ts
// Đồng bộ hóa lệnh đọc cảm biến, đổi Wi-Fi, hiệu chuẩn cảm biến, Heartbeat Online/RSSI và lịch sử
// ==============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { ref, onValue, update, push, set, query, limitToLast, remove } from 'firebase/database';
import { db } from '../lib/firebase';
import {
  SensorData,
  StationStatus,
  HistoryRecord,
  StationCommand,
  CalibrationConfig,
} from '../types';
import {
  parseStationId,
  normalizeSensorData,
  isStationOnline,
  DEFAULT_CALIBRATION,
  sanitizeCalibration,
  applyCalibrationToSensorData,
} from '../utils/stationLogic';

const DEMO_RAW_DATA: SensorData = {
  n: 15,
  p: 20,
  k: 35,
  moisture: 42.5,
  soilTemp: 27.8,
  timestamp: Date.now(),
  npk_data: { n: [15], p: [20], k: [35] },
  do_am_dat: [42.5],
  nhiet_do_dat: [27.8],
};

function formatDateAndTime(ts: number): { dateStr: string; timeStr: string } {
  const d = new Date(ts);
  const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate()}/${d.getMonth() + 1}`;
  return { dateStr, timeStr };
}

function createDemoHistory(): HistoryRecord[] {
  const now = Date.now();
  const samples = [
    { offsetMin: -4320, n: 18, p: 17, k: 31, moisture: 38.4, soilTemp: 26.2 },
    { offsetMin: -180, n: 14, p: 18, k: 32, moisture: 40.2, soilTemp: 26.5 },
    { offsetMin: -120, n: 15, p: 19, k: 34, moisture: 41.8, soilTemp: 27.1 },
    { offsetMin: -60, n: 16, p: 21, k: 36, moisture: 43.0, soilTemp: 27.5 },
    { offsetMin: 0, n: 15, p: 20, k: 35, moisture: 42.5, soilTemp: 27.8 },
  ];

  return samples.map((s, idx) => {
    const ts = now + s.offsetMin * 60 * 1000;
    const { dateStr, timeStr } = formatDateAndTime(ts);
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
  const [calibration, setCalibration] = useState<CalibrationConfig>(DEFAULT_CALIBRATION);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isCommanding, setIsCommanding] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const commandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasExplicitStatusRef = useRef<boolean>(false);
  const calibrationRef = useRef<CalibrationConfig>(DEFAULT_CALIBRATION);
  const rawDemoRef = useRef<SensorData>(DEMO_RAW_DATA);

  useEffect(() => {
    calibrationRef.current = calibration;
  }, [calibration]);

  useEffect(() => {
    if (isDemo) {
      const now = Date.now();
      rawDemoRef.current = { ...DEMO_RAW_DATA, timestamp: now };
      setSensorData(applyCalibrationToSensorData(rawDemoRef.current, calibrationRef.current));
      setStatus({
        online: true,
        lastSeen: now,
        rssi: -58,
        firmwareVersion: 'v2.2',
        sdOk: true,
        lastError: 'NONE',
        uptimeSec: 18420,
        freeHeap: 218400,
        pendingSyncCount: 0,
      });
      setIsConnected(true);
      setHistory(createDemoHistory());
      setError(null);
      return;
    }

    const cleanId = deviceId ? parseStationId(deviceId) : '';
    if (!cleanId) {
      setSensorData(null);
      setIsConnected(false);
      setStatus({ online: false, lastSeen: 0 });
      setCalibration(DEFAULT_CALIBRATION);
      return;
    }

    hasExplicitStatusRef.current = false;

    const dataRef = ref(db, `/Stations/${cleanId}/Data`);
    const cmdRef = ref(db, `/Stations/${cleanId}/Command`);
    const statusRef = ref(db, `/Stations/${cleanId}/Status`);
    const calibRef = ref(db, `/Stations/${cleanId}/Calibration`);
    // Giới hạn tối đa 200 bản ghi gần nhất để chống lag & tiết kiệm băng thông Firebase RTDB
    const historyQuery = query(ref(db, `/Stations/${cleanId}/History`), limitToLast(200));

    // 1. Lắng nghe dữ liệu cảm biến từ ESP32-S3 (/Stations/<ID>/Data)
    const unsubData = onValue(
      dataRef,
      (snapshot) => {
        setIsConnected(true);
        if (snapshot.exists()) {
          const raw = snapshot.val();
          const now = Date.now();
          const normalized = normalizeSensorData(raw, now);
          setSensorData(normalized);
          setError(null);

          if (graceTimeoutRef.current) {
            clearTimeout(graceTimeoutRef.current);
            graceTimeoutRef.current = null;
          }
          if (commandTimeoutRef.current) {
            clearTimeout(commandTimeoutRef.current);
            commandTimeoutRef.current = null;
          }
          setIsCommanding(false);

          if (!hasExplicitStatusRef.current) {
            const seenTs = normalized.timestamp || now;
            setStatus((prev) => ({
              ...prev,
              online: isStationOnline(seenTs, now),
              lastSeen: seenTs,
            }));
          }
        }
      },
      (err) => {
        console.error('Lỗi đọc Firebase Data:', err);
        setIsConnected(false);
        setError(`Không thể kết nối dữ liệu trạm ${cleanId}: ${err.message}`);
      }
    );

    // 2. Lắng nghe trạng thái cờ lệnh read_soil (/Stations/<ID>/Command)
    const unsubCmd = onValue(cmdRef, (snapshot) => {
      if (snapshot.exists()) {
        const cmd = snapshot.val();
        const isReading = Boolean(cmd.read_soil);

        if (isReading) {
          setIsCommanding(true);
        } else {
          if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
          graceTimeoutRef.current = setTimeout(() => {
            setIsCommanding(false);
            if (commandTimeoutRef.current) {
              clearTimeout(commandTimeoutRef.current);
              commandTimeoutRef.current = null;
            }
          }, 1800);
        }
      } else {
        setIsCommanding(false);
      }
    });

    // 3. Lắng nghe trạng thái Online / Heartbeat / RSSI / Chẩn đoán phần cứng (/Stations/<ID>/Status)
    const unsubStatus = onValue(statusRef, (snapshot) => {
      if (snapshot.exists()) {
        hasExplicitStatusRef.current = true;
        const st = snapshot.val();
        const now = Date.now();
        const lastSeen = typeof st.lastSeen === 'number' ? st.lastSeen : 0;
        const rssiVal =
          typeof st.rssi === 'number'
            ? st.rssi
            : typeof st.wifiRSSI === 'number'
            ? st.wifiRSSI
            : undefined;
        setStatus({
          online: Boolean(st.online) && isStationOnline(lastSeen, now),
          lastSeen,
          rssi: rssiVal,
          firmwareVersion:
            typeof st.firmwareVersion === 'string' ? st.firmwareVersion : undefined,
          sdOk: typeof st.sdOk === 'boolean' ? st.sdOk : undefined,
          lastError: typeof st.lastError === 'string' ? st.lastError : undefined,
          uptimeSec: typeof st.uptimeSec === 'number' ? st.uptimeSec : undefined,
          freeHeap: typeof st.freeHeap === 'number' ? st.freeHeap : undefined,
          pendingSyncCount:
            typeof st.pendingSyncCount === 'number' ? st.pendingSyncCount : undefined,
        });
      }
    });

    // 4. Lắng nghe thông số hiệu chuẩn cảm biến (/Stations/<ID>/Calibration)
    const unsubCalib = onValue(calibRef, (snapshot) => {
      if (snapshot.exists()) {
        setCalibration(sanitizeCalibration(snapshot.val()));
      } else {
        setCalibration(DEFAULT_CALIBRATION);
      }
    });

    // 5. Lắng nghe lịch sử đo gần nhất (/Stations/<ID>/History - tối đa 200 bản ghi)
    const unsubHistory = onValue(historyQuery, (snapshot) => {
      if (snapshot.exists()) {
        const rawHist = snapshot.val();
        const list: HistoryRecord[] = Object.keys(rawHist).map((key) => {
          const item = rawHist[key] || {};
          const normalized = normalizeSensorData(item, item.timestamp || Date.now());
          const { dateStr, timeStr } = formatDateAndTime(normalized.timestamp);
          return {
            ...normalized,
            id: key,
            zone: item.zone || 'Khu vực 1',
            cropName: item.cropName || 'Vải thiều',
            dateStr: item.dateStr || dateStr,
            timeStr: item.timeStr || timeStr,
          };
        });
        list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setHistory(list);
      } else {
        setHistory([]);
      }
    });

    // 6. Bộ kiểm tra định kỳ mỗi 15 giây để tự động chuyển sang OFFLINE nếu ESP32 mất kết nối > 2 phút
    const onlineWatchInterval = setInterval(() => {
      setStatus((prev) => {
        if (!prev.lastSeen) return prev;
        const fresh = isStationOnline(prev.lastSeen, Date.now());
        if (prev.online === fresh) return prev;
        return { ...prev, online: fresh };
      });
    }, 15000);

    return () => {
      unsubData();
      unsubCmd();
      unsubStatus();
      unsubCalib();
      unsubHistory();
      clearInterval(onlineWatchInterval);
      if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
      if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
    };
  }, [deviceId, isDemo]);

  // Gửi lệnh đo cảm biến xuống ESP32-S3 (hoặc mô phỏng trong bản Demo)
  const triggerRead = useCallback(async () => {
    if (isDemo) {
      setIsCommanding(true);
      setTimeout(() => {
        const now = Date.now();
        const rawSample: SensorData = normalizeSensorData(
          {
            n: Math.round(14 + Math.random() * 6),
            p: Math.round(18 + Math.random() * 6),
            k: Math.round(32 + Math.random() * 8),
            moisture: Number((40 + Math.random() * 6).toFixed(1)),
            soilTemp: Number((26.5 + Math.random() * 2.5).toFixed(1)),
            timestamp: now,
          },
          now
        );
        rawDemoRef.current = rawSample;
        const updated = applyCalibrationToSensorData(rawSample, calibrationRef.current);
        setSensorData(updated);
        setStatus((prev) => ({
          ...prev,
          online: true,
          lastSeen: now,
          rssi: Math.round(-54 - Math.random() * 10),
        }));
        const { dateStr, timeStr } = formatDateAndTime(now);
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
      setError(`Không thể gửi lệnh đo: ${err.message}`);
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
        setError(null);
        return true;
      } catch (err: any) {
        console.error('Lỗi cập nhật Wi-Fi:', err);
        setError(`Không thể gửi cấu hình Wi-Fi: ${err.message}`);
        return false;
      }
    },
    [deviceId, isDemo]
  );

  // Gửi hệ số bù trừ hiệu chuẩn cảm biến xuống ESP32-S3 (/Calibration + /Command/update_calib)
  const updateCalibration = useCallback(
    async (nextConfig: CalibrationConfig) => {
      const cleanCalib = sanitizeCalibration(nextConfig);
      if (isDemo) {
        setCalibration(cleanCalib);
        setSensorData(applyCalibrationToSensorData(rawDemoRef.current, cleanCalib));
        return true;
      }
      const cleanId = deviceId ? parseStationId(deviceId) : '';
      if (!cleanId) return false;
      try {
        const calibRef = ref(db, `/Stations/${cleanId}/Calibration`);
        const cmdRef = ref(db, `/Stations/${cleanId}/Command`);
        await set(calibRef, cleanCalib);
        await update(cmdRef, { update_calib: true });
        setCalibration(cleanCalib);
        setError(null);
        return true;
      } catch (err: any) {
        console.error('Lỗi cập nhật hiệu chuẩn cảm biến:', err);
        setError(`Không thể lưu hiệu chuẩn: ${err.message}`);
        return false;
      }
    },
    [deviceId, isDemo]
  );

  // Gửi lệnh khởi động lại ESP32-S3 từ xa (/Command/reboot)
  const rebootStation = useCallback(async () => {
    if (isDemo) {
      setStatus((prev) => ({
        ...prev,
        uptimeSec: 1,
        lastSeen: Date.now(),
      }));
      return true;
    }
    const cleanId = deviceId ? parseStationId(deviceId) : '';
    if (!cleanId) return false;
    try {
      const cmdRef = ref(db, `/Stations/${cleanId}/Command`);
      await update(cmdRef, { reboot: true });
      setError(null);
      return true;
    } catch (err: any) {
      console.error('Lỗi gửi lệnh khởi động lại trạm:', err);
      setError(`Không thể gửi lệnh khởi động lại: ${err.message}`);
      return false;
    }
  }, [deviceId, isDemo]);

  // Lưu bản ghi hiện tại vào History
  const saveToHistory = useCallback(
    async (zone?: string, cropName?: string) => {
      if (!sensorData) return false;
      const nowTs = Date.now();
      const { dateStr, timeStr } = formatDateAndTime(nowTs);

      if (isDemo) {
        setHistory((prev) => [
          ...prev,
          {
            ...sensorData,
            id: `demo-${nowTs}`,
            timestamp: nowTs,
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
          timestamp: sensorData.timestamp || nowTs,
          zone: zone || 'Khu vực 1',
          cropName: cropName || 'Cây trồng',
          dateStr,
          timeStr,
        });
        setError(null);
        return true;
      } catch (err: any) {
        console.error('Lỗi lưu lịch sử:', err);
        setError(`Không thể lưu bản ghi lịch sử: ${err.message}`);
        return false;
      }
    },
    [deviceId, sensorData, isDemo]
  );

  // Xóa 1 bản ghi lịch sử bị nhiễu/thử nghiệm
  const deleteHistoryRecord = useCallback(
    async (recordId: string) => {
      if (!recordId) return false;
      if (isDemo) {
        setHistory((prev) => prev.filter((item) => item.id !== recordId));
        return true;
      }
      const cleanId = deviceId ? parseStationId(deviceId) : '';
      if (!cleanId) return false;
      try {
        const recordRef = ref(db, `/Stations/${cleanId}/History/${recordId}`);
        await remove(recordRef);
        return true;
      } catch (err: any) {
        console.error('Lỗi xóa bản ghi lịch sử:', err);
        setError(`Không thể xóa bản ghi lịch sử: ${err.message}`);
        return false;
      }
    },
    [deviceId, isDemo]
  );

  const clearError = useCallback(() => setError(null), []);

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
    calibration,
    history,
    isConnected,
    isCommanding,
    error,
    clearError,
    triggerRead,
    updateWifi,
    updateCalibration,
    rebootStation,
    saveToHistory,
    deleteHistoryRecord,

    // Tương thích ngược:
    isOnline,
    commandState,
    lastUpdated,
    historyData,
    sendMeasureCommand,
  };
}
