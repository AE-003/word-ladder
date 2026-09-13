(() => {
  "use strict";

  const WORD_LEN = 4;
  const WORD_SET = new Set(WORDS);

  // ---- graph (built once, lazily on first hint/custom validation) ----
  let GRAPH = null;
  function buildGraph() {
    const buckets = new Map();
    for (const w of WORDS) {
      for (let i = 0; i < WORD_LEN; i++) {
        const key = w.slice(0, i) + "_" + w.slice(i + 1);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(w);
      }
    }
    const graph = new Map();
    for (const w of WORDS) graph.set(w, new Set());
    for (const list of buckets.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          graph.get(list[i]).add(list[j]);
          graph.get(list[j]).add(list[i]);
        }
      }
    }
    return graph;
  }
  function getGraph() {
    if (!GRAPH) GRAPH = buildGraph();
    return GRAPH;
  }

  function diffCount(a, b) {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
  }

  function bfsPath(start, target) {
    const graph = getGraph();
    if (!graph.has(start) || !graph.has(target)) return null;
    if (start === target) return [start];
    const prev = new Map([[start, null]]);
    const queue = [start];
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      if (cur === target) break;
      for (const nb of graph.get(cur)) {
        if (!prev.has(nb)) {
          prev.set(nb, cur);
          queue.push(nb);
        }
      }
    }
    if (!prev.has(target)) return null;
    const path = [];
    let cur = target;
    while (cur !== null) {
      path.push(cur);
      cur = prev.get(cur);
    }
    return path.reverse();
  }

  // ---- date / daily puzzle selection ----
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function daysSinceEpoch() {
    const d = new Date();
    const utcMidnight = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.floor(utcMidnight / 86400000);
  }
  function dailyPuzzle() {
    const idx = daysSinceEpoch() % PUZZLES.length;
    return { ...PUZZLES[idx], puzzleIndex: idx };
  }

  // ---- storage ----
  const STATS_KEY = "wordladder_stats_v1";
  const PROGRESS_KEY = "wordladder_daily_progress_v1";

  function loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, lastPlayedDate: null, distribution: {} };
  }
  function saveStats(s) {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  }
  function loadProgress() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }
  function saveProgress(p) {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  }

  // ---- state ----
  let mode = "daily";
  let puzzle = null; // {start, target, par}
  let chain = [];     // array of words including start, in order
  let hintsUsed = 0;
  let solved = false;
  let gaveUp = false;
  let locked = false; // daily already completed today

  // ---- DOM ----
  const el = {
    modeBtns: document.querySelectorAll(".mode-btn"),
    customPanel: document.getElementById("customPanel"),
    customStart: document.getElementById("customStart"),
    customTarget: document.getElementById("customTarget"),
    customGo: document.getElementById("customGo"),
    puzzleLabel: document.getElementById("puzzleLabel"),
    startWordDisplay: document.getElementById("startWordDisplay"),
    targetWordDisplay: document.getElementById("targetWordDisplay"),
    chain: document.getElementById("chain"),
    guessForm: document.getElementById("guessForm"),
    guessInput: document.getElementById("guessInput"),
    hintBtn: document.getElementById("hintBtn"),
    giveUpBtn: document.getElementById("giveUpBtn"),
    stepCounter: document.getElementById("stepCounter"),
    toast: document.getElementById("toast"),
    winModal: document.getElementById("winModal"),
    winTitle: document.getElementById("winTitle"),
    winDetail: document.getElementById("winDetail"),
    statsGrid: document.getElementById("statsGrid"),
    distChart: document.getElementById("distChart"),
    closeWin: document.getElementById("closeWin"),
    helpModal: document.getElementById("helpModal"),
    helpBtn: document.getElementById("helpBtn"),
    closeHelp: document.getElementById("closeHelp"),
    statsModal: document.getElementById("statsModal"),
    statsBtn: document.getElementById("statsBtn"),
    closeStats: document.getElementById("closeStats"),
    statsGridStandalone: document.getElementById("statsGridStandalone"),
    distChartStandalone: document.getElementById("distChartStandalone"),
  };

  let toastTimer = null;
  function showToast(msg, isError) {
    el.toast.textContent = msg;
    el.toast.classList.toggle("error", !!isError);
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 1600);
  }

  function makeTiles(word, opts) {
    opts = opts || {};
    const row = document.createElement("div");
    row.className = "chain-row";
    for (let i = 0; i < word.length; i++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.textContent = word[i];
      if (opts.target && word[i] === opts.target[i]) tile.classList.add("match");
      if (opts.prev && word[i] !== opts.prev[i]) tile.classList.add("changed");
      row.appendChild(tile);
    }
    return row;
  }

  function render() {
    el.startWordDisplay.innerHTML = "";
    el.targetWordDisplay.innerHTML = "";
    el.chain.innerHTML = "";

    if (!puzzle) return;

    el.startWordDisplay.appendChild(makeTiles(puzzle.start));
    const targetRow = makeTiles(puzzle.target, solved ? { target: puzzle.target } : {});
    el.targetWordDisplay.appendChild(targetRow);

    for (let i = 1; i < chain.length; i++) {
      const row = makeTiles(chain[i], { target: puzzle.target, prev: chain[i - 1] });
      el.chain.appendChild(row);
    }

    const steps = Math.max(0, chain.length - 1);
    el.stepCounter.textContent = `${steps} step${steps === 1 ? "" : "s"}${puzzle.par ? " · par " + puzzle.par : ""}`;

    const inputDisabled = solved || gaveUp || locked;
    el.guessInput.disabled = inputDisabled;
    el.hintBtn.disabled = inputDisabled;
    el.giveUpBtn.disabled = inputDisabled;
    el.guessInput.maxLength = puzzle.target.length;
    if (!inputDisabled) el.guessInput.focus();
  }

  function updatePuzzleLabel() {
    if (mode === "daily") {
      el.puzzleLabel.textContent = `Daily puzzle · ${todayKey()}`;
    } else if (mode === "random") {
      el.puzzleLabel.textContent = "Random practice puzzle";
    } else {
      el.puzzleLabel.textContent = "Custom puzzle — enter two 4-letter words";
    }
  }

  function startPuzzle(p) {
    puzzle = p;
    chain = [p.start];
    hintsUsed = 0;
    solved = false;
    gaveUp = false;
    locked = false;
    el.guessInput.value = "";
    render();
  }

  function setMode(newMode) {
    mode = newMode;
    el.modeBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === newMode));
    el.customPanel.classList.toggle("hidden", newMode !== "custom");
    updatePuzzleLabel();

    if (newMode === "daily") {
      const dp = dailyPuzzle();
      const progress = loadProgress();
      if (progress && progress.date === todayKey() && progress.puzzleIndex === dp.puzzleIndex) {
        puzzle = { start: dp.start, target: dp.target, par: dp.par };
        chain = progress.chain;
        hintsUsed = progress.hintsUsed || 0;
        solved = !!progress.solved;
        gaveUp = !!progress.gaveUp;
        locked = solved || gaveUp;
        el.guessInput.value = "";
        render();
        if (locked) {
          // silent restore, no modal auto-pop to avoid being annoying on every load
        }
      } else {
        startPuzzle(dp);
      }
    } else if (newMode === "random") {
      startPuzzle(pickRandomPuzzle());
    } else {
      puzzle = null;
      chain = [];
      render();
    }
  }

  function pickRandomPuzzle() {
    const p = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
    return { ...p };
  }

  function persistDailyProgress() {
    if (mode !== "daily") return;
    const dp = dailyPuzzle();
    saveProgress({
      date: todayKey(),
      puzzleIndex: dp.puzzleIndex,
      chain,
      hintsUsed,
      solved,
      gaveUp,
    });
  }

  function recordResult(won) {
    const stats = loadStats();
    const today = todayKey();
    if (stats.lastPlayedDate === today) {
      // already recorded today (shouldn't normally happen due to lock), skip double counting
      return;
    }
    stats.played += 1;
    if (won) {
      stats.wins += 1;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
      stats.currentStreak = stats.lastPlayedDate === yKey ? stats.currentStreak + 1 : 1;
      stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
      const steps = chain.length - 1;
      stats.distribution[steps] = (stats.distribution[steps] || 0) + 1;
    } else {
      stats.currentStreak = 0;
    }
    stats.lastPlayedDate = today;
    saveStats(stats);
  }

  function submitGuess(raw) {
    if (!puzzle || solved || gaveUp || locked) return;
    const word = raw.trim().toLowerCase();
    const last = chain[chain.length - 1];

    if (word.length !== puzzle.target.length) {
      showToast(`Word must be ${puzzle.target.length} letters`, true);
      return;
    }
    if (word === last) {
      showToast("Change at least one letter", true);
      return;
    }
    if (diffCount(word, last) !== 1) {
      showToast("Change exactly one letter", true);
      return;
    }
    if (!WORD_SET.has(word)) {
      showToast("Not a word I know", true);
      return;
    }
    if (chain.includes(word)) {
      showToast("Already used that word", true);
      return;
    }

    chain.push(word);
    el.guessInput.value = "";

    if (word === puzzle.target) {
      solved = true;
      locked = mode === "daily";
      if (mode === "daily") {
        recordResult(true);
      }
      render();
      persistDailyProgress();
      openWinModal(true);
    } else {
      render();
      persistDailyProgress();
    }
  }

  function openWinModal(won) {
    const steps = chain.length - 1;
    el.winTitle.textContent = won ? "Solved! 🎉" : "So close!";
    const parText = puzzle.par ? ` (par ${puzzle.par})` : "";
    el.winDetail.textContent = won
      ? `You reached "${puzzle.target.toUpperCase()}" in ${steps} step${steps === 1 ? "" : "s"}${parText}${hintsUsed ? `, using ${hintsUsed} hint${hintsUsed === 1 ? "" : "s"}` : ""}.`
      : `The answer was "${puzzle.target.toUpperCase()}".`;

    if (mode === "daily") {
      const stats = loadStats();
      renderStatsInto(el.statsGrid, el.distChart, stats);
    } else {
      el.statsGrid.innerHTML = "";
      el.distChart.innerHTML = "";
    }
    el.winModal.classList.remove("hidden");
  }

  function renderStatsInto(gridEl, distEl, stats) {
    const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
    gridEl.innerHTML = "";
    const items = [
      [stats.played, "Played"],
      [winPct + "%", "Win %"],
      [stats.currentStreak, "Streak"],
      [stats.maxStreak, "Max streak"],
    ];
    for (const [num, label] of items) {
      const wrap = document.createElement("div");
      wrap.innerHTML = `<div class="stat-num">${num}</div><div class="stat-label">${label}</div>`;
      gridEl.appendChild(wrap);
    }

    distEl.innerHTML = "";
    const dist = stats.distribution || {};
    const keys = Object.keys(dist).map(Number).sort((a, b) => a - b);
    const max = Math.max(1, ...keys.map((k) => dist[k]));
    const currentSteps = solved ? chain.length - 1 : -1;
    if (!keys.length) return;
    for (const k of keys) {
      const count = dist[k];
      const row = document.createElement("div");
      row.className = "dist-row";
      const pct = Math.max(6, Math.round((count / max) * 100));
      row.innerHTML = `<span class="dist-label">${k}</span><div class="dist-bar-wrap"><div class="dist-bar${k === currentSteps ? " today" : ""}" style="width:${pct}%">${count}</div></div>`;
      distEl.appendChild(row);
    }
  }

  function giveUp() {
    if (!puzzle || solved || gaveUp || locked) return;
    gaveUp = true;
    locked = mode === "daily";
    if (mode === "daily") {
      recordResult(false);
    }
    render();
    persistDailyProgress();
    openWinModal(false);
  }

  function useHint() {
    if (!puzzle || solved || gaveUp || locked) return;
    const last = chain[chain.length - 1];
    const path = bfsPath(last, puzzle.target);
    if (!path || path.length < 2) {
      showToast("No hint available", true);
      return;
    }
    hintsUsed++;
    el.guessInput.value = path[1].toUpperCase();
    el.guessInput.focus();
    showToast("Hint filled in — hit submit");
  }

  // ---- custom mode ----
  function buildCustomPuzzle() {
    const start = el.customStart.value.trim().toLowerCase();
    const target = el.customTarget.value.trim().toLowerCase();
    if (start.length !== WORD_LEN || target.length !== WORD_LEN) {
      showToast(`Both words must be ${WORD_LEN} letters`, true);
      return;
    }
    if (!WORD_SET.has(start) || !WORD_SET.has(target)) {
      showToast("Both must be real words I know", true);
      return;
    }
    if (start === target) {
      showToast("Pick two different words", true);
      return;
    }
    const path = bfsPath(start, target);
    if (!path) {
      showToast("No letter-chain connects those words", true);
      return;
    }
    startPuzzle({ start, target, par: path.length - 1 });
    showToast(`Puzzle ready — par ${path.length - 1}`);
  }

  // ---- wire up events ----
  el.modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  el.guessForm.addEventListener("submit", (e) => {
    e.preventDefault();
    submitGuess(el.guessInput.value);
  });

  el.guessInput.addEventListener("input", () => {
    el.guessInput.value = el.guessInput.value.replace(/[^a-zA-Z]/g, "").toUpperCase();
  });

  el.hintBtn.addEventListener("click", useHint);
  el.giveUpBtn.addEventListener("click", giveUp);

  el.customGo.addEventListener("click", buildCustomPuzzle);
  [el.customStart, el.customTarget].forEach((inp) => {
    inp.addEventListener("input", () => {
      inp.value = inp.value.replace(/[^a-zA-Z]/g, "").toUpperCase();
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") buildCustomPuzzle();
    });
  });

  el.closeWin.addEventListener("click", () => el.winModal.classList.add("hidden"));
  el.helpBtn.addEventListener("click", () => el.helpModal.classList.remove("hidden"));
  el.closeHelp.addEventListener("click", () => el.helpModal.classList.add("hidden"));
  el.statsBtn.addEventListener("click", () => {
    const stats = loadStats();
    renderStatsInto(el.statsGridStandalone, el.distChartStandalone, stats);
    el.statsModal.classList.remove("hidden");
  });
  el.closeStats.addEventListener("click", () => el.statsModal.classList.add("hidden"));

  [el.winModal, el.helpModal, el.statsModal].forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  });

  // first-time help
  if (!localStorage.getItem("wordladder_seen_help")) {
    el.helpModal.classList.remove("hidden");
    localStorage.setItem("wordladder_seen_help", "1");
  }

  setMode("daily");
})();
