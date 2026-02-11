# Demo Walkthrough -- Screenshot Capture Guide

Capture these 7 screenshots before the live walkthrough. Each corresponds to a placeholder slot in `/demo`. Use a clean browser window at 100% zoom. Hide bookmarks bar.

---

## 1. Meeting Prep -- Week View

**Navigate to:** GTM Hub > Meeting Prep tab
**What must be visible:** 3-5 meeting cards with real account names, times, and attendee counts. The week filter (This Week / Next Week) should be visible at the top.
**Presenter action:** PAUSE -- let the audience read the meeting names before speaking.

**Tips:** Capture on a Sunday/Monday when the upcoming week is fully populated. Avoid a week with only 1-2 meetings.

---

## 2. Meeting Prep -- AI Briefing

**Navigate to:** Click any meeting card in the Meeting Prep tab (pick an account with good data)
**What must be visible:** The expanded modal showing the GTM Brain intelligence brief, attendee list with names/titles, and the editable goals/agenda section. The "Copy Link" button should be visible.
**Presenter action:** PAUSE -- read 2-3 lines of the brief aloud to demonstrate depth.

**Tips:** Choose an account with active opportunities and recent meetings so the brief has substance. Avoid accounts with sparse data.

---

## 3. GTM Brain -- Query + Response

**Navigate to:** GTM Hub > GTM Brain tab
**What must be visible:** The search bar with a typed query (e.g. "prep me for my meeting with [account]" or "what's the latest on [account]?") and the full structured response below. The response should show multiple sections (deal status, contacts, recent activity).
**Presenter action:** NARRATE -- walk through 2-3 sections of the response.

**Tips:** Run the query live just before capturing so the response is fresh. Pick an account the audience will recognize.

---

## 4. Obsidian Vault -- Account Folders

**Navigate to:** Obsidian desktop app
**What must be visible:** The left sidebar with an expanded account folder showing the 7 sub-notes (Note 1, Note 2, Note 3, Meeting Notes, Contacts, Intelligence, Next Steps). Open either the Contacts or Intelligence note so the right pane shows pre-populated data -- not a blank template.
**Presenter action:** PAUSE -- let the audience see the folder structure and recognize it as organized.

**Tips:** Expand only one account folder to keep the sidebar clean. Collapse other folders. The open note should have visible content (names, titles, deal context).

---

## 5. GTM Brain in Obsidian

**Navigate to:** Obsidian desktop app > open GTM Brain chat (command palette or ribbon icon)
**What must be visible:** The chat modal with a query typed and a response displayed. Same quality as the web version.
**Presenter action:** NARRATE -- brief, just show parity with the web GTM Brain tab. 10-15 seconds.

**Tips:** Use the same account as Screenshot 4 for continuity.

---

## 6. Slack Bot -- Pipeline or Account Query

**Navigate to:** Slack > any channel where @gtm-brain is active
**What must be visible:** A real query (e.g. "@gtm-brain what do we know about [account]?" or "@gtm-brain show pipeline") and the formatted bot response with account details, stage, ACV, and owner.
**Presenter action:** NARRATE -- 15 seconds max. Point out it works where the team already communicates.

**Tips:** Capture a query with a clean, complete response. Avoid responses that show errors or empty fields.

---

## 7. Dashboard -- Pipeline View

**Navigate to:** GTM Hub > Dashboard tab
**What must be visible:** Account cards with stage indicators, ACV figures, and owner names. Ideally show 4-6 accounts across different stages so the data density is apparent.
**Presenter action:** PAUSE briefly -- let the data density register before moving on.

**Tips:** Use the default view without filters so the audience sees the full pipeline at a glance.

---

## Capture Checklist

- [ ] Screenshot 1: Meeting Prep week view
- [ ] Screenshot 2: Meeting Prep AI briefing modal
- [ ] Screenshot 3: GTM Brain query + response
- [ ] Screenshot 4: Obsidian vault sidebar + open note
- [ ] Screenshot 5: GTM Brain chat in Obsidian
- [ ] Screenshot 6: Slack bot response
- [ ] Screenshot 7: Dashboard pipeline view

Once captured, replace the placeholder slots in `src/views/demo-walkthrough.html` by adding `<img>` tags inside each `.screenshot-slot` div.
