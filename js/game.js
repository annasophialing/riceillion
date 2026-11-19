/* =====================================================================
   RICEILLION — game logic */

// ---------- Settings ----------
const PROMPTS_PER_DAY = 5;
const SECONDS_PER_PROMPT = 25;
const METRES_PER_POINT = 10;
const MAX_POINTS = 100; // per prompt
const MAX_ALT = PROMPTS_PER_DAY * MAX_POINTS * METRES_PER_POINT; // 5000m = the moon
const LAUNCH_DATE = new Date(2026, 10, 19); // Flight #1 (months are 0-based: 10 = November)

// End-of-flight ranks. Same tiers as krillion (0–150, 151–250, 251–350, 351–449, 450+ out of 700),
// scaled to our 500-point max so the tiers are just as hard to reach.
const RANKS = [
  [0, "Owlet", "Still in the nest. Plenty of sky left up there."],
  [108, "Flocker", "Flying with the flock."],
  [179, "Rare", "Above the clouds. Nice."],
  [251, "Deep cut", "Seriously high flight."],
  [322, "One in a Riceillion", "Moon dweller. Absurd."],
];
function rankFor(score) {
  let r = RANKS[0];
  for (const rank of RANKS) if (score >= rank[0]) r = rank;
  return r;
}

// Altitude zones shown in the HUD
const ZONES = [
  [0, "THE QUAD"],
  [20, "THE TREETOPS"],
  [150, "OVER HOUSTON"],
  [600, "TWILIGHT"],
  [1500, "NIGHTFALL"],
  [3000, "THE MIDNIGHT HOUR"],
  [MAX_ALT, "THE MOON"],
];

// Labels drawn on the sky as the owl climbs: [metres, text, isZone]
const MARKERS = [
  [3, "eye level with Willy's statue"],
  [20, "above the live oaks"],
  [40, "the roofline of Lovett Hall"],
  [150, "the Medical Center towers glint below"],
  [305, "level with the Chase Tower — tallest in Texas"],
  [600, "TWILIGHT", true],
  [1000, "low clouds drift over Hermann Park"],
  [1500, "NIGHTFALL", true],
  [2000, "great horned owls don't fly this high"],
  [2500, "Galveston Bay glimmers to the southeast"],
  [3000, "THE MIDNIGHT HOUR", true],
  [3700, "Mission Control is watching (probably)"],
  [4300, "the air is thin and freezing"],
  [MAX_ALT, "the moon — a perfect flight ends here"],
];

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");

function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/^\s*the\s+/, "")
    .replace(/\s+/g, ""); // ignore spacing entirely
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// same as normalize() but keeps the words separate: "The Barn-Owl" -> ["barn", "owl"]
function words(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "") // "Torchy's" -> "torchys"
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "the");
}

// words too generic to guess from on their own ("owl" could be any owl)
const GENERIC_WORDS = new Set([
  "owl", "hall", "college", "of", "and", "a", "an", "in", "on", "to", "for", "center", "house", "lab",
  "school", "park", "museum", "garden", "gardens", "rice", "university", "building", "library", "with",
]);
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

function keysOf(ans) {
  return [ans[0], ...(ans[2] || [])];
}

/**
 * Turns the friendly formats in questions.js into [name, points, [aliases]]:
 *   "Name"                       -> uses the prompt's default points
 *   "Name|alias|alias"           -> same, with other spellings
 *   ["Name|alias", 30]           -> custom points
 *   ["Name", 30, ["alias"]]      -> the original format
 */
function prepareQuestion(q) {
  if (q._ready) return q;
  const def = q.points ?? 40;
  q.answers = q.answers.map((entry) => {
    const [text, pts, extra] = typeof entry === "string" ? [entry, def, []] : entry;
    const [name, ...aliases] = text.split("|").map((t) => t.trim());
    aliases.push(...(extra || []));
    if (q.lastNames) {
      const w = name.replace(/,/g, " ").split(/\s+/).filter((x) => !NAME_SUFFIXES.has(x.toLowerCase().replace(/\./g, "")));
      const last = w[w.length - 1];
      if (w.length > 1 && last.length >= 3) aliases.push(last);
      if (w.length > 2) aliases.push(w[0] + " " + last); // "Rebekah Anna Drezek" -> "Rebekah Drezek"
    }
    return [name, pts ?? def, aliases];
  });
  // phrases that don't matter for this prompt, e.g. "pub" on pub nights
  q._ignore = (q.ignoreWords || []).map((p) => words(p).join(" ")).sort((a, b) => b.length - a.length);
  q._keys = q.answers.map((ans) => keysOf(ans).map((k) => keyFor(q, k)));
  q._words = q.answers.map((ans) => keysOf(ans).map((k) => wordsFor(q, k)));
  q._ready = true;
  return q;
}

