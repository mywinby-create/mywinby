/* 화면 조작과 상태 관리 */
(function () {
  'use strict';

  var STORAGE_KEY = 'mywinby-quiz';
  var FEEDBACK_DELAY = 1100; // 정답/오답을 보여 주는 시간(ms)

  var state = {
    operation: 'add',
    level: 1,
    quiz: null,
    input: '',
    locked: false,
    soundOn: true,
    shareUrl: '',
    timer: null
  };

  var el = {};
  ['screen-home', 'screen-quiz', 'screen-result', 'operation-group', 'level-group',
   'start-button', 'best-record', 'qr-box', 'qr-url', 'qr-edit', 'qr-input', 'qr-error',
   'copy-url-button', 'edit-url-button', 'reset-url-button', 'sound-toggle',
   'progress-now', 'progress-total', 'score-now', 'progress-fill', 'question-box',
   'q-left', 'q-symbol', 'q-right', 'answer-display', 'feedback', 'keypad',
   'clear-key', 'submit-key', 'quit-button', 'result-stars', 'result-correct',
   'result-message', 'result-best', 'review-card', 'review-list', 'retry-button', 'home-button'
  ].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  // ---------- 저장소 ----------
  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveStore(patch) {
    try {
      var store = loadStore();
      Object.keys(patch).forEach(function (k) { store[k] = patch[k]; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      /* 사생활 보호 모드 등에서 저장이 막혀도 퀴즈는 계속 풀 수 있어야 합니다. */
    }
  }

  function bestKey() {
    return state.operation + '-' + state.level;
  }

  function getBest() {
    var best = loadStore().best || {};
    return best[bestKey()] || 0;
  }

  function updateBest(correct) {
    var store = loadStore();
    var best = store.best || {};
    if (correct > (best[bestKey()] || 0)) {
      best[bestKey()] = correct;
      saveStore({ best: best });
      return true;
    }
    return false;
  }

  function renderBest() {
    var best = getBest();
    if (best > 0) {
      el['best-record'].textContent = '이 단계 최고 기록: ' + best + ' / ' + Quiz.QUESTIONS_PER_QUIZ + '문제';
      el['best-record'].hidden = false;
    } else {
      el['best-record'].hidden = true;
    }
  }

  // ---------- 소리 ----------
  var audioContext = null;

  function beep(frequencies, duration) {
    if (!state.soundOn) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioContext) audioContext = new Ctx();
      if (audioContext.state === 'suspended') audioContext.resume();
      frequencies.forEach(function (freq, i) {
        var osc = audioContext.createOscillator();
        var gain = audioContext.createGain();
        var start = audioContext.currentTime + i * duration;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain).connect(audioContext.destination);
        osc.start(start);
        osc.stop(start + duration);
      });
    } catch (e) {
      /* 소리를 낼 수 없어도 무시합니다. */
    }
  }

  // ---------- 화면 전환 ----------
  function showScreen(name) {
    ['home', 'quiz', 'result'].forEach(function (key) {
      el['screen-' + key].hidden = key !== name;
    });
    window.scrollTo(0, 0);
  }

  // ---------- 선택 버튼 ----------
  function setupChoiceGroup(group, attribute, onPick) {
    group.addEventListener('click', function (event) {
      var button = event.target.closest('[' + attribute + ']');
      if (!button) return;
      Array.prototype.forEach.call(group.querySelectorAll('[role="radio"]'), function (b) {
        b.setAttribute('aria-checked', String(b === button));
      });
      onPick(button.getAttribute(attribute));
    });
  }

  // ---------- 퀴즈 진행 ----------
  function startQuiz() {
    state.quiz = Quiz.createQuiz({ operation: state.operation, level: state.level });
    state.input = '';
    state.locked = false;
    el['progress-total'].textContent = String(state.quiz.questions.length);
    el.feedback.textContent = '';
    el.feedback.className = 'feedback';
    showScreen('quiz');
    renderQuestion();
  }

  function renderQuestion() {
    var quiz = state.quiz;
    var question = quiz.questions[quiz.current];
    el['q-left'].textContent = String(question.left);
    el['q-symbol'].textContent = question.symbol;
    el['q-right'].textContent = String(question.right);
    el['progress-now'].textContent = String(quiz.current + 1);
    el['score-now'].textContent = String(quiz.correctCount);
    el['progress-fill'].style.width = (quiz.current / quiz.questions.length) * 100 + '%';
    el['question-box'].className = 'question';
    renderInput();
    setKeypadEnabled(true);
  }

  function renderInput() {
    var empty = state.input === '';
    el['answer-display'].textContent = empty ? '?' : state.input;
    el['answer-display'].classList.toggle('question__answer--empty', empty);
  }

  function setKeypadEnabled(enabled) {
    Array.prototype.forEach.call(el.keypad.querySelectorAll('button'), function (button) {
      button.disabled = !enabled;
    });
  }

  function pressDigit(digit) {
    if (state.locked) return;
    if (state.input.length >= 2) return;
    if (state.input === '' && digit === '0') {
      state.input = '0';
    } else {
      state.input = (state.input === '0' ? '' : state.input) + digit;
    }
    renderInput();
  }

  function clearInput() {
    if (state.locked) return;
    state.input = state.input.slice(0, -1);
    renderInput();
  }

  function submit() {
    if (state.locked || state.input === '') return;
    state.locked = true;
    setKeypadEnabled(false);

    var result = Quiz.submitAnswer(state.quiz, state.input);
    el['score-now'].textContent = String(state.quiz.correctCount);
    el['question-box'].className = 'question ' + (result.correct ? 'question--correct pop' : 'question--wrong');
    el.feedback.className = 'feedback ' + (result.correct ? 'feedback--correct' : 'feedback--wrong');
    el.feedback.textContent = result.correct
      ? '정답이에요! 잘했어요 🎉'
      : '아쉬워요. 정답은 ' + result.question.answer + '이에요.';
    beep(result.correct ? [660, 880] : [300], result.correct ? 0.12 : 0.25);

    state.timer = window.setTimeout(function () {
      state.locked = false;
      state.input = '';
      el.feedback.textContent = '';
      el.feedback.className = 'feedback';
      if (result.finished) showResult();
      else renderQuestion();
    }, FEEDBACK_DELAY);
  }

  function showResult() {
    var summary = Quiz.summarize(state.quiz);
    el['result-correct'].textContent = String(summary.correct);
    el['result-message'].textContent = summary.message;
    el['result-stars'].textContent = '★★★'.slice(0, summary.stars) + '☆☆☆'.slice(0, 3 - summary.stars);

    var isNewBest = updateBest(summary.correct);
    el['result-best'].hidden = !isNewBest;
    if (isNewBest) el['result-best'].textContent = '새로운 최고 기록이에요! 🏆';

    if (summary.wrong.length > 0) {
      el['review-list'].innerHTML = '';
      summary.wrong.forEach(function (answer) {
        var item = document.createElement('li');
        var question = document.createElement('span');
        question.textContent = answer.question.left + ' ' + answer.question.symbol + ' ' + answer.question.right + ' =';
        var values = document.createElement('span');
        var mine = document.createElement('span');
        mine.className = 'review__mine';
        mine.textContent = '내 답 ' + answer.input + ' · ';
        var right = document.createElement('span');
        right.className = 'review__right';
        right.textContent = '정답 ' + answer.question.answer;
        values.appendChild(mine);
        values.appendChild(right);
        item.appendChild(question);
        item.appendChild(values);
        el['review-list'].appendChild(item);
      });
      el['review-card'].hidden = false;
    } else {
      el['review-card'].hidden = true;
    }

    beep(summary.stars >= 2 ? [523, 659, 784] : [523, 494], 0.15);
    showScreen('result');
  }

  function quitQuiz() {
    window.clearTimeout(state.timer);
    state.locked = false;
    state.input = '';
    renderBest();
    showScreen('home');
  }

  // ---------- QR 코드 ----------
  function defaultShareUrl() {
    var url = window.location.href.split('#')[0];
    return url;
  }

  function renderQr(url) {
    state.shareUrl = url;
    el['qr-url'].textContent = url;
    try {
      var modules = QRCode.generate(url, 'M');
      el['qr-box'].innerHTML = QRCode.toSvg(modules, { label: '퀴즈 주소 QR 코드', dark: '#35302a' });
      el['qr-error'].hidden = true;
    } catch (e) {
      el['qr-box'].innerHTML = '';
      el['qr-error'].textContent = 'QR 코드를 만들 수 없어요: ' + e.message;
      el['qr-error'].hidden = false;
    }
  }

  function setShareUrl(url) {
    renderQr(url);
    saveStore({ shareUrl: url });
  }

  function copyShareUrl() {
    var done = function () {
      el['copy-url-button'].textContent = '복사했어요!';
      window.setTimeout(function () { el['copy-url-button'].textContent = '주소 복사'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(state.shareUrl).then(done, function () { fallbackCopy(done); });
    } else {
      fallbackCopy(done);
    }
  }

  function fallbackCopy(done) {
    var area = document.createElement('textarea');
    area.value = state.shareUrl;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* 무시 */ }
    document.body.removeChild(area);
  }

  // ---------- 이벤트 연결 ----------
  function bindEvents() {
    setupChoiceGroup(el['operation-group'], 'data-operation', function (value) {
      state.operation = value;
      renderBest();
    });
    setupChoiceGroup(el['level-group'], 'data-level', function (value) {
      state.level = Number(value);
      renderBest();
    });

    el['start-button'].addEventListener('click', startQuiz);
    el['retry-button'].addEventListener('click', startQuiz);
    el['home-button'].addEventListener('click', quitQuiz);
    el['quit-button'].addEventListener('click', quitQuiz);

    el.keypad.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.digit) pressDigit(button.dataset.digit);
      else if (button === el['clear-key']) clearInput();
      else if (button === el['submit-key']) submit();
    });

    document.addEventListener('keydown', function (event) {
      if (el['screen-quiz'].hidden) return;
      if (event.key >= '0' && event.key <= '9') pressDigit(event.key);
      else if (event.key === 'Backspace') clearInput();
      else if (event.key === 'Enter') submit();
      else return;
      event.preventDefault();
    });

    el['copy-url-button'].addEventListener('click', copyShareUrl);

    el['edit-url-button'].addEventListener('click', function () {
      var open = el['qr-edit'].hidden;
      el['qr-edit'].hidden = !open;
      el['edit-url-button'].setAttribute('aria-expanded', String(open));
      if (open) {
        el['qr-input'].value = state.shareUrl;
        el['qr-input'].focus();
      }
    });

    el['qr-edit'].addEventListener('submit', function (event) {
      event.preventDefault();
      var value = el['qr-input'].value.trim();
      if (!value) {
        el['qr-error'].textContent = '주소를 입력해 주세요.';
        el['qr-error'].hidden = false;
        return;
      }
      setShareUrl(value);
    });

    el['reset-url-button'].addEventListener('click', function () {
      el['qr-input'].value = defaultShareUrl();
      setShareUrl(defaultShareUrl());
    });

    el['sound-toggle'].addEventListener('click', function () {
      state.soundOn = !state.soundOn;
      el['sound-toggle'].textContent = state.soundOn ? '🔊 소리 켬' : '🔇 소리 끔';
      el['sound-toggle'].setAttribute('aria-pressed', String(state.soundOn));
      saveStore({ soundOn: state.soundOn });
      if (state.soundOn) beep([660], 0.1);
    });
  }

  function init() {
    var store = loadStore();
    if (typeof store.soundOn === 'boolean') {
      state.soundOn = store.soundOn;
      el['sound-toggle'].textContent = state.soundOn ? '🔊 소리 켬' : '🔇 소리 끔';
      el['sound-toggle'].setAttribute('aria-pressed', String(state.soundOn));
    }
    bindEvents();
    renderBest();
    renderQr(store.shareUrl || defaultShareUrl());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
