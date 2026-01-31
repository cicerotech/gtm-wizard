var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var DEFAULT_SETTINGS = {
  userEmail: "",
  serverUrl: "https://gtm-wizard.onrender.com",
  refreshMinutes: 5
};
var VIEW_TYPE = "eudia-calendar-view";
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
            } else if (meeting.attendees.length > 0) {
              const names = meeting.attendees.slice(0, 2).map((a) => a.name || a.email.split("@")[0]).join(", ");
              details.createEl("div", { cls: "eudia-cal-attendees", text: names });
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
      const response = yield (0, import_obsidian.requestUrl)({
        url: `${serverUrl}/api/calendar/${userEmail}/week`,
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      return response.json;
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
        const testUrl = `${this.plugin.settings.serverUrl}/api/calendar/${email}/today`;
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
  createNoteForMeeting(meeting) {
    return __async(this, null, function* () {
      const dateStr = meeting.start.split("T")[0];
      const safeName = meeting.subject.replace(/[<>:"/\\|?*]/g, "_").substring(0, 50);
      const fileName = `${dateStr} - ${safeName}.md`;
      const attendeeList = meeting.attendees.map((a) => `- ${a.name || a.email}`).join("\n");
      const content = `---
title: "${meeting.subject}"
date: ${dateStr}
meeting_time: ${this.formatTime(meeting.start)}
attendees: ${meeting.attendees.map((a) => a.name || a.email).join(", ")}
account: ${meeting.accountName || "TBD"}
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
        yield this.app.vault.create(fileName, content);
        const file = this.app.vault.getAbstractFileByPath(fileName);
        if (file) {
          yield this.app.workspace.openLinkText(fileName, "", true);
        }
        new import_obsidian.Notice(`Created: ${fileName}`);
      } catch (e) {
        new import_obsidian.Notice("Could not create note");
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
    new import_obsidian.Setting(containerEl).setName("Test Connection").setDesc("Verify calendar is working").addButton((btn) => btn.setButtonText("Test").setCta().onClick(() => __async(this, null, function* () {
      if (!this.plugin.settings.userEmail) {
        new import_obsidian.Notice("Enter your email first");
        return;
      }
      btn.setButtonText("Testing...");
      try {
        const url = `${this.plugin.settings.serverUrl}/api/calendar/${this.plugin.settings.userEmail}/today`;
        const resp = yield (0, import_obsidian.requestUrl)({ url, method: "GET" });
        if (resp.json.success) {
          new import_obsidian.Notice(`\u2713 Connected! ${resp.json.meetingCount} meetings today`);
          btn.setButtonText("\u2713 Success");
        } else {
          new import_obsidian.Notice(`Error: ${resp.json.error}`);
          btn.setButtonText("\u2717 Failed");
        }
      } catch (e) {
        new import_obsidian.Notice("Connection failed");
        btn.setButtonText("\u2717 Failed");
      }
      setTimeout(() => btn.setButtonText("Test"), 2e3);
    })));
  }
};
var EudiaCalendarPlugin = class extends import_obsidian.Plugin {
  onload() {
    return __async(this, null, function* () {
      console.log("Loading Eudia Calendar");
      yield this.loadSettings();
      this.registerView(VIEW_TYPE, (leaf) => new EudiaCalendarView(leaf, this));
      this.addRibbonIcon("calendar", "Eudia Calendar", () => this.openCalendar());
      this.addCommand({
        id: "open-calendar",
        name: "Open Calendar",
        callback: () => this.openCalendar()
      });
      this.addSettingTab(new CalendarSettingsTab(this.app, this));
      if (this.settings.userEmail) {
        this.app.workspace.onLayoutReady(() => {
          this.openCalendar();
        });
      }
    });
  }
  loadSettings() {
    return __async(this, null, function* () {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
    });
  }
  saveSettings() {
    return __async(this, null, function* () {
      yield this.saveData(this.settings);
    });
  }
  openCalendar() {
    return __async(this, null, function* () {
      const { workspace } = this.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
      if (!leaf) {
        const rightLeaf = workspace.getRightLeaf(false);
        if (rightLeaf) {
          yield rightLeaf.setViewState({ type: VIEW_TYPE, active: true });
          leaf = rightLeaf;
        }
      }
      if (leaf) {
        workspace.revealLeaf(leaf);
      }
    });
  }
  onunload() {
    console.log("Unloading Eudia Calendar");
  }
};
