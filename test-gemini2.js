import { GoogleGenAI } from "@google/genai";
async function run() {
  try {
    const ai = new GoogleGenAI({ apiKey: "INVALID_KEY" });
    const res = await ai.models.generateContent({ model: "gemini-3.7-flash", contents: "Hi" });
    console.log("Success:", res.text);
  } catch (e) {
    console.error("Call Error:", e.message);
  }
}
run();
