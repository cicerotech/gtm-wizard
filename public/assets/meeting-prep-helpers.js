/**
 * Meeting Prep — Client-Side Helper Functions
 * 
 * This file is served as a STATIC asset (/assets/meeting-prep-helpers.js).
 * It is NOT processed through Node.js template literals, so all regex
 * patterns and string escaping work exactly as written.
 * 
 * This eliminates the class of bugs where \\s, \\d, \\[, etc. in regex
 * patterns get mangled by template literal processing.
 */

// ════════════════════════════════════════════════════════════
// EA (Executive Assistant) filtering
// ════════════════════════════════════════════════════════════

var EA_EXCLUSIONS = [
  { name: 'alyssa gradstein', email: 'alyssa.gradstein', aliases: ['alyssa', 'gradstein', 'gradstei'] },
  { name: 'cassie farber', email: 'cassie.farber', aliases: ['cassie', 'farber'] }
];

function isExecutiveAssistant(attendee) {
  if (!attendee) return false;
  var email = (attendee.email || '').toLowerCase();
  var rawName = attendee.name || attendee.full_name || attendee.fullName || '';
  var name = rawName.toLowerCase().replace(/[,.\-_@]/g, ' ').replace(/\s+/g, ' ').trim();
  return EA_EXCLUSIONS.some(function(ea) {
    if (email && email.includes(ea.email)) return true;
    for (var i = 0; i < (ea.aliases || []).length; i++) {
      if (name.includes(ea.aliases[i]) || email.includes(ea.aliases[i])) return true;
    }
    var eaParts = ea.name.split(' ');
    var firstName = eaParts[0] || '';
    var lastName = eaParts[1] || '';
    if (firstName && lastName) {
      var hasFirst = name.includes(firstName);
      var hasLastPartial = name.includes(lastName.substring(0, Math.min(4, lastName.length)));
      if (hasFirst && hasLastPartial) return true;
    }
    return false;
  });
}

// ════════════════════════════════════════════════════════════
// Name processing
// ════════════════════════════════════════════════════════════

function normalizeName(rawName) {
  if (!rawName) return 'Unknown';
  var name = rawName.trim();
  if (name.includes(',')) {
    var parts = name.split(',').map(function(s) { return s.trim(); });
    if (parts.length >= 2) {
      var lastName = parts[0];
      var firstName = parts.slice(1).join(' ').trim();
      return firstName + ' ' + lastName;
    }
  }
  if (name === name.toUpperCase() && name.length > 3) {
    return name.split(' ').map(function(w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
  }
  return name;
}

function extractNameFromEmail(email) {
  if (!email || !email.includes('@')) return 'Unknown';
  var localPart = email.split('@')[0];
  var name = localPart
    .replace(/\d+$/g, '')
    .replace(/[._-]/g, ' ')
    .replace(/(\d+)/g, ' ')
    .trim();
  if (!name.includes(' ') && name.length > 3) {
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  return name.split(' ')
    .filter(function(w) { return w.length > 0; })
    .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); })
    .join(' ');
}

function isValidHumanName(name) {
  if (!name) return false;
  var parts = name.trim().split(/\s+/);
  if (parts.length < 2) return false;
  return parts.every(function(p) { return p.length >= 3 && /[aeiouy]/i.test(p); });
}

function extractNamesFromSummary(text) {
  if (!text || typeof text !== 'string') return [];
  var names = [];
  var pattern = /([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+)\s*[–\-—]/g;
  var match;
  while ((match = pattern.exec(text)) !== null) {
    var candidate = match[1].trim();
    if (isValidHumanName(candidate) && names.indexOf(candidate) === -1) {
      names.push(candidate);
    }
  }
  return names;
}

function extractBestName(attendee, summary) {
  if (attendee.full_name && attendee.full_name.trim().length > 2 && !attendee.full_name.includes('@')) {
    var fullName = normalizeName(attendee.full_name);
    if (isValidHumanName(fullName)) return fullName;
  }
  if (summary && typeof summary === 'string') {
    var summaryNames = extractNamesFromSummary(summary);
    for (var i = 0; i < summaryNames.length; i++) {
      if (isValidHumanName(summaryNames[i])) return summaryNames[i];
    }
    var dashMatch = summary.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[–\-—]/);
    if (dashMatch && dashMatch[1] && isValidHumanName(dashMatch[1].trim())) return dashMatch[1].trim();
  }
  if (attendee.name && attendee.name.trim().length > 2 && !attendee.name.includes('@')) {
    var normalizedName = normalizeName(attendee.name);
    if (isValidHumanName(normalizedName)) return normalizedName;
    if (attendee.email) {
      var emailName = extractNameFromEmail(attendee.email);
      if (emailName.includes(' ')) return emailName;
    }
    if (normalizedName.length > 5) return normalizedName;
  }
  if (attendee.email) return extractNameFromEmail(attendee.email);
  return 'Unknown';
}

