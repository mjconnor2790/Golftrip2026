(function () {
  'use strict';

  const G = window.GolfLogic;
  const STORAGE_KEY = 'amendoeiraGolfState_v1';

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  function defaultPlayers() {
    const teams = ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'];
    return teams.map((team, i) => ({
      id: 'p' + (i + 1),
      name: '',
      handicapIndex: '',
      team: team
    }));
  }

  function defaultState() {
    return { players: defaultPlayers(), scores: {} };
  }

  let state = loadState();
  let playersInitialSyncDone = false;
  let scoresInitialSyncDone = false;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.players)) return defaultState();
      if (!parsed.scores) parsed.scores = {};
      return parsed;
    } catch (e) {
      console.error('Failed to load state, using default', e);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Failed to save state', e);
      toast('Save failed — storage may be full');
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(k => {
        if (k === 'class') e.className = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
        else e.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(c => {
      if (c === null || c === undefined) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function fmtNum(n, decimals) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    const d = decimals === undefined ? 1 : decimals;
    return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toString();
  }

  function playerById(id) {
    return state.players.find(p => p.id === id);
  }

  function teamPlayers(team) {
    return state.players.filter(p => p.team === team);
  }

  function playersReady() {
    return state.players.every(p => p.name && p.name.trim() && p.handicapIndex !== '' && !Number.isNaN(Number(p.handicapIndex)));
  }

  // ---------------------------------------------------------------------
  // Cloud sync (Firebase) — optional. If unconfigured or unreachable, every
  // CloudSync call is a safe no-op and the app runs on localStorage only.
  // ---------------------------------------------------------------------
  function updateSyncBadge(connected, reason) {
    const badge = $('#sync-badge');
    if (!badge) return;
    if (reason === 'not-configured' || reason === 'sdk-missing' || reason === 'error') {
      badge.textContent = 'Local only';
      badge.className = 'sync-badge local';
    } else if (connected) {
      badge.textContent = 'Live sync';
      badge.className = 'sync-badge live';
    } else {
      badge.textContent = 'Offline';
      badge.className = 'sync-badge offline';
    }
  }

  function isTypingIn(containerId) {
    const activeEl = document.activeElement;
    if (!activeEl) return false;
    const container = $('#' + containerId);
    return !!(container && container.contains(activeEl));
  }

  // Fired whenever the /players node changes in the cloud (including our
  // own writes echoing back). Null on the FIRST snapshot means nothing has
  // been saved to the cloud yet, so we seed it from whatever we have
  // locally. Null on any LATER snapshot means someone genuinely reset the
  // tournament remotely — we must follow that, not fight it by re-seeding
  // our own stale local cache back into the cloud.
  //
  // Skips rebuilding the Setup form specifically while the user has focus
  // inside it - every one of our own edits echoes back from the cloud
  // almost instantly, and rebuilding the form on that echo would destroy
  // whatever input is focused mid-keystroke (losing focus, and
  // potentially misdirecting the next character typed). The rest of the
  // time (not actively typing there), it refreshes normally.
  function handleRemotePlayers(remotePlayers) {
    const isFirstSync = !playersInitialSyncDone;
    playersInitialSyncDone = true;

    if (remotePlayers === null || remotePlayers === undefined) {
      if (isFirstSync && window.CloudSync && window.CloudSync.isAvailable() && state.players.some(p => p.name && p.name.trim())) {
        window.CloudSync.savePlayers(state.players);
        return;
      }
      if (isFirstSync) return; // nothing in the cloud yet and nothing local to seed with
      state.players = defaultPlayers();
    } else {
      state.players = remotePlayers;
    }
    saveState();
    if (!isTypingIn('player-form-rows')) renderPlayerForm();
    renderCHTable();
    renderSchedule();
    populateRoundSelect();
    if (!isTypingIn('round-entry')) renderRoundEntry($('#round-select').value);
    renderIndividualLeaderboard();
    renderTeamLeaderboard();
  }

  // See handleRemotePlayers above for why this skips rebuilding the
  // currently-visible hole score inputs while the user is actively typing
  // in them - same self-echo-mid-keystroke hazard, same fix.
  function handleRemoteScores(remoteScores) {
    const isFirstSync = !scoresInitialSyncDone;
    scoresInitialSyncDone = true;

    if (remoteScores === null || remoteScores === undefined) {
      if (isFirstSync && window.CloudSync && window.CloudSync.isAvailable() && Object.keys(state.scores).length > 0) {
        Object.keys(state.scores).forEach(rid => window.CloudSync.saveRoundScore(rid, state.scores[rid]));
        return;
      }
      if (isFirstSync) return; // nothing in the cloud yet and nothing local to seed with
      state.scores = {};
    } else {
      state.scores = remoteScores;
    }
    saveState();
    renderSchedule();
    if (!isTypingIn('round-entry')) renderRoundEntry($('#round-select').value);
    renderIndividualLeaderboard();
    renderTeamLeaderboard();
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------
  function initTabs() {
    $all('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function switchTab(tab) {
    $all('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $all('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
    if (tab === 'setup') renderCHTable();
    if (tab === 'indiv') renderIndividualLeaderboard();
    if (tab === 'team') renderTeamLeaderboard();
    if (tab === 'schedule') renderSchedule();
    if (tab === 'enter') renderRoundEntry($('#round-select').value);
  }

  // ---------------------------------------------------------------------
  // Setup tab: player form
  // ---------------------------------------------------------------------
  function renderPlayerForm() {
    const container = $('#player-form-rows');
    container.innerHTML = '';
    state.players.forEach((p, idx) => {
      const nameInput = el('input', { type: 'text', placeholder: 'Player name', id: 'name-' + p.id, value: p.name || '' });
      const hcpInput = el('input', { type: 'number', step: '0.1', placeholder: 'e.g. 14.2', id: 'hcp-' + p.id, value: p.handicapIndex });
      const teamSelect = el('select', { id: 'team-' + p.id });
      ['A', 'B'].forEach(t => {
        const opt = el('option', { value: t }, ['Team ' + t]);
        if (p.team === t) opt.selected = true;
        teamSelect.appendChild(opt);
      });

      const row = el('div', { class: 'player-row' }, [
        el('div', { class: 'prow-top' }, [
          el('span', { class: 'prow-title' }, ['Player ' + (idx + 1)]),
          el('span', { class: 'team-chip ' + p.team }, ['TEAM ' + p.team])
        ]),
        el('div', { class: 'field-grid' }, [
          el('label', { class: 'field-label', for: 'name-' + p.id }, ['Name']),
          nameInput,
          el('label', { class: 'field-label', for: 'hcp-' + p.id }, ['Handicap Index']),
          hcpInput,
          el('label', { class: 'field-label', for: 'team-' + p.id }, ['Team']),
          teamSelect
        ])
      ]);
      container.appendChild(row);

      // live-update the team chip color as the user changes the select
      teamSelect.addEventListener('change', () => {
        const chip = row.querySelector('.team-chip');
        chip.className = 'team-chip ' + teamSelect.value;
        chip.textContent = 'TEAM ' + teamSelect.value;
      });
    });
  }

  function savePlayers() {
    const updated = state.players.map(p => {
      const name = $('#name-' + p.id).value.trim();
      const hcpRaw = $('#hcp-' + p.id).value;
      const team = $('#team-' + p.id).value;
      return {
        id: p.id,
        name: name,
        handicapIndex: hcpRaw === '' ? '' : Number(hcpRaw),
        team: team
      };
    });
    state.players = updated;
    saveState();
    if (window.CloudSync) window.CloudSync.savePlayers(updated);
    renderCHTable();
    renderSchedule();
    renderIndividualLeaderboard();
    renderTeamLeaderboard();
    populateRoundSelect();
    const status = $('#player-save-status');
    status.textContent = 'Saved ✓';
    setTimeout(() => { status.textContent = ''; }, 2000);
    toast('Players saved');
  }

  function renderCHTable() {
    const tbody = $('#ch-table tbody');
    tbody.innerHTML = '';
    state.players.forEach(p => {
      const hasHcp = p.handicapIndex !== '' && !Number.isNaN(Number(p.handicapIndex));
      const chO = hasHcp ? G.courseHandicap(p.handicapIndex, 'oconnor') : '—';
      const chF = hasHcp ? G.courseHandicap(p.handicapIndex, 'faldo') : '—';
      const tr = el('tr', {}, [
        el('td', {}, [p.name || '(unnamed)']),
        el('td', {}, [el('span', { class: 'team-chip ' + p.team }, [p.team])]),
        el('td', {}, [hasHcp ? String(p.handicapIndex) : '—']),
        el('td', {}, [String(chO)]),
        el('td', {}, [String(chF)])
      ]);
      tbody.appendChild(tr);
    });
  }

  // ---------------------------------------------------------------------
  // Schedule tab
  // ---------------------------------------------------------------------
  function roundIsComplete(round) {
    return G.isRoundComplete(round, state.scores[round.id], state.players);
  }

  function renderSchedule() {
    const list = $('#schedule-list');
    list.innerHTML = '';
    G.SCHEDULE.forEach(round => {
      const course = G.COURSES[round.course];
      const complete = roundIsComplete(round);
      const card = el('div', { class: 'schedule-card' }, [
        el('div', { class: 'sc-day' }, [round.session]),
        el('div', { class: 'sc-label' }, [round.label]),
        el('div', { class: 'sc-meta' }, [course.name + ' · Par ' + course.par + ' · Rating ' + course.rating + ' · Slope ' + course.slope]),
        el('div', { class: 'sc-status ' + (complete ? 'done' : 'pending') }, [complete ? '✓ Scores entered' : 'Pending']),
      ]);
      list.appendChild(card);
    });
  }

  // ---------------------------------------------------------------------
  // Enter Scores tab
  // ---------------------------------------------------------------------
  function populateRoundSelect() {
    const sel = $('#round-select');
    const prevVal = sel.value;
    sel.innerHTML = '';
    G.SCHEDULE.forEach(round => {
      const opt = el('option', { value: round.id }, [round.session + ' — ' + round.label]);
      sel.appendChild(opt);
    });
    if (prevVal && G.SCHEDULE.some(r => r.id === prevVal)) sel.value = prevVal;
  }

  function initRoundSelect() {
    populateRoundSelect();
    $('#round-select').addEventListener('change', (e) => renderRoundEntry(e.target.value));
    renderRoundEntry($('#round-select').value);
  }

  function renderRoundEntry(roundId) {
    const round = G.SCHEDULE.find(r => r.id === roundId);
    const container = $('#round-entry');
    container.innerHTML = '';
    if (!round) return;

    if (!playersReady()) {
      container.appendChild(el('p', { class: 'hint' }, ['Enter and save all 8 players (with names and handicap indexes) on the Setup tab before entering scores.']));
      return;
    }

    if (round.format === 'individual') {
      renderIndividualEntry(round, container);
    } else if (round.format === 'scramble2v2' || round.format === 'altshot2v2') {
      renderScrambleEntry(round, container);
    } else if (round.format === 'team4') {
      renderTeam4Entry(round, container);
    }
  }

  // ---------------------------------------------------------------------
  // Shared hole-by-hole / quick-total entry component, used by all three
  // round formats.
  //
  // `entities` is [{ id, makeLabel(), getHoles(), getManualTotal(),
  // setManualTotal(v), cloudHolesPath, cloudManualTotalPath }].
  //
  // Two correctness requirements drive this design:
  //  1. getHoles()/getManualTotal() are called FRESH on every read and
  //     write (never a cached array/object reference) - because when a
  //     cloud sync update arrives mid-entry, state.scores gets reassigned
  //     wholesale, which would silently orphan any array reference the UI
  //     had captured earlier, discarding every keystroke typed after that
  //     point. Re-resolving from live state every time makes this immune
  //     to that regardless of how or when remote updates land.
  //  2. Every save writes only the ONE leaf path that changed (a single
  //     hole for one player, or one manual total), not the whole round
  //     object - so two phones editing different players/holes/pairings
  //     at the same moment can never clobber each other.
  // ---------------------------------------------------------------------
  let currentHoleByRound = {};
  let entryModeByRound = {};

  function getCurrentHole(roundId) { return currentHoleByRound[roundId] || 1; }
  function setCurrentHole(roundId, h) { currentHoleByRound[roundId] = Math.max(1, Math.min(18, h)); }
  function getEntryMode(roundId) { return entryModeByRound[roundId] || 'holes'; }
  function setEntryMode(roundId, mode) { entryModeByRound[roundId] = mode; }

  function scoreVsParClass(strokes, par) {
    if (strokes === null || strokes === undefined || strokes === '' || Number.isNaN(Number(strokes))) return '';
    const diff = Number(strokes) - par;
    if (diff <= -1) return 'score-under';
    if (diff === 0) return 'score-par';
    return 'score-over';
  }

  function pushPath(path, value) {
    if (window.CloudSync) window.CloudSync.setPath(path, value);
  }

  function renderScoreEntryUI(round, entities, container) {
    const mode = getEntryMode(round.id);
    const course = G.COURSES[round.course];

    const modeBar = el('div', { class: 'row-actions' }, [
      el('button', {
        class: 'btn btn-small' + (mode === 'holes' ? ' btn-primary' : ''),
        onclick: () => { setEntryMode(round.id, 'holes'); renderRoundEntry(round.id); }
      }, ['Hole by Hole']),
      el('button', {
        class: 'btn btn-small' + (mode === 'total' ? ' btn-primary' : ''),
        onclick: () => { setEntryMode(round.id, 'total'); renderRoundEntry(round.id); }
      }, ['Quick Total'])
    ]);
    container.appendChild(modeBar);

    if (mode === 'total') {
      entities.forEach(ent => {
        const input = el('input', {
          type: 'number', inputmode: 'numeric', placeholder: 'Gross total',
          value: ent.getManualTotal() !== undefined ? ent.getManualTotal() : ''
        });
        input.addEventListener('input', () => {
          const v = input.value === '' ? '' : input.value;
          ent.setManualTotal(v);
          saveState();
          pushPath(ent.cloudManualTotalPath, v === '' ? null : Number(v));
        });
        container.appendChild(el('div', { class: 'entry-card' }, [
          el('div', { class: 'field-label' }, [ent.makeLabel()]),
          input
        ]));
      });
      const saveBtn = el('button', { class: 'btn btn-primary', onclick: () => { toast('Scores saved for ' + round.session); renderSchedule(); renderIndividualLeaderboard(); renderTeamLeaderboard(); } }, ['Save Round']);
      const clearBtn = el('button', { class: 'btn btn-warn', onclick: () => clearRound(round) }, ['Clear Round']);
      container.appendChild(el('div', { class: 'row-actions' }, [saveBtn, clearBtn]));
      return;
    }

    // Hole-by-hole stepper
    const holeNum = getCurrentHole(round.id);
    const holeIdx = holeNum - 1;
    const holeInfo = course.holes[holeIdx];

    const header = el('div', { class: 'hole-stepper-header' }, [
      el('button', { class: 'btn btn-small', onclick: () => { setCurrentHole(round.id, holeNum - 1); renderRoundEntry(round.id); } }, ['‹']),
      el('div', { class: 'hole-stepper-title' }, [
        el('div', { class: 'hs-hole' }, ['Hole ' + holeNum]),
        el('div', { class: 'hs-meta' }, ['Par ' + holeInfo.par + ' · Stroke Index ' + holeInfo.index])
      ]),
      el('button', { class: 'btn btn-small', onclick: () => { setCurrentHole(round.id, holeNum + 1); renderRoundEntry(round.id); } }, ['›'])
    ]);
    container.appendChild(header);

    entities.forEach(ent => {
      const holesNow = ent.getHoles();
      const val = holesNow[holeIdx];
      const input = el('input', {
        type: 'number', inputmode: 'numeric', placeholder: '—',
        value: (val === null || val === undefined) ? '' : val
      });
      const totalDisplay = el('div', { class: 'entry-readonly' }, [String(G.sumHoles(holesNow))]);
      const badgeDisplay = el('div', { class: 'score-badge' }, []);
      const row = el('div', { class: 'entry-hole-row' }, [
        el('div', { class: 'entry-player-name' }, [ent.makeLabel()]),
        totalDisplay,
        badgeDisplay,
        input
      ]);
      function applyClass() {
        row.classList.remove('score-under', 'score-par', 'score-over');
        const cls = scoreVsParClass(input.value, holeInfo.par);
        if (cls) row.classList.add(cls);
      }
      function applyBadge() {
        const badge = G.getScoreBadge(input.value, holeInfo.par);
        badgeDisplay.textContent = badge ? badge.emoji : '';
        badgeDisplay.title = badge ? badge.label : '';
        return badge;
      }
      applyClass();
      applyBadge();
      input.addEventListener('input', () => {
        const v = input.value;
        const parsed = (v === '' || Number.isNaN(Number(v))) ? null : Number(v);
        // Re-resolve the live holes array fresh right now, rather than
        // trusting the `holesNow` captured when this row was built - a
        // remote sync update could have replaced state.scores since then.
        const liveHoles = ent.getHoles();
        liveHoles[holeIdx] = parsed;
        saveState();
        totalDisplay.textContent = String(G.sumHoles(liveHoles));
        applyClass();
        applyBadge();
        pushPath(ent.cloudHolesPath + '/' + holeIdx, parsed);
      });
      input.addEventListener('change', () => {
        // Fires once the value is committed (blur/enter), not on every
        // keystroke while typing - avoids spamming a toast mid-typing.
        const badge = G.getScoreBadge(input.value, holeInfo.par);
        if (badge) {
          const nameText = ent.makeLabel().textContent;
          toast(badge.emoji + ' ' + badge.label + ' — ' + nameText);
        }
      });
      container.appendChild(row);
    });

    const jump = el('select', {});
    for (let h = 1; h <= 18; h++) {
      const opt = el('option', { value: h }, ['Hole ' + h]);
      if (h === holeNum) opt.selected = true;
      jump.appendChild(opt);
    }
    jump.addEventListener('change', () => { setCurrentHole(round.id, Number(jump.value)); renderRoundEntry(round.id); });
    container.appendChild(el('div', { class: 'field-grid' }, [el('label', { class: 'field-label' }, ['Jump to hole']), jump]));

    // Compact "thru / total so far" summary for every entity
    const summary = el('div', { class: 'scorecard-summary' });
    entities.forEach(ent => {
      const holes = ent.getHoles();
      const thru = G.countFilledHoles(holes);
      const total = G.sumHoles(holes);
      summary.appendChild(el('div', { class: 'breakdown-row' }, [
        el('div', { class: 'br-label' }, [ent.makeLabel()]),
        el('div', { class: 'br-scores' }, [thru === 0 ? 'Not started' : ('Thru ' + thru + ' · ' + total + (thru === 18 ? ' (' + (total - course.par >= 0 ? '+' : '') + (total - course.par) + ')' : ''))])
      ]));
    });
    container.appendChild(summary);

    const saveBtn = el('button', { class: 'btn btn-primary', onclick: () => { toast('Scores saved for ' + round.session); renderSchedule(); renderIndividualLeaderboard(); renderTeamLeaderboard(); } }, ['Save Round']);
    const clearBtn = el('button', { class: 'btn btn-warn', onclick: () => clearRound(round) }, ['Clear Round']);
    container.appendChild(el('div', { class: 'row-actions' }, [saveBtn, clearBtn]));
  }

  function ensureIndividualShape(roundId) {
    if (!state.scores[roundId] || typeof state.scores[roundId] !== 'object') state.scores[roundId] = {};
    const rs = state.scores[roundId];
    if (!rs.holes) rs.holes = {};
    if (!rs.manualTotal) rs.manualTotal = {};
    state.players.forEach(p => {
      if (!rs.holes[p.id] || typeof rs.holes[p.id] !== 'object') rs.holes[p.id] = {};
      if (rs.manualTotal[p.id] === undefined) {
        // back-compat: a round saved before hole-by-hole entry existed
        // stored a flat { playerId: number } total directly.
        rs.manualTotal[p.id] = (typeof rs[p.id] === 'number') ? rs[p.id] : '';
      }
      if (typeof rs[p.id] === 'number') delete rs[p.id];
    });
    return rs;
  }

  function renderIndividualEntry(round, container) {
    ensureIndividualShape(round.id);
    const entities = state.players.map(p => ({
      id: p.id,
      makeLabel: () => el('span', {}, [p.name, ' ', el('span', { class: 'team-chip ' + p.team }, [p.team])]),
      getHoles: () => ensureIndividualShape(round.id).holes[p.id],
      getManualTotal: () => ensureIndividualShape(round.id).manualTotal[p.id],
      setManualTotal: (v) => { ensureIndividualShape(round.id).manualTotal[p.id] = v; },
      cloudHolesPath: 'scores/' + round.id + '/holes/' + p.id,
      cloudManualTotalPath: 'scores/' + round.id + '/manualTotal/' + p.id
    }));
    renderScoreEntryUI(round, entities, container);
  }

  function ensureScrambleShape(roundId) {
    const existing = state.scores[roundId];
    const hasValidPairings = existing && typeof existing === 'object' &&
      existing.pairings && typeof existing.pairings === 'object' && !Array.isArray(existing.pairings);
    if (!hasValidPairings) {
      // Fresh round, or back-compat: earlier versions stored pairings as
      // an array. Convert to an object keyed by pairing id (A1/A2/B1/B2)
      // so each pairing has a stable path for granular cloud writes.
      const oldArray = (existing && Array.isArray(existing.pairings)) ? existing.pairings : [];
      const byId = {};
      oldArray.forEach(pr => { byId[pr.id] = pr; });
      state.scores[roundId] = { pairings: byId };
    }
    const rs = state.scores[roundId];
    ['A', 'B'].forEach(team => {
      const tp = teamPlayers(team);
      [['1', 0], ['2', 1]].forEach(([slot, pos]) => {
        const id = team + slot;
        let pr = rs.pairings[id];
        if (!pr) {
          const defaultIds = pos === 0 ? [tp[0].id, tp[1].id] : [tp[2].id, tp[3].id];
          pr = { id: id, team: team, playerIds: defaultIds, holes: {}, manualTotal: '' };
          rs.pairings[id] = pr;
        }
        if (!pr.holes || typeof pr.holes !== 'object') pr.holes = {};
        if (pr.manualTotal === undefined) pr.manualTotal = (typeof pr.gross === 'number') ? pr.gross : '';
        if (typeof pr.gross === 'number') delete pr.gross;
        if (!Array.isArray(pr.playerIds) || pr.playerIds.length !== 2) {
          pr.playerIds = pos === 0 ? [tp[0].id, tp[1].id] : [tp[2].id, tp[3].id];
        }
      });
    });
    return rs;
  }

  function renderScrambleEntry(round, container) {
    const rs = ensureScrambleShape(round.id);

    ['A', 'B'].forEach(team => {
      const tp = teamPlayers(team);
      const pr1id = team + '1', pr2id = team + '2';

      const block = el('div', { class: 'pairing-block' });
      block.appendChild(el('div', { class: 'pairing-title' }, [el('span', { class: 'team-chip ' + team }, ['TEAM ' + team])]));

      const sel1 = el('select', {});
      const sel2 = el('select', {});
      tp.forEach(pl => {
        sel1.appendChild(el('option', { value: pl.id }, [pl.name || pl.id]));
        sel2.appendChild(el('option', { value: pl.id }, [pl.name || pl.id]));
      });
      sel1.value = ensureScrambleShape(round.id).pairings[pr1id].playerIds[0];
      sel2.value = ensureScrambleShape(round.id).pairings[pr1id].playerIds[1];

      const pairing2Label = el('div', { class: 'entry-readonly', style: 'text-align:left;' });
      function updatePairing2Label() {
        const remaining = tp.filter(pl => pl.id !== sel1.value && pl.id !== sel2.value);
        pairing2Label.textContent = remaining.map(pl => pl.name || pl.id).join(' & ') || '(select two different players above)';
        return remaining;
      }
      updatePairing2Label();

      function persistComposition() {
        const remaining = updatePairing2Label();
        const liveRs = ensureScrambleShape(round.id);
        const ids1 = [sel1.value, sel2.value];
        const ids2 = remaining.map(pl => pl.id);
        liveRs.pairings[pr1id].playerIds = ids1;
        liveRs.pairings[pr2id].playerIds = ids2;
        saveState();
        pushPath('scores/' + round.id + '/pairings/' + pr1id + '/playerIds', ids1);
        pushPath('scores/' + round.id + '/pairings/' + pr2id + '/playerIds', ids2);
      }

      function enforceDistinct() {
        if (sel1.value === sel2.value) {
          const other = tp.find(pl => pl.id !== sel1.value);
          if (other) sel2.value = other.id;
        }
        persistComposition();
      }
      sel1.addEventListener('change', enforceDistinct);
      sel2.addEventListener('change', enforceDistinct);

      block.appendChild(el('div', { class: 'field-label' }, ['Pairing 1']));
      block.appendChild(el('div', { class: 'field-grid' }, [sel1, sel2]));
      block.appendChild(el('div', { class: 'field-label' }, ['Pairing 2 (remaining players)']));
      block.appendChild(el('div', { class: 'field-grid' }, [pairing2Label]));
      container.appendChild(block);
    });

    function makePairingEntity(id, label) {
      return {
        id: id,
        makeLabel: () => document.createTextNode(label),
        getHoles: () => ensureScrambleShape(round.id).pairings[id].holes,
        getManualTotal: () => ensureScrambleShape(round.id).pairings[id].manualTotal,
        setManualTotal: (v) => { ensureScrambleShape(round.id).pairings[id].manualTotal = v; },
        cloudHolesPath: 'scores/' + round.id + '/pairings/' + id + '/holes',
        cloudManualTotalPath: 'scores/' + round.id + '/pairings/' + id + '/manualTotal'
      };
    }
    const entities = [
      makePairingEntity('A1', 'Team A · Pairing 1'),
      makePairingEntity('A2', 'Team A · Pairing 2'),
      makePairingEntity('B1', 'Team B · Pairing 1'),
      makePairingEntity('B2', 'Team B · Pairing 2')
    ];
    renderScoreEntryUI(round, entities, container);
  }

  function ensureTeam4Shape(roundId) {
    if (!state.scores[roundId] || typeof state.scores[roundId] !== 'object') state.scores[roundId] = {};
    const rs = state.scores[roundId];
    ['teamA', 'teamB'].forEach(key => {
      const legacy = (typeof rs[key] === 'number') ? rs[key] : '';
      if (!rs[key] || typeof rs[key] !== 'object') rs[key] = { holes: {}, manualTotal: legacy };
      if (!rs[key].holes || typeof rs[key].holes !== 'object') rs[key].holes = {};
      if (rs[key].manualTotal === undefined) rs[key].manualTotal = legacy;
    });
    return rs;
  }

  function renderTeam4Entry(round, container) {
    ensureTeam4Shape(round.id);
    function makeTeamEntity(key, chipTeam) {
      return {
        id: key,
        makeLabel: () => el('span', { class: 'team-chip ' + chipTeam }, ['TEAM ' + chipTeam]),
        getHoles: () => ensureTeam4Shape(round.id)[key].holes,
        getManualTotal: () => ensureTeam4Shape(round.id)[key].manualTotal,
        setManualTotal: (v) => { ensureTeam4Shape(round.id)[key].manualTotal = v; },
        cloudHolesPath: 'scores/' + round.id + '/' + key + '/holes',
        cloudManualTotalPath: 'scores/' + round.id + '/' + key + '/manualTotal'
      };
    }
    const entities = [makeTeamEntity('teamA', 'A'), makeTeamEntity('teamB', 'B')];
    renderScoreEntryUI(round, entities, container);
  }

  function clearRound(round) {
    delete state.scores[round.id];
    saveState();
    if (window.CloudSync) window.CloudSync.clearRoundScore(round.id);
    toast(round.session + ' cleared');
    renderRoundEntry(round.id);
    renderSchedule();
    renderIndividualLeaderboard();
    renderTeamLeaderboard();
  }

  // ---------------------------------------------------------------------
  // Individual leaderboard tab
  // ---------------------------------------------------------------------
  function renderIndividualLeaderboard() {
    const lb = G.computeLeaderboards(state);
    const tbody = $('#indiv-table tbody');
    tbody.innerHTML = '';
    lb.individual.forEach((row, idx) => {
      const tr = el('tr', { class: idx === 0 && row.totalPoints > 0 ? 'rank-1' : '' }, [
        el('td', {}, [String(idx + 1)]),
        el('td', {}, [row.name || '(unnamed)']),
        el('td', {}, [el('span', { class: 'team-chip ' + row.team }, [row.team])]),
        el('td', {}, [fmtNum(row.totalPoints)]),
        el('td', {}, [String(row.roundsPlayed)]),
        el('td', {}, [row.bestNet === null ? '—' : String(row.bestNet)]),
        el('td', {}, [row.avgNet === null ? '—' : fmtNum(row.avgNet)])
      ]);
      tbody.appendChild(tr);
    });
  }

  // ---------------------------------------------------------------------
  // Team leaderboard tab
  // ---------------------------------------------------------------------
  function renderTeamLeaderboard() {
    const lb = G.computeLeaderboards(state);
    const cards = $('#team-cards');
    cards.innerHTML = '';
    ['A', 'B'].forEach(team => {
      const t = lb.team[team];
      cards.appendChild(el('div', { class: 'team-card ' + team }, [
        el('div', { class: 'tc-name' }, ['TEAM ' + team]),
        el('div', { class: 'tc-points' }, [fmtNum(t.total)]),
        el('div', { class: 'tc-sub' }, ['points'])
      ]));
    });

    const tbody = $('#team-table tbody');
    tbody.innerHTML = '';
    ['A', 'B'].forEach(team => {
      const t = lb.team[team];
      tbody.appendChild(el('tr', {}, [
        el('td', {}, [el('span', { class: 'team-chip ' + team }, ['TEAM ' + team])]),
        el('td', {}, [fmtNum(t.total)]),
        el('td', {}, [fmtNum(t.individual)]),
        el('td', {}, [fmtNum(t.team_)])
      ]));
    });

    const breakdown = $('#team-breakdown');
    breakdown.innerHTML = '';
    G.SCHEDULE.forEach(round => {
      const result = lb.perRound[round.id];
      let scoreText = 'Not entered yet';
      if (result) {
        if (round.format === 'individual') {
          scoreText = result.length + ' of ' + state.players.length + ' players scored';
        } else if (round.format === 'scramble2v2' || round.format === 'altshot2v2') {
          scoreText = result.map(r => {
            const names = (r.playerIds || []).map(id => (playerById(id) || {}).name || '?').join(' & ');
            return 'Team ' + r.team + ' (' + names + '): ' + r.gross + ' → ' + fmtNum(r.points) + 'pt';
          }).join(' · ') || 'No pairings scored yet';
        } else if (round.format === 'team4') {
          scoreText = 'A: ' + result.teamA.gross + ' (' + fmtNum(result.teamA.points) + 'pt) · B: ' + result.teamB.gross + ' (' + fmtNum(result.teamB.points) + 'pt)';
        }
      }
      breakdown.appendChild(el('div', { class: 'breakdown-row' }, [
        el('div', { class: 'br-label' }, [round.session]),
        el('div', { class: 'br-scores' }, [scoreText])
      ]));
    });
  }

  // ---------------------------------------------------------------------
  // Rules tab
  // ---------------------------------------------------------------------
  function renderRules() {
    const c = $('#rules-content');
    c.innerHTML = `
      <section>
        <h4>Courses</h4>
        <p><strong>O'Connor Jnr</strong> (yellow tees): Par 72, Rating 70.7, Slope 129</p>
        <p><strong>Faldo</strong> (yellow tees): Par 72, Rating 70.9, Slope 134</p>
        <p>Course Handicap = Handicap Index × (Slope ÷ 113) + (Course Rating − Par), rounded to the nearest whole number.</p>
      </section>
      <section>
        <h4>Entering scores</h4>
        <p>On the Enter Scores tab, every round can be scored either <strong>Hole by Hole</strong> (step through all 18 holes, with each hole's par and stroke index shown, and a running total as you go) or as a <strong>Quick Total</strong> (just type the final gross number). Both feed the exact same scoring math — pick whichever suits the moment. Everything saves automatically as you go, so nothing is lost if the app closes mid-round.</p>
        <p>Hole-by-Hole entry shows a little emoji next to each score: 🎉 Hole in One · 🌟 Albatross · 🦅 Eagle · 🐦 Birdie · 😬 Double Bogey · 🙈 further over · ⛄ Snowman (any score of 8, whatever the hole's par). Plain par and single bogey stay quiet.</p>
      </section>
      <section>
        <h4>Schedule</h4>
        <ul>
          <li>Day 1: O'Connor Jnr — individual stroke play</li>
          <li>Day 2 AM: Faldo — individual stroke play</li>
          <li>Day 2 PM: Faldo — 2v2 scramble (team only)</li>
          <li>Day 3 AM: O'Connor Jnr — individual stroke play</li>
          <li>Day 3 PM: O'Connor Jnr — 2v2 scramble (team only)</li>
          <li>Day 4 AM: Faldo — individual stroke play</li>
          <li>Day 4 PM: Faldo — 2v2 alternate shot scramble (team only)</li>
          <li>Day 5 AM: Faldo — full 4-man team scramble (team only)</li>
        </ul>
      </section>
      <section>
        <h4>Individual stroke play scoring</h4>
        <p>Gross score is entered per player (hole by hole or as a quick total). Net score = Gross − Course Handicap. Players are ranked by net score (lowest first).</p>
        <p>Points: 1st 8 · 2nd 7 · 3rd 6 · 4th 5 · 5th 4 · 6th 3 · 7th 2 · 8th 1.</p>
        <p>Tied players split the combined points for their positions equally (e.g. a tie for 1st shares 8+7=15, so 7.5 each).</p>
        <p>These points count towards both the Individual leaderboard and the player's Team leaderboard.</p>
      </section>
      <section>
        <h4>2v2 scramble scoring (incl. alternate shot)</h4>
        <p>Each team fields two pairings from its four players. Each pairing plays one gross scramble score. The four pairings are ranked by gross score (lowest first).</p>
        <p>Points: 1st 4 · 2nd 3 · 3rd 2 · 4th 1. Ties split points equally. These points count only towards the Team leaderboard.</p>
      </section>
      <section>
        <h4>Day 5 full team scramble</h4>
        <p>Each team plays one full 4-man scramble and enters a single gross score. Lower gross score wins.</p>
        <p>Points: Winner 8 · Loser 4 · Tie 6 each. Counts only towards the Team leaderboard.</p>
      </section>
      <section>
        <h4>Data</h4>
        <p>Data is always cached on this device. If Firebase sync is configured (see the badge in the header), scores also sync live across every phone using this link. Use Export/Import on the Setup tab to back up or transfer the tournament data manually.</p>
      </section>
    `;
  }

  // ---------------------------------------------------------------------
  // Export / Import / Reset
  // ---------------------------------------------------------------------
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'amendoeira-cup-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Exported');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.players)) throw new Error('Invalid file format');
        state = { players: parsed.players, scores: parsed.scores || {} };
        saveState();
        if (window.CloudSync) window.CloudSync.importAll(state.players, state.scores);
        refreshAll();
        toast('Import successful');
      } catch (e) {
        console.error(e);
        toast('Import failed — invalid JSON file');
      }
    };
    reader.readAsText(file);
  }

  function resetScores() {
    if (!confirm('Reset all scores? Players and teams will be kept.')) return;
    state.scores = {};
    saveState();
    if (window.CloudSync) window.CloudSync.resetScores();
    refreshAll();
    toast('All scores reset');
  }

  function resetEverything() {
    if (!confirm('Reset EVERYTHING — players, teams and scores? This cannot be undone.')) return;
    state = defaultState();
    saveState();
    if (window.CloudSync) window.CloudSync.resetAll();
    refreshAll();
    toast('Tournament fully reset');
  }

  function refreshAll() {
    renderPlayerForm();
    renderCHTable();
    renderSchedule();
    populateRoundSelect();
    renderRoundEntry($('#round-select').value);
    renderIndividualLeaderboard();
    renderTeamLeaderboard();
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  function init() {
    initTabs();
    renderPlayerForm();
    renderCHTable();
    renderSchedule();
    initRoundSelect();
    renderIndividualLeaderboard();
    renderTeamLeaderboard();
    renderRules();

    $('#btn-save-players').addEventListener('click', savePlayers);
    $('#btn-export').addEventListener('click', exportData);
    $('#btn-import-trigger').addEventListener('click', () => $('#btn-import-file').click());
    $('#btn-import-file').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) importData(e.target.files[0]);
      e.target.value = '';
    });
    $('#btn-reset-scores').addEventListener('click', resetScores);
    $('#btn-reset-all').addEventListener('click', resetEverything);

    if (window.CloudSync) {
      const started = window.CloudSync.init(updateSyncBadge);
      if (started) {
        window.CloudSync.onPlayersChange(handleRemotePlayers);
        window.CloudSync.onScoresChange(handleRemoteScores);
      } else {
        updateSyncBadge(false, 'not-configured');
      }
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
