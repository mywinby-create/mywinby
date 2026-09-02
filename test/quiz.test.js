const test = require('node:test');
const assert = require('node:assert');
const Quiz = require('../js/quiz.js');

// 재현 가능한 난수 (테스트가 매번 같은 결과를 내도록)
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('1단계는 9를 넘지 않는 한 자리 수 계산만 낸다', () => {
  for (const q of Quiz.buildPool(1, 'mixed')) {
    assert.ok(q.left <= 9 && q.right <= 9, `피연산자가 9를 넘음: ${q.left} ${q.op} ${q.right}`);
    assert.ok(q.answer >= 0 && q.answer <= 9, `답이 0~9를 벗어남: ${q.answer}`);
  }
});

test('2단계는 받아올림·받아내림이 없다', () => {
  for (const q of Quiz.buildPool(2, 'add')) {
    const carry = q.left <= 9 ? q.answer !== 10 : (q.left % 10) + q.right > 9;
    assert.ok(!carry, `받아올림이 생김: ${q.left} + ${q.right}`);
  }
  for (const q of Quiz.buildPool(2, 'sub')) {
    const borrow = q.left !== 10 && (q.left % 10) < q.right;
    assert.ok(!borrow, `받아내림이 생김: ${q.left} - ${q.right}`);
  }
});

test('3단계는 받아올림·받아내림이 반드시 있고 18을 넘지 않는다', () => {
  for (const q of Quiz.buildPool(3, 'add')) {
    assert.ok(q.answer >= 11 && q.answer <= 18, `합이 범위를 벗어남: ${q.answer}`);
    assert.ok(q.left + q.right > 10, '받아올림이 없음');
  }
  for (const q of Quiz.buildPool(3, 'sub')) {
    assert.ok(q.left >= 11 && q.left <= 18, `피감수가 범위를 벗어남: ${q.left}`);
    assert.ok((q.left % 10) < q.right, '받아내림이 없음');
    assert.ok(q.answer >= 1 && q.answer <= 9, `차가 범위를 벗어남: ${q.answer}`);
  }
});

test('모든 난이도와 연산에서 답은 항상 0 이상이다', () => {
  for (const level of [1, 2, 3]) {
    for (const op of ['add', 'sub', 'mixed']) {
      const pool = Quiz.buildPool(level, op);
      assert.ok(pool.length >= 10, `문제 후보가 너무 적음: ${level}/${op} = ${pool.length}`);
      for (const q of pool) {
        const expected = q.op === 'add' ? q.left + q.right : q.left - q.right;
        assert.strictEqual(q.answer, expected);
        assert.ok(q.answer >= 0);
      }
    }
  }
});

test('createQuiz는 요청한 개수만큼, 겹치지 않게 문제를 만든다', () => {
  const quiz = Quiz.createQuiz({ level: 3, operation: 'mixed', count: 10, random: seededRandom(42) });
  assert.strictEqual(quiz.questions.length, 10);
  const seen = new Set(quiz.questions.map((q) => `${q.left}${q.op}${q.right}`));
  assert.strictEqual(seen.size, 10, '같은 문제가 두 번 나왔음');
  for (const q of quiz.questions) {
    assert.match(q.text, /^\d+ [+−] \d+ = \?$/);
  }
});

test('알 수 없는 난이도와 연산은 기본값으로 되돌린다', () => {
  const quiz = Quiz.createQuiz({ level: 99, operation: 'pow', random: seededRandom(1) });
  assert.strictEqual(quiz.level, 1);
  assert.strictEqual(quiz.operation, 'add');
  assert.strictEqual(quiz.questions.length, Quiz.QUESTIONS_PER_QUIZ);
});

test('채점은 숫자 값으로 비교하고 빈 답은 오답 처리한다', () => {
  const question = { answer: 7 };
  assert.strictEqual(Quiz.isCorrect(question, '7'), true);
  assert.strictEqual(Quiz.isCorrect(question, 7), true);
  assert.strictEqual(Quiz.isCorrect(question, '07'), true);
  assert.strictEqual(Quiz.isCorrect(question, '8'), false);
  assert.strictEqual(Quiz.isCorrect(question, ''), false);
  assert.strictEqual(Quiz.isCorrect(question, null), false);
});

test('submitAnswer는 진행 상태와 점수를 갱신한다', () => {
  const quiz = Quiz.createQuiz({ level: 1, operation: 'add', count: 3, random: seededRandom(7) });
  const first = Quiz.submitAnswer(quiz, String(quiz.questions[0].answer));
  assert.strictEqual(first.correct, true);
  assert.strictEqual(first.finished, false);
  assert.strictEqual(quiz.correctCount, 1);

  Quiz.submitAnswer(quiz, '999');
  assert.strictEqual(quiz.correctCount, 1);

  const last = Quiz.submitAnswer(quiz, String(quiz.questions[2].answer));
  assert.strictEqual(last.finished, true);
  assert.strictEqual(quiz.answers.length, 3);
});

test('summarize는 별 개수와 틀린 문제를 정리한다', () => {
  function play(correctCount, total) {
    const quiz = Quiz.createQuiz({ level: 1, operation: 'add', count: total, random: seededRandom(3) });
    quiz.questions.forEach((q, i) => Quiz.submitAnswer(quiz, i < correctCount ? String(q.answer) : '99'));
    return Quiz.summarize(quiz);
  }
  assert.strictEqual(play(10, 10).stars, 3);
  assert.strictEqual(play(8, 10).stars, 2);
  assert.strictEqual(play(5, 10).stars, 1);
  assert.strictEqual(play(4, 10).stars, 0);

  const summary = play(7, 10);
  assert.strictEqual(summary.correct, 7);
  assert.strictEqual(summary.wrong.length, 3);
  assert.ok(summary.message.length > 0);
});
