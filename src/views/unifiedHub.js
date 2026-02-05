/**
 * Unified GTM Resources Hub
 * Combines Dashboard, Architecture, Sales Process, and Commands into a tabbed interface
 * with consistent styling and Okta authentication
 */

const fs = require('fs');
const path = require('path');

// Use the actual JPEG logo served from /logo endpoint

/**
 * Generate the unified hub HTML with tabbed navigation
 * @param {object} options - Options including user info
 * @param {string} options.userName - Display name of the user
 * @param {boolean} options.isAdmin - Whether the user is an admin (shows Analytics tab)
 */
function generateUnifiedHub(options = {}) {
  const { userName = 'User', isAdmin = false } = options;
  const updateTime = new Date().toLocaleTimeString('en-US', { 
    timeZone: 'America/Los_Angeles', 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GTM Resources</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body { 
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
  background: #f5f7fe; 
  min-height: 100vh;
  overflow: hidden;
}

/* ═══════════════════════════════════════════════════════════════════════
   UNIFIED HEADER
   ═══════════════════════════════════════════════════════════════════════ */
.unified-header {
  background: #fff;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-logo {
  display: flex;
  align-items: center;
  text-decoration: none;
}

.header-logo img {
  max-height: 36px;
  width: auto;
}

.header-subtitle {
  font-size: 0.75rem;
  color: #6b7280;
  margin-left: 8px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 0.75rem;
}

.header-user {
  color: #6b7280;
}

.header-logout {
  color: #9ca3af;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-logout:hover {
  color: #6b7280;
}

/* ═══════════════════════════════════════════════════════════════════════
   TAB NAVIGATION
   ═══════════════════════════════════════════════════════════════════════ */
.tab-nav {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 24px;
  display: flex;
  gap: 4px;
  overflow-x: auto;
}

.tab-nav label {
  padding: 12px 20px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  white-space: nowrap;
}

.tab-nav label:hover {
  color: #1f2937;
  background: #f9fafb;
}

/* Tab radio inputs (hidden) */
input[name="main-tab"] { display: none; }

/* Active tab styling */
#tab-start:checked ~ .tab-nav label[for="tab-start"],
#tab-sales:checked ~ .tab-nav label[for="tab-sales"],
#tab-dashboard:checked ~ .tab-nav label[for="tab-dashboard"],
#tab-architecture:checked ~ .tab-nav label[for="tab-architecture"],
#tab-commands:checked ~ .tab-nav label[for="tab-commands"],
#tab-meeting-prep:checked ~ .tab-nav label[for="tab-meeting-prep"],
#tab-analytics:checked ~ .tab-nav label[for="tab-analytics"] {
  color: #8e99e1;
  border-bottom-color: #8e99e1;
}

/* Tab content visibility */
.tab-content { display: none; }

#tab-start:checked ~ .content-area #content-start,
#tab-sales:checked ~ .content-area #content-sales,
#tab-dashboard:checked ~ .content-area #content-dashboard,
#tab-architecture:checked ~ .content-area #content-architecture,
#tab-commands:checked ~ .content-area #content-commands,
#tab-meeting-prep:checked ~ .content-area #content-meeting-prep,
#tab-analytics:checked ~ .content-area #content-analytics {
  display: block;
}

/* ═══════════════════════════════════════════════════════════════════════
   CONTENT AREA - Full height for iframes
   ═══════════════════════════════════════════════════════════════════════ */
.content-area {
  height: calc(100vh - 110px);
  overflow: hidden;
}

.tab-content iframe {
  width: 100%;
  height: 100%;
  border: none;
}

/* ═══════════════════════════════════════════════════════════════════════
   TAB CONTENT - Full height iframes
   ═══════════════════════════════════════════════════════════════════════ */
.tab-content {
  height: 100%;
}

/* ═══════════════════════════════════════════════════════════════════════
   MOBILE RESPONSIVE
   ═══════════════════════════════════════════════════════════════════════ */
@media (max-width: 768px) {
  .unified-header {
    padding: 12px 16px;
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .header-subtitle { display: none; }
  
  .tab-nav {
    padding: 0 12px;
  }
  
  .tab-nav label {
    padding: 10px 14px;
    font-size: 0.8rem;
  }
  
  .content-area {
    height: calc(100vh - 100px);
  }
}
</style>
</head>
<body>

<!-- Unified Header -->
<header class="unified-header">
  <div class="header-left">
    <a href="/gtm" class="header-logo">
      <img src="/logo" alt="Eudia">
    </a>
    <span class="header-subtitle">GTM Resources • Updated ${updateTime} PT</span>
  </div>
  <div class="header-right">
    <span class="header-user">Welcome, ${userName}</span>
    <a href="/gtm/logout" class="header-logout">🔒 Logout</a>
  </div>
</header>

<!-- Tab Radio Inputs (CSS-only tabs) -->
<input type="radio" name="main-tab" id="tab-sales" checked>
<input type="radio" name="main-tab" id="tab-dashboard">
<input type="radio" name="main-tab" id="tab-meeting-prep">
<input type="radio" name="main-tab" id="tab-architecture">
<input type="radio" name="main-tab" id="tab-commands">
<input type="radio" name="main-tab" id="tab-start">
${isAdmin ? '<input type="radio" name="main-tab" id="tab-analytics">' : ''}

<!-- Tab Navigation -->
<nav class="tab-nav">
  <label for="tab-sales">Sales Process</label>
  <label for="tab-dashboard">Dashboard</label>
  <label for="tab-meeting-prep">Meeting Prep</label>
  <label for="tab-architecture">Architecture</label>
  <label for="tab-commands">Commands</label>
  <label for="tab-start" style="color: #8e99e1; font-weight: 600;">Getting Started</label>
  ${isAdmin ? '<label for="tab-analytics" style="margin-left: auto; color: #9ca3af;">Analytics</label>' : ''}
</nav>

<!-- Content Area -->
<div class="content-area">
  
  <!-- Dashboard Tab - Loads dashboard via iframe -->
  <div id="content-dashboard" class="tab-content">
    <iframe src="/gtm/dashboard" title="Dashboard"></iframe>
  </div>
  
  <!-- Meeting Prep Tab - Loads meeting prep view via iframe -->
  <div id="content-meeting-prep" class="tab-content">
    <iframe src="/gtm/meeting-prep" title="Meeting Prep"></iframe>
  </div>
  
  <!-- Architecture Tab - Loads architecture page via iframe -->
  <div id="content-architecture" class="tab-content">
    <iframe src="/architecture" title="Architecture"></iframe>
  </div>
  
  <!-- Sales Process Tab - Loads sales process page via iframe -->
  <div id="content-sales" class="tab-content">
    <iframe src="/sales-process" title="Sales Process"></iframe>
  </div>
  
  <!-- Commands Tab - Loads cheat sheet via iframe -->
  <div id="content-commands" class="tab-content">
    <iframe src="/cheat-sheet" title="Commands"></iframe>
  </div>
  
  <!-- Getting Started Tab - Onboarding guide -->
  <div id="content-start" class="tab-content">
    <iframe src="/getting-started" title="Getting Started"></iframe>
  </div>
  
  ${isAdmin ? `
  <!-- Analytics Tab - Admin only -->
  <div id="content-analytics" class="tab-content">
    <iframe src="/gtm/analytics" title="Analytics"></iframe>
  </div>
  ` : ''}
</div>

<script>
// Handle deep linking via query params (for Copy Link feature)
document.addEventListener('DOMContentLoaded', function() {
  var urlParams = new URLSearchParams(window.location.search);
  var tabParam = urlParams.get('tab');
  var meetingParam = urlParams.get('meeting');
  
  // Switch to specified tab
  if (tabParam) {
    var tabMap = {
      'sales': 'tab-sales',
      'dashboard': 'tab-dashboard',
      'meeting-prep': 'tab-meeting-prep',
      'architecture': 'tab-architecture',
      'commands': 'tab-commands',
      'start': 'tab-start',
      'analytics': 'tab-analytics'
    };
    
    var tabId = tabMap[tabParam];
    if (tabId && document.getElementById(tabId)) {
      document.getElementById(tabId).checked = true;
    }
  }
  
  // If meeting ID specified, tell the meeting-prep iframe to open that meeting
  if (meetingParam && tabParam === 'meeting-prep') {
    var iframe = document.querySelector('#content-meeting-prep iframe');
    
    var sendMessage = function() {
      iframe.contentWindow.postMessage({ 
        action: 'openMeeting', 
        meetingId: meetingParam 
      }, '*');
    };
    
    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
      setTimeout(sendMessage, 500);
    } else {
      iframe.addEventListener('load', function() {
        setTimeout(sendMessage, 500);
      });
    }
  }
});
</script>
</body>
</html>`;
}

module.exports = {
  generateUnifiedHub
};

