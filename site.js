const newsList = document.querySelector("#news-list");
const calendarGrid = document.querySelector("#calendar-grid");
const calendarTitle = document.querySelector("#calendar-title");
const scheduleNote = document.querySelector("#schedule-note");
const prevMonthButton = document.querySelector("#prev-month");
const nextMonthButton = document.querySelector("#next-month");
const rankingPanel = document.querySelector(".ranking-panel");
const rankingHead = document.querySelector("#ranking-head");
const rankingBody = document.querySelector("#ranking-body");
const hallList = document.querySelector("#hall-list");
const pollEmpty = document.querySelector("#poll-empty");
const availabilityPoll = document.querySelector("#availability-poll");
const availabilityInfo = document.querySelector("#availability-info");
const availabilityForm = document.querySelector("#availability-form");
const availabilityOptions = document.querySelector("#availability-options");
const availabilityNote = document.querySelector("#availability-note");
const availabilityStatus = document.querySelector("#availability-status");
const suggestionPoll = document.querySelector("#suggestion-poll");
const suggestionInfo = document.querySelector("#suggestion-info");
const suggestionForm = document.querySelector("#suggestion-form");
const suggestionStatus = document.querySelector("#suggestion-status");
const gameVotePoll = document.querySelector("#game-vote-poll");
const gameVoteInfo = document.querySelector("#game-vote-info");
const gameVoteForm = document.querySelector("#game-vote-form");
const gameVoteOptions = document.querySelector("#game-vote-options");
const gameVoteStatus = document.querySelector("#game-vote-status");
const userContent = document.querySelector("#user-content");
let participantDialog = document.querySelector("#participant-dialog");
let participantForm = document.querySelector("#participant-form");
let participantCloseButton = document.querySelector("#participant-close");
let participantNameInput = document.querySelector("#participant-name");
let participantSaveButton = document.querySelector("#participant-save");
let participantStatus = document.querySelector("#participant-status");
let participantUiInitialized = false;

let visibleMonth = new Date();
visibleMonth.setDate(1);

const adminStore = {};
const remoteStore = {};
const pendingRemoteWrites = [];
let remotePollDataLoaded = false;
let adminSessionValidated = false;
let participantValidationPromise = null;
const clientStorageKeys = new Set(["adminSession", "pollParticipantName"]);
const defaultSupabaseConfig = {
  url: "https://brizdcpbzqqrkxunfiwl.supabase.co",
  anonKey: "sb_publishable_108t7jwS4__1lsxyac2kKw_7Tnb-6bZ",
};
const supabaseConfig = globalThis.PATALYMPICS_SUPABASE ?? defaultSupabaseConfig;
const supabaseEnabled = Boolean(supabaseConfig?.url && supabaseConfig?.anonKey);
const initialSiteData = {
  news: [],
  calendar: [],
  scheduleNote: { bodyHtml: "", height: 180, fontSize: 16 },
  polls: {
    availability: { published: false, info: "", startDate: "", endDate: "" },
    suggestions: { published: false, info: "" },
    gameVote: { published: false, info: "", groups: [] },
  },
  ranking: {
    mode: "solo",
    days: [
      {
        label: "Day 1",
        games: ["Game 1", "Game 2", "Game 3", "Game 4", "Game 5"],
      },
      {
        label: "Day 2",
        games: ["Game 1", "Game 2", "Game 3", "Game 4", "Game 5"],
      },
    ],
    players: [],
  },
  hallOfFame: [],
};

function getSupabaseProjectUrl() {
  return supabaseConfig.url
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/$/, "");
}

function normalizeAdminName(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
}

function getAdminLoginEmail(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed.toLowerCase();

  const normalizedName = normalizeAdminName(trimmed);
  return normalizedName ? `${normalizedName}@patalympics.admin` : "";
}

async function resolveAdminLoginEmail(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes("@") || !supabaseEnabled) return getAdminLoginEmail(trimmed);

  try {
    const response = await fetch(`${getSupabaseProjectUrl()}/rest/v1/rpc/resolve_admin_login`, {
      method: "POST",
      headers: getSupabaseHeaders(supabaseConfig.anonKey),
      body: JSON.stringify({ login_value: trimmed }),
    });
    const resolvedEmail = await response.json().catch(() => "");
    if (response.ok && typeof resolvedEmail === "string" && resolvedEmail.includes("@")) {
      return resolvedEmail.toLowerCase();
    }
  } catch {
  }

  return getAdminLoginEmail(trimmed);
}

function getSavedAdminSession() {
  return getClientJson("adminSession", null);
}

function setSavedAdminSession(session) {
  if (session) {
    setClientJson("adminSession", session);
  } else {
    removeClientJson("adminSession");
  }
}

function clearAdminSession() {
  adminSessionValidated = false;
  setSavedAdminSession(null);
  document.dispatchEvent(new CustomEvent("admin-state-change"));
}

function mapAuthSession(payload) {
  if (!payload?.access_token || !payload?.refresh_token) return null;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + Number(payload.expires_in ?? 0) * 1000,
    user: {
      id: payload.user?.id ?? "",
      email: payload.user?.email ?? "",
    },
    isAdmin: false,
  };
}

async function hasAdminAccess(token) {
  if (!supabaseEnabled || !token) return false;

  try {
    const response = await fetch(`${getSupabaseProjectUrl()}/rest/v1/admin_users?select=user_id&limit=1`, {
      headers: getSupabaseHeaders(token),
    });
    if (!response.ok) return false;
    const rows = await response.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

function getStoredJson(key, fallback) {
  try {
    if (Object.prototype.hasOwnProperty.call(remoteStore, key)) {
      return remoteStore[key] ?? fallback;
    }
    const storedValue = adminStore[key];
    return JSON.parse(storedValue) ?? fallback;
  } catch {
    return fallback;
  }
}

function getClientJson(key, fallback) {
  if (!clientStorageKeys.has(key)) return fallback;

  try {
    if (key === "adminSession") {
      globalThis.localStorage?.removeItem(key);
    }
    const storage = key === "adminSession" ? globalThis.sessionStorage : globalThis.localStorage;
    const storedValue = storage?.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallback;
  } catch {
    return fallback;
  }
}

function setClientJson(key, value) {
  if (!clientStorageKeys.has(key)) return;

  try {
    if (key === "adminSession") {
      globalThis.localStorage?.removeItem(key);
    }
    const storage = key === "adminSession" ? globalThis.sessionStorage : globalThis.localStorage;
    storage?.setItem(key, JSON.stringify(value));
  } catch {
  }
}

function removeClientJson(key) {
  if (!clientStorageKeys.has(key)) return;

  try {
    globalThis.localStorage?.removeItem(key);
    globalThis.sessionStorage?.removeItem(key);
  } catch {
  }
}

function setStoredJson(key, value) {
  const serializedValue = JSON.stringify(value);
  remoteStore[key] = value;
  adminStore[key] = serializedValue;
  syncRemoteData(key, value);
}

async function loadLocalData(storeKey, fallback) {
  const remoteValue = await loadRemoteSiteContent(storeKey);
  if (remoteValue !== null) {
    remoteStore[storeKey] = remoteValue;
    return remoteValue;
  }

  const storedValue = getStoredJson(storeKey, null);
  if (storedValue !== null) return storedValue;
  return JSON.parse(JSON.stringify(fallback));
}

async function refreshAdminSession() {
  const session = getSavedAdminSession();
  if (!supabaseEnabled || !session?.refreshToken) return null;

  try {
    const response = await fetch(`${getSupabaseProjectUrl()}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${supabaseConfig.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });

    if (!response.ok) throw new Error(`Supabase auth ${response.status}`);
    const payload = await response.json();
    const nextSession = mapAuthSession(payload);
    if (!nextSession) throw new Error("Session ungültig");
    nextSession.isAdmin = await hasAdminAccess(nextSession.accessToken);
    if (!nextSession.isAdmin) throw new Error("Kein Admin-Zugang");
    adminSessionValidated = true;
    setSavedAdminSession(nextSession);
    document.dispatchEvent(new CustomEvent("admin-state-change"));
    return nextSession;
  } catch {
    clearAdminSession();
    return null;
  }
}

async function validateAdminSession(session) {
  if (!session?.accessToken) return null;
  const isAdmin = await hasAdminAccess(session.accessToken);
  if (!isAdmin) {
    clearAdminSession();
    return null;
  }

  adminSessionValidated = true;
  const nextSession = { ...session, isAdmin: true };
  setSavedAdminSession(nextSession);
  document.dispatchEvent(new CustomEvent("admin-state-change"));
  return nextSession;
}

async function ensureAdminSession() {
  const session = getSavedAdminSession();
  if (!session) return null;

  if (session.expiresAt > Date.now() + 30 * 1000) {
    if (!adminSessionValidated || !session.isAdmin) return validateAdminSession(session);
    return session;
  }
  return refreshAdminSession();
}

async function signInAdmin(loginName, password) {
  if (!supabaseEnabled) return { session: null, error: "Supabase ist nicht aktiv." };
  const email = await resolveAdminLoginEmail(loginName);
  if (!email) return { session: null, error: "Bitte einen Admin-Namen eingeben." };

  try {
    const response = await fetch(`${getSupabaseProjectUrl()}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${supabaseConfig.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { session: null, error: payload.msg || payload.error_description || "Login fehlgeschlagen." };
    }

    const session = mapAuthSession(payload);
    if (!session) {
      return { session: null, error: "Session konnte nicht gelesen werden." };
    }
    session.isAdmin = await hasAdminAccess(session.accessToken);
    if (!session.isAdmin) {
      clearAdminSession();
      return { session: null, error: "Dieser Account hat keinen Admin-Zugang." };
    }
    adminSessionValidated = true;
    setSavedAdminSession(session);
    document.dispatchEvent(new CustomEvent("admin-state-change"));
    return { session, error: "" };
  } catch {
    return { session: null, error: "Login konnte nicht aufgebaut werden." };
  }
}

function getSupabaseHeaders(token, extra = {}) {
  return {
    apikey: supabaseConfig.anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseFetch(path, options = {}) {
  if (!supabaseEnabled) return null;

  try {
    const token = (await ensureAdminSession())?.accessToken ?? supabaseConfig.anonKey;
    const response = await fetch(`${getSupabaseProjectUrl()}/rest/v1/${path}`, {
      ...options,
      headers: getSupabaseHeaders(token, options.headers),
    });

    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    if (response.status === 204) return true;
    const text = await response.text();
    return text ? JSON.parse(text) : true;
  } catch {
    return null;
  }
}

async function loadRemoteSiteContent(key) {
  const result = await supabaseFetch(`site_content?key=eq.${encodeURIComponent(key)}&select=value`);
  return Array.isArray(result) && result[0] ? result[0].value : null;
}

function saveRemoteSiteContent(key, value) {
  return supabaseFetch("site_content?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key, value }),
  });
}

function deleteRemoteRows(path) {
  return supabaseFetch(path, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

function queueRemoteWrite(request) {
  if (request?.then) pendingRemoteWrites.push(request);
  return request;
}

function syncRemoteData(key, value) {
  if (!supabaseEnabled) return;

  if (key.startsWith("admin")) {
    queueRemoteWrite(saveRemoteSiteContent(key, value));
  }
}

async function loadRemotePollData() {
  if (!supabaseEnabled || remotePollDataLoaded) return;

  const [availability, suggestions, votes] = await Promise.all([
    supabaseFetch("poll_availability_answers?select=id,participant_name,answers,note,updated_at"),
    supabaseFetch("poll_game_suggestions?select=id,participant_name,suggestion,created_at&order=created_at.asc"),
    supabaseFetch("poll_game_votes?select=id,participant_name,answers,updated_at"),
  ]);

  if (Array.isArray(availability)) {
    remoteStore.pollAvailabilityAnswers = {
      participants: availability.map((entry) => ({
        id: entry.id,
        name: entry.participant_name,
        answers: entry.answers ?? {},
        note: entry.note ?? "",
        updatedAt: entry.updated_at ?? "",
      })),
    };
  }

  if (Array.isArray(suggestions)) {
    remoteStore.pollGameSuggestions = suggestions.map((entry) => ({
      id: entry.id,
      name: entry.participant_name,
      text: entry.suggestion,
      createdAt: entry.created_at,
    }));
  }

  if (Array.isArray(votes)) {
    remoteStore.pollGameVoteAnswers = {
      participants: votes.map((entry) => ({
        id: entry.id,
        name: entry.participant_name,
        answers: entry.answers ?? [],
        updatedAt: entry.updated_at ?? "",
      })),
    };
  }

  remotePollDataLoaded = true;
}

function saveRemoteAvailabilityEntry(entry) {
  return supabaseFetch("poll_availability_answers?on_conflict=participant_name", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      participant_name: entry.name,
      answers: entry.answers,
      note: entry.note ?? "",
      updated_at: entry.updatedAt ?? new Date().toISOString(),
    }),
  });
}

function saveRemoteSuggestionEntry(entry) {
  return supabaseFetch("poll_game_suggestions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      participant_name: entry.name,
      suggestion: entry.text,
      created_at: entry.createdAt ?? new Date().toISOString(),
    }),
  });
}

