import { SensorData, AIInsight, CalibrationConfig } from '../types';

export const DEFAULT_CALIBRATION: CalibrationConfig = {
  offsetMoist: 0,
  offsetTemp: 0,
  scaleN: 1,
  scaleP: 1,
  scaleK: 1,
};

/**
 * Chuẩn hóa Mã Trạm từ chuỗi nhập tay hoặc URL mã QR (VD: https://.../station/TRAM_BG_01)
 * Loại bỏ các ký tự cấm của Firebase Realtime Database (., #, $, [, ], /)
 */
export function parseStationId(rawInput: string): string {
  if (!rawInput || typeof rawInput !== 'string') return '';
  let trimmed = rawInput.trim();
  if (!trimmed) return '';

  // Nếu là URL hoặc đường dẫn chứa /station/<id>
  const stationMatch = trimmed.match(/\/station\/([^/?#]+)/i);
  if (stationMatch && stationMatch[1]) {
    trimmed = decodeURIComponent(stationMatch[1]);
  } else if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split('/').filter(Boolean);
      trimmed = parts[parts.length - 1] || trimmed;
    } catch {
      // Giữ nguyên nếu không parse được URL
    }
  }

  // Loại bỏ các ký tự không hợp lệ trong đường dẫn Firebase RTDB
  const sanitized = trimmed.replace(/[.#$[\]/\\:?&=%\s]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized.toUpperCase();
}

/**
 * Làm tròn số thực an toàn để tránh sai số dấu chấm động IEEE-754 khi ESP32 chia trung bình 3 lần đọc
 */
function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Kiểm tra trạng thái Online của trạm dựa trên mốc thời gian Heartbeat (lastSeen)
 */
export function isStationOnline(
  lastSeen: number,
  now: number = Date.now(),
  timeoutMs: number = 120000
): boolean {
  if (typeof lastSeen !== 'number' || !Number.isFinite(lastSeen) || lastSeen <= 0) {
    return false;
  }
  const diff = now - lastSeen;
  return diff >= -60000 && diff < timeoutMs;
}

/**
 * Đánh giá chất lượng sóng Wi-Fi từ giá trị RSSI (dBm) của ESP32-S3
 */
export function getWifiSignalQuality(rssi?: number): {
  label: string;
  level: 0 | 1 | 2 | 3 | 4;
  textClass: string;
  barClass: string;
} {
  if (typeof rssi !== 'number' || !Number.isFinite(rssi) || rssi === 0) {
    return {
      label: 'Chưa rõ',
      level: 0,
      textClass: 'text-gray-400',
      barClass: 'bg-gray-300',
    };
  }
  if (rssi >= -60) {
    return {
      label: 'Rất tốt',
      level: 4,
      textClass: 'text-emerald-600',
      barClass: 'bg-emerald-500',
    };
  }
  if (rssi >= -70) {
    return {
      label: 'Tốt',
      level: 3,
      textClass: 'text-emerald-600',
      barClass: 'bg-emerald-500',
    };
  }
  if (rssi >= -80) {
    return {
      label: 'Trung bình',
      level: 2,
      textClass: 'text-amber-600',
      barClass: 'bg-amber-500',
    };
  }
  return {
    label: 'Sóng yếu',
    level: 1,
    textClass: 'text-red-500',
    barClass: 'bg-red-500',
  };
}

/**
 * Chuẩn hóa & giới hạn an toàn thông số bù trừ hiệu chuẩn cảm biến (khớp 100% với ESP32-S3)
 */
export function sanitizeCalibration(raw?: Partial<CalibrationConfig> | null): CalibrationConfig {
  const safe = (val: any, fallback: number, min: number, max: number, decimals: number): number => {
    const parsed = Number(val);
    if (!Number.isFinite(parsed)) return fallback;
    return roundTo(clamp(parsed, min, max), decimals);
  };

  return {
    offsetMoist: safe(raw?.offsetMoist, DEFAULT_CALIBRATION.offsetMoist, -30, 30, 1),
    offsetTemp: safe(raw?.offsetTemp, DEFAULT_CALIBRATION.offsetTemp, -15, 15, 1),
    scaleN: safe(raw?.scaleN, DEFAULT_CALIBRATION.scaleN, 0.5, 2.0, 2),
    scaleP: safe(raw?.scaleP, DEFAULT_CALIBRATION.scaleP, 0.5, 2.0, 2),
    scaleK: safe(raw?.scaleK, DEFAULT_CALIBRATION.scaleK, 0.5, 2.0, 2),
  };
}

/**
 * Áp dụng công thức bù trừ cảm biến giống hệt trên ESP32-S3 (dùng cho bản Demo / kiểm thử)
 */
export function applyCalibrationToSensorData(
  raw: SensorData,
  calib: CalibrationConfig
): SensorData {
  const cleanCalib = sanitizeCalibration(calib);
  const n = Math.max(0, Math.round(raw.n * cleanCalib.scaleN));
  const p = Math.max(0, Math.round(raw.p * cleanCalib.scaleP));
  const k = Math.max(0, Math.round(raw.k * cleanCalib.scaleK));
  const moisture = roundTo(clamp(raw.moisture + cleanCalib.offsetMoist, 0, 100), 1);
  const soilTemp = roundTo(raw.soilTemp + cleanCalib.offsetTemp, 1);

  return {
    ...raw,
    n,
    p,
    k,
    moisture,
    soilTemp,
    npk_data: { n: [n], p: [p], k: [k] },
    do_am_dat: [moisture],
    nhiet_do_dat: [soilTemp],
  };
}

/**
 * Chuẩn hóa dữ liệu cảm biến thô từ ESP32-S3 / Firebase về cấu trúc SensorData thống nhất
 */
export function normalizeSensorData(
  raw: Record<string, any> | null | undefined,
  fallbackTimestamp: number = Date.now()
): SensorData {
  const safeNum = (val: any, defaultVal = 0, decimals = 1): number => {
    if (Array.isArray(val) && val.length > 0) {
      val = val[val.length - 1];
    }
    const parsed = Number(val);
    return Number.isFinite(parsed) ? roundTo(parsed, decimals) : defaultVal;
  };

  const n = safeNum(raw?.n ?? raw?.npk_data?.n, 0, 0);
  const p = safeNum(raw?.p ?? raw?.npk_data?.p, 0, 0);
  const k = safeNum(raw?.k ?? raw?.npk_data?.k, 0, 0);
  const moisture = safeNum(raw?.moisture ?? raw?.do_am_dat, 0, 1);
  const soilTemp = safeNum(raw?.soilTemp ?? raw?.nhiet_do_dat, 0, 1);

  let timestamp = fallbackTimestamp;
  if (typeof raw?.timestamp === 'number' && Number.isFinite(raw.timestamp) && raw.timestamp > 1000000000) {
    timestamp = raw.timestamp;
  } else if (typeof raw?.timestamp === 'string') {
    const parsedTs = Number(raw.timestamp);
    if (Number.isFinite(parsedTs) && parsedTs > 1000000000) {
      timestamp = parsedTs;
    }
  }

  return {
    n,
    p,
    k,
    moisture,
    soilTemp,
    timestamp,
    npk_data: { n: [n], p: [p], k: [k] },
    do_am_dat: [moisture],
    nhiet_do_dat: [soilTemp],
  };
}

/**
 * Chuyển đổi chuỗi tiếng Việt có dấu sang ASCII chuẩn phục vụ xuất báo cáo PDF (jsPDF standard font)
 */
export function sanitizePdfText(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Tính toán thống kê Nhỏ nhất / Trung bình / Lớn nhất cho tập dữ liệu lịch sử
 */
export function calculateHistoryStats(records: SensorData[]) {
  if (!records || records.length === 0) {
    return null;
  }

  const calc = (values: number[], decimals = 1) => {
    const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (valid.length === 0) return { min: 0, max: 0, avg: 0 };
    const min = roundTo(Math.min(...valid), decimals);
    const max = roundTo(Math.max(...valid), decimals);
    const sum = valid.reduce((acc, cur) => acc + cur, 0);
    const avg = roundTo(sum / valid.length, decimals);
    return { min, max, avg };
  };

  return {
    n: calc(records.map((r) => r.n), 0),
    p: calc(records.map((r) => r.p), 0),
    k: calc(records.map((r) => r.k), 0),
    moisture: calc(records.map((r) => r.moisture), 1),
    soilTemp: calc(records.map((r) => r.soilTemp), 1),
  };
}

/**
 * Đánh giá nông học chuẩn xác dựa trên thông số cảm biến đất thực tế
 */
export function evaluateAgriculturalInsight(params: {
  cropType?: string;
  location?: string;
  n?: number | null;
  p?: number | null;
  k?: number | null;
  moisture?: number | null;
  soilTemp?: number | null;
}): AIInsight {
  const crop = params.cropType?.trim() || 'Cây trồng';
  const loc = params.location?.trim() || 'Bắc Giang';
  const n = params.n;
  const p = params.p;
  const k = params.k;
  const moisture = params.moisture;
  const soilTemp = params.soilTemp;

  const anomalies: string[] = [];
  const trends: string[] = [];
  const recommendations: string[] = [];

  // Đánh giá Nitơ (N)
  let nComment = 'Chưa có dữ liệu Nitơ (N)';
  if (typeof n === 'number' && !isNaN(n)) {
    if (n < 20) {
      nComment = `${n} mg/kg (Thấp - Cần bổ sung đạm)`;
      anomalies.push(`Hàm lượng Đạm (N = ${n} mg/kg) thấp hơn ngưỡng tối ưu cho ${crop}.`);
      recommendations.push(`Bón bổ sung phân đạm hữu cơ hoặc Urê sinh học liều lượng vừa phải cho ${crop}.`);
    } else if (n <= 80) {
      nComment = `${n} mg/kg (Ổn định)`;
      trends.push(`Hàm lượng Nitơ (${n} mg/kg) duy trì ở ngưỡng cân bằng.`);
    } else {
      nComment = `${n} mg/kg (Cao - Dư đạm)`;
      anomalies.push(`Hàm lượng Đạm (N = ${n} mg/kg) vượt ngưỡng, dễ gây lốp lá hoặc sâu bệnh.`);
      recommendations.push('Tạm ngưng bón phân đạm, tăng cường Kali và Lân để cân đối dinh dưỡng.');
    }
  }

  // Đánh giá Phốt pho (P)
  let pComment = 'Chưa có dữ liệu Phốt pho (P)';
  if (typeof p === 'number' && !isNaN(p)) {
    if (p < 15) {
      pComment = `${p} mg/kg (Thiếu lân)`;
      anomalies.push(`Hàm lượng Lân (P = ${p} mg/kg) thấp, ảnh hưởng phát triển bộ rễ.`);
      recommendations.push('Bổ sung Super Lân hoặc Lân nung chảy giúp kích thích hệ rễ phát triển.');
    } else if (p <= 70) {
      pComment = `${p} mg/kg (Tốt cho rễ & mầm hoa)`;
      trends.push(`Chỉ số Lân (${p} mg/kg) thuận lợi cho quá trình trao đổi chất.`);
    } else {
      pComment = `${p} mg/kg (Dư lân)`;
      recommendations.push('Giảm lượng phân lân trong kỳ bón tiếp theo để tránh khóa vi lượng Kẽm và Sắt.');
    }
  }

  // Đánh giá Kali (K)
  let kComment = 'Chưa có dữ liệu Kali (K)';
  if (typeof k === 'number' && !isNaN(k)) {
    if (k < 25) {
      kComment = `${k} mg/kg (Thấp - Cần bổ sung)`;
      anomalies.push(`Hàm lượng Kali (K = ${k} mg/kg) thấp, giảm sức đề kháng và chất lượng nông sản.`);
      recommendations.push(`Bổ sung Kali Sunfat (K2SO4) giúp ${crop} cứng cây và tăng phẩm chất quả/hạt.`);
    } else if (k <= 100) {
      kComment = `${k} mg/kg (Đạt chuẩn)`;
      trends.push(`Hàm lượng Kali (${k} mg/kg) đáp ứng tốt nhu cầu sinh trưởng của ${crop}.`);
    } else {
      kComment = `${k} mg/kg (Cao)`;
      recommendations.push('Tưới đủ ẩm để hòa tan lượng Kali dư thừa trong vùng rễ.');
    }
  }

  // Đánh giá độ ẩm đất
  let moistureComment = 'Chưa có dữ liệu độ ẩm đất';
  if (typeof moisture === 'number' && !isNaN(moisture)) {
    if (moisture < 35) {
      moistureComment = `${moisture}% (Đất khô - Cần tưới ẩm)`;
      anomalies.push(`Độ ẩm đất (${moisture}%) xuống thấp, cây khó hấp thu NPK.`);
      recommendations.push('Kích hoạt hệ thống tưới nhỏ giọt để nâng độ ẩm đất lên mức 45% - 65%.');
    } else if (moisture <= 75) {
      moistureComment = `${moisture}% (Độ ẩm lý tưởng)`;
      trends.push(`Độ ẩm đất (${moisture}%) giúp hệ vi sinh vật và rễ cây hấp thu dinh dưỡng tốt.`);
    } else {
      moistureComment = `${moisture}% (Ẩm cao - Nguy cơ ngập úng)`;
      anomalies.push(`Độ ẩm đất (${moisture}%) quá cao, nguy cơ thiếu oxy vùng rễ và nấm bệnh.`);
      recommendations.push('Kiểm tra rãnh thoát nước, tạm dừng tưới để thông thoáng tầng canh tác.');
    }
  }

  // Đánh giá nhiệt độ đất
  let temperatureComment = 'Chưa có dữ liệu nhiệt độ đất';
  if (typeof soilTemp === 'number' && !isNaN(soilTemp)) {
    temperatureComment = `${soilTemp}°C (Nhiệt độ đất)`;
    if (soilTemp > 35) {
      anomalies.push(`Nhiệt độ đất (${soilTemp}°C) cao, gây sốc nhiệt cho rễ.`);
      recommendations.push('Tủ gốc bằng rơm rạ hoặc cỏ khô để giữ ẩm và hạ nhiệt độ mặt đất.');
    } else if (soilTemp < 15) {
      anomalies.push(`Nhiệt độ đất (${soilTemp}°C) thấp, rễ hấp thu dinh dưỡng chậm.`);
      recommendations.push('Giữ ấm gốc và hạn chế tưới vào sáng sớm hoặc chiều muộn.');
    } else {
      trends.push(`Nhiệt độ đất (${soilTemp}°C) ổn định cho hoạt động của hệ rễ.`);
    }
  }

  if (trends.length === 0) {
    trends.push(`Các chỉ số môi trường đất tại ${loc} đang được giám sát theo chu kỳ thời gian thực.`);
  }
  if (recommendations.length === 0) {
    recommendations.push(`Duy trì chế độ chăm sóc hiện tại cho ${crop} và theo dõi định kỳ qua trạm M.S.Tech.`);
  }

  const summary =
    anomalies.length === 0
      ? `Trạm quan trắc tại ${loc} ghi nhận các chỉ số đất (N-P-K, độ ẩm đất, nhiệt độ đất) dành cho ${crop} đang ở trạng thái cân bằng, thuận lợi cho sinh trưởng.`
      : `Trạm quan trắc tại ${loc} phát hiện ${anomalies.length} chỉ số đất cần lưu ý đối với ${crop}. Cần điều chỉnh dinh dưỡng và độ ẩm đất theo khuyến nghị bên dưới.`;

  return {
    summary,
    nutrients: {
      n: nComment,
      p: pComment,
      k: kComment,
    },
    moisture: moistureComment,
    temperature: temperatureComment,
    anomalies,
    trends,
    recommendations,
  };
}

/**
 * Đánh giá nhanh ngưỡng trực quan cho từng thẻ chỉ số đất trên Dashboard
 */
export function evaluateMetricLevel(
  metric: 'n' | 'p' | 'k' | 'moisture' | 'soilTemp',
  value?: number | null
): {
  label: string;
  badgeClass: string;
} {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { label: '--', badgeClass: 'bg-gray-100 text-gray-400 border-gray-200' };
  }

  switch (metric) {
    case 'n':
      if (value < 20) return { label: 'Thấp', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
      if (value <= 80) return { label: 'Tốt', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      return { label: 'Cao', badgeClass: 'bg-red-50 text-red-600 border-red-200' };
    case 'p':
      if (value < 15) return { label: 'Thấp', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
      if (value <= 70) return { label: 'Tốt', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      return { label: 'Cao', badgeClass: 'bg-red-50 text-red-600 border-red-200' };
    case 'k':
      if (value < 25) return { label: 'Thấp', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
      if (value <= 100) return { label: 'Tốt', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      return { label: 'Cao', badgeClass: 'bg-red-50 text-red-600 border-red-200' };
    case 'moisture':
      if (value < 35) return { label: 'Khô', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
      if (value <= 75) return { label: 'Lý tưởng', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      return { label: 'Ẩm cao', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'soilTemp':
      if (value < 15) return { label: 'Lạnh', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200' };
      if (value <= 35) return { label: 'Ổn định', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      return { label: 'Nóng', badgeClass: 'bg-red-50 text-red-600 border-red-200' };
    default:
      return { label: '--', badgeClass: 'bg-gray-100 text-gray-400 border-gray-200' };
  }
}

export type HistoryRangeKey = '24h' | '7d' | '30d' | 'all';

/**
 * Lọc danh sách lịch sử theo khoảng thời gian (24h, 7 ngày, 30 ngày, tất cả)
 */
export function filterHistoryByRange<T extends { timestamp?: number }>(
  records: T[],
  range: HistoryRangeKey,
  now: number = Date.now()
): T[] {
  if (!records || records.length === 0 || range === 'all') {
    return records || [];
  }
  const windowMs =
    range === '24h'
      ? 24 * 3600 * 1000
      : range === '7d'
      ? 7 * 24 * 3600 * 1000
      : 30 * 24 * 3600 * 1000;
  const cutoff = now - windowMs;
  return records.filter((item) => typeof item.timestamp === 'number' && item.timestamp >= cutoff);
}

/**
 * Tạo nội dung CSV chuẩn UTF-8 BOM để mở trực tiếp tiếng Việt trên Excel
 */
export function buildHistoryCsv(
  records: Array<{
    timeStr?: string;
    timestamp?: number;
    zone?: string;
    cropName?: string;
    n: number;
    p: number;
    k: number;
    moisture: number;
    soilTemp: number;
  }>
): string {
  const escapeCsv = (val: any) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = [
    'Thoi gian',
    'Khu vuc',
    'Cay trong',
    'Dam N (mg/kg)',
    'Lan P (mg/kg)',
    'Kali K (mg/kg)',
    'Do am dat (%)',
    'Nhiet do dat (C)',
  ].join(',');

  const rows = (records || []).map((r) => {
    const timeLabel =
      r.timeStr ||
      (r.timestamp ? new Date(r.timestamp).toLocaleString('vi-VN') : '--');
    return [
      escapeCsv(timeLabel),
      escapeCsv(r.zone || 'Khu vực 1'),
      escapeCsv(r.cropName || 'Vải thiều'),
      r.n,
      r.p,
      r.k,
      r.moisture,
      r.soilTemp,
    ].join(',');
  });

  return '\uFEFF' + [header, ...rows].join('\n');
}

export interface MonthlyAggregateRow {
  monthKey: string; // MM/YYYY
  count: number;
  n: number;
  p: number;
  k: number;
  moisture: number;
  soilTemp: number;
}

/**
 * Tổng hợp dữ liệu trung bình theo từng tháng (tối đa 12 tháng gần nhất) phục vụ báo cáo PDF 12 tháng
 */
export function aggregateMonthlyReport(
  records: Array<SensorData & { timestamp?: number }>
): MonthlyAggregateRow[] {
  if (!records || records.length === 0) return [];

  const buckets = new Map<
    string,
    { sortKey: number; count: number; n: number; p: number; k: number; moisture: number; soilTemp: number }
  >();

  for (const r of records) {
    const ts = typeof r.timestamp === 'number' && r.timestamp > 0 ? r.timestamp : Date.now();
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const monthKey = `${String(m).padStart(2, '0')}/${y}`;
    const sortKey = y * 100 + m;

    const existing = buckets.get(monthKey) || {
      sortKey,
      count: 0,
      n: 0,
      p: 0,
      k: 0,
      moisture: 0,
      soilTemp: 0,
    };
    existing.count += 1;
    existing.n += r.n || 0;
    existing.p += r.p || 0;
    existing.k += r.k || 0;
    existing.moisture += r.moisture || 0;
    existing.soilTemp += r.soilTemp || 0;
    buckets.set(monthKey, existing);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[1].sortKey - b[1].sortKey)
    .slice(-12)
    .map(([monthKey, b]) => ({
      monthKey,
      count: b.count,
      n: roundTo(b.n / b.count, 0),
      p: roundTo(b.p / b.count, 0),
      k: roundTo(b.k / b.count, 0),
      moisture: roundTo(b.moisture / b.count, 1),
      soilTemp: roundTo(b.soilTemp / b.count, 1),
    }));
}

/**
 * Định dạng thời gian hoạt động (uptimeSec) sang dạng dễ đọc (VD: 2 ngày 4 giờ 15 phút)
 */
export function formatUptime(seconds?: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '--';
  }
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} ngày ${hours}g ${mins}p`;
  if (hours > 0) return `${hours} giờ ${mins} phút`;
  if (mins > 0) return `${mins} phút`;
  return `${total} giây`;
}

/**
 * Diễn giải mã lỗi phần cứng ESP32-S3 sang tiếng Việt rõ ràng
 */
export function translateHardwareError(code?: string): {
  label: string;
  isError: boolean;
} {
  switch (code) {
    case undefined:
    case '':
    case 'NONE':
      return { label: 'Hoạt động bình thường', isError: false };
    case 'NPK_ERR':
      return { label: 'Lỗi đọc cảm biến NPK (RS485 ID 1)', isError: true };
    case 'SOIL_ERR':
      return { label: 'Lỗi đọc cảm biến Ẩm/Nhiệt đất (RS485 ID 2)', isError: true };
    case 'BOTH_SENSOR_ERR':
      return { label: 'Mất kết nối cả 2 cảm biến RS485', isError: true };
    case 'SD_ERR':
      return { label: 'Lỗi hoặc chưa gắn thẻ nhớ Micro SD', isError: true };
    case 'FIREBASE_ERR':
      return { label: 'Lỗi đường truyền đồng bộ Firebase', isError: true };
    default:
      return { label: `Mã cảnh báo: ${code}`, isError: true };
  }
}

/**
 * Tạo câu trả lời tư vấn nông nghiệp dựa trên dữ liệu cảm biến đất thực tế
 */
export function generateChatReply(
  userMessage: string,
  sensorData?: Partial<SensorData> | null,
  context?: { cropType?: string; location?: string }
): string {
  const msg = (userMessage || '').trim();
  if (!sensorData) {
    return `Hiện tại trạm chưa có dữ liệu cảm biến. Đối với câu hỏi **"${msg}"**, bạn vui lòng kết nối trạm hoặc bấm **ĐO ĐẤT** trên bảng điều khiển để M.S.AI phân tích chính xác nhất.`;
  }

  const crop = context?.cropType?.trim() || 'cây trồng hiện tại';
  const loc = context?.location?.trim() || 'Bắc Giang';

  const insight = evaluateAgriculturalInsight({
    cropType: crop,
    location: loc,
    n: sensorData.n,
    p: sensorData.p,
    k: sensorData.k,
    moisture: sensorData.moisture,
    soilTemp: sensorData.soilTemp,
  });

  const recs = insight.recommendations.map((r) => `- ${r}`).join('\n');
  return `Dựa trên dữ liệu cảm biến đất thời gian thực từ trạm **M.S.Tech** (${crop} - ${loc}):\n\n` +
    `- **NPK:** N = ${sensorData.n ?? 'Chưa có'} mg/kg | P = ${sensorData.p ?? 'Chưa có'} mg/kg | K = ${sensorData.k ?? 'Chưa có'} mg/kg\n` +
    `- **Độ ẩm đất:** ${sensorData.moisture ?? 'Chưa có'}% | **Nhiệt độ đất:** ${sensorData.soilTemp ?? 'Chưa có'}°C\n\n` +
    `**Nhận định cho câu hỏi "${msg}":**\n${insight.summary}\n\n` +
    `**Khuyến nghị kỹ thuật:**\n${recs}`;
}
