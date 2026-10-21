// ==============================================================
// TỆP 2: src/types.ts
// Chuẩn hóa toàn bộ trường dữ liệu giữa ESP32 và giao diện Web
// ==============================================================

export interface SensorData {
  // Trường dữ liệu chuẩn gửi từ esp32_mstech_station.ino
  n: number;
  p: number;
  k: number;
  moisture: number;
  soilTemp: number;
  waterTemp: number;
  ph: number;
  timestamp: number;

  // Trường tương thích ngược cho các thành phần giao diện dùng mảng
  npk_data?: {
    n: number[];
    p: number[];
    k: number[];
  };
  do_am_dat?: number[];
  nhiet_do_dat?: number[];
  ph_data?: number[];
  temp_nuoc?: number;
}

export interface StationCommand {
  read_soil: boolean;
  update_wifi: boolean;
  wifi_ssid?: string;
  wifi_pass?: string;
}

export interface StationStatus {
  online: boolean;
  lastSeen: number;
  rssi?: number;
  wifiRSSI?: number;
  firmwareVersion?: string;
}

export interface Station {
  Data?: SensorData;
  Command?: StationCommand;
  Status?: StationStatus;
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
  ph: string;
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
