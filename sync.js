// ---------------------------------------------------------------------------
// CloudSync: thin wrapper around Firebase Realtime Database (compat SDK).
// If Firebase isn't configured (see firebase-config.js) or fails to load,
// every method here becomes a safe no-op and app.js falls back to
// localStorage-only behaviour automatically - nothing breaks.
// ---------------------------------------------------------------------------

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  if (typeof root !== 'undefined') {
    root.CloudSync = mod;
  }
})(typeof window !== 'undefined' ? window : this, function () {

  // Change this if you want to host multiple tournaments in one Firebase
  // project - each path is a fully separate, independently-synced dataset.
  const DB_PATH = 'amendoeiraCup2026';

  let db = null;
  let connected = false;

  function isConfigured() {
    const cfg = (typeof window !== 'undefined') ? window.FIREBASE_CONFIG : null;
    return !!(cfg && cfg.databaseURL && cfg.databaseURL.indexOf('YOUR-PROJECT') === -1);
  }

  // onStatusChange(connected: boolean, reason: string) is called whenever
  // connection state changes, and once immediately with the initial state.
  function init(onStatusChange) {
    if (!isConfigured()) {
      connected = false;
      if (onStatusChange) onStatusChange(false, 'not-configured');
      return false;
    }
    if (typeof firebase === 'undefined') {
      connected = false;
      if (onStatusChange) onStatusChange(false, 'sdk-missing');
      return false;
    }
    try {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(window.FIREBASE_CONFIG);
      }
      db = firebase.database();
      db.ref('.info/connected').on('value', (snap) => {
        connected = !!(snap && snap.val());
        if (onStatusChange) onStatusChange(connected, connected ? 'connected' : 'disconnected');
      });
      return true;
    } catch (e) {
      console.error('Firebase init failed', e);
      connected = false;
      db = null;
      if (onStatusChange) onStatusChange(false, 'error');
      return false;
    }
  }

  function isAvailable() { return !!db; }
  function isConnected() { return connected; }

  // cb(playersArrayOrNull) fires immediately with current value, then again
  // on every remote change (including our own writes echoed back).
  function onPlayersChange(cb) {
    if (!db) return;
    db.ref(DB_PATH + '/players').on('value', (snap) => cb(snap ? snap.val() : null));
  }

  // cb(scoresObjectOrNull)
  function onScoresChange(cb) {
    if (!db) return;
    db.ref(DB_PATH + '/scores').on('value', (snap) => cb(snap ? snap.val() : null));
  }

  function savePlayers(players) {
    if (!db) return Promise.resolve(false);
    return db.ref(DB_PATH + '/players').set(players).then(() => true).catch((e) => {
      console.error('savePlayers failed', e); return false;
    });
  }

  // Granular leaf-level write - use this for anything that can happen
  // concurrently from more than one phone (individual hole scores, manual
  // totals, pairing composition). Writing only the specific leaf that
  // changed means two people editing different players/holes/pairings at
  // the same moment never clobber each other - unlike overwriting the
  // whole round's data on every keystroke.
  // path is relative, e.g. 'scores/d1/holes/p1/4' or 'scores/d2pm/pairings/A1/manualTotal'.
  function setPath(path, value) {
    if (!db) return Promise.resolve(false);
    return db.ref(DB_PATH + '/' + path).set(value).then(() => true).catch((e) => {
      console.error('setPath failed for ' + path, e); return false;
    });
  }

  function removePath(path) {
    if (!db) return Promise.resolve(false);
    return db.ref(DB_PATH + '/' + path).remove().then(() => true).catch((e) => {
      console.error('removePath failed for ' + path, e); return false;
    });
  }

  function saveRoundScore(roundId, data) {
    if (!db) return Promise.resolve(false);
    return db.ref(DB_PATH + '/scores/' + roundId).set(data).then(() => true).catch((e) => {
      console.error('saveRoundScore failed', e); return false;
    });
  }

  function clearRoundScore(roundId) {
    if (!db) return Promise.resolve(false);
    return db.ref(DB_PATH + '/scores/' + roundId).remove().then(() => true).catch((e) => {
      console.error('clearRoundScore failed', e); return false;
    });
  }

  function resetScores() {
    if (!db) return Promise.resolve(false);
    return db.ref(DB_PATH + '/scores').remove().then(() => true).catch((e) => {
      console.error('resetScores failed', e); return false;
    });
  }

  function resetAll() {
    if (!db) return Promise.resolve(false);
    return db.ref(DB_PATH).remove().then(() => true).catch((e) => {
      console.error('resetAll failed', e); return false;
    });
  }

  function importAll(players, scores) {
    if (!db) return Promise.resolve(false);
    return db.ref(DB_PATH).set({ players: players, scores: scores || {} }).then(() => true).catch((e) => {
      console.error('importAll failed', e); return false;
    });
  }

  return {
    init, isAvailable, isConnected,
    onPlayersChange, onScoresChange,
    savePlayers, saveRoundScore, clearRoundScore,
    setPath, removePath,
    resetScores, resetAll, importAll
  };
});