function wordsFor(q, s) {
  let t = " " + words(s).join(" ") + " ";
  for (const p of q._ignore || []) t = t.split(" " + p + " ").join(" ");
  const w = t.trim().split(/\s+/).filter(Boolean);
  return w.length ? w : words(s); // if everything was ignored ("pub"), keep it
}
function keyFor(q, s) {
  return wordsFor(q, s).join("");
}

/**
 * Looks up a player's answer.
 *   { ans, exact: true }   — matches an answer (ignoring case, spaces, punctuation)
 *   { ans, exact: false }  — close typo or partial answer: ask "did you mean…?"
 *   null                   — not on the list
 */
function findAnswer(question, input) {
  const q = prepareQuestion(question);
  const guess = keyFor(q, input);
  if (!guess) return null;

  // 1) exact match
  for (let i = 0; i < q.answers.length; i++) {
    if (q._keys[i].includes(guess)) return { ans: q.answers[i], exact: true };
  }

  const gw = wordsFor(q, input).filter((w) => !GENERIC_WORDS.has(w));

  // 1b) keyword prompts (FWIS titles): a shortened title counts if its main words are in the title
  if (q.keywordMatch && gw.join("").length >= 4) {
    const wordHit = (w, kw) => kw.some((k) => k === w || (w.length >= 4 && k.startsWith(w)) || (w.length >= 6 && levenshtein(k, w) <= 1));
    const hits = q.answers.filter((_, i) => q._words[i].some((kw) => gw.every((w) => wordHit(w, kw))));
    // too vague if it fits lots of titles (e.g. just "writing")
    if (hits.length && hits.length <= 3) return { ans: hits.reduce((a, b) => (b[1] < a[1] ? b : a)), exact: true };
  }

  // 2) typo: a few letters off
  let best = null, bestDist = Infinity;
  q.answers.forEach((ans, i) => {
    for (const key of q._keys[i]) {
      const allowed = key.length >= 10 ? 3 : key.length >= 7 ? 2 : key.length >= 5 ? 1 : 0;
      if (key.length < 7 && key[0] !== guess[0]) continue; // short words: "rice" shouldn't suggest "Price"
      const d = levenshtein(key, guess);
      if (d <= allowed && d < bestDist) { best = ans; bestDist = d; }
    }
  });
  if (best) return { ans: best, exact: false };

  // 3) partial: "barn" -> "Barn Owl", "horned" -> "Great Horned Owl"
  if (!gw.length || guess.length < 3) return null;
  const hits = q.answers.filter((_, i) =>
    q._words[i].some((kw, j) => gw.every((w) => kw.includes(w)) || (guess.length >= 4 && q._keys[i][j].startsWith(guess)))
  );
  return hits.length === 1 ? { ans: hits[0], exact: false } : null; // only suggest when it's unambiguous
}

// Seeded random numbers so every player gets the same daily prompts
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function flightNumber() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.round((today - LAUNCH_DATE) / 86400000) + 1);
}

/** Today's prompts: walk through one fixed shuffled order, PROMPTS_PER_DAY at a time. */
function dailyQuestions() {
  const n = QUESTIONS.length;
  const count = Math.min(PROMPTS_PER_DAY, n);
  const order = shuffled([...Array(n).keys()], mulberry32(20261119));
  const start = ((flightNumber() - 1) * count) % n;
  return Array.from({ length: count }, (_, i) => QUESTIONS[order[(start + i) % n]]);
}
function randomQuestions() {
  return shuffled(QUESTIONS, Math.random).slice(0, Math.min(PROMPTS_PER_DAY, QUESTIONS.length));
}

