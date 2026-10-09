const DURATION = 30;

const wordsEl = document.getElementById("words");
const wrapEl = document.getElementById("words-wrap");
const timerEl = document.getElementById("timer");
const liveWpmEl = document.getElementById("live-wpm");
const overlayEl = document.getElementById("focus-overlay");
const testEl = document.getElementById("test");
const resultsEl = document.getElementById("results");
const hiddenInput = document.getElementById("hidden-input");

const statWpm = document.getElementById("stat-wpm");
const statAcc = document.getElementById("stat-acc");
const statRaw = document.getElementById("stat-raw");
const statChars = document.getElementById("stat-chars");
const punctuationToggle = document.getElementById("punctuation-toggle");
const lowercaseToggle = document.getElementById("lowercase-toggle");
const historyToggle = document.getElementById("history-toggle");
const historyMenu = document.getElementById("history-menu");
const historyClose = document.getElementById("history-close");
const historyList = document.getElementById("history-list");
const historyMessage = document.getElementById("history-message");

const HISTORY_KEY = "benystyper-history";
const HISTORY_LIMIT = 10;

let words = [];
let wordIndex = 0;
let charIndex = 0;
let started = false;
let finished = false;
let activeElapsed = 0;
let runStartedAt = 0;
let remaining = DURATION;
let tickId = null;
let tabArmed = false;
let caretEl = null;

let correctChars = 0;
let incorrectChars = 0;
let extraChars = 0;
let typedChars = 0;
let historyEntries = [];

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildWords() {
  const pool = shuffle(SENTENCES);
  let text = pool.join(" ");
  if (lowercaseToggle.checked) text = text.toLowerCase();
  if (punctuationToggle.checked) text = text.replace(/\p{P}/gu, "");
  return text.split(/\s+/).filter(Boolean);
}

function renderWords() {
  wordsEl.scrollTop = 0;
  wordsEl.innerHTML = words
    .map((word, i) => {
      const letters = [...word]
        .map((ch, j) => `<span class="letter" data-i="${j}">${escapeHtml(ch)}</span>`)
        .join("");
      return `<span class="word" data-word="${i}">${letters}</span>`;
    })
    .join("");
  placeCaret();
}

function escapeHtml(ch) {
  return ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch;
}

function currentWordEl() {
  return wordsEl.querySelector(`[data-word="${wordIndex}"]`);
}

function placeCaret() {
  caretEl?.remove();
  const wordEl = currentWordEl();
  if (!wordEl) return;
  const letters = [...wordEl.querySelectorAll(".letter:not(.extra)")];
  caretEl = document.createElement("span");
  caretEl.className = "caret";
  if (charIndex >= letters.length) {
    const last = wordEl.lastElementChild;
    if (last) {
      caretEl.classList.add("end");
      last.appendChild(caretEl);
    }
  } else {
    letters[charIndex].appendChild(caretEl);
  }
}

function keepCurrentWordVisible() {
  const wordEl = currentWordEl();
  if (!wordEl) return;
  const containerTop = wordsEl.getBoundingClientRect().top;
  const currentTop = wordEl.getBoundingClientRect().top - containerTop + wordsEl.scrollTop;
  const currentBottom = currentTop + wordEl.offsetHeight;
  if (currentTop < wordsEl.scrollTop) {
    wordsEl.scrollTop = currentTop;
    return;
  }
  const visibleBottom = wordsEl.scrollTop + wordsEl.clientHeight;
  if (currentBottom > visibleBottom) {
    wordsEl.scrollTop = currentBottom - wordsEl.clientHeight;
  }
}

function startTimer() {
  started = true;
  activeElapsed = 0;
  runStartedAt = performance.now();
  remaining = DURATION;
  tickId = setInterval(updateTimer, 100);
}

function elapsedTime() {
  return activeElapsed + (tickId === null ? 0 : (performance.now() - runStartedAt) / 1000);
}

function updateTimer() {
  const elapsed = elapsedTime();
  remaining = Math.max(0, DURATION - elapsed);
  timerEl.textContent = String(Math.ceil(remaining));
  liveWpmEl.textContent = `${Math.round(wpm(correctChars, elapsed))} wpm`;
  if (remaining <= 0) finish();
}

function pauseTimer() {
  if (tickId === null) return;
  activeElapsed = elapsedTime();
  clearInterval(tickId);
  tickId = null;
  updateTimer();
}

function resumeTimer() {
  if (!started || finished || tickId !== null) return;
  runStartedAt = performance.now();
  tickId = setInterval(() => {
    updateTimer();
  }, 100);
}

function wpm(chars, seconds) {
  if (seconds <= 0) return 0;
  return chars / 5 / (seconds / 60);
}