// ════════════════════════════════════════════════════════════
// Enrichment & summary processing
// ════════════════════════════════════════════════════════════

function hasValidEnrichment(attendee) {
  var title = attendee.title || '';
  if (title.trim().length > 0) return true;
  var linkedinUrl = attendee.linkedinUrl || attendee.linkedin_url || '';
  if (linkedinUrl.trim().length > 0) return true;
  var rawSummary = attendee.summary || attendee.attendee_summary || attendee.bio || '';
  var summary = parseAttendeeSummary(rawSummary);
  if (!summary || summary.trim().length === 0) return false;
  if (summary.toLowerCase().includes('profile information limited')) return false;
  if (summary.trim().length < 30) return false;
  return true;
}

function parseAttendeeSummary(rawSummary) {
  if (!rawSummary || typeof rawSummary !== 'string') return null;
  var trimmed = rawSummary.trim();
  if (trimmed.startsWith('{')) {
    try {
      var parsed = JSON.parse(trimmed);
      var summary = parsed.attendeeSummary || parsed.response || null;
      if (!summary) return null;
      var lowerSummary = summary.toLowerCase();
      if (lowerSummary.includes('no public linkedin data') ||
          lowerSummary.includes('profile information limited') ||
          lowerSummary.includes('unable to verify')) return null;
      return summary;
    } catch (e) {
      return trimmed;
    }
  }
  var lowerTrimmed = trimmed.toLowerCase();
  if (lowerTrimmed.includes('no public linkedin data') ||
      lowerTrimmed.includes('profile information limited')) return null;
  return trimmed;
}

function standardizeSummary(summary, displayName, title, company) {
  if (!summary) return null;
  var cleanSummary = summary.trim();
  var header = displayName + ' \u2013';
  if (title && company) {
    header = displayName + ' \u2013 ' + title + ' at ' + company + '.';
  } else if (title) {
    header = displayName + ' \u2013 ' + title + '.';
  } else if (company) {
    header = displayName + ' at ' + company + '.';
  }
  var nameParts = displayName.split(/\s+/).filter(function(p) { return p.length >= 2; });
  var firstName = (nameParts[0] || '').toLowerCase();
  var lastName = (nameParts[nameParts.length - 1] || '').toLowerCase();
  var companyLower = (company || '').toLowerCase();
  var titleLower = (title || '').toLowerCase();
  var titlePrefix = titleLower.substring(0, Math.min(titleLower.length, 15));
  var sentences = cleanSummary.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length === 0) sentences = [cleanSummary];

  function isIntroSentence(sentence) {
    var s = sentence.trim();
    if (!s || s.length < 5) return true;
    var sLower = s.toLowerCase();
    var hasFirstName = firstName.length >= 2 && sLower.indexOf(firstName) !== -1;
    var hasLastName = lastName.length >= 2 && sLower.indexOf(lastName) !== -1;
    var hasCompany = companyLower.length >= 2 && sLower.indexOf(companyLower) !== -1;
    var hasTitle = titlePrefix.length >= 3 && sLower.indexOf(titlePrefix) !== -1;
    var startsWithNameDash = /^[A-Z][a-zA-Z]*(?:\s+[A-Za-z][a-zA-Z]*)*\s*[\u2013\-\u2014]/.test(s);
    var hasDash = /[\u2013\-\u2014]/.test(s);
    var hasNameSpaceTitle = firstName.length >= 2 && /\s{2,}/.test(s) && hasFirstName;
    var startsWithPronoun = /^(?:They|He|She)\s+(?:is|are)\s/i.test(s);
    if (startsWithNameDash && (hasCompany || hasTitle)) return true;
    if (startsWithNameDash && s.length < 120) return true;
    if (hasFirstName && hasCompany && s.length < 150) return true;
    if (hasFirstName && hasTitle && s.length < 150) return true;
    if (hasLastName && hasDash && hasCompany && s.length < 150) return true;
    if (hasNameSpaceTitle && (hasCompany || hasTitle)) return true;
    if (startsWithPronoun && (hasCompany || hasTitle) && s.length < 150) return true;
    return false;
  }

  var firstNonIntroIdx = 0;
  for (var i = 0; i < sentences.length; i++) {
    if (isIntroSentence(sentences[i])) { firstNonIntroIdx = i + 1; } else { break; }
  }
  var uniqueContent = sentences.slice(firstNonIntroIdx).join('').trim();
  if (uniqueContent && uniqueContent.length > 10) {
    uniqueContent = uniqueContent.charAt(0).toUpperCase() + uniqueContent.slice(1);
    return header + ' ' + uniqueContent;
  }
  return header;
}

