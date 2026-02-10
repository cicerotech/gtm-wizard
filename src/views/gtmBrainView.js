/**
 * GTM Brain Web Tab View
 * Full-service query UI for account intelligence — same backend as Obsidian plugin.
 * Okta session provides userEmail; accounts are server-injected for the selector.
 */

/**
 * Format markdown answer to HTML (matches plugin formatResponse)
 */
function formatResponse(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/^#{2,3}\s+(.+)$/gm, '<h3 class="gtm-brain-header">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[•\-]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^-\s+\[\s*\]\s+(.+)$/gm, '<li class="gtm-brain-todo">$1</li>')
    .replace(/^-\s+\[x\]\s+(.+)$/gm, '<li class="gtm-brain-done">$1</li>')
    .replace(/(<li[^>]*>.*?<\/li>\s*)+/g, '<ul class="gtm-brain-list">$&</ul>')
    .replace(/\n{2,}/g, '\n')
    .replace(/\n/g, '<br>');
}

/**
 * Generate HTML for the GTM Brain tab
 * @param {object} options
 * @param {string} options.userName - Display name
 * @param {string} options.userEmail - User email (for API)
 * @param {Array<{id:string,name:string}>} options.accounts - Owned accounts for dropdown
 */
function generate(options = {}) {
  const { userName = 'User', userEmail = '', accounts = [] } = options;
  const accountsJson = JSON.stringify(accounts);

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
.gtm-brain-select-wrap { min-width: 200px; }
.gtm-brain-select-wrap label { display: block; font-size: 0.75rem; font-weight: 500; color: #6b7280; margin-bottom: 4px; }
.gtm-brain-select { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 0.875rem; background: #fff; }
.gtm-brain-input-wrap { flex: 1; min-width: 240px; }
.gtm-brain-input-wrap label { display: block; font-size: 0.75rem; font-weight: 500; color: #6b7280; margin-bottom: 4px; }
.gtm-brain-input { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 0.875rem; }
.gtm-brain-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.gtm-brain-chip { padding: 6px 12px; font-size: 0.8125rem; border: 1px solid #e5e7eb; border-radius: 20px; background: #fff; cursor: pointer; color: #4b5563; }
.gtm-brain-chip:hover { background: #eef1fc; border-color: #8e99e1; color: #1f2937; }
.gtm-brain-submit { margin-top: 12px; padding: 10px 20px; font-size: 0.875rem; font-weight: 500; background: #8e99e1; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
.gtm-brain-submit:hover { background: #7b86d0; }
.gtm-brain-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.gtm-brain-hint { font-size: 0.75rem; color: #9ca3af; margin-top: 6px; }
.gtm-brain-response { margin-top: 24px; padding: 20px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; display: none; }
.gtm-brain-response.visible { display: block; }
.gtm-brain-answer { font-size: 0.9375rem; line-height: 1.6; color: #374151; }
.gtm-brain-answer .gtm-brain-header { font-size: 1rem; margin: 14px 0 6px; color: #1f2937; }
.gtm-brain-answer .gtm-brain-header:first-child { margin-top: 0; }
.gtm-brain-answer .gtm-brain-list { margin: 8px 0 8px 16px; }
.gtm-brain-answer .gtm-brain-todo { list-style: none; margin-left: -16px; }
.gtm-brain-answer .gtm-brain-done { list-style: none; margin-left: -16px; text-decoration: line-through; color: #6b7280; }
.gtm-brain-context { font-size: 0.75rem; color: #6b7280; margin-top: 12px; padding-top: 12px; border-top: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; }
.gtm-brain-refresh { font-size: 0.75rem; color: #8e99e1; background: none; border: none; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.gtm-brain-refresh:hover { background: #eef1fc; color: #6b73c4; }
.gtm-brain-loading { padding: 24px; text-align: center; color: #6b7280; }
.gtm-brain-error { padding: 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #b91c1c; font-size: 0.875rem; }
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
        <label for="account">Account (optional)</label>
        <select id="account" class="gtm-brain-select" aria-label="Select account">
          <option value="">All / no specific account</option>
          ${accounts.map(a => `<option value="${a.id}" data-name="${(a.name || '').replace(/"/g, '&quot;')}">${escapeHtml(a.name || '')}</option>`).join('')}
        </select>
      </div>
      <div class="gtm-brain-input-wrap">
        <label for="query">Your question</label>
        <input type="text" id="query" class="gtm-brain-input" placeholder="e.g. What's the latest on this account? Who are the stakeholders? Prep me for my next call." aria-label="Your question" />
      </div>
    </div>
    <div class="gtm-brain-chips">
      <button type="button" class="gtm-brain-chip" data-query="What's the latest on this account?">What's the latest?</button>
      <button type="button" class="gtm-brain-chip" data-query="Who are the key contacts and stakeholders?">Key contacts</button>
      <button type="button" class="gtm-brain-chip" data-query="What are the next steps and action items?">Next steps</button>
      <button type="button" class="gtm-brain-chip" data-query="Prep me for my next meeting with this account.">Prep me for my meeting</button>
      <button type="button" class="gtm-brain-chip" data-query="What's the deal status and stage?">Deal status</button>
    </div>
    <button type="button" id="submit" class="gtm-brain-submit">Ask</button>
    <p class="gtm-brain-hint">Typically 2–5 seconds.</p>
  </div>

  <div id="response-box" class="gtm-brain-response">
    <div id="response-content" class="gtm-brain-answer"></div>
    <div id="response-context" class="gtm-brain-context">
      <span id="context-text"></span>
      <button type="button" id="refresh-btn" class="gtm-brain-refresh" title="Re-query with live Salesforce data">Refresh data</button>
    </div>
  </div>
  <div id="loading-box" class="gtm-brain-response" style="display:none;">
    <div class="gtm-brain-loading" id="loading-text">Gathering intelligence...</div>
  </div>
  <div id="error-box" class="gtm-brain-response" style="display:none;">
    <div id="error-content" class="gtm-brain-error"></div>
  </div>

  <p class="gtm-brain-footer">Live from Salesforce • Powered by Claude</p>
</div>

<script>
(function() {
  var userEmail = ${JSON.stringify(userEmail)};
  var accounts = ${accountsJson};

  function escapeHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatAnswer(text) {
    if (!text) return '';
    return text
      .replace(/[\\u{1F300}-\\u{1F9FF}]|[\\u{2600}-\\u{26FF}]|[\\u{2700}-\\u{27BF}]|[\\u{1F600}-\\u{1F64F}]|[\\u{1F680}-\\u{1F6FF}]/gu, '')
      .replace(/^#{2,3}\\s+(.+)$/gm, '<h3 class="gtm-brain-header">$1</h3>')
      .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/^[•\\-]\\s+(.+)$/gm, '<li>$1</li>')
      .replace(/^-\\s+\\[\\s*\\]\\s+(.+)$/gm, '<li class="gtm-brain-todo">$1</li>')
      .replace(/^-\\s+\\[x\\]\\s+(.+)$/gm, '<li class="gtm-brain-done">$1</li>')
      .replace(/(<li[^>]*>.*?<\\/li>\\s*)+/g, '<ul class="gtm-brain-list">$&</ul>')
      .replace(/\\n{2,}/g, '\\n')
      .replace(/\\n/g, '<br>');
  }

  var queryEl = document.getElementById('query');
  var accountEl = document.getElementById('account');
  var submitBtn = document.getElementById('submit');
  var responseBox = document.getElementById('response-box');
  var responseContent = document.getElementById('response-content');
  var responseContext = document.getElementById('context-text');
  var refreshBtn = document.getElementById('refresh-btn');
  var loadingBox = document.getElementById('loading-box');
  var loadingText = document.getElementById('loading-text');
  var errorBox = document.getElementById('error-box');
  var errorContent = document.getElementById('error-content');

  document.querySelectorAll('.gtm-brain-chip').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var q = this.getAttribute('data-query');
      queryEl.value = q;
      queryEl.focus();
    });
  });

  function showLoading(accountName) {
    responseBox.classList.remove('visible');
    errorBox.style.display = 'none';
    loadingBox.style.display = 'block';
    loadingText.textContent = accountName ? 'Gathering intelligence about ' + accountName + '...' : 'Gathering intelligence...';
    submitBtn.disabled = true;
  }

  function showResponse(answer, context) {
    loadingBox.style.display = 'none';
    errorBox.style.display = 'none';
    responseContent.innerHTML = formatAnswer(answer);
    var parts = [];
    if (context && context.accountName) parts.push(context.accountName);
    if (context && context.opportunityCount > 0) parts.push(context.opportunityCount + ' opps');
    if (context && context.hasNotes) parts.push('notes');
    if (context && context.hasCustomerBrain) parts.push('history');
    if (context && context.dataFreshness === 'cached') parts.push('(cached)');
    responseContext.textContent = parts.length ? 'Based on: ' + parts.join(' • ') : '';
    responseBox.classList.add('visible');
    responseBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    submitBtn.disabled = false;
  }

  function showError(msg) {
    loadingBox.style.display = 'none';
    responseBox.classList.remove('visible');
    errorContent.textContent = msg;
    errorBox.style.display = 'block';
    submitBtn.disabled = false;
  }

  // Shared query function — forceRefresh bypasses server-side cache
  function runQuery(forceRefresh) {
    var query = queryEl.value.trim();
    if (!query) { queryEl.focus(); return; }
    var opt = accountEl.options[accountEl.selectedIndex];
    var accountId = accountEl.value || '';
    var accountName = opt && opt.getAttribute('data-name') ? opt.getAttribute('data-name') : '';

    showLoading(accountName || null);

    var payload = {
      query: query,
      accountId: accountId,
      accountName: accountName,
      userEmail: userEmail
    };
    if (forceRefresh) payload.forceRefresh = true;

    fetch('/api/intelligence/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, json: j }; }); })
    .then(function(result) {
      if (result.ok && result.json.success) {
        showResponse(result.json.answer, result.json.context);
      } else {
        showError(result.json.error || result.json.message || 'Could not get an answer. Try rephrasing.');
      }
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