const storage = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- Pixel art ----------
// Each sprite is a grid of characters; each character is one pixel colour.
const OWL_COLORS = {
  D: "#3b2a1c", B: "#6e5a46", L: "#d8c3a0", W: "#f1e4c8",
  Y: "#ffc93c", K: "#111111", O: "#e8a33d",
};
const OWL_WINGS_OUT = [
  "...D........D...",
  "...DD......DD...",
  "...DBBBBBBBBD...",
  "..BWWWWBBWWWWB..",
  "..BWYYWBBWYYWB..",
  "..BWYKWBBWKYWB..",
  "..BWWWWOOWWWWB..",
  "..BBBBBOOBBBBB..",
  "DDBBLLLLLLLLBBDD",
  "DDBLLBLLLLBLLBDD",
  ".DBLLLLLLLLLLBD.",
  ".DBLLBLLLLBLLBD.",
  "..BBLLLLLLLLBB..",
  "...BBBBBBBBBB...",
  "....O.O..O.O....",
  "....O.O..O.O....",
];
const OWL_WINGS_UP = [
  "...D........D...",
  "...DD......DD...",
  "...DBBBBBBBBD...",
  "..BWWWWBBWWWWB..",
  "D.BWYYWBBWYYWB.D",
  "DDBWYKWBBWKYWBDD",
  ".DBWWWWOOWWWWBD.",
  "..BBBBBOOBBBBB..",
  "..BBLLLLLLLLBB..",
  "..BLLBLLLLBLLB..",
  "..BLLLLLLLLLLB..",
  "..BLLBLLLLBLLB..",
  "..BBLLLLLLLLBB..",
  "...BBBBBBBBBB...",
  "....O.O..O.O....",
  "....O.O..O.O....",
];
const blink = (rows) => rows.map((r, i) => (i === 4 || i === 5 ? r.replace(/[YK]/g, "D") : r));

function drawSprite(canvas, rows, colors) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (colors[ch]) { ctx.fillStyle = colors[ch]; ctx.fillRect(x, y, 1, 1); }
    });
  });
}

// owl animation: flap while flying, blink now and then while perched
let owlFrame = 0;
setInterval(() => {
  const flying = $("owl-wrap").classList.contains("flying");
  owlFrame++;
  let rows = flying ? (owlFrame % 2 ? OWL_WINGS_UP : OWL_WINGS_OUT) : OWL_WINGS_OUT;
  if (!flying && owlFrame % 24 === 0) rows = blink(rows);
  drawSprite($("owl"), rows, OWL_COLORS);
}, 140);
drawSprite($("owl"), OWL_WINGS_OUT, OWL_COLORS);

function drawMoon(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 24, 24);
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x - 11.5, y - 11.5);
      if (d > 11.5) continue;
      const lit = Math.hypot(x - 8, y - 8) < 9;
      ctx.fillStyle = d > 10.5 ? "#d9c88d" : lit ? "#fffbe8" : "#f1e3b0";
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = "#d9c88d"; // craters
  [[14, 6, 3, 2], [6, 14, 2, 2], [15, 15, 3, 3], [10, 10, 1, 1]].forEach(([x, y, w, h]) => ctx.fillRect(x, y, w, h));
}

function drawCloud() {
  const c = document.createElement("canvas");
  c.width = 24; c.height = 8;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3d5aa0";
  [[4, 3, 16, 4], [7, 1, 6, 2], [13, 2, 5, 1], [2, 5, 20, 2]].forEach((r) => ctx.fillRect(...r));
  ctx.fillStyle = "#5a78bd";
  [[7, 1, 6, 1], [4, 3, 6, 1], [13, 2, 4, 1]].forEach((r) => ctx.fillRect(...r));
  return c;
}

/** Pixel skyline: live oaks, Lovett Hall with its sallyport, and the ground. Drawn at 1/4 size. */
function drawCampus(canvas) {
  const W = Math.ceil(window.innerWidth / 4), H = 40;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const rect = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const blob = (c, cx, cy, r) => {
    for (let y = -r; y <= r; y++) {
      const half = Math.round(Math.sqrt(r * r - y * y) * 1.6);
      rect(c, cx - half, cy + y, half * 2, 1);
    }
  };
  const dark = "#050c26", leaf = "#08173f", leafHi = "#0f2457", glow = "#f6b26b", win = "#ffd98a";

  // live oaks along the whole width
  const r = mulberry32(3);
  for (let x = -10; x < W + 20; x += 26 + Math.floor(r() * 18)) {
    const h = 10 + Math.floor(r() * 6);
    rect(dark, x + 4, H - 14, 3, 14);
    blob(leaf, x + 5, H - 14 - h / 2, Math.floor(h / 2));
    blob(leafHi, x + 3, H - 16 - h / 2, Math.floor(h / 4));
  }

  // Lovett Hall, centred
  const cx = Math.floor(W / 2);
  rect(dark, cx - 44, H - 13, 88, 13); // long wings
  rect(dark, cx - 30, H - 18, 60, 18); // main block
  rect(dark, cx - 9, H - 30, 18, 30); // centre tower
  for (let i = 0; i < 5; i++) rect(dark, cx - 9 + i * 2, H - 31 - i, 18 - i * 4, 1); // stepped roof
  // glowing arches on the wings
  for (let x = cx - 42; x < cx + 42; x += 6) {
    if (Math.abs(x + 1 - cx) < 12) continue;
    rect(glow, x, H - 5, 3, 5);
    rect(glow, x + 1, H - 6, 1, 1);
  }
  // the sallyport
  rect(glow, cx - 3, H - 9, 6, 9);
  rect(glow, cx - 2, H - 10, 4, 1);
  // windows
  [cx - 6, cx - 1, cx + 4].forEach((x) => rect(win, x, H - 25, 2, 3));
  [cx - 26, cx - 20, cx - 14, cx + 12, cx + 18, cx + 24].forEach((x) => rect(win, x, H - 16, 2, 2));

  rect("#030818", 0, H - 1, W, 1); // ground line
}