// ════════════════════════════════════════════════════════════
// Utility helpers
// ════════════════════════════════════════════════════════════

function escapeRegex(str) {
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getInitials(name) {
  if (!name) return '?';
  var parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

function getSeniorityClass(seniority) {
  if (!seniority) return 'other';
  var s = seniority.toLowerCase();
  if (s.includes('clo') || s.includes('chief')) return 'clo';
  if (s.includes('gc') || s.includes('general counsel')) return 'gc';
  if (s.includes('director') || s.includes('vp')) return 'director';
  if (s.includes('manager')) return 'manager';
  return 'other';
}

function formatTime(isoString) {
  if (!isoString) return '';
  var date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ════════════════════════════════════════════════════════════
// LinkedIn search
// ════════════════════════════════════════════════════════════

function buildLinkedInSearchQuery(displayName, company) {
  if (!displayName) return company || '';
  var normalizedName = displayName
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  var nameParts = normalizedName.split(/\s+/).filter(function(part) {
    if (part.length <= 1) return false;
    if (/^(jr|sr|ii|iii|iv|mr|ms|mrs|dr)\.?$/i.test(part)) return false;
    if (/^[^a-zA-Z]+$/.test(part)) return false;
    return true;
  });
  if (nameParts.length === 0) return company || '';
  var searchTerms = [nameParts[0]];
  if (nameParts.length > 1) {
    var lastName = nameParts[nameParts.length - 1];
    if (lastName.length > 2) searchTerms.push(lastName);
  }
  if (company) searchTerms.push(company);
  return searchTerms.join(' ');
}

// ════════════════════════════════════════════════════════════
// Ghost attendee filtering
// ════════════════════════════════════════════════════════════

var GHOST_ATTENDEE_CONFIG = {
  namePatterns: ['conference', 'meeting room', 'video enabled', 'dial-in', 'dial in', 'bridge', 'huddle room', 'board room', 'training room', 'phone room', 'zoom room', 'teams room', 'webex', 'polycom', 'cisco'],
  emailPrefixes: ['corp', 'conf', 'room', 'mtg', 'bridge', 'dial', 'noreply', 'no-reply', 'calendar', 'booking'],
  emailRegexPatterns: [
    /^[A-Z]{4,}[A-Z0-9]*\d{2,}[A-Z]?@/i,
    /^\d{4,}@/,
    /^(room|conf|mtg|res)\d+@/i,
    /^[a-z]{1,3}\d{5,}@/i
  ]
};

function isGhostAttendee(attendee) {
  var email = (attendee.email || '').toLowerCase();
  var name = (attendee.name || '');
  var nameLower = name.toLowerCase();
  for (var i = 0; i < GHOST_ATTENDEE_CONFIG.namePatterns.length; i++) {
    if (nameLower.includes(GHOST_ATTENDEE_CONFIG.namePatterns[i])) return true;
  }
  var localPart = email.split('@')[0];
  for (var j = 0; j < GHOST_ATTENDEE_CONFIG.emailPrefixes.length; j++) {
    var prefix = GHOST_ATTENDEE_CONFIG.emailPrefixes[j];
    if (localPart.startsWith(prefix) && localPart.length > prefix.length) {
      var afterPrefix = localPart.slice(prefix.length);
      if (/^\d/.test(afterPrefix) || afterPrefix.startsWith('-') || afterPrefix.startsWith('_')) return true;
    }
  }
  for (var k = 0; k < GHOST_ATTENDEE_CONFIG.emailRegexPatterns.length; k++) {
    if (GHOST_ATTENDEE_CONFIG.emailRegexPatterns[k].test(email)) return true;
  }
  if (/\(\d+\)/.test(name) && /\d{3,}/.test(name)) return true;
  if (localPart.length <= 2 || /^\d+$/.test(localPart)) return true;
  return false;
}

// ════════════════════════════════════════════════════════════
// Markdown rendering for GTM Brain brief
// ════════════════════════════════════════════════════════════

function renderMarkdownToHtml(markdownText) {
  return markdownText
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^## (.+)$/gm, '<div style="font-size: 0.7rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-top: 12px; margin-bottom: 4px;">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color: #1f2937;">$1</strong>')
    .replace(/^[\-\u2022]\s+(.+)$/gm, '<div style="font-size: 0.78rem; color: #374151; padding-left: 12px; position: relative; margin-bottom: 2px; line-height: 1.45;"><span style="position: absolute; left: 0; color: #9ca3af;">\u2022</span>$1</div>')
    .replace(/\n\n/g, '<div style="margin-top: 8px;"></div>')
    .replace(/\n/g, '<br>');
}

console.log('[MeetingPrep] Static helpers loaded successfully (' + Object.keys(GHOST_ATTENDEE_CONFIG).length + ' ghost config keys)');
