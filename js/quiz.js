/*
 * 퀴즈 문제 생성과 채점 로직.
 * 화면과 분리해 두어서 그대로 단위 테스트할 수 있습니다.
 */
(function (global) {
  'use strict';

  var LEVELS = {
    1: { id: 1, name: '한 자리 수', hint: '9까지의 덧셈과 뺄셈' },
    2: { id: 2, name: '십몇까지', hint: '10 모으기, 받아올림 없는 계산' },
    3: { id: 3, name: '받아올림·받아내림', hint: '18까지의 덧셈과 뺄셈' }
  };

  var OPERATIONS = {
    add: { id: 'add', name: '덧셈', symbol: '+' },
    sub: { id: 'sub', name: '뺄셈', symbol: '−' },
    mixed: { id: 'mixed', name: '덧셈과 뺄셈', symbol: '+ −' }
  };

  var QUESTIONS_PER_QUIZ = 10;

  function randomInt(random, min, max) {
    return min + Math.floor(random() * (max - min + 1));
  }

  // 각 난이도/연산에서 나올 수 있는 모든 식을 미리 만들어 두고 그중에서 고릅니다.
  // 이렇게 하면 조건에 맞는 값이 나올 때까지 반복하지 않아도 되고,
  // 한 세트 안에서 같은 문제가 겹치지 않게 하기도 쉽습니다.
  function buildPool(level, operation) {
    var pool = [];
    var a, b;

    function addQuestion(left, right, op) {
      pool.push({ left: left, right: right, op: op, answer: op === 'add' ? left + right : left - right });
    }

    if (operation === 'add' || operation === 'mixed') {
      for (a = 1; a <= 18; a++) {
        for (b = 1; b <= 9; b++) {
          var sum = a + b;
          if (level === 1 && a <= 9 && sum <= 9) addQuestion(a, b, 'add');
          // 2단계는 '10 모으기'와 받아올림이 없는 (십몇) 계산만 다룹니다.
          if (level === 2 && ((a > 9 && (a % 10) + b <= 9) || (a <= 9 && sum === 10))) addQuestion(a, b, 'add');
          if (level === 3 && a <= 9 && sum >= 11 && sum <= 18) addQuestion(a, b, 'add');
        }
      }
    }

    if (operation === 'sub' || operation === 'mixed') {
      for (a = 2; a <= 18; a++) {
        for (b = 1; b <= 9; b++) {
          var diff = a - b;
          if (diff < 0) continue;
          if (level === 1 && a <= 9) addQuestion(a, b, 'sub');
          // 2단계는 '10 가르기'와 받아내림이 없는 (십몇) 계산만 다룹니다.
          if (level === 2 && (a === 10 || (a > 10 && (a % 10) >= b))) addQuestion(a, b, 'sub');
          if (level === 3 && a >= 11 && (a % 10) < b && diff >= 1) addQuestion(a, b, 'sub');
        }
      }
    }

    return pool;
  }

  function pickQuestions(pool, count, random) {
    var remaining = pool.slice();
    var picked = [];
    while (picked.length < count && remaining.length > 0) {
      var index = randomInt(random, 0, remaining.length - 1);
      picked.push(remaining.splice(index, 1)[0]);
    }
    // 후보가 문제 수보다 적으면 처음부터 다시 채웁니다(1단계처럼 식이 적을 때).
    while (picked.length < count && pool.length > 0) {
      picked.push(pool[randomInt(random, 0, pool.length - 1)]);
    }
    return picked;
  }

  function createQuiz(options) {
    var opts = options || {};
    var level = LEVELS[opts.level] ? Number(opts.level) : 1;
    var operation = OPERATIONS[opts.operation] ? opts.operation : 'add';
    var count = opts.count || QUESTIONS_PER_QUIZ;
    var random = opts.random || Math.random;

    var pool = buildPool(level, operation);
    var questions = pickQuestions(pool, count, random).map(function (q, index) {
      return {
        index: index,
        left: q.left,
        right: q.right,
        op: q.op,
        symbol: OPERATIONS[q.op].symbol,
        answer: q.answer,
        text: q.left + ' ' + OPERATIONS[q.op].symbol + ' ' + q.right + ' = ?'
      };
    });

    return {
      level: level,
      operation: operation,
      questions: questions,
      answers: [],
      current: 0,
      correctCount: 0,
      startedAt: null
    };
  }

  function isCorrect(question, input) {
    if (input === '' || input == null) return false;
    return Number(input) === question.answer;
  }

  // 답을 기록하고 다음 문제로 넘어갈 수 있는지 알려 줍니다.
  function submitAnswer(quiz, input) {
    var question = quiz.questions[quiz.current];
    var correct = isCorrect(question, input);
    quiz.answers.push({ question: question, input: String(input), correct: correct });
    if (correct) quiz.correctCount++;
    quiz.current++;
    return { correct: correct, question: question, finished: quiz.current >= quiz.questions.length };
  }

  function summarize(quiz) {
    var total = quiz.questions.length;
    var correct = quiz.correctCount;
    var ratio = total === 0 ? 0 : correct / total;
    var stars = ratio === 1 ? 3 : ratio >= 0.8 ? 2 : ratio >= 0.5 ? 1 : 0;
    var message;
    if (ratio === 1) message = '만점이에요! 정말 잘했어요!';
    else if (ratio >= 0.8) message = '아주 잘했어요! 조금만 더!';
    else if (ratio >= 0.5) message = '좋아요! 다시 한 번 해 볼까요?';
    else message = '괜찮아요. 천천히 다시 풀어 봐요!';

    return {
      total: total,
      correct: correct,
      wrong: quiz.answers.filter(function (a) { return !a.correct; }),
      stars: stars,
      message: message
    };
  }

  var Quiz = {
    LEVELS: LEVELS,
    OPERATIONS: OPERATIONS,
    QUESTIONS_PER_QUIZ: QUESTIONS_PER_QUIZ,
    buildPool: buildPool,
    createQuiz: createQuiz,
    isCorrect: isCorrect,
    submitAnswer: submitAnswer,
    summarize: summarize
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Quiz;
  else global.Quiz = Quiz;
})(typeof window !== 'undefined' ? window : globalThis);
