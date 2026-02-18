/**
 * GTM Brain Web Tab View
 * Full-service query UI for account intelligence — same backend as Obsidian plugin.
 * Okta session provides userEmail; accounts are searched via typeahead (/api/search-accounts).
 *
 * Layout: Claude-style chat interface
 *   - Slim header: title + New chat
 *   - Full-height scrollable chat area
 *   - Sticky footer: always-visible account search + query input + actions
 */

/**
 * Format markdown answer to HTML (matches plugin formatResponse)
 */
function formatResponse(text) {
  if (!text || typeof text !== 'string') return '';
  let html = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '');
  html = html.replace(/\n{3,}/g, '\n\n');
  html = html.replace(/^([•\-]\s+.+)\n\n(?=[•\-]\s+)/gm, '$1\n');
  html = html.replace(/^(#{1,3}\s+.+)\n\n/gm, '$1\n');
  html = html.replace(/^#{1,3}\s+.+\n+(?=#{1,3}\s|\s*$)/gm, '');
  html = html.replace(/^#{2,3}\s+(.+)$/gm, '</p><h3 class="gtm-brain-header">$1</h3><p>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^-\s+\[\s*\]\s+(.+)$/gm, '<li class="gtm-brain-todo">$1</li>');
  html = html.replace(/^-\s+\[x\]\s+(.+)$/gm, '<li class="gtm-brain-done">$1</li>');
  html = html.replace(/^[•\-]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/g, '<ul class="gtm-brain-list">$&</ul>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  // Clean <p> tags and <br> inside <ul> blocks
  html = html.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, function(m) {
    return m.replace(/<br\s*\/?>/g, '').replace(/<\/?p>/g, '');
  });
  // Strip <p> wrappers around block elements
  html = html.replace(/<p>\s*(<ul)/g, '$1');
  html = html.replace(/<\/ul>\s*<\/p>/g, '</ul>');
  html = html.replace(/<p>\s*(<h3)/g, '$1');
  html = html.replace(/<\/h3>\s*<\/p>/g, '</h3>');
  // Remove all spacing artifacts between block elements (order matters)
  // Step 1: Remove <p> and <br> artifacts between </h3> and <ul>/<h3>
  html = html.replace(/<\/h3>\s*(<\/?p>|<br\s*\/?>|\s)*\s*<(ul|h3)/g, '</h3><$2');
  // Step 2: Remove <p> and <br> artifacts between </ul> and <h3>/<ul>
  html = html.replace(/<\/ul>\s*(<\/?p>|<br\s*\/?>|\s)*\s*<(h3|ul)/g, '</ul><$2');
  // Step 3: Clean trailing <br> after </h3> and </ul>
  html = html.replace(/<\/h3>\s*(<br>\s*)+/g, '</h3>');
  html = html.replace(/<\/ul>\s*(<br>\s*)+/g, '</ul>');
  // Step 4: Clean leading <br> before <h3> and <ul>
  html = html.replace(/(<br>\s*)+<h3/g, '<h3');
  html = html.replace(/(<br>\s*)+<ul/g, '<ul');
  // Clean empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*<br>\s*<\/p>/g, '');
  html = html.replace(/(<br>\s*){2,}/g, '');
  html = html.replace(/^(<br>)+|(<br>)+$/g, '');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '');
  return html;
}

function generate(options = {}) {
  const { userName = 'User', userEmail = '' } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GTM Brain</title>
<style>
/* ── Reset & Shell ─────────────────────────────────────────── */
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f9fc; }
.gtm-shell { display: flex; flex-direction: column; height: 100vh; max-width: 800px; margin: 0 auto; }

/* ── Header ────────────────────────────────────────────────── */
.gtm-header {
  flex-shrink: 0; display: flex; align-items: center; gap: 12px;
  padding: 12px 20px; background: #fff;
  border-bottom: 1px solid #edf0f5; border-radius: 0 0 14px 14px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.03); z-index: 10;
}
.gtm-header-title { font-size: 1rem; font-weight: 600; color: #1f2937; flex: 1; }
.gtm-header-btn {
  font-size: 0.75rem; color: #6b7280; background: none;
  border: 1px solid #e8eaef; border-radius: 20px;
  padding: 5px 14px; cursor: pointer; white-space: nowrap; transition: all 0.15s;
}
.gtm-header-btn:hover { background: #f0f2ff; border-color: #8e99e1; color: #1f2937; }

/* ── Chat Area ─────────────────────────────────────────────── */
.gtm-chat-area { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 20px 20px 8px; scroll-behavior: smooth; }
#thread-container { display: flex; flex-direction: column; gap: 14px; min-height: 100%; justify-content: flex-end; }
#thread-container.has-messages { justify-content: flex-start; }

/* ── Welcome ───────────────────────────────────────────────── */
.gtm-welcome { padding: 24px 0 12px; text-align: center; }
.gtm-welcome-title { font-size: 1.25rem; font-weight: 500; color: #374151; margin-bottom: 4px; }
.gtm-welcome-sub { font-size: 0.8125rem; color: #9ca3af; margin-bottom: 16px; }
.gtm-dashboard-cards {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  max-width: 500px; margin: 0 auto 16px; text-align: left;
}
.gtm-dash-card {
  padding: 12px 14px; background: #fff; border: 1px solid #e8eaef;
  border-radius: 10px; cursor: pointer; transition: all 0.15s;
}
.gtm-dash-card:hover { border-color: #8e99e1; box-shadow: 0 2px 8px rgba(142,153,225,0.12); }
.gtm-dash-card-value { font-size: 1.25rem; font-weight: 700; color: #1f2937; }
.gtm-dash-card-label { font-size: 0.6875rem; color: #9ca3af; margin-top: 2px; }
.gtm-dash-card-sub { font-size: 0.6rem; color: #b0b5c3; margin-top: 2px; }
.gtm-dash-loading { font-size: 0.7rem; color: #b0b5c3; text-align: center; padding: 20px 0; }
.gtm-tile-grid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 600px; margin: 0 auto; }
.gtm-tile {
  padding: 6px 14px; font-size: 0.75rem;
  border: 1px solid #e8eaef; border-radius: 20px; background: #fff;
  cursor: pointer; color: #6b7280; transition: all 0.15s; white-space: nowrap;
}
.gtm-tile:hover { background: #f0f2ff; border-color: #8e99e1; color: #1f2937; }
.gtm-tile.disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Persistent Inline Tiles (after first query) ───────────── */
.gtm-inline-tiles {
  padding: 6px 0; text-align: center; animation: fadeIn 0.25s ease;
}
.gtm-inline-tiles-header {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  cursor: pointer; padding: 4px 0; color: #9ca3af; font-size: 0.6875rem;
  transition: color 0.15s;
}
.gtm-inline-tiles-header:hover { color: #6b7280; }
.gtm-inline-tiles-header svg { width: 10px; height: 10px; transition: transform 0.2s; }
.gtm-inline-tiles-header.collapsed svg { transform: rotate(-90deg); }
.gtm-inline-tiles-body { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; padding: 6px 0 2px; }
.gtm-inline-tiles-body.hidden { display: none; }

/* ── Messages ──────────────────────────────────────────────── */
.gtm-msg { padding: 14px 18px; border-radius: 14px; font-size: 0.9375rem; line-height: 1.65; max-width: 100%; animation: fadeIn 0.25s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.gtm-msg-user {
  background: #eef1fc; color: #1f2937; align-self: flex-end;
  border-bottom-right-radius: 4px; max-width: 80%;
}
.gtm-msg-ai {
  background: #fff; border: 1px solid #edf0f5; color: #374151;
  align-self: flex-start; border-bottom-left-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.gtm-msg-ai .gtm-brain-header {
  font-size: 0.8125rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
  margin: 20px 0 4px; padding-top: 14px;
  border-top: 1px solid #eef0f4; color: #374151;
}
.gtm-msg-ai .gtm-brain-header:first-child { margin-top: 0; padding-top: 0; border-top: none; }
.gtm-msg-ai .gtm-brain-list { margin: 3px 0 6px 18px; padding: 0; list-style: disc; }
.gtm-msg-ai .gtm-brain-list li { margin: 0; padding: 2px 0; line-height: 1.55; font-size: 0.875rem; }
.gtm-msg-ai .gtm-brain-list li strong { color: #111827; }
.gtm-msg-ai .gtm-brain-header + .gtm-brain-list { margin-top: 3px; }
.gtm-msg-ai .gtm-brain-header + p { margin-top: 3px; }
.gtm-msg-ai p + .gtm-brain-header { margin-top: 20px; }
.gtm-msg-ai p + .gtm-brain-list { margin-top: 3px; }
.gtm-msg-ai .gtm-brain-list + p { margin-top: 10px; }
.gtm-msg-ai .gtm-brain-list + .gtm-brain-header { margin-top: 20px; }
.gtm-msg-ai .gtm-brain-todo { list-style: none; margin-left: -18px; }
.gtm-msg-ai .gtm-brain-done { list-style: none; margin-left: -18px; text-decoration: line-through; color: #6b7280; }
.gtm-msg-ai p { margin: 4px 0; font-size: 0.875rem; line-height: 1.6; }
.gtm-msg-ai p:first-child { margin-top: 0; }
.gtm-msg-ai p:last-child { margin-bottom: 0; }
.gtm-msg-context { font-size: 0.7rem; color: #9ca3af; margin-top: 8px; }
.gtm-msg-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.gtm-msg-time { font-size: 0.6rem; color: #c5c5c5; }
.gtm-copy-btn {
  background: none; border: 1px solid #e8eaef; border-radius: 4px;
  padding: 2px 6px; font-size: 0.6rem; color: #9ca3af;
  cursor: pointer; transition: all 0.15s;
}
.gtm-copy-btn:hover { background: #f0f2ff; color: #6b7280; border-color: #8e99e1; }
.gtm-toast {
  position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
  background: #1f2937; color: #fff; padding: 8px 20px; border-radius: 8px;
  font-size: 0.8rem; z-index: 100; animation: fadeIn 0.2s ease;
  pointer-events: none;
}
.gtm-retry-btn {
  display: inline-block; margin-top: 8px; padding: 6px 16px;
  font-size: 0.8rem; font-weight: 600; color: #8e99e1;
  background: none; border: 1px solid #8e99e1; border-radius: 8px;
  cursor: pointer; transition: all 0.15s;
}
.gtm-retry-btn:hover { background: #f0f2ff; }
.gtm-filters-bar { font-size: 0.6rem; color: #b0b5c3; margin-top: 2px; }

/* Query autocomplete palette */
.gtm-autocomplete {
  position: absolute; bottom: 100%; left: 0; right: 60px;
  background: #fff; border: 1px solid #e0e3ea; border-radius: 10px;
  margin-bottom: 4px; max-height: 260px; overflow-y: auto;
  box-shadow: 0 -4px 16px rgba(0,0,0,0.08); display: none; z-index: 60;
}
.gtm-autocomplete.open { display: block; }
.gtm-ac-item {
  padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6;
  display: flex; align-items: center; gap: 8px; transition: background 0.1s;
}
.gtm-ac-item:last-child { border-bottom: none; }
.gtm-ac-item:hover, .gtm-ac-item.active { background: #f0f2ff; }
.gtm-ac-text { font-size: 0.8125rem; color: #1f2937; flex: 1; }
.gtm-ac-tag {
  font-size: 0.6rem; padding: 2px 6px; border-radius: 4px;
  font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; flex-shrink: 0;
}
.gtm-ac-tag-pipeline { background: #eef1fc; color: #6366f1; }
.gtm-ac-tag-customer { background: #ecfdf5; color: #059669; }
.gtm-ac-tag-bl { background: #fef3c7; color: #d97706; }
.gtm-ac-tag-account { background: #f3f4f6; color: #6b7280; }
.gtm-ac-tag-forecast { background: #fce7f3; color: #db2777; }

/* Loading (progressive) */
.gtm-msg-loading {
  background: #fff; border: 1px solid #edf0f5; color: #6b7280;
  padding: 14px 18px; border-radius: 14px; border-bottom-left-radius: 4px;
  align-self: flex-start; border-left: 3px solid #8e99e1;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.gtm-loading-step { display: flex; align-items: center; gap: 8px; font-size: 0.8125rem; }
.gtm-loading-dot { width: 6px; height: 6px; border-radius: 50%; background: #8e99e1; animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
.gtm-loading-steps-done { font-size: 0.7rem; color: #b0b5c3; margin-top: 4px; }

/* Account switch divider */
.gtm-switch-divider {
  display: flex; align-items: center; gap: 10px;
  font-size: 0.6875rem; color: #9ca3af; padding: 4px 0;
}
.gtm-switch-divider::before, .gtm-switch-divider::after {
  content: ''; flex: 1; height: 1px; background: #e8eaef;
}

/* Suggestions & feedback */
.gtm-suggestions-inline { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #f3f4f6; }
.gtm-suggestion-chip {
  font-size: 0.75rem; padding: 5px 12px;
  border: 1px solid #e8eaef; border-radius: 16px;
  background: #fafbfc; color: #4b5563; cursor: pointer; transition: all 0.15s;
}
.gtm-suggestion-chip:hover { background: #f0f2ff; border-color: #8e99e1; color: #1f2937; }
.gtm-feedback { display: flex; gap: 8px; margin-top: 6px; align-items: center; flex-wrap: wrap; }
.gtm-feedback-btn {
  font-size: 0.6875rem; padding: 2px 8px; border: none; border-radius: 4px;
  background: transparent; color: #b0b5c3; cursor: pointer; transition: all 0.15s;
}
.gtm-feedback-btn:hover { color: #4b5563; background: #f3f4f6; }
.gtm-feedback-btn:disabled { cursor: default; }
.gtm-feedback-cats {
  display: flex; gap: 4px; flex-wrap: wrap; animation: fadeIn 0.2s ease;
}
.gtm-feedback-cat {
  font-size: 0.625rem; padding: 2px 8px; border: 1px solid #e8eaef; border-radius: 12px;
  background: #fafbfc; color: #6b7280; cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.gtm-feedback-cat:hover { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
.gtm-error { padding: 12px 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; color: #b91c1c; font-size: 0.875rem; }

/* ── Footer ────────────────────────────────────────────────── */
.gtm-footer { flex-shrink: 0; padding: 0 20px 14px; background: #f8f9fc; z-index: 10; }
.gtm-footer-inner {
  background: #fff; border: 1px solid #e0e3ea; border-radius: 14px;
  padding: 10px 14px; box-shadow: 0 1px 6px rgba(0,0,0,0.06);
}

/* Account bar (always visible in footer) */
.gtm-acct-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; position: relative; }
.gtm-acct-search {
  flex: 1; padding: 7px 10px 7px 28px; font-size: 0.8125rem;
  border: 1px solid #e8eaef; border-radius: 8px; background: #fafbfc;
  color: #374151; outline: none; transition: all 0.15s;
}
.gtm-acct-search:focus { border-color: #8e99e1; background: #fff; box-shadow: 0 0 0 2px rgba(142,153,225,0.12); }
.gtm-acct-search-icon {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  width: 14px; height: 14px; color: #9ca3af; pointer-events: none;
}
.gtm-acct-search-icon svg { width: 100%; height: 100%; }
.gtm-acct-chip {
  display: inline-flex; align-items: center; gap: 6px;
  background: #eef1fc; border: 1px solid #c7cdee; border-radius: 20px;
  padding: 5px 10px 5px 12px; font-size: 0.8125rem; color: #1f2937;
  max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.gtm-acct-chip .chip-owner { color: #6b7280; font-weight: 400; }
.gtm-acct-chip-x {
  background: none; border: none; font-size: 0.875rem; color: #9ca3af;
  cursor: pointer; padding: 0 2px; line-height: 1; flex-shrink: 0;
}
.gtm-acct-chip-x:hover { color: #ef4444; }
.gtm-acct-results {
  position: absolute; bottom: 100%; left: 0; right: 0;
  background: #fff; border: 1px solid #e0e3ea; border-radius: 10px;
  margin-bottom: 4px; max-height: 280px; overflow-y: auto;
  box-shadow: 0 -4px 16px rgba(0,0,0,0.08); display: none; z-index: 60;
}
.gtm-acct-results.open { display: block; }
.gtm-acct-result { padding: 9px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.1s; }
.gtm-acct-result:last-child { border-bottom: none; }
.gtm-acct-result:hover { background: #f0f2ff; }
.gtm-acct-result-name { font-size: 0.8125rem; font-weight: 600; color: #1f2937; }
.gtm-acct-result-meta { font-size: 0.7rem; color: #6b7280; margin-top: 1px; }

/* Query row */
.gtm-query-row { display: flex; gap: 8px; align-items: flex-end; }
.gtm-query-wrap { flex: 1; position: relative; }
.gtm-query-input {
  width: 100%; padding: 9px 60px 9px 12px; font-size: 0.875rem;
  border: none; border-top: 1px solid #f0f2f5; border-radius: 0;
  background: transparent; outline: none; color: #1f2937;
}
.gtm-query-input::placeholder { color: #b0b5c3; }
.gtm-ask-btn {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
  padding: 5px 14px; font-size: 0.8125rem; font-weight: 600;
  background: #8e99e1; color: #fff; border: none; border-radius: 8px;
  cursor: pointer; transition: all 0.15s;
}
.gtm-ask-btn:hover { background: #7b86d0; }
.gtm-ask-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Footer actions */
.gtm-footer-actions { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; align-items: center; padding: 0 2px; }
.gtm-hero-btn {
  padding: 4px 12px; font-size: 0.7rem; font-weight: 600;
  background: #8e99e1; color: #fff; border: none; border-radius: 6px;
  cursor: pointer; transition: all 0.15s;
}
.gtm-hero-btn:hover { background: #7b86d0; }
.gtm-hero-btn.needs-account { opacity: 0.3; cursor: not-allowed; }
.gtm-hero-btn span { font-weight: 400; opacity: 0.8; margin-left: 3px; }
.gtm-quick-toggle {
  font-size: 0.65rem; color: #8e99e1; background: none; border: none;
  cursor: pointer; padding: 3px 5px;
}
.gtm-quick-toggle:hover { text-decoration: underline; }
.gtm-footer-meta { font-size: 0.6rem; color: #c5c5c5; margin-left: auto; }

/* Mobile responsive */
@media (max-width: 768px) {
  .gtm-shell { max-width: 100%; padding: 0; }
  .gtm-header { padding: 10px 14px; border-radius: 0; }
  .gtm-chat-area { padding: 14px 12px 6px; }
  .gtm-tile { padding: 10px 16px; font-size: 0.8125rem; min-height: 44px; display: flex; align-items: center; }
  .gtm-msg { padding: 12px 14px; font-size: 0.9rem; }
  .gtm-msg-user { max-width: 90%; }
  .gtm-acct-search { font-size: 0.9rem; padding: 10px 10px 10px 32px; }
  .gtm-query-input { font-size: 0.9rem; padding: 12px 60px 12px 12px; }
  .gtm-footer { padding: 0 10px 10px; padding-bottom: calc(10px + env(safe-area-inset-bottom)); }
  .gtm-footer-inner { padding: 8px 10px; }
  .gtm-welcome-title { font-size: 1.1rem; }
  .gtm-welcome { padding: 24px 0 12px; }
  .gtm-acct-results { max-height: 200px; }
  .gtm-autocomplete { max-height: 200px; }
  .gtm-suggestion-chip { padding: 8px 14px; font-size: 0.8rem; min-height: 36px; }
  .gtm-hero-btn { padding: 8px 14px; font-size: 0.75rem; }
}
</style>
</head>
<body>
<div class="gtm-shell">
  <header class="gtm-header">
    <div class="gtm-header-title">GTM Brain</div>
    <button type="button" id="new-chat-btn" class="gtm-header-btn">New chat</button>
  </header>

  <div class="gtm-chat-area" id="chat-area">
    <div id="thread-container"></div>
  </div>

  <footer class="gtm-footer">
    <div class="gtm-footer-inner">
      <div class="gtm-acct-bar" id="acct-bar">
        <span class="gtm-acct-search-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="m21 21-4.35-4.35"/></svg></span>
        <input type="text" id="account-search" class="gtm-acct-search" placeholder="Search for an account (optional)" autocomplete="off" />
        <div id="acct-chip-area"></div>
        <div id="search-results" class="gtm-acct-results"></div>
      </div>
      <div class="gtm-query-row">
        <div class="gtm-query-wrap">
          <input type="text" id="query" class="gtm-query-input" placeholder="Ask anything about an account, deal, or pipeline..." autocomplete="off" />
          <div id="query-autocomplete" class="gtm-autocomplete"></div>
          <button type="button" id="submit" class="gtm-ask-btn">Ask</button>
        </div>
      </div>
    </div>
    <div class="gtm-footer-actions">
      <button type="button" id="hero-btn" class="gtm-hero-btn needs-account" data-query="Give me a full account overview: deal status and stage, key contacts with titles, recent activity and meetings, identified pain points, and competitive landscape.">Account Overview<span>- full intel</span></button>
      <button type="button" id="tiles-toggle" class="gtm-quick-toggle" style="display:none;">Suggestions</button>
      <span class="gtm-footer-meta">Powered by Claude</span>
    </div>
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
    // Normalize whitespace: collapse 3+ newlines to 2
    html = html.replace(/\\n{3,}/g, '\\n\\n');
    // Remove blank lines between consecutive bullets
    html = html.replace(/^([\\u2022\\-]\\s+.+)\\n\\n(?=[\\u2022\\-]\\s+)/gm, '$1\\n');
    // Remove blank line after headers (header should sit directly above its content)
    html = html.replace(/^(#{1,3}\\s+.+)\\n\\n/gm, '$1\\n');
    // Remove empty headers (header followed by another header or nothing)
    html = html.replace(/^#{1,3}\\s+.+\\n+(?=#{1,3}\\s|\\s*$)/gm, '');
    // Convert headers to HTML
    html = html.replace(/^#{2,3}\\s+(.+)$/gm, '</p><h3 class="gtm-brain-header">$1</h3><p>');
    // Bold
    html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
    // Checkboxes
    html = html.replace(/^-\\s+\\[\\s*\\]\\s+(.+)$/gm, '<li class="gtm-brain-todo">$1</li>');
    html = html.replace(/^-\\s+\\[x\\]\\s+(.+)$/gm, '<li class="gtm-brain-done">$1</li>');
    // Bullets
    html = html.replace(/^[\\u2022\\-]\\s+(.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li[^>]*>.*?<\\/li>\\s*)+/g, '<ul class="gtm-brain-list">$&</ul>');
    // Paragraphs
    html = html.replace(/\\n\\n/g, '</p><p>');
    html = html.replace(/\\n/g, '<br>');
    // Strip <p> wrappers around block elements
    html = html.replace(/<p>\\s*(<ul)/g, '$1');
    html = html.replace(/<\\/ul>\\s*<\\/p>/g, '</ul>');
    html = html.replace(/<p>\\s*(<h3)/g, '$1');
    html = html.replace(/<\\/h3>\\s*<\\/p>/g, '</h3>');
    // Clean <p> tags and <br> inside <ul> blocks
    html = html.replace(/<ul[^>]*>[\\s\\S]*?<\\/ul>/g, function(match) {
      return match.replace(/<br\\s*\\/?>/g, '').replace(/<\\/?p>/g, '');
    });
    // Strip <p> wrappers around block elements
    html = html.replace(/<p>\\s*(<ul)/g, '$1');
    html = html.replace(/<\\/ul>\\s*<\\/p>/g, '</ul>');
    html = html.replace(/<p>\\s*(<h3)/g, '$1');
    html = html.replace(/<\\/h3>\\s*<\\/p>/g, '</h3>');
    // Remove all spacing artifacts between block elements (order matters)
    html = html.replace(/<\\/h3>\\s*(<\\/?p>|<br\\s*\\/?>|\\s)*\\s*<(ul|h3)/g, '</h3><$2');
    html = html.replace(/<\\/ul>\\s*(<\\/?p>|<br\\s*\\/?>|\\s)*\\s*<(h3|ul)/g, '</ul><$2');
    html = html.replace(/<\\/h3>\\s*(<br>\\s*)+/g, '</h3>');
    html = html.replace(/<\\/ul>\\s*(<br>\\s*)+/g, '</ul>');
    html = html.replace(/(<br>\\s*)+<h3/g, '<h3');
    html = html.replace(/(<br>\\s*)+<ul/g, '<ul');
    // Clean empty paragraphs
    html = html.replace(/<p>\\s*<\\/p>/g, '');
    html = html.replace(/<p>\\s*<br>\\s*<\\/p>/g, '');
    html = html.replace(/(<br>\\s*){2,}/g, '');
    html = html.replace(/^(<br>)+|(<br>)+$/g, '');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p><\\/p>/g, '');
    return html;
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
  var acctChipArea    = document.getElementById('acct-chip-area');
  var acctBar         = document.getElementById('acct-bar');
  var submitBtn       = document.getElementById('submit');
  var threadContainer = document.getElementById('thread-container');
  var chatArea        = document.getElementById('chat-area');
  var newChatBtn      = document.getElementById('new-chat-btn');
  var heroBtn         = document.getElementById('hero-btn');
  var tilesToggle     = document.getElementById('tiles-toggle');

  // ─── State ──────────────────────────────────────────────────
  var selectedAccount  = { id: '', name: '', owner: '' };
  var searchDebounce   = null;
  var searchController = null;
  var currentSessionId = null;
  var isQuerying       = false;
  var hasAsked         = false;
  var lastQueryTime    = 0;
  var loadingInterval  = null;
  var queryGeneration  = 0;

  // ─── Welcome ───────────────────────────────────────────────
  function renderWelcome() {
    threadContainer.innerHTML = '';
    threadContainer.classList.remove('has-messages');
    var welcome = document.createElement('div');
    welcome.id = 'welcome-panel';
    welcome.className = 'gtm-welcome';
    welcome.innerHTML =
      '<div class="gtm-welcome-title">GTM Brain</div>' +
      '<div class="gtm-welcome-sub">Your sales intelligence terminal. Ask about pipeline, accounts, deals, or contacts.</div>' +
      '<div id="dashboard-cards" class="gtm-dashboard-cards"><div class="gtm-dash-loading">Loading pipeline data...</div></div>' +
      '<div style="margin-top:12px;font-size:0.6875rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.4px;">Quick queries</div>' +
      '<div class="gtm-tile-grid" style="margin-top:6px;">' +
        '<button class="gtm-tile" data-query="What deals are late stage?">Late stage deals</button>' +
        '<button class="gtm-tile" data-query="What\\x27s our forecast?">Forecast</button>' +
        '<button class="gtm-tile" data-query="What\\x27s the weighted pipeline?">Weighted pipeline</button>' +
        '<button class="gtm-tile" data-query="What\\x27s targeting this month?">Targeting this month</button>' +
        '<button class="gtm-tile" data-query="What\\x27s the pipeline by product line?">By product line</button>' +
        '<button class="gtm-tile" data-query="How many customers do we have?">Customer count</button>' +
        '<button class="gtm-tile" data-query="What have we signed this quarter?">Signed this quarter</button>' +
        '<button class="gtm-tile" data-query="Which deals are stuck?">Stuck deals</button>' +
      '</div>' +
      '<div style="margin-top:12px;font-size:0.6875rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.4px;">Account-specific (select an account first)</div>' +
      '<div class="gtm-tile-grid" style="margin-top:6px;">' +
        '<button class="gtm-tile acct-tile" data-query="What\\x27s the deal status and current stage?">Deal status</button>' +
        '<button class="gtm-tile acct-tile" data-query="Who are the key contacts and stakeholders?">Key contacts</button>' +
        '<button class="gtm-tile acct-tile" data-query="What\\x27s the latest activity?">Latest activity</button>' +
        '<button class="gtm-tile acct-tile" data-query="Full meeting prep for this account.">Meeting prep</button>' +
        '<button class="gtm-tile acct-tile" data-query="What are the pain points?">Pain points</button>' +
        '<button class="gtm-tile acct-tile" data-query="What\\x27s the competitive landscape?">Competitive intel</button>' +
      '</div>';
    threadContainer.appendChild(welcome);
    wireUpTiles();
    loadDashboardCards();
    updateTileState();
  }

  function wireUpTiles() {
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
    threadContainer.classList.add('has-messages');
    if (!hasAsked) {
      hasAsked = true;
      // Insert persistent inline tiles above the thread instead of removing them
      ensureInlineTiles();
    }
  }

  function ensureInlineTiles() {
    if (document.getElementById('inline-tiles')) return;
    var panel = document.createElement('div');
    panel.id = 'inline-tiles';
    panel.className = 'gtm-inline-tiles';
    var acctTiles = [
      { label: 'Latest update', q: 'What\\x27s the latest update on this account?' },
      { label: 'Deal status', q: 'What\\x27s the deal status and current stage?' },
      { label: 'Key contacts', q: 'Who are the key contacts and stakeholders?' },
      { label: 'Pain points', q: 'What are the identified pain points?' },
      { label: 'Competitive intel', q: 'What\\x27s the competitive landscape?' },
      { label: 'Next steps', q: 'What are the next steps and target dates?' },
      { label: 'Meeting prep', q: 'Full meeting prep for this account.' },
      { label: 'Engagement history', q: 'What\\x27s the full engagement history?' }
    ];
    var crossTiles = [
      { label: 'Late stage deals', q: 'What deals are late stage in the pipeline?' },
      { label: 'Deals in negotiation', q: 'What deals are in negotiation?' },
      { label: 'Customer count', q: 'How many customers do we have?' },
      { label: 'Meetings this week', q: 'What accounts did we meet with this week?' }
    ];
    var headerHtml = '<div class="gtm-inline-tiles-header" id="inline-tiles-header">' +
      '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg>' +
      'Quick questions</div>';
    var bodyHtml = '<div class="gtm-inline-tiles-body" id="inline-tiles-body">';
    for (var i = 0; i < acctTiles.length; i++) {
      bodyHtml += '<button class="gtm-tile acct-tile" data-query="' + acctTiles[i].q + '">' + acctTiles[i].label + '</button>';
    }
    for (var j = 0; j < crossTiles.length; j++) {
      bodyHtml += '<button class="gtm-tile" data-query="' + crossTiles[j].q + '">' + crossTiles[j].label + '</button>';
    }
    bodyHtml += '</div>';
    panel.innerHTML = headerHtml + bodyHtml;
    threadContainer.insertBefore(panel, threadContainer.firstChild);

    // Toggle collapse
    document.getElementById('inline-tiles-header').addEventListener('click', function() {
      var body = document.getElementById('inline-tiles-body');
      var hdr = this;
      body.classList.toggle('hidden');
      hdr.classList.toggle('collapsed');
    });

    wireUpTiles();
    updateTileState();
  }

  // ─── Account Selection (inline, always visible) ────────────
  function clearSelection() {
    clearSuggestionChips();
    selectedAccount = { id: '', name: '', owner: '' };
    acctChipArea.innerHTML = '';
    acctChipArea.style.display = 'none';
    searchInput.style.display = '';
    document.querySelector('.gtm-acct-search-icon').style.display = '';
    searchInput.value = '';
    searchInput.focus();
    resultsBox.classList.remove('open');
    updateTileState();
  }

  function clearSuggestionChips() {
    var chips = threadContainer.querySelectorAll('.gtm-suggestions-inline');
    for (var i = 0; i < chips.length; i++) chips[i].remove();
  }

  function selectAccount(acc) {
    var prevName = selectedAccount.name;
    selectedAccount = { id: acc.id, name: acc.name, owner: acc.owner || '' };
    resultsBox.classList.remove('open');
    searchInput.value = '';
    searchInput.style.display = 'none';
    document.querySelector('.gtm-acct-search-icon').style.display = 'none';
    acctChipArea.style.display = '';
    acctChipArea.innerHTML =
      '<span class="gtm-acct-chip">' +
        '<strong>' + escapeHtml(acc.name) + '</strong>' +
        (acc.owner ? ' <span class="chip-owner">(' + escapeHtml(acc.owner) + ')</span>' : '') +
        ' <button type="button" class="gtm-acct-chip-x" title="Clear">&times;</button>' +
      '</span>';
    acctChipArea.querySelector('.gtm-acct-chip-x').addEventListener('click', clearSelection);

    currentSessionId = null;
    if (prevName && prevName !== acc.name && threadContainer.querySelector('.gtm-msg')) {
      clearSuggestionChips();
      var divider = document.createElement('div');
      divider.className = 'gtm-switch-divider';
      divider.textContent = 'Switched to ' + acc.name;
      threadContainer.appendChild(divider);
      scrollToElement(divider, 'end');
    }

    updateTileState();
    queryEl.focus();
  }

  // ─── Account Search (typeahead) ────────────────────────────
  function doSearch(term) {
    if (term.length < 2) { resultsBox.classList.remove('open'); resultsBox.innerHTML = ''; return; }
    if (searchController) searchController.abort();
    searchController = new AbortController();
    fetch('/api/search-accounts?q=' + encodeURIComponent(term), { credentials: 'same-origin', signal: searchController.signal })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var matches = data.matches || [];
        if (matches.length === 0) {
          resultsBox.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:0.8rem;">No accounts found</div>';
          resultsBox.classList.add('open');
          return;
        }
        var html = '';
        matches.forEach(function(m) {
          var meta = [];
          if (m.owner) meta.push('Owner: ' + escapeHtml(m.owner));
          if (m.customerType) meta.push(escapeHtml(m.customerType));
          if (m.industry) meta.push(escapeHtml(m.industry));
          var fuzzyTag = m.fuzzyMatch ? '<span style="font-size:0.6rem;color:#8e99e1;margin-left:6px;">fuzzy match</span>' : '';
          html += '<div class="gtm-acct-result" data-id="' + m.id + '" data-name="' + escapeHtml(m.name) + '" data-owner="' + escapeHtml(m.owner || '') + '">' +
            '<div class="gtm-acct-result-name">' + escapeHtml(m.name) + fuzzyTag + '</div>' +
            (meta.length ? '<div class="gtm-acct-result-meta">' + meta.join(' &bull; ') + '</div>' : '') +
          '</div>';
        });
        resultsBox.innerHTML = html;
        resultsBox.classList.add('open');
        resultsBox.querySelectorAll('.gtm-acct-result').forEach(function(card) {
          card.addEventListener('click', function() {
            selectAccount({ id: this.dataset.id, name: this.dataset.name, owner: this.dataset.owner });
          });
        });
      })
      .catch(function(err) {
        if (err && err.name === 'AbortError') return;
        resultsBox.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:0.8rem;">Search error</div>';
        resultsBox.classList.add('open');
      });
  }

  searchInput.addEventListener('input', function() {
    clearTimeout(searchDebounce);
    var val = this.value.trim();
    searchDebounce = setTimeout(function() { doSearch(val); }, 300);
  });
  searchInput.addEventListener('focus', function() {
    if (this.value.trim().length >= 2) doSearch(this.value.trim());
  });
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#acct-bar')) resultsBox.classList.remove('open');
  });

  // ─── Scroll ────────────────────────────────────────────────
  function scrollToElement(el, block) {
    if (!el) return;
    setTimeout(function() {
      el.scrollIntoView({ behavior: 'smooth', block: block || 'start' });
    }, 60);
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

  function addLoadingMessage(accountName, queryText) {
    var msg = document.createElement('div');
    msg.className = 'gtm-msg gtm-msg-loading';
    var q = (queryText || '').toLowerCase();
    var phases;
    var an = accountName || '';

    // Intent-specific loading sequences — each query type gets unique phases
    if (/forecast|commit|midpoint|weighted pipeline|weighted acv/i.test(q)) {
      phases = ['Querying AI-enabled forecast data...', 'Calculating commit and weighted metrics...', 'Breaking down by Business Lead...', 'Building forecast summary...'];
    } else if (/signed this|what have we signed|revenue signed|closed won/i.test(q)) {
      phases = ['Scanning closed-won deals...', 'Calculating signed revenue...', 'Checking recent closings...', 'Building revenue summary...'];
    } else if (/targeting this|targeting q1|deals targeting/i.test(q)) {
      phases = ['Querying deals targeting close...', 'Ranking by ACV...', 'Checking target dates...', 'Building target list...'];
    } else if (/pipeline by (product|solution)|product breakdown|solution breakdown/i.test(q)) {
      phases = ['Scanning pipeline by product line...', 'Aggregating solution buckets...', 'Calculating mix percentages...', 'Building product breakdown...'];
    } else if (/pipeline by sales type|new business|expansion|renewal/i.test(q)) {
      phases = ['Scanning pipeline by sales type...', 'Grouping New Business, Expansion, Renewal...', 'Building sales type breakdown...'];
    } else if (/loi|commitment deals/i.test(q)) {
      phases = ['Querying LOI deals...', 'Loading commitment data...', 'Ranking by close date...', 'Building LOI summary...'];
    } else if (/arr|recurring revenue/i.test(q)) {
      phases = ['Querying ARR contracts...', 'Loading recurring revenue data...', 'Building ARR summary...'];
    } else if (/stuck|slow|stale|stalled/i.test(q)) {
      phases = ['Scanning deals by days in stage...', 'Identifying stuck opportunities...', 'Ranking by staleness...', 'Building stuck deals report...'];
    } else if (/added to pipeline|new pipeline|deals added/i.test(q)) {
      phases = ['Scanning recently created opportunities...', 'Filtering this week...', 'Building new pipeline list...'];
    } else if (/overview|full account|engagement|history/i.test(q)) {
      phases = an ? ['Loading full profile for ' + an + '...', 'Gathering deals, contacts, and activity...', 'Reading meeting history...', 'Building overview...'] : ['Building account overview...', 'Aggregating data...', 'Synthesizing...'];
    } else if (/pain point|challenge|problem/i.test(q)) {
      phases = ['Scanning account intelligence...', 'Loading pain points data...', 'Synthesizing findings...'];
    } else if (/competitive|competitor|landscape/i.test(q)) {
      phases = ['Checking competitive intelligence...', 'Loading market context...', 'Building picture...'];
    } else if (/next step|action|follow up|target date/i.test(q)) {
      phases = ['Loading open tasks...', 'Checking opportunity next steps...', 'Building action list...'];
    } else if (/late stage|pipeline|deals|closing|negotiation|proposal|pilot|open (deals|opportunities)|active pipeline|total pipeline/i.test(q)) {
      phases = ['Querying active pipeline (' + (q.includes('late') ? 'S3+S4+S5' : 'all stages') + ')...', 'Filtering and ranking by ACV...', 'Grouping by stage...', 'Building pipeline summary...'];
    } else if (/customer|logo|how many/i.test(q)) {
      phases = ['Counting customer accounts...', 'Grouping by type (MSA, LOI, Pilot)...', 'Building breakdown...'];
    } else if (/contact|decision maker|stakeholder|who are|clo|general counsel/i.test(q)) {
      phases = an ? ['Loading contacts for ' + an + '...', 'Ranking by title seniority...', 'Identifying decision makers...'] : ['Searching contacts across accounts...', 'Filtering by title...', 'Building list...'];
    } else if (/meeting|met with|prep/i.test(q)) {
      phases = an ? ['Loading calendar for ' + an + '...', 'Reading meeting history...', 'Pulling recent activity...'] : ['Scanning meeting activity...', 'Matching to accounts...', 'Building timeline...'];
    } else if (/accounts does|book|own/i.test(q)) {
      phases = ['Looking up BL account assignments...', 'Loading portfolio and pipeline...', 'Compiling results...'];
    } else if (an) {
      phases = ['Searching Salesforce for ' + an + '...', 'Loading contacts, deals, activity...', 'Reading meeting notes...', 'Synthesizing insights...'];
    } else {
      phases = ['Processing your question...', 'Searching across data sources...', 'Analyzing results...', 'Synthesizing insights...'];
    }
    var currentPhase = 0;
    var completedHtml = '';

    function renderPhase() {
      msg.innerHTML =
        (completedHtml ? '<div class="gtm-loading-steps-done">' + completedHtml + '</div>' : '') +
        '<div class="gtm-loading-step"><span class="gtm-loading-dot"></span> ' + phases[currentPhase] + '</div>';
    }

    renderPhase();
    threadContainer.appendChild(msg);
    scrollToElement(msg, 'end');

    loadingInterval = setInterval(function() {
      if (currentPhase < phases.length - 1) {
        completedHtml += (completedHtml ? ' &rarr; ' : '') + phases[currentPhase].replace('...', '');
        currentPhase++;
        renderPhase();
      }
    }, 1000);
  }

  function clearLoadingInterval() {
    if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = null; }
  }

  function addAIMessage(answer, context, queryAccount) {
    clearLoadingInterval();
    var loading = threadContainer.querySelector('.gtm-msg-loading');
    if (loading) loading.remove();

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

    // Header: timestamp + copy button
    var headerDiv = document.createElement('div');
    headerDiv.className = 'gtm-msg-header';
    var timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    headerDiv.innerHTML = '<span class="gtm-msg-time">' + timeStr + '</span>';
    var copyBtn = document.createElement('button');
    copyBtn.className = 'gtm-copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = function() {
      navigator.clipboard.writeText(mainAnswer).then(function() {
        copyBtn.textContent = 'Copied';
        setTimeout(function() { copyBtn.textContent = 'Copy'; }, 1500);
      });
    };
    headerDiv.appendChild(copyBtn);
    msg.appendChild(headerDiv);

    var contentDiv = document.createElement('div');
    contentDiv.innerHTML = formatAnswer(mainAnswer);
    msg.appendChild(contentDiv);

    if (context) {
      var parts = [];
      if (context.accountName) {
        var acctLabel = context.accountName;
        if (context.owner) acctLabel += ' (' + context.owner + ')';
        parts.push(acctLabel);
      }
      var typeLabels = {
        'existing_customer': 'Existing Customer',
        'active_pipeline': 'Active Pipeline',
        'historical': 'Historical',
        'cold': 'Net New'
      };
      if (context.accountType && typeLabels[context.accountType]) {
        parts.push(typeLabels[context.accountType]);
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

    // Show intent classification (from backend response)
    if (context && context.intent) {
      var intentLabels = {
        'PRE_MEETING': 'Meeting Prep', 'DEAL_STATUS': 'Deal Status', 'STAKEHOLDERS': 'Stakeholders',
        'HISTORY': 'History', 'NEXT_STEPS': 'Next Steps', 'PAIN_POINTS': 'Pain Points',
        'COMPETITIVE': 'Competitive Intel', 'PIPELINE_OVERVIEW': 'Pipeline', 'OWNER_ACCOUNTS': 'Account Ownership',
        'MEETING_ACTIVITY': 'Meeting Activity', 'ACCOUNT_LOOKUP': 'Account Lookup', 'GENERAL': 'General'
      };
      var intentDiv = document.createElement('div');
      intentDiv.style.cssText = 'font-size:0.6rem;color:#b0b5c3;margin-top:2px;';
      intentDiv.textContent = 'Interpreted as: ' + (intentLabels[context.intent] || context.intent);
      msg.appendChild(intentDiv);
    }

    if (suggestions.length > 0) {
      var suggestDiv = document.createElement('div');
      suggestDiv.className = 'gtm-suggestions-inline';
      var boundAcct = queryAccount || { id: selectedAccount.id, name: selectedAccount.name, owner: selectedAccount.owner };
      for (var s = 0; s < Math.min(suggestions.length, 3); s++) {
        (function(text, acct) {
          if (/\\[.*?\\]/.test(text)) return;
          var chip = document.createElement('button');
          chip.className = 'gtm-suggestion-chip';
          chip.textContent = text;
          chip.onclick = function() {
            if (acct.name && selectedAccount.name !== acct.name) {
              selectAccount(acct);
            }
            queryEl.value = text; queryEl.focus(); runQuery(false);
          };
          suggestDiv.appendChild(chip);
        })(suggestions[s], boundAcct);
      }
      if (suggestDiv.children.length > 0) msg.appendChild(suggestDiv);
    }

    var feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'gtm-feedback';
    var thumbsUp = document.createElement('button');
    thumbsUp.className = 'gtm-feedback-btn';
    thumbsUp.innerHTML = '\\u2191 Helpful';
    var thumbsDown = document.createElement('button');
    thumbsDown.className = 'gtm-feedback-btn';
    thumbsDown.innerHTML = '\\u2193 Not helpful';

    function sendFeedback(rating, btn, category) {
      btn.disabled = true; btn.style.opacity = '1'; btn.style.fontWeight = '600';
      btn.style.color = rating === 'helpful' ? '#059669' : '#dc2626';
      var payload = {
        query: answer.substring(0, 100), answerSnippet: mainAnswer.substring(0, 300),
        accountName: (context && context.accountName) || selectedAccount.name || '',
        accountId: (context && context.accountId) || selectedAccount.id || '',
        userEmail: userEmail, sessionId: currentSessionId || '', rating: rating
      };
      if (category) payload.category = category;
      if (context && context.accountType) payload.accountType = context.accountType;
      fetch('/api/intelligence/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify(payload)
      }).catch(function() {});
    }
    thumbsUp.onclick = function() { sendFeedback('helpful', thumbsUp); thumbsDown.style.display = 'none'; };
    thumbsDown.onclick = function() {
      thumbsUp.style.display = 'none';
      thumbsDown.disabled = true; thumbsDown.style.opacity = '1'; thumbsDown.style.fontWeight = '600'; thumbsDown.style.color = '#dc2626';
      // Show category pills inline
      var catsDiv = document.createElement('div');
      catsDiv.className = 'gtm-feedback-cats';
      var cats = [
        { id: 'inaccurate', label: 'Inaccurate data' },
        { id: 'missing', label: 'Missing info' },
        { id: 'format', label: 'Wrong format' },
        { id: 'irrelevant', label: 'Not relevant' }
      ];
      cats.forEach(function(cat) {
        var pill = document.createElement('button');
        pill.className = 'gtm-feedback-cat';
        pill.textContent = cat.label;
        pill.onclick = function() {
          sendFeedback('not_helpful', thumbsDown, cat.id);
          catsDiv.innerHTML = '<span style="font-size:0.625rem;color:#9ca3af;">Thanks for the feedback</span>';
        };
        catsDiv.appendChild(pill);
      });
      feedbackDiv.appendChild(catsDiv);
    };
    feedbackDiv.appendChild(thumbsUp);
    feedbackDiv.appendChild(thumbsDown);
    msg.appendChild(feedbackDiv);

    threadContainer.appendChild(msg);

    // Scroll to the USER question (not the AI response) so question is visible at top
    var prevUserMsg = msg.previousElementSibling;
    while (prevUserMsg && !prevUserMsg.classList.contains('gtm-msg-user')) {
      prevUserMsg = prevUserMsg.previousElementSibling;
    }
    scrollToElement(prevUserMsg || msg, 'start');
    queryEl.focus();
  }

  var lastQueryText = '';
  function showError(text) {
    clearLoadingInterval();
    var loading = threadContainer.querySelector('.gtm-msg-loading');
    if (loading) loading.remove();
    var errMsg = document.createElement('div');
    errMsg.className = 'gtm-error';
    errMsg.innerHTML = escapeHtml(text);
    var retryBtn = document.createElement('button');
    retryBtn.className = 'gtm-retry-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.onclick = function() {
      errMsg.remove();
      if (lastQueryText) { queryEl.value = lastQueryText; runQuery(true); }
    };
    errMsg.appendChild(retryBtn);
    threadContainer.appendChild(errMsg);
    scrollToElement(errMsg, 'end');
    isQuerying = false;
    submitBtn.disabled = false;
  }

  function startNewChat() {
    clearLoadingInterval();
    queryGeneration++;
    threadContainer.innerHTML = '';
    currentSessionId = null;
    hasAsked = false;
    isQuerying = false;
    tilesToggle.style.display = 'none';
    renderWelcome();
    queryEl.value = '';
    queryEl.focus();
  }

  // ─── Query execution ───────────────────────────────────────
  function runQuery(forceRefresh) {
    var query = queryEl.value.trim();
    if (!query) { queryEl.focus(); return; }
    if (isQuerying) return;
    var now = Date.now();
    if (now - lastQueryTime < 500) return;
    lastQueryTime = now;
    lastQueryText = query;
    isQuerying = true;

    var accountId   = selectedAccount.id || '';
    var accountName = selectedAccount.name || '';
    var queryAccount = { id: accountId, name: accountName, owner: selectedAccount.owner };

    queryGeneration++;
    var myGeneration = queryGeneration;

    addUserMessage(query);
    addLoadingMessage(accountName || null, query);
    queryEl.value = '';
    submitBtn.disabled = true;

    var payload = { query: query, accountId: accountId, accountName: accountName, userEmail: userEmail };
    if (forceRefresh) payload.forceRefresh = true;
    if (currentSessionId) payload.sessionId = currentSessionId;

    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 30000);

    fetch('/api/intelligence/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', signal: controller.signal,
      body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, json: j }; }); })
    .then(function(result) {
      if (myGeneration !== queryGeneration) return;
      isQuerying = false;
      if (result.ok && result.json.success) {
        if (result.json.sessionId) currentSessionId = result.json.sessionId;
        addAIMessage(result.json.answer, result.json.context, queryAccount);
      } else {
        showError(result.json.error || result.json.message || 'Could not get an answer. Try rephrasing.');
      }
      submitBtn.disabled = false;
    })
    .catch(function(err) {
      if (myGeneration !== queryGeneration) return;
      isQuerying = false;
      submitBtn.disabled = false;
      if (err.name === 'AbortError') {
        showError('Request timed out after 30 seconds. Try a simpler question or select a specific account.');
      } else {
        showError('Unable to connect. Check your connection and try again.');
      }
    })
    .finally(function() { clearTimeout(timeoutId); });
  }

  // ─── Event wiring ──────────────────────────────────────────
  heroBtn.addEventListener('click', function() {
    if (this.classList.contains('needs-account') || isQuerying) return;
    queryEl.value = this.getAttribute('data-query');
    runQuery(false);
  });
  tilesToggle.addEventListener('click', function() {
    var wp = document.getElementById('welcome-panel');
    if (wp) { wp.remove(); this.textContent = 'Show suggestions'; }
    else {
      var panel = document.createElement('div');
      panel.id = 'welcome-panel';
      panel.className = 'gtm-welcome';
      panel.innerHTML =
        '<div class="gtm-tile-grid">' +
          '<button class="gtm-tile acct-tile" data-query="What\\x27s the latest update on this account?">Latest update</button>' +
          '<button class="gtm-tile acct-tile" data-query="What\\x27s the deal status?">Deal status</button>' +
          '<button class="gtm-tile acct-tile" data-query="Who are the key contacts?">Key contacts</button>' +
          '<button class="gtm-tile acct-tile" data-query="What are the pain points?">Pain points</button>' +
          '<button class="gtm-tile acct-tile" data-query="What\\x27s the competitive landscape?">Competitive intel</button>' +
          '<button class="gtm-tile acct-tile" data-query="What are the next steps?">Next steps</button>' +
        '</div>';
      threadContainer.insertBefore(panel, threadContainer.firstChild);
      wireUpTiles(); updateTileState();
      this.textContent = 'Hide suggestions';
    }
  });
  submitBtn.addEventListener('click', function() { runQuery(false); });
  newChatBtn.addEventListener('click', startNewChat);

  // ─── Dashboard Cards ───────────────────────────────────────
  function loadDashboardCards() {
    fetch('/api/pipeline-health', { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(h) {
        var el = document.getElementById('dashboard-cards');
        if (!el) return;
        var fmtM = function(v) { return '$' + ((v || 0) / 1000000).toFixed(1) + 'M'; };
        var stageHtml = '';
        if (h.byStage) {
          var stages = Object.entries(h.byStage).sort(function(a, b) { return b[1].acv - a[1].acv; });
          stageHtml = stages.map(function(s) { return '<span style="font-size:0.6rem;color:#6b7280;">' + s[0].replace('Stage ', 'S').split(' - ')[0] + ': ' + s[1].count + '</span>'; }).join(' · ');
        }
        el.innerHTML =
          '<div class="gtm-dash-card" data-query="What\\x27s the total pipeline?">' +
            '<div class="gtm-dash-card-value">' + fmtM(h.totalAcv) + '</div>' +
            '<div class="gtm-dash-card-label">' + (h.totalOpps || 0) + ' Active Opportunities</div>' +
            (stageHtml ? '<div class="gtm-dash-card-sub">' + stageHtml + '</div>' : '') +
          '</div>' +
          '<div class="gtm-dash-card" data-query="What deals are late stage?">' +
            '<div class="gtm-dash-card-value">' + (h.lateStageCount || 0) + ' Late Stage</div>' +
            '<div class="gtm-dash-card-label">' + fmtM(h.lateStageAcv) + ' ACV (S3+S4+S5)</div>' +
          '</div>' +
          '<div class="gtm-dash-card" data-query="How many customers do we have?">' +
            '<div class="gtm-dash-card-value">' + (h.customerCount || 0) + ' Customers</div>' +
            '<div class="gtm-dash-card-label">Active logos</div>' +
          '</div>' +
          '<div class="gtm-dash-card" data-query="What\\x27s our forecast?">' +
            '<div class="gtm-dash-card-value">' + fmtM(h.forecast?.midpoint) + '</div>' +
            '<div class="gtm-dash-card-label">AI-Enabled Midpoint</div>' +
            '<div class="gtm-dash-card-sub">Commit ' + fmtM(h.forecast?.commitNet) + ' · Weighted ' + fmtM(h.forecast?.weightedNet) + '</div>' +
          '</div>';
        el.querySelectorAll('.gtm-dash-card').forEach(function(card) {
          card.addEventListener('click', function() {
            queryEl.value = this.dataset.query;
            runQuery(false);
          });
        });
      })
      .catch(function() {
        var el = document.getElementById('dashboard-cards');
        if (el) el.innerHTML = '';
      });
  }

  // ─── Query Autocomplete Palette ────────────────────────────
  var queryCatalog = [
    { text: 'What deals are late stage?', tag: 'Pipeline', tagClass: 'gtm-ac-tag-pipeline' },
    { text: 'What deals are in negotiation?', tag: 'Pipeline', tagClass: 'gtm-ac-tag-pipeline' },
    { text: 'What deals are in proposal?', tag: 'Pipeline', tagClass: 'gtm-ac-tag-pipeline' },
    { text: 'What\\'s the total pipeline?', tag: 'Pipeline', tagClass: 'gtm-ac-tag-pipeline' },
    { text: 'What\\'s the weighted pipeline?', tag: 'Pipeline', tagClass: 'gtm-ac-tag-pipeline' },
    { text: 'What\\'s targeting this month?', tag: 'Pipeline', tagClass: 'gtm-ac-tag-pipeline' },
    { text: 'What\\'s targeting this quarter?', tag: 'Pipeline', tagClass: 'gtm-ac-tag-pipeline' },
    { text: 'What\\'s the pipeline by product line?', tag: 'Pipeline', tagClass: 'gtm-ac-tag-pipeline' },
    { text: 'What\\'s the pipeline by sales type?', tag: 'Pipeline', tagClass: 'gtm-ac-tag-pipeline' },
    { text: 'What was added to pipeline this week?', tag: 'Pipeline', tagClass: 'gtm-ac-tag-pipeline' },
    { text: 'Which deals are stuck?', tag: 'Pipeline', tagClass: 'gtm-ac-tag-pipeline' },
    { text: 'Late stage contracting deals', tag: 'Pipeline', tagClass: 'gtm-ac-tag-pipeline' },
    { text: 'What\\'s our forecast?', tag: 'Forecast', tagClass: 'gtm-ac-tag-forecast' },
    { text: 'What have we signed this quarter?', tag: 'Forecast', tagClass: 'gtm-ac-tag-forecast' },
    { text: 'What LOIs have we signed?', tag: 'Forecast', tagClass: 'gtm-ac-tag-forecast' },
    { text: 'What ARR deals have closed?', tag: 'Forecast', tagClass: 'gtm-ac-tag-forecast' },
    { text: 'How many customers do we have?', tag: 'Customers', tagClass: 'gtm-ac-tag-customer' },
    { text: 'How many logos do we have?', tag: 'Customers', tagClass: 'gtm-ac-tag-customer' },
    { text: 'What accounts did we meet with this week?', tag: 'Meetings', tagClass: 'gtm-ac-tag-customer' },
    { text: 'What accounts does Riley own?', tag: 'BL Book', tagClass: 'gtm-ac-tag-bl' },
    { text: 'What accounts does Julie own?', tag: 'BL Book', tagClass: 'gtm-ac-tag-bl' },
    { text: 'What accounts does Asad own?', tag: 'BL Book', tagClass: 'gtm-ac-tag-bl' },
    { text: 'What accounts does Olivia own?', tag: 'BL Book', tagClass: 'gtm-ac-tag-bl' },
    { text: 'What accounts does Nathan own?', tag: 'BL Book', tagClass: 'gtm-ac-tag-bl' },
    { text: 'What accounts does Conor own?', tag: 'BL Book', tagClass: 'gtm-ac-tag-bl' },
    { text: 'What\\'s the deal status?', tag: 'Account', tagClass: 'gtm-ac-tag-account', needsAccount: true },
    { text: 'Who are the key contacts?', tag: 'Account', tagClass: 'gtm-ac-tag-account', needsAccount: true },
    { text: 'What\\'s the latest activity?', tag: 'Account', tagClass: 'gtm-ac-tag-account', needsAccount: true },
    { text: 'When were they signed?', tag: 'Account', tagClass: 'gtm-ac-tag-account', needsAccount: true },
    { text: 'What products do they use?', tag: 'Account', tagClass: 'gtm-ac-tag-account', needsAccount: true },
    { text: 'What are the pain points?', tag: 'Account', tagClass: 'gtm-ac-tag-account', needsAccount: true },
    { text: 'What\\'s the competitive landscape?', tag: 'Account', tagClass: 'gtm-ac-tag-account', needsAccount: true },
    { text: 'Full meeting prep', tag: 'Account', tagClass: 'gtm-ac-tag-account', needsAccount: true },
  ];

  var acDropdown = document.getElementById('query-autocomplete');
  var acActiveIdx = -1;

  function updateAutocomplete() {
    var val = queryEl.value.trim().toLowerCase();
    if (val.length < 2) { acDropdown.classList.remove('open'); return; }
    var hasAccount = !!(selectedAccount.id || selectedAccount.name);
    var matches = queryCatalog.filter(function(item) {
      if (item.needsAccount && !hasAccount) return false;
      return item.text.toLowerCase().includes(val);
    }).slice(0, 6);
    if (matches.length === 0) { acDropdown.classList.remove('open'); return; }
    acActiveIdx = -1;
    acDropdown.innerHTML = matches.map(function(item, i) {
      return '<div class="gtm-ac-item" data-idx="' + i + '" data-query="' + escapeHtml(item.text) + '">' +
        '<span class="gtm-ac-text">' + escapeHtml(item.text) + '</span>' +
        '<span class="gtm-ac-tag ' + item.tagClass + '">' + item.tag + '</span>' +
      '</div>';
    }).join('');
    acDropdown.classList.add('open');
    acDropdown.querySelectorAll('.gtm-ac-item').forEach(function(el) {
      el.addEventListener('click', function() {
        queryEl.value = this.dataset.query;
        acDropdown.classList.remove('open');
        runQuery(false);
      });
    });
  }

  queryEl.addEventListener('input', function() { updateAutocomplete(); });
  queryEl.addEventListener('keydown', function(e) {
    if (!acDropdown.classList.contains('open')) {
      if (e.key === 'Enter') runQuery(false);
      return;
    }
    var items = acDropdown.querySelectorAll('.gtm-ac-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      acActiveIdx = Math.min(acActiveIdx + 1, items.length - 1);
      items.forEach(function(el, i) { el.classList.toggle('active', i === acActiveIdx); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      acActiveIdx = Math.max(acActiveIdx - 1, 0);
      items.forEach(function(el, i) { el.classList.toggle('active', i === acActiveIdx); });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (acActiveIdx >= 0 && items[acActiveIdx]) {
        queryEl.value = items[acActiveIdx].dataset.query;
        acDropdown.classList.remove('open');
        runQuery(false);
      } else {
        acDropdown.classList.remove('open');
        runQuery(false);
      }
    } else if (e.key === 'Escape') {
      acDropdown.classList.remove('open');
    }
  });
  queryEl.addEventListener('blur', function() {
    setTimeout(function() { acDropdown.classList.remove('open'); }, 200);
  });

  // ─── Init ──────────────────────────────────────────────────
  acctChipArea.style.display = 'none';
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

module.exports = { generate, formatResponse };
