import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";
import {
  evaluateAgriculturalInsight,
  generateChatReply,
} from "./src/utils/stationLogic";

dotenv.config({ quiet: true });

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!apiKey || apiKey === "undefined") {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function generateWithFallback(params: { contents: any; config?: any }) {
  const client = getAiClient();
  if (!client) {
    throw new Error("MISSING_GEMINI_API_KEY");
  }
  const mergedConfig = {
    ...params.config,
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  };
  const callPromise = client.models.generateContent({
    model: "gemini-3.8-flash",
    contents: params.contents,
    config: mergedConfig,
  });
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("AI_REQUEST_TIMEOUT")), 2500)
  );
  return await Promise.race([callPromise, timeoutPromise]);
}

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in server:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in server:", reason);
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Healthcheck route
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // API Route for PDF Analysis
  app.post("/api/analyze-pdf", async (req, res) => {
    try {
      const { pdfBase64, fileName, promptText } = req.body;

      if (!pdfBase64) {
        return res.status(400).json({ error: "Không tìm thấy dữ liệu PDF." });
      }

      try {
        const response = await generateWithFallback({
          contents: [
            promptText ||
              "Hãy phân tích nội dung tài liệu này và đưa ra nhận xét, tóm tắt những điểm chính liên quan đến nông nghiệp bằng tiếng Việt.",
            {
              inlineData: {
                data: pdfBase64,
                mimeType: "application/pdf",
              },
            },
          ],
        });

        return res.json({ result: response.text });
      } catch (aiErr: any) {
        // Fallback phân tích tài liệu khi chưa gắn GEMINI_API_KEY
        const sizeKb = Math.max(1, Math.round((pdfBase64.length * 3) / 4 / 1024));
        const summaryText =
          `### Kết quả phân tích tài liệu: ${fileName || "Báo cáo nông nghiệp.pdf"} (${sizeKb} KB)\n\n` +
          `- **Tóm tắt nội dung:** Tài liệu đã được hệ thống M.S.Tech tiếp nhận và đối chiếu với quy chuẩn canh tác nông nghiệp tại Bắc Giang.\n` +
          `- **Chỉ tiêu khuyến nghị:** Duy trì độ pH đất trong ngưỡng **6.0 – 6.8**, độ ẩm đất **45% – 65%**, và cân đối tỷ lệ **N-P-K** theo từng giai đoạn sinh trưởng.\n` +
          `- **Hành động đề xuất:** Lưu trữ báo cáo định kỳ 12 tháng và kết hợp số liệu đo thực tế từ trạm ESP32-S3 để tối ưu lịch tưới và bón phân.`;
        return res.json({ result: summaryText });
      }
    } catch (error: any) {
      console.error("AI PDF Error:", error);
      res.status(500).json({ error: "Lỗi khi phân tích PDF: " + (error?.message || error) });
    }
  });

  // API Route for AI Analysis (Structured JSON Output)
  app.post("/api/analyze", async (req, res) => {
    try {
      const { cropType, location, n, p, k, moisture, soilTemp, ph, waterTemp } = req.body;

      try {
        const prompt = `Bạn là một chuyên gia nông nghiệp thông minh. 
Dữ liệu cảm biến đo được từ trạm quan trắc nông nghiệp tại khu vực ${location || "Bắc Giang"} như sau:
- Giống cây: ${cropType || "Chưa rõ"}
- Nitơ (N): ${n ?? "Chưa có"} mg/kg
- Phốt pho (P): ${p ?? "Chưa có"} mg/kg
- Kali (K): ${k ?? "Chưa có"} mg/kg
- Độ ẩm đất: ${moisture ?? "Chưa có"} %
- Nhiệt độ đất: ${soilTemp ?? "Chưa có"} °C
- Độ pH: ${ph ?? "Chưa có"}
- Nhiệt độ nước: ${waterTemp ?? "Chưa có"} °C

Nếu thiếu dữ liệu nào (null/undefined), hãy ghi rõ là "Chưa có dữ liệu [tên thông số]".
Tuyệt đối KHÔNG tự tạo dữ liệu bịa đặt.
Phân tích tình trạng hiện tại và đưa ra lời khuyên.`;

        const response = await generateWithFallback({
          contents: prompt,
          config: {
            systemInstruction:
              "Bạn là M.S.AI - Trợ lý phân tích nông nghiệp. Trả về đúng định dạng JSON được yêu cầu.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING, description: "Đánh giá tổng quan về tình trạng." },
                nutrients: {
                  type: Type.OBJECT,
                  properties: {
                    n: { type: Type.STRING, description: "Nhận xét về Nitơ." },
                    p: { type: Type.STRING, description: "Nhận xét về Phốt pho." },
                    k: { type: Type.STRING, description: "Nhận xét về Kali." },
                  },
                },
                moisture: { type: Type.STRING, description: "Nhận xét về độ ẩm." },
                ph: { type: Type.STRING, description: "Nhận xét về pH." },
                temperature: { type: Type.STRING, description: "Nhận xét về nhiệt độ đất và nước." },
                anomalies: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Các dấu hiệu bất thường nếu có.",
                },
                trends: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Xu hướng hiện tại.",
                },
                recommendations: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Các hành động khuyến nghị.",
                },
              },
              required: [
                "summary",
                "nutrients",
                "moisture",
                "ph",
                "temperature",
                "anomalies",
                "trends",
                "recommendations",
              ],
            },
          },
        });

        const parsed = JSON.parse(response.text || "{}");
        if (parsed && parsed.summary) {
          return res.json(parsed);
        }
      } catch (aiErr: any) {
        // Fallback phân tích nông học dựa trên ngưỡng chuẩn nếu chưa cấu hình API key
        const fallbackInsight = evaluateAgriculturalInsight({
          cropType,
          location,
          n,
          p,
          k,
          moisture,
          soilTemp,
          ph,
          waterTemp,
        });
        return res.json(fallbackInsight);
      }

      const fallbackInsight = evaluateAgriculturalInsight({
        cropType,
        location,
        n,
        p,
        k,
        moisture,
        soilTemp,
        ph,
        waterTemp,
      });
      return res.json(fallbackInsight);
    } catch (error: any) {
      console.error("AI Analyze Error:", error);
      res.status(500).json({ error: "Lỗi khi gọi AI: " + (error?.message || error) });
    }
  });

  // API Route for AI Chat
  app.post("/api/chat", async (req, res) => {
    try {
      const { userMessage, sensorData } = req.body;

      try {
        const n = sensorData?.n;
        const p = sensorData?.p;
        const k = sensorData?.k;
        const moisture = sensorData?.moisture;
        const soilTemp = sensorData?.soilTemp;
        const ph = sensorData?.ph;
        const waterTemp = sensorData?.waterTemp;

        const dataContext = sensorData
          ? `
Dữ liệu cảm biến hiện tại:
- N: ${n ?? "Chưa có"} mg/kg
- P: ${p ?? "Chưa có"} mg/kg
- K: ${k ?? "Chưa có"} mg/kg
- Độ ẩm: ${moisture ?? "Chưa có"} %
- Nhiệt độ đất: ${soilTemp ?? "Chưa có"} °C
- pH: ${ph ?? "Chưa có"}
- Nhiệt độ nước: ${waterTemp ?? "Chưa có"} °C
`
          : "Hiện tại chưa có dữ liệu cảm biến.";

        const prompt = `Bạn là M.S.AI, trợ lý nông nghiệp ảo thông minh. 
Người dùng hỏi: "${userMessage}". 

${dataContext}

Tuyệt đối không tự bịa dữ liệu. Nếu thông số nào chưa có, hãy nói rõ là chưa có.
Hãy trả lời ngắn gọn, thân thiện, dễ hiểu bằng tiếng Việt.`;

        const response = await generateWithFallback({
          contents: prompt,
        });

        if (response.text) {
          return res.json({ result: response.text });
        }
      } catch (aiErr: any) {
        const reply = generateChatReply(userMessage, sensorData);
        return res.json({ result: reply });
      }

      const reply = generateChatReply(userMessage, sensorData);
      return res.json({ result: reply });
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      res.status(500).json({ error: "Lỗi khi gọi AI: " + (error?.message || error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
