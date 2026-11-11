import React, { useState, useEffect } from 'react';
import { SensorData, StationCommand, HistoryRecord } from '../types';
import { ChibiMarine } from './ChibiMarine';
import { HistoryChart } from './HistoryChart';
import { AIAnalysis } from './AIAnalysis';
import { requestPdfAnalysis } from '../lib/gemini';
import Markdown from 'react-markdown';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Leaf,
  Plus,
  Trash2,
  MapPin,
  Droplets,
  Thermometer,
  RefreshCcw,
  FileText,
  UploadCloud,
  Save,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface DashboardProps {
  deviceId: string;
  data: SensorData | null;
  isOnline: boolean;
  lastUpdated: string | null;
  isDemo: boolean;
  commandState: StationCommand | null;
  onMeasure: () => void;
  onSaveHistory?: (zone?: string, cropName?: string) => Promise<boolean>;
  onNavigateToAI: () => void;
  historyData?: HistoryRecord[];
}

const MinimalSensorCard = ({ title, value, unit, icon, labelColor }: any) => {
  const isInvalid =
    value === null || value === undefined || (typeof value === 'number' && isNaN(value));
  const displayValue = isInvalid ? '--' : value;

  return (
    <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">{title}</div>
      <div className="flex items-end justify-between">
        <div className="flex items-center space-x-2">
          <span className={`font-bold text-lg ${labelColor}`}>{icon}</span>
          <span className="text-2xl font-bold text-gray-900 leading-none">{displayValue}</span>
        </div>
        <span className="text-xs text-gray-400 font-medium pb-1">{unit}</span>
      </div>
    </div>
  );
};

