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
    dialActionBtn: document.getElementById('btn-stop'),
    dialActionPath: document.getElementById('stop-sector-path'),
    dialActionLabel: document.getElementById('stop-sector-label'),
    dialTitle: document.getElementById('dial-title'),
    dialSubtitle: document.getElementById('dial-subtitle'),
    segments: document.getElementById('segments'),
    ticksMinor: document.getElementById('ticks-minor'),
    ticksMajor: document.getElementById('ticks-major'),
    tickLabels: document.getElementById('tick-labels'),
    readoutMin: document.getElementById('readout-min'),
    readoutSec: document.getElementById('readout-sec'),
    readoutSub: document.getElementById('readout-sub'),
    doneText: document.getElementById('done-text'),
    infoRow: document.getElementById('info-row'),
    infoTarget: document.getElementById('info-target'),
    infoLength: document.getElementById('info-length'),
    wakeNote: document.getElementById('wake-note')
  };

  var state = {
    totalSeconds: 0,
    totalQuestions: 0,
    remainingSeconds: 0,
    running: false,
    finished: false,
    timerHandle: null,
    endTime: null,
    wakeLock: null
  };

  var ARC_START = 225;
  var ARC_SWEEP = 270;
  var SEG_INNER = 90;
  var SEG_OUTER = 108;
  var SEGMENT_COUNT = 40;
  var SEGMENT_GAP = 0.28; // fraction of each slot left empty between segments

  var GAP_START = 135;   // bottom gap: from the arc's t=1 end (135deg)...
  var GAP_SWEEP = 90;    // ...through the bottom (180deg) to the t=0 end (225deg)
  var STOP_INNER = 124;  // just outside where the minor question ticks end
  var STOP_OUTER = 190;  // just inside the outer dial edge (edge is at r=200)
  var STOP_G1 = 0.16;    // angular inset from each side of the gap, clear of Q-1/Q-20
  var STOP_G2 = 0.84;

  var GREEN = '#00e676';
  var RED = '#ff3b30';

  function showScreen(name) {
    els.setup.classList.toggle('active', name === 'setup');
    els.dial.classList.toggle('active', name === 'dial');
  }

  // t=0 -> lower-left start of the gauge, t=1 -> lower-right end, sweeping
  // clockwise through the top (270 degrees total, gap along the bottom).
  function arcPoint(r, t) {
    var clockDeg = ARC_START + ARC_SWEEP * t;
    var angle = clockDeg * Math.PI / 180 - Math.PI / 2;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  }

  function gapPoint(r, g) {
    var clockDeg = GAP_START + GAP_SWEEP * g;
    var angle = clockDeg * Math.PI / 180 - Math.PI / 2;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  }

  function sectorPath(ri, ro, g1, g2) {
    var po1 = gapPoint(ro, g1), po2 = gapPoint(ro, g2);
    var pi1 = gapPoint(ri, g1), pi2 = gapPoint(ri, g2);
    return 'M ' + po1.x + ',' + po1.y +
      ' A ' + ro + ',' + ro + ' 0 0 1 ' + po2.x + ',' + po2.y +
      ' L ' + pi2.x + ',' + pi2.y +
      ' A ' + ri + ',' + ri + ' 0 0 0 ' + pi1.x + ',' + pi1.y + ' Z';
  }

  // True annular-sector wedge (both inner and outer edges are real circular
  // arcs) rather than a thick chord, so the outer edge doesn't facet/flatten.
  function segmentPath(ri, ro, t1, t2) {
    var po1 = arcPoint(ro, t1), po2 = arcPoint(ro, t2);
    var pi1 = arcPoint(ri, t1), pi2 = arcPoint(ri, t2);
    return 'M ' + po1.x + ',' + po1.y +
      ' A ' + ro + ',' + ro + ' 0 0 1 ' + po2.x + ',' + po2.y +
      ' L ' + pi2.x + ',' + pi2.y +
      ' A ' + ri + ',' + ri + ' 0 0 0 ' + pi1.x + ',' + pi1.y + ' Z';
  }

  function buildTicks(totalQuestions) {
    els.ticksMinor.innerHTML = '';
    els.ticksMajor.innerHTML = '';
    els.tickLabels.innerHTML = '';

    var labelCount = 6;
    var drawMinor = totalQuestions <= 60;

    if (drawMinor) {
      for (var q = 1; q <= totalQuestions; q++) {
        var f = q / totalQuestions;
        var nearestLabel = Math.round(f * labelCount);
        if (Math.abs(f * labelCount - nearestLabel) < 1e-6) continue;
        var p1 = arcPoint(SEG_OUTER + 10, f), p2 = arcPoint(SEG_OUTER + 14, f);
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
        line.setAttribute('x2', p2.x); line.setAttribute('y2', p2.y);
        line.setAttribute('class', 'tick-minor');
        els.ticksMinor.appendChild(line);
      }
    }

    for (var k = 0; k <= labelCount; k++) {
      var f2 = k / labelCount;
      var qNum = Math.max(1, Math.min(totalQuestions, Math.round(f2 * totalQuestions)));

      var p1b = arcPoint(SEG_OUTER + 10, f2), p2b = arcPoint(SEG_OUTER + 26, f2);
      var line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line2.setAttribute('x1', p1b.x); line2.setAttribute('y1', p1b.y);
      line2.setAttribute('x2', p2b.x); line2.setAttribute('y2', p2b.y);
      line2.setAttribute('class', 'tick-major');
      els.ticksMajor.appendChild(line2);

      var lp = arcPoint(SEG_OUTER + 50, f2);
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

  function buildSegments() {
    els.segments.innerHTML = '';
    for (var i = 0; i < SEGMENT_COUNT; i++) {
      var t1 = i / SEGMENT_COUNT + SEGMENT_GAP / SEGMENT_COUNT / 2;
      var t2 = (i + 1) / SEGMENT_COUNT - SEGMENT_GAP / SEGMENT_COUNT / 2;
      var mid = (i + 0.5) / SEGMENT_COUNT;
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', segmentPath(SEG_INNER, SEG_OUTER, t1, t2));
      path.setAttribute('class', 'dial-segment');
      path.setAttribute('data-mid', mid);
      path.setAttribute('fill', GREEN);
      els.segments.appendChild(path);
    }
  }

  function updateSegments(remainingFrac) {
    remainingFrac = Math.max(0, Math.min(1, remainingFrac));
    var elapsed = 1 - remainingFrac;
    var segs = els.segments.children;
    for (var i = 0; i < segs.length; i++) {
      var mid = parseFloat(segs[i].getAttribute('data-mid'));
      segs[i].setAttribute('fill', mid <= elapsed ? RED : GREEN);
    }
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function setReadout(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    els.readoutMin.textContent = (m < 10 ? '0' : '') + m;
    els.readoutSec.textContent = ':' + (s < 10 ? '0' : '') + s;
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
    updateSegments(frac);
    setReadout(remaining);

    var elapsedFrac = 1 - frac;
    var targetQ = Math.max(1, Math.min(state.totalQuestions, Math.round(elapsedFrac * state.totalQuestions)));
    els.infoTarget.textContent = 'Question ' + targetQ;
  }

  function setDialAction(mode) {
    // mode: 'stop' or 'reset'
    els.dialActionLabel.textContent = mode === 'stop' ? 'Stop' : 'New timer';
    els.dialActionBtn.setAttribute('aria-label', mode === 'stop' ? 'Stop' : 'New timer');
    els.dialActionBtn.classList.toggle('mode-reset', mode === 'reset');
  }

  function onDialActionClick() {
    if (state.finished) {
      resetToSetup();
    } else {
      stopTimer();
    }
  }

  function startTimer() {
    els.overlayGo.style.display = 'none';
    els.dialWrap.classList.remove('greyed');
    els.dialSubtitle.textContent = 'Timer running — glance, don\'t stare';
    setDialAction('stop');
    els.dialActionBtn.style.visibility = 'visible';
    els.infoRow.style.visibility = 'visible';
    state.running = true;
    state.finished = false;
    state.endTime = Date.now() + state.remainingSeconds * 1000;
    tick();
    state.timerHandle = setInterval(tick, 250);
    requestWakeLock();
  }

  function finishTimer() {
    clearInterval(state.timerHandle);
    state.running = false;
    state.finished = true;
    setReadout(0);
    setDialAction('reset');
    els.doneText.style.visibility = 'visible';
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
    state.finished = false;
    els.doneText.style.visibility = 'hidden';
    els.dialActionBtn.style.visibility = 'hidden';
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
    setReadout(state.totalSeconds);
    els.readoutSub.textContent = 'left of ' + formatTime(state.totalSeconds);
    els.infoTarget.textContent = 'Question 1';

    buildTicks(questions);
    buildSegments();
    updateSegments(1);

    showScreen('dial');
  });

  els.btnGo.addEventListener('click', startTimer);
  els.dialActionBtn.addEventListener('click', onDialActionClick);
  els.dialActionBtn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onDialActionClick();
    }
  });

  els.dialActionPath.setAttribute('d', sectorPath(STOP_INNER, STOP_OUTER, STOP_G1, STOP_G2));
  var stopLabelPt = gapPoint((STOP_INNER + STOP_OUTER) / 2, (STOP_G1 + STOP_G2) / 2);
  els.dialActionLabel.setAttribute('x', stopLabelPt.x);
  els.dialActionLabel.setAttribute('y', stopLabelPt.y + 6);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('service-worker.js').catch(function () {});
    });
  }
})();
