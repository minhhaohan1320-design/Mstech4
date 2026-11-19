import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStationId,
  normalizeSensorData,
  evaluateAgriculturalInsight,
  generateChatReply,
  sanitizePdfText,
  calculateHistoryStats,
  isStationOnline,
  getWifiSignalQuality,
  sanitizeCalibration,
  applyCalibrationToSensorData,
  evaluateMetricLevel,
  filterHistoryByRange,
  buildHistoryCsv,
  aggregateMonthlyReport,
  formatUptime,
  translateHardwareError,
} from './stationLogic';

test('parseStationId extracts clean ID from plain text and QR URLs', () => {
  assert.equal(parseStationId('  tram_bg_01 '), 'TRAM_BG_01');
  assert.equal(parseStationId('https://example.run.app/station/TRAM_BG_02'), 'TRAM_BG_02');
  assert.equal(parseStationId('http://localhost:3000/station/tram.03#test'), 'TRAM_03');
  assert.equal(parseStationId(''), '');
});

test('normalizeSensorData safely converts soil sensor readings, rounds floats, and handles .sv/timestamp', () => {
  const fallbackTs = 1700000000000;
  const result = normalizeSensorData(
    {
      n: '18',
      p: 22,
      k: '40',
      moisture: 55.5333333333,
      soilTemp: 26.4666666667,
      timestamp: '.sv/timestamp',
    },
    fallbackTs
  );

  assert.equal(result.n, 18);
  assert.equal(result.p, 22);
  assert.equal(result.k, 40);
  assert.equal(result.moisture, 55.5);
  assert.equal(result.soilTemp, 26.5);
  assert.equal(result.timestamp, fallbackTs);
  assert.deepEqual(result.npk_data, { n: [18], p: [22], k: [40] });
});

test('isStationOnline accurately evaluates Heartbeat freshness against 120s threshold', () => {
  const now = 1700000200000;
  assert.equal(isStationOnline(now - 30000, now), true);
  assert.equal(isStationOnline(now - 119000, now), true);
  assert.equal(isStationOnline(now - 125000, now), false);
  assert.equal(isStationOnline(0, now), false);
});

test('getWifiSignalQuality classifies RSSI dBm ranges accurately', () => {
  assert.equal(getWifiSignalQuality(-52).level, 4);
  assert.equal(getWifiSignalQuality(-52).label, 'Rất tốt');
  assert.equal(getWifiSignalQuality(-66).level, 3);
  assert.equal(getWifiSignalQuality(-75).level, 2);
  assert.equal(getWifiSignalQuality(-88).level, 1);
  assert.equal(getWifiSignalQuality(undefined).level, 0);
});

test('sanitizeCalibration clamps extreme values and guards NaN safely', () => {
  const cleaned = sanitizeCalibration({
    offsetMoist: 99,
    offsetTemp: -40,
    scaleN: 5,
    scaleP: Number.NaN,
    scaleK: 0.1,
  });

  assert.deepEqual(cleaned, {
    offsetMoist: 30,
    offsetTemp: -15,
    scaleN: 2,
    scaleP: 1,
    scaleK: 0.5,
  });
});

test('applyCalibrationToSensorData matches ESP32-S3 calibration math and bounds moisture', () => {
  const base = normalizeSensorData({
    n: 20,
    p: 30,
    k: 40,
    moisture: 96.5,
    soilTemp: 25.0,
    timestamp: 1700000000000,
  });

  const calibrated = applyCalibrationToSensorData(base, {
    offsetMoist: 5.5,
    offsetTemp: -1.2,
    scaleN: 1.1,
    scaleP: 0.9,
    scaleK: 1.25,
  });

  assert.equal(calibrated.moisture, 100);
  assert.equal(calibrated.soilTemp, 23.8);
  assert.equal(calibrated.n, 22);
  assert.equal(calibrated.p, 27);
  assert.equal(calibrated.k, 50);
});

test('sanitizePdfText strips Vietnamese diacritics cleanly for jsPDF', () => {
  assert.equal(
    sanitizePdfText('Khu vực 1 | Bắc Giang | Vải thiều (Đất đồi)'),
    'Khu vuc 1 | Bac Giang | Vai thieu (Dat doi)'
  );
});

test('calculateHistoryStats computes min, max, and average accurately', () => {
  const stats = calculateHistoryStats([
    normalizeSensorData({ n: 10, p: 20, k: 30, moisture: 40, soilTemp: 25 }),
    normalizeSensorData({ n: 20, p: 30, k: 50, moisture: 50, soilTemp: 28 }),
  ]);

  assert.ok(stats);
  assert.deepEqual(stats.n, { min: 10, max: 20, avg: 15 });
  assert.deepEqual(stats.moisture, { min: 40, max: 50, avg: 45 });
  assert.deepEqual(stats.soilTemp, { min: 25, max: 28, avg: 26.5 });
});