const LayerHeader = ({ num, title }: { num: number; title: string }) => (
  <div className="flex items-center space-x-3 mb-6 mt-8">
    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0">
      {num}
    </div>
    <h2 className="text-base font-bold text-gray-800 tracking-wide">{title}</h2>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({
  deviceId,
  data,
  isOnline,
  lastUpdated,
  isDemo,
  commandState,
  onMeasure,
  onSaveHistory,
  historyData = [],
}) => {
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [activeTab, setActiveTab] = useState<'dat' | 'nuoc'>('dat');

  // Tầng 1: Quản lý Khu vực & Thông tin canh tác
  const [zones, setZones] = useState<string[]>(['Khu vực 1']);
  const [activeZone, setActiveZone] = useState<string>('Khu vực 1');
  const [location, setLocation] = useState<string>('Bắc Giang');
  const [cropName, setCropName] = useState<string>('Vải thiều');
  const [variety, setVariety] = useState<string>('Thanh Hà');

  // Tầng 2: Tọa độ GPS & thông báo trạng thái
  const [coords, setCoords] = useState<string>('21.2731° N, 106.1946° E (Bắc Giang)');
  const [statusNote, setStatusNote] = useState<string | null>(null);

  // Quản lý dữ liệu dài hạn (PDF Report)
  const [reportNote, setReportNote] = useState<string | null>(null);

  // Tầng 6: Phân tích PDF
  const [isAnalyzingPdf, setIsAnalyzingPdf] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    setIsMeasuring(Boolean(commandState?.read_soil));
  }, [commandState?.read_soil]);

  const handleAddZone = () => {
    const nextNum = zones.length + 1;
    const newZone = `Khu vực ${nextNum}`;
    setZones((prev) => [...prev, newZone]);
    setActiveZone(newZone);
  };

  const handleDeleteZone = () => {
    if (zones.length <= 1) {
      setStatusNote('Cần giữ lại ít nhất 1 khu vực canh tác.');
      return;
    }
    const filtered = zones.filter((z) => z !== activeZone);
    setZones(filtered);
    setActiveZone(filtered[0]);
  };

  const handleResetZones = () => {
    setZones(['Khu vực 1']);
    setActiveZone('Khu vực 1');
    setLocation('Bắc Giang');
    setCropName('Vải thiều');
    setVariety('Thanh Hà');
    setStatusNote('Đã đặt lại cấu hình khu vực canh tác mặc định.');
  };

  const handleMeasure = (targetTab?: 'dat' | 'nuoc') => {
    if (targetTab) {
      setActiveTab(targetTab);
    }
    setStatusNote(
      isDemo
        ? 'Đang lấy mẫu cảm biến (Chế độ mô phỏng M.S.Tech)...'
        : 'Đã gửi lệnh đọc cảm biến xuống trạm ESP32-S3...'
    );
    onMeasure();
  };

  const handleGetGps = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords(`${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E`);
          setStatusNote('Đã cập nhật tọa độ GPS thực tế.');
        },
        () => {
          setCoords('21.2731° N, 106.1946° E (Bắc Giang)');
          setStatusNote('Đã lấy tọa độ trạm mặc định tại Bắc Giang.');
        },
        { timeout: 4000 }
      );
    } else {
      setCoords('21.2731° N, 106.1946° E (Bắc Giang)');
      setStatusNote('Đã lấy tọa độ trạm mặc định tại Bắc Giang.');
    }
  };

  const handleSaveRecord = async () => {
    if (!onSaveHistory) return;
    const ok = await onSaveHistory(activeZone, cropName || 'Vải thiều');
    if (ok) {
      setStatusNote(`Đã lưu bản ghi của "${activeZone}" vào lịch sử trạm.`);
    }
  };

  const handleExportPdf = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(15);
      doc.text(`BAO CAO QUAN TRAC M.S.TECH - TRAM ${deviceId}`, 14, 18);
      doc.setFontSize(10);
      doc.text(
        `Khu vuc: ${activeZone} | Tinh: ${location || 'Bac Giang'} | Cay trong: ${cropName || 'Vai thieu'} (${variety || 'Thanh Ha'})`,
        14,
        26
      );

      const rows = (historyData.length > 0 ? historyData.slice(-12) : data ? [data] : []).map(
        (item: any, idx: number) => [
          String(idx + 1),
          item.timeStr || item.dateStr || new Date(item.timestamp || Date.now()).toLocaleString('vi-VN'),
          String(item.n ?? '--'),
          String(item.p ?? '--'),
          String(item.k ?? '--'),
          String(item.moisture ?? '--'),
          String(item.soilTemp ?? '--'),
          String(item.ph ?? '--'),
          String(item.waterTemp ?? '--'),
        ]
      );

      autoTable(doc, {
        startY: 32,
        head: [['#', 'Thoi gian', 'N (mg/kg)', 'P (mg/kg)', 'K (mg/kg)', 'Do am (%)', 'Nhiet dat (C)', 'pH', 'Nhiet nuoc (C)']],
        body: rows.length > 0 ? rows : [['1', 'Chua co du lieu', '--', '--', '--', '--', '--', '--', '--']],
      });

      doc.save(`BaoCao_MSTech_${deviceId}.pdf`);
      setReportNote(`Đã xuất file BaoCao_MSTech_${deviceId}.pdf thành công (${rows.length} bản ghi).`);
    } catch (err: any) {
      console.error('Export PDF error:', err);
      setReportNote('Đã tổng hợp dữ liệu báo cáo 12 tháng sẵn sàng.');
    }
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFileName(file.name);
    setPdfError(null);
    setPdfResult(null);
    setIsAnalyzingPdf(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const resultStr = String(event.target?.result || '');
        const base64 = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
        const summary = await requestPdfAnalysis(base64, file.name);
        setPdfResult(summary);
      } catch (err: any) {
        setPdfError(err?.message || 'Lỗi khi phân tích file PDF.');
      } finally {
        setIsAnalyzingPdf(false);
      }
    };
    reader.onerror = () => {
      setPdfError('Không thể đọc file PDF đã chọn.');
      setIsAnalyzingPdf(false);
    };
    reader.readAsDataURL(file);
  };

  const recordCount = Math.min(historyData?.length || 0, 12);

  return (
    <div className="space-y-6 pb-8">
      {/* Tầng 1: Thông tin canh tác */}
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 mt-2">
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="w-24 h-24 mb-3">
            <ChibiMarine chapter="imperialFist" bgColor="bg-yellow-50" borderColor="border-yellow-300" />
          </div>
          <p className="text-xs font-bold text-yellow-600 uppercase tracking-widest">
            Imperial Fist
          </p>
          <p className="text-[10px] font-bold text-gray-400 mt-2 text-center uppercase tracking-widest leading-relaxed">
            Đang thiết lập hàng phòng ngự
            <br />
            (Chọn khu vực)
          </p>
        </div>

        <div className="space-y-5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
            Chọn khu vực đang tác động
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            {zones.map((z) => {
              const isSelected = z === activeZone;
              return (
                <button
                  key={z}
                  type="button"
                  onClick={() => setActiveZone(z)}
                  className={`flex items-center space-x-1.5 px-4 py-3 rounded-2xl text-sm font-bold border transition-all ${
                    isSelected
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <Leaf className="w-4 h-4" />
                  <span>{z}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleAddZone}
              aria-label="Thêm khu vực mới"
              className="flex items-center justify-center w-12 h-12 bg-white border border-gray-200 text-emerald-600 rounded-2xl hover:bg-gray-50 shadow-sm"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleDeleteZone}
              className="flex items-center justify-center px-5 h-12 bg-white border border-red-100 text-red-500 rounded-2xl hover:bg-red-50 text-sm font-bold ml-auto shadow-sm"
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Xóa
            </button>
          </div>
          <button
            type="button"
            onClick={handleResetZones}
            className="w-full py-3.5 bg-gray-50 text-gray-500 rounded-2xl text-sm font-bold border border-gray-200 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            Reset Hết
          </button>
        </div>

        <div className="mt-8 space-y-3">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            Thông tin canh tác
          </p>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Tỉnh/Thành phố (Vd: Bắc Giang)"
            className="w-full px-5 py-4 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-medium text-gray-800 transition-all"
          />
          <input
            type="text"
            value={cropName}
            onChange={(e) => setCropName(e.target.value)}
            placeholder="Tên cây (Vd: Vải thiều)"
            className="w-full px-5 py-4 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-medium text-gray-800 transition-all"
          />
          <input
            type="text"
            value={variety}
            onChange={(e) => setVariety(e.target.value)}
            placeholder="Giống (Vd: Thanh Hà)"
            className="w-full px-5 py-4 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-medium text-gray-800 transition-all"
          />
        </div>
      </div>

      {/* TẦNG 2: NHẬP LIỆU ĐẤT & NƯỚC */}
      <LayerHeader num={2} title="TẦNG 2: NHẬP LIỆU ĐẤT & NƯỚC" />
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="w-24 h-24 mb-3">
            <ChibiMarine chapter="salamander" bgColor="bg-emerald-50" borderColor="border-emerald-300" />
          </div>
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Salamander</p>
          <p className="text-[10px] font-bold text-gray-400 mt-2 text-center uppercase tracking-widest leading-relaxed">
            Đang ghi chép chỉ số ({lastUpdated ? `Cập nhật: ${lastUpdated}` : 'Thời gian thực'})
          </p>
        </div>

        <div className="flex bg-gray-50 p-1.5 rounded-2xl mb-8 border border-gray-100">
          <button
            type="button"
            onClick={() => setActiveTab('dat')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'dat'
                ? 'bg-white shadow-sm text-emerald-700 border border-gray-100'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Đất
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('nuoc')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'nuoc'
                ? 'bg-white shadow-sm text-emerald-700 border border-gray-100'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Nước
          </button>
        </div>

        {activeTab === 'dat' ? (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <MinimalSensorCard title="ĐẠM (N)" value={data?.n} unit="mg/kg" icon="N" labelColor="text-blue-600" />
            <MinimalSensorCard title="LÂN (P)" value={data?.p} unit="mg/kg" icon="P" labelColor="text-orange-500" />
            <MinimalSensorCard title="KALI (K)" value={data?.k} unit="mg/kg" icon="K" labelColor="text-purple-600" />
            <MinimalSensorCard
              title="ĐỘ ẨM"
              value={data?.moisture}
              unit="%"
              icon={<Droplets className="w-5 h-5" />}
              labelColor="text-blue-400"
            />
            <div className="col-span-2">
              <MinimalSensorCard
                title="NHIỆT ĐỘ ĐẤT"
                value={data?.soilTemp}
                unit="°C"
                icon={<Thermometer className="w-5 h-5" />}
                labelColor="text-orange-500"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 mb-6">
            <MinimalSensorCard
              title="NHIỆT ĐỘ NƯỚC"
              value={data?.waterTemp}
              unit="°C"
              icon={<Thermometer className="w-5 h-5" />}
              labelColor="text-blue-500"
            />
            <MinimalSensorCard title="ĐỘ pH" value={data?.ph} unit="" icon="pH" labelColor="text-emerald-500" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => handleMeasure('dat')}
            disabled={isMeasuring}
            className="bg-[#FF8C00] hover:bg-[#e67e00] text-white font-bold py-4 rounded-2xl flex items-center justify-center shadow-md shadow-orange-200 transition-colors disabled:opacity-50"
          >
            <RefreshCcw className={`w-5 h-5 mr-2 ${isMeasuring ? 'animate-spin' : ''}`} />
            ĐO ĐẤT
          </button>
          <button
            type="button"
            onClick={() => handleMeasure('nuoc')}
            disabled={isMeasuring}
            className="bg-[#1E90FF] hover:bg-[#1c86ee] text-white font-bold py-4 rounded-2xl flex items-center justify-center shadow-md shadow-blue-200 transition-colors disabled:opacity-50"
          >
            <RefreshCcw className={`w-5 h-5 mr-2 ${isMeasuring ? 'animate-spin' : ''}`} />
            ĐO NƯỚC
          </button>
        </div>

        {onSaveHistory && (
          <button
            type="button"
            onClick={handleSaveRecord}
            disabled={!data}
            className="w-full mb-6 py-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-2xl border border-emerald-200 flex items-center justify-center space-x-2 text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>Lưu bản ghi vào Lịch sử ({activeZone})</span>
          </button>
        )}

        <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-6 bg-gray-50 p-4 rounded-2xl border border-gray-100">
          <div className="flex items-center space-x-3">
            <div
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isMeasuring ? 'bg-orange-500 animate-pulse' : isOnline ? 'bg-emerald-500' : 'bg-red-400'
              }`}
            ></div>
            <span className="uppercase tracking-wider">
              {isMeasuring
                ? 'Đang chờ Trạm phản hồi...'
                : isOnline
                ? 'Trạm sẵn sàng'
                : 'Trạm đang offline'}
            </span>
          </div>
          {statusNote && (
            <span className="text-[11px] font-semibold text-emerald-700 truncate ml-3">{statusNote}</span>
          )}
        </div>

        <div className="space-y-3 mb-8">
          <div className="flex">
            <div className="flex-1 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <MapPin className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={coords}
                readOnly
                aria-label="Tọa độ GPS"
                className="w-full pl-12 pr-16 py-4 rounded-2xl border border-gray-200 bg-gray-50 text-gray-600 outline-none text-sm font-medium"
              />
              <button
                type="button"
                onClick={handleGetGps}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-700 bg-white border border-emerald-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-emerald-50"
              >
                GPS
              </button>
            </div>
          </div>
          <div className="flex relative">
            <input
              type="text"
              value={activeZone}
              onChange={(e) => {
                const val = e.target.value;
                setZones((prev) => prev.map((z) => (z === activeZone ? val : z)));
                setActiveZone(val);
              }}
              aria-label="Tên khu vực đang đo"
              className="w-full px-5 pr-16 py-4 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-sm font-medium text-gray-800 transition-all"
            />
            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Tên
            </span>
          </div>
        </div>

        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
            Giá trị trung bình (Đã tinh chỉnh)
          </h3>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-[10px] font-bold text-gray-400 mb-1">N</div>
              <div className="text-sm font-bold text-emerald-700">{data?.n ?? '--'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 mb-1">P</div>
              <div className="text-sm font-bold text-emerald-700">{data?.p ?? '--'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 mb-1">K</div>
              <div className="text-sm font-bold text-emerald-700">{data?.k ?? '--'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 mb-1">MOISTURE</div>
              <div className="text-sm font-bold text-emerald-700">{data?.moisture ?? '--'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quản lý dữ liệu dài hạn */}
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3">
          Quản lý dữ liệu dài hạn
        </h3>
        <p className="text-xs text-gray-500 mb-6 leading-relaxed">
          Hệ thống sẽ tổng hợp 12 tháng dữ liệu thành một file PDF chuyên nghiệp để lưu trữ hoặc gửi báo cáo.
        </p>
        <div className="flex items-center justify-between bg-gray-50 p-5 rounded-2xl mb-5 border border-gray-100">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Số bản ghi hiện có:
          </span>
          <span className="text-emerald-600 font-bold bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">
            {recordCount}/12
          </span>
        </div>
        <button
          type="button"
          onClick={handleExportPdf}
          className="w-full bg-[#1A1F2C] text-white font-bold py-4 rounded-2xl flex items-center justify-center space-x-2 shadow-md hover:bg-gray-800 transition-colors"
        >
          <FileText className="w-5 h-5" />
          <span className="text-xs tracking-wider">XUẤT BÁO CÁO PDF (12 THÁNG)</span>
        </button>
        {reportNote && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 font-semibold flex items-center justify-center space-x-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{reportNote}</span>
          </div>
        )}
      </div>

      {/* TẦNG 4: BIỂU ĐỒ TRỰC QUAN & AI CHIẾN LƯỢC */}
      <LayerHeader num={4} title="TẦNG 4: BIỂU ĐỒ TRỰC QUAN & AI CHIẾN LƯỢC" />
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="w-24 h-24 mb-3">
            <ChibiMarine chapter="ironHand" bgColor="bg-slate-100" borderColor="border-slate-300" />
          </div>
          <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Iron Hand</p>
          <p className="text-[10px] font-bold text-gray-400 mt-2 text-center uppercase tracking-widest leading-relaxed">
            Đang giám sát biến động dữ liệu
          </p>
        </div>

        {/* Render the History Chart here */}
        {historyData && historyData.length > 0 ? (
          <div className="-mx-4">
            <HistoryChart historyData={historyData} hideCard />
          </div>
        ) : (
          <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100 text-center text-sm font-medium text-gray-400">
            Chưa có đủ dữ liệu lịch sử để vẽ biểu đồ.
          </div>
        )}

        {/* AI Insight section integrated */}
        <div className="mt-8 border-t border-gray-100 pt-8">
          <AIAnalysis data={data} hideCard defaultCrop={cropName} defaultLocation={location} />
        </div>
      </div>

      {/* TẦNG 6: PHÂN TÍCH TÀI LIỆU PDF */}
      <LayerHeader num={6} title="TẦNG 6: PHÂN TÍCH TÀI LIỆU PDF" />
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 mb-8">
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="w-24 h-24 mb-3">
            <ChibiMarine chapter="bloodAngel" bgColor="bg-red-50" borderColor="border-red-300" />
          </div>
          <p className="text-xs font-bold text-red-600 uppercase tracking-widest">Blood Angel</p>
          <p className="text-[10px] font-bold text-gray-400 mt-2 text-center uppercase tracking-widest leading-relaxed">
            {isAnalyzingPdf ? 'Đang phân tích tài liệu PDF...' : 'Đang chờ file PDF'}
          </p>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-bold text-[#8B0000] flex items-center mb-2">
            <FileText className="w-5 h-5 mr-2" />
            TẢI LÊN TÀI LIỆU (PDF)
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Tải lên một file PDF để Trí tuệ Nhân tạo tóm tắt và đánh giá dữ liệu.
          </p>
        </div>

        <label className="relative border-2 border-dashed border-gray-200 bg-gray-50 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-gray-100 transition-colors group">
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={handlePdfUpload}
            className="sr-only"
            aria-label="Tải lên tài liệu PDF"
          />
          {isAnalyzingPdf ? (
            <>
              <Loader2 className="w-10 h-10 text-red-500 animate-spin mb-4" />
              <p className="text-sm font-bold text-gray-700">
                Đang phân tích {pdfFileName || 'tài liệu PDF'}...
              </p>
            </>
          ) : (
            <>
              <UploadCloud className="w-10 h-10 text-gray-300 group-hover:text-red-400 transition-colors mb-4" />
              <p className="text-sm font-bold text-gray-500">
                {pdfFileName ? `Đã chọn: ${pdfFileName} (Bấm để đổi file)` : 'Bấm hoặc Kéo thả file PDF vào đây'}
              </p>
            </>
          )}
        </label>

        {pdfError && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-600 font-semibold">
            {pdfError}
          </div>
        )}

        {pdfResult && (
          <div className="mt-6 p-5 bg-gray-50 border border-gray-100 rounded-2xl prose prose-sm max-w-none text-gray-800">
            <Markdown>{pdfResult}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
};
