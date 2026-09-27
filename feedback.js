(function () {
  const settingsKey = "adminFeedbackSettings";
  const form = document.querySelector("#feedback-form");
  const availability = document.querySelector("#feedback-availability");
  const submitStatus = document.querySelector("#feedback-submit-status");
  const admin = document.querySelector("#feedback-admin");
  const settingsForm = document.querySelector("#feedback-settings-form");
  const enabledInput = document.querySelector("#feedback-enabled");
  const saveButton = document.querySelector("#feedback-settings-save");
  const settingsStatus = document.querySelector("#feedback-settings-status");
  const list = document.querySelector("#feedback-list");
  const listStatus = document.querySelector("#feedback-list-status");
  const moreButton = document.querySelector("#feedback-more");
  const refreshButton = document.querySelector("#feedback-refresh");
  let enabled = false;
  let settingsReady = false;
  let refreshVersion = 0;
  let listVersion = 0;
  let offset = 0;
  let sending = false;
  const pageSize = 50;

  function renderNavigation() {
    document.querySelectorAll(".main-nav").forEach((nav) => {
      let link = nav.querySelector('[data-feedback-nav]');
      if (!enabled && !isAdminLoggedIn()) {
        link?.remove();
        return;
      }
      if (!link) {
        link = document.createElement("a");
        link.href = "feedback.html";
        link.textContent = "Feedback";
        link.dataset.feedbackNav = "";
        nav.insertBefore(link, nav.querySelector('a[href="hall-of-fame.html"]'));
      }
      link.classList.toggle("active", Boolean(form));
      if (form) link.setAttribute("aria-current", "page");
    });
  }

  function clearPrivateFeedback() {
    listVersion += 1;
    offset = 0;
    list?.replaceChildren();
    if (listStatus) listStatus.textContent = "";
    if (moreButton) moreButton.hidden = true;
    if (admin) admin.hidden = true;
  }

  async function loadFeedback(append = false) {
    if (!list || !isAdminLoggedIn()) return;
    const version = ++listVersion;
    if (!append) {
      offset = 0;
      list.replaceChildren();
    }
    moreButton.hidden = true;
    refreshButton.disabled = true;
    listStatus.textContent = "Feedbacks werden geladen …";
    const rows = await supabaseFetch(`feedback_entries?select=id,participant_name,message,created_at&order=created_at.desc,id.desc&limit=${pageSize}&offset=${offset}`);
    // Discard responses arriving after logout or a newer request.
    if (version !== listVersion || !isAdminLoggedIn()) return;
    refreshButton.disabled = false;
    if (!Array.isArray(rows)) {
      listStatus.textContent = "Feedbacks konnten nicht geladen werden. Bitte Admin-Login und Datenbank-Einrichtung prüfen.";
      moreButton.hidden = !append;
      return;
    }
    rows.forEach((row) => {
      const entry = document.createElement("article");
      entry.className = "feedback-entry";
      const heading = document.createElement("h3");
      heading.textContent = row.participant_name || "Ohne Namen";
      const time = document.createElement("time");
      time.dateTime = row.created_at;
      time.textContent = new Date(row.created_at).toLocaleString("de-DE");
      const message = document.createElement("p");
      message.textContent = row.message;
      entry.append(heading, time, message);
      list.append(entry);
    });
    offset += rows.length;
    listStatus.textContent = offset ? `${offset} Feedbacks geladen.` : "Noch kein Feedback eingegangen.";
    moreButton.hidden = rows.length < pageSize;
  }

  async function refreshFeedback() {
    const version = ++refreshVersion;
    if (!isAdminLoggedIn()) clearPrivateFeedback();
    renderNavigation();
    const rows = await supabaseFetch(`site_content?key=eq.${settingsKey}&select=value`);
    if (version !== refreshVersion) return;
    const settings = Array.isArray(rows) ? rows[0]?.value : null;
    settingsReady = typeof settings?.enabled === "boolean";
    enabled = settingsReady && settings.enabled;
    renderNavigation();
    if (!form) return;
    form.hidden = !enabled;
    availability.textContent = !settingsReady
      ? "Feedback ist momentan nicht verfügbar. Bitte versuche es später erneut."
      : enabled ? "Deine Meinung zählt." : "Feedback ist aktuell nicht freigeschaltet.";
    admin.hidden = !isAdminLoggedIn();
    if (!isAdminLoggedIn()) return;
    enabledInput.checked = enabled;
    enabledInput.disabled = !settingsReady;
    saveButton.disabled = !settingsReady;
    if (!settingsReady) {
      settingsStatus.textContent = "Freigabe konnte nicht geladen werden. Bitte Verbindung prüfen und einmalig supabase-feedback.sql im Supabase SQL Editor ausführen.";
    }
    await loadFeedback();
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    const message = form.elements.message.value.trim();
    const participantName = form.elements.participant_name.value.trim();
    if (!enabled || !message || message.length > 5000 || participantName.length > 100) {
      submitStatus.textContent = !enabled ? "Feedback ist aktuell nicht freigeschaltet." : "Bitte gib ein Feedback mit maximal 5000 Zeichen ein (Name: maximal 100 Zeichen).";
      return;
    }
    sending = true;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    submitStatus.textContent = "Feedback wird gesendet …";
    const result = await supabaseFetch("feedback_entries", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ participant_name: participantName, message }),
    });
    sending = false;
    button.disabled = false;
    if (result === null) {
      submitStatus.textContent = "Senden fehlgeschlagen. Prüfe deine Verbindung; möglicherweise wurde Feedback inzwischen ausgeschaltet. Dein Text bleibt erhalten.";
      await refreshFeedback();
      return;
    }
    if (form.elements.message.value.trim() === message) form.elements.message.value = "";
    submitStatus.textContent = "Danke! Dein Feedback wurde gesendet. Du kannst direkt ein weiteres einsenden.";
    form.elements.message.focus();
    if (isAdminLoggedIn()) await loadFeedback();
  });

  settingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdminLoggedIn() || !settingsReady || saveButton.disabled) return;
    const nextEnabled = enabledInput.checked;
    saveButton.disabled = true;
    enabledInput.disabled = true;
    settingsStatus.textContent = "Freigabe wird gespeichert …";
    const result = await saveRemoteSiteContent(settingsKey, { enabled: nextEnabled });
    if (!isAdminLoggedIn()) return;
    saveButton.disabled = false;
    enabledInput.disabled = false;
    if (result === null) {
      settingsStatus.textContent = "Freigabe konnte nicht gespeichert werden. Bitte Verbindung und Admin-Login prüfen.";
      return;
    }
    settingsStatus.textContent = nextEnabled ? "Feedback ist freigeschaltet." : "Feedback ist ausgeschaltet.";
    await refreshFeedback();
  });

  refreshButton?.addEventListener("click", () => loadFeedback());
  moreButton?.addEventListener("click", () => loadFeedback(true));
  document.addEventListener("admin-state-change", () => {
    clearPrivateFeedback();
    void refreshFeedback();
  });
  globalThis.addEventListener("pageshow", (event) => {
    if (event.persisted) void refreshFeedback();
  });
  globalThis.addEventListener("focus", () => { void refreshFeedback(); });
  void ensureAdminSession().then(() => refreshFeedback());
})();