function saveRemoteGameVoteEntry(entry) {
  return supabaseFetch("poll_game_votes?on_conflict=participant_name", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      participant_name: entry.name,
      answers: entry.answers,
      updated_at: entry.updatedAt ?? new Date().toISOString(),
    }),
  });
}

function deleteRemoteAvailabilityEntry(name) {
  return deleteRemoteRows(`poll_availability_answers?participant_name=eq.${encodeURIComponent(name)}`);
}

function deleteRemoteSuggestionEntry(id) {
  return deleteRemoteRows(`poll_game_suggestions?id=eq.${encodeURIComponent(id)}`);
}

function deleteRemoteGameVoteEntry(name) {
  return deleteRemoteRows(`poll_game_votes?participant_name=eq.${encodeURIComponent(name)}`);
}

async function loadRemoteParticipants() {
  const result = await supabaseFetch("participants?select=id,participant_name,created_at&order=created_at.asc");
  if (!Array.isArray(result)) return [];
  return result.map((entry) => ({
    id: entry.id,
    name: entry.participant_name,
    createdAt: entry.created_at ?? "",
  }));
}

function saveRemoteParticipantEntry(name) {
  return supabaseFetch("rpc/register_participant", {
    method: "POST",
    body: JSON.stringify({
      participant_name_input: name,
    }),
  });
}

function remoteParticipantExists(name) {
  return supabaseFetch("rpc/participant_exists", {
    method: "POST",
    body: JSON.stringify({ participant_name_input: name }),
  });
}

function deleteRemoteParticipantEntry(name) {
  return supabaseFetch("rpc/admin_delete_participant", {
    method: "POST",
    body: JSON.stringify({ participant_name_input: name }),
  });
}

function updateRemoteParticipantName(oldName, newName) {
  return supabaseFetch("rpc/admin_rename_participant", {
    method: "POST",
    body: JSON.stringify({ old_name: oldName, new_name: newName }),
  });
}

function formatDate(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function plainTextToHtml(value = "") {
  return String(value)
    .split(/\n+/)
    .map((line) => `<p>${line.replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    })[char]) || "<br>"}</p>`)
    .join("");
}

function sanitizeRichText(value = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = String(value);
  wrap.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((element) => element.remove());

  wrap.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "href" || name === "src") {
        element.removeAttribute(attribute.name);
        return;
      }

      if (name === "style") {
        const fontSize = element.style.fontSize;
        const textAlign = element.style.textAlign;
        element.removeAttribute("style");
        if (/^\d{1,2}px$/.test(fontSize)) element.style.fontSize = fontSize;
        if (/^(left|center|right)$/i.test(textAlign)) element.style.textAlign = textAlign;
        return;
      }

      if (!["class"].includes(name)) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return wrap.innerHTML;
}

function normalizeEditorHtml(value = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = value;
  const sizeMap = {
    1: "12px",
    2: "14px",
    3: "16px",
    4: "18px",
    5: "22px",
    6: "26px",
    7: "32px",
  };

  wrap.querySelectorAll("font[size]").forEach((font) => {
    const span = document.createElement("span");
    span.style.fontSize = sizeMap[font.getAttribute("size")] || "16px";
    span.innerHTML = font.innerHTML;
    font.replaceWith(span);
  });

  return sanitizeRichText(wrap.innerHTML);
}

function getRichBodyHtml(item) {
  return sanitizeRichText(item?.bodyHtml || plainTextToHtml(item?.body || ""));
}

function hasRichTextContent(value = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = sanitizeRichText(value);
  return wrap.textContent.replace(/\u00a0/g, " ").trim().length > 0;
}

function createRichTextEditor(value = "", options = {}) {
  const wrap = document.createElement("div");
  wrap.className = "rich-editor";

  const toolbar = document.createElement("div");
  toolbar.className = "rich-editor-toolbar";

  const editor = document.createElement("div");
  editor.className = "rich-editor-area";
  editor.contentEditable = "true";
  editor.innerHTML = sanitizeRichText(value);
  editor.style.minHeight = `${Math.max(90, Number(options.height) || 150)}px`;

  const runCommand = (command, commandValue = null) => {
    editor.focus();
    document.execCommand(command, false, commandValue);
  };

  [
    ["B", "bold"],
    ["I", "italic"],
    ["U", "underline"],
    ["•", "insertUnorderedList"],
    ["1.", "insertOrderedList"],
    ["L", "justifyLeft"],
    ["M", "justifyCenter"],
    ["R", "justifyRight"],
  ].forEach(([label, command]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => runCommand(command));
    toolbar.append(button);
  });

  const sizeSelect = document.createElement("select");
  [
    ["3", "16"],
    ["2", "14"],
    ["4", "18"],
    ["5", "22"],
    ["6", "26"],
    ["7", "32"],
  ].forEach(([valueOption, label]) => {
    const option = document.createElement("option");
    option.value = valueOption;
    option.textContent = `${label}px`;
    sizeSelect.append(option);
  });
  sizeSelect.addEventListener("change", () => runCommand("fontSize", sizeSelect.value));
  toolbar.append(sizeSelect);

  wrap.append(toolbar, editor);

  return {
    element: wrap,
    getHtml: () => normalizeEditorHtml(editor.innerHTML),
    editor,
  };
}

function createNewsItem(item) {
  const article = document.createElement("article");
  article.className = "news-item";

  const meta = document.createElement("p");
  meta.className = "news-meta";
  meta.textContent = [formatDate(item.date), item.author].filter(Boolean).join(" / ");

  const title = document.createElement("h2");
  title.textContent = item.title;

  const body = document.createElement("div");
  body.className = "news-body";
  body.innerHTML = getRichBodyHtml(item);

  if (meta.textContent) article.append(meta);
  article.append(title, body);

  return article;
}

async function loadNews() {
  if (!newsList) return;

  try {
    const items = await loadLocalData("adminNewsData", initialSiteData.news);
    const publishedItems = items
      .filter((item) => item.published)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    newsList.replaceChildren();

    if (!publishedItems.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Noch keine Rules veröffentlicht.";
      newsList.append(empty);
      return;
    }

    newsList.append(...publishedItems.map(createNewsItem));
  } catch {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Rules konnten nicht geladen werden.";
    newsList.replaceChildren(empty);
  }
}

