/**
 * GTM Brain Web Tab View
 * Full-service query UI for account intelligence — same backend as Obsidian plugin.
 * Okta session provides userEmail; accounts are searched via typeahead (/api/search-accounts).
 */

/**
 * Format markdown answer to HTML (matches plugin formatResponse)
 */
function formatResponse(text) {
  if (!text || typeof text !== 'string') return '';
  // Strip emojis
  let html = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '');
  // Remove empty sections (header followed by only whitespace before next header or end)
  html = html.replace(/^#{1,3}\s+.+\n+(?=#{1,3}\s|\s*$)/gm, '');
  // Headers
  html = html.replace(/^#{2,3}\s+(.+)$/gm, '<h3 class="gtm-brain-header">$1</h3>');
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Checkboxes
  html = html.replace(/^-\s+\[\s*\]\s+(.+)$/gm, '<li class="gtm-brain-todo">$1</li>');
  html = html.replace(/^-\s+\[x\]\s+(.+)$/gm, '<li class="gtm-brain-done">$1</li>');
  // Bullet points
  html = html.replace(/^[•\-]\s+(.+)$/gm, '<li>$1</li>');
  // Wrap consecutive <li> into <ul>
  html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/g, '<ul class="gtm-brain-list">$&</ul>');
  // Paragraphs: double newlines become paragraph breaks, single newlines become <br>
  html = html.replace(/\n{3,}/g, '\n\n');
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  // Strip p-tags that wrap ul elements (prevents extra margins around lists)
  html = html.replace(/<p>\s*(<ul)/g, '$1');
  html = html.replace(/<\/ul>\s*<\/p>/g, '</ul>');
  html = html.replace(/<p>\s*(<h3)/g, '$1');
  html = html.replace(/<\/h3>\s*<\/p>/g, '</h3>');
  // Clean up empty paragraphs and stray breaks
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/(<br>\s*){2,}/g, '<br>');
  html = html.replace(/^(<br>)+|(<br>)+$/g, '');
  return '<p>' + html + '</p>';
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
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7fe; min-height: 100vh; padding: 24px; }
.gtm-brain-container { max-width: 720px; margin: 0 auto; }
.gtm-brain-title { font-size: 1.5rem; font-weight: 600; color: #1f2937; margin-bottom: 4px; }
.gtm-brain-subtitle { font-size: 0.875rem; color: #6b7280; margin-bottom: 20px; }
.gtm-brain-onboarding { font-size: 0.8125rem; color: #6b7280; margin-bottom: 16px; padding: 10px 12px; background: #eef1fc; border-radius: 8px; }
.gtm-brain-form { margin-bottom: 20px; }
.gtm-brain-row { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.gtm-brain-select-wrap { min-width: 260px; position: relative; }
.gtm-brain-select-wrap label { display: block; font-size: 0.75rem; font-weight: 500; color: #6b7280; margin-bottom: 4px; }
.gtm-brain-search-input { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 0.875rem; background: #fff; }
.gtm-brain-search-input:focus { outline: none; border-color: #8e99e1; box-shadow: 0 0 0 3px rgba(142,153,225,0.15); }
.gtm-brain-results { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; margin-top: 4px; max-height: 340px; overflow-y: auto; z-index: 50; box-shadow: 0 4px 12px rgba(0,0,0,0.1); display: none; }
.gtm-brain-results.open { display: block; }
.gtm-brain-result-card { padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.1s; }
.gtm-brain-result-card:last-child { border-bottom: none; }
.gtm-brain-result-card:hover { background: #eef1fc; }
.gtm-brain-result-name { font-size: 0.875rem; font-weight: 600; color: #1f2937; }
.gtm-brain-result-meta { font-size: 0.75rem; color: #6b7280; margin-top: 2px; display: flex; flex-wrap: wrap; gap: 6px; }
.gtm-brain-result-meta span { white-space: nowrap; }
.gtm-brain-result-opp { font-size: 0.6875rem; color: #8e99e1; margin-top: 2px; font-weight: 500; }
.gtm-brain-selected-chip { display: inline-flex; align-items: center; gap: 6px; background: #eef1fc; border: 1px solid #c7cdee; border-radius: 20px; padding: 6px 10px 6px 12px; font-size: 0.8125rem; color: #1f2937; margin-top: 6px; }
.gtm-brain-selected-chip .chip-owner { color: #6b7280; font-weight: 400; }
.gtm-brain-chip-x { background: none; border: none; font-size: 1rem; color: #9ca3af; cursor: pointer; padding: 0 2px; line-height: 1; }
.gtm-brain-chip-x:hover { color: #ef4444; }
.gtm-brain-no-results { padding: 12px; text-align: center; color: #9ca3af; font-size: 0.8125rem; }
.gtm-brain-input-wrap { flex: 1; min-width: 240px; }
.gtm-brain-input-wrap label { display: block; font-size: 0.75rem; font-weight: 500; color: #6b7280; margin-bottom: 4px; }
.gtm-brain-input { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 0.875rem; }
.gtm-brain-submit { margin-top: 12px; padding: 10px 20px; font-size: 0.875rem; font-weight: 500; background: #8e99e1; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
.gtm-brain-submit:hover { background: #7b86d0; }
.gtm-brain-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.gtm-brain-hint { font-size: 0.75rem; color: #9ca3af; margin-top: 6px; }
/* Hero button */
.gtm-brain-hero { margin-top: 12px; }
.gtm-brain-hero-btn { width: 100%; padding: 10px 16px; font-size: 0.8125rem; font-weight: 600; background: #8e99e1; color: #fff; border: none; border-radius: 8px; cursor: pointer; transition: background 0.15s; }
.gtm-brain-hero-btn:hover { background: #7b86d0; }
.gtm-brain-hero-btn span { font-size: 0.6875rem; font-weight: 400; opacity: 0.8; margin-left: 6px; }
.gtm-brain-hero-btn.needs-account { opacity: 0.4; cursor: not-allowed; }
/* Tile grid */
.gtm-brain-tiles { margin-top: 16px; transition: max-height 0.3s, opacity 0.3s; overflow: hidden; }
.gtm-brain-tiles.collapsed { max-height: 0; opacity: 0; margin: 0; }
.gtm-brain-tiles-toggle { font-size: 0.6875rem; color: #8e99e1; background: none; border: none; cursor: pointer; margin-top: 8px; }
.gtm-brain-tiles-toggle:hover { text-decoration: underline; }
.gtm-brain-tile-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
@media (max-width: 640px) { .gtm-brain-tile-grid { grid-template-columns: 1fr; } }
.gtm-brain-tile-cat { }
.gtm-brain-tile-cat-header { font-size: 0.6875rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px; cursor: pointer; display: flex; align-items: center; gap: 4px; user-select: none; }
.gtm-brain-tile-cat-header .chevron { font-size: 0.5rem; transition: transform 0.2s; }
.gtm-brain-tile-cat-header.open .chevron { transform: rotate(90deg); }
.gtm-brain-tile-cat-items { display: flex; flex-direction: column; gap: 4px; }
.gtm-brain-tile-cat-items.hidden { display: none; }
.gtm-brain-tile { padding: 7px 10px; font-size: 0.75rem; border: 1px solid #e5e7eb; border-radius: 6px; background: #fff; cursor: pointer; color: #4b5563; text-align: left; transition: all 0.12s; width: 100%; }
.gtm-brain-tile:hover { background: #eef1fc; border-color: #8e99e1; color: #1f2937; }
.gtm-brain-tile.disabled { opacity: 0.4; cursor: not-allowed; }
.gtm-brain-thread { margin-top: 16px; max-height: 60vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 4px 0; }
.gtm-brain-thread:empty { display: none; }
.gtm-brain-msg { padding: 12px 16px; border-radius: 10px; font-size: 0.9375rem; line-height: 1.6; max-width: 100%; animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.gtm-brain-msg-user { background: #eef1fc; color: #1f2937; align-self: flex-end; border-bottom-right-radius: 3px; }
.gtm-brain-msg-ai { background: #fff; border: 1px solid #e5e7eb; color: #374151; align-self: flex-start; border-bottom-left-radius: 3px; }
.gtm-brain-msg-ai .gtm-brain-header { font-size: 0.9375rem; font-weight: 600; margin: 12px 0 0; color: #1f2937; }
.gtm-brain-msg-ai .gtm-brain-header:first-child { margin-top: 0; }
.gtm-brain-msg-ai .gtm-brain-list { margin: 2px 0 2px 16px; padding: 0; }
.gtm-brain-msg-ai .gtm-brain-list li { margin: 0; padding: 0; line-height: 1.45; }
.gtm-brain-msg-ai .gtm-brain-header + br { display: none; }
.gtm-brain-msg-ai .gtm-brain-header + br + .gtm-brain-list { margin-top: 1px; }
.gtm-brain-msg-ai .gtm-brain-header + .gtm-brain-list { margin-top: 1px; }
.gtm-brain-msg-ai p + .gtm-brain-list { margin-top: 1px; }
.gtm-brain-msg-ai .gtm-brain-list + p { margin-top: 4px; }
.gtm-brain-msg-ai .gtm-brain-todo { list-style: none; margin-left: -16px; }
.gtm-brain-msg-ai .gtm-brain-done { list-style: none; margin-left: -16px; text-decoration: line-through; color: #6b7280; }
.gtm-brain-msg-ai p { margin: 6px 0; }
.gtm-brain-msg-ai p:first-child { margin-top: 0; }
.gtm-brain-msg-ai p:last-child { margin-bottom: 0; }
.gtm-brain-msg-context { font-size: 0.7rem; color: #9ca3af; margin-top: 6px; }
.gtm-brain-msg-loading { background: #fff; border: 1px solid #e5e7eb; color: #6b7280; text-align: center; padding: 16px; }
.gtm-brain-suggestions-inline { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f3f4f6; }
.gtm-brain-suggestion-chip { font-size: 0.75rem; padding: 4px 10px; border: 1px solid #e5e7eb; border-radius: 16px; background: #f9fafb; color: #4b5563; cursor: pointer; transition: all 0.15s; }
.gtm-brain-suggestion-chip:hover { background: #eef1fc; border-color: #8e99e1; color: #1f2937; }
.gtm-brain-feedback { display: flex; gap: 8px; margin-top: 6px; }
.gtm-brain-feedback-btn { font-size: 0.6875rem; padding: 2px 8px; border: none; border-radius: 4px; background: transparent; color: #9ca3af; cursor: pointer; transition: all 0.15s; }
.gtm-brain-feedback-btn:hover { color: #4b5563; background: #f3f4f6; }
.gtm-brain-feedback-btn:disabled { cursor: default; }
.gtm-brain-new-chat { font-size: 0.75rem; color: #8e99e1; background: none; border: 1px solid #d1d5db; cursor: pointer; padding: 4px 10px; border-radius: 6px; margin-top: 8px; }
.gtm-brain-new-chat:hover { background: #eef1fc; border-color: #8e99e1; }
.gtm-brain-response { margin-top: 24px; padding: 20px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; display: none; }
.gtm-brain-response.visible { display: block; }
.gtm-brain-answer { font-size: 0.9375rem; line-height: 1.6; color: #374151; }
.gtm-brain-refresh { font-size: 0.75rem; color: #8e99e1; background: none; border: none; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.gtm-brain-refresh:hover { background: #eef1fc; color: #6b73c4; }
.gtm-brain-loading { padding: 24px; text-align: center; color: #6b7280; }
.gtm-brain-error { padding: 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #b91c1c; font-size: 0.875rem; margin-top: 12px; }
.gtm-brain-footer { font-size: 0.6875rem; color: #9ca3af; margin-top: 24px; }
</style>
</head>
<body>
<div class="gtm-brain-container">
  <h1 class="gtm-brain-title">Ask GTM Brain</h1>
  <p class="gtm-brain-subtitle">Ask about any account or pipeline.</p>
  <p class="gtm-brain-onboarding">Ask in plain language. Results use Salesforce, meeting notes, and Slack.</p>

  <div class="gtm-brain-form">
    <div class="gtm-brain-row">
      <div class="gtm-brain-select-wrap">
        <label for="account-search">Account (optional)</label>
        <input type="text" id="account-search" class="gtm-brain-search-input" placeholder="Search for an account..." autocomplete="off" aria-label="Search accounts" />
        <div id="search-results" class="gtm-brain-results"></div>
        <div id="selected-account" style="display:none;"></div>
      </div>
      <div class="gtm-brain-input-wrap">
        <label for="query">Your question</label>
        <input type="text" id="query" class="gtm-brain-input" placeholder="e.g. What's the latest on this account? Who are the stakeholders? Prep me for my next call." aria-label="Your question" />
      </div>
    </div>
    <!-- Hero: Full Account Download -->
    <div class="gtm-brain-hero">
      <button type="button" id="hero-btn" class="gtm-brain-hero-btn needs-account" data-query="Give me a full account overview: deal status and stage, key contacts with titles, recent activity and meetings, identified pain points, and competitive landscape.">Account Overview<span>-- deals, contacts, activity, intel</span></button>
    </div>

    <!-- Organized Tile Grid -->
    <div id="tiles-container" class="gtm-brain-tiles">
      <div class="gtm-brain-tile-grid">
        <!-- Account Intel -->
        <div class="gtm-brain-tile-cat">
          <div class="gtm-brain-tile-cat-header open" data-cat="acct"><span class="chevron">&#9654;</span> Account Intel</div>
          <div class="gtm-brain-tile-cat-items" data-items="acct">
            <button class="gtm-brain-tile acct-tile" data-query="What's the latest update on this account?">Latest update</button>
            <button class="gtm-brain-tile acct-tile" data-query="What are the identified pain points for this account?">Pain points</button>
            <button class="gtm-brain-tile acct-tile" data-query="What's the competitive landscape for this account? Who else are they evaluating?">Competitive intel</button>
          </div>
        </div>
        <!-- Pipeline & Deals -->
        <div class="gtm-brain-tile-cat">
          <div class="gtm-brain-tile-cat-header open" data-cat="deals"><span class="chevron">&#9654;</span> Pipeline &amp; Deals</div>
          <div class="gtm-brain-tile-cat-items" data-items="deals">
            <button class="gtm-brain-tile acct-tile" data-query="What's the deal status and current stage for this account?">Deal status</button>
            <button class="gtm-brain-tile acct-tile" data-query="What products have been discussed or sold to this account?">Products discussed</button>
            <button class="gtm-brain-tile acct-tile" data-query="What are the next steps and target dates for deals with this account?">Next steps and dates</button>
          </div>
        </div>
        <!-- People & Relationships -->
        <div class="gtm-brain-tile-cat">
          <div class="gtm-brain-tile-cat-header open" data-cat="people"><span class="chevron">&#9654;</span> People &amp; Relationships</div>
          <div class="gtm-brain-tile-cat-items" data-items="people">
            <button class="gtm-brain-tile acct-tile" data-query="Who are the key contacts and stakeholders at this account?">Key contacts</button>
            <button class="gtm-brain-tile acct-tile" data-query="Who are the decision makers and economic buyer for this account?">Decision makers</button>
            <button class="gtm-brain-tile acct-tile" data-query="Do we have a champion at this account? What's their status and influence?">Champion status</button>
          </div>
        </div>
        <!-- Marketing & Events -->
        <div class="gtm-brain-tile-cat">
          <div class="gtm-brain-tile-cat-header" data-cat="mktg"><span class="chevron">&#9654;</span> Strategy &amp; Context</div>
          <div class="gtm-brain-tile-cat-items hidden" data-items="mktg">
            <button class="gtm-brain-tile acct-tile" data-query="Which marketing campaigns have touched this account?">Campaign influence</button>
            <button class="gtm-brain-tile acct-tile" data-query="What's the account plan and strategic context for this account?">Account plan</button>
            <button class="gtm-brain-tile acct-tile" data-query="What contracts or commercial terms exist for this account?">Contracts and terms</button>
          </div>
        </div>
        <!-- Meeting Prep -->
        <div class="gtm-brain-tile-cat">
          <div class="gtm-brain-tile-cat-header" data-cat="prep"><span class="chevron">&#9654;</span> Meeting Prep</div>
          <div class="gtm-brain-tile-cat-items hidden" data-items="prep">
            <button class="gtm-brain-tile acct-tile" data-query="Full meeting prep for this account -- deal context, key contacts, recent activity, and outstanding action items.">Full meeting prep</button>
            <button class="gtm-brain-tile acct-tile" data-query="Summarize all meeting notes and customer brain history for this account.">Meeting history summary</button>
            <button class="gtm-brain-tile acct-tile" data-query="Who owns this account and what's their engagement level based on recent activity?">Owner and engagement</button>
          </div>
        </div>
        <!-- History & Activity -->
        <div class="gtm-brain-tile-cat">
          <div class="gtm-brain-tile-cat-header" data-cat="hist"><span class="chevron">&#9654;</span> History &amp; Activity</div>
          <div class="gtm-brain-tile-cat-items hidden" data-items="hist">
            <button class="gtm-brain-tile acct-tile" data-query="What's the full engagement history with this account?">Engagement history</button>
            <button class="gtm-brain-tile acct-tile" data-query="What happened in the most recent meetings with this account?">Recent meetings</button>
            <button class="gtm-brain-tile acct-tile" data-query="What are the open action items and next steps for this account?">Open action items</button>
          </div>
        </div>
      </div>
    </div>
    <button type="button" id="submit" class="gtm-brain-submit">Ask</button>
    <p class="gtm-brain-hint">Typically 2–5 seconds.</p>
  </div>

  <div id="thread-container" class="gtm-brain-thread"></div>
  <div id="error-box" class="gtm-brain-error" style="display:none;"><span id="error-content"></span></div>
  <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:4px;">
    <button type="button" id="refresh-btn" class="gtm-brain-new-chat" title="Re-query with live Salesforce data">Refresh data</button>
    <button type="button" id="new-chat-btn" class="gtm-brain-new-chat" title="Start a new conversation">New conversation</button>
  </div>
  <p class="gtm-brain-footer">Live from Salesforce • Powered by Claude</p>
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
    // Remove empty sections (header followed by only whitespace before next header or end)
    html = html.replace(/^#{1,3}\\s+.+\\n+(?=#{1,3}\\s|\\s*$)/gm, '');
    // Headers
    html = html.replace(/^#{2,3}\\s+(.+)$/gm, '<h3 class="gtm-brain-header">$1</h3>');
    // Bold
    html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
    // Checkboxes
    html = html.replace(/^-\\s+\\[\\s*\\]\\s+(.+)$/gm, '<li class="gtm-brain-todo">$1</li>');
    html = html.replace(/^-\\s+\\[x\\]\\s+(.+)$/gm, '<li class="gtm-brain-done">$1</li>');
    // Bullet points
    html = html.replace(/^[•\\-]\\s+(.+)$/gm, '<li>$1</li>');
    // Wrap consecutive li into ul
    html = html.replace(/(<li[^>]*>.*?<\\/li>\\s*)+/g, '<ul class="gtm-brain-list">$&</ul>');
    // Paragraphs: double newlines become paragraph breaks, single become br
    html = html.replace(/\\n{3,}/g, '\\n\\n');
    html = html.replace(/\\n\\n/g, '</p><p>');
    html = html.replace(/\\n/g, '<br>');
    // Strip p-tags that wrap ul/h3 elements
    html = html.replace(/<p>\\s*(<ul)/g, '$1');
    html = html.replace(/<\\/ul>\\s*<\\/p>/g, '</ul>');
    html = html.replace(/<p>\\s*(<h3)/g, '$1');
    html = html.replace(/<\\/h3>\\s*<\\/p>/g, '</h3>');
    // Remove br tags between headers and lists (kills the gap)
    html = html.replace(/<\\/h3>\\s*(<br>\\s*)+\\s*<ul/g, '</h3><ul');
    html = html.replace(/<\\/h3>\\s*(<br>\\s*)+/g, '</h3>');
    // Clean up empty paragraphs and stray breaks
    html = html.replace(/<p>\\s*<\\/p>/g, '');
    html = html.replace(/(<br>\\s*){2,}/g, '<br>');
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
  var queryEl         = document.getElementById('query');
  var searchInput     = document.getElementById('account-search');
  var resultsBox      = document.getElementById('search-results');
  var selectedChipBox = document.getElementById('selected-account');
  var submitBtn       = document.getElementById('submit');
  var threadContainer = document.getElementById('thread-container');
  var refreshBtn      = document.getElementById('refresh-btn');
  var newChatBtn      = document.getElementById('new-chat-btn');
  var errorBox        = document.getElementById('error-box');
  var errorContent    = document.getElementById('error-content');

  // ─── Conversation state ─────────────────────────────────────
  var selectedAccount = { id: '', name: '', owner: '' };
  var searchDebounce = null;
  var currentSessionId = null;

  function clearSelection() {
    selectedAccount = { id: '', name: '', owner: '' };
    selectedChipBox.style.display = 'none';
    selectedChipBox.innerHTML = '';
    searchInput.value = '';
    searchInput.style.display = '';
    resultsBox.classList.remove('open');
  }

  function selectAccount(acc) {
    selectedAccount = { id: acc.id, name: acc.name, owner: acc.owner || '' };
    searchInput.style.display = 'none';
    resultsBox.classList.remove('open');
    selectedChipBox.innerHTML =
      '<span class="gtm-brain-selected-chip">' +
        '<strong>' + escapeHtml(acc.name) + '</strong>' +
        (acc.owner ? ' <span class="chip-owner">(' + escapeHtml(acc.owner) + ')</span>' : '') +
        ' <button type="button" class="gtm-brain-chip-x" title="Clear selection">&times;</button>' +
      '</span>';
    selectedChipBox.style.display = 'block';
    selectedChipBox.querySelector('.gtm-brain-chip-x').addEventListener('click', clearSelection);
    queryEl.focus();
  }

  // ─── Typeahead search ────────────────────────────────────────
  function doSearch(term) {
    if (term.length < 2) { resultsBox.classList.remove('open'); return; }
    fetch('/api/search-accounts?q=' + encodeURIComponent(term), { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var matches = data.matches || [];
        if (matches.length === 0) {
          resultsBox.innerHTML = '<div class="gtm-brain-no-results">No accounts found</div>';
          resultsBox.classList.add('open');
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
            oppLine = '<div class="gtm-brain-result-opp">' + escapeHtml(parts.join(' • ')) + '</div>';
          }
          html += '<div class="gtm-brain-result-card" data-id="' + m.id + '" data-name="' + escapeHtml(m.name) + '" data-owner="' + escapeHtml(m.owner || '') + '">' +
            '<div class="gtm-brain-result-name">' + escapeHtml(m.name) + '</div>' +
            '<div class="gtm-brain-result-meta">' + meta.join('') + '</div>' +
            oppLine +
          '</div>';
        });
        resultsBox.innerHTML = html;
        resultsBox.classList.add('open');
        // Wire click handlers
        resultsBox.querySelectorAll('.gtm-brain-result-card').forEach(function(card) {
          card.addEventListener('click', function() {
            selectAccount({ id: this.dataset.id, name: this.dataset.name, owner: this.dataset.owner });
          });
        });
      })
      .catch(function() {
        resultsBox.innerHTML = '<div class="gtm-brain-no-results">Search error — try again</div>';
        resultsBox.classList.add('open');
      });
  }

  searchInput.addEventListener('input', function() {
    clearTimeout(searchDebounce);
    var val = this.value.trim();
    searchDebounce = setTimeout(function() { doSearch(val); }, 300);
  });

  // Close results on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.gtm-brain-select-wrap')) {
      resultsBox.classList.remove('open');
    }
  });

  // ─── Suggested prompts ───────────────────────────────────────
  // ─── Tile behavior ──────────────────────────────────────────
  var tilesContainer = document.getElementById('tiles-container');
  var heroBtn = document.getElementById('hero-btn');
  var tilesVisible = true;

  // Category expand/collapse
  document.querySelectorAll('.gtm-brain-tile-cat-header').forEach(function(hdr) {
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

  // Tile click -> populate and submit
  document.querySelectorAll('.gtm-brain-tile').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (this.classList.contains('disabled')) return;
      queryEl.value = this.getAttribute('data-query');
      runQuery(false);
    });
  });

  // Hero button click
  heroBtn.addEventListener('click', function() {
    if (this.classList.contains('needs-account')) return;
    queryEl.value = this.getAttribute('data-query');
    runQuery(false);
  });

  // Account-awareness: enable/disable account-specific tiles
  function updateTileState() {
    var hasAccount = !!(selectedAccount.id || selectedAccount.name);
    heroBtn.classList.toggle('needs-account', !hasAccount);
    document.querySelectorAll('.gtm-brain-tile.acct-tile').forEach(function(t) {
      t.classList.toggle('disabled', !hasAccount);
      t.title = hasAccount ? '' : 'Select an account first';
    });
  }
  updateTileState();

  // Auto-collapse tiles after first query, show toggle to bring back
  function collapseTiles() {
    if (tilesVisible && tilesContainer) {
      tilesContainer.classList.add('collapsed');
      tilesVisible = false;
      // Add toggle button if not already there
      if (!document.getElementById('tiles-toggle')) {
        var toggle = document.createElement('button');
        toggle.id = 'tiles-toggle';
        toggle.className = 'gtm-brain-tiles-toggle';
        toggle.textContent = 'Show question suggestions';
        toggle.onclick = function() {
          tilesContainer.classList.toggle('collapsed');
          tilesVisible = !tilesVisible;
          this.textContent = tilesVisible ? 'Hide suggestions' : 'Show question suggestions';
        };
        tilesContainer.parentNode.insertBefore(toggle, tilesContainer.nextSibling);
      }
    }
  }

  // Hook into account selection to update tile state
  var origSelectAccount = selectAccount;
  selectAccount = function(a) {
    origSelectAccount(a);
    // Reset session when account changes - prevents stale context from prior account
    currentSessionId = null;
    updateTileState();
  };
  var origClearSelection = clearSelection;
  clearSelection = function() {
    origClearSelection();
    currentSessionId = null;
    updateTileState();
  };

  // ─── Thread helpers ──────────────────────────────────────────
  function addUserMessage(text) {
    var msg = document.createElement('div');
    msg.className = 'gtm-brain-msg gtm-brain-msg-user';
    msg.textContent = text;
    threadContainer.appendChild(msg);
    scrollThread();
  }

  function addAIMessage(answer, context) {
    // Remove loading indicator if present
    var loading = threadContainer.querySelector('.gtm-brain-msg-loading');
    if (loading) loading.remove();

    // Extract follow-up suggestions from end of response
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
    msg.className = 'gtm-brain-msg gtm-brain-msg-ai';
    msg.innerHTML = formatAnswer(mainAnswer);

    // Add context line
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
        ctxDiv.className = 'gtm-brain-msg-context';
        ctxDiv.textContent = parts.join(' \\u2022 ');
        msg.appendChild(ctxDiv);
      }
    }

    // Render follow-up suggestions as clickable chips
    if (suggestions.length > 0) {
      var suggestDiv = document.createElement('div');
      suggestDiv.className = 'gtm-brain-suggestions-inline';
      for (var s = 0; s < Math.min(suggestions.length, 3); s++) {
        (function(text) {
          var chip = document.createElement('button');
          chip.className = 'gtm-brain-suggestion-chip';
          chip.textContent = text;
          chip.onclick = function() {
            queryEl.value = text;
            runQuery(false);
          };
          suggestDiv.appendChild(chip);
        })(suggestions[s]);
      }
      msg.appendChild(suggestDiv);
    }

    // Feedback buttons (thumbs up / thumbs down)
    var feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'gtm-brain-feedback';
    var thumbsUp = document.createElement('button');
    thumbsUp.className = 'gtm-brain-feedback-btn';
    thumbsUp.innerHTML = '\\u2191 Helpful';
    thumbsUp.title = 'This was helpful';
    var thumbsDown = document.createElement('button');
    thumbsDown.className = 'gtm-brain-feedback-btn';
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
    scrollThread();
  }

  function addLoadingMessage(accountName) {
    var msg = document.createElement('div');
    msg.className = 'gtm-brain-msg gtm-brain-msg-loading';
    msg.textContent = accountName ? 'Gathering intelligence about ' + accountName + '...' : 'Thinking...';
    threadContainer.appendChild(msg);
    scrollThread();
  }

  function scrollThread() {
    threadContainer.scrollTop = threadContainer.scrollHeight;
  }

  function showError(msg) {
    var loading = threadContainer.querySelector('.gtm-brain-msg-loading');
    if (loading) loading.remove();
    errorContent.textContent = msg;
    errorBox.style.display = 'block';
    submitBtn.disabled = false;
  }

  function startNewChat() {
    threadContainer.innerHTML = '';
    currentSessionId = null;
    errorBox.style.display = 'none';
    queryEl.value = '';
    queryEl.focus();
  }

  // ─── Query execution ─────────────────────────────────────────
  function runQuery(forceRefresh) {
    var query = queryEl.value.trim();
    if (!query) { queryEl.focus(); return; }

    var accountId   = selectedAccount.id || '';
    var accountName = selectedAccount.name || '';

    // Show user message in thread
    addUserMessage(query);
    addLoadingMessage(accountName || null);
    queryEl.value = '';
    errorBox.style.display = 'none';
    submitBtn.disabled = true;
    collapseTiles();

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
      if (result.ok && result.json.success) {
        // Track session for follow-ups
        if (result.json.sessionId) currentSessionId = result.json.sessionId;
        addAIMessage(result.json.answer, result.json.context);
      } else {
        var loading = threadContainer.querySelector('.gtm-brain-msg-loading');
        if (loading) loading.remove();
        showError(result.json.error || result.json.message || 'Could not get an answer. Try rephrasing.');
      }
      submitBtn.disabled = false;
    })
    .catch(function(err) {
      var msg = 'Unable to connect. Check your connection and try again.';
      if (err.message && (err.message.indexOf('timeout') !== -1 || err.message.indexOf('network') !== -1)) {
        msg = 'Request timed out or network error. Please try again.';
      }
      showError(msg);
    });
  }

  submitBtn.addEventListener('click', function() { runQuery(false); });
  refreshBtn.addEventListener('click', function() { runQuery(true); });
  newChatBtn.addEventListener('click', startNewChat);
  queryEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') runQuery(false);
  });
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
