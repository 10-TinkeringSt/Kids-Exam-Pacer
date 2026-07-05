(function () {
  var els = {
    setup: document.getElementById('screen-setup'),
    dial: document.getElementById('screen-dial'),
    minutesInput: document.getElementById('input-minutes'),
    questionsInput: document.getElementById('input-questions'),
    btnOk: document.getElementById('btn-ok'),
    dialWrap: document.getElementById('dial-wrap'),
    overlayGo: document.getElementById('overlay-go'),
    btnGo: document.getElementById('btn-go'),
    btnStop: document.getElementById('btn-stop'),
    btnReset: document.getElementById('btn-reset'),
    dialTitle: document.getElementById('dial-title'),
    dialSubtitle: document.getElementById('dial-subtitle'),
    dialPie: document.getElementById('dial-pie'),
    ticksMinor: document.getElementById('ticks-minor'),
    ticksMajor: document.getElementById('ticks-major'),
    tickLabels: document.getElementById('tick-labels'),
    readoutTime: document.getElementById('readout-time'),
    readoutSub: document.getElementById('readout-sub'),
    infoRow: document.getElementById('info-row'),
    infoTarget: document.getElementById('info-target'),
    infoLength: document.getElementById('info-length'),
    doneBadge: document.getElementById('done-badge'),
    wakeNote: document.getElementById('wake-note')
  };

  var state = {
    totalSeconds: 0,
    totalQuestions: 0,
    remainingSeconds: 0,
    running: false,
    timerHandle: null,
    endTime: null,
    wakeLock: null
  };

  var R = 90;

  function showScreen(name) {
    els.setup.classList.toggle('active', name === 'setup');
    els.dial.classList.toggle('active', name === 'dial');
  }

  function polar(r, fracFromTop) {
    var angle = fracFromTop * 2 * Math.PI - Math.PI / 2;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  }

  function buildTicks(totalQuestions) {
    els.ticksMinor.innerHTML = '';
    els.ticksMajor.innerHTML = '';
    els.tickLabels.innerHTML = '';

    var labelCount = 8;
    var drawMinor = totalQuestions <= 60;

    if (drawMinor) {
      for (var q = 1; q <= totalQuestions; q++) {
        var f = q / totalQuestions;
        if (Math.round(f * labelCount) === f * labelCount) continue;
        var p1 = polar(R, f), p2 = polar(R + 4, f);
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
        line.setAttribute('x2', p2.x); line.setAttribute('y2', p2.y);
        line.setAttribute('class', 'tick-minor');
        els.ticksMinor.appendChild(line);
      }
    }

    for (var k = 1; k <= labelCount; k++) {
      var f2 = k / labelCount;
      var qNum = Math.max(1, Math.min(totalQuestions, Math.round(f2 * totalQuestions)));

      var p1b = polar(R, f2), p2b = polar(R + 10, f2);
      var line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line2.setAttribute('x1', p1b.x); line2.setAttribute('y1', p1b.y);
      line2.setAttribute('x2', p2b.x); line2.setAttribute('y2', p2b.y);
      line2.setAttribute('class', 'tick-major');
      els.ticksMajor.appendChild(line2);

      var lp = polar(R + 34, f2);
      var anchor = 'middle';
      if (lp.x > 10) anchor = 'start';
      else if (lp.x < -10) anchor = 'end';
      var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', lp.x);
      text.setAttribute('y', lp.y + 4);
      text.setAttribute('text-anchor', anchor);
      text.setAttribute('class', 'tick-label');
      text.textContent = 'Q-' + qNum;
      els.tickLabels.appendChild(text);
    }
  }

  function updatePie(remainingFrac) {
    remainingFrac = Math.max(0, Math.min(1, remainingFrac));
    if (remainingFrac <= 0.0001) {
      els.dialPie.setAttribute('d', '');
      return;
    }
    if (remainingFrac >= 0.9999) {
      els.dialPie.setAttribute('d',
        'M 0,0 L 0,-' + R + ' A ' + R + ',' + R + ' 0 1 1 -0.01,-' + R + ' Z');
      return;
    }
    var start = polar(R, 1 - remainingFrac);
    var largeArc = remainingFrac > 0.5 ? 1 : 0;
    var d = 'M 0,0 L ' + start.x + ',' + start.y + ' A ' + R + ',' + R + ' 0 ' + largeArc + ' 1 0,-' + R + ' Z';
    els.dialPie.setAttribute('d', d);
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function tick() {
    var now = Date.now();
    var remaining = (state.endTime - now) / 1000;
    if (remaining <= 0) {
      remaining = 0;
      finishTimer();
    }
    state.remainingSeconds = remaining;
    var frac = remaining / state.totalSeconds;
    updatePie(frac);
    els.readoutTime.textContent = formatTime(remaining);

    var elapsedFrac = 1 - frac;
    var targetQ = Math.max(1, Math.min(state.totalQuestions, Math.round(elapsedFrac * state.totalQuestions)));
    els.infoTarget.textContent = 'Question ' + targetQ;
  }

  function startTimer() {
    els.overlayGo.style.display = 'none';
    els.dialWrap.classList.remove('greyed');
    els.dialSubtitle.textContent = 'Timer running — glance, don\'t stare';
    els.btnStop.style.visibility = 'visible';
    els.infoRow.style.visibility = 'visible';
    state.running = true;
    state.endTime = Date.now() + state.remainingSeconds * 1000;
    tick();
    state.timerHandle = setInterval(tick, 250);
    requestWakeLock();
  }

  function finishTimer() {
    clearInterval(state.timerHandle);
    state.running = false;
    els.readoutTime.textContent = '00:00';
    els.btnStop.style.visibility = 'hidden';
    els.btnReset.style.display = 'inline-block';
    els.doneBadge.style.display = 'flex';
    els.dialSubtitle.textContent = 'Nice work';
    releaseWakeLock();
    playBeep();
  }

  function stopTimer() {
    clearInterval(state.timerHandle);
    state.running = false;
    releaseWakeLock();
    resetToSetup();
  }

  function resetToSetup() {
    els.doneBadge.style.display = 'none';
    els.btnReset.style.display = 'none';
    els.btnStop.style.visibility = 'hidden';
    els.infoRow.style.visibility = 'hidden';
    els.overlayGo.style.display = 'flex';
    els.dialWrap.classList.add('greyed');
    showScreen('setup');
  }

  function playBeep() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var times = [0, 0.35, 0.7];
      times.forEach(function (t) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.3);
      });
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    } catch (e) { /* audio not available, silently skip */ }
  }

  function requestWakeLock() {
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(function (lock) {
        state.wakeLock = lock;
        els.wakeNote.style.display = 'none';
      }).catch(function () {
        els.wakeNote.style.display = 'block';
      });
    } else {
      els.wakeNote.style.display = 'block';
    }
  }

  function releaseWakeLock() {
    if (state.wakeLock) {
      state.wakeLock.release().catch(function () {});
      state.wakeLock = null;
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state.running) {
      requestWakeLock();
    }
  });

  els.btnOk.addEventListener('click', function () {
    var minutes = parseInt(els.minutesInput.value, 10) || 1;
    var questions = parseInt(els.questionsInput.value, 10) || 1;
    state.totalSeconds = minutes * 60;
    state.remainingSeconds = state.totalSeconds;
    state.totalQuestions = questions;

    els.dialTitle.textContent = 'Timer';
    els.dialSubtitle.textContent = 'Tap go when you\'re ready to start';
    els.infoLength.textContent = minutes + ' min, ' + questions + ' questions';
    els.readoutTime.textContent = formatTime(state.totalSeconds);
    els.readoutSub.textContent = 'left of ' + formatTime(state.totalSeconds);
    els.infoTarget.textContent = 'Question 1';

    buildTicks(questions);
    updatePie(1);

    showScreen('dial');
  });

  els.btnGo.addEventListener('click', startTimer);
  els.btnStop.addEventListener('click', stopTimer);
  els.btnReset.addEventListener('click', resetToSetup);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('service-worker.js').catch(function () {});
    });
  }
})();
