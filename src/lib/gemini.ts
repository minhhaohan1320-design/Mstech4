import { GoogleGenAI, Type } from "@google/genai";

let geminiClientInstance: GoogleGenAI | null = null;

/**
 * Lấy client GoogleGenAI trên trình duyệt (nếu có VITE_GEMINI_API_KEY)
 * Tránh lỗi crash ứng dụng khi khởi tạo ở top-level nếu thiếu API key.
 */
export const getGeminiClient = (): GoogleGenAI | null => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '' || apiKey === 'undefined') {
    return null;
  }
  if (!geminiClientInstance) {
    try {
      geminiClientInstance = new GoogleGenAI({ apiKey: apiKey.trim() });
    } catch (err) {
      console.warn("Không thể khởi tạo Gemini client phía trình duyệt:", err);
      return null;
    }
  }
  return geminiClientInstance;
};

export { Type };
