import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStationId,
  normalizeSensorData,
  evaluateAgriculturalInsight,
  generateChatReply,
  sanitizePdfText,
  calculateHistoryStats,
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
      waterTemp: 24.1234,
      ph: 6.5432,
      timestamp: '.sv/timestamp',
    },
    fallbackTs
  );

  assert.equal(result.n, 18);
  assert.equal(result.p, 22);
  assert.equal(result.k, 40);
  assert.equal(result.moisture, 55.5);
  assert.equal(result.soilTemp, 26.5);
  assert.equal(result.waterTemp, 24.1);
  assert.equal(result.ph, 6.54);
  assert.equal(result.timestamp, fallbackTs);
  assert.deepEqual(result.npk_data, { n: [18], p: [22], k: [40] });
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

test('generateChatReply includes real soil sensor numbers in Vietnamese response', () => {
  const reply = generateChatReply('Đất hiện tại cần bón phân gì?', {
    n: 15,
    p: 20,
    k: 35,
    moisture: 42.5,
    soilTemp: 27.8,
  });

  assert.match(reply, /42\.5%/);
  assert.match(reply, /27\.8°C/);
});
