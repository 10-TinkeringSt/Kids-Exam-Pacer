(function () {
  var els = {
    setup: document.getElementById('screen-setup'),
    dial: document.getElementById('screen-dial'),

    modeToggle: document.getElementById('mode-toggle'),
    btnModeSingle: document.getElementById('btn-mode-single'),
    btnModeMulti: document.getElementById('btn-mode-multi'),
    spmPanel: document.getElementById('spm-panel'),
    mpmPanel: document.getElementById('mpm-panel'),

    minutesInput: document.getElementById('input-minutes'),
    questionsInput: document.getElementById('input-questions'),
    startInput: document.getElementById('input-start'),
    endInput: document.getElementById('input-end'),
    spmOrderToggle: document.getElementById('spm-order-toggle'),
    btnOk: document.getElementById('btn-ok'),

    minutesInputMpm: document.getElementById('input-minutes-mpm'),
    papersList: document.getElementById('papers-list'),
    btnAddPaper: document.getElementById('btn-add-paper'),
    btnOkMpm: document.getElementById('btn-ok-mpm'),

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
    infoCardLength: document.getElementById('info-card-length'),
    infoLength: document.getElementById('info-length'),
    papersLegend: document.getElementById('papers-legend'),
    wakeNote: document.getElementById('wake-note')
  };

  var state = {
    mode: 'single', // 'single' | 'multi'
    totalSeconds: 0,
    totalQuestions: 0,
    remainingSeconds: 0,
    running: false,
    finished: false,
    timerHandle: null,
    endTime: null,
    wakeLock: null,
    papers: [],       // [{ name, color, n, start, end, order }]
    questionMeta: []  // flattened, length === totalQuestions: [{ label, paperIndex }]
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
  var PAPER_COLORS = ['#00e676', '#2979ff', '#ffab00', '#e040fb', '#ff6d00', '#00e5ff', '#c6ff00', '#7c4dff'];

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

  // ---------- Question ordering (Start/End/Increasing-Decreasing) ----------

  function computeEnd(start, n, order) {
    return order === 'inc' ? start + n - 1 : start - n + 1;
  }

  function paperLabels(paper) {
    var dir = paper.order === 'inc' ? 1 : -1;
    var labels = [];
    for (var i = 0; i < paper.n; i++) labels.push(paper.start + i * dir);
    return labels;
  }

  function buildQuestionMeta(papers) {
    var meta = [];
    for (var p = 0; p < papers.length; p++) {
      var labels = paperLabels(papers[p]);
      for (var i = 0; i < labels.length; i++) {
        meta.push({ label: labels[i], paperIndex: p });
      }
    }
    return meta;
  }

  // ---------- Mode toggle (SPM / MPM) ----------

  function setMode(mode) {
    state.mode = mode;
    els.btnModeSingle.classList.toggle('active', mode === 'single');
    els.btnModeMulti.classList.toggle('active', mode === 'multi');
    els.spmPanel.style.display = mode === 'single' ? '' : 'none';
    els.mpmPanel.style.display = mode === 'multi' ? '' : 'none';
  }

  els.btnModeSingle.addEventListener('click', function () { setMode('single'); });
  els.btnModeMulti.addEventListener('click', function () { setMode('multi'); });

  // ---------- SPM controls ----------

  var spmOrder = 'inc';

  function refreshSpmEnd() {
    var n = Math.max(1, parseInt(els.questionsInput.value, 10) || 1);
    var start = parseInt(els.startInput.value, 10) || 1;
    els.endInput.value = computeEnd(start, n, spmOrder);
  }

  els.questionsInput.addEventListener('input', refreshSpmEnd);
  els.startInput.addEventListener('input', refreshSpmEnd);

  els.spmOrderToggle.addEventListener('click', function (e) {
    var btn = e.target.closest('.order-btn');
    if (!btn) return;
    var newOrder = btn.getAttribute('data-order');
    if (newOrder === spmOrder) return;

    var n = Math.max(1, parseInt(els.questionsInput.value, 10) || 1);
    var oldStart = parseInt(els.startInput.value, 10) || 1;
    var oldEnd = parseInt(els.endInput.value, 10) || computeEnd(oldStart, n, spmOrder);

    spmOrder = newOrder;
    els.spmOrderToggle.querySelectorAll('.order-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-order') === spmOrder);
    });

    els.startInput.value = oldEnd;
    els.endInput.value = computeEnd(oldEnd, n, spmOrder);
  });

  refreshSpmEnd();

  // ---------- MPM controls (paper cards) ----------

  var paperIdSeq = 0;
  var paperCards = []; // [{ id, order }]

  function paperCardTemplate(id, index) {
    var color = PAPER_COLORS[index % PAPER_COLORS.length];
    return '' +
      '<div class="paper-card" data-paper-id="' + id + '" style="--paper-color:' + color + '">' +
      '  <div class="paper-card-header">' +
      '    <span class="paper-swatch"></span>' +
      '    <input type="text" class="paper-name" placeholder="Subject name" value="Paper ' + (index + 1) + '">' +
      '    <button class="paper-remove" type="button" aria-label="Remove paper">&times;</button>' +
      '  </div>' +
      '  <div class="field">' +
      '    <label>Number of questions</label>' +
      '    <input type="number" class="paper-questions" inputmode="numeric" min="1" max="200" value="20">' +
      '  </div>' +
      '  <div class="field-row">' +
      '    <div class="field"><label>Start</label><input type="number" class="paper-start" inputmode="numeric" min="1" value="1"></div>' +
      '    <div class="field"><label>End</label><input type="number" class="paper-end" readonly tabindex="-1"></div>' +
      '  </div>' +
      '  <div class="order-toggle paper-order-toggle">' +
      '    <button class="order-btn active" data-order="inc" type="button">Increasing</button>' +
      '    <button class="order-btn" data-order="dec" type="button">Decreasing</button>' +
      '  </div>' +
      '</div>';
  }

  function addPaperCard() {
    var id = paperIdSeq++;
    paperCards.push({ id: id, order: 'inc' });
    var wrap = document.createElement('div');
    wrap.innerHTML = paperCardTemplate(id, paperCards.length - 1);
    var card = wrap.firstElementChild;
    els.papersList.appendChild(card);
    refreshPaperEnd(card, id);
    renumberAndRecolorPaperCards();
  }

  function removePaperCard(card, id) {
    if (paperCards.length <= 1) return; // keep at least one paper
    paperCards = paperCards.filter(function (p) { return p.id !== id; });
    card.remove();
    renumberAndRecolorPaperCards();
  }

  function renumberAndRecolorPaperCards() {
    var cards = els.papersList.querySelectorAll('.paper-card');
    cards.forEach(function (card, index) {
      var color = PAPER_COLORS[index % PAPER_COLORS.length];
      card.style.setProperty('--paper-color', color);
      var nameInput = card.querySelector('.paper-name');
      if (nameInput && /^Paper \d+$/.test(nameInput.value)) {
        nameInput.value = 'Paper ' + (index + 1);
      }
    });
  }

  function getPaperOrder(id) {
    var p = paperCards.filter(function (p) { return p.id === id; })[0];
    return p ? p.order : 'inc';
  }

  function setPaperOrder(id, order) {
    var p = paperCards.filter(function (p) { return p.id === id; })[0];
    if (p) p.order = order;
  }

  function refreshPaperEnd(card, id) {
    var n = Math.max(1, parseInt(card.querySelector('.paper-questions').value, 10) || 1);
    var start = parseInt(card.querySelector('.paper-start').value, 10) || 1;
    var order = getPaperOrder(id);
    card.querySelector('.paper-end').value = computeEnd(start, n, order);
  }

  els.papersList.addEventListener('input', function (e) {
    var card = e.target.closest('.paper-card');
    if (!card) return;
    if (e.target.classList.contains('paper-questions') || e.target.classList.contains('paper-start')) {
      var id = parseInt(card.getAttribute('data-paper-id'), 10);
      refreshPaperEnd(card, id);
    }
  });

  els.papersList.addEventListener('click', function (e) {
    var card = e.target.closest('.paper-card');
    if (!card) return;
    var id = parseInt(card.getAttribute('data-paper-id'), 10);

    if (e.target.classList.contains('paper-remove')) {
      removePaperCard(card, id);
      return;
    }

    var orderBtn = e.target.closest('.order-btn');
    if (orderBtn) {
      var newOrder = orderBtn.getAttribute('data-order');
      if (newOrder === getPaperOrder(id)) return;

      var n = Math.max(1, parseInt(card.querySelector('.paper-questions').value, 10) || 1);
      var oldStart = parseInt(card.querySelector('.paper-start').value, 10) || 1;
      var oldEnd = parseInt(card.querySelector('.paper-end').value, 10) || computeEnd(oldStart, n, getPaperOrder(id));

      setPaperOrder(id, newOrder);
      card.querySelectorAll('.paper-order-toggle .order-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-order') === newOrder);
      });

      card.querySelector('.paper-start').value = oldEnd;
      card.querySelector('.paper-end').value = computeEnd(oldEnd, n, newOrder);
    }
  });

  els.btnAddPaper.addEventListener('click', addPaperCard);

  // Seed MPM with two paper cards by default.
  addPaperCard();
  addPaperCard();

  // ---------- Dial build (shared by SPM / MPM) ----------

  function buildTicks(questionMeta) {
    els.ticksMinor.innerHTML = '';
    els.ticksMajor.innerHTML = '';
    els.tickLabels.innerHTML = '';

    var totalQuestions = questionMeta.length;
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
      var qPos = Math.max(1, Math.min(totalQuestions, Math.round(f2 * totalQuestions)));
      var qLabel = questionMeta[qPos - 1].label;

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
      text.textContent = 'Q-' + qLabel;
      els.tickLabels.appendChild(text);
    }

    // Divider marks at paper boundaries (skipped for a single paper).
    var papers = state.papers;
    if (papers.length > 1) {
      var cursor = 0;
      for (var pi = 0; pi < papers.length - 1; pi++) {
        cursor += papers[pi].n;
        var fb = cursor / totalQuestions;
        var b1 = arcPoint(SEG_INNER - 4, fb), b2 = arcPoint(SEG_OUTER + 4, fb);
        var bline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        bline.setAttribute('x1', b1.x); bline.setAttribute('y1', b1.y);
        bline.setAttribute('x2', b2.x); bline.setAttribute('y2', b2.y);
        bline.setAttribute('class', 'paper-boundary');
        els.ticksMajor.appendChild(bline);
      }
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
      els.segments.appendChild(path);
    }
    updateSegments(1);
  }

  function colorForFraction(mid) {
    var totalQuestions = state.totalQuestions;
    var qPos = Math.max(0, Math.min(totalQuestions - 1, Math.floor(mid * totalQuestions)));
    var paperIndex = state.questionMeta[qPos] ? state.questionMeta[qPos].paperIndex : 0;
    return state.papers[paperIndex] ? state.papers[paperIndex].color : GREEN;
  }

  function updateSegments(remainingFrac) {
    remainingFrac = Math.max(0, Math.min(1, remainingFrac));
    var elapsed = 1 - remainingFrac;
    var segs = els.segments.children;
    for (var i = 0; i < segs.length; i++) {
      var mid = parseFloat(segs[i].getAttribute('data-mid'));
      segs[i].setAttribute('fill', mid <= elapsed ? RED : colorForFraction(mid));
    }
  }

  function buildLegend() {
    if (state.papers.length <= 1) {
      els.papersLegend.style.display = 'none';
      els.papersLegend.innerHTML = '';
      els.infoCardLength.style.display = '';
      return;
    }
    els.infoCardLength.style.display = 'none';
    els.papersLegend.style.display = 'flex';
    els.papersLegend.innerHTML = state.papers.map(function (p) {
      return '<span class="legend-item"><span class="legend-swatch" style="background:' + p.color + '"></span>' +
        p.name + ' (' + p.n + 'q)</span>';
    }).join('');
  }

  // ---------- Formatting / countdown ----------

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
    var targetPos = Math.max(1, Math.min(state.totalQuestions, Math.round(elapsedFrac * state.totalQuestions)));
    var meta = state.questionMeta[targetPos - 1];
    var paper = state.papers[meta.paperIndex];
    var prefix = state.papers.length > 1 ? paper.name + ' — ' : '';
    els.infoTarget.textContent = prefix + 'Question ' + meta.label;
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

  // ---------- Launching the dial (SPM / MPM) ----------

  function launchDial(minutes, papers) {
    state.papers = papers;
    state.questionMeta = buildQuestionMeta(papers);
    state.totalQuestions = state.questionMeta.length;
    state.totalSeconds = minutes * 60;
    state.remainingSeconds = state.totalSeconds;

    els.dialTitle.textContent = 'Timer';
    els.dialSubtitle.textContent = 'Tap go when you\'re ready to start';
    els.infoLength.textContent = minutes + ' min, ' + state.totalQuestions + ' questions';
    setReadout(state.totalSeconds);
    els.readoutSub.textContent = 'left of ' + formatTime(state.totalSeconds);
    var firstMeta = state.questionMeta[0];
    els.infoTarget.textContent = (papers.length > 1 ? papers[firstMeta.paperIndex].name + ' — ' : '') + 'Question ' + firstMeta.label;

    buildTicks(state.questionMeta);
    buildSegments();
    buildLegend();

    showScreen('dial');
  }

  els.btnOk.addEventListener('click', function () {
    var minutes = parseInt(els.minutesInput.value, 10) || 1;
    var n = Math.max(1, parseInt(els.questionsInput.value, 10) || 1);
    var start = parseInt(els.startInput.value, 10) || 1;
    var end = computeEnd(start, n, spmOrder);

    launchDial(minutes, [{
      name: 'Paper 1', color: GREEN, n: n, start: start, end: end, order: spmOrder
    }]);
  });

  els.btnOkMpm.addEventListener('click', function () {
    var minutes = parseInt(els.minutesInputMpm.value, 10) || 1;
    var cards = els.papersList.querySelectorAll('.paper-card');
    var papers = [];
    cards.forEach(function (card, index) {
      var id = parseInt(card.getAttribute('data-paper-id'), 10);
      var n = Math.max(1, parseInt(card.querySelector('.paper-questions').value, 10) || 1);
      var start = parseInt(card.querySelector('.paper-start').value, 10) || 1;
      var order = getPaperOrder(id);
      var end = computeEnd(start, n, order);
      var name = card.querySelector('.paper-name').value.trim() || ('Paper ' + (index + 1));
      papers.push({
        name: name, color: PAPER_COLORS[index % PAPER_COLORS.length],
        n: n, start: start, end: end, order: order
      });
    });
    if (!papers.length) return;
    launchDial(minutes, papers);
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