// ---------- Sky rendering ----------
const sky = $("sky");
let skyHeight = 0;
const GROUND = 70; // px from bottom where altitude 0 sits

function altToY(alt) {
  // square-root scale so low landmarks don't all bunch together
  const usable = skyHeight - GROUND - 260;
  return GROUND + usable * Math.sqrt(Math.max(0, alt) / MAX_ALT);
}

function buildSky() {
  skyHeight = Math.max(3600, window.innerHeight * 5);
  sky.style.height = skyHeight + "px";

  const stars = $("stars");
  stars.innerHTML = "";
  const rand = mulberry32(7);
  for (let i = 0; i < 220; i++) {
    const s = document.createElement("div");
    s.className = "star";
    const h = 0.25 + rand() * 0.75; // fraction up the sky
    const size = rand() < 0.8 ? 3 : 6; // chunky square pixels
    s.style.cssText = `left:${rand() * 100}%;bottom:${h * 100}%;width:${size}px;height:${size}px;` +
      `opacity:${Math.min(1, (h - 0.2) * 1.3)};animation-delay:${(rand() * 2.4).toFixed(1)}s`;
    stars.appendChild(s);
  }

  const clouds = $("clouds");
  clouds.innerHTML = "";
  [[700, 8], [950, 62], [1200, 30], [1500, 78]].forEach(([alt, left]) => {
    const c = drawCloud();
    c.className = "cloud";
    c.style.left = left + "%";
    c.style.bottom = altToY(alt) + "px";
    clouds.appendChild(c);
  });

  drawMoon($("moon"));
  drawCampus($("campus"));

  const markers = $("markers");
  markers.innerHTML = "";
  MARKERS.forEach(([alt, text, zone], i) => {
    const m = document.createElement("div");
    m.className = "marker " + (i % 2 ? "r" : "l") + (zone ? " zone" : "");
    m.style.bottom = altToY(alt) + "px";
    m.innerHTML = `<span></span>`;
    m.firstChild.textContent = zone ? `── ${text} ──` : text;
    markers.appendChild(m);
  });

  $("moon").style.bottom = altToY(MAX_ALT) + 20 + "px";
  moveCamera(state.score * METRES_PER_POINT, true);
}

function moveCamera(alt, instant) {
  const owlY = $("owl-wrap").offsetTop + $("owl-wrap").offsetHeight * 0.85;
  const t = Math.max(0, owlY - window.innerHeight + altToY(alt));
  if (instant) sky.style.transition = "none";
  sky.style.transform = `translateY(${t}px)`;
  if (instant) { sky.offsetHeight; sky.style.transition = ""; }
}

function zoneFor(alt) {
  let z = ZONES[0][1];
  for (const [a, name] of ZONES) if (alt >= a) z = name;
  return z;
}

let hudAnim;
function setAltitude(fromScore, toScore) {
  cancelAnimationFrame(hudAnim);
  const start = performance.now(), dur = 1400;
  const step = (now) => {
    const k = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    const s = Math.round(fromScore + (toScore - fromScore) * e);
    $("score").textContent = s;
    $("alt").textContent = (s * METRES_PER_POINT).toLocaleString() + "m";
    $("zone").textContent = zoneFor(s * METRES_PER_POINT);
    if (k < 1) hudAnim = requestAnimationFrame(step);
  };
  hudAnim = requestAnimationFrame(step);
  // fallback in case animation frames are paused (background tab)
  clearTimeout(setAltitude.t);
  setAltitude.t = setTimeout(() => step(start + dur), dur + 100);
  moveCamera(toScore * METRES_PER_POINT);
  if (toScore > fromScore) {
    $("owl-wrap").classList.add("flying");
    setTimeout(() => $("owl-wrap").classList.remove("flying"), dur + 200);
  }
}