loadNews();

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthName(date) {
  return new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function groupEventsByDate(events) {
  return events.reduce((grouped, event) => {
    if (!event.published || !event.date) return grouped;
    grouped[event.date] ??= [];
    grouped[event.date].push(event);
    return grouped;
  }, {});
}

function createCalendarDay(date, events) {
  const day = document.createElement("article");
  day.className = "calendar-day";
  if (events.length) {
    day.classList.add("has-event");
  }

  const dateLabel = document.createElement("span");
  dateLabel.className = "calendar-date";
  dateLabel.textContent = String(date.getDate());
  day.append(dateLabel);

  if (events.length) {
    const list = document.createElement("div");
    list.className = "calendar-events";

    events.forEach((event) => {
      const item = document.createElement("p");
      item.className = "calendar-event";
      item.textContent = [event.time, event.title].filter(Boolean).join(" ");
      list.append(item);
    });

    day.append(list);
  }

  return day;
}

async function loadCalendar() {
  if (!calendarGrid || !calendarTitle) return;

  try {
    const events = await loadLocalData("adminCalendarData", initialSiteData.calendar);
    const eventsByDate = groupEventsByDate(events);
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingDays = (firstDay.getDay() + 6) % 7;

    calendarTitle.textContent = getMonthName(visibleMonth);
    calendarGrid.replaceChildren();

    for (let index = 0; index < leadingDays; index += 1) {
      const emptyDay = document.createElement("span");
      emptyDay.className = "calendar-day calendar-day-empty";
      calendarGrid.append(emptyDay);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const dateEvents = eventsByDate[toDateKey(date)] ?? [];
      calendarGrid.append(createCalendarDay(date, dateEvents));
    }
  } catch {
    calendarGrid.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Schedule konnte nicht geladen werden.";
    calendarGrid.append(empty);
  }
}

async function loadScheduleNote() {
  if (!scheduleNote) return;

  const note = await loadLocalData("adminScheduleNoteData", initialSiteData.scheduleNote);
  const bodyHtml = sanitizeRichText(note?.bodyHtml || "");
  scheduleNote.replaceChildren();
  scheduleNote.hidden = !hasRichTextContent(bodyHtml);
  if (!hasRichTextContent(bodyHtml)) return;

  const content = document.createElement("div");
  content.className = "schedule-note-content";
  content.style.minHeight = `${Math.max(80, Math.min(800, Number(note.height) || 180))}px`;
  content.style.fontSize = `${Math.max(12, Math.min(34, Number(note.fontSize) || 16))}px`;
  content.innerHTML = bodyHtml;
  scheduleNote.append(content);
}

prevMonthButton?.addEventListener("click", () => {
  visibleMonth.setMonth(visibleMonth.getMonth() - 1);
  loadCalendar();
});

nextMonthButton?.addEventListener("click", () => {
  visibleMonth.setMonth(visibleMonth.getMonth() + 1);
  loadCalendar();
});

loadCalendar();
loadScheduleNote();

function getTrendSymbol(trend) {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  return "";
}

function createCell(value, className = "", tagName = "td") {
  const cell = document.createElement(tagName);
  if (tagName === "th") cell.scope = "col";
  if (className) cell.className = className;
  cell.textContent = value ?? "";
  return cell;
}

function flattenRankingColumns(days) {
  return days.flatMap((day, dayIndex) => [
    {
      key: `day${dayIndex + 1}`,
      label: day.label ?? `Day ${dayIndex + 1}`,
      type: "day",
      gameKeys: (day.games ?? []).map((_, gameIndex) => `day${dayIndex + 1}Game${gameIndex + 1}`),
    },
    ...(day.games ?? []).map((game, gameIndex) => ({
      key: `day${dayIndex + 1}Game${gameIndex + 1}`,
      label: game,
      type: "game",
    })),
  ]);
}

function getScoreValue(scores, key) {
  const value = Number(scores[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getDayTotal(scores, column) {
  return (column.gameKeys ?? []).reduce((total, key) => total + getScoreValue(scores, key), 0);
}

function getMvpPoints(player) {
  const value = Number(player.mvp ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getTotalPoints(player, scores, columns) {
  const dayPoints = columns
    .filter((column) => column.type === "day")
    .reduce((total, column) => total + getDayTotal(scores, column), 0);

  return dayPoints + getMvpPoints(player) * 2;
}

function getGameColumns(columns) {
  return columns.filter((column) => column.type === "game");
}

function hasScore(scores, key) {
  return Object.prototype.hasOwnProperty.call(scores, key) && scores[key] !== "";
}

function getLatestEnteredGameIndex(players, gameColumns) {
  for (let index = gameColumns.length - 1; index >= 0; index -= 1) {
    const key = gameColumns[index].key;
    if (players.some((player) => hasScore(player.scores ?? {}, key))) {
      return index;
    }
  }

  return -1;
}

function getPointsUntilGame(player, gameColumns, gameIndex) {
  const scores = player.scores ?? {};
  const mvpPoints = getMvpPoints(player) * 2;
  if (gameIndex < 0) return mvpPoints;

  const gamePoints = gameColumns
    .slice(0, gameIndex + 1)
    .reduce((total, column) => total + getScoreValue(scores, column.key), 0);

  return gamePoints + mvpPoints;
}

function getRankMap(players, gameColumns, gameIndex) {
  return [...players]
    .sort((a, b) => {
      const pointDifference = getPointsUntilGame(b, gameColumns, gameIndex) - getPointsUntilGame(a, gameColumns, gameIndex);
      return pointDifference || (a.name ?? "").localeCompare(b.name ?? "");
    })
    .reduce((rankMap, player, index) => {
      rankMap.set(player, index + 1);
      return rankMap;
    }, new Map());
}

function applyRankingPlacesAndTrends(players, columns) {
  const gameColumns = getGameColumns(columns);
  const latestGameIndex = getLatestEnteredGameIndex(players, gameColumns);
  const previousRankMap = getRankMap(players, gameColumns, latestGameIndex - 1);
  const currentRankMap = getRankMap(players, gameColumns, latestGameIndex);

  return [...players]
    .sort((a, b) => {
      const pointDifference =
        getTotalPoints(b, b.scores ?? {}, columns) - getTotalPoints(a, a.scores ?? {}, columns);
      return pointDifference || (a.name ?? "").localeCompare(b.name ?? "");
    })
    .map((player, index) => {
      const currentRank = currentRankMap.get(player) ?? index + 1;
      const previousRank = previousRankMap.get(player) ?? currentRank;
      let trend = "same";

      if (latestGameIndex > 0 && currentRank < previousRank) trend = "up";
      if (latestGameIndex > 0 && currentRank > previousRank) trend = "down";

      return {
        ...player,
        place: index + 1,
        trend,
      };
    });
}

function createRankingHeader(columns, mode = "solo") {
  const row = document.createElement("tr");
  const headers = ["Platz", mode === "duo" ? "Duo" : "Spieler", "Total Points", ...columns.map((column) => column.label), "MVP"];

  row.append(
    ...headers.map((header, index) => {
      const className = index > 2 && index < headers.length - 1
        ? `score-head ${columns[index - 3]?.type ?? ""}`
        : index === 0
          ? "place-head"
          : "";
      return createCell(header, className, "th");
    })
  );
  return row;
}

function getPlayerDisplayNames(player, mode = "solo") {
  if (mode === "duo") return [player.name, player.name2].filter(Boolean);
  return [player.name].filter(Boolean);
}

function createPlayerNameCell(player, className, mode) {
  const cell = createCell("", className);
  const names = getPlayerDisplayNames(player, mode);

  if (mode !== "duo" || names.length < 2) {
    cell.textContent = names[0] ?? "";
    return cell;
  }

  const stack = document.createElement("span");
  stack.className = "player-stack";
  names.forEach((name) => {
    const line = document.createElement("span");
    line.textContent = name;
    stack.append(line);
  });
  cell.append(stack);
  return cell;
}

function createRankingRow(player, index, columns, mode = "solo") {
  const row = document.createElement("tr");
  const place = player.place ?? index + 1;
  const scores = player.scores ?? {};
  const hasPlayerName = getPlayerDisplayNames(player, mode).length > 0;

  if (!hasPlayerName) {
    row.classList.add("empty-ranking-slot");
  }

  const placeCell = createCell(place, "place");
  const trend = document.createElement("span");
  trend.className = `trend trend-${player.trend ?? "same"}`;
  trend.textContent = hasPlayerName ? getTrendSymbol(player.trend) : "";
  const placeNumber = document.createElement("span");
  placeNumber.textContent = place;
  placeCell.replaceChildren(trend, placeNumber);
  if (place === 1) placeCell.classList.add("gold");
  if (place === 2) placeCell.classList.add("silver");
  if (place === 3) placeCell.classList.add("bronze");
  const playerNameClass = ["player-name"];
  if (place === 1) playerNameClass.push("gold-name");
  if (place === 2) playerNameClass.push("silver-name");
  if (place === 3) playerNameClass.push("bronze-name");

  row.append(
    placeCell,
    createPlayerNameCell(player, playerNameClass.join(" "), mode),
    createCell(hasPlayerName ? getTotalPoints(player, scores, columns) : "", "total-points"),
    ...columns.map((column) => {
      if (!hasPlayerName) return createCell("");
      if (column.type === "day") return createCell(getDayTotal(scores, column), "day-points");
      return createCell(getScoreValue(scores, column.key));
    }),
    createCell(player.mvp)
  );

  return row;
}

async function loadRanking() {
  if (!rankingHead || !rankingBody) return;

  try {
    const rankingData = await loadLocalData("adminRankingData", initialSiteData.ranking);
    const columns = flattenRankingColumns(rankingData.days ?? []);
    const players = Array.isArray(rankingData) ? rankingData : rankingData.players ?? [];
    const mode = rankingData.mode ?? "solo";
    const publishedPlayers = applyRankingPlacesAndTrends(
      players.filter((player) => player.published && getPlayerDisplayNames(player, mode).length),
      columns
    );
    rankingBody.replaceChildren();

    if (!publishedPlayers.length) {
      rankingHead.replaceChildren();
      rankingPanel.hidden = true;
      return;
    }

    rankingPanel.hidden = false;
    rankingHead.replaceChildren(createRankingHeader(columns, mode));
    rankingBody.append(...publishedPlayers.map((player, index) => createRankingRow(player, index, columns, mode)));
  } catch {
    rankingPanel.hidden = false;
    rankingBody.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "table-empty";
    cell.colSpan = 14;
    cell.textContent = "Rangliste konnte nicht geladen werden.";
    row.append(cell);
    rankingBody.append(row);
  }
}

loadRanking();

async function renderHallOfFame() {
  if (!hallList) return;

  const items = await loadLocalData("adminHallOfFameData", initialSiteData.hallOfFame);
  const archive = await loadLocalData("adminRankingArchive", []);
  const entries = Array.isArray(items) ? items : [];
  hallList.replaceChildren();

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Noch keine Gewinner eingetragen.";
    hallList.append(empty);
    return;
  }

  entries.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "hall-card";

    const title = document.createElement("h2");
    title.textContent = entry.title || "Patalympische Sommer Games";

    const winnerFrame = document.createElement("div");
    winnerFrame.className = "hall-winner-frame";

    if (entry.image?.trim()) {
      const image = document.createElement("img");
      image.src = entry.image.trim();
      image.alt = entry.winner ? `Gewinner: ${entry.winner}` : "Gewinner";
      winnerFrame.append(image);
    } else {
      const fallback = document.createElement("strong");
      fallback.textContent = entry.winner || "Gewinner";
      winnerFrame.append(fallback);
    }

    card.append(title, winnerFrame);

    const archiveEntry = getRankingArchiveEntry(archive, entry.archiveId);
    if (archiveEntry) {
      const button = document.createElement("button");
      button.className = "hall-ranking-link";
      button.type = "button";
      button.textContent = "Rangliste ansehen";
      button.addEventListener("click", () => openRankingArchiveDialog(archiveEntry));
      card.append(button);
    }

    hallList.append(card);
  });
}

renderHallOfFame();

function getRankingArchiveEntry(archive, archiveId) {
  if (!archiveId || !Array.isArray(archive)) return null;
  return archive.find((entry) => entry.id === archiveId || entry.createdAt === archiveId) ?? null;
}

function getRankingArchiveLabel(entry, index = 0) {
  if (entry.title?.trim()) return entry.title.trim();
  const date = entry.createdAt ? formatDate(entry.createdAt) : `Archiv ${index + 1}`;
  return `Rangliste ${date}`;
}

function openRankingArchiveDialog(archiveEntry) {
  const dialog = document.createElement("dialog");
  dialog.className = "poll-result-dialog ranking-archive-dialog";
  const head = document.createElement("div");
  head.className = "poll-result-dialog-head";
  const title = document.createElement("h3");
  title.textContent = getRankingArchiveLabel(archiveEntry);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Schließen";
  close.addEventListener("click", () => dialog.close());
  head.append(title, close);

  const body = document.createElement("div");
  body.className = "poll-result-dialog-body ranking-archive-body";
  body.append(createRankingArchiveTable(archiveEntry.ranking ?? {}));
  dialog.append(head, body);
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function createRankingArchiveTable(ranking) {
  const wrap = document.createElement("div");
  wrap.className = "ranking-table-wrap ranking-archive-table-wrap";
  const table = document.createElement("table");
  table.className = "ranking-table";
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const columns = flattenRankingColumns(ranking.days ?? []);
  const mode = ranking.mode ?? "solo";
  const players = applyRankingPlacesAndTrends(
    (ranking.players ?? []).filter((player) => player.published && getPlayerDisplayNames(player, mode).length),
    columns
  );

  if (!players.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Diese archivierte Rangliste ist leer.";
    wrap.append(empty);
    return wrap;
  }

  thead.append(createRankingHeader(columns, mode));
  tbody.append(...players.map((player, index) => createRankingRow(player, index, columns, mode)));
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function getDateRange(startDate, endDate) {
  if (!startDate || !endDate || endDate < startDate) return [];

  const dates = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (current <= end) {
    dates.push(toDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function renderPollInfo(element, text) {
  if (!element) return;
  element.textContent = text ?? "";
  element.hidden = !text?.trim();
}

function getParticipantKey(name) {
  return name.trim().toLocaleLowerCase("de-DE");
}

function getSavedParticipantName() {
  return getClientJson("pollParticipantName", "");
}

function setSavedParticipantName(name) {
  const trimmed = name.trim();
  if (trimmed) {
    setClientJson("pollParticipantName", trimmed);
  } else {
    removeClientJson("pollParticipantName");
  }
}

function getParticipantName() {
  const savedName = getSavedParticipantName();
  if (savedName) return savedName;
  return participantNameInput?.value.trim() || "";
}

function refreshParticipantElements() {
  participantDialog = document.querySelector("#participant-dialog");
  participantForm = document.querySelector("#participant-form");
  participantCloseButton = document.querySelector("#participant-close");
  participantNameInput = document.querySelector("#participant-name");
  participantSaveButton = document.querySelector("#participant-save");
  participantStatus = document.querySelector("#participant-status");
}

function ensureParticipantUi() {
  if (!participantDialog) {
    const dialog = document.createElement("dialog");
    dialog.id = "participant-dialog";
    dialog.className = "participant-dialog";
    dialog.innerHTML = `
      <form id="participant-form" class="participant-dialog-form" method="dialog">
        <div class="participant-dialog-head">
          <h2>Dein Name</h2>
          <button id="participant-close" class="admin-secondary-button" type="button">Schliessen</button>
        </div>
        <label class="field">
          <span>Name</span>
          <input id="participant-name" type="text" autocomplete="name" />
        </label>
        <button id="participant-save" class="form-button" type="submit">Namen speichern</button>
        <p id="participant-status" class="form-status" role="status"></p>
      </form>
    `;
    document.body.append(dialog);
  }

  refreshParticipantElements();
}

function renderParticipantCardStatus(message = "", isError = false) {
  if (!participantStatus) return;
  participantStatus.textContent = message;
  participantStatus.dataset.state = isError ? "error" : "success";
}

function openParticipantDialog(prefill = "") {
  if (!participantDialog || !participantNameInput) return;
  participantNameInput.value = prefill;
  if (!participantDialog.open) participantDialog.showModal();
  participantNameInput.focus();
}

function closeParticipantDialog() {
  if (participantDialog?.open) participantDialog.close();
}

async function validateSavedParticipantName() {
  const savedName = getSavedParticipantName();
  if (!savedName) {
    openParticipantDialog();
    return "";
  }

  if (!supabaseEnabled) {
    closeParticipantDialog();
    return savedName;
  }

  const existsOnline = await remoteParticipantExists(savedName);
  if (existsOnline === false) {
    setSavedParticipantName("");
    renderParticipantCardStatus("Dein Name wurde zurückgesetzt. Bitte neu eintragen.", true);
    openParticipantDialog();
    return "";
  }

  closeParticipantDialog();
  return savedName;
}

function syncParticipantCard() {
  if (!participantNameInput) return;
  const savedName = getSavedParticipantName();

  if (!savedName) {
    openParticipantDialog();
    return;
  }

  closeParticipantDialog();
  participantValidationPromise ??= validateSavedParticipantName()
    .finally(() => {
      participantValidationPromise = null;
    });
}

function ensureParticipantName() {
  const name = getParticipantName();
  if (name) return name;
  renderParticipantCardStatus("Bitte zuerst deinen Namen speichern.", true);
  openParticipantDialog();
  return "";
}

async function submitParticipantName() {
  const name = participantNameInput?.value.trim() || "";
  if (!name) {
    renderParticipantCardStatus("Bitte einen Namen eintragen.", true);
    participantNameInput?.focus();
    return;
  }

  setSavedParticipantName(name);
  const isSavedOnline = await saveRemoteParticipantEntry(name);
  syncParticipantCard();
  renderParticipantCardStatus(isSavedOnline || !supabaseEnabled
    ? "Name gespeichert."
    : "Name lokal gespeichert, online aber noch nicht angekommen.", !isSavedOnline && supabaseEnabled);
  await loadPolls();
}

function upsertParticipant(entries, nextEntry) {
  const nextKey = getParticipantKey(nextEntry.name);
  const others = entries.filter((entry) => getParticipantKey(entry.name) !== nextKey);
  return [...others, nextEntry].sort((a, b) => a.name.localeCompare(b.name, "de-DE"));
}

function getAvailabilityEntries() {
  const savedData = getStoredJson("pollAvailabilityAnswers", { participants: [] });
  if (Array.isArray(savedData)) return savedData;
  if (Array.isArray(savedData.participants)) return savedData.participants;
  if (savedData.answers || savedData.note) {
    return [{
      name: "Teilnehmer 1",
      answers: savedData.answers ?? {},
      note: savedData.note ?? "",
      updatedAt: savedData.updatedAt ?? "",
    }];
  }
  if (savedData && typeof savedData === "object" && Object.keys(savedData).length) {
    return [{ name: "Teilnehmer 1", answers: savedData, note: "", updatedAt: "" }];
  }
  return [];
}

function getAvailabilityEntry(name) {
  const key = getParticipantKey(name);
  return getAvailabilityEntries().find((entry) => getParticipantKey(entry.name) === key) ?? null;
}

function saveAvailabilityEntry(entry) {
  setStoredJson("pollAvailabilityAnswers", {
    participants: upsertParticipant(getAvailabilityEntries(), entry),
  });
  queueRemoteWrite(saveRemoteAvailabilityEntry(entry));
}

function deleteAvailabilityEntry(name) {
  const nextEntries = getAvailabilityEntries().filter((entry) => getParticipantKey(entry.name) !== getParticipantKey(name));
  setStoredJson("pollAvailabilityAnswers", { participants: nextEntries });
  queueRemoteWrite(deleteRemoteAvailabilityEntry(name));
}

function getSuggestionEntries() {
  const suggestions = getStoredJson("pollGameSuggestions", []);
  return Array.isArray(suggestions)
    ? suggestions.map((suggestion, index) => ({
      name: suggestion.name || "Teilnehmer 1",
      text: suggestion.text ?? String(suggestion),
      createdAt: suggestion.createdAt ?? "",
      id: suggestion.id ?? `suggestion-${index}`,
    }))
    : [];
}

function saveSuggestionEntry(entry) {
  setStoredJson("pollGameSuggestions", [...getSuggestionEntries(), entry]);
  queueRemoteWrite(saveRemoteSuggestionEntry(entry));
}

function deleteSuggestionEntry(id) {
  const nextEntries = getSuggestionEntries().filter((entry) => entry.id !== id);
  setStoredJson("pollGameSuggestions", nextEntries);
  queueRemoteWrite(deleteRemoteSuggestionEntry(id));
}

function getGameVoteEntries() {
  const savedAnswers = getStoredJson("pollGameVoteAnswers", { participants: [] });
  if (Array.isArray(savedAnswers)) {
    return savedAnswers.length && typeof savedAnswers[0] === "object"
      ? savedAnswers
      : [{ name: "Teilnehmer 1", answers: savedAnswers, updatedAt: "" }];
  }
  if (Array.isArray(savedAnswers.participants)) return savedAnswers.participants;
  return [];
}

function getGameVoteEntry(name) {
  const key = getParticipantKey(name);
  return getGameVoteEntries().find((entry) => getParticipantKey(entry.name) === key) ?? null;
}

function saveGameVoteEntry(entry) {
  setStoredJson("pollGameVoteAnswers", {
    participants: upsertParticipant(getGameVoteEntries(), entry),
  });
  queueRemoteWrite(saveRemoteGameVoteEntry(entry));
}

function deleteGameVoteEntry(name) {
  const nextEntries = getGameVoteEntries().filter((entry) => getParticipantKey(entry.name) !== getParticipantKey(name));
  setStoredJson("pollGameVoteAnswers", { participants: nextEntries });
  queueRemoteWrite(deleteRemoteGameVoteEntry(name));
}

function getKnownParticipants(participants = []) {
  const participantMap = new Map();

  function addParticipant(name, createdAt = "", source = "") {
    const trimmed = name?.trim();
    if (!trimmed) return;
    const key = getParticipantKey(trimmed);
    const current = participantMap.get(key);
    if (current) {
      if (source && !current.sources.includes(source)) current.sources.push(source);
      if (!current.createdAt && createdAt) current.createdAt = createdAt;
      return;
    }
    participantMap.set(key, {
      name: trimmed,
      createdAt,
      sources: source ? [source] : [],
    });
  }

  participants.forEach((entry) => addParticipant(entry.name, entry.createdAt, "User"));
  getAvailabilityEntries().forEach((entry) => addParticipant(entry.name, entry.createdAt, "Verfügbarkeit"));
  getSuggestionEntries().forEach((entry) => addParticipant(entry.name, entry.createdAt, "Vorschläge"));
  getGameVoteEntries().forEach((entry) => addParticipant(entry.name, entry.createdAt, "Votes"));

  return [...participantMap.values()].sort((a, b) => a.name.localeCompare(b.name, "de-DE"));
}

function createMatrixLabel(text, className) {
  const cell = document.createElement("span");
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function createDateHeading(date) {
  const heading = document.createElement("span");
  heading.className = "matrix-date";
  const weekday = document.createElement("strong");
  weekday.textContent = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(new Date(`${date}T00:00:00`));
  const value = document.createElement("span");
  value.textContent = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(new Date(`${date}T00:00:00`));
  heading.append(weekday, value);
  return heading;
}

function getAvailabilityCounts(entries, date) {
  return entries.reduce((result, entry) => {
    const answer = entry.answers?.[date] ?? "open";
    result[answer] = (result[answer] ?? 0) + 1;
    return result;
  }, { yes: 0, maybe: 0, no: 0, open: 0 });
}

function createAvailabilityMatrix(dates, savedAnswers, adminEntries = null) {
  const matrix = document.createDocumentFragment();
  matrix.append(createMatrixLabel("", "matrix-corner"));
  dates.forEach((date) => matrix.append(createDateHeading(date)));

  [
    ["yes", "Kann"],
    ["maybe", "Vielleicht"],
    ["no", "Kann nicht"],
  ].forEach(([value, text]) => {
    matrix.append(createMatrixLabel(text, `matrix-answer matrix-answer-${value}`));
    dates.forEach((date) => {
      const choice = document.createElement("label");
      choice.className = `matrix-choice choice-${value}`;
      const input = document.createElement("input");
      input.type = "radio";
      input.name = date;
      input.value = value;
      input.checked = savedAnswers[date] === value;
      const mark = document.createElement("span");
      mark.setAttribute("aria-hidden", "true");
      choice.append(input, mark);
      matrix.append(choice);
    });
  });

  if (adminEntries) {
    matrix.append(createMatrixLabel("Kann / Votes", "matrix-answer matrix-answer-admin"));
    dates.forEach((date) => {
      const counts = getAvailabilityCounts(adminEntries, date);
      const totalVotes = counts.yes + counts.maybe + counts.no;
      matrix.append(createMatrixLabel(`${counts.yes}/${totalVotes}`, "matrix-admin-count"));
    });
  }

  return matrix;
}

function renderAvailabilityPoll(config) {
  if (!availabilityPoll || !availabilityOptions || !availabilityForm) return;

  availabilityPoll.hidden = !config.published;
  if (!config.published) return;

  const dates = getDateRange(config.startDate, config.endDate);
  const participantName = getParticipantName();
  renderPollInfo(availabilityInfo, config.info);
  const savedEntry = participantName ? getAvailabilityEntry(participantName) : null;
  const savedAnswers = savedEntry?.answers ?? {};
  const submitButton = availabilityForm.querySelector("button");
  availabilityOptions.replaceChildren();
  availabilityNote.value = savedEntry?.note ?? "";

  if (!dates.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state poll-inside-empty";
    empty.textContent = "Noch kein Zeitraum festgelegt.";
    availabilityOptions.append(empty);
    submitButton.disabled = true;
    renderAvailabilityAdminSummary(config);
    return;
  }

  submitButton.disabled = false;
  availabilityOptions.style.setProperty("--availability-columns", dates.length);
  availabilityOptions.append(createAvailabilityMatrix(
    dates,
    savedAnswers,
    isAdminLoggedIn() ? getAvailabilityEntries() : null
  ));
  renderAvailabilityAdminSummary(config);
}

function renderSuggestionPoll(config) {
  if (!suggestionPoll) return;
  suggestionPoll.hidden = !config.published;
  renderPollInfo(suggestionInfo, config.info);
  suggestionForm?.querySelector("button")?.toggleAttribute("disabled", false);
  if (config.published) {
    renderPollResultButtonInSection(suggestionPoll, "Game Vorschläge", createSuggestionResults);
  }
}

function getGameVoteGroups(config) {
  if (Array.isArray(config.groups)) return config.groups;
  if (Array.isArray(config.options) && config.options.length) {
    return [{ title: "Allgemein", options: config.options }];
  }
  return [];
}

function createGameOption(option, category, selectedOptions) {
  const answer = document.createElement("label");
  answer.className = "vote-option";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = "games";
  input.value = `${category}::${option}`;
  input.checked = selectedOptions.includes(input.value) || selectedOptions.includes(option);
  const caption = document.createElement("span");
  caption.textContent = option;
  answer.append(input, caption);
  return answer;
}

function createGameVoteGroup(group, selectedOptions) {
  const section = document.createElement("section");
  section.className = "vote-group";
  const title = document.createElement("h2");
  title.textContent = group.title || "Allgemein";
  const options = document.createElement("div");
  options.className = "vote-group-options";
  options.append(...group.options.map((option) => createGameOption(option, title.textContent, selectedOptions)));
  section.append(title, options);
  return section;
}

function renderGameVotePoll(config) {
  if (!gameVotePoll || !gameVoteOptions || !gameVoteForm) return;

  gameVotePoll.hidden = !config.published;
  if (!config.published) return;

  const submitButton = gameVoteForm.querySelector("button");
  const participantName = getParticipantName();
  const savedEntry = participantName ? getGameVoteEntry(participantName) : null;
  if (savedEntry && !isAdminLoggedIn()) {
    gameVotePoll.hidden = true;
    return;
  }

  renderPollInfo(gameVoteInfo, config.info);
  renderPollResultButtonInSection(gameVotePoll, "Game Voting", () => createGameVoteResults(config));
  const savedAnswers = savedEntry?.answers ?? [];
  const groups = getGameVoteGroups(config).filter((group) => Array.isArray(group.options) && group.options.length);
  gameVoteOptions.replaceChildren();

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state poll-inside-empty";
    empty.textContent = "Noch keine Spiele eingetragen.";
    gameVoteOptions.append(empty);
    submitButton.disabled = true;
    return;
  }

  submitButton.disabled = false;
  gameVoteOptions.append(...groups.map((group) => createGameVoteGroup(group, savedAnswers)));
}

async function loadPolls() {
  if (!pollEmpty) return;

  syncParticipantCard();
  await loadRemotePollData();
  const polls = await loadLocalData("adminPollData", initialSiteData.polls);
  renderAvailabilityPoll(polls.availability);
  renderSuggestionPoll(polls.suggestions);
  renderGameVotePoll(polls.gameVote);
  pollEmpty.hidden = Boolean(
    (polls.availability.published && !availabilityPoll?.hidden)
      || (polls.suggestions.published && !suggestionPoll?.hidden)
      || (polls.gameVote.published && !gameVotePoll?.hidden)
  );
}

availabilityForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = ensureParticipantName();
  if (!name) return;
  const answers = {};
  availabilityForm.querySelectorAll('input[type="radio"]:checked').forEach((input) => {
    answers[input.name] = input.value;
  });
  saveAvailabilityEntry({
    name,
    answers,
    note: availabilityNote.value.trim(),
    updatedAt: new Date().toISOString(),
  });
  availabilityStatus.textContent = "Gespeichert.";
  loadPolls();
});

suggestionForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = ensureParticipantName();
  const text = suggestionForm.elements.games.value.trim();
  if (!name || !text) return;

  saveSuggestionEntry({
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
    name,
    text,
    createdAt: new Date().toISOString(),
  });
  suggestionForm.reset();
  suggestionStatus.textContent = "Vorschlag gespeichert.";
  loadPolls();
});

gameVoteForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = ensureParticipantName();
  if (!name) return;
  const answers = [...gameVoteForm.querySelectorAll('input[name="games"]:checked')].map((input) => input.value);
  saveGameVoteEntry({
    name,
    answers,
    updatedAt: new Date().toISOString(),
  });
  gameVoteStatus.textContent = "Abstimmung gespeichert.";
  loadPolls();
});

function initParticipantUi() {
  ensureParticipantUi();
  if (participantUiInitialized) return;
  participantUiInitialized = true;

  participantSaveButton?.addEventListener("click", submitParticipantName);

  participantForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitParticipantName();
  });

  participantCloseButton?.addEventListener("click", () => {
    if (getSavedParticipantName()) {
      closeParticipantDialog();
      return;
    }

    renderParticipantCardStatus("Bitte zuerst einen Namen speichern.", true);
    participantNameInput?.focus();
  });

  participantDialog?.addEventListener("cancel", (event) => {
    if (getSavedParticipantName()) return;
    event.preventDefault();
    renderParticipantCardStatus("Bitte zuerst einen Namen speichern.", true);
  });
}

