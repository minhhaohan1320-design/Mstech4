import { GoogleGenAI } from "@google/genai";
try {
  const ai = new GoogleGenAI({ apiKey: "" });
  console.log("Initialized");
} catch (e) {
  console.error("Init Error:", e);
}