function hoot(text) {
  const h = $("hoot");
  h.textContent = text;
  show(h);
  h.style.animation = "none"; h.offsetHeight; h.style.animation = "";
  clearTimeout(hoot.t);
  hoot.t = setTimeout(() => hide(h), 1800);
}

// ---------- Game state ----------
const state = { mode: "daily", questions: [], idx: 0, score: 0, rounds: [], timer: null, deadline: 0, answered: false };

function startGame(mode) {
  state.mode = mode;
  state.questions = mode === "daily" ? dailyQuestions() : randomQuestions();
  state.idx = 0;
  const prev = state.score;
  state.score = 0;
  state.rounds = [];
  setAltitude(prev, 0);
  ["start", "how", "results"].forEach((id) => hide($(id)));
  show($("play"));
  nextPrompt();
}

function nextPrompt() {
  const q = prepareQuestion(state.questions[state.idx]);
  state.answered = false;
  state.pending = null;
  hide($("suggest"));
  $("round-label").textContent = `PROMPT ${state.idx + 1} / ${state.questions.length}`;
  $("prompt").textContent = q.prompt;
  hide($("feedback"));
  show($("answer-form"));
  const input = $("answer");
  input.value = "";
  input.disabled = false;
  input.focus();

  state.deadline = performance.now() + SECONDS_PER_PROMPT * 1000;
  const bar = $("timer-bar");
  bar.classList.remove("low");
  const tick = () => {
    if (state.answered) return;
    const left = state.deadline - performance.now();
    const frac = Math.max(0, left / (SECONDS_PER_PROMPT * 1000));
    bar.style.transform = `scaleX(${frac})`;
    bar.classList.toggle("low", left < 6000);
    if (left <= 0) return submitAnswer(true);
    state.timer = requestAnimationFrame(tick);
  };
  state.timer = requestAnimationFrame(tick);
}

function submitAnswer(timedOut) {
  if (state.answered) return;
  const raw = $("answer").value.trim();
  if (!timedOut && !raw) return;

  const q = state.questions[state.idx];
  let match = null;
  if (raw) {
    if (state.pending && normalize(raw) === state.pending.key) {
      match = state.pending.ans; // player confirmed "did you mean…?"
    } else {
      const found = findAnswer(q, raw);
      if (found && !found.exact && !timedOut) {
        // close but not exact: ask first, let them press HOOT again
        state.pending = { key: normalize(raw), ans: found.ans };
        const s = $("suggest");
        s.innerHTML = `Did you mean <b></b>?<small>press HOOT again to submit it, or keep typing</small>`;
        s.querySelector("b").textContent = found.ans[0];
        show(s);
        return; // timer keeps running
      }
      if (found) match = found.ans; // exact, or a close guess when the buzzer went
    }
  }
  state.answered = true;
  cancelAnimationFrame(state.timer);
  state.pending = null;
  hide($("suggest"));
  const pts = match ? match[1] : 0;
  state.rounds.push({ prompt: q.prompt, answer: raw, matched: match ? match[0] : null, pts });

  const prev = state.score;
  state.score += pts;
  setAltitude(prev, state.score);

  // feedback text
  let msg;
  if (!raw) msg = "Time's up! The owl dozed off.";
  else if (!match) msg = `“${raw}” isn't in the nest. No lift.`;
  else if (pts <= 15) msg = `${match[0]} — half of Baker said that too.`;
  else if (pts <= 40) msg = `${match[0]} — a respectable flap.`;
  else if (pts <= 70) msg = `${match[0]} — deep cut! Soaring.`;
  else msg = `${match[0]} — legendary. True Rice nerd.`;
  $("fb-result").textContent = msg;
  $("fb-points").textContent = `+${pts}`;
  hoot(pts === 0 ? "…hoo?" : pts > 70 ? "HOOOOO!" : pts > 40 ? "hoo hoo!" : "hoo!");

  // show the most common and the rarest answers
  const sorted = q.answers.slice().sort((a, b) => a[1] - b[1]);
  const common = sorted.slice(0, 4);
  const rare = sorted.slice(-4).reverse().filter((a) => !common.includes(a));
  const col = (title, list) => {
    const c = document.createElement("div");
    c.className = "col";
    c.innerHTML = `<h4>${title}</h4>`;
    list.forEach((a) => {
      const row = document.createElement("div");
      if (match && a === match) row.className = "you";
      row.innerHTML = `<span></span><b>${a[1]}</b>`;
      row.firstChild.textContent = a[0];
      c.appendChild(row);
    });
    return c;
  };
  const list = $("fb-list");
  list.innerHTML = "";
  list.appendChild(col("MOST OBVIOUS", common));
  list.appendChild(col("RAREST", rare));

  $("answer").disabled = true;
  hide($("answer-form"));
  show($("feedback"));
  $("btn-next").textContent = state.idx + 1 < state.questions.length ? "NEXT ▲" : "SEE MY FLIGHT ▲";
  $("btn-next").focus();
}