initParticipantUi();
syncParticipantCard();
loadPolls();
renderUserPage();

function createPollResultSection(titleText) {
  const section = document.createElement("section");
  section.className = "poll-result-box";
  const title = document.createElement("h4");
  title.textContent = titleText;
  section.append(title);
  return section;
}

function createResultLine(label, value, className = "") {
  const row = document.createElement("p");
  row.className = className ? `poll-result-line ${className}` : "poll-result-line";
  const name = document.createElement("span");
  name.textContent = label;
  const count = document.createElement("strong");
  count.textContent = value;
  row.append(name, count);
  return row;
}

function getAvailabilityAnswerText(value) {
  return {
    yes: "Kann",
    maybe: "Vielleicht",
    no: "Keine Zeit",
    open: "Offen",
  }[value ?? "open"] ?? "Offen";
}

function createAvailabilityAdminSummary(config) {
  const section = document.createElement("section");
  section.className = "availability-admin-summary poll-result-box";

  const dates = getDateRange(config.startDate, config.endDate);
  const entries = getAvailabilityEntries();

  if (!dates.length) {
    const empty = document.createElement("p");
    empty.className = "poll-result-empty";
    empty.textContent = "Noch kein Zeitraum festgelegt.";
    section.append(empty);
    return section;
  }

  const details = document.createElement("details");
  details.className = "availability-vote-details";
  const summary = document.createElement("summary");
  summary.textContent = "Personen und Votes anzeigen";
  details.append(summary);

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "poll-result-empty";
    empty.textContent = "Noch keine Antworten.";
    details.append(empty);
  } else {
    dates.forEach((date) => {
      const group = document.createElement("div");
      group.className = "availability-vote-day";
      const label = document.createElement("h5");
      label.textContent = new Intl.DateTimeFormat("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      }).format(new Date(`${date}T00:00:00`));
      group.append(label);
      entries.forEach((entry) => {
        const answer = entry.answers?.[date] ?? "open";
        group.append(createResultLine(entry.name, getAvailabilityAnswerText(answer), `result-${answer}`));
      });
      details.append(group);
    });
  }

  section.append(details);
  return section;
}