function displayHistoryMessage(message, error) {
  historyMessage.textContent = message;
  if (error) console.error(message, error);
}

function isHistoryEntry(entry) {
  return entry
    && typeof entry.completedAt === "string"
    && Number.isFinite(Date.parse(entry.completedAt))
    && Number.isFinite(entry.wpm)
    && Number.isFinite(entry.rawWpm)
    && Number.isFinite(entry.accuracy)
    && Number.isFinite(entry.correctChars)
    && Number.isFinite(entry.incorrectChars)
    && Number.isFinite(entry.extraChars)
    && typeof entry.removePunctuation === "boolean"
    && typeof entry.lowercase === "boolean";
}

function renderHistory() {
  historyList.replaceChildren();
  if (!historyEntries.length) {
    const empty = document.createElement("li");
    empty.className = "text-xs text-mute";
    empty.textContent = "Completed tests will appear here.";
    historyList.appendChild(empty);
    return;
  }

  historyEntries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "border-b border-white/10 pb-3 last:border-0 last:pb-0";

    const result = document.createElement("div");
    result.className = "flex items-baseline justify-between";
    const wpmLabel = document.createElement("span");
    wpmLabel.className = "font-display text-lg text-caret";
    wpmLabel.textContent = `${entry.wpm} wpm`;
    const accuracyLabel = document.createElement("span");
    accuracyLabel.className = "text-xs text-paper";
    accuracyLabel.textContent = `${entry.accuracy}% acc`;
    result.append(wpmLabel, accuracyLabel);

    const details = document.createElement("p");
    details.className = "mt-1 text-[11px] text-mute";
    const settings = [
      entry.removePunctuation ? "no punctuation" : "punctuation",
      entry.lowercase ? "lowercase" : "mixed case",
    ];
    details.textContent = `${new Date(entry.completedAt).toLocaleString()} · raw ${entry.rawWpm} · ${settings.join(", ")}`;

    item.append(result, details);
    historyList.appendChild(item);
  });
}

function loadHistory() {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || !parsed.every(isHistoryEntry)) {
        throw new Error("Saved test history has an invalid format.");
      }
      historyEntries = parsed.slice(0, HISTORY_LIMIT);
    }
  } catch (error) {
    displayHistoryMessage("Could not load saved test history.", error);
  }
  renderHistory();
}

function saveCompletedTest(entry) {
  historyEntries = [entry, ...historyEntries].slice(0, HISTORY_LIMIT);
  renderHistory();
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyEntries));
    displayHistoryMessage("", null);
  } catch (error) {
    displayHistoryMessage("Could not save test history in this browser.", error);
  }
}

function setHistoryMenuOpen(open, returnFocus = false) {
  historyMenu.classList.toggle("hidden", !open);
  historyMenu.setAttribute("aria-hidden", String(!open));
  historyToggle.setAttribute("aria-expanded", String(open));
  if (open) {
    historyClose.focus();
  } else if (returnFocus) {
    historyToggle.focus();
  }
}

function finish() {
  if (finished) return;
  const elapsed = Math.min(DURATION, elapsedTime()) || DURATION;
  finished = true;
  clearInterval(tickId);
  tickId = null;
  const netWpm = Math.round(wpm(correctChars, elapsed));
  const rawWpm = Math.round(wpm(typedChars, elapsed));
  const acc = typedChars ? Math.round((correctChars / typedChars) * 100) : 100;
  saveCompletedTest({
    completedAt: new Date().toISOString(),
    wpm: netWpm,
    rawWpm,
    accuracy: acc,
    correctChars,
    incorrectChars,
    extraChars,
    removePunctuation: punctuationToggle.checked,
    lowercase: lowercaseToggle.checked,
  });

  testEl.classList.add("hidden");
  resultsEl.classList.remove("hidden");
  statWpm.textContent = String(netWpm);
  statAcc.textContent = `${acc}%`;
  statRaw.textContent = String(rawWpm);
  statChars.textContent = `${correctChars}/${incorrectChars}/${extraChars}`;
}

function reset() {
  clearInterval(tickId);
  tickId = null;
  words = buildWords();
  wordIndex = 0;
  charIndex = 0;
  started = false;
  finished = false;
  activeElapsed = 0;
  runStartedAt = 0;
  remaining = DURATION;
  correctChars = 0;
  incorrectChars = 0;
  extraChars = 0;
  typedChars = 0;
  tabArmed = false;
  timerEl.textContent = String(DURATION);
  liveWpmEl.textContent = "0 wpm";
  testEl.classList.remove("hidden");
  resultsEl.classList.add("hidden");
  renderWords();
  hiddenInput.focus();
  syncFocusUi();
}