function finishGame() {
  hide($("play"));
  $("round-label").textContent = "";
  if (state.mode === "daily") {
    storage.set("riceillion-" + todayKey(), { flight: flightNumber(), score: state.score, rounds: state.rounds });
  }
  renderResults(state.mode, state.score, state.rounds);
}

function renderResults(mode, score, rounds) {
  const alt = score * METRES_PER_POINT;
  $("res-title").textContent = mode === "daily" ? `FLIGHT #${flightNumber()} COMPLETE` : "UNLIMITED FLIGHT";
  $("res-alt").textContent = alt.toLocaleString() + "m";
  const [, rankName, rankLine] = rankFor(score);
  $("res-rank").textContent = rankName;
  $("res-rank-line").textContent = rankLine;
  $("res-zone").textContent = `${score} points · ${zoneFor(alt).toLowerCase()}`;
  const rows = $("res-rows");
  rows.innerHTML = "";
  rounds.forEach((r) => {
    const d = document.createElement("div");
    d.innerHTML = `<span class="p"></span><span class="a"></span><span class="pts">${r.pts}</span>`;
    d.children[0].textContent = r.prompt;
    d.children[1].textContent = r.matched || (r.answer ? `“${r.answer}”` : "—");
    rows.appendChild(d);
  });
  $("share-note").textContent = mode === "daily" ? "Come back tomorrow night for a new flight." : "";
  show($("results"));
}

function shareText(score, rounds) {
  const icon = (p) => (p === 0 ? "⬛" : p <= 15 ? "🌳" : p <= 40 ? "☁️" : p <= 70 ? "🌙" : "⭐");
  const label = state.mode === "daily" ? `#${flightNumber()}` : "∞";
  return `Riceillion ${label} 🦉 ${(score * METRES_PER_POINT).toLocaleString()}m · ${rankFor(score)[1]}\n` +
    rounds.map((r) => icon(r.pts)).join("") + `\n${location.href.split("#")[0]}`;
}

// ---------- Wire up ----------
function initStart() {
  $("flight-no").textContent = `FLIGHT #${flightNumber()}`;
  const done = storage.get("riceillion-" + todayKey());
  $("btn-daily").textContent = done ? "SEE TONIGHT'S FLIGHT" : "▲ TAKE FLIGHT ▲";
}

$("btn-daily").onclick = () => {
  const done = storage.get("riceillion-" + todayKey());
  if (done) {
    state.mode = "daily";
    state.rounds = done.rounds;
    const prev = state.score;
    state.score = done.score;
    setAltitude(prev, done.score);
    hide($("start"));
    renderResults("daily", done.score, done.rounds);
  } else startGame("daily");
};
$("btn-unlimited").onclick = () => startGame("unlimited");
$("btn-again").onclick = () => startGame("unlimited");
$("btn-how").onclick = () => { hide($("start")); show($("how")); };
$("btn-how-close").onclick = () => { hide($("how")); show($("start")); };
$("answer-form").onsubmit = (e) => { e.preventDefault(); submitAnswer(false); };
$("answer").addEventListener("input", () => {
  // editing the answer cancels the "did you mean…?" suggestion
  if (state.pending && normalize($("answer").value) !== state.pending.key) {
    state.pending = null;
    hide($("suggest"));
  }
});
$("btn-next").onclick = () => {
  state.idx++;
  if (state.idx < state.questions.length) nextPrompt();
  else finishGame();
};
$("btn-share").onclick = async () => {
  const text = shareText(state.score, state.rounds);
  try {
    await navigator.clipboard.writeText(text);
    $("share-note").textContent = "Copied! Paste it in the group chat.";
  } catch {
    $("share-note").textContent = text;
  }
};
window.addEventListener("resize", buildSky);

buildSky();
initStart();
