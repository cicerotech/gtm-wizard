var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b ||= {})
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => EudiaCalendarPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var LOG_PREFIX = "[Eudia Calendar]";
function log(message, ...args) {
  console.log(`${LOG_PREFIX} ${message}`, ...args);
}
function logError(message, error) {
  console.error(`${LOG_PREFIX} ERROR: ${message}`, error || "");
}
function logWarn(message) {
  console.warn(`${LOG_PREFIX} WARN: ${message}`);
}
var DEFAULT_SETTINGS = {
  userEmail: "",
  serverUrl: "https://gtm-wizard.onrender.com",
  refreshMinutes: 5,
  accountsFolder: "Accounts"
};
var VIEW_TYPE = "eudia-calendar-standalone";
var EudiaCalendarView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.refreshTimer = null;
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Calendar";
  }
  getIcon() {
    return "calendar";
  }
  onOpen() {
    return __async(this, null, function* () {
      yield this.render();
      const intervalMs = (this.plugin.settings.refreshMinutes || 5) * 60 * 1e3;
      this.refreshTimer = window.setInterval(() => this.render(), intervalMs);
    });
  }
  onClose() {
    return __async(this, null, function* () {
      if (this.refreshTimer) {
        window.clearInterval(this.refreshTimer);
      }
    });
  }
  render() {
    return __async(this, null, function* () {
      const container = this.containerEl.children[1];
      container.empty();
      container.addClass("eudia-cal-container");
      const header = container.createDiv({ cls: "eudia-cal-header" });
      header.createEl("h4", { text: "Upcoming Meetings" });
      const refreshBtn = header.createEl("button", { cls: "eudia-cal-refresh", text: "\u21BB" });
      refreshBtn.title = "Refresh";
      refreshBtn.onclick = () => this.render();
      if (!this.plugin.settings.userEmail) {
        this.renderEmailSetup(container);
        return;
      }
      const loadingEl = container.createDiv({ cls: "eudia-cal-loading", text: "Loading..." });
      try {
        const data = yield this.fetchMeetings();
        loadingEl.remove();
        if (!data.success) {
          this.renderError(container, data.error || "Failed to load calendar");
          return;
        }
        if (data.totalMeetings === 0) {
          container.createDiv({ cls: "eudia-cal-empty", text: "No upcoming meetings this week" });
          return;
        }
        const days = Object.keys(data.byDay).sort();
        for (const day of days) {
          const meetings = data.byDay[day];
          if (!meetings || meetings.length === 0)
            continue;
          const daySection = container.createDiv({ cls: "eudia-cal-day" });
          daySection.createEl("div", { cls: "eudia-cal-day-header", text: this.formatDayName(day) });
          for (const meeting of meetings) {
            const meetingEl = daySection.createDiv({
              cls: `eudia-cal-meeting ${meeting.isCustomerMeeting ? "customer" : ""}`
            });
            meetingEl.createEl("div", { cls: "eudia-cal-time", text: this.formatTime(meeting.start) });
            const details = meetingEl.createDiv({ cls: "eudia-cal-details" });
            details.createEl("div", { cls: "eudia-cal-subject", text: meeting.subject });
            if (meeting.accountName) {
              details.createEl("div", { cls: "eudia-cal-account", text: meeting.accountName });
            }
            if (meeting.attendees && meeting.attendees.length > 0) {
              const attendeesRow = details.createDiv({ cls: "eudia-cal-attendee-chips" });
              const displayLimit = 3;
              for (let i = 0; i < Math.min(meeting.attendees.length, displayLimit); i++) {
                const attendee = meeting.attendees[i];
                const name = attendee.name || attendee.email.split("@")[0];
                const initials = name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
                const chip = attendeesRow.createEl("span", {
                  cls: "eudia-cal-chip",
                  text: initials
                });
                chip.title = `${name} (${attendee.email})`;
              }
              if (meeting.attendees.length > displayLimit) {
                attendeesRow.createEl("span", {
                  cls: "eudia-cal-chip more",
                  text: `+${meeting.attendees.length - displayLimit}`
                });
              }
              const countLabel = `${meeting.attendees.length} external`;
              attendeesRow.createEl("span", { cls: "eudia-cal-attendee-count", text: countLabel });
            }
            meetingEl.title = "Click to create note";
            meetingEl.onclick = () => this.createNoteForMeeting(meeting);
          }
        }
      } catch (error) {
        loadingEl.remove();
        this.renderError(container, error.message || "Connection failed");
      }
    });
  }
  fetchMeetings() {
    return __async(this, null, function* () {
      const { serverUrl, userEmail } = this.plugin.settings;
      log(`Fetching meetings for ${userEmail} from ${serverUrl}`);
      try {
        try {
          const healthCheck = yield (0, import_obsidian.requestUrl)({
            url: `${serverUrl}/api/health`,
            method: "GET",
            throw: false
          });
          if (healthCheck.status !== 200) {
            logWarn("Server health check failed");
          }
        } catch (healthError) {
          logWarn("Server may be starting up...");
        }
        const response = yield (0, import_obsidian.requestUrl)({
          url: `${serverUrl}/api/calendar/${encodeURIComponent(userEmail)}/week`,
          method: "GET",
          headers: { "Accept": "application/json" },
          throw: false
        });
        log(`Calendar API response status: ${response.status}`);
        if (response.status === 403) {
          return {
            success: false,
            totalMeetings: 0,
            byDay: {},
            error: "Email not authorized. Please use your @eudia.com email address."
          };
        }
        if (response.status !== 200) {
          return {
            success: false,
            totalMeetings: 0,
            byDay: {},
            error: `Server returned ${response.status}. Please try again.`
          };
        }
        const data = response.json;
        log(`Received ${data.totalMeetings || 0} meetings`);
        return data;
      } catch (error) {
        logError("Failed to fetch meetings:", error);
        return {
          success: false,
          totalMeetings: 0,
          byDay: {},
          error: error.message || "Network error. Check your connection."
        };
      }
    });
  }
  renderEmailSetup(container) {
    const setup = container.createDiv({ cls: "eudia-cal-setup" });
    setup.createEl("h4", { text: "Connect Your Calendar" });
    setup.createEl("p", { text: "Enter your work email to see your meetings:" });
    const form = setup.createDiv({ cls: "eudia-cal-form" });
    const input = form.createEl("input", {
      type: "email",
      placeholder: "you@company.com"
    });
    input.addClass("eudia-cal-input");
    const btn = form.createEl("button", { text: "Connect", cls: "eudia-cal-btn" });
    btn.onclick = () => __async(this, null, function* () {
      const email = input.value.trim();
      if (!email || !email.includes("@")) {
        new import_obsidian.Notice("Please enter a valid email");
        return;
      }
      btn.textContent = "Connecting...";
      btn.setAttribute("disabled", "true");
      try {
        const testUrl = `${this.plugin.settings.serverUrl}/api/calendar/${email}/week`;
        const response = yield (0, import_obsidian.requestUrl)({ url: testUrl, method: "GET" });
        if (response.json.success !== false) {
          this.plugin.settings.userEmail = email;
          yield this.plugin.saveSettings();
          new import_obsidian.Notice("\u2713 Calendar connected!");
          yield this.render();
        } else {
          new import_obsidian.Notice("Could not connect. Check your email.");
          btn.textContent = "Connect";
          btn.removeAttribute("disabled");
        }
      } catch (e) {
        new import_obsidian.Notice("Connection failed. Try again.");
        btn.textContent = "Connect";
        btn.removeAttribute("disabled");
      }
    });
  }
  renderError(container, message) {
    const errorEl = container.createDiv({ cls: "eudia-cal-error" });
    errorEl.createEl("p", { text: `Error: ${message}` });
    const retryBtn = errorEl.createEl("button", { text: "Retry", cls: "eudia-cal-btn" });
    retryBtn.onclick = () => this.render();
  }
  /**
   * Extract company name from attendee email domains
   * Higher confidence than subject parsing since emails are definitive
   * Returns the company name derived from the domain (e.g., uber.com -> Uber)
   */
  extractAccountFromAttendees(attendees) {
    if (!attendees || attendees.length === 0)
      return null;
    const commonProviders = [
      "gmail.com",
      "outlook.com",
      "hotmail.com",
      "yahoo.com",
      "icloud.com",
      "live.com",
      "msn.com",
      "aol.com",
      "protonmail.com"
    ];
    const externalDomains = [];
    for (const attendee of attendees) {
      if (!attendee.email)
        continue;
      const email = attendee.email.toLowerCase();
      const domainMatch = email.match(/@([a-z0-9.-]+)/);
      if (domainMatch) {
        const domain2 = domainMatch[1];
        if (!domain2.includes("eudia.com") && !commonProviders.includes(domain2)) {
          externalDomains.push(domain2);
        }
      }
    }
    if (externalDomains.length === 0)
      return null;
    const domain = externalDomains[0];
    const companyPart = domain.split(".")[0];
    const companyName = companyPart.charAt(0).toUpperCase() + companyPart.slice(1);
    log(`Extracted company "${companyName}" from attendee domain ${domain}`);
    return companyName;
  }
  /**
   * Extract account name from meeting subject using common patterns
   * Examples:
   *   "Eudia - HATCo Connect | Intros" -> "HATCo"
   *   "Graybar/Eudia Weekly Check in" -> "Graybar"
   *   "CHS/Eudia - M&A Intro & Demo" -> "CHS"
   *   "Acme Corp - Discovery Call" -> "Acme Corp"
   */
  extractAccountFromSubject(subject) {
    if (!subject)
      return null;
    const slashPattern = subject.match(/^([^\/]+)\s*\/\s*Eudia|Eudia\s*\/\s*([^\/\-|]+)/i);
    if (slashPattern) {
      const match = (slashPattern[1] || slashPattern[2] || "").trim();
      if (match.toLowerCase() !== "eudia")
        return match;
    }
    const dashPattern = subject.match(/^Eudia\s*[-–]\s*([^|]+)|^([^-–]+)\s*[-–]\s*Eudia/i);
    if (dashPattern) {
      const match = (dashPattern[1] || dashPattern[2] || "").trim();
      const cleaned = match.replace(/\s+(Connect|Weekly|Call|Meeting|Intro|Demo|Check\s*in|Sync).*$/i, "").trim();
      if (cleaned.toLowerCase() !== "eudia" && cleaned.length > 0)
        return cleaned;
    }
    if (!subject.toLowerCase().includes("eudia")) {
      const simplePattern = subject.match(/^([^-–|]+)/);
      if (simplePattern) {
        const match = simplePattern[1].trim();
        if (match.length > 2 && match.length < 50)
          return match;
      }
    }
    return null;
  }
  /**
   * Find matching account folder in the vault
   * Returns the full path if found, null otherwise
   */
  findAccountFolder(accountName) {
    if (!accountName)
      return null;
    const accountsFolder = this.plugin.settings.accountsFolder || "Accounts";
    const folder = this.app.vault.getAbstractFileByPath(accountsFolder);
    if (!(folder instanceof import_obsidian.TFolder)) {
      log(`Accounts folder "${accountsFolder}" not found`);
      return null;
    }
    const normalizedSearch = accountName.toLowerCase().trim();
    const subfolders = [];
    for (const child of folder.children) {
      if (child instanceof import_obsidian.TFolder) {
        subfolders.push(child.name);
      }
    }
    const exactMatch = subfolders.find((f) => f.toLowerCase() === normalizedSearch);
    if (exactMatch) {
      return `${accountsFolder}/${exactMatch}`;
    }
    const startsWithMatch = subfolders.find(
      (f) => f.toLowerCase().startsWith(normalizedSearch) || normalizedSearch.startsWith(f.toLowerCase())
    );
    if (startsWithMatch) {
      return `${accountsFolder}/${startsWithMatch}`;
    }
    const containsMatch = subfolders.find(
      (f) => f.toLowerCase().includes(normalizedSearch) || normalizedSearch.includes(f.toLowerCase())
    );
    if (containsMatch) {
      return `${accountsFolder}/${containsMatch}`;
    }
    return null;
  }
  createNoteForMeeting(meeting) {
    return __async(this, null, function* () {
      const dateStr = meeting.start.split("T")[0];
      const safeName = meeting.subject.replace(/[<>:"/\\|?*]/g, "_").substring(0, 50);
      const fileName = `${dateStr} - ${safeName}.md`;
      let targetFolder = null;
      let accountName = meeting.accountName;
      if (!targetFolder && meeting.attendees && meeting.attendees.length > 0) {
        const domainName = this.extractAccountFromAttendees(meeting.attendees);
        if (domainName) {
          targetFolder = this.findAccountFolder(domainName);
          log(`Domain-based "${domainName}" -> folder: ${targetFolder || "not found"}`);
          if (targetFolder && !accountName) {
            accountName = domainName;
          }
        }
      }
      if (!targetFolder && accountName) {
        targetFolder = this.findAccountFolder(accountName);
        log(`Server accountName "${accountName}" -> folder: ${targetFolder || "not found"}`);
      }
      if (!targetFolder) {
        const extractedName = this.extractAccountFromSubject(meeting.subject);
        if (extractedName) {
          targetFolder = this.findAccountFolder(extractedName);
          log(`Subject-based "${extractedName}" -> folder: ${targetFolder || "not found"}`);
          if (targetFolder && !accountName) {
            accountName = extractedName;
          }
        }
      }
      if (!targetFolder) {
        const accountsFolder = this.plugin.settings.accountsFolder || "Accounts";
        const folder = this.app.vault.getAbstractFileByPath(accountsFolder);
        if (folder instanceof import_obsidian.TFolder) {
          targetFolder = accountsFolder;
          log(`No match found, using Accounts root: ${targetFolder}`);
        }
      }
      const filePath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
      const existing = this.app.vault.getAbstractFileByPath(filePath);
      if (existing instanceof import_obsidian.TFile) {
        yield this.app.workspace.getLeaf().openFile(existing);
        new import_obsidian.Notice(`Opened existing note: ${fileName}`);
        return;
      }
      const attendeeList = meeting.attendees.map((a) => `- ${a.name || a.email}`).join("\n");
      const content = `---
title: "${meeting.subject}"
date: ${dateStr}
meeting_time: ${this.formatTime(meeting.start)}
attendees: ${meeting.attendees.map((a) => a.name || a.email).join(", ")}
account: "${accountName || "TBD"}"
clo_meeting: false
source: ""
sync_to_salesforce: false
---

# ${meeting.subject}

## Attendees
${attendeeList}

## Notes


## Next Steps
- [ ] 

`;
      try {
        if (targetFolder) {
          const folderExists = this.app.vault.getAbstractFileByPath(targetFolder);
          if (!folderExists) {
            yield this.app.vault.createFolder(targetFolder);
          }
        }
        const file = yield this.app.vault.create(filePath, content);
        yield this.app.workspace.getLeaf().openFile(file);
        new import_obsidian.Notice(`Created: ${filePath}`);
      } catch (e) {
        logError("Failed to create note:", e);
        new import_obsidian.Notice(`Could not create note: ${e.message || "Unknown error"}`);
      }
    });
  }
  formatDayName(dateStr) {
    const date = new Date(dateStr);
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const dayDate = new Date(date);
    dayDate.setHours(0, 0, 0, 0);
    const diff = (dayDate.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24);
    if (diff === 0)
      return "Today";
    if (diff === 1)
      return "Tomorrow";
    return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }
  formatTime(isoString) {
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  }
};
var CalendarSettingsTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Eudia Calendar" });
    new import_obsidian.Setting(containerEl).setName("Your Email").setDesc("Your work email (e.g., keigan@eudia.com)").addText((text) => text.setPlaceholder("you@company.com").setValue(this.plugin.settings.userEmail).onChange((value) => __async(this, null, function* () {
      this.plugin.settings.userEmail = value;
      yield this.plugin.saveSettings();
    })));
    new import_obsidian.Setting(containerEl).setName("Refresh Interval").setDesc("How often to refresh (minutes)").addSlider((slider) => slider.setLimits(1, 30, 1).setValue(this.plugin.settings.refreshMinutes).setDynamicTooltip().onChange((value) => __async(this, null, function* () {
      this.plugin.settings.refreshMinutes = value;
      yield this.plugin.saveSettings();
    })));
    new import_obsidian.Setting(containerEl).setName("Accounts Folder").setDesc("Folder containing account subfolders (default: Accounts)").addText((text) => text.setPlaceholder("Accounts").setValue(this.plugin.settings.accountsFolder).onChange((value) => __async(this, null, function* () {
      this.plugin.settings.accountsFolder = value || "Accounts";
      yield this.plugin.saveSettings();
    })));
    new import_obsidian.Setting(containerEl).setName("Test Connection").setDesc("Verify calendar is working").addButton((btn) => btn.setButtonText("Test").setCta().onClick(() => __async(this, null, function* () {
      if (!this.plugin.settings.userEmail) {
        new import_obsidian.Notice("Enter your email first");
        return;
      }
      btn.setButtonText("Testing...");
      try {
        const url = `${this.plugin.settings.serverUrl}/api/calendar/${this.plugin.settings.userEmail}/week`;
        const resp = yield (0, import_obsidian.requestUrl)({ url, method: "GET" });
        if (resp.json.success) {
          new import_obsidian.Notice(`Connected! ${resp.json.totalMeetings} meetings this week`);
          btn.setButtonText("Success");
        } else {
          new import_obsidian.Notice(`Error: ${resp.json.error}`);
          btn.setButtonText("Failed");
        }
      } catch (e) {
        new import_obsidian.Notice("Connection failed");
        btn.setButtonText("Failed");
      }
      setTimeout(() => btn.setButtonText("Test"), 2e3);
    })));
    new import_obsidian.Setting(containerEl).setName("Sync Calendar").setDesc("Refresh calendar data from Microsoft 365").addButton((btn) => btn.setButtonText("Sync Now").onClick(() => __async(this, null, function* () {
      btn.setButtonText("Syncing...");
      try {
        const url = `${this.plugin.settings.serverUrl}/api/calendar/sync/trigger`;
        const resp = yield (0, import_obsidian.requestUrl)({ url, method: "POST" });
        if (resp.json.success) {
          new import_obsidian.Notice("Calendar sync started. Data will refresh in a few moments.");
          btn.setButtonText("Started");
        } else {
          new import_obsidian.Notice(`Sync failed: ${resp.json.error}`);
          btn.setButtonText("Failed");
        }
      } catch (e) {
        new import_obsidian.Notice("Failed to start sync");
        btn.setButtonText("Failed");
      }
      setTimeout(() => btn.setButtonText("Sync Now"), 2e3);
    })));
  }
};
var EudiaCalendarPlugin = class extends import_obsidian.Plugin {
  onload() {
    return __async(this, null, function* () {
      log("Plugin loading...");
      fetch("http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "eudia-calendar/main.ts:onload", message: "Plugin onload START", data: { timestamp: (/* @__PURE__ */ new Date()).toISOString() }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H2" }) }).catch(() => {
      });
      try {
        yield this.loadSettings();
        log("Settings loaded:", {
          hasEmail: !!this.settings.userEmail,
          serverUrl: this.settings.serverUrl
        });
        fetch("http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "eudia-calendar/main.ts:afterSettings", message: "Settings loaded successfully", data: { settings: this.settings }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H4" }) }).catch(() => {
        });
        fetch("http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "eudia-calendar/main.ts:beforeRegisterView", message: "About to register view", data: { viewType: VIEW_TYPE }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H5" }) }).catch(() => {
        });
        this.registerView(VIEW_TYPE, (leaf) => {
          log("Creating EudiaCalendarView");
          return new EudiaCalendarView(leaf, this);
        });
        log("View registered with type:", VIEW_TYPE);
        fetch("http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "eudia-calendar/main.ts:afterRegisterView", message: "View registered successfully", data: { viewType: VIEW_TYPE }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H5" }) }).catch(() => {
        });
        this.addRibbonIcon("calendar", "Eudia Calendar", () => {
          log("Ribbon icon clicked");
          this.openCalendar();
        });
        log("Ribbon icon added");
        this.addCommand({
          id: "open-calendar",
          name: "Open Calendar",
          callback: () => this.openCalendar()
        });
        log("Command registered");
        this.addSettingTab(new CalendarSettingsTab(this.app, this));
        log("Settings tab added");
        if (this.settings.userEmail) {
          this.app.workspace.onLayoutReady(() => {
            log("Workspace ready, auto-opening calendar");
            this.openCalendar();
          });
        }
        log("Plugin loaded successfully!");
        fetch("http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "eudia-calendar/main.ts:loadComplete", message: "Plugin loaded SUCCESSFULLY", data: { success: true }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H2" }) }).catch(() => {
        });
      } catch (error) {
        logError("Failed to load plugin:", error);
        fetch("http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "eudia-calendar/main.ts:loadFailed", message: "Plugin load FAILED", data: { error: String(error), stack: error == null ? void 0 : error.stack }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H2" }) }).catch(() => {
        });
        new import_obsidian.Notice("Eudia Calendar: Failed to load. Check console for details.");
      }
    });
  }
  loadSettings() {
    return __async(this, null, function* () {
      fetch("http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "eudia-calendar/main.ts:loadSettingsStart", message: "loadSettings called", data: {}, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H4" }) }).catch(() => {
      });
      try {
        const data = yield this.loadData();
        fetch("http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "eudia-calendar/main.ts:loadDataResult", message: "loadData returned", data: { rawData: data, type: typeof data }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H4" }) }).catch(() => {
        });
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
        log("Settings merged:", Object.keys(this.settings));
      } catch (error) {
        logError("Failed to load settings, using defaults:", error);
        fetch("http://127.0.0.1:7242/ingest/6cbaf1f9-0647-49b0-8811-5ad970525e48", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "eudia-calendar/main.ts:loadSettingsError", message: "loadSettings FAILED", data: { error: String(error) }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H4" }) }).catch(() => {
        });
        this.settings = __spreadValues({}, DEFAULT_SETTINGS);
      }
    });
  }
  saveSettings() {
    return __async(this, null, function* () {
      try {
        yield this.saveData(this.settings);
        log("Settings saved");
      } catch (error) {
        logError("Failed to save settings:", error);
        new import_obsidian.Notice("Failed to save calendar settings");
      }
    });
  }
  openCalendar() {
    return __async(this, null, function* () {
      log("Opening calendar view...");
      try {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
        log("Existing leaf found:", !!leaf);
        if (!leaf) {
          const rightLeaf = workspace.getRightLeaf(false);
          if (rightLeaf) {
            log("Creating new view in right leaf");
            yield rightLeaf.setViewState({ type: VIEW_TYPE, active: true });
            leaf = rightLeaf;
          } else {
            logWarn("Could not get right leaf");
          }
        }
        if (leaf) {
          workspace.revealLeaf(leaf);
          log("Calendar view revealed");
        } else {
          logError("No leaf available for calendar view");
        }
      } catch (error) {
        logError("Failed to open calendar:", error);
        new import_obsidian.Notice("Could not open calendar view");
      }
    });
  }
  onunload() {
    log("Plugin unloading...");
  }
};