function syncFocusUi() {
  const focused = document.activeElement === hiddenInput && !finished;
  overlayEl.classList.toggle("hidden", focused || finished);
  wrapEl.classList.toggle("unfocused", !focused && !finished);
  if (focused) resumeTimer();
  else pauseTimer();
}

function handleChar(ch) {
  if (finished) return;
  if (!started) startTimer();
  overlayEl.classList.add("hidden");

  const wordEl = currentWordEl();
  if (!wordEl) return;
  const expected = words[wordIndex];

  if (ch === " ") {
    if (charIndex < expected.length) {
      const letterEl = wordEl.querySelector(`.letter[data-i="${charIndex}"]`);
      letterEl.classList.add("incorrect");
      incorrectChars += 1;
      typedChars += 1;
      charIndex += 1;
      placeCaret();
      return;
    }
    wordIndex += 1;
    charIndex = 0;
    placeCaret();
    keepCurrentWordVisible();
    return;
  }

  if (charIndex >= expected.length) {
    const extra = document.createElement("span");
    extra.className = "letter extra";
    extra.textContent = ch;
    wordEl.appendChild(extra);
    extraChars += 1;
    typedChars += 1;
    charIndex += 1;
    placeCaret();
    return;
  }

  const letterEl = wordEl.querySelector(`.letter[data-i="${charIndex}"]`);
  const ok = expected[charIndex] === ch;
  letterEl.classList.add(ok ? "correct" : "incorrect");
  if (ok) correctChars += 1;
  else incorrectChars += 1;
  typedChars += 1;
  charIndex += 1;
  placeCaret();
}

function handleBackspace() {
  if (finished || !started) return;
  const wordEl = currentWordEl();
  if (!wordEl) return;

  const extras = [...wordEl.querySelectorAll(".letter.extra")];
  if (extras.length) {
    extras[extras.length - 1].remove();
    extraChars = Math.max(0, extraChars - 1);
    typedChars = Math.max(0, typedChars - 1);
    charIndex -= 1;
    placeCaret();
    return;
  }

  if (charIndex > 0) {
    charIndex -= 1;
    const letterEl = wordEl.querySelector(`.letter[data-i="${charIndex}"]`);
    if (letterEl.classList.contains("correct")) {
      correctChars = Math.max(0, correctChars - 1);
    } else if (letterEl.classList.contains("incorrect")) {
      incorrectChars = Math.max(0, incorrectChars - 1);
    }
    typedChars = Math.max(0, typedChars - 1);
    letterEl.className = "letter";
    letterEl.setAttribute("data-i", String(charIndex));
    placeCaret();
    return;
  }

  if (wordIndex === 0) return;
  wordIndex -= 1;
  const prevEl = wordsEl.querySelector(`[data-word="${wordIndex}"]`);
  if (!prevEl) {
    wordIndex += 1;
    return;
  }
  const prevExtras = [...prevEl.querySelectorAll(".letter.extra")];
  const baseLetters = [...prevEl.querySelectorAll(".letter:not(.extra)")];
  charIndex = baseLetters.length + prevExtras.length;
  placeCaret();
  keepCurrentWordVisible();
}

function onKeyDown(event) {
  if (event.key === "Tab") {
    event.preventDefault();
    tabArmed = true;
    return;
  }
  if (tabArmed && event.key === "Enter") {
    event.preventDefault();
    reset();
    return;
  }
  tabArmed = false;

  if (event.key === "Escape") {
    event.preventDefault();
    reset();
    return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    handleBackspace();
    return;
  }

  if (event.key === "Enter") return;

  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    handleChar(event.key);
  }
}

wrapEl.addEventListener("click", () => hiddenInput.focus());
hiddenInput.addEventListener("focus", syncFocusUi);
hiddenInput.addEventListener("blur", syncFocusUi);

document.addEventListener("keydown", (event) => {
  if (!historyMenu.classList.contains("hidden")) {
    if (event.key === "Escape") {
      event.preventDefault();
      setHistoryMenuOpen(false, true);
    }
    return;
  }
  if (document.activeElement !== hiddenInput) hiddenInput.focus();
  onKeyDown(event);
});

historyToggle.addEventListener("click", () => {
  setHistoryMenuOpen(historyMenu.classList.contains("hidden"));
});
historyClose.addEventListener("click", () => setHistoryMenuOpen(false, true));
document.addEventListener("pointerdown", (event) => {
  if (
    !historyMenu.classList.contains("hidden")
    && !historyMenu.contains(event.target)
    && event.target !== historyToggle
  ) {
    setHistoryMenuOpen(false);
  }
});

document.getElementById("restart").addEventListener("click", reset);
document.getElementById("restart-results").addEventListener("click", reset);
punctuationToggle.addEventListener("change", reset);
lowercaseToggle.addEventListener("change", reset);

loadHistory();
reset();
