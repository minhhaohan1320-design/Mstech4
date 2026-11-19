import React, { useState, useMemo } from 'react';
import { HistoryRecord } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChibiMarine } from './ChibiMarine';
import { Filter, Download, Trash2 } from 'lucide-react';
import {
  calculateHistoryStats,
  filterHistoryByRange,
  buildHistoryCsv,
  HistoryRangeKey,
} from '../utils/stationLogic';

interface HistoryChartProps {
  historyData: HistoryRecord[];
  hideCard?: boolean;
  deviceId?: string;
  onDeleteRecord?: (recordId: string) => Promise<boolean>;
}

const RANGE_OPTIONS: Array<{ key: HistoryRangeKey; label: string }> = [
  { key: '24h', label: '24 giờ' },
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
  { key: 'all', label: 'Tất cả' },
];

export const HistoryChart: React.FC<HistoryChartProps> = ({
  historyData,
  hideCard,
  deviceId = 'MSTECH',
  onDeleteRecord,
}) => {
  const [metric, setMetric] = useState<'npk' | 'moisture' | 'soilTemp'>('npk');
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [selectedRange, setSelectedRange] = useState<HistoryRangeKey>('all');
  const [exportNote, setExportNote] = useState<string | null>(null);

  const zones = useMemo(() => {
    const set = new Set<string>();
    (historyData || []).forEach((item) => {
      if (item.zone) set.add(item.zone);
    });
    return Array.from(set);
  }, [historyData]);

  const filteredData = useMemo(() => {
    if (!historyData) return [];
    const byRange = filterHistoryByRange(historyData, selectedRange);
    if (selectedZone === 'ALL') return byRange;
    return byRange.filter((item) => (item.zone || 'Khu vực 1') === selectedZone);
  }, [historyData, selectedZone, selectedRange]);

  const stats = useMemo(() => calculateHistoryStats(filteredData), [filteredData]);

  const handleExportCsv = () => {
    if (filteredData.length === 0) return;
    const csvContent = buildHistoryCsv(filteredData);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LichSu_MSTech_${deviceId}_${selectedRange}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportNote(`Đã xuất ${filteredData.length} bản ghi ra file Excel/CSV.`);
  };

  if (!historyData || historyData.length === 0) {
    if (hideCard) return null;
    return (
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 text-center">
        <p className="text-gray-500 font-medium">Chưa có dữ liệu lịch sử để hiển thị.</p>
      </div>
    );
  }

  const renderChart = () => {
    if (filteredData.length === 0) {
      return (
        <div className="h-[220px] flex items-center justify-center bg-gray-50 rounded-2xl border border-gray-100 text-xs font-medium text-gray-400">
          Không có bản ghi nào trong khoảng thời gian đã chọn.
        </div>
      );
    }

    switch (metric) {
      case 'npk':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorN" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorK" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="timeStr" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Area type="monotone" dataKey="n" name="Nitơ (N)" stroke="#3b82f6" fillOpacity={1} fill="url(#colorN)" />
              <Area type="monotone" dataKey="p" name="Phốt pho (P)" stroke="#f97316" fillOpacity={1} fill="url(#colorP)" />
              <Area type="monotone" dataKey="k" name="Kali (K)" stroke="#a855f7" fillOpacity={1} fill="url(#colorK)" />
            </AreaChart>
          </ResponsiveContainer>
        );
      case 'moisture':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorMoisture" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="timeStr" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Area
                type="monotone"
                dataKey="moisture"
                name="Độ ẩm đất (%)"
                stroke="#0ea5e9"
                fillOpacity={1}
                fill="url(#colorMoisture)"
              />
            </AreaChart>
          </ResponsiveContainer>
        );
      case 'soilTemp':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="timeStr" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Area
                type="monotone"
                dataKey="soilTemp"
                name="Nhiệt độ đất (°C)"
                stroke="#ef4444"
                fillOpacity={1}
                fill="url(#colorTemp)"
              />
            </AreaChart>
          </ResponsiveContainer>
        );
      default:
        return null;
    }
  };

  const content = (
    <>
      {!hideCard && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 shrink-0">
              <ChibiMarine chapter="imperialFist" bgColor="bg-yellow-50" borderColor="border-yellow-200" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Lịch sử đo</h2>
              <p className="text-xs text-gray-500">
                Giám sát biến động dữ liệu ({filteredData.length} bản ghi)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredData.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Xuất CSV (Excel)</span>
          </button>
        </div>
      )}

      {!hideCard && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4 px-4">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                setSelectedRange(opt.key);
                setExportNote(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                selectedRange === opt.key
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 px-4">
        <h3 className="font-bold text-gray-700 flex items-center text-sm uppercase tracking-wider">
          <Filter className="w-4 h-4 mr-2" />
          Chỉ số
        </h3>
        <div className="flex items-center space-x-2">
          {zones.length > 1 && (
            <select
              aria-label="Lọc theo khu vực"
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-xl focus:ring-emerald-500 focus:border-emerald-500 block px-3 py-2 font-bold outline-none"
            >
              <option value="ALL">Tất cả khu vực</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Chọn chỉ số biểu đồ"
            value={metric}
            onChange={(e) => setMetric(e.target.value as any)}
            className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-xl focus:ring-emerald-500 focus:border-emerald-500 block px-3 py-2 font-bold outline-none uppercase tracking-wider"
          >
            <option value="npk">N-P-K</option>
            <option value="moisture">Độ ẩm đất</option>
            <option value="soilTemp">Nhiệt độ đất</option>
          </select>
        </div>
      </div>

      {exportNote && !hideCard && (
        <div className="mx-4 mb-4 px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-xs font-semibold text-emerald-700">
          {exportNote}
        </div>
      )}

      <div className="w-full pl-2 pr-4">{renderChart()}</div>

      {!hideCard && stats && (
        <div className="mt-6 pt-6 border-t border-gray-100 space-y-6">
          <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              Thống kê trung bình ({filteredData.length} lần đo)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
              <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-3">
                <div className="text-[10px] font-bold text-blue-600 uppercase">Đạm (N)</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">{stats.n.avg} mg/kg</div>
                <div className="text-[10px] text-gray-400">
                  {stats.n.min} – {stats.n.max}
                </div>
              </div>
              <div className="bg-orange-50/60 border border-orange-100 rounded-2xl p-3">
                <div className="text-[10px] font-bold text-orange-600 uppercase">Lân (P)</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">{stats.p.avg} mg/kg</div>
                <div className="text-[10px] text-gray-400">
                  {stats.p.min} – {stats.p.max}
                </div>
              </div>
              <div className="bg-purple-50/60 border border-purple-100 rounded-2xl p-3">
                <div className="text-[10px] font-bold text-purple-600 uppercase">Kali (K)</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">{stats.k.avg} mg/kg</div>
                <div className="text-[10px] text-gray-400">
                  {stats.k.min} – {stats.k.max}
                </div>
              </div>
              <div className="bg-sky-50/60 border border-sky-100 rounded-2xl p-3">
                <div className="text-[10px] font-bold text-sky-600 uppercase">Độ ẩm đất</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">{stats.moisture.avg}%</div>
                <div className="text-[10px] text-gray-400">
                  {stats.moisture.min}% – {stats.moisture.max}%
                </div>
              </div>
              <div className="bg-red-50/60 border border-red-100 rounded-2xl p-3 col-span-2 sm:col-span-1">
                <div className="text-[10px] font-bold text-red-600 uppercase">Nhiệt độ đất</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">{stats.soilTemp.avg}°C</div>
                <div className="text-[10px] text-gray-400">
                  {stats.soilTemp.min}°C – {stats.soilTemp.max}°C
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              Nhật ký bản ghi gần nhất
            </h4>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 uppercase text-[10px]">
                  <th className="py-2.5 px-2 font-bold">Thời gian</th>
                  <th className="py-2.5 px-2 font-bold">Khu vực</th>
                  <th className="py-2.5 px-2 font-bold">N-P-K</th>
                  <th className="py-2.5 px-2 font-bold">Độ ẩm</th>
                  <th className="py-2.5 px-2 font-bold">Nhiệt đất</th>
                  {onDeleteRecord && <th className="py-2.5 px-2 font-bold text-right">Xóa</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-700 font-medium">
                {filteredData
                  .slice()
                  .reverse()
                  .slice(0, 15)
                  .map((row, idx) => (
                    <tr key={row.id || idx} className="hover:bg-gray-50/80">
                      <td className="py-2.5 px-2 whitespace-nowrap">{row.timeStr || '--'}</td>
                      <td className="py-2.5 px-2 whitespace-nowrap text-emerald-700 font-semibold">
                        {row.zone || 'Khu vực 1'}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        {row.n}/{row.p}/{row.k}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">{row.moisture}%</td>
                      <td className="py-2.5 px-2 whitespace-nowrap">{row.soilTemp}°C</td>
                      {onDeleteRecord && (
                        <td className="py-2.5 px-2 text-right">
                          {row.id && (
                            <button
                              type="button"
                              onClick={() => onDeleteRecord(row.id!)}
                              aria-label="Xóa bản ghi này"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );

  if (hideCard) {
    return <div className="w-full">{content}</div>;
  }

  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">{content}</div>
  );
};