function renderAvailabilityAdminSummary(config) {
  availabilityPoll.querySelector(".availability-admin-summary")?.remove();
  if (!isAdminLoggedIn()) return;
  const matrixWrap = availabilityForm?.querySelector(".availability-scroll");
  if (!matrixWrap) return;
  matrixWrap.after(createAvailabilityAdminSummary(config));
}

function createSuggestionResults() {
  const section = createPollResultSection("Auswertung");
  const suggestions = getSuggestionEntries();

  if (!suggestions.length) {
    const empty = document.createElement("p");
    empty.className = "poll-result-empty";
    empty.textContent = "Noch keine Vorschläge.";
    section.append(empty);
    return section;
  }

  const list = document.createElement("ul");
  list.className = "poll-result-list";
  suggestions.forEach((suggestion) => {
    const item = document.createElement("li");
    item.textContent = `${suggestion.name}: ${suggestion.text}`;
    list.append(item);
  });
  section.append(list);
  return section;
}

function createGameVoteResults(config) {
  const section = createPollResultSection("Auswertung");
  const entries = getGameVoteEntries();
  const groups = getGameVoteGroups(config).filter((group) => Array.isArray(group.options) && group.options.length);

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "poll-result-empty";
    empty.textContent = "Noch keine Spiele eingetragen.";
    section.append(empty);
    return section;
  }

  groups.forEach((group) => {
    const groupBox = document.createElement("div");
    groupBox.className = "poll-result-group";
    const groupTitle = document.createElement("h5");
    groupTitle.textContent = group.title || "Allgemein";
    groupBox.append(groupTitle);
    group.options.forEach((option) => {
      const value = `${groupTitle.textContent}::${option}`;
      const voters = entries
        .filter((entry) => entry.answers?.includes(value) || entry.answers?.includes(option))
        .map((entry) => entry.name);
      const line = createResultLine(option, `${voters.length} Stimmen`, voters.length ? "result-yes" : "result-open");
      groupBox.append(line);
      if (voters.length) {
        const voterList = document.createElement("p");
        voterList.className = "poll-result-voters";
        voterList.textContent = voters.join(", ");
        groupBox.append(voterList);
      }
    });
    section.append(groupBox);
  });

  return section;
}

function createPollResultButton(titleText, createResults) {
  const button = document.createElement("button");
  button.className = "admin-secondary-button poll-result-button";
  button.type = "button";
  button.textContent = "Auswertung";

  button.addEventListener("click", () => {
    const dialog = document.createElement("dialog");
    dialog.className = "poll-result-dialog";
    const head = document.createElement("div");
    head.className = "poll-result-dialog-head";
    const title = document.createElement("h3");
    title.textContent = titleText;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Schließen";
    close.addEventListener("click", () => dialog.close());
    head.append(title, close);

    const body = document.createElement("div");
    body.className = "poll-result-dialog-body";
    body.append(createResults());
    dialog.append(head, body);
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  });

  return button;
}

function renderPollResultButtonInSection(section, titleText, createResults) {
  const head = section.querySelector(".section-head");
  if (!head) return;

  head.querySelector(".poll-section-result-button")?.remove();
  if (!isAdminLoggedIn()) return;

  const button = createPollResultButton(titleText, createResults);
  button.classList.add("poll-section-result-button");
  head.append(button);
}

function isAdminLoggedIn() {
  return adminSessionValidated && Boolean(getSavedAdminSession()?.isAdmin);
}

function refreshAdminNavigation() {
  const currentPage = globalThis.location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll(".main-nav").forEach((nav) => {
    const existingLink = nav.querySelector('[data-admin-nav="user"]');

    if (!isAdminLoggedIn()) {
      existingLink?.remove();
      return;
    }

    if (existingLink) {
      existingLink.classList.toggle("active", currentPage === "user.html");
      return;
    }

    const link = document.createElement("a");
    link.href = "user.html";
    link.textContent = "User";
    link.dataset.adminNav = "user";
    link.classList.toggle("active", currentPage === "user.html");

    const hallOfFameLink = nav.querySelector('a[href="hall-of-fame.html"]');
    if (hallOfFameLink) {
      nav.insertBefore(link, hallOfFameLink);
    } else {
      nav.append(link);
    }
  });
}

function createAdminField(labelText, input) {
  const label = document.createElement("label");
  label.className = "field";

  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(span, input);

  return label;
}

function createAdminInput(type = "text", value = "") {
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  return input;
}

