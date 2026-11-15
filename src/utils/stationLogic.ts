import { SensorData, AIInsight } from '../types';

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
 * Chuẩn hóa dữ liệu cảm biến thô từ ESP32-S3 / Firebase về cấu trúc SensorData thống nhất
 */
export function normalizeSensorData(raw: Record<string, any> | null | undefined, fallbackTimestamp: number = Date.now()): SensorData {
  const safeNum = (val: any, defaultVal = 0): number => {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : defaultVal;
  };

  const n = safeNum(raw?.n, 0);
  const p = safeNum(raw?.p, 0);
  const k = safeNum(raw?.k, 0);
  const moisture = safeNum(raw?.moisture, 0);
  const soilTemp = safeNum(raw?.soilTemp, 0);
  const timestamp = typeof raw?.timestamp === 'number' && Number.isFinite(raw.timestamp) ? raw.timestamp : fallbackTimestamp;

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
 * Tạo câu trả lời tư vấn nông nghiệp dựa trên dữ liệu cảm biến đất thực tế
 */
export function generateChatReply(userMessage: string, sensorData?: Partial<SensorData> | null): string {
  const msg = (userMessage || '').trim();
  if (!sensorData) {
    return `Hiện tại trạm chưa có dữ liệu cảm biến. Đối với câu hỏi **"${msg}"**, bạn vui lòng kết nối trạm hoặc bấm **ĐO ĐẤT** trên bảng điều khiển để M.S.AI phân tích chính xác nhất.`;
  }

  const insight = evaluateAgriculturalInsight({
    cropType: 'cây trồng hiện tại',
    location: 'Bắc Giang',
    n: sensorData.n,
    p: sensorData.p,
    k: sensorData.k,
    moisture: sensorData.moisture,
    soilTemp: sensorData.soilTemp,
  });

  const recs = insight.recommendations.map((r) => `- ${r}`).join('\n');
  return `Dựa trên dữ liệu cảm biến đất thời gian thực từ trạm **M.S.Tech**:\n\n` +
    `- **NPK:** N = ${sensorData.n ?? 'Chưa có'} mg/kg | P = ${sensorData.p ?? 'Chưa có'} mg/kg | K = ${sensorData.k ?? 'Chưa có'} mg/kg\n` +
    `- **Độ ẩm đất:** ${sensorData.moisture ?? 'Chưa có'}% | **Nhiệt độ đất:** ${sensorData.soilTemp ?? 'Chưa có'}°C\n\n` +
    `**Nhận định cho câu hỏi "${msg}":**\n${insight.summary}\n\n` +
    `**Khuyến nghị kỹ thuật:**\n${recs}`;
}
