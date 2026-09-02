/*
 * 아주 작은 QR 코드 생성기 (바이트 모드 전용).
 * 외부 라이브러리 없이 동작하도록 직접 구현했습니다.
 * 사용법: QRCode.generate("https://example.com", "M") -> boolean[][] (true = 검은 칸)
 */
(function (global) {
  'use strict';

  // 버전(1~40) / 오류정정 레벨별 블록당 오류정정 코드워드 수
  var ECC_CODEWORDS_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  };

  // 버전 / 오류정정 레벨별 블록 개수
  var NUM_ECC_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  };

  var ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  // ---------- GF(256) 산술 ----------
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function initGaloisField() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d; // QR 코드 기약 다항식
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMultiply(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  // 오류정정 코드워드 계산에 쓰이는 생성 다항식
  function makeGeneratorPoly(degree) {
    var poly = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMultiply(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function reedSolomonEcc(data, eccLength) {
    var generator = makeGeneratorPoly(eccLength);
    var remainder = new Array(eccLength).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ remainder[0];
      remainder.shift();
      remainder.push(0);
      for (var j = 0; j < eccLength; j++) {
        remainder[j] ^= gfMultiply(generator[j + 1], factor);
      }
    }
    return remainder;
  }

  // ---------- 버전별 용량 ----------
  function rawDataModules(version) {
    var result = (16 * version + 128) * version + 64;
    if (version >= 2) {
      var numAlign = Math.floor(version / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (version >= 7) result -= 36;
    }
    return result;
  }

  function totalCodewords(version) {
    return Math.floor(rawDataModules(version) / 8);
  }

  function dataCodewords(version, ecc) {
    var blocks = NUM_ECC_BLOCKS[ecc][version];
    return totalCodewords(version) - ECC_CODEWORDS_PER_BLOCK[ecc][version] * blocks;
  }

  // ---------- 데이터 인코딩 ----------
  function toUtf8Bytes(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var code = text.codePointAt(i);
      if (code > 0xffff) i++; // 서로게이트 쌍은 두 칸을 차지
      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        out.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f)
        );
      }
    }
    return out;
  }

  function chooseVersion(byteLength, ecc) {
    for (var version = 1; version <= 40; version++) {
      var lengthBits = version <= 9 ? 8 : 16;
      var needed = Math.ceil((4 + lengthBits + byteLength * 8) / 8);
      if (needed <= dataCodewords(version, ecc)) return version;
    }
    throw new Error('QR 코드로 담기에 내용이 너무 깁니다.');
  }

  function buildDataCodewords(bytes, version, ecc) {
    var bits = [];
    function push(value, length) {
      for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }

    push(0x4, 4); // 바이트 모드
    push(bytes.length, version <= 9 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);

    var capacity = dataCodewords(version, ecc) * 8;
    push(0, Math.min(4, capacity - bits.length)); // 종료 패턴
    while (bits.length % 8 !== 0) bits.push(0);

    var codewords = [];
    for (var b = 0; b < bits.length; b += 8) {
      var value = 0;
      for (var k = 0; k < 8; k++) value = (value << 1) | bits[b + k];
      codewords.push(value);
    }
    var padBytes = [0xec, 0x11];
    for (var p = 0; codewords.length < capacity / 8; p++) {
      codewords.push(padBytes[p % 2]);
    }
    return codewords;
  }

  // 블록으로 나누고 오류정정 코드워드를 붙인 뒤 규격대로 뒤섞는다.
  function interleave(codewords, version, ecc) {
    var numBlocks = NUM_ECC_BLOCKS[ecc][version];
    var eccPerBlock = ECC_CODEWORDS_PER_BLOCK[ecc][version];
    var total = totalCodewords(version);
    var shortBlockCount = numBlocks - (total % numBlocks);
    var shortBlockDataLen = Math.floor(total / numBlocks) - eccPerBlock;

    var dataBlocks = [];
    var eccBlocks = [];
    var offset = 0;
    for (var i = 0; i < numBlocks; i++) {
      var len = shortBlockDataLen + (i < shortBlockCount ? 0 : 1);
      var block = codewords.slice(offset, offset + len);
      offset += len;
      dataBlocks.push(block);
      eccBlocks.push(reedSolomonEcc(block, eccPerBlock));
    }

    var result = [];
    var maxDataLen = shortBlockDataLen + 1;
    for (var c = 0; c < maxDataLen; c++) {
      for (var b = 0; b < numBlocks; b++) {
        if (c < dataBlocks[b].length) result.push(dataBlocks[b][c]);
      }
    }
    for (var e = 0; e < eccPerBlock; e++) {
      for (var bb = 0; bb < numBlocks; bb++) result.push(eccBlocks[bb][e]);
    }
    return result;
  }

  // ---------- 매트릭스 그리기 ----------
  function alignmentPositions(version) {
    if (version === 1) return [];
    var count = Math.floor(version / 7) + 2;
    var step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    var positions = [];
    for (var pos = version * 4 + 10; positions.length < count - 1; pos -= step) positions.unshift(pos);
    positions.unshift(6); // 좌표는 항상 오름차순이어야 한다
    return positions;
  }

  function createMatrix(version) {
    var size = version * 4 + 17;
    var modules = [];
    var reserved = [];
    for (var i = 0; i < size; i++) {
      modules.push(new Array(size).fill(false));
      reserved.push(new Array(size).fill(false));
    }

    function setModule(x, y, dark) {
      modules[y][x] = dark;
      reserved[y][x] = true;
    }

    // 위치 검출 패턴 3개 + 분리자
    [[0, 0], [size - 7, 0], [0, size - 7]].forEach(function (origin) {
      for (var dy = -1; dy <= 7; dy++) {
        for (var dx = -1; dx <= 7; dx++) {
          var x = origin[0] + dx;
          var y = origin[1] + dy;
          if (x < 0 || x >= size || y < 0 || y >= size) continue;
          var d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          setModule(x, y, d !== 2 && d <= 3);
        }
      }
    });

    // 타이밍 패턴
    for (var t = 8; t < size - 8; t++) {
      setModule(t, 6, t % 2 === 0);
      setModule(6, t, t % 2 === 0);
    }

    // 정렬 패턴
    var positions = alignmentPositions(version);
    for (var a = 0; a < positions.length; a++) {
      for (var b = 0; b < positions.length; b++) {
        var skipCorner =
          (a === 0 && b === 0) ||
          (a === 0 && b === positions.length - 1) ||
          (a === positions.length - 1 && b === 0);
        if (skipCorner) continue;
        for (var yy = -2; yy <= 2; yy++) {
          for (var xx = -2; xx <= 2; xx++) {
            setModule(positions[a] + xx, positions[b] + yy, Math.max(Math.abs(xx), Math.abs(yy)) !== 1);
          }
        }
      }
    }

    // 형식 정보 자리 예약 + 항상 검은 모듈
    for (var f = 0; f <= 8; f++) {
      if (f !== 6) {
        reserved[f][8] = true;
        reserved[8][f] = true;
      }
    }
    for (var g = 0; g < 8; g++) {
      reserved[8][size - 1 - g] = true;
      reserved[size - 1 - g][8] = true;
    }
    setModule(8, size - 8, true);

    // 버전 정보 자리 예약 (버전 7 이상)
    if (version >= 7) {
      for (var v = 0; v < 18; v++) {
        var row = Math.floor(v / 3);
        var col = size - 11 + (v % 3);
        reserved[row][col] = true;
        reserved[col][row] = true;
      }
    }

    return { size: size, modules: modules, reserved: reserved };
  }

  function placeData(matrix, codewords) {
    var size = matrix.size;
    var bitIndex = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // 세로 타이밍 패턴 열은 건너뛴다
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (matrix.reserved[y][x]) continue;
          var dark = false;
          if (bitIndex < codewords.length * 8) {
            dark = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
          }
          matrix.modules[y][x] = dark;
          bitIndex++;
        }
      }
    }
  }

  function maskCondition(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  }

  function applyMask(matrix, mask) {
    for (var y = 0; y < matrix.size; y++) {
      for (var x = 0; x < matrix.size; x++) {
        if (!matrix.reserved[y][x] && maskCondition(mask, x, y)) {
          matrix.modules[y][x] = !matrix.modules[y][x];
        }
      }
    }
  }

  function drawFormatBits(matrix, ecc, mask) {
    var data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    var size = matrix.size;

    for (var j = 0; j <= 5; j++) matrix.modules[j][8] = ((bits >>> j) & 1) === 1;
    matrix.modules[7][8] = ((bits >>> 6) & 1) === 1;
    matrix.modules[8][8] = ((bits >>> 7) & 1) === 1;
    matrix.modules[8][7] = ((bits >>> 8) & 1) === 1;
    for (var k = 9; k < 15; k++) matrix.modules[8][14 - k] = ((bits >>> k) & 1) === 1;

    for (var m = 0; m < 8; m++) matrix.modules[8][size - 1 - m] = ((bits >>> m) & 1) === 1;
    for (var n = 8; n < 15; n++) matrix.modules[size - 15 + n][8] = ((bits >>> n) & 1) === 1;
    matrix.modules[size - 8][8] = true;
  }

  function drawVersionBits(matrix, version) {
    if (version < 7) return;
    var rem = version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    var bits = (version << 12) | rem;
    var size = matrix.size;
    for (var j = 0; j < 18; j++) {
      var dark = ((bits >>> j) & 1) === 1;
      var row = Math.floor(j / 3);
      var col = size - 11 + (j % 3);
      matrix.modules[row][col] = dark;
      matrix.modules[col][row] = dark;
    }
  }

  // 규격에서 정한 네 가지 감점 규칙으로 마스크를 고른다.
  function penaltyScore(matrix) {
    var size = matrix.size;
    var score = 0;
    var dark = 0;

    function runPenalty(runLength) {
      return runLength >= 5 ? runLength - 2 : 0;
    }

    function scanLine(getModule) {
      var runColor = getModule(0);
      var runLength = 1;
      var history = [0, 0, 0, 0, 0, 0, 0];
      var lineScore = 0;

      function pushHistory(length) {
        history.pop();
        history.unshift(length);
      }
      function finderLike() {
        // 어두운 1:1:3:1:1 패턴 앞뒤로 밝은 여백이 4칸 이상이면 감점
        var n = history[1];
        if (n <= 0) return 0;
        var core = history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
        if (!core) return 0;
        return (history[0] >= n * 4 || history[6] >= n * 4) ? 40 : 0;
      }

      for (var i = 1; i < size; i++) {
        var color = getModule(i);
        if (color === runColor) {
          runLength++;
        } else {
          lineScore += runPenalty(runLength);
          if (!runColor) {
            pushHistory(runLength);
            lineScore += finderLike();
          } else {
            pushHistory(runLength);
          }
          runColor = color;
          runLength = 1;
        }
      }
      lineScore += runPenalty(runLength);
      pushHistory(runLength);
      if (runColor) pushHistory(0);
      lineScore += finderLike();
      return lineScore;
    }

    for (var y = 0; y < size; y++) {
      score += scanLine(function (x) { return matrix.modules[y][x]; });
    }
    for (var x = 0; x < size; x++) {
      score += scanLine(function (y) { return matrix.modules[y][x]; });
    }

    for (var yy = 0; yy < size - 1; yy++) {
      for (var xx = 0; xx < size - 1; xx++) {
        var c = matrix.modules[yy][xx];
        if (c === matrix.modules[yy][xx + 1] && c === matrix.modules[yy + 1][xx] && c === matrix.modules[yy + 1][xx + 1]) {
          score += 3;
        }
      }
    }

    for (var r = 0; r < size; r++) {
      for (var cc = 0; cc < size; cc++) if (matrix.modules[r][cc]) dark++;
    }
    var total = size * size;
    var k = Math.floor(Math.abs(dark * 20 - total * 10) / total);
    score += k * 10;
    return score;
  }

  // forcedMask는 테스트/검증용으로만 쓰는 선택 인자입니다(0~7).
  function generate(text, eccLevel, forcedMask) {
    var ecc = ECC_CODEWORDS_PER_BLOCK[eccLevel] ? eccLevel : 'M';
    var bytes = toUtf8Bytes(String(text));
    var version = chooseVersion(bytes.length, ecc);
    var codewords = interleave(buildDataCodewords(bytes, version, ecc), version, ecc);

    var best = null;
    var bestScore = Infinity;
    var firstMask = forcedMask == null ? 0 : forcedMask;
    var lastMask = forcedMask == null ? 7 : forcedMask;
    for (var mask = firstMask; mask <= lastMask; mask++) {
      var matrix = createMatrix(version);
      placeData(matrix, codewords);
      applyMask(matrix, mask);
      drawFormatBits(matrix, ecc, mask);
      drawVersionBits(matrix, version);
      var score = penaltyScore(matrix);
      if (score < bestScore) {
        bestScore = score;
        best = matrix;
      }
    }
    return best.modules;
  }

  // 매트릭스를 SVG 문자열로 변환한다.
  function toSvg(modules, options) {
    var opts = options || {};
    var quiet = opts.quietZone == null ? 4 : opts.quietZone;
    var light = opts.light || '#ffffff';
    var darkColor = opts.dark || '#111111';
    var size = modules.length + quiet * 2;
    var path = [];
    for (var y = 0; y < modules.length; y++) {
      for (var x = 0; x < modules.length; x++) {
        if (modules[y][x]) path.push('M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z');
      }
    }
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" ' +
      'shape-rendering="crispEdges" role="img" aria-label="' + (opts.label || 'QR 코드') + '">' +
      '<rect width="' + size + '" height="' + size + '" fill="' + light + '"/>' +
      '<path fill="' + darkColor + '" d="' + path.join('') + '"/></svg>'
    );
  }

  var QRCode = { generate: generate, toSvg: toSvg };

  // 단위 테스트에서 내부 단계를 확인하기 위해 노출합니다.
  QRCode._internals = {
    toUtf8Bytes: toUtf8Bytes,
    chooseVersion: chooseVersion,
    totalCodewords: totalCodewords,
    dataCodewords: dataCodewords,
    buildDataCodewords: buildDataCodewords,
    interleave: interleave,
    createMatrix: createMatrix,
    placeData: placeData,
    maskCondition: maskCondition,
    penaltyScore: penaltyScore
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = QRCode;
  else global.QRCode = QRCode;
})(typeof window !== 'undefined' ? window : globalThis);