function createAdminTextarea(value = "", rows = 5) {
  const textarea = document.createElement("textarea");
  textarea.rows = rows;
  textarea.value = value;
  return textarea;
}

function createActionButton(text, className = "admin-secondary-button", type = "button") {
  const button = document.createElement("button");
  button.className = className;
  button.type = type;
  button.textContent = text;
  return button;
}

function createAdminEntry(titleText, detailText = "", actionButton = null) {
  const row = document.createElement("div");
  row.className = "admin-list-row";

  const copy = document.createElement("div");
  copy.className = "admin-list-copy";

  const title = document.createElement("strong");
  title.textContent = titleText;
  copy.append(title);

  if (detailText) {
    const detail = document.createElement("p");
    detail.textContent = detailText;
    copy.append(detail);
  }

  row.append(copy);
  if (actionButton) row.append(actionButton);
  return row;
}

function createAdminList(items, emptyText) {
  const wrap = document.createElement("div");
  wrap.className = "admin-list";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "admin-list-empty";
    empty.textContent = emptyText;
    wrap.append(empty);
    return wrap;
  }

  wrap.append(...items);
  return wrap;
}

async function getAdminData() {
  const session = await ensureAdminSession();
  if (!session?.isAdmin) return null;
  await loadRemotePollData();
  return {
    news: await loadLocalData("adminNewsData", initialSiteData.news),
    calendar: await loadLocalData("adminCalendarData", initialSiteData.calendar),
    scheduleNote: await loadLocalData("adminScheduleNoteData", initialSiteData.scheduleNote),
    polls: await loadLocalData("adminPollData", initialSiteData.polls),
    ranking: await loadLocalData("adminRankingData", initialSiteData.ranking),
    rankingArchive: await loadLocalData("adminRankingArchive", []),
    hallOfFame: await loadLocalData("adminHallOfFameData", initialSiteData.hallOfFame),
    participants: await loadRemoteParticipants(),
  };
}

async function waitForRemoteWrites() {
  if (!pendingRemoteWrites.length) return true;
  const writes = pendingRemoteWrites.splice(0, pendingRemoteWrites.length);
  const results = await Promise.race([
    Promise.all(writes),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 1800)),
  ]);

  if (results === "timeout") return false;
  return results.every(isRemoteWriteResultOk);
}

function isRemoteWriteResultOk(result) {
  if (result === null) return false;
  if (Array.isArray(result)) return result.every(isRemoteWriteResultOk);
  return true;
}

async function refreshAfterAdminSave(status, message) {
  const isSaved = await waitForRemoteWrites();
  if (!isSaved && supabaseEnabled) {
    status.textContent = "Speichern fehlgeschlagen. Bitte Admin-Login prüfen.";
    return;
  }

  status.textContent = message;
  setTimeout(() => globalThis.location.reload(), 450);
}

function renderAdminLogin(modalBody) {
  modalBody.replaceChildren();

  const form = document.createElement("form");
  form.className = "admin-form";
  const loginName = createAdminInput("text");
  const password = createAdminInput("password");
  const status = document.createElement("p");
  status.className = "form-status";

  form.append(
    createAdminField("Admin-Name", loginName),
    createAdminField("Admin Passwort", password),
    createAdminButton("Einloggen"),
    status
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "Prüfe Login...";
    const result = await signInAdmin(loginName.value.trim(), password.value);

    if (!result.session) {
      status.textContent = result.error;
      return;
    }

    const modal = modalBody.closest("dialog");
    modal?.close();
    await refreshPageAdminState();
    renderInlineAdminTools();
  });

  modalBody.append(form);
}

function createAdminButton(text) {
  const button = document.createElement("button");
  button.className = "form-button";
  button.type = "submit";
  button.textContent = text;
  return button;
}

function renderAdminSection(titleText, content) {
  const section = document.createElement("section");
  section.className = "admin-section";

  const title = document.createElement("h3");
  title.textContent = titleText;

  section.append(title, content);
  return section;
}

async function renderAdminPanel(modalBody) {
  modalBody.replaceChildren();

  const data = await getAdminData();
  if (!data) {
    renderAdminLogin(modalBody);
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "admin-grid";

  wrap.append(
    renderAdminSection("Rules", createNewsAdmin(data.news)),
    renderAdminSection("Schedule", createCalendarAdmin(data.calendar, data.scheduleNote)),
    renderAdminSection("Polls", createPollAdmin(data.polls)),
    renderAdminSection("User", createUserAdmin(data.participants)),
    renderAdminSection("Rangliste", createRankingAdmin(data.ranking)),
    renderAdminSection("Hall of Fame", createHallOfFameAdmin(data.hallOfFame, data.rankingArchive))
  );

  modalBody.append(wrap);
}

function getInlineAdminConfig(data) {
  const path = globalThis.location.pathname;

  if (path.endsWith("/news.html")) {
    return {
      title: "Rules bearbeiten",
      content: createNewsAdmin(data.news),
    };
  }

  if (path.endsWith("/kalender.html")) {
    return {
      title: "Schedule bearbeiten",
      content: createCalendarAdmin(data.calendar, data.scheduleNote),
    };
  }

  if (path.endsWith("/poll.html")) {
    return {
      title: "Polls bearbeiten",
      content: createPollAdmin(data.polls),
    };
  }

  if (path.endsWith("/rangliste.html")) {
    return {
      title: "Rangliste bearbeiten",
      content: createRankingAdmin(data.ranking),
    };
  }

  if (path.endsWith("/hall-of-fame.html")) {
    return {
      title: "Hall of Fame bearbeiten",
      content: createHallOfFameAdmin(data.hallOfFame, data.rankingArchive),
    };
  }

  if (path.endsWith("/user.html")) {
    return null;
  }

  return null;
}

async function renderInlineAdminTools() {
  const existing = document.querySelector(".inline-admin");
  if (existing) {
    existing.remove();
    return;
  }

  const data = await getAdminData();
  if (!data) return;
  const config = getInlineAdminConfig(data);
  if (!config) return;

  const main = document.querySelector("main");
  if (!main) return;

  const panel = document.createElement("section");
  panel.className = "content-panel inline-admin";

  const head = document.createElement("div");
  head.className = "section-head";

  const title = document.createElement("h1");
  title.textContent = config.title;

  head.append(title);
  panel.append(head, config.content);
  main.append(panel);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function renderUserPage() {
  if (!userContent) return;

  const session = await ensureAdminSession();
  if (!session?.isAdmin) {
    const message = document.createElement("p");
    message.className = "empty-state user-empty-state";
    message.textContent = "User sind nur für Admins sichtbar. Bitte unten rechts als Admin einloggen.";
    userContent.replaceChildren(message);
    return;
  }

  await loadRemotePollData();
  const participants = await loadRemoteParticipants();
  userContent.replaceChildren(createUserAdmin(participants));
}

async function refreshPageAdminState() {
  document.querySelectorAll(".poll-section-result-button, .availability-admin-summary").forEach((element) => {
    element.remove();
  });

  if (pollEmpty) {
    await loadPolls();
  }
  await loadNews();
  await loadCalendar();
  await loadScheduleNote();
  await renderHallOfFame();
  await renderUserPage();
}

function createNewsAdmin(news) {
  const form = document.createElement("form");
  form.className = "admin-form";
  const title = createAdminInput();
  const bodyEditor = createRichTextEditor("", { height: 180 });
  const listTitle = document.createElement("h4");
  listTitle.textContent = "Vorhandene Rules";
  const status = document.createElement("p");
  status.className = "form-status";
  const entries = createAdminList(
    news.map((item, index) => {
      const remove = createActionButton("Löschen", "admin-remove-button");
      remove.addEventListener("click", () => {
        const nextNews = news.filter((_, currentIndex) => currentIndex !== index);
        setStoredJson("adminNewsData", nextNews);
        refreshAfterAdminSave(status, "Rule gelöscht.");
      });
      return createAdminEntry(
        item.title || "Ohne Titel",
        formatDate(item.date),
        remove
      );
    }),
    "Noch keine Rules gespeichert."
  );

  form.append(
    createAdminField("Titel", title),
    createAdminField("Text", bodyEditor.element),
    createAdminButton("Rule speichern"),
    listTitle,
    entries,
    status
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextNews = [
      {
        title: title.value.trim(),
        author: "Admin",
        bodyHtml: bodyEditor.getHtml(),
        date: new Date().toISOString().slice(0, 10),
        published: true,
      },
      ...news,
    ].filter((item) => item.title && hasRichTextContent(getRichBodyHtml(item)));

    setStoredJson("adminNewsData", nextNews);
    refreshAfterAdminSave(status, "Rule gespeichert.");
  });

  return form;
}

function createCalendarAdmin(events, scheduleNoteData = initialSiteData.scheduleNote) {
  const form = document.createElement("form");
  form.className = "admin-form";
  const date = createAdminInput("date");
  const time = createAdminInput("time");
  const title = createAdminInput();
  const noteTitle = document.createElement("h4");
  noteTitle.textContent = "Custom Textfeld unter Schedule";
  const noteEditor = createRichTextEditor(scheduleNoteData?.bodyHtml || "", {
    height: scheduleNoteData?.height || 180,
  });
  const noteHeight = createAdminInput("number", scheduleNoteData?.height || 180);
  noteHeight.min = "80";
  noteHeight.max = "800";
  noteHeight.step = "10";
  const noteFontSize = createAdminInput("number", scheduleNoteData?.fontSize || 16);
  noteFontSize.min = "12";
  noteFontSize.max = "34";
  noteFontSize.step = "1";
  const noteSaveButton = createActionButton("Textfeld speichern", "form-button");
  const listTitle = document.createElement("h4");
  listTitle.textContent = "Vorhandene Termine";
  const status = document.createElement("p");
  status.className = "form-status";
  const entries = createAdminList(
    events.map((item, index) => {
      const remove = createActionButton("Löschen", "admin-remove-button");
      remove.addEventListener("click", () => {
        const nextEvents = events.filter((_, currentIndex) => currentIndex !== index);
        setStoredJson("adminCalendarData", nextEvents);
        refreshAfterAdminSave(status, "Termin gelöscht.");
      });
      return createAdminEntry(
        item.title || "Ohne Titel",
        [formatDate(item.date), item.time].filter(Boolean).join(" / "),
        remove
      );
    }),
    "Noch keine Termine gespeichert."
  );

  noteSaveButton.addEventListener("click", () => {
    setStoredJson("adminScheduleNoteData", {
      bodyHtml: noteEditor.getHtml(),
      height: Math.max(80, Math.min(800, Number(noteHeight.value) || 180)),
      fontSize: Math.max(12, Math.min(34, Number(noteFontSize.value) || 16)),
    });
    refreshAfterAdminSave(status, "Textfeld gespeichert.");
  });

  form.append(
    createAdminField("Datum", date),
    createAdminField("Uhrzeit", time),
    createAdminField("Termin", title),
    createAdminButton("Termin speichern"),
    listTitle,
    entries,
    noteTitle,
    createAdminField("Text", noteEditor.element),
    createAdminField("Höhe", noteHeight),
    createAdminField("Schriftgröße", noteFontSize),
    noteSaveButton,
    status
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextEvents = [
      ...events,
      {
        date: date.value,
        time: time.value,
        title: title.value.trim(),
        published: true,
      },
    ].filter((item) => item.date && item.title);

    setStoredJson("adminCalendarData", nextEvents);
    refreshAfterAdminSave(status, "Termin gespeichert.");
  });

  return form;
}

