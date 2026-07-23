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
    const rs = state.scores[round.id];
    if (!rs) return false;
    if (round.format === 'individual') {
      return state.players.every(p => rs[p.id] !== undefined && rs[p.id] !== null && rs[p.id] !== '');
    }
    if (round.format === 'scramble2v2' || round.format === 'altshot2v2') {
      return Array.isArray(rs.pairings) && rs.pairings.length === 4 &&
        rs.pairings.every(pr => pr.gross !== undefined && pr.gross !== null && pr.gross !== '');
    }
    if (round.format === 'team4') {
      return rs.teamA !== undefined && rs.teamA !== null && rs.teamA !== '' &&
        rs.teamB !== undefined && rs.teamB !== null && rs.teamB !== '';
    }
    return false;
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

  function renderIndividualEntry(round, container) {
    const existing = state.scores[round.id] || {};
    const card = el('div', { class: 'entry-card' });

    const header = el('div', { class: 'entry-player-row' }, [
      el('div', { class: 'entry-player-name' }, ['Player']),
      el('div', { class: 'entry-readonly' }, ['CH']),
      el('div', { class: 'entry-readonly' }, ['Net']),
      el('div', { class: 'entry-readonly' }, ['Gross'])
    ]);
    card.appendChild(header);

    state.players.forEach(p => {
      const ch = G.courseHandicap(p.handicapIndex, round.course);
      const grossInput = el('input', {
        type: 'number', inputmode: 'numeric', placeholder: '—',
        id: 'gross-' + round.id + '-' + p.id,
        value: existing[p.id] !== undefined ? existing[p.id] : ''
      });
      const netDisplay = el('div', { class: 'entry-readonly', id: 'net-' + round.id + '-' + p.id }, [
        existing[p.id] !== undefined && existing[p.id] !== '' ? String(Number(existing[p.id]) - ch) : '—'
      ]);
      grossInput.addEventListener('input', () => {
        const v = grossInput.value;
        netDisplay.textContent = (v === '' || Number.isNaN(Number(v))) ? '—' : String(Number(v) - ch);
      });
      const row = el('div', { class: 'entry-player-row' }, [
        el('div', { class: 'entry-player-name' }, [
          p.name, ' ',
          el('span', { class: 'team-chip ' + p.team }, [p.team])
        ]),
        el('div', { class: 'entry-readonly' }, [String(ch)]),
        netDisplay,
        grossInput
      ]);
      card.appendChild(row);
    });
    container.appendChild(card);

    const saveBtn = el('button', { class: 'btn btn-primary', onclick: () => saveIndividualRound(round) }, ['Save Round']);
    const clearBtn = el('button', { class: 'btn btn-warn', onclick: () => clearRound(round) }, ['Clear Round']);
    container.appendChild(el('div', { class: 'row-actions' }, [saveBtn, clearBtn]));
  }

  function saveIndividualRound(round) {
    const scores = {};
    state.players.forEach(p => {
      const input = $('#gross-' + round.id + '-' + p.id);
      const v = input.value;
      if (v !== '' && !Number.isNaN(Number(v))) scores[p.id] = Number(v);
    });
    state.scores[round.id] = scores;
    saveState();
    toast('Scores saved for ' + round.session);
    renderSchedule();
    renderIndividualLeaderboard();
    renderTeamLeaderboard();
  }

  function renderScrambleEntry(round, container) {
    const existing = state.scores[round.id] || { pairings: [] };
    const savedPairings = existing.pairings || [];

    ['A', 'B'].forEach(team => {
      const tp = teamPlayers(team);
      const saved1 = savedPairings.find(pr => pr.team === team && pr.id === team + '1');
      const saved2 = savedPairings.find(pr => pr.team === team && pr.id === team + '2');

      let p1Ids = saved1 && saved1.playerIds ? saved1.playerIds.slice() : [tp[0].id, tp[1].id];

      const block = el('div', { class: 'pairing-block' });
      block.appendChild(el('div', { class: 'pairing-title' }, [
        el('span', { class: 'team-chip ' + team }, ['TEAM ' + team])
      ]));

      // Pairing 1 selects
      const sel1 = el('select', {});
      const sel2 = el('select', {});
      tp.forEach(pl => {
        sel1.appendChild(el('option', { value: pl.id }, [pl.name || pl.id]));
        sel2.appendChild(el('option', { value: pl.id }, [pl.name || pl.id]));
      });
      sel1.value = p1Ids[0];
      sel2.value = p1Ids[1];

      const pairing2Label = el('div', { class: 'entry-readonly', style: 'text-align:left;' });
      function updatePairing2Label() {
        const remaining = tp.filter(pl => pl.id !== sel1.value && pl.id !== sel2.value);
        pairing2Label.textContent = remaining.map(pl => pl.name || pl.id).join(' & ') || '(select two different players above)';
      }
      updatePairing2Label();

      const gross1 = el('input', { type: 'number', inputmode: 'numeric', placeholder: 'Gross score', value: saved1 && saved1.gross !== undefined ? saved1.gross : '' });
      const gross2 = el('input', { type: 'number', inputmode: 'numeric', placeholder: 'Gross score', value: saved2 && saved2.gross !== undefined ? saved2.gross : '' });

      function enforceDistinct() {
        if (sel1.value === sel2.value) {
          // bump sel2 to the next player
          const other = tp.find(pl => pl.id !== sel1.value);
          if (other) sel2.value = other.id;
        }
        updatePairing2Label();
      }
      sel1.addEventListener('change', enforceDistinct);
      sel2.addEventListener('change', enforceDistinct);

      block.appendChild(el('div', { class: 'field-label' }, ['Pairing 1']));
      block.appendChild(el('div', { class: 'field-grid' }, [sel1, sel2, gross1]));
      block.appendChild(el('div', { class: 'field-label' }, ['Pairing 2 (remaining players)']));
      block.appendChild(el('div', { class: 'field-grid' }, [pairing2Label, gross2]));

      block.dataset.team = team;
      block._sel1 = sel1; block._sel2 = sel2; block._gross1 = gross1; block._gross2 = gross2; block._tp = tp;
      container.appendChild(block);
      container['_block_' + team] = block;
    });

    const saveBtn = el('button', { class: 'btn btn-primary', onclick: () => saveScrambleRound(round, container) }, ['Save Round']);
    const clearBtn = el('button', { class: 'btn btn-warn', onclick: () => clearRound(round) }, ['Clear Round']);
    container.appendChild(el('div', { class: 'row-actions' }, [saveBtn, clearBtn]));
  }

  function saveScrambleRound(round, container) {
    const pairings = [];
    ['A', 'B'].forEach(team => {
      const block = container['_block_' + team];
      const tp = block._tp;
      const id1 = block._sel1.value;
      const id2 = block._sel2.value;
      const remaining = tp.filter(pl => pl.id !== id1 && pl.id !== id2).map(pl => pl.id);
      const g1 = block._gross1.value;
      const g2 = block._gross2.value;
      pairings.push({
        id: team + '1', team: team, playerIds: [id1, id2],
        gross: (g1 !== '' && !Number.isNaN(Number(g1))) ? Number(g1) : ''
      });
      pairings.push({
        id: team + '2', team: team, playerIds: remaining,
        gross: (g2 !== '' && !Number.isNaN(Number(g2))) ? Number(g2) : ''
      });
    });
    state.scores[round.id] = { pairings: pairings };
    saveState();
    toast('Scores saved for ' + round.session);
    renderSchedule();
    renderTeamLeaderboard();
  }

  function renderTeam4Entry(round, container) {
    const existing = state.scores[round.id] || {};
    const aInput = el('input', { type: 'number', inputmode: 'numeric', placeholder: 'Team A gross', value: existing.teamA !== undefined ? existing.teamA : '' });
    const bInput = el('input', { type: 'number', inputmode: 'numeric', placeholder: 'Team B gross', value: existing.teamB !== undefined ? existing.teamB : '' });

    const card = el('div', { class: 'entry-card' }, [
      el('div', { class: 'field-label' }, [el('span', { class: 'team-chip A' }, ['TEAM A']), ' gross score']),
      aInput,
      el('div', { class: 'field-label' }, [el('span', { class: 'team-chip B' }, ['TEAM B']), ' gross score']),
      bInput
    ]);
    container.appendChild(card);

    const saveBtn = el('button', {
      class: 'btn btn-primary', onclick: () => {
        state.scores[round.id] = {
          teamA: (aInput.value !== '' && !Number.isNaN(Number(aInput.value))) ? Number(aInput.value) : '',
          teamB: (bInput.value !== '' && !Number.isNaN(Number(bInput.value))) ? Number(bInput.value) : ''
        };
        saveState();
        toast('Scores saved for ' + round.session);
        renderSchedule();
        renderTeamLeaderboard();
      }
    }, ['Save Round']);
    const clearBtn = el('button', { class: 'btn btn-warn', onclick: () => clearRound(round) }, ['Clear Round']);
    container.appendChild(el('div', { class: 'row-actions' }, [saveBtn, clearBtn]));
  }

  function clearRound(round) {
    delete state.scores[round.id];
    saveState();
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
        <p>Gross score is entered per player. Net score = Gross − Course Handicap. Players are ranked by net score (lowest first).</p>
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
        <p>All data is stored locally on this device. Use Export/Import on the Setup tab to back up or transfer the tournament data to another device.</p>
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
    refreshAll();
    toast('All scores reset');
  }

  function resetEverything() {
    if (!confirm('Reset EVERYTHING — players, teams and scores? This cannot be undone.')) return;
    state = defaultState();
    saveState();
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

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
