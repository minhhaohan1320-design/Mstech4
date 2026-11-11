import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStationId,
  normalizeSensorData,
  evaluateAgriculturalInsight,
  generateChatReply,
} from './stationLogic';

test('parseStationId extracts clean ID from plain text and QR URLs', () => {
  assert.equal(parseStationId('  tram_bg_01 '), 'TRAM_BG_01');
  assert.equal(parseStationId('https://example.run.app/station/TRAM_BG_02'), 'TRAM_BG_02');
  assert.equal(parseStationId('http://localhost:3000/station/tram.03#test'), 'TRAM_03');
  assert.equal(parseStationId(''), '');
});

test('normalizeSensorData safely converts sensor readings and populates legacy arrays', () => {
  const result = normalizeSensorData({
    n: '18',
    p: 22,
    k: '40',
    moisture: '55.5',
    soilTemp: 26.4,
    waterTemp: '24.1',
    ph: 6.5,
    timestamp: 1700000000000,
  });

  assert.equal(result.n, 18);
  assert.equal(result.p, 22);
  assert.equal(result.k, 40);
  assert.equal(result.moisture, 55.5);
  assert.equal(result.soilTemp, 26.4);
  assert.equal(result.waterTemp, 24.1);
  assert.equal(result.ph, 6.5);
  assert.deepEqual(result.npk_data, { n: [18], p: [22], k: [40] });
});

test('evaluateAgriculturalInsight detects low nitrogen and acidic pH accurately', () => {
  const insight = evaluateAgriculturalInsight({
    cropType: 'Vải thiều',
    location: 'Bắc Giang',
    n: 12,
    p: 25,
    k: 45,
    moisture: 50,
    soilTemp: 27,
    ph: 5.0,
    waterTemp: 25,
  });

  assert.ok(insight.anomalies.length >= 2);
  assert.ok(insight.recommendations.length >= 2);
  assert.match(insight.nutrients.n, /12 mg\/kg/);
  assert.match(insight.ph, /5/);
});

test('generateChatReply includes real sensor numbers in Vietnamese response', () => {
  const reply = generateChatReply('Đất hiện tại cần bón phân gì?', {
    n: 15,
    p: 20,
    k: 35,
    moisture: 42.5,
    soilTemp: 27.8,
    waterTemp: 25.4,
    ph: 6.8,
  });

  assert.match(reply, /42\.5%/);
  assert.match(reply, /6\.8/);
});