function createHallOfFameAdmin(items = [], rankingArchive = []) {
  const form = document.createElement("form");
  form.className = "admin-form";
  const title = createAdminInput("text", "Patalympische Sommer Games 2025");
  const winner = createAdminInput("text", "Pat und Ryu");
  const image = createAdminInput("text", "assets/hall-of-fame-2025.png");
  const archiveSelect = document.createElement("select");
  const noArchiveOption = document.createElement("option");
  noArchiveOption.value = "";
  noArchiveOption.textContent = "Keine Rangliste";
  archiveSelect.append(noArchiveOption);
  (Array.isArray(rankingArchive) ? rankingArchive : []).forEach((entry, index) => {
    const option = document.createElement("option");
    option.value = entry.id || entry.createdAt || "";
    option.textContent = getRankingArchiveLabel(entry, index);
    archiveSelect.append(option);
  });
  const listTitle = document.createElement("h4");
  listTitle.textContent = "Vorhandene Einträge";
  const status = document.createElement("p");
  status.className = "form-status";
  const entries = createAdminList(
    items.map((item, index) => {
      const remove = createActionButton("Löschen", "admin-remove-button");
      remove.addEventListener("click", () => {
        const nextItems = items.filter((_, currentIndex) => currentIndex !== index);
        setStoredJson("adminHallOfFameData", nextItems);
        refreshAfterAdminSave(status, "Hall-of-Fame-Eintrag gelöscht.");
      });
      return createAdminEntry(
        item.title || "Ohne Titel",
        item.winner || "Ohne Gewinner",
        remove
      );
    }),
    "Noch keine Hall-of-Fame-Einträge gespeichert."
  );

  form.append(
    createAdminField("Titel", title),
    createAdminField("Gewinner", winner),
    createAdminField("Gewinner-Bild", image),
    createAdminField("Archivierte Rangliste", archiveSelect),
    createAdminButton("Eintrag speichern"),
    listTitle,
    entries,
    status
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextItem = {
      title: title.value.trim(),
      winner: winner.value.trim(),
      image: image.value.trim(),
      archiveId: archiveSelect.value,
      createdAt: new Date().toISOString(),
    };
    const nextItems = [nextItem, ...items].filter((item) => item.title && (item.image || item.winner));

    setStoredJson("adminHallOfFameData", nextItems);
    refreshAfterAdminSave(status, "Hall-of-Fame-Eintrag gespeichert.");
  });

  return form;
}

function createUserAdmin(participants = []) {
  const form = document.createElement("form");
  form.className = "admin-form user-admin-form";
  const status = document.createElement("p");
  status.className = "form-status";
  const clearAllButton = createActionButton("Alle User löschen", "admin-remove-button");
  const listTitle = document.createElement("h4");
  listTitle.textContent = "Teilnehmer";
  const knownParticipants = getKnownParticipants(participants);

  clearAllButton.addEventListener("click", () => {
    if (!knownParticipants.length) {
      status.textContent = "Keine User zum Löschen vorhanden.";
      return;
    }
    if (!globalThis.confirm?.("Wirklich alle User löschen? Alle Poll-Antworten dieser User werden mitgelöscht.")) return;
    const savedNameKey = getParticipantKey(getSavedParticipantName());
    if (knownParticipants.some((entry) => getParticipantKey(entry.name) === savedNameKey)) {
      setSavedParticipantName("");
    }
    queueRemoteWrite(Promise.all(knownParticipants.map((entry) => deleteRemoteParticipantEntry(entry.name))));
    refreshAfterAdminSave(status, "Alle User gelöscht.");
  });

  const entries = createAdminList(
    knownParticipants.map((entry) => {
      const row = document.createElement("div");
      row.className = "admin-list-row participant-admin-row";
      const editor = document.createElement("div");
      editor.className = "participant-admin-editor";
      const name = createAdminInput("text", entry.name);
      name.className = "participant-admin-name";
      const meta = document.createElement("p");
      const sources = entry.sources.length ? entry.sources.join(", ") : "User";
      meta.textContent = [sources, entry.createdAt ? `Registriert: ${formatDate(entry.createdAt)}` : ""]
        .filter(Boolean)
        .join(" / ");
      const actions = document.createElement("div");
      actions.className = "participant-admin-actions";
      const save = createActionButton("Speichern", "admin-secondary-button");
      const remove = createActionButton("Löschen", "admin-remove-button");

      save.addEventListener("click", () => {
        const nextName = name.value.trim();
        if (!nextName || getParticipantKey(nextName) === getParticipantKey(entry.name)) return;
        queueRemoteWrite(updateRemoteParticipantName(entry.name, nextName));
        refreshAfterAdminSave(status, "User gespeichert.");
      });

      remove.addEventListener("click", () => {
        if (!globalThis.confirm?.(`User "${entry.name}" wirklich löschen? Alle Poll-Antworten dieses Users werden mitgelöscht.`)) return;
        if (getParticipantKey(getSavedParticipantName()) === getParticipantKey(entry.name)) {
          setSavedParticipantName("");
        }
        queueRemoteWrite(deleteRemoteParticipantEntry(entry.name));
        refreshAfterAdminSave(status, "User gelöscht.");
      });

      editor.append(name, meta);
      actions.append(save, remove);
      row.append(editor, actions);
      return row;
    }),
    "Noch keine User online gespeichert."
  );

  form.append(
    listTitle,
    entries,
    clearAllButton,
    status
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  return form;
}

function createPollAdmin(polls) {
  const form = document.createElement("form");
  form.className = "admin-form poll-admin-form";
  const status = document.createElement("p");
  status.className = "form-status";

  const availability = document.createElement("section");
  availability.className = "poll-admin-section";
  const availabilityPublished = createAdminInput("checkbox");
  availabilityPublished.checked = polls.availability.published;
  const availabilityTitle = createPollAdminHeader("Verfügbarkeit", availabilityPublished);
  const availabilityInfoField = createAdminTextarea(polls.availability.info ?? "", 3);
  const startDate = createAdminInput("date", polls.availability.startDate);
  const endDate = createAdminInput("date", polls.availability.endDate);
  const eventDates = document.createElement("div");
  eventDates.className = "poll-admin-columns";
  eventDates.append(createAdminField("Event von", startDate), createAdminField("Event bis", endDate));
  availability.append(
    availabilityTitle,
    createAdminField("Info", availabilityInfoField),
    eventDates
  );

  const suggestions = document.createElement("section");
  suggestions.className = "poll-admin-section";
  const suggestionsPublished = createAdminInput("checkbox");
  suggestionsPublished.checked = polls.suggestions.published;
  const suggestionsTitle = createPollAdminHeader("Game Vorschläge", suggestionsPublished);
  const suggestionsInfoField = createAdminTextarea(polls.suggestions.info ?? "", 3);
  suggestions.append(
    suggestionsTitle,
    createAdminField("Info", suggestionsInfoField)
  );

  const gameVote = document.createElement("section");
  gameVote.className = "poll-admin-section";
  const gameVotePublished = createAdminInput("checkbox");
  gameVotePublished.checked = polls.gameVote.published;
  const gameVoteTitle = createPollAdminHeader("Game Voting", gameVotePublished);
  const gameVoteInfoField = createAdminTextarea(polls.gameVote.info ?? "", 3);
  const categoryEditor = document.createElement("div");
  categoryEditor.className = "vote-category-editor";
  const savedGroups = getGameVoteGroups(polls.gameVote);
  const addCategoryButton = document.createElement("button");
  addCategoryButton.className = "admin-secondary-button";
  addCategoryButton.type = "button";
  addCategoryButton.textContent = "Kategorie hinzufügen";

  function appendCategory(group = { title: "", options: [] }) {
    const block = document.createElement("div");
    block.className = "vote-category-block";
    const name = createAdminInput("text", group.title ?? "");
    name.className = "vote-category-name";
    const games = createAdminTextarea((group.options ?? []).join("\n"), 4);
    games.className = "vote-category-games";
    const remove = document.createElement("button");
    remove.className = "admin-secondary-button remove-category";
    remove.type = "button";
    remove.textContent = "Entfernen";
    remove.addEventListener("click", () => block.remove());
    block.append(
      createAdminField("Kategorie", name),
      createAdminField("Spiele (eins pro Zeile)", games),
      remove
    );
    categoryEditor.append(block);
  }

  (savedGroups.length ? savedGroups : [{ title: "", options: [] }]).forEach(appendCategory);
  addCategoryButton.addEventListener("click", () => appendCategory());
  gameVote.append(
    gameVoteTitle,
    createAdminField("Info", gameVoteInfoField),
    categoryEditor,
    addCategoryButton
  );

  const availabilityEntries = getAvailabilityEntries();
  const suggestionEntries = getSuggestionEntries();
  const gameVoteEntries = getGameVoteEntries();

  const availabilityDataTitle = document.createElement("h4");
  availabilityDataTitle.textContent = "Antworten";
  const availabilityDataList = createAdminList(
    availabilityEntries.map((entry) => {
      const remove = createActionButton("Löschen", "admin-remove-button");
      remove.addEventListener("click", () => {
        deleteAvailabilityEntry(entry.name);
        refreshAfterAdminSave(status, "Verfügbarkeits-Antwort gelöscht.");
      });
      return createAdminEntry(
        entry.name,
        `${Object.keys(entry.answers ?? {}).length} Tage${entry.note?.trim() ? " / mit Info" : ""}`,
        remove
      );
    }),
    "Noch keine Antworten vorhanden."
  );
  const availabilityClear = createActionButton("Alle Antworten löschen");
  availabilityClear.addEventListener("click", () => {
    availabilityEntries.forEach((entry) => deleteAvailabilityEntry(entry.name));
    refreshAfterAdminSave(status, "Alle Verfügbarkeits-Antworten gelöscht.");
  });
  availability.append(availabilityDataTitle, availabilityDataList, availabilityClear);

  const suggestionsDataTitle = document.createElement("h4");
  suggestionsDataTitle.textContent = "Vorschläge";
  const suggestionsDataList = createAdminList(
    suggestionEntries.map((entry) => {
      const remove = createActionButton("Löschen", "admin-remove-button");
      remove.addEventListener("click", () => {
        deleteSuggestionEntry(entry.id);
        refreshAfterAdminSave(status, "Vorschlag gelöscht.");
      });
      return createAdminEntry(entry.name, entry.text, remove);
    }),
    "Noch keine Vorschläge vorhanden."
  );
  const suggestionsClear = createActionButton("Alle Vorschläge löschen");
  suggestionsClear.addEventListener("click", () => {
    suggestionEntries.forEach((entry) => deleteSuggestionEntry(entry.id));
    refreshAfterAdminSave(status, "Alle Vorschläge gelöscht.");
  });
  suggestions.append(suggestionsDataTitle, suggestionsDataList, suggestionsClear);

  const gameVoteDataTitle = document.createElement("h4");
  gameVoteDataTitle.textContent = "Votes";
  const gameVoteDataList = createAdminList(
    gameVoteEntries.map((entry) => {
      const remove = createActionButton("Löschen", "admin-remove-button");
      remove.addEventListener("click", () => {
        deleteGameVoteEntry(entry.name);
        refreshAfterAdminSave(status, "Vote gelöscht.");
      });
      return createAdminEntry(
        entry.name,
        `${(entry.answers ?? []).length} Auswahl${(entry.answers ?? []).length === 1 ? "" : "en"}`,
        remove
      );
    }),
    "Noch keine Votes vorhanden."
  );
  const gameVoteClear = createActionButton("Alle Votes löschen");
  gameVoteClear.addEventListener("click", () => {
    gameVoteEntries.forEach((entry) => deleteGameVoteEntry(entry.name));
    refreshAfterAdminSave(status, "Alle Votes gelöscht.");
  });
  gameVote.append(gameVoteDataTitle, gameVoteDataList, gameVoteClear);

  form.append(availability, suggestions, gameVote, createAdminButton("Polls speichern"), status);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextPolls = {
      availability: {
        published: availabilityPublished.checked,
        info: availabilityInfoField.value.trim(),
        startDate: startDate.value,
        endDate: endDate.value,
      },
      suggestions: {
        published: suggestionsPublished.checked,
        info: suggestionsInfoField.value.trim(),
      },
      gameVote: {
        published: gameVotePublished.checked,
        info: gameVoteInfoField.value.trim(),
        groups: [...categoryEditor.querySelectorAll(".vote-category-block")]
          .map((block) => ({
            title: block.querySelector(".vote-category-name").value.trim() || "Allgemein",
            options: block.querySelector(".vote-category-games").value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          }))
          .filter((group) => group.options.length),
      },
    };

    setStoredJson("adminPollData", nextPolls);
    refreshAfterAdminSave(status, "Polls gespeichert.");
  });

  return form;
}

