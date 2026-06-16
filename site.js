const newsList = document.querySelector("#news-list");
const calendarGrid = document.querySelector("#calendar-grid");
const calendarTitle = document.querySelector("#calendar-title");
const prevMonthButton = document.querySelector("#prev-month");
const nextMonthButton = document.querySelector("#next-month");
const rankingPanel = document.querySelector(".ranking-panel");
const rankingHead = document.querySelector("#ranking-head");
const rankingBody = document.querySelector("#ranking-body");
const pollEmpty = document.querySelector("#poll-empty");
const availabilityPoll = document.querySelector("#availability-poll");
const availabilityInfo = document.querySelector("#availability-info");
const availabilityForm = document.querySelector("#availability-form");
const availabilityOptions = document.querySelector("#availability-options");
const availabilityNote = document.querySelector("#availability-note");
const availabilityName = document.querySelector("#availability-name");
const availabilityStatus = document.querySelector("#availability-status");
const suggestionPoll = document.querySelector("#suggestion-poll");
const suggestionInfo = document.querySelector("#suggestion-info");
const suggestionForm = document.querySelector("#suggestion-form");
const suggestionName = document.querySelector("#suggestion-name");
const suggestionStatus = document.querySelector("#suggestion-status");
const gameVotePoll = document.querySelector("#game-vote-poll");
const gameVoteInfo = document.querySelector("#game-vote-info");
const gameVoteForm = document.querySelector("#game-vote-form");
const gameVoteOptions = document.querySelector("#game-vote-options");
const gameVoteName = document.querySelector("#game-vote-name");
const gameVoteStatus = document.querySelector("#game-vote-status");

let visibleMonth = new Date();
visibleMonth.setDate(1);

const adminStore = {};
const remoteStore = {};
const pendingRemoteWrites = [];
let remotePollDataLoaded = false;
const supabaseConfig = globalThis.PATALYMPICS_SUPABASE ?? null;
const supabaseEnabled = Boolean(supabaseConfig?.url && supabaseConfig?.anonKey);
const initialSiteData = {
  news: [],
  calendar: [],
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
};

function getStoredJson(key, fallback) {
  try {
    if (Object.prototype.hasOwnProperty.call(remoteStore, key)) {
      return remoteStore[key] ?? fallback;
    }
    const storedValue = globalThis.localStorage?.getItem(key) ?? adminStore[key];
    return JSON.parse(storedValue) ?? fallback;
  } catch {
    return fallback;
  }
}

