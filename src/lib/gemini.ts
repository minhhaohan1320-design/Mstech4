import { AIInsight, SensorData } from "../types";
import {
  evaluateAgriculturalInsight,
  generateChatReply,
} from "../utils/stationLogic";

/**
 * Gọi API phân tích nông học phía máy chủ (/api/analyze)
 */
export async function requestAIAnalysis(params: {
  cropType: string;
  location: string;
  data: SensorData;
}): Promise<AIInsight> {
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cropType: params.cropType || "Cây trồng",
        location: params.location || "Bắc Giang",
        n: params.data.n,
        p: params.data.p,
        k: params.data.k,
        moisture: params.data.moisture,
        soilTemp: params.data.soilTemp,
        ph: params.data.ph,
        waterTemp: params.data.waterTemp,
      }),
    });

    if (response.ok) {
      const json = await response.json();
      if (json && json.summary) {
        return json as AIInsight;
      }
    }
  } catch (err) {
    console.warn("Lỗi kết nối /api/analyze, sử dụng bộ đánh giá nội bộ:", err);
  }

  return evaluateAgriculturalInsight({
    cropType: params.cropType,
    location: params.location,
    n: params.data.n,
    p: params.data.p,
    k: params.data.k,
    moisture: params.data.moisture,
    soilTemp: params.data.soilTemp,
    ph: params.data.ph,
    waterTemp: params.data.waterTemp,
  });
}

/**
 * Gọi API trò chuyện M.S.AI phía máy chủ (/api/chat)
 */
export async function requestAIChat(
  userMessage: string,
  sensorData: SensorData | null
): Promise<string> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMessage,
        sensorData,
      }),
    });

    if (response.ok) {
      const json = await response.json();
      if (json?.result) {
        return json.result;
      }
    }
  } catch (err) {
    console.warn("Lỗi kết nối /api/chat, sử dụng phản hồi nội bộ:", err);
  }

  return generateChatReply(userMessage, sensorData);
}

/**
 * Gọi API phân tích tài liệu PDF phía máy chủ (/api/analyze-pdf)
 */
export async function requestPdfAnalysis(
  pdfBase64: string,
  fileName: string,
  promptText?: string
): Promise<string> {
  const response = await fetch("/api/analyze-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pdfBase64,
      fileName,
      promptText,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error || "Không thể phân tích file PDF.");
  }

  const data = await response.json();
  return data.result || "Đã hoàn tất phân tích tài liệu PDF.";
}
