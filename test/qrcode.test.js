const test = require('node:test');
const assert = require('node:assert');
const QRCode = require('../js/qrcode.js');

function toRows(modules) {
  return modules.map((row) => row.map((v) => (v ? '1' : '0')).join(''));
}

test('바이트 모드 용량이 규격 표와 같다', () => {
  const I = QRCode._internals;
  // ISO/IEC 18004 표 7: 버전 1과 10에서 바이트 모드로 담을 수 있는 글자 수
  assert.deepStrictEqual(
    ['L', 'M', 'Q', 'H'].map((e) => I.dataCodewords(1, e) - 2),
    [17, 14, 11, 7]
  );
  assert.deepStrictEqual(
    ['L', 'M', 'Q', 'H'].map((e) => I.dataCodewords(10, e) - 3),
    [271, 213, 151, 119]
  );
});

test('내용이 늘어나면 필요한 최소 버전을 고른다', () => {
  assert.strictEqual(QRCode.generate('a'.repeat(17), 'L').length, 21); // 버전 1
  assert.strictEqual(QRCode.generate('a'.repeat(18), 'L').length, 25); // 버전 2
  assert.strictEqual(QRCode.generate('a'.repeat(7), 'H').length, 21);
  assert.strictEqual(QRCode.generate('a'.repeat(8), 'H').length, 25);
});

test('담을 수 없는 길이면 오류를 낸다', () => {
  assert.throws(() => QRCode.generate('a'.repeat(3000), 'H'), /너무 깁니다/);
});

test('오류정정 코드워드가 규격 값과 일치한다', () => {
  // 버전 1-M 데이터 코드워드 ("HELLO WORLD", 영숫자 모드)에 대한 알려진 결과값
  const data = [0x20, 0x5b, 0x0b, 0x78, 0xd1, 0x72, 0xdc, 0x4d, 0x43, 0x40, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  const ecc = QRCode._internals.interleave(data, 1, 'M').slice(16);
  assert.deepStrictEqual(ecc, [0xc4, 0x23, 0x27, 0x77, 0xeb, 0xd7, 0xe7, 0xe2, 0x5d, 0x17]);
});

test('한글은 UTF-8로 인코딩된다', () => {
  assert.deepStrictEqual(QRCode._internals.toUtf8Bytes('한'), [237, 149, 156]);
  assert.deepStrictEqual(QRCode._internals.toUtf8Bytes('A가'), [65, 234, 176, 128]);
  assert.deepStrictEqual(QRCode._internals.toUtf8Bytes('😀'), [240, 159, 152, 128]);
  assert.strictEqual(QRCode._internals.toUtf8Bytes('😀').length, 4);
});

test('기능 패턴이 규격대로 놓인다', () => {
  const rows = toRows(QRCode.generate('https://example.com', 'M'));
  const size = rows.length;
  const finder = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
  for (let i = 0; i < 7; i++) {
    assert.strictEqual(rows[i].slice(0, 7), finder[i], '왼쪽 위 위치 검출 패턴');
    assert.strictEqual(rows[i].slice(size - 7), finder[i], '오른쪽 위 위치 검출 패턴');
    assert.strictEqual(rows[size - 7 + i].slice(0, 7), finder[i], '왼쪽 아래 위치 검출 패턴');
  }
  for (let i = 8; i < size - 8; i++) {
    assert.strictEqual(rows[6][i], i % 2 === 0 ? '1' : '0', '가로 타이밍 패턴');
    assert.strictEqual(rows[i][6], i % 2 === 0 ? '1' : '0', '세로 타이밍 패턴');
  }
  assert.strictEqual(rows[size - 8][8], '1', '항상 검은 모듈');
});

test('같은 내용은 항상 같은 매트릭스를 만든다', () => {
  // 아래 기댓값은 실제 QR 디코더(zxing-cpp)로 내용이 읽히는지 확인한 결과입니다.
  const expected = [
    '11111110111100000010001111111', '10000010011010001001101000001',
    '10111010010011011110101011101', '10111010110110111001001011101',
    '10111010111001101110001011101', '10000010110111110101101000001',
    '11111110101010101010101111111', '00000000110010100110000000000',
    '10001011101011111101011111001', '00000101001110000000001111111',
    '01001110100001110100100000001', '11110101100001011110110111011',
    '01000110100011000100110000010', '00000100010101101000001111111',
    '11110011000010001110111011101', '10110101101010100110010000011',
    '01100111110001111101110100010', '11001000011100000110011111011',
    '00011110101011110100010000101', '00111000111101011110001110011',
    '11000111010001000100111111001', '00000000111011101100100010001',
    '11111110101110001001101011101', '10000010001100100101100010011',
    '10111010100001111011111111011', '10111010011110000110100100010',
    '10111010001000110011010001111', '10000010000000111000100001011',
    '11111110110110100000101101010'
  ];
  assert.deepStrictEqual(toRows(QRCode.generate('https://mywinby.example/quiz', 'M')), expected);
});

test('SVG는 여백을 포함한 정사각형으로 그려진다', () => {
  const modules = QRCode.generate('hi', 'L');
  const svg = QRCode.toSvg(modules, { quietZone: 4 });
  const side = modules.length + 8;
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes(`viewBox="0 0 ${side} ${side}"`));
  assert.ok(svg.includes('<path'));
});