test('evaluateAgriculturalInsight detects low nitrogen and low soil moisture accurately', () => {
  const insight = evaluateAgriculturalInsight({
    cropType: 'Vải thiều',
    location: 'Bắc Giang',
    n: 12,
    p: 25,
    k: 45,
    moisture: 25,
    soilTemp: 27,
  });

  assert.ok(insight.anomalies.length >= 2);
  assert.ok(insight.recommendations.length >= 2);
  assert.match(insight.nutrients.n, /12 mg\/kg/);
  assert.match(insight.moisture, /25%/);
});

test('generateChatReply includes real soil sensor numbers and crop context in Vietnamese response', () => {
  const reply = generateChatReply(
    'Đất hiện tại cần bón phân gì?',
    {
      n: 15,
      p: 20,
      k: 35,
      moisture: 42.5,
      soilTemp: 27.8,
    },
    { cropType: 'Vải thiều', location: 'Lục Ngạn, Bắc Giang' }
  );

  assert.match(reply, /42\.5%/);
  assert.match(reply, /27\.8°C/);
  assert.match(reply, /Vải thiều/);
  assert.match(reply, /Lục Ngạn/);
});

test('evaluateMetricLevel classifies N, moisture, and soilTemp thresholds accurately', () => {
  assert.equal(evaluateMetricLevel('n', 12).label, 'Thấp');
  assert.equal(evaluateMetricLevel('n', 45).label, 'Tốt');
  assert.equal(evaluateMetricLevel('n', 95).label, 'Cao');
  assert.equal(evaluateMetricLevel('moisture', 28).label, 'Khô');
  assert.equal(evaluateMetricLevel('moisture', 55).label, 'Lý tưởng');
  assert.equal(evaluateMetricLevel('moisture', 82).label, 'Ẩm cao');
  assert.equal(evaluateMetricLevel('soilTemp', 37).label, 'Nóng');
  assert.equal(evaluateMetricLevel('soilTemp', null).label, '--');
});

test('filterHistoryByRange filters 24h, 7d, 30d, and all windows accurately', () => {
  const now = 1750000000000;
  const rows = [
    { id: 'old', timestamp: now - 40 * 86400 * 1000 },
    { id: 'd10', timestamp: now - 10 * 86400 * 1000 },
    { id: 'd3', timestamp: now - 3 * 86400 * 1000 },
    { id: 'h2', timestamp: now - 2 * 3600 * 1000 },
  ];

  assert.equal(filterHistoryByRange(rows, '24h', now).length, 1);
  assert.equal(filterHistoryByRange(rows, '7d', now).length, 2);
  assert.equal(filterHistoryByRange(rows, '30d', now).length, 3);
  assert.equal(filterHistoryByRange(rows, 'all', now).length, 4);
});

test('buildHistoryCsv outputs UTF-8 BOM and properly escapes commas', () => {
  const csv = buildHistoryCsv([
    {
      timeStr: '10:30 19/11',
      zone: 'Khu vực 1, Đồi A',
      cropName: 'Vải thiều',
      n: 15,
      p: 20,
      k: 35,
      moisture: 42.5,
      soilTemp: 27.8,
    },
  ]);

  assert.ok(csv.startsWith('\uFEFFThoi gian,Khu vuc,Cay trong'));
  assert.match(csv, /"Khu vực 1, Đồi A"/);
  assert.match(csv, /,15,20,35,42\.5,27\.8/);
});

test('aggregateMonthlyReport groups multi-month measurements and computes averages', () => {
  const jan1 = new Date('2026-01-10T08:00:00Z').getTime();
  const jan2 = new Date('2026-01-20T08:00:00Z').getTime();
  const feb1 = new Date('2026-02-05T08:00:00Z').getTime();

  const monthly = aggregateMonthlyReport([
    normalizeSensorData({ n: 10, p: 20, k: 30, moisture: 40, soilTemp: 24 }, jan1),
    normalizeSensorData({ n: 20, p: 30, k: 50, moisture: 50, soilTemp: 26 }, jan2),
    normalizeSensorData({ n: 18, p: 24, k: 42, moisture: 46, soilTemp: 27 }, feb1),
  ]);

  assert.equal(monthly.length, 2);
  assert.equal(monthly[0].monthKey, '01/2026');
  assert.equal(monthly[0].count, 2);
  assert.equal(monthly[0].n, 15);
  assert.equal(monthly[0].moisture, 45);
  assert.equal(monthly[1].monthKey, '02/2026');
  assert.equal(monthly[1].count, 1);
});

test('formatUptime and translateHardwareError format ESP32 diagnostics clearly', () => {
  assert.equal(formatUptime(45), '45 giây');
  assert.equal(formatUptime(18420), '5 giờ 7 phút');
  assert.equal(formatUptime(90060), '1 ngày 1g 1p');
  assert.equal(translateHardwareError('NONE').isError, false);
  assert.equal(translateHardwareError('NPK_ERR').isError, true);
  assert.match(translateHardwareError('SD_ERR').label, /Micro SD/);
});