function createPollAdminHeader(titleText, checkbox) {
  const header = document.createElement("div");
  header.className = "poll-admin-head";
  const title = document.createElement("h3");
  title.textContent = titleText;
  const toggle = document.createElement("label");
  toggle.className = "poll-publish-toggle";
  const label = document.createElement("span");
  label.textContent = "Freigegeben";
  toggle.append(label, checkbox);
  header.append(title, toggle);
  return header;
}

function createRankingAdmin(ranking) {
  const form = document.createElement("form");
  form.className = "admin-form";
  const existingDays = ranking.days?.length ? ranking.days : [
    { label: "Day 1", games: ["Game 1", "Game 2", "Game 3", "Game 4", "Game 5"] },
    { label: "Day 2", games: ["Game 1", "Game 2", "Game 3", "Game 4", "Game 5"] },
  ];
  const existingPlayers = ranking.players?.length ? ranking.players : [];
  const dayCount = createAdminInput("number", existingDays.length);
  const gamesPerDay = createAdminInput("number", existingDays[0]?.games?.length ?? 5);
  const playerCount = createAdminInput("number", existingPlayers.length || 10);
  const mode = document.createElement("select");
  const soloOption = document.createElement("option");
  soloOption.value = "solo";
  soloOption.textContent = "Solo";
  const duoOption = document.createElement("option");
  duoOption.value = "duo";
  duoOption.textContent = "Duo";
  mode.append(soloOption, duoOption);
  mode.value = ranking.mode ?? "solo";
  const settings = document.createElement("div");
  settings.className = "ranking-settings";
  const tableArea = document.createElement("div");
  tableArea.className = "ranking-admin-table-wrap";
  const status = document.createElement("p");
  status.className = "form-status";
  const buildButton = document.createElement("button");
  buildButton.className = "admin-secondary-button";
  buildButton.type = "button";
  buildButton.textContent = "Rangliste erstellen";

  dayCount.min = "1";
  dayCount.max = "10";
  gamesPerDay.min = "1";
  gamesPerDay.max = "10";
  playerCount.min = "1";
  playerCount.max = "32";

  function buildDays() {
    const daysTotal = Math.max(1, Number(dayCount.value || 1));
    const gamesTotal = Math.max(1, Number(gamesPerDay.value || 1));

    return Array.from({ length: daysTotal }, (_, dayIndex) => ({
      label: `Day ${dayIndex + 1}`,
      games: Array.from({ length: gamesTotal }, (_, gameIndex) => `Game ${gameIndex + 1}`),
    }));
  }

  function getDefaultPlayerName(index, partnerIndex = 0) {
    if (mode.value === "duo") return `Gamer ${index * 2 + partnerIndex + 1}`;
    return `Gamer ${index + 1}`;
  }

  function getExistingPlayer(index, players = existingPlayers) {
    return players[index] ?? {};
  }

  function renderEditableTable(days = buildDays(), players = existingPlayers) {
    const columns = flattenRankingColumns(days).filter((column) => column.type === "game");
    const isDuo = mode.value === "duo";
    const rowsTotal = Math.min(32, Math.max(1, Number(playerCount.value || players.length || 1)));
    const table = document.createElement("table");
    table.className = "ranking-edit-table";
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    const header = document.createElement("tr");
    const headers = ["Online", isDuo ? "Spieler 1" : "Spieler", ...(isDuo ? ["Spieler 2"] : []), ...columns.map((column) => column.label), "MVP"];

    header.append(...headers.map((label) => createCell(label, "", "th")));
    thead.append(header);

    for (let index = 0; index < rowsTotal; index += 1) {
      const player = getExistingPlayer(index, players);
      const row = document.createElement("tr");
      const published = createAdminInput("checkbox");
      published.checked = player.published ?? true;
      const name = createAdminInput("text", player.name || getDefaultPlayerName(index, 0));
      const name2 = createAdminInput("text", player.name2 || getDefaultPlayerName(index, 1));
      const mvp = createAdminInput("number", player.mvp ?? "");

      row.append(wrapInputCell(published), wrapInputCell(name, "player-input"));
      if (isDuo) row.append(wrapInputCell(name2, "player-input player-input-2"));
      columns.forEach((column) => {
        const score = createAdminInput("number", player.scores?.[column.key] ?? "");
        score.dataset.scoreKey = column.key;
        row.append(wrapInputCell(score));
      });
      row.append(wrapInputCell(mvp, "mvp-input"));
      tbody.append(row);
    }

    table.append(thead, tbody);
    tableArea.replaceChildren(table);
  }

  function wrapInputCell(input, className = "") {
    const cell = document.createElement("td");
    if (className) input.className = className;
    cell.append(input);
    return cell;
  }

  function readEditableTablePlayers() {
    const isDuo = mode.value === "duo";
    return [...tableArea.querySelectorAll("tbody tr")]
      .map((row, index) => {
        const published = row.querySelector('input[type="checkbox"]')?.checked ?? true;
        const name = row.querySelector(".player-input")?.value.trim() || getDefaultPlayerName(index, 0);
        const name2 = isDuo
          ? row.querySelector(".player-input-2")?.value.trim() || getDefaultPlayerName(index, 1)
          : "";
        const mvp = Number(row.querySelector(".mvp-input")?.value || 0);
        const scores = {};

        row.querySelectorAll("[data-score-key]").forEach((input) => {
          if (input.value !== "") scores[input.dataset.scoreKey] = Number(input.value);
        });

        return { published, name, name2, mvp, scores };
      });
  }

  buildButton.addEventListener("click", () => {
    renderEditableTable(buildDays(), readEditableTablePlayers());
    status.textContent = "Rangliste erstellt.";
  });
  mode.addEventListener("change", () => {
    if (tableArea.querySelector("tbody")) {
      renderEditableTable(buildDays(), readEditableTablePlayers());
    }
  });
  const archiveButton = document.createElement("button");
  archiveButton.className = "admin-secondary-button";
  archiveButton.type = "button";
  archiveButton.textContent = "Rangliste archivieren";
  archiveButton.addEventListener("click", () => {
    if (!tableArea.querySelector("tbody")) {
      renderEditableTable(buildDays(), []);
    }
    const archive = getStoredJson("adminRankingArchive", []);
    const currentRanking = {
      mode: mode.value,
      days: buildDays(),
      players: readEditableTablePlayers(),
    };
    const archiveEntry = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
      title: `Rangliste ${new Date().toLocaleDateString("de-DE")}`,
      createdAt: new Date().toISOString(),
      ranking: currentRanking,
    };

    setStoredJson("adminRankingArchive", [archiveEntry, ...archive]);
    status.textContent = "Rangliste archiviert.";
  });
  const clearRankingButton = createActionButton("Rangliste löschen");
  clearRankingButton.addEventListener("click", () => {
    const emptyRanking = {
      mode: "solo",
      days: buildDays(),
      players: [],
    };
    setStoredJson("adminRankingData", emptyRanking);
    tableArea.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "empty-state table-empty-state";
    empty.textContent = "Noch keine Rangliste erstellt.";
    tableArea.append(empty);
    refreshAfterAdminSave(status, "Rangliste gelöscht.");
  });
  const clearArchiveButton = createActionButton("Archiv löschen");
  clearArchiveButton.addEventListener("click", () => {
    setStoredJson("adminRankingArchive", []);
    refreshAfterAdminSave(status, "Archiv gelöscht.");
  });

  const actions = document.createElement("div");
  actions.className = "admin-actions";
  actions.append(createAdminButton("Rangliste speichern"), archiveButton, clearRankingButton, clearArchiveButton);

  settings.append(
    createAdminField("Anzahl Tage", dayCount),
    createAdminField("Spiele pro Tag", gamesPerDay),
    createAdminField("Teilnehmer", playerCount),
    createAdminField("Modus", mode)
  );

  form.append(
    settings,
    buildButton,
    tableArea,
    actions,
    status
  );
  if (existingPlayers.length) {
    renderEditableTable(existingDays, existingPlayers);
  } else {
    const empty = document.createElement("p");
    empty.className = "empty-state table-empty-state";
    empty.textContent = "Noch keine Rangliste erstellt.";
    tableArea.replaceChildren(empty);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!tableArea.querySelector("tbody")) {
      renderEditableTable(buildDays(), []);
    }
    const nextRanking = {
      mode: mode.value,
      days: buildDays(),
      players: readEditableTablePlayers(),
    };

    setStoredJson("adminRankingData", nextRanking);
    refreshAfterAdminSave(status, "Rangliste gespeichert.");
  });

  return form;
}

function initAdminUi() {
  const actions = document.createElement("div");
  actions.className = "admin-floating-actions";
  const button = document.createElement("button");
  button.className = "admin-fab";
  button.type = "button";
  button.textContent = "Admin";
  const logout = document.createElement("button");
  logout.className = "admin-logout-fab";
  logout.type = "button";
  logout.textContent = "Logout";

  function updateLogoutVisibility() {
    logout.hidden = !isAdminLoggedIn();
  }

  document.addEventListener("admin-state-change", updateLogoutVisibility);
  document.addEventListener("admin-state-change", refreshAdminNavigation);

  const modal = document.createElement("dialog");
  modal.className = "admin-modal";
  const header = document.createElement("div");
  header.className = "admin-modal-head";
  const title = document.createElement("h2");
  title.textContent = "Admin";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Schließen";
  close.addEventListener("click", () => modal.close());
  header.append(title, close);

  const body = document.createElement("div");
  body.className = "admin-modal-body";
  modal.append(header, body);

  button.addEventListener("click", async () => {
    const session = await ensureAdminSession();
    if (session?.isAdmin) {
      renderInlineAdminTools();
    } else {
      modal.showModal();
      renderAdminLogin(body);
    }
  });

  logout.addEventListener("click", () => {
    clearAdminSession();
    document.querySelector(".inline-admin")?.remove();
    refreshPageAdminState();
    updateLogoutVisibility();
  });

  actions.append(logout, button);
  document.body.append(actions, modal);
  updateLogoutVisibility();
  refreshAdminNavigation();
  ensureAdminSession().then((session) => {
    updateLogoutVisibility();
    refreshAdminNavigation();
    if (session?.isAdmin) {
      renderInlineAdminTools();
      renderUserPage();
    }
  });
}

initAdminUi();
