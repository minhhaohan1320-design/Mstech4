import React, { useState } from 'react';
import { SensorData, AIInsight } from '../types';
import Markdown from 'react-markdown';
import { ChibiMarine } from './ChibiMarine';
import { Sparkles, Loader2, AlertTriangle, TrendingUp, CheckCircle } from 'lucide-react';
import { ai, Type } from '../lib/gemini';

interface AIAnalysisProps {
  data: SensorData | null;
  hideCard?: boolean;
}

export const AIAnalysis: React.FC<AIAnalysisProps> = ({ data, hideCard }) => {
  const [analysis, setAnalysis] = useState<AIInsight | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cropType, setCropType] = useState('Lúa');

  const handleAnalyze = async () => {
    if (!data) return;
    setIsAnalyzing(true);

    try {
      const prompt = `Bạn là một chuyên gia nông nghiệp thông minh. Dữ liệu cảm biến đo được từ trạm quan trắc nông nghiệp tại khu vực Bắc Giang như sau:
- Giống cây: ${cropType || 'Chưa rõ'}
- Nitơ (N): ${data.n ?? 'Chưa có'} mg/kg
- Phốt pho (P): ${data.p ?? 'Chưa có'} mg/kg
- Kali (K): ${data.k ?? 'Chưa có'} mg/kg
- Độ ẩm đất: ${data.moisture ?? 'Chưa có'} %
- Nhiệt độ đất: ${data.soilTemp ?? 'Chưa có'} °C
- Độ pH: ${data.ph ?? 'Chưa có'}
- Nhiệt độ nước: ${data.waterTemp ?? 'Chưa có'} °C

Nếu thiếu dữ liệu nào (null/undefined), hãy ghi rõ là "Chưa có dữ liệu [tên thông số]".
Tuyệt đối KHÔNG tự tạo dữ liệu bịa đặt.
Phân tích tình trạng hiện tại và đưa ra lời khuyên.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
          systemInstruction: "Bạn là M.S.AI - Trợ lý phân tích nông nghiệp. Trả về đúng định dạng JSON được yêu cầu.",
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
                  k: { type: Type.STRING, description: "Nhận xét về Kali." }
                }
              },
              moisture: { type: Type.STRING, description: "Nhận xét về độ ẩm." },
              ph: { type: Type.STRING, description: "Nhận xét về pH." },
              temperature: { type: Type.STRING, description: "Nhận xét về nhiệt độ đất và nước." },
              anomalies: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Các dấu hiệu bất thường nếu có." },
              trends: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Xu hướng hiện tại." },
              recommendations: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Các hành động khuyến nghị." }
            },
            required: ["summary", "nutrients", "moisture", "ph", "temperature", "anomalies", "trends", "recommendations"]
          }
        }
      });
      
      const resData = JSON.parse(response.text || '{}');
      if (resData && resData.summary) {
        setAnalysis(resData);
      } else {
        alert("Có lỗi xảy ra khi phân tích (Dữ liệu không đúng chuẩn).");
      }
    } catch (error) {
      console.error(error);
      alert("Lỗi kết nối AI.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const content = (
    <div className="space-y-6">
      {!hideCard && (
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 shrink-0">
            <ChibiMarine chapter="bloodAngel" bgColor="bg-red-50" borderColor="border-red-200" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">AI Phân Tích</h2>
            <p className="text-xs text-gray-500">Đánh giá tình trạng hiện tại của trạm</p>
          </div>
        </div>
      )}

      <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 ml-1">AI Chiến Lược - Cây trồng mục tiêu</label>
        <input 
          type="text" 
          value={cropType}
          onChange={(e) => setCropType(e.target.value)}
          placeholder="Nhập tên cây trồng (VD: Vải thiều, Lúa...)"
          className="w-full px-5 py-4 rounded-2xl border border-gray-200 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none mb-4 bg-gray-50 focus:bg-white transition-all text-sm font-medium text-gray-800"
        />

        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || !data}
          className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center space-x-2 shadow-md shadow-emerald-200 hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="tracking-widest text-xs uppercase">M.S.AI ĐANG PHÂN TÍCH...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              <span className="tracking-widest text-xs uppercase">PHÂN TÍCH NGAY</span>
            </>
          )}
        </button>
        {!data && (
          <p className="text-xs text-red-500 mt-3 text-center font-bold tracking-wide">Cần có dữ liệu cảm biến để phân tích.</p>
        )}
      </div>

      {analysis && (
        <div className="space-y-4 pt-4 border-t border-gray-100">
          <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-2 text-[10px] uppercase tracking-widest">Tổng quan</h3>
            <p className="text-gray-600 text-sm leading-relaxed">{analysis.summary}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <h4 className="font-bold text-blue-700 mb-1 text-[10px] uppercase tracking-widest">Nitơ (N)</h4>
              <p className="text-sm font-bold text-gray-800">{analysis.nutrients.n}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <h4 className="font-bold text-orange-600 mb-1 text-[10px] uppercase tracking-widest">Phốt pho (P)</h4>
              <p className="text-sm font-bold text-gray-800">{analysis.nutrients.p}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <h4 className="font-bold text-purple-600 mb-1 text-[10px] uppercase tracking-widest">Kali (K)</h4>
              <p className="text-sm font-bold text-gray-800">{analysis.nutrients.k}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <h4 className="font-bold text-blue-400 mb-1 text-[10px] uppercase tracking-widest">Độ ẩm</h4>
              <p className="text-sm font-bold text-gray-800">{analysis.moisture}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <h4 className="font-bold text-emerald-600 mb-1 text-[10px] uppercase tracking-widest">Độ pH</h4>
              <p className="text-sm font-bold text-gray-800">{analysis.ph}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <h4 className="font-bold text-orange-400 mb-1 text-[10px] uppercase tracking-widest">Nhiệt độ</h4>
              <p className="text-sm font-bold text-gray-800">{analysis.temperature}</p>
            </div>
          </div>

          {(analysis.anomalies?.length > 0) && (
            <div className="bg-red-50 rounded-2xl p-5 border border-red-100">
              <h3 className="font-bold text-red-800 mb-3 flex items-center text-[10px] uppercase tracking-widest">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Bất thường
              </h3>
              <ul className="list-disc pl-5 text-sm text-red-700 space-y-1.5 font-medium">
                {analysis.anomalies.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}

          <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
            <h3 className="font-bold text-gray-700 mb-3 flex items-center text-[10px] uppercase tracking-widest">
              <TrendingUp className="w-4 h-4 mr-2 text-emerald-600" />
              Xu hướng
            </h3>
            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1.5 font-medium">
              {analysis.trends?.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>

          <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
            <h3 className="font-bold text-emerald-800 mb-3 flex items-center text-[10px] uppercase tracking-widest">
              <CheckCircle className="w-4 h-4 mr-2" />
              Khuyến nghị
            </h3>
            <ul className="list-disc pl-5 text-sm text-emerald-700 space-y-1.5 font-medium">
              {analysis.recommendations?.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-xl text-[10px] text-gray-400 text-center font-medium tracking-wide">
            *Phân tích của M.S.AI mang tính tham khảo dựa trên dữ liệu cảm biến và thông tin được cung cấp.
          </div>
        </div>
      )}
    </div>
  );

  if (hideCard) return <div className="w-full">{content}</div>;

  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
      {content}
    </div>
  );
};