function setStoredJson(key, value) {
  const serializedValue = JSON.stringify(value);
  remoteStore[key] = value;

  try {
    if (globalThis.localStorage) {
      globalThis.localStorage.setItem(key, serializedValue);
    }
  } catch {
  }

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

function getSupabaseHeaders(extra = {}) {
  return {
    apikey: supabaseConfig.anonKey,
    Authorization: `Bearer ${supabaseConfig.anonKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseFetch(path, options = {}) {
  if (!supabaseEnabled) return null;

  try {
    const baseUrl = supabaseConfig.url.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...options,
      headers: getSupabaseHeaders(options.headers),
    });

    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    if (response.status === 204) return null;
    return response.json();
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

function syncRemoteData(key, value) {
  if (!supabaseEnabled) return;

  if (key.startsWith("admin")) {
    pendingRemoteWrites.push(saveRemoteSiteContent(key, value));
  }
}

async function loadRemotePollData() {
  if (!supabaseEnabled || remotePollDataLoaded) return;

  const [availability, suggestions, votes] = await Promise.all([
    supabaseFetch("poll_availability_answers?select=participant_name,answers,note,updated_at"),
    supabaseFetch("poll_game_suggestions?select=id,participant_name,suggestion,created_at&order=created_at.asc"),
    supabaseFetch("poll_game_votes?select=participant_name,answers,updated_at"),
  ]);

  if (Array.isArray(availability)) {
    remoteStore.pollAvailabilityAnswers = {
      participants: availability.map((entry) => ({
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

function formatDate(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function createNewsItem(item) {
  const article = document.createElement("article");
  article.className = "news-item";

  const meta = document.createElement("p");
  meta.className = "news-meta";
  meta.textContent = [formatDate(item.date), item.author].filter(Boolean).join(" / ");

  const title = document.createElement("h2");
  title.textContent = item.title;

  const body = document.createElement("p");
  body.className = "news-body";
  body.textContent = item.body;

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
      empty.textContent = "Noch keine News veröffentlicht.";
      newsList.append(empty);
      return;
    }

    newsList.append(...publishedItems.map(createNewsItem));
  } catch {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "News konnten nicht geladen werden.";
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
    empty.textContent = "Kalender konnte nicht geladen werden.";
    calendarGrid.append(empty);
  }
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

function getParticipantName(input) {
  return input?.value.trim() || "";
}

function getParticipantKey(name) {
  return name.trim().toLocaleLowerCase("de-DE");
}

function getSavedParticipantName() {
  return getStoredJson("pollParticipantName", "");
}

function setSavedParticipantName(name) {
  if (name) setStoredJson("pollParticipantName", name);
}

function applySavedParticipantName(input) {
  if (input && !input.value) input.value = getSavedParticipantName();
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
  saveRemoteAvailabilityEntry(entry);
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
  saveRemoteSuggestionEntry(entry);
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
  saveRemoteGameVoteEntry(entry);
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
  renderPollInfo(availabilityInfo, config.info);
  applySavedParticipantName(availabilityName);
  const savedEntry = getAvailabilityEntry(getParticipantName(availabilityName));
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
  applySavedParticipantName(suggestionName);
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

  renderPollInfo(gameVoteInfo, config.info);
  renderPollResultButtonInSection(gameVotePoll, "Game Voting", () => createGameVoteResults(config));
  const submitButton = gameVoteForm.querySelector("button");
  applySavedParticipantName(gameVoteName);
  const savedAnswers = getGameVoteEntry(getParticipantName(gameVoteName))?.answers ?? [];
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

  await loadRemotePollData();
  const polls = await loadLocalData("adminPollData", initialSiteData.polls);
  renderAvailabilityPoll(polls.availability);
  renderSuggestionPoll(polls.suggestions);
  renderGameVotePoll(polls.gameVote);
  pollEmpty.hidden = polls.availability.published || polls.suggestions.published || polls.gameVote.published;
}

availabilityForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = getParticipantName(availabilityName);
  if (!name) return;
  const answers = {};
  availabilityForm.querySelectorAll('input[type="radio"]:checked').forEach((input) => {
    answers[input.name] = input.value;
  });
  setSavedParticipantName(name);
  saveAvailabilityEntry({
    name,
    answers,
    note: availabilityNote.value.trim(),
    updatedAt: new Date().toISOString(),
  });
  availabilityStatus.textContent = "Gespeichert.";
});

suggestionForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = getParticipantName(suggestionName);
  const text = suggestionForm.elements.games.value.trim();
  if (!name || !text) return;

  setSavedParticipantName(name);
  saveSuggestionEntry({
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
    name,
    text,
    createdAt: new Date().toISOString(),
  });
  suggestionForm.reset();
  applySavedParticipantName(suggestionName);
  suggestionStatus.textContent = "Vorschlag gespeichert.";
});

gameVoteForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = getParticipantName(gameVoteName);
  if (!name) return;
  const answers = [...gameVoteForm.querySelectorAll('input[name="games"]:checked')].map((input) => input.value);
  setSavedParticipantName(name);
  saveGameVoteEntry({
    name,
    answers,
    updatedAt: new Date().toISOString(),
  });
  gameVoteStatus.textContent = "Abstimmung gespeichert.";
});

loadPolls();

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

function createAvailabilityResults(config) {
  const section = createPollResultSection("Auswertung");
  const entries = getAvailabilityEntries();
  const dates = getDateRange(config.startDate, config.endDate);

  if (!dates.length) {
    const empty = document.createElement("p");
    empty.className = "poll-result-empty";
    empty.textContent = "Noch kein Zeitraum festgelegt.";
    section.append(empty);
    return section;
  }

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "poll-result-empty";
    empty.textContent = "Noch keine Antworten.";
    section.append(empty);
    return section;
  }

  const totals = document.createElement("div");
  totals.className = "poll-result-grid";
  dates.forEach((date) => {
    const label = new Intl.DateTimeFormat("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(`${date}T00:00:00`));
    const counts = entries.reduce((result, entry) => {
      const answer = entry.answers?.[date] ?? "open";
      result[answer] = (result[answer] ?? 0) + 1;
      return result;
    }, { yes: 0, maybe: 0, no: 0, open: 0 });
    totals.append(createResultLine(label, `${counts.yes} kann / ${counts.maybe} vielleicht / ${counts.no} nein`, "result-open"));
  });
  section.append(totals);

  const participantList = document.createElement("div");
  participantList.className = "poll-result-group";
  const participantTitle = document.createElement("h5");
  participantTitle.textContent = "Teilnehmer";
  participantList.append(participantTitle);
  entries.forEach((entry) => {
    const values = dates.map((date) => {
      const label = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(new Date(`${date}T00:00:00`));
      const answer = {
        yes: "Kann",
        maybe: "Vielleicht",
        no: "Nein",
        open: "Offen",
      }[entry.answers?.[date] ?? "open"];
      return `${label}: ${answer}`;
    });
    participantList.append(createResultLine(entry.name, values.join(" | "), "result-open"));
    if (entry.note?.trim()) {
      const note = document.createElement("p");
      note.className = "poll-result-note";
      note.textContent = entry.note.trim();
      participantList.append(note);
    }
  });
  section.append(participantList);

  return section;
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

const ADMIN_PASSWORD = "patalympics";

function isAdminLoggedIn() {
  return getStoredJson("adminLoggedIn", false);
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

async function getAdminData() {
  return {
    news: await loadLocalData("adminNewsData", initialSiteData.news),
    calendar: await loadLocalData("adminCalendarData", initialSiteData.calendar),
    polls: await loadLocalData("adminPollData", initialSiteData.polls),
    ranking: await loadLocalData("adminRankingData", initialSiteData.ranking),
  };
}

async function waitForRemoteWrites() {
  if (!pendingRemoteWrites.length) return;
  const writes = pendingRemoteWrites.splice(0, pendingRemoteWrites.length);
  await Promise.race([
    Promise.allSettled(writes),
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]);
}

async function refreshAfterAdminSave(status, message) {
  status.textContent = message;
  await waitForRemoteWrites();
  setTimeout(() => globalThis.location.reload(), 450);
}

function renderAdminLogin(modalBody) {
  modalBody.replaceChildren();

  const form = document.createElement("form");
  form.className = "admin-form";
  const password = createAdminInput("password");
  const status = document.createElement("p");
  status.className = "form-status";

  form.append(
    createAdminField("Admin Passwort", password),
    createAdminButton("Einloggen"),
    status
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (password.value === ADMIN_PASSWORD) {
      setStoredJson("adminLoggedIn", true);
      const modal = modalBody.closest("dialog");
      modal?.close();
      refreshPageAdminState();
      renderInlineAdminTools();
      document.dispatchEvent(new CustomEvent("admin-state-change"));
      return;
    }

    status.textContent = "Passwort stimmt nicht.";
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
  const wrap = document.createElement("div");
  wrap.className = "admin-grid";

  wrap.append(
    renderAdminSection("News", createNewsAdmin(data.news)),
    renderAdminSection("Kalender", createCalendarAdmin(data.calendar)),
    renderAdminSection("Polls", createPollAdmin(data.polls)),
    renderAdminSection("Rangliste", createRankingAdmin(data.ranking))
  );

  modalBody.append(wrap);
}

function getInlineAdminConfig(data) {
  const path = globalThis.location.pathname;

  if (path.endsWith("/news.html")) {
    return {
      title: "News bearbeiten",
      content: createNewsAdmin(data.news),
    };
  }

  if (path.endsWith("/kalender.html")) {
    return {
      title: "Kalender bearbeiten",
      content: createCalendarAdmin(data.calendar),
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

  return null;
}

async function renderInlineAdminTools() {
  const existing = document.querySelector(".inline-admin");
  if (existing) {
    existing.remove();
    return;
  }

  const data = await getAdminData();
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

async function refreshPageAdminState() {
  document.querySelectorAll(".poll-section-result-button, .availability-admin-summary").forEach((element) => {
    element.remove();
  });

  if (pollEmpty) {
    await loadPolls();
  }
}

function createNewsAdmin(news) {
  const form = document.createElement("form");
  form.className = "admin-form";
  const title = createAdminInput();
  const author = createAdminInput("text", "Admin");
  const body = createAdminTextarea("", 4);
  const status = document.createElement("p");
  status.className = "form-status";

  form.append(
    createAdminField("Titel", title),
    createAdminField("Autor", author),
    createAdminField("Text", body),
    createAdminButton("News speichern"),
    status
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextNews = [
      {
        title: title.value.trim(),
        author: author.value.trim(),
        body: body.value.trim(),
        date: new Date().toISOString().slice(0, 10),
        published: true,
      },
      ...news,
    ].filter((item) => item.title && item.body);

    setStoredJson("adminNewsData", nextNews);
    refreshAfterAdminSave(status, "News gespeichert.");
  });

  return form;
}

function createCalendarAdmin(events) {
  const form = document.createElement("form");
  form.className = "admin-form";
  const date = createAdminInput("date");
  const time = createAdminInput("time");
  const title = createAdminInput();
  const status = document.createElement("p");
  status.className = "form-status";

  form.append(
    createAdminField("Datum", date),
    createAdminField("Uhrzeit", time),
    createAdminField("Termin", title),
    createAdminButton("Termin speichern"),
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
      createdAt: new Date().toISOString(),
      ranking: currentRanking,
    };

    setStoredJson("adminRankingArchive", [archiveEntry, ...archive]);
    status.textContent = "Rangliste archiviert.";
  });

  const actions = document.createElement("div");
  actions.className = "admin-actions";
  actions.append(createAdminButton("Rangliste speichern"), archiveButton);

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

  const modal = document.createElement("dialog");
  modal.className = "admin-modal";
  const header = document.createElement("div");
  header.className = "admin-modal-head";
  const title = document.createElement("h2");
  title.textContent = "Admin";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Schliessen";
  close.addEventListener("click", () => modal.close());
  header.append(title, close);

  const body = document.createElement("div");
  body.className = "admin-modal-body";
  modal.append(header, body);

  button.addEventListener("click", () => {
    if (isAdminLoggedIn()) {
      renderInlineAdminTools();
    } else {
      modal.showModal();
      renderAdminLogin(body);
    }
  });

  logout.addEventListener("click", () => {
    setStoredJson("adminLoggedIn", false);
    document.querySelector(".inline-admin")?.remove();
    refreshPageAdminState();
    updateLogoutVisibility();
  });

  actions.append(logout, button);
  document.body.append(actions, modal);
  updateLogoutVisibility();
  if (isAdminLoggedIn()) renderInlineAdminTools();
}

initAdminUi();
