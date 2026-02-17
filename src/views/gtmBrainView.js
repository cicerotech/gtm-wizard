/**
 * GTM Brain Web Tab View
 * Full-service query UI for account intelligence — same backend as Obsidian plugin.
 * Okta session provides userEmail; accounts are searched via typeahead (/api/search-accounts).
 *
 * Layout: Claude-style chat interface
 *   - Sticky header: title, account chip, new conversation
 *   - Scrollable chat area: messages flow downward, fills viewport
 *   - Sticky footer: input bar + ask button + quick actions
 */

/**
 * Format markdown answer to HTML (matches plugin formatResponse)
 */
function formatResponse(text) {
  if (!text || typeof text !== 'string') return '';
  let html = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '');
  html = html.replace(/\n{3,}/g, '\n\n');
  html = html.replace(/^([•\-]\s+.+)\n\n(?=[•\-]\s+)/gm, '$1\n');
  html = html.replace(/^(#{2,3}\s+.+)\n\n/gm, '$1\n');
  html = html.replace(/^#{1,3}\s+.+\n+(?=#{1,3}\s|\s*$)/gm, '');
  html = html.replace(/^#{2,3}\s+(.+)$/gm, '</p><h3 class="gtm-brain-header">$1</h3><p>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^-\s+\[\s*\]\s+(.+)$/gm, '<li class="gtm-brain-todo">$1</li>');
  html = html.replace(/^-\s+\[x\]\s+(.+)$/gm, '<li class="gtm-brain-done">$1</li>');
  html = html.replace(/^[•\-]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/g, '<ul class="gtm-brain-list">$&</ul>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/<p>\s*(<ul)/g, '$1');
  html = html.replace(/<\/ul>\s*<\/p>/g, '</ul>');
  html = html.replace(/<p>\s*(<h3)/g, '$1');
  html = html.replace(/<\/h3>\s*<\/p>/g, '</h3>');
  html = html.replace(/<\/li>\s*<br>\s*<li/g, '</li><li');
  html = html.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, function(m) { return m.replace(/<br\s*\/?>/g, ''); });
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*<br>\s*<\/p>/g, '');
  html = html.replace(/(<br>\s*){2,}/g, '');
  html = html.replace(/<\/h3>\s*<br>/g, '</h3>');
  html = html.replace(/<br>\s*<h3/g, '<h3');
  html = html.replace(/<br>\s*<ul/g, '<ul');
  html = html.replace(/<\/ul>\s*<br>/g, '</ul>');
  html = html.replace(/^(<br>)+|(<br>)+$/g, '');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '');
  return html;
}

/**
 * Generate HTML for the GTM Brain tab
 * @param {object} options
 * @param {string} options.userName - Display name
 * @param {string} options.userEmail - User email (for API)
 */
function generate(options = {}) {
  const { userName = 'User', userEmail = '' } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ask GTM Brain</title>
<style>
/* ── Reset & Shell ─────────────────────────────────────────── */
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7fe; }

.gtm-shell { display: flex; flex-direction: column; height: 100vh; max-width: 800px; margin: 0 auto; }

/* ── Header Bar ────────────────────────────────────────────── */
.gtm-header {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 12px 20px;
  background: #fff; border-bottom: 1px solid #e5e7eb;
  z-index: 10;
}
.gtm-header-title { font-size: 1.125rem; font-weight: 600; color: #1f2937; white-space: nowrap; }
.gtm-header-account { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.gtm-header-chip {
  display: inline-flex; align-items: center; gap: 6px;
  background: #eef1fc; border: 1px solid #c7cdee; border-radius: 20px;
  padding: 4px 10px 4px 12px; font-size: 0.8125rem; color: #1f2937;
  max-width: 280px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.gtm-header-chip .chip-owner { color: #6b7280; font-weight: 400; }
.gtm-header-chip-x { background: none; border: none; font-size: 1rem; color: #9ca3af; cursor: pointer; padding: 0 2px; line-height: 1; flex-shrink: 0; }
.gtm-header-chip-x:hover { color: #ef4444; }
.gtm-header-actions { display: flex; gap: 6px; flex-shrink: 0; }
.gtm-header-btn {
  font-size: 0.75rem; color: #6b7280; background: none;
  border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 4px 10px; cursor: pointer; white-space: nowrap;
}
.gtm-header-btn:hover { background: #eef1fc; border-color: #8e99e1; color: #1f2937; }

/* ── Chat Area ─────────────────────────────────────────────── */
.gtm-chat-area {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding: 20px 20px 12px;
  scroll-behavior: smooth;
}
#thread-container {
  display: flex; flex-direction: column; gap: 12px;
  min-height: 100%;
}

/* Welcome state (shown before first query) */
.gtm-welcome { padding: 32px 0 16px; }
.gtm-welcome-title { font-size: 1.5rem; font-weight: 600; color: #1f2937; margin-bottom: 4px; }
.gtm-welcome-sub { font-size: 0.875rem; color: #6b7280; margin-bottom: 6px; }
.gtm-welcome-hint { font-size: 0.8125rem; color: #6b7280; padding: 10px 12px; background: #eef1fc; border-radius: 8px; margin-bottom: 20px; }

/* Tile grid (inside welcome) */
.gtm-tile-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 12px; }
@media (max-width: 640px) { .gtm-tile-grid { grid-template-columns: 1fr; } }
.gtm-tile-cat-header {
  font-size: 0.6875rem; font-weight: 600; color: #6b7280;
  text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px;
  cursor: pointer; display: flex; align-items: center; gap: 4px; user-select: none;
}
.gtm-tile-cat-header .chevron { font-size: 0.5rem; transition: transform 0.2s; }
.gtm-tile-cat-header.open .chevron { transform: rotate(90deg); }
.gtm-tile-cat-items { display: flex; flex-direction: column; gap: 4px; }
.gtm-tile-cat-items.hidden { display: none; }
.gtm-tile {
  padding: 7px 10px; font-size: 0.75rem;
  border: 1px solid #e5e7eb; border-radius: 6px; background: #fff;
  cursor: pointer; color: #4b5563; text-align: left;
  transition: all 0.12s; width: 100%;
}
.gtm-tile:hover { background: #eef1fc; border-color: #8e99e1; color: #1f2937; }
.gtm-tile.disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Messages ──────────────────────────────────────────────── */
.gtm-msg { padding: 12px 16px; border-radius: 10px; font-size: 0.9375rem; line-height: 1.6; max-width: 100%; animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.gtm-msg-user { background: #eef1fc; color: #1f2937; align-self: flex-end; border-bottom-right-radius: 3px; max-width: 85%; }
.gtm-msg-ai { background: #fff; border: 1px solid #e5e7eb; color: #374151; align-self: flex-start; border-bottom-left-radius: 3px; }
.gtm-msg-ai .gtm-brain-header {
  font-size: 0.875rem; font-weight: 700;
  margin: 16px 0 4px; padding-top: 12px;
  border-top: 1px solid #f0f0f0; color: #1f2937; letter-spacing: -0.01em;
}
.gtm-msg-ai .gtm-brain-header:first-child { margin-top: 0; padding-top: 0; border-top: none; }
.gtm-msg-ai .gtm-brain-list { margin: 2px 0 6px 16px; padding: 0; list-style: disc; }
.gtm-msg-ai .gtm-brain-list li { margin: 0; padding: 2px 0; line-height: 1.5; }
.gtm-msg-ai .gtm-brain-list li strong { color: #111827; }
.gtm-msg-ai .gtm-brain-header + .gtm-brain-list { margin-top: 2px; }
.gtm-msg-ai p + .gtm-brain-list { margin-top: 2px; }
.gtm-msg-ai .gtm-brain-list + p { margin-top: 6px; }
.gtm-msg-ai .gtm-brain-todo { list-style: none; margin-left: -16px; }
.gtm-msg-ai .gtm-brain-done { list-style: none; margin-left: -16px; text-decoration: line-through; color: #6b7280; }
.gtm-msg-ai p { margin: 4px 0; }
.gtm-msg-ai p:first-child { margin-top: 0; }
.gtm-msg-ai p:last-child { margin-bottom: 0; }

.gtm-msg-context { font-size: 0.7rem; color: #9ca3af; margin-top: 8px; }
.gtm-msg-loading { background: #fff; border: 1px solid #e5e7eb; color: #6b7280; text-align: center; padding: 16px; border-radius: 10px; }

.gtm-suggestions-inline { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #f3f4f6; }
.gtm-suggestion-chip {
  font-size: 0.75rem; padding: 5px 12px;
  border: 1px solid #e5e7eb; border-radius: 16px;
  background: #f9fafb; color: #4b5563; cursor: pointer; transition: all 0.15s;
}
.gtm-suggestion-chip:hover { background: #eef1fc; border-color: #8e99e1; color: #1f2937; }

.gtm-feedback { display: flex; gap: 8px; margin-top: 6px; }
.gtm-feedback-btn {
  font-size: 0.6875rem; padding: 2px 8px; border: none; border-radius: 4px;
  background: transparent; color: #9ca3af; cursor: pointer; transition: all 0.15s;
}
.gtm-feedback-btn:hover { color: #4b5563; background: #f3f4f6; }
.gtm-feedback-btn:disabled { cursor: default; }

.gtm-error {
  padding: 12px 16px; background: #fef2f2; border: 1px solid #fecaca;
  border-radius: 8px; color: #b91c1c; font-size: 0.875rem;
}

/* ── Footer Input Bar ──────────────────────────────────────── */
.gtm-footer {
  flex-shrink: 0;
  padding: 12px 20px 16px;
  background: #fff; border-top: 1px solid #e5e7eb;
  z-index: 10;
}
.gtm-input-row { display: flex; gap: 8px; align-items: flex-end; }
.gtm-account-search-wrap { position: relative; flex-shrink: 0; }
.gtm-account-search-btn {
  padding: 9px 12px; font-size: 0.8125rem; font-weight: 500;
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
  color: #6b7280; cursor: pointer; white-space: nowrap;
}
.gtm-account-search-btn:hover { border-color: #8e99e1; color: #1f2937; }
.gtm-account-search-btn.active { border-color: #8e99e1; background: #eef1fc; color: #1f2937; }

.gtm-search-dropdown {
  position: absolute; bottom: 100%; left: 0; width: 320px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  margin-bottom: 4px; box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
  display: none; z-index: 60;
}
.gtm-search-dropdown.open { display: block; }
.gtm-search-dropdown input {
  width: 100%; padding: 10px 12px; border: none; border-bottom: 1px solid #e5e7eb;
  border-radius: 8px 8px 0 0; font-size: 0.875rem; outline: none;
}
.gtm-search-dropdown input:focus { box-shadow: inset 0 -2px 0 #8e99e1; }
.gtm-search-results { max-height: 280px; overflow-y: auto; }
.gtm-search-result-card { padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.1s; }
.gtm-search-result-card:last-child { border-bottom: none; }
.gtm-search-result-card:hover { background: #eef1fc; }
.gtm-search-result-name { font-size: 0.875rem; font-weight: 600; color: #1f2937; }
.gtm-search-result-meta { font-size: 0.75rem; color: #6b7280; margin-top: 2px; display: flex; flex-wrap: wrap; gap: 6px; }
.gtm-search-result-meta span { white-space: nowrap; }
.gtm-search-result-opp { font-size: 0.6875rem; color: #8e99e1; margin-top: 2px; font-weight: 500; }
.gtm-search-no-results { padding: 12px; text-align: center; color: #9ca3af; font-size: 0.8125rem; }

.gtm-query-wrap { flex: 1; position: relative; }
.gtm-query-input {
  width: 100%; padding: 10px 14px; padding-right: 70px;
  border: 1px solid #e5e7eb; border-radius: 10px; font-size: 0.9rem;
  background: #fff; resize: none;
}
.gtm-query-input:focus { outline: none; border-color: #8e99e1; box-shadow: 0 0 0 3px rgba(142,153,225,0.15); }
.gtm-ask-btn {
  position: absolute; right: 6px; bottom: 6px;
  padding: 6px 16px; font-size: 0.8125rem; font-weight: 600;
  background: #8e99e1; color: #fff; border: none; border-radius: 6px;
  cursor: pointer; transition: background 0.15s;
}
.gtm-ask-btn:hover { background: #7b86d0; }
.gtm-ask-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Hero + quick actions row */
.gtm-footer-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; align-items: center; }
.gtm-hero-btn {
  padding: 6px 14px; font-size: 0.75rem; font-weight: 600;
  background: #8e99e1; color: #fff; border: none; border-radius: 6px;
  cursor: pointer; transition: all 0.15s;
}
.gtm-hero-btn:hover { background: #7b86d0; }
.gtm-hero-btn.needs-account { opacity: 0.35; cursor: not-allowed; }
.gtm-hero-btn span { font-weight: 400; opacity: 0.8; margin-left: 4px; }
.gtm-quick-toggle {
  font-size: 0.6875rem; color: #8e99e1; background: none; border: none;
  cursor: pointer; padding: 4px 6px;
}
.gtm-quick-toggle:hover { text-decoration: underline; }
.gtm-footer-hint { font-size: 0.6875rem; color: #9ca3af; margin-left: auto; }
.gtm-footer-powered { font-size: 0.6rem; color: #c5c5c5; text-align: center; margin-top: 4px; }
</style>
</head>
<body>

<div class="gtm-shell">
  <!-- ── Header ──────────────────────────────────────────────── -->
  <header class="gtm-header">
    <div class="gtm-header-title">GTM Brain</div>
    <div class="gtm-header-account" id="header-account"></div>
    <div class="gtm-header-actions">
      <button type="button" id="refresh-btn" class="gtm-header-btn" title="Re-query with fresh Salesforce data">Refresh</button>
      <button type="button" id="new-chat-btn" class="gtm-header-btn" title="Start a new conversation">New chat</button>
    </div>
  </header>

  <!-- ── Chat Area ───────────────────────────────────────────── -->
  <div class="gtm-chat-area" id="chat-area">
    <div id="thread-container">
      <!-- Welcome state: rendered via JS on load -->
    </div>
  </div>

  <!-- ── Footer Input Bar ────────────────────────────────────── -->
  <footer class="gtm-footer">
    <div class="gtm-input-row">
      <div class="gtm-account-search-wrap" id="acct-search-wrap">
        <button type="button" id="acct-search-btn" class="gtm-account-search-btn" title="Select an account (optional)">Account</button>
        <div id="search-dropdown" class="gtm-search-dropdown">
          <input type="text" id="account-search" placeholder="Search for an account..." autocomplete="off" aria-label="Search accounts" />
          <div id="search-results" class="gtm-search-results"></div>
        </div>
      </div>
      <div class="gtm-query-wrap">
        <input type="text" id="query" class="gtm-query-input" placeholder="Ask about any account, deal, or pipeline..." aria-label="Your question" />
        <button type="button" id="submit" class="gtm-ask-btn">Ask</button>
      </div>
    </div>
    <div class="gtm-footer-actions">
      <button type="button" id="hero-btn" class="gtm-hero-btn needs-account" data-query="Give me a full account overview: deal status and stage, key contacts with titles, recent activity and meetings, identified pain points, and competitive landscape.">Account Overview<span>- deals, contacts, intel</span></button>
      <button type="button" id="tiles-toggle" class="gtm-quick-toggle" style="display:none;">Show suggestions</button>
      <span class="gtm-footer-hint">Typically 2-5 sec</span>
    </div>
    <div class="gtm-footer-powered">Live from Salesforce &bull; Powered by Claude</div>
  </footer>
</div>

<script>
(function() {
  var userEmail = ${JSON.stringify(userEmail)};

  // ─── Helpers ─────────────────────────────────────────────────
  function escapeHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatAnswer(text) {
    if (!text) return '';
    var html = text;
    // Strip emojis
    html = html.replace(/[\\u{1F300}-\\u{1F9FF}]|[\\u{2600}-\\u{26FF}]|[\\u{2700}-\\u{27BF}]|[\\u{1F600}-\\u{1F64F}]|[\\u{1F680}-\\u{1F6FF}]/gu, '');
    // Collapse excessive newlines and remove blanks between bullets
    html = html.replace(/\\n{3,}/g, '\\n\\n');
    html = html.replace(/^([\\u2022\\-]\\s+.+)\\n\\n(?=[\\u2022\\-]\\s+)/gm, '$1\\n');
    // Remove blank lines after headers
    html = html.replace(/^(#{2,3}\\s+.+)\\n\\n/gm, '$1\\n');
    // Remove empty sections (header + whitespace before next header or EOF)
    html = html.replace(/^#{1,3}\\s+.+\\n+(?=#{1,3}\\s|\\s*$)/gm, '');
    // Headers
    html = html.replace(/^#{2,3}\\s+(.+)$/gm, '<h3 class="gtm-brain-header">$1</h3>');
    // Bold
    html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
    // Checkboxes
    html = html.replace(/^-\\s+\\[\\s*\\]\\s+(.+)$/gm, '<li class="gtm-brain-todo">$1</li>');
    html = html.replace(/^-\\s+\\[x\\]\\s+(.+)$/gm, '<li class="gtm-brain-done">$1</li>');
    // Bullet points
    html = html.replace(/^[\\u2022\\-]\\s+(.+)$/gm, '<li>$1</li>');
    // Wrap consecutive li into ul
    html = html.replace(/(<li[^>]*>.*?<\\/li>\\s*)+/g, '<ul class="gtm-brain-list">$&</ul>');
    // Paragraph breaks
    html = html.replace(/\\n\\n/g, '</p><p>');
    html = html.replace(/\\n/g, '<br>');
    // Strip p-tags wrapping block elements
    html = html.replace(/<p>\\s*(<ul)/g, '$1');
    html = html.replace(/<\\/ul>\\s*<\\/p>/g, '</ul>');
    html = html.replace(/<p>\\s*(<h3)/g, '$1');
    html = html.replace(/<\\/h3>\\s*<\\/p>/g, '</h3>');
    // Remove ALL <br> inside <ul> tags (critical spacing fix)
    html = html.replace(/<ul[^>]*>[\\s\\S]*?<\\/ul>/g, function(match) {
      return match.replace(/<br\\s*\\/?>/g, '');
    });
    // Remove br between header and list
    html = html.replace(/<\\/h3>\\s*(<br>\\s*)+\\s*<ul/g, '</h3><ul');
    html = html.replace(/<\\/h3>\\s*(<br>\\s*)+/g, '</h3>');
    // Clean up empties
    html = html.replace(/<p>\\s*<\\/p>/g, '');
    html = html.replace(/<p>\\s*<br>\\s*<\\/p>/g, '');
    html = html.replace(/(<br>\\s*){2,}/g, '');
    html = html.replace(/<br>\\s*<h3/g, '<h3');
    html = html.replace(/<br>\\s*<ul/g, '<ul');
    html = html.replace(/<\\/ul>\\s*<br>/g, '</ul>');
    html = html.replace(/^(<br>)+|(<br>)+$/g, '');
    return '<p>' + html + '</p>';
  }

  function formatAcv(v) {
    if (!v) return '';
    if (v >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return '$' + (v / 1000).toFixed(0) + 'K';
    return '$' + v;
  }

  // ─── DOM refs ────────────────────────────────────────────────
  var queryEl          = document.getElementById('query');
  var searchInput      = document.getElementById('account-search');
  var searchDropdown   = document.getElementById('search-dropdown');
  var resultsBox       = document.getElementById('search-results');
  var acctSearchBtn    = document.getElementById('acct-search-btn');
  var acctSearchWrap   = document.getElementById('acct-search-wrap');
  var headerAccountBox = document.getElementById('header-account');
  var submitBtn        = document.getElementById('submit');
  var threadContainer  = document.getElementById('thread-container');
  var chatArea         = document.getElementById('chat-area');
  var refreshBtn       = document.getElementById('refresh-btn');
  var newChatBtn       = document.getElementById('new-chat-btn');
  var heroBtn          = document.getElementById('hero-btn');
  var tilesToggle      = document.getElementById('tiles-toggle');

  // ─── State ──────────────────────────────────────────────────
  var selectedAccount  = { id: '', name: '', owner: '' };
  var searchDebounce   = null;
  var currentSessionId = null;
  var isQuerying       = false;
  var hasAsked         = false;
  var lastQueryTime    = 0;

  // ─── Welcome Screen ────────────────────────────────────────
  function renderWelcome() {
    threadContainer.innerHTML = '';
    var welcome = document.createElement('div');
    welcome.id = 'welcome-panel';
    welcome.className = 'gtm-welcome';
    welcome.innerHTML =
      '<h1 class="gtm-welcome-title">Ask GTM Brain</h1>' +
      '<p class="gtm-welcome-sub">Ask about any account or pipeline.</p>' +
      '<p class="gtm-welcome-hint">Ask in plain language. Results use Salesforce, meeting notes, and Slack.</p>' +
      '<div class="gtm-tile-grid" id="tile-grid">' +
        '<div class="gtm-tile-cat">' +
          '<div class="gtm-tile-cat-header open" data-cat="acct"><span class="chevron">&#9654;</span> Account Intel</div>' +
          '<div class="gtm-tile-cat-items" data-items="acct">' +
            '<button class="gtm-tile acct-tile" data-query="What\\x27s the latest update on this account?">Latest update</button>' +
            '<button class="gtm-tile acct-tile" data-query="What are the identified pain points for this account?">Pain points</button>' +
            '<button class="gtm-tile acct-tile" data-query="What\\x27s the competitive landscape for this account? Who else are they evaluating?">Competitive intel</button>' +
          '</div>' +
        '</div>' +
        '<div class="gtm-tile-cat">' +
          '<div class="gtm-tile-cat-header open" data-cat="deals"><span class="chevron">&#9654;</span> Pipeline &amp; Deals</div>' +
          '<div class="gtm-tile-cat-items" data-items="deals">' +
            '<button class="gtm-tile acct-tile" data-query="What\\x27s the deal status and current stage for this account?">Deal status</button>' +
            '<button class="gtm-tile acct-tile" data-query="What products have been discussed or sold to this account?">Products discussed</button>' +
            '<button class="gtm-tile acct-tile" data-query="What are the next steps and target dates for deals with this account?">Next steps</button>' +
          '</div>' +
        '</div>' +
        '<div class="gtm-tile-cat">' +
          '<div class="gtm-tile-cat-header open" data-cat="people"><span class="chevron">&#9654;</span> People &amp; Relationships</div>' +
          '<div class="gtm-tile-cat-items" data-items="people">' +
            '<button class="gtm-tile acct-tile" data-query="Who are the key contacts and stakeholders at this account?">Key contacts</button>' +
            '<button class="gtm-tile acct-tile" data-query="Who are the decision makers and economic buyer for this account?">Decision makers</button>' +
            '<button class="gtm-tile acct-tile" data-query="Do we have a champion at this account? What\\x27s their status and influence?">Champion status</button>' +
          '</div>' +
        '</div>' +
        '<div class="gtm-tile-cat">' +
          '<div class="gtm-tile-cat-header" data-cat="strat"><span class="chevron">&#9654;</span> Strategy &amp; Context</div>' +
          '<div class="gtm-tile-cat-items hidden" data-items="strat">' +
            '<button class="gtm-tile acct-tile" data-query="Which marketing campaigns have touched this account?">Campaign influence</button>' +
            '<button class="gtm-tile acct-tile" data-query="What\\x27s the account plan and strategic context for this account?">Account plan</button>' +
            '<button class="gtm-tile acct-tile" data-query="What contracts or commercial terms exist for this account?">Contracts and terms</button>' +
          '</div>' +
        '</div>' +
        '<div class="gtm-tile-cat">' +
          '<div class="gtm-tile-cat-header" data-cat="prep"><span class="chevron">&#9654;</span> Meeting Prep</div>' +
          '<div class="gtm-tile-cat-items hidden" data-items="prep">' +
            '<button class="gtm-tile acct-tile" data-query="Full meeting prep for this account -- deal context, key contacts, recent activity, and outstanding action items.">Full meeting prep</button>' +
            '<button class="gtm-tile acct-tile" data-query="Summarize all meeting notes and customer brain history for this account.">Meeting history</button>' +
            '<button class="gtm-tile acct-tile" data-query="Who owns this account and what\\x27s their engagement level based on recent activity?">Owner &amp; engagement</button>' +
          '</div>' +
        '</div>' +
        '<div class="gtm-tile-cat">' +
          '<div class="gtm-tile-cat-header" data-cat="hist"><span class="chevron">&#9654;</span> History &amp; Activity</div>' +
          '<div class="gtm-tile-cat-items hidden" data-items="hist">' +
            '<button class="gtm-tile acct-tile" data-query="What\\x27s the full engagement history with this account?">Engagement history</button>' +
            '<button class="gtm-tile acct-tile" data-query="What happened in the most recent meetings with this account?">Recent meetings</button>' +
            '<button class="gtm-tile acct-tile" data-query="What are the open action items and next steps for this account?">Open action items</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    threadContainer.appendChild(welcome);
    wireUpTiles();
    updateTileState();
  }

  function wireUpTiles() {
    document.querySelectorAll('.gtm-tile-cat-header').forEach(function(hdr) {
      hdr.addEventListener('click', function() {
        var cat = this.getAttribute('data-cat');
        var items = document.querySelector('[data-items="' + cat + '"]');
        if (items.classList.contains('hidden')) {
          items.classList.remove('hidden');
          this.classList.add('open');
        } else {
          items.classList.add('hidden');
          this.classList.remove('open');
        }
      });
    });
    document.querySelectorAll('.gtm-tile').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (this.classList.contains('disabled') || isQuerying) return;
        queryEl.value = this.getAttribute('data-query');
        runQuery(false);
      });
    });
  }

  function updateTileState() {
    var hasAccount = !!(selectedAccount.id || selectedAccount.name);
    heroBtn.classList.toggle('needs-account', !hasAccount);
    document.querySelectorAll('.gtm-tile.acct-tile').forEach(function(t) {
      t.classList.toggle('disabled', !hasAccount);
      t.title = hasAccount ? '' : 'Select an account first';
    });
  }

  function removeWelcome() {
    var wp = document.getElementById('welcome-panel');
    if (wp) wp.remove();
    if (!hasAsked) {
      hasAsked = true;
      tilesToggle.style.display = '';
    }
  }

  // ─── Account Selection ─────────────────────────────────────
  function clearSelection() {
    selectedAccount = { id: '', name: '', owner: '' };
    headerAccountBox.innerHTML = '';
    acctSearchBtn.classList.remove('active');
    acctSearchBtn.textContent = 'Account';
    searchInput.value = '';
    searchDropdown.classList.remove('open');
    currentSessionId = null;
    updateTileState();
  }

  function selectAccount(acc) {
    var prevName = selectedAccount.name;
    selectedAccount = { id: acc.id, name: acc.name, owner: acc.owner || '' };
    searchDropdown.classList.remove('open');
    searchInput.value = '';
    // Show chip in header
    headerAccountBox.innerHTML =
      '<span class="gtm-header-chip">' +
        '<strong>' + escapeHtml(acc.name) + '</strong>' +
        (acc.owner ? ' <span class="chip-owner">(' + escapeHtml(acc.owner) + ')</span>' : '') +
        ' <button type="button" class="gtm-header-chip-x" title="Clear">&times;</button>' +
      '</span>';
    headerAccountBox.querySelector('.gtm-header-chip-x').addEventListener('click', clearSelection);
    acctSearchBtn.classList.add('active');
    acctSearchBtn.textContent = 'Change';
    // Auto-clear thread when account changes mid-conversation (prevents context bleed)
    if (prevName && prevName !== acc.name && threadContainer.children.length > 0) {
      var wp = document.getElementById('welcome-panel');
      if (!wp) {
        startNewChat();
      }
    }
    currentSessionId = null;
    updateTileState();
    queryEl.focus();
  }

  // ─── Account Search ────────────────────────────────────────
  acctSearchBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (searchDropdown.classList.contains('open')) {
      searchDropdown.classList.remove('open');
    } else {
      searchDropdown.classList.add('open');
      searchInput.focus();
    }
  });

  function doSearch(term) {
    if (term.length < 2) { resultsBox.innerHTML = ''; return; }
    fetch('/api/search-accounts?q=' + encodeURIComponent(term), { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var matches = data.matches || [];
        if (matches.length === 0) {
          resultsBox.innerHTML = '<div class="gtm-search-no-results">No accounts found</div>';
          return;
        }
        var html = '';
        matches.forEach(function(m) {
          var meta = [];
          if (m.owner) meta.push('<span>Owner: ' + escapeHtml(m.owner) + '</span>');
          if (m.customerType) meta.push('<span>Type: ' + escapeHtml(m.customerType) + '</span>');
          if (m.industry) meta.push('<span>' + escapeHtml(m.industry) + '</span>');
          var oppLine = '';
          if (m.recentOpp) {
            var parts = [m.recentOpp.stage];
            if (m.recentOpp.acv) parts.push(formatAcv(m.recentOpp.acv));
            if (m.recentOpp.product) parts.push(m.recentOpp.product);
            oppLine = '<div class="gtm-search-result-opp">' + escapeHtml(parts.join(' \\u2022 ')) + '</div>';
          }
          html += '<div class="gtm-search-result-card" data-id="' + m.id + '" data-name="' + escapeHtml(m.name) + '" data-owner="' + escapeHtml(m.owner || '') + '">' +
            '<div class="gtm-search-result-name">' + escapeHtml(m.name) + '</div>' +
            '<div class="gtm-search-result-meta">' + meta.join('') + '</div>' +
            oppLine +
          '</div>';
        });
        resultsBox.innerHTML = html;
        resultsBox.querySelectorAll('.gtm-search-result-card').forEach(function(card) {
          card.addEventListener('click', function() {
            selectAccount({ id: this.dataset.id, name: this.dataset.name, owner: this.dataset.owner });
          });
        });
      })
      .catch(function() {
        resultsBox.innerHTML = '<div class="gtm-search-no-results">Search error</div>';
      });
  }

  searchInput.addEventListener('input', function() {
    clearTimeout(searchDebounce);
    var val = this.value.trim();
    searchDebounce = setTimeout(function() { doSearch(val); }, 300);
  });

  // Close search dropdown on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#acct-search-wrap')) {
      searchDropdown.classList.remove('open');
    }
  });

  // ─── Scroll (smart) ────────────────────────────────────────
  function scrollToElement(el, block) {
    if (!el) return;
    setTimeout(function() {
      el.scrollIntoView({ behavior: 'smooth', block: block || 'start' });
    }, 50);
  }

  // ─── Thread helpers ────────────────────────────────────────
  function addUserMessage(text) {
    removeWelcome();
    var msg = document.createElement('div');
    msg.className = 'gtm-msg gtm-msg-user';
    msg.textContent = text;
    threadContainer.appendChild(msg);
    scrollToElement(msg, 'start');
  }

  function addAIMessage(answer, context) {
    var loading = threadContainer.querySelector('.gtm-msg-loading');
    if (loading) loading.remove();

    // Extract follow-up suggestions
    var mainAnswer = answer;
    var suggestions = [];
    var suggestMatch = answer.match(/---\\s*\\n\\s*You might also ask:\\s*\\n((?:\\d+\\.\\s*.+\\n?)+)/i);
    if (!suggestMatch) suggestMatch = answer.match(/---\\s*\\nYou might also ask:\\s*\\n((?:[\\s\\S]*?)$)/i);
    if (suggestMatch) {
      mainAnswer = answer.substring(0, answer.indexOf(suggestMatch[0])).trim();
      var lines = suggestMatch[1].trim().split('\\n');
      for (var i = 0; i < lines.length; i++) {
        var cleaned = lines[i].replace(/^\\d+\\.\\s*/, '').trim();
        if (cleaned.length > 5) suggestions.push(cleaned);
      }
    }

    var msg = document.createElement('div');
    msg.className = 'gtm-msg gtm-msg-ai';
    msg.innerHTML = formatAnswer(mainAnswer);

    // Context line
    if (context) {
      var parts = [];
      if (context.accountName) {
        var acctLabel = context.accountName;
        if (context.owner) acctLabel += ' (' + context.owner + ')';
        parts.push(acctLabel);
      }
      if (context.opportunityCount > 0) {
        var oppText = context.opportunityCount + ' opp' + (context.opportunityCount > 1 ? 's' : '');
        if (context.topOpportunity && context.topOpportunity.stage) {
          oppText += ' \\u2014 ' + context.topOpportunity.stage;
          if (context.topOpportunity.acv) oppText += ' ' + formatAcv(context.topOpportunity.acv);
        }
        parts.push(oppText);
      }
      if (context.contactCount > 0) parts.push(context.contactCount + ' contacts');
      if (context.hasNotes) parts.push('notes');
      if (context.hasCustomerBrain) parts.push('history');
      var freshness = context.dataFreshness === 'cached' || context.dataFreshness === 'session-cached' ? 'cached' : 'live';
      parts.push(freshness + ' data');
      if (parts.length) {
        var ctxDiv = document.createElement('div');
        ctxDiv.className = 'gtm-msg-context';
        ctxDiv.textContent = parts.join(' \\u2022 ');
        msg.appendChild(ctxDiv);
      }
    }

    // Follow-up suggestion chips
    if (suggestions.length > 0) {
      var suggestDiv = document.createElement('div');
      suggestDiv.className = 'gtm-suggestions-inline';
      for (var s = 0; s < Math.min(suggestions.length, 3); s++) {
        (function(text) {
          var chip = document.createElement('button');
          chip.className = 'gtm-suggestion-chip';
          chip.textContent = text;
          chip.onclick = function() {
            queryEl.value = text;
            queryEl.focus();
            runQuery(false);
          };
          suggestDiv.appendChild(chip);
        })(suggestions[s]);
      }
      msg.appendChild(suggestDiv);
    }

    // Feedback
    var feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'gtm-feedback';
    var thumbsUp = document.createElement('button');
    thumbsUp.className = 'gtm-feedback-btn';
    thumbsUp.innerHTML = '\\u2191 Helpful';
    thumbsUp.title = 'This was helpful';
    var thumbsDown = document.createElement('button');
    thumbsDown.className = 'gtm-feedback-btn';
    thumbsDown.innerHTML = '\\u2193 Not helpful';
    thumbsDown.title = 'This was not helpful';

    function sendFeedback(rating, btn) {
      var payload = {
        query: answer.substring(0, 100),
        answerSnippet: mainAnswer.substring(0, 300),
        accountName: (context && context.accountName) || selectedAccount.name || '',
        accountId: (context && context.accountId) || selectedAccount.id || '',
        userEmail: userEmail,
        sessionId: currentSessionId || '',
        rating: rating
      };
      btn.disabled = true;
      btn.style.opacity = '1';
      btn.style.fontWeight = '600';
      if (rating === 'helpful') { btn.style.color = '#059669'; }
      else { btn.style.color = '#dc2626'; }
      fetch('/api/intelligence/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      }).catch(function() {});
    }

    thumbsUp.onclick = function() { sendFeedback('helpful', thumbsUp); thumbsDown.style.display = 'none'; };
    thumbsDown.onclick = function() { sendFeedback('not_helpful', thumbsDown); thumbsUp.style.display = 'none'; };
    feedbackDiv.appendChild(thumbsUp);
    feedbackDiv.appendChild(thumbsDown);
    msg.appendChild(feedbackDiv);

    threadContainer.appendChild(msg);
    // Scroll so the START of the AI message is visible (user reads top-down)
    scrollToElement(msg, 'start');
    queryEl.focus();
  }

  function addLoadingMessage(accountName) {
    var msg = document.createElement('div');
    msg.className = 'gtm-msg gtm-msg-loading';
    msg.textContent = accountName ? 'Gathering intelligence about ' + accountName + '...' : 'Thinking...';
    threadContainer.appendChild(msg);
    scrollToElement(msg, 'end');
  }

  function showError(text) {
    var loading = threadContainer.querySelector('.gtm-msg-loading');
    if (loading) loading.remove();
    var errMsg = document.createElement('div');
    errMsg.className = 'gtm-error';
    errMsg.textContent = text;
    threadContainer.appendChild(errMsg);
    scrollToElement(errMsg, 'end');
    isQuerying = false;
    submitBtn.disabled = false;
  }

  function startNewChat() {
    threadContainer.innerHTML = '';
    currentSessionId = null;
    hasAsked = false;
    isQuerying = false;
    tilesToggle.style.display = 'none';
    renderWelcome();
    queryEl.value = '';
    queryEl.focus();
  }

  // ─── Query execution (with double-click guard) ─────────────
  function runQuery(forceRefresh) {
    var query = queryEl.value.trim();
    if (!query) { queryEl.focus(); return; }

    // Double-click / rapid-fire guard
    if (isQuerying) return;
    var now = Date.now();
    if (now - lastQueryTime < 500) return;
    lastQueryTime = now;
    isQuerying = true;

    var accountId   = selectedAccount.id || '';
    var accountName = selectedAccount.name || '';

    addUserMessage(query);
    addLoadingMessage(accountName || null);
    queryEl.value = '';
    submitBtn.disabled = true;

    var payload = {
      query: query,
      accountId: accountId,
      accountName: accountName,
      userEmail: userEmail
    };
    if (forceRefresh) payload.forceRefresh = true;
    if (currentSessionId) payload.sessionId = currentSessionId;

    fetch('/api/intelligence/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, json: j }; }); })
    .then(function(result) {
      isQuerying = false;
      if (result.ok && result.json.success) {
        if (result.json.sessionId) currentSessionId = result.json.sessionId;
        addAIMessage(result.json.answer, result.json.context);
      } else {
        var loading = threadContainer.querySelector('.gtm-msg-loading');
        if (loading) loading.remove();
        showError(result.json.error || result.json.message || 'Could not get an answer. Try rephrasing.');
      }
      submitBtn.disabled = false;
    })
    .catch(function(err) {
      isQuerying = false;
      var msg = 'Unable to connect. Check your connection and try again.';
      if (err.message && (err.message.indexOf('timeout') !== -1 || err.message.indexOf('network') !== -1)) {
        msg = 'Request timed out or network error. Please try again.';
      }
      showError(msg);
    });
  }

  // ─── Hero button (with guard) ──────────────────────────────
  heroBtn.addEventListener('click', function() {
    if (this.classList.contains('needs-account') || isQuerying) return;
    queryEl.value = this.getAttribute('data-query');
    runQuery(false);
  });

  // ─── Tiles toggle ──────────────────────────────────────────
  tilesToggle.addEventListener('click', function() {
    var wp = document.getElementById('welcome-panel');
    if (wp) {
      // Already showing — hide it
      wp.remove();
      this.textContent = 'Show suggestions';
    } else {
      // Re-render welcome at the top of thread
      renderWelcome();
      // Move it to top
      var first = threadContainer.firstChild;
      var panel = document.getElementById('welcome-panel');
      if (first && first !== panel) {
        threadContainer.insertBefore(panel, first);
      }
      this.textContent = 'Hide suggestions';
    }
  });

  // ─── Wire up events ────────────────────────────────────────
  submitBtn.addEventListener('click', function() { runQuery(false); });
  refreshBtn.addEventListener('click', function() {
    if (isQuerying) return;
    runQuery(true);
  });
  newChatBtn.addEventListener('click', startNewChat);
  queryEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') runQuery(false);
  });

  // ─── Init ──────────────────────────────────────────────────
  renderWelcome();
  queryEl.focus();
})();
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  generate,
  formatResponse
};
