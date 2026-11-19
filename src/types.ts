// ==============================================================
// TỆP 2: src/types.ts
// Chuẩn hóa toàn bộ trường dữ liệu giữa ESP32 và giao diện Web
// ==============================================================

export interface SensorData {
  // Trường dữ liệu chuẩn gửi từ esp32_mstech_station.ino (5 chỉ số đất chuẩn)
  n: number;
  p: number;
  k: number;
  moisture: number;
  soilTemp: number;
  timestamp: number;

  // Trường tương thích ngược cho các thành phần giao diện dùng mảng
  npk_data?: {
    n: number[];
    p: number[];
    k: number[];
  };
  do_am_dat?: number[];
  nhiet_do_dat?: number[];
}

export interface ZoneProfile {
  id: string;
  name: string;
  location: string;
  cropName: string;
  variety: string;
  coords: string;
}

export interface CalibrationConfig {
  offsetMoist: number; // Bù trừ độ ẩm đất (%), [-30, +30]
  offsetTemp: number;  // Bù trừ nhiệt độ đất (°C), [-15, +15]
  scaleN: number;      // Hệ số nhân Đạm (N), [0.5, 2.0]
  scaleP: number;      // Hệ số nhân Lân (P), [0.5, 2.0]
  scaleK: number;      // Hệ số nhân Kali (K), [0.5, 2.0]
}

export interface StationCommand {
  read_soil: boolean;
  update_wifi: boolean;
  update_calib?: boolean;
  reboot?: boolean;
  wifi_ssid?: string;
  wifi_pass?: string;
}

export interface StationStatus {
  online: boolean;
  lastSeen: number;
  rssi?: number;
  wifiRSSI?: number;
  firmwareVersion?: string;
  sdOk?: boolean;
  lastError?: string;
  uptimeSec?: number;
  freeHeap?: number;
  pendingSyncCount?: number;
}

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

export interface Station {
  Data?: SensorData;
  Command?: StationCommand;
  Status?: StationStatus;
  Calibration?: CalibrationConfig;
}

export interface HistoryRecord extends SensorData {
  id?: string;
  zone?: string;
  cropName?: string;
  dateStr?: string;
  timeStr?: string;
}

export interface AIInsight {
  summary: string;
  nutrients: {
    n: string;
    p: string;
    k: string;
  };
  moisture: string;
  temperature: string;
  anomalies: string[];
  trends: string[];
  recommendations: string[];
}

export interface AIAnalysis {
  insight: AIInsight;
  timestamp: number;
}

export interface WifiConfiguration {
  ssid: string;
  pass: string;
}

export interface MeasurementState {
  isMeasuring: boolean;
  stage: string;
}

export type DemoModeType = boolean;
