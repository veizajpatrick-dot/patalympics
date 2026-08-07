(function () {
  const lobbyList = document.querySelector("#pickban-lobbies");
  const detail = document.querySelector("#pickban-detail");
  const syncStatus = document.querySelector("#pickban-sync-status");
  if (!lobbyList || !detail) return;

  const lobbyCount = 5;
  const teamLabels = { left: "Team 1", right: "Team 2" };
  const teamSides = { left: "Links", right: "Rechts" };
  const testerSlots = {
    left: ["Tester 1", "Tester 2"],
    right: ["Tester 3", "Tester 4"],
  };
  let playerImageMap = {};
  const defaultGames = [
    { id: "game-1", title: "Battlerite", image: "assets/pickban-battlerite.jpg" },
    { id: "game-2", title: "Brawlhalla", image: "assets/pickban-brawlhalla.jpeg" },
    { id: "game-3", title: "Slapshot", image: "assets/pickban-slapshot.jpeg" },
    { id: "game-4", title: "Slappyball", image: "assets/pickban-slappyball.jpeg" },
    { id: "game-5", title: "Redmatch", image: "assets/pickban-redmatch.jpeg" },
    { id: "game-6", title: "Spellsworn", image: "assets/pickban-spellsworn.jpeg" },
    { id: "game-7", title: "Bagelball", image: "assets/pickban-bagelball.jpeg" },
    { id: "game-8", title: "2v2 Aram", image: "assets/pickban-2v2-aram.jpeg" },
    { id: "game-9", title: "Straftat 2v2", image: "assets/pickban-straftat-2v2.jpeg" },
    { id: "game-10", title: "Overwatch 2v2", image: "assets/pickban-overwatch-2v2.jpeg" },
    { id: "game-11", title: "Wingman Minezone", image: "assets/pickban-wingman-minezone.jpeg" },
  ];

  const lobbies = new Map();
  let activeLobbyId = getLobbyIdFromHash();
  let pollingTimer = null;
  let realtimeChannel = null;
  let isSaving = false;

  function setSyncStatus(text, state = "") {
    syncStatus.textContent = text;
    syncStatus.dataset.state = state;
  }

  function nameKey(value) {
    if (typeof getParticipantKey === "function") return getParticipantKey(value);
    return String(value ?? "").trim().toLocaleLowerCase("de-DE");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizePlayerImageMap(images = {}) {
    const source = images && typeof images === "object" ? images : {};
    return Object.entries(source).reduce((nextImages, [name, image]) => {
      const cleanName = String(name ?? "").trim();
      const cleanImage = String(image ?? "").trim();
      if (cleanName && cleanImage) nextImages[cleanName] = cleanImage;
      return nextImages;
    }, {});
  }

  async function loadPlayerImages() {
    if (typeof globalThis.loadLocalData !== "function") return;

    const savedImages = await globalThis.loadLocalData("adminPickBanPlayerImages", {});
    playerImageMap = normalizePlayerImageMap(savedImages);
    render();
  }

  function getPlayerImage(name) {
    const directImage = playerImageMap[name] || playerImageMap[nameKey(name)];
    return typeof directImage === "string" ? directImage.trim() : "";
  }

  function getPlayerInitials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }

  function renderGameVisual(game, imageClass = "") {
    const image = String(game?.image || "").trim();
    if (!image) return `<span class="pickban-placeholder"></span>`;

    const classAttribute = imageClass ? ` class="${imageClass}"` : "";
    return `<img${classAttribute} src="${escapeHtml(image)}" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false;" /><span class="pickban-placeholder pickban-fallback-placeholder" hidden></span>`;
  }

  function getActiveParticipantName() {
    return typeof getParticipantName === "function" ? getParticipantName() : "";
  }

  function isPickBanAdmin() {
    return typeof isAdminLoggedIn === "function" && isAdminLoggedIn();
  }

  function getLobbyIdFromHash() {
    const match = globalThis.location.hash.match(/lobby-(\d+)/i);
    const id = match ? Number(match[1]) : 1;
    return Math.min(Math.max(id || 1, 1), lobbyCount);
  }

  function setActiveLobby(id) {
    activeLobbyId = Math.min(Math.max(Number(id) || 1, 1), lobbyCount);
    globalThis.location.hash = `lobby-${activeLobbyId}`;
    render();
  }

  function createDefaultLobby(id) {
    return {
      version: 1,
      id,
      phase: "waiting",
      round: 1,
      firstBanTeam: "left",
      turnTeam: "left",
      games: defaultGames,
      teams: {
        left: { players: [] },
        right: { players: [] },
      },
      ready: { left: [], right: [] },
      currentBans: [],
      lockedGames: [],
      pickedGames: [],
      currentGame: null,
      loserTeam: "",
      roundConfirm: { left: false, right: false },
      finishConfirm: { left: false, right: false },
      log: [],
      updatedAt: new Date().toISOString(),
    };
  }

  function uniqueNames(names = []) {
    const map = new Map();
    (Array.isArray(names) ? names : []).forEach((name) => {
      const trimmed = String(name ?? "").trim();
      if (!trimmed) return;
      map.set(nameKey(trimmed), trimmed);
    });
    return [...map.values()];
  }

  function normalizeGames(games) {
    const savedGames = Array.isArray(games) ? games : [];
    const merged = defaultGames.map((game) => {
      const saved = savedGames.find((entry) => entry?.id === game.id);
      return {
        ...game,
        title: String(game.title || saved?.title || ""),
        image: String(game.image || saved?.image || ""),
      };
    });
    const extras = savedGames
      .filter((game) => game?.id && !merged.some((entry) => entry.id === game.id))
      .map((game) => ({
        id: String(game.id),
        title: String(game.title || game.id),
        image: String(game.image || ""),
      }));
    return [...merged, ...extras].slice(0, 11);
  }

  function normalizeLobby(rawState, id) {
    const fallback = createDefaultLobby(id);
    const state = rawState && typeof rawState === "object" ? rawState : {};
    const leftPlayers = uniqueNames(state.teams?.left?.players);
    const rightPlayers = uniqueNames(state.teams?.right?.players)
      .filter((name) => !leftPlayers.some((leftName) => nameKey(leftName) === nameKey(name)));
    const normalized = {
      ...fallback,
      ...state,
      id,
      phase: ["waiting", "ban", "pick", "game"].includes(state.phase) ? state.phase : fallback.phase,
      round: Math.max(1, Number(state.round || 1)),
      firstBanTeam: state.firstBanTeam === "right" ? "right" : "left",
      turnTeam: state.turnTeam === "right" ? "right" : "left",
      games: normalizeGames(state.games),
      teams: {
        left: { players: leftPlayers.slice(0, 2) },
        right: { players: rightPlayers.slice(0, 2) },
      },
      ready: {
        left: uniqueNames(state.ready?.left).filter((name) => leftPlayers.some((player) => nameKey(player) === nameKey(name))),
        right: uniqueNames(state.ready?.right).filter((name) => rightPlayers.some((player) => nameKey(player) === nameKey(name))),
      },
      currentBans: Array.isArray(state.currentBans) ? state.currentBans.filter((ban) => ban?.gameId && ban?.team) : [],
      lockedGames: Array.isArray(state.lockedGames) ? [...new Set(state.lockedGames)] : [],
      pickedGames: Array.isArray(state.pickedGames) ? state.pickedGames : [],
      currentGame: state.currentGame?.id ? state.currentGame : null,
      loserTeam: ["left", "right"].includes(state.loserTeam) ? state.loserTeam : "",
      roundConfirm: {
        left: Boolean(state.roundConfirm?.left),
        right: Boolean(state.roundConfirm?.right),
      },
      finishConfirm: {
        left: Boolean(state.finishConfirm?.left),
        right: Boolean(state.finishConfirm?.right),
      },
      log: Array.isArray(state.log) ? state.log.slice(-25) : [],
      updatedAt: state.updatedAt || fallback.updatedAt,
    };
    normalized.turnTeam = normalized.phase === "ban"
      ? getExpectedBanTeam(normalized) ?? normalized.firstBanTeam
      : normalized.turnTeam;
    return normalized;
  }

  function cloneLobby(lobby) {
    return JSON.parse(JSON.stringify(lobby));
  }

  function getPlayerTeam(lobby, name) {
    const key = nameKey(name);
    if (!key) return "";
    return ["left", "right"].find((team) => lobby.teams[team].players.some((player) => nameKey(player) === key)) || "";
  }

  function getOtherTeam(team) {
    return team === "left" ? "right" : "left";
  }

  function getAllPlayers(lobby) {
    return [...lobby.teams.left.players, ...lobby.teams.right.players];
  }

  function isTesterName(name) {
    return /^tester\s+\d+$/i.test(String(name ?? "").trim());
  }

  function hasTesterInLobby(lobby) {
    return getAllPlayers(lobby).some(isTesterName);
  }

  function canAdminControlTeam(lobby, team) {
    return isPickBanAdmin() && lobby.teams[team]?.players.some(isTesterName);
  }

  function getAdminTesterBanName(lobby, team) {
    if (!canAdminControlTeam(lobby, team)) return "";
    return lobby.teams[team].players.find((player) => isTesterName(player) && !hasUserBanned(lobby, player)) || "";
  }

  function canAdminBanForTeam(lobby, team) {
    return Boolean(getAdminTesterBanName(lobby, team));
  }

  function getTesterNameForSlot(lobby, team, slotIndex) {
    const usedKeys = new Set(getAllPlayers(lobby).map(nameKey));
    const preferred = testerSlots[team]?.[slotIndex] || "";
    if (preferred && !usedKeys.has(nameKey(preferred))) return preferred;

    for (let index = 1; index <= 20; index += 1) {
      const fallback = `Tester ${index}`;
      if (!usedKeys.has(nameKey(fallback))) return fallback;
    }
    return "";
  }

  function fillEmptyTesterSlots(lobby) {
    if (lobby.phase !== "waiting") return false;
    let changed = false;

    ["left", "right"].forEach((team) => {
      while (lobby.teams[team].players.length < 2) {
        const tester = getTesterNameForSlot(lobby, team, lobby.teams[team].players.length);
        if (!tester) break;
        lobby.teams[team].players.push(tester);
        changed = true;
      }
    });

    if (changed) {
      cleanupReady(lobby);
      pushLog(lobby, "Leere Slots wurden mit Testern gefüllt.");
    }
    return changed;
  }

  function removeTesterSlots(lobby) {
    if (lobby.phase !== "waiting") return false;
    const before = getAllPlayers(lobby).length;
    ["left", "right"].forEach((team) => {
      lobby.teams[team].players = lobby.teams[team].players.filter((player) => !isTesterName(player));
    });
    cleanupReady(lobby);

    const changed = getAllPlayers(lobby).length !== before;
    if (changed) pushLog(lobby, "Tester wurden entfernt.");
    return changed;
  }

  function markAllPlayersReady(lobby) {
    if (lobby.phase !== "waiting" || !areTeamsFull(lobby)) return false;
    lobby.ready.left = [...lobby.teams.left.players];
    lobby.ready.right = [...lobby.teams.right.players];
    pushLog(lobby, "Admin hat alle Spieler bereit gesetzt.");
    startBanPhase(lobby, "left");
    return true;
  }

  function getBanOrder(firstTeam) {
    const other = getOtherTeam(firstTeam);
    return [firstTeam, other, firstTeam, other];
  }

  function getExpectedBanTeam(lobby) {
    return getBanOrder(lobby.firstBanTeam)[lobby.currentBans.length] || "";
  }

  function getActiveTeam(lobby) {
    if (lobby.phase === "ban") return getExpectedBanTeam(lobby);
    if (lobby.phase === "pick") return lobby.firstBanTeam;
    return "";
  }

  function hasUserBanned(lobby, name) {
    const key = nameKey(name);
    return lobby.currentBans.some((ban) => nameKey(ban.by) === key);
  }

  function getGame(lobby, gameId) {
    return lobby.games.find((game) => game.id === gameId) || null;
  }

  function isGameLocked(lobby, gameId) {
    return lobby.lockedGames.includes(gameId);
  }

  function isGameBanned(lobby, gameId) {
    return lobby.currentBans.some((ban) => ban.gameId === gameId);
  }

  function getAvailableGames(lobby) {
    return lobby.games.filter((game) => !isGameLocked(lobby, game.id) && !isGameBanned(lobby, game.id));
  }

  function areTeamsFull(lobby) {
    return lobby.teams.left.players.length === 2 && lobby.teams.right.players.length === 2;
  }

  function isPlayerReady(lobby, team, name) {
    const key = nameKey(name);
    return lobby.ready[team].some((readyName) => nameKey(readyName) === key);
  }

  function areAllReady(lobby) {
    return areTeamsFull(lobby)
      && lobby.teams.left.players.every((name) => isPlayerReady(lobby, "left", name))
      && lobby.teams.right.players.every((name) => isPlayerReady(lobby, "right", name));
  }

  function pushLog(lobby, text) {
    lobby.log = [...(lobby.log || []), { text, time: new Date().toISOString() }].slice(-25);
  }

  async function ensurePickBanParticipant() {
    let name = "";
    if (typeof validateSavedParticipantName === "function") {
      name = await validateSavedParticipantName();
    }
    if (!name && typeof ensureParticipantName === "function") {
      name = ensureParticipantName();
    }
    if (!name) {
      setSyncStatus("Bitte Namen speichern.", "warn");
      return "";
    }

    if (typeof remoteParticipantExists === "function") {
      const exists = await remoteParticipantExists(name);
      if (exists === false) {
        if (typeof setSavedParticipantName === "function") setSavedParticipantName("");
        setSyncStatus("Name nicht registriert.", "warn");
        if (typeof openParticipantDialog === "function") openParticipantDialog(name);
        return "";
      }
    }

    return name;
  }

  async function fetchLobbies() {
    if (typeof supabaseFetch !== "function") {
      setSyncStatus("Supabase nicht bereit.", "error");
      return;
    }
    const rows = await supabaseFetch("pickban_lobbies?select=id,state,updated_at&order=id.asc");
    if (!Array.isArray(rows)) {
      setSyncStatus("Pick/Ban SQL fehlt.", "error");
      seedLocalLobbies();
      render();
      return;
    }
    for (let id = 1; id <= lobbyCount; id += 1) {
      const row = rows.find((entry) => Number(entry.id) === id);
      lobbies.set(id, normalizeLobby(row?.state, id));
    }
    setSyncStatus("Live synchronisiert", "ok");
    render();
  }

  function seedLocalLobbies() {
    for (let id = 1; id <= lobbyCount; id += 1) {
      if (!lobbies.has(id)) lobbies.set(id, createDefaultLobby(id));
    }
  }

  async function saveLobby(lobby) {
    if (isSaving) return;
    isSaving = true;
    const nextLobby = normalizeLobby({ ...lobby, updatedAt: new Date().toISOString() }, lobby.id);
    lobbies.set(nextLobby.id, nextLobby);
    render();

    const payload = {
      state: nextLobby,
      updated_at: nextLobby.updatedAt,
    };
    const updateResult = await supabaseFetch(`pickban_lobbies?id=eq.${nextLobby.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });

    if (Array.isArray(updateResult) && updateResult.length) {
      setSyncStatus("Gespeichert", "ok");
      isSaving = false;
      return;
    }

    const insertResult = await supabaseFetch("pickban_lobbies", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: nextLobby.id, ...payload }),
    });
    setSyncStatus(Array.isArray(insertResult) ? "Gespeichert" : "Speichern fehlgeschlagen", Array.isArray(insertResult) ? "ok" : "error");
    isSaving = false;
  }

  function setupRealtime() {
    const config = globalThis.PATALYMPICS_SUPABASE;
    if (!globalThis.supabase?.createClient || !config?.url || !config?.anonKey) {
      startPolling();
      return;
    }

    const client = globalThis.supabase.createClient(config.url, config.anonKey);
    realtimeChannel = client
      .channel("pickban-lobbies")
      .on("postgres_changes", { event: "*", schema: "public", table: "pickban_lobbies" }, (payload) => {
        const row = payload.new;
        if (!row?.id) return;
        lobbies.set(Number(row.id), normalizeLobby(row.state, Number(row.id)));
        setSyncStatus("Live synchronisiert", "ok");
        render();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setSyncStatus("Live synchronisiert", "ok");
        if (status === "CHANNEL_ERROR") setSyncStatus("Live Fallback aktiv", "warn");
      });
    startPolling(5000);
  }

  function startPolling(interval = 2200) {
    if (pollingTimer) return;
    pollingTimer = globalThis.setInterval(fetchLobbies, interval);
  }

  function getPhaseText(lobby) {
    if (lobby.phase === "waiting") return "Warten";
    if (lobby.phase === "ban") return `${teamLabels[lobby.turnTeam]} bannt`;
    if (lobby.phase === "pick") return `${teamLabels[lobby.turnTeam]} pickt`;
    if (lobby.phase === "game") return "Spiel läuft";
    return "Lobby";
  }

  function render() {
    seedLocalLobbies();
    renderLobbyList();
    renderLobbyDetail();
  }

  function renderLobbyList() {
    lobbyList.innerHTML = "";
    for (let id = 1; id <= lobbyCount; id += 1) {
      const lobby = lobbies.get(id) || createDefaultLobby(id);
      const button = document.createElement("button");
      button.className = `pickban-lobby-card${id === activeLobbyId ? " active" : ""}`;
      button.type = "button";
      button.dataset.pickbanAction = "select-lobby";
      button.dataset.lobbyId = String(id);
      button.innerHTML = `
        <span>Lobby ${id}</span>
        <strong>${escapeHtml(getPhaseText(lobby))}</strong>
        <small>${lobby.teams.left.players.length}/2 vs ${lobby.teams.right.players.length}/2 · Runde ${lobby.round}</small>
      `;
      lobbyList.append(button);
    }
  }

  function renderLobbyDetail() {
    const lobby = lobbies.get(activeLobbyId) || createDefaultLobby(activeLobbyId);
    const name = getActiveParticipantName();
    const myTeam = getPlayerTeam(lobby, name);
    detail.innerHTML = `
      <div class="pickban-detail-head">
        <div>
          <p class="pickban-kicker">Lobby ${lobby.id}</p>
          <h2>${escapeHtml(getPhaseText(lobby))}</h2>
        </div>
        <div class="pickban-round-pill">Runde ${lobby.round}</div>
      </div>
      <div class="pickban-match-board">
        ${renderTeam(lobby, "left", name, myTeam)}
        ${renderCenterStage(lobby, name, myTeam)}
        ${renderTeam(lobby, "right", name, myTeam)}
      </div>
      ${renderHistory(lobby)}
    `;
  }

  function renderTeam(lobby, team, name, myTeam) {
    const players = lobby.teams[team].players;
    const canJoin = lobby.phase === "waiting" && (!myTeam || myTeam === team) && players.length < 2;
    const isMine = myTeam === team;
    const readyClass = areTeamsFull(lobby) && players.every((player) => isPlayerReady(lobby, team, player)) ? " ready" : "";
    const activeClass = getActiveTeam(lobby) === team ? " active-turn" : "";
    return `
      <section class="pickban-team ${team}${readyClass}${activeClass}">
        <div class="pickban-team-head">
          <h3>${teamLabels[team]}</h3>
          <span>${activeClass ? "Dran" : teamSides[team]}</span>
        </div>
        <div class="pickban-player-list">
          ${[0, 1].map((index) => {
            const player = players[index] || "";
            const isReady = player && isPlayerReady(lobby, team, player);
            return renderPlayerCard(player, isReady);
          }).join("")}
        </div>
        <div class="pickban-team-actions">
          ${lobby.phase === "waiting" && !isMine ? `<button class="admin-secondary-button" type="button" data-pickban-action="join" data-team="${team}" ${canJoin ? "" : "disabled"}>Join</button>` : ""}
          ${lobby.phase === "waiting" && isMine ? `<button class="admin-secondary-button" type="button" data-pickban-action="leave">Verlassen</button>` : ""}
          ${lobby.phase === "waiting" && isMine ? `<button class="form-button" type="button" data-pickban-action="ready">${isPlayerReady(lobby, team, name) ? "Nicht bereit" : "Bereit"}</button>` : ""}
        </div>
      </section>
    `;
  }

  function renderPlayerCard(player, isReady) {
    const image = player ? getPlayerImage(player) : "";
    return `
      <article class="pickban-player-card${player ? "" : " empty"}${isReady ? " ready" : ""}">
        <div class="pickban-player-art">
          ${image ? `<img src="${escapeHtml(image)}" alt="" />` : `<span>${escapeHtml(player ? getPlayerInitials(player) : "?")}</span>`}
        </div>
        <div class="pickban-player-info">
          <strong>${player ? escapeHtml(player) : "Slot frei"}</strong>
          <small>${player ? (isReady ? "Ready" : "Wartet") : "Offen"}</small>
        </div>
      </article>
    `;
  }

  function renderCenterStage(lobby, name, myTeam) {
    return `
      <section class="pickban-center-stage" aria-label="Pick Ban Mitte">
        ${renderPhasePanel(lobby, name, myTeam)}
        ${lobby.phase === "game" ? "" : renderGameGrid(lobby, name, myTeam)}
      </section>
    `;
  }

  function renderPhasePanel(lobby, name, myTeam) {
    if (lobby.phase === "waiting") {
      return "";
    }

    if (lobby.phase === "ban") {
      const expected = getExpectedBanTeam(lobby);
      return `
        <section class="pickban-phase-panel">
          <strong>Ban Phase</strong>
          ${renderBanStrip(lobby)}
        </section>
      `;
    }

    if (lobby.phase === "pick") {
      return `
        <section class="pickban-phase-panel">
          <strong>Pick Phase</strong>
          ${renderBanStrip(lobby)}
        </section>
      `;
    }

    const currentGame = lobby.currentGame ? getGame(lobby, lobby.currentGame.id) : null;
    const canAdminTest = isPickBanAdmin() && hasTesterInLobby(lobby);
    return `
      <section class="pickban-phase-panel pickban-game-panel">
        <strong>Aktuelles Spiel</strong>
        <div class="pickban-current-game">
          ${currentGame ? renderGameVisual(currentGame, "pickban-current-image") : `<div class="pickban-placeholder">Kein Spiel</div>`}
        </div>
        <div class="pickban-result-actions">
          <button class="admin-secondary-button ${lobby.loserTeam === "left" ? "selected" : ""}" type="button" data-pickban-action="set-loser" data-team="left">Team 1 verloren</button>
          <button class="admin-secondary-button ${lobby.loserTeam === "right" ? "selected" : ""}" type="button" data-pickban-action="set-loser" data-team="right">Team 2 verloren</button>
          <button class="form-button" type="button" data-pickban-action="confirm-round" ${myTeam ? "" : "disabled"}>Nächste Runde bestätigen ${myTeam ? `(${teamLabels[myTeam]})` : ""}</button>
          <button class="admin-secondary-button" type="button" data-pickban-action="finish-lobby" ${myTeam ? "" : "disabled"}>Lobby fertig ${myTeam ? `(${teamLabels[myTeam]})` : ""}</button>
          ${canAdminTest ? `
            <button class="admin-secondary-button" type="button" data-pickban-action="admin-confirm-round" data-team="left" ${lobby.loserTeam && canAdminControlTeam(lobby, "left") ? "" : "disabled"}>Team 1 weiter</button>
            <button class="admin-secondary-button" type="button" data-pickban-action="admin-confirm-round" data-team="right" ${lobby.loserTeam && canAdminControlTeam(lobby, "right") ? "" : "disabled"}>Team 2 weiter</button>
            <button class="admin-secondary-button" type="button" data-pickban-action="admin-finish-lobby" data-team="left" ${canAdminControlTeam(lobby, "left") ? "" : "disabled"}>Team 1 fertig</button>
            <button class="admin-secondary-button" type="button" data-pickban-action="admin-finish-lobby" data-team="right" ${canAdminControlTeam(lobby, "right") ? "" : "disabled"}>Team 2 fertig</button>
          ` : ""}
        </div>
        <div class="pickban-confirm-row">
          <span>Nächste Runde: ${lobby.roundConfirm.left ? "Team 1 ✓" : "Team 1 offen"} · ${lobby.roundConfirm.right ? "Team 2 ✓" : "Team 2 offen"}</span>
          <span>Fertig: ${lobby.finishConfirm.left ? "Team 1 ✓" : "Team 1 offen"} · ${lobby.finishConfirm.right ? "Team 2 ✓" : "Team 2 offen"}</span>
        </div>
      </section>
    `;
  }

  function renderBanStrip(lobby) {
    if (!lobby.currentBans.length) return `<div class="pickban-ban-strip"><span>Noch keine Bans</span></div>`;
    return `
      <div class="pickban-ban-strip">
        ${lobby.currentBans.map((ban) => {
          const game = getGame(lobby, ban.gameId);
          return `<span>${teamLabels[ban.team]}: ${escapeHtml(game?.title || ban.gameId)}</span>`;
        }).join("")}
      </div>
    `;
  }

  function renderGameGrid(lobby, name, myTeam) {
    const expectedBanTeam = getExpectedBanTeam(lobby);
    const canBan = lobby.phase === "ban"
      && ((myTeam === expectedBanTeam && !hasUserBanned(lobby, name)) || canAdminBanForTeam(lobby, expectedBanTeam));
    const canPick = lobby.phase === "pick"
      && (myTeam === lobby.firstBanTeam || canAdminControlTeam(lobby, lobby.firstBanTeam));
    return `
      <section class="pickban-games" aria-label="Spiele">
        ${lobby.games.map((game) => {
          const locked = isGameLocked(lobby, game.id);
          const banned = isGameBanned(lobby, game.id);
          const picked = lobby.currentGame?.id === game.id;
          const selectable = (canBan || canPick) && !locked && !banned;
          const action = canBan ? "ban" : "pick";
          return `
            <button class="pickban-game-card${locked ? " locked" : ""}${banned ? " banned" : ""}${picked ? " picked" : ""}" type="button" data-pickban-action="${action}" data-game-id="${game.id}" aria-label="${escapeHtml(game.title)}" ${selectable ? "" : "disabled"}>
              ${renderGameVisual(game)}
            </button>
          `;
        }).join("")}
      </section>
    `;
  }

  function renderHistory(lobby) {
    const hasEmptySlots = lobby.phase === "waiting"
      && (lobby.teams.left.players.length < 2 || lobby.teams.right.players.length < 2);
    const hasTester = getAllPlayers(lobby).some(isTesterName);
    const adminControls = isPickBanAdmin()
      ? `
        <div class="pickban-admin-actions">
          <button class="admin-secondary-button" type="button" data-pickban-action="fill-testers" ${hasEmptySlots ? "" : "disabled"}>Tester auffüllen</button>
          <button class="admin-secondary-button" type="button" data-pickban-action="admin-ready-all" ${lobby.phase === "waiting" && areTeamsFull(lobby) ? "" : "disabled"}>Alle bereit</button>
          <button class="admin-secondary-button" type="button" data-pickban-action="remove-testers" ${hasTester && lobby.phase === "waiting" ? "" : "disabled"}>Tester entfernen</button>
          <button class="admin-remove-button" type="button" data-pickban-action="admin-reset">Admin Reset</button>
        </div>
      `
      : "";
    const picked = lobby.pickedGames.length
      ? lobby.pickedGames.map((entry) => `<span>R${entry.round}: ${escapeHtml(getGame(lobby, entry.gameId)?.title || entry.gameId)}</span>`).join("")
      : "<span>Noch keine gelockten Spiele</span>";
    return `
      <section class="pickban-history">
        <div>
          <strong>Locked Games</strong>
          <div class="pickban-history-list">${picked}</div>
        </div>
        ${adminControls}
      </section>
    `;
  }

  async function updateActiveLobby(mutator) {
    const name = await ensurePickBanParticipant();
    if (!name) return;
    const lobby = cloneLobby(lobbies.get(activeLobbyId) || createDefaultLobby(activeLobbyId));
    const result = mutator(lobby, name);
    if (result === false) return;
    await saveLobby(lobby);
  }

  function cleanupReady(lobby) {
    lobby.ready.left = lobby.ready.left.filter((name) => lobby.teams.left.players.some((player) => nameKey(player) === nameKey(name)));
    lobby.ready.right = lobby.ready.right.filter((name) => lobby.teams.right.players.some((player) => nameKey(player) === nameKey(name)));
  }

  function startBanPhase(lobby, firstTeam = "left") {
    lobby.phase = "ban";
    lobby.round = Math.max(1, Number(lobby.round || 1));
    lobby.firstBanTeam = firstTeam;
    lobby.turnTeam = firstTeam;
    lobby.currentBans = [];
    lobby.currentGame = null;
    lobby.loserTeam = "";
    lobby.roundConfirm = { left: false, right: false };
    lobby.finishConfirm = { left: false, right: false };
    pushLog(lobby, `Runde ${lobby.round}: ${teamLabels[firstTeam]} startet die Ban Phase.`);
  }

  function resetLobby(id) {
    return createDefaultLobby(id);
  }

  function applyGameBan(lobby, team, gameId, by) {
    if (lobby.phase !== "ban" || team !== getExpectedBanTeam(lobby)) return false;
    if (!gameId || isGameLocked(lobby, gameId) || isGameBanned(lobby, gameId) || hasUserBanned(lobby, by)) return false;

    lobby.currentBans.push({ gameId, team, by, round: lobby.round });
    pushLog(lobby, `${teamLabels[team]} bannt ${getGame(lobby, gameId)?.title || gameId}.`);
    const nextTeam = getExpectedBanTeam(lobby);
    if (!nextTeam) {
      lobby.phase = "pick";
      lobby.turnTeam = lobby.firstBanTeam;
      pushLog(lobby, `${teamLabels[lobby.firstBanTeam]} darf das Spiel wählen.`);
    } else {
      lobby.turnTeam = nextTeam;
    }
    return true;
  }

  function applyGamePick(lobby, team, gameId) {
    if (lobby.phase !== "pick" || team !== lobby.firstBanTeam) return false;
    if (!gameId || isGameLocked(lobby, gameId) || isGameBanned(lobby, gameId)) return false;

    const game = getGame(lobby, gameId);
    lobby.currentGame = { id: gameId, pickedBy: team, round: lobby.round };
    lobby.lockedGames = [...new Set([...lobby.lockedGames, gameId])];
    lobby.pickedGames.push({ gameId, pickedBy: team, round: lobby.round });
    lobby.phase = "game";
    lobby.turnTeam = "";
    lobby.roundConfirm = { left: false, right: false };
    lobby.finishConfirm = { left: false, right: false };
    pushLog(lobby, `${teamLabels[team]} pickt ${game?.title || gameId}.`);
    return true;
  }

  function applyLoser(lobby, team) {
    if (lobby.phase !== "game" || !["left", "right"].includes(team)) return false;

    lobby.loserTeam = team;
    lobby.roundConfirm = { left: false, right: false };
    pushLog(lobby, `${teamLabels[team]} wurde als Verlierer markiert.`);
    return true;
  }

  function applyRoundConfirm(lobby, team) {
    if (lobby.phase !== "game" || !["left", "right"].includes(team) || !lobby.loserTeam) return false;

    lobby.roundConfirm[team] = true;
    lobby.finishConfirm[team] = false;
    pushLog(lobby, `${teamLabels[team]} bestätigt die nächste Runde.`);
    if (lobby.roundConfirm.left && lobby.roundConfirm.right) {
      lobby.round += 1;
      startBanPhase(lobby, lobby.loserTeam);
    }
    return true;
  }

  function applyFinishConfirm(lobby, team) {
    if (lobby.phase !== "game" || !["left", "right"].includes(team)) return false;

    lobby.finishConfirm[team] = true;
    lobby.roundConfirm[team] = false;
    pushLog(lobby, `${teamLabels[team]} ist fertig.`);
    if (lobby.finishConfirm.left && lobby.finishConfirm.right) {
      const id = lobby.id;
      Object.assign(lobby, resetLobby(id));
    }
    return true;
  }

  async function handleAction(action, button) {
    if (action === "select-lobby") {
      setActiveLobby(button.dataset.lobbyId);
      return;
    }

    if (action === "admin-reset") {
      if (!isPickBanAdmin()) return;
      const lobby = resetLobby(activeLobbyId);
      await saveLobby(lobby);
      return;
    }

    if (["fill-testers", "remove-testers", "admin-ready-all"].includes(action)) {
      if (!isPickBanAdmin()) return;
      const lobby = cloneLobby(lobbies.get(activeLobbyId) || createDefaultLobby(activeLobbyId));
      let changed = false;

      if (action === "fill-testers") changed = fillEmptyTesterSlots(lobby);
      if (action === "remove-testers") changed = removeTesterSlots(lobby);
      if (action === "admin-ready-all") changed = markAllPlayersReady(lobby);

      if (changed) await saveLobby(lobby);
      return;
    }

    if (["ban", "pick", "set-loser", "admin-confirm-round", "admin-finish-lobby"].includes(action) && isPickBanAdmin()) {
      const lobby = cloneLobby(lobbies.get(activeLobbyId) || createDefaultLobby(activeLobbyId));
      let changed = false;

      if (action === "ban") {
        const team = getExpectedBanTeam(lobby);
        const actor = getAdminTesterBanName(lobby, team);
        changed = Boolean(actor) && applyGameBan(lobby, team, button.dataset.gameId, actor);
      }

      if (action === "pick") {
        changed = canAdminControlTeam(lobby, lobby.firstBanTeam)
          && applyGamePick(lobby, lobby.firstBanTeam, button.dataset.gameId);
      }

      if (action === "set-loser") {
        changed = hasTesterInLobby(lobby) && applyLoser(lobby, button.dataset.team);
      }

      if (action === "admin-confirm-round") {
        changed = canAdminControlTeam(lobby, button.dataset.team) && applyRoundConfirm(lobby, button.dataset.team);
      }

      if (action === "admin-finish-lobby") {
        changed = canAdminControlTeam(lobby, button.dataset.team) && applyFinishConfirm(lobby, button.dataset.team);
      }

      if (changed) {
        await saveLobby(lobby);
        return;
      }
    }

    await updateActiveLobby((lobby, name) => {
      const myTeam = getPlayerTeam(lobby, name);

      if (action === "join") {
        const team = button.dataset.team;
        if (!["left", "right"].includes(team) || lobby.phase !== "waiting") return false;
        if (lobby.teams[team].players.length >= 2 && myTeam !== team) return false;
        ["left", "right"].forEach((side) => {
          lobby.teams[side].players = lobby.teams[side].players.filter((player) => nameKey(player) !== nameKey(name));
        });
        lobby.teams[team].players.push(name);
        cleanupReady(lobby);
        pushLog(lobby, `${name} ist ${teamLabels[team]} beigetreten.`);
        return true;
      }

      if (action === "leave") {
        if (!myTeam || lobby.phase !== "waiting") return false;
        lobby.teams[myTeam].players = lobby.teams[myTeam].players.filter((player) => nameKey(player) !== nameKey(name));
        cleanupReady(lobby);
        pushLog(lobby, `${name} hat die Lobby verlassen.`);
        return true;
      }

      if (action === "ready") {
        if (!myTeam || lobby.phase !== "waiting") return false;
        if (isPlayerReady(lobby, myTeam, name)) {
          lobby.ready[myTeam] = lobby.ready[myTeam].filter((readyName) => nameKey(readyName) !== nameKey(name));
          pushLog(lobby, `${name} ist nicht mehr bereit.`);
        } else {
          lobby.ready[myTeam].push(name);
          pushLog(lobby, `${name} ist bereit.`);
        }
        if (areAllReady(lobby)) startBanPhase(lobby, "left");
        return true;
      }

      if (action === "ban") {
        const expectedTeam = getExpectedBanTeam(lobby);
        const gameId = button.dataset.gameId;
        if (myTeam !== expectedTeam) return false;
        return applyGameBan(lobby, myTeam, gameId, name);
      }

      if (action === "pick") {
        const gameId = button.dataset.gameId;
        return applyGamePick(lobby, myTeam, gameId);
      }

      if (action === "set-loser") {
        if (!myTeam) return false;
        const loser = button.dataset.team;
        return applyLoser(lobby, loser);
      }

      if (action === "confirm-round") {
        if (!myTeam) return false;
        return applyRoundConfirm(lobby, myTeam);
      }

      if (action === "finish-lobby") {
        if (!myTeam) return false;
        return applyFinishConfirm(lobby, myTeam);
      }

      return false;
    });
  }

  lobbyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pickban-action]");
    if (!button) return;
    handleAction(button.dataset.pickbanAction, button);
  });

  detail.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pickban-action]");
    if (!button || button.disabled) return;
    handleAction(button.dataset.pickbanAction, button);
  });

  globalThis.addEventListener("hashchange", () => {
    activeLobbyId = getLobbyIdFromHash();
    render();
  });

  document.addEventListener("admin-state-change", render);

  seedLocalLobbies();
  render();
  loadPlayerImages();
  fetchLobbies();
  setupRealtime();
})();
