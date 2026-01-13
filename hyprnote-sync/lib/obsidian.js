/**
 * Obsidian Vault Export
 * 
 * Exports meeting notes to an Obsidian vault in addition to Salesforce.
 * Creates organized folders by Account name with proper markdown formatting.
 * 
 * Vault Structure:
 * ~/Documents/Obsidian/Sales Notes/
 * ├── IQVIA/
 * │   ├── 2026-01-10 - IQVIA Steerco.md
 * │   └── 2026-01-08 - IQVIA Discovery.md
 * ├── Duracell/
 * │   └── 2026-01-13 - Duracell CAB.md
 * └── _Templates/
 *     └── Meeting Note.md
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Default vault location
const DEFAULT_VAULT_PATH = path.join(os.homedir(), 'Documents', 'Obsidian', 'Sales Notes');

// Settings
let settings = {
  enabled: false,
  vaultPath: DEFAULT_VAULT_PATH,
  createAccountFolders: true,
  includeParticipants: true,
  includeActionItems: true,
  linkToSalesforce: true
};

/**
 * Configure Obsidian export settings
 * @param {Object} newSettings - Settings to update
 */
function configure(newSettings) {
  settings = { ...settings, ...newSettings };
}

/**
 * Get current settings
 */
function getSettings() {
  return { ...settings };
}

/**
 * Check if Obsidian export is enabled
 */
function isEnabled() {
  return settings.enabled;
}

/**
 * Ensure the vault directory exists
 */
function ensureVaultExists() {
  if (!fs.existsSync(settings.vaultPath)) {
    fs.mkdirSync(settings.vaultPath, { recursive: true });
    console.log(`  Created Obsidian vault: ${settings.vaultPath}`);
    
    // Create templates folder
    const templatesPath = path.join(settings.vaultPath, '_Templates');
    fs.mkdirSync(templatesPath, { recursive: true });
    
    // Create meeting template
    createMeetingTemplate(templatesPath);
  }
}

/**
 * Create the meeting note template
 */
function createMeetingTemplate(templatesPath) {
  const template = `---
date: {{date}}
account: {{account}}
participants: []
synced_to_sf: false
tags: [meeting]
---

# {{title}}

## Summary


## Key Discussion Points


## Action Items

- [ ] 

## Notes

`;

  fs.writeFileSync(
    path.join(templatesPath, 'Meeting Note.md'),
    template
  );
}

/**
 * Sanitize filename for filesystem
 */
function sanitizeFilename(name) {
  return name
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

/**
 * Convert HTML notes to clean markdown
 * @param {string} html - HTML content
 */
function htmlToMarkdown(html) {
  if (!html) return '';
  
  let md = html
    // Headers
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    // Bold and italic
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    // Lists
    .replace(/<li[^>]*>\s*/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    // Paragraphs
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return md;
}

/**
 * Extract action items from notes
 * @param {string} notes - Meeting notes text
 */
function extractActionItems(notes) {
  const actionItems = [];
  
  // Look for common action item patterns
  const patterns = [
    /(?:action|todo|task|follow[- ]?up):\s*(.+?)(?:\n|$)/gi,
    /(?:will|need to|should)\s+(.+?)(?:\n|$)/gi,
    /\[\s*\]\s*(.+?)(?:\n|$)/gi
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(notes)) !== null) {
      const item = match[1].trim();
      if (item.length > 5 && item.length < 200) {
        actionItems.push(item);
      }
    }
  }
  
  // Deduplicate
  return [...new Set(actionItems)];
}

/**
 * Format date for filename (YYYY-MM-DD)
 */
function formatDateForFilename(dateStr) {
  const d = new Date(dateStr);
  return d.toISOString().split('T')[0];
}

/**
 * Format date for frontmatter
 */
function formatDateForFrontmatter(dateStr) {
  const d = new Date(dateStr);
  return d.toISOString().split('T')[0];
}

/**
 * Export a meeting to Obsidian vault
 * @param {Object} session - Hyprnote session
 * @param {Array} participants - Session participants
 * @param {Object} match - Salesforce Account match result
 * @param {Object} syncResult - Result from Salesforce sync
 */
function exportMeeting(session, participants, match, syncResult) {
  if (!settings.enabled) {
    return { success: false, reason: 'obsidian_disabled' };
  }
  
  try {
    ensureVaultExists();
    
    const accountName = match?.account?.Name || 'Uncategorized';
    const accountId = match?.account?.Id;
    const meetingDate = session.record_start || session.created_at;
    const title = session.title || 'Meeting';
    
    // Create account folder if enabled
    let folderPath = settings.vaultPath;
    if (settings.createAccountFolders) {
      folderPath = path.join(settings.vaultPath, sanitizeFilename(accountName));
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
    }
    
    // Generate filename
    const dateStr = formatDateForFilename(meetingDate);
    const filename = sanitizeFilename(`${dateStr} - ${title}`) + '.md';
    const filePath = path.join(folderPath, filename);
    
    // Parse notes
    const notesHtml = session.enhanced_memo_html || session.raw_memo_html;
    const notesMd = htmlToMarkdown(notesHtml);
    
    // Extract action items
    const actionItems = settings.includeActionItems ? extractActionItems(notesMd) : [];
    
    // Format participants
    const externalParticipants = participants
      .filter(p => !p.is_user)
      .map(p => {
        if (p.job_title) {
          return `${p.full_name} (${p.job_title})`;
        }
        return p.full_name;
      });
    
    // Build frontmatter
    const frontmatter = {
      date: formatDateForFrontmatter(meetingDate),
      account: accountName,
      participants: externalParticipants,
      synced_to_sf: syncResult?.success || false,
      sf_event_id: syncResult?.id || null,
      sf_account_id: accountId || null,
      tags: ['meeting']
    };
    
    // Build markdown content
    let content = '---\n';
    content += `date: ${frontmatter.date}\n`;
    content += `account: "${frontmatter.account}"\n`;
    content += `participants: [${frontmatter.participants.map(p => `"${p}"`).join(', ')}]\n`;
    content += `synced_to_sf: ${frontmatter.synced_to_sf}\n`;
    if (frontmatter.sf_event_id) {
      content += `sf_event_id: "${frontmatter.sf_event_id}"\n`;
    }
    if (frontmatter.sf_account_id) {
      content += `sf_account_id: "${frontmatter.sf_account_id}"\n`;
    }
    content += `tags: [meeting]\n`;
    content += '---\n\n';
    
    // Title
    content += `# ${title}\n\n`;
    
    // Metadata
    content += `**Date:** ${new Date(meetingDate).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}\n\n`;
    
    if (settings.includeParticipants && externalParticipants.length > 0) {
      content += `**Participants:** ${externalParticipants.join(', ')}\n\n`;
    }
    
    if (settings.linkToSalesforce && accountId) {
      content += `**Salesforce:** [View Account](https://eudia.lightning.force.com/lightning/r/Account/${accountId}/view)\n\n`;
    }
    
    content += '---\n\n';
    
    // Notes
    content += '## Notes\n\n';
    content += notesMd + '\n\n';
    
    // Action Items
    if (actionItems.length > 0) {
      content += '## Action Items\n\n';
      for (const item of actionItems) {
        content += `- [ ] ${item}\n`;
      }
      content += '\n';
    }
    
    // Write file
    fs.writeFileSync(filePath, content);
    
    console.log(`    Obsidian: ${filename}`);
    
    return {
      success: true,
      path: filePath,
      filename
    };
    
  } catch (err) {
    console.error('    Obsidian export failed:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Get list of accounts with notes
 */
function getAccountFolders() {
  if (!fs.existsSync(settings.vaultPath)) {
    return [];
  }
  
  try {
    const entries = fs.readdirSync(settings.vaultPath, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
      .map(e => e.name);
  } catch (err) {
    return [];
  }
}

/**
 * Get notes for a specific account
 */
function getNotesForAccount(accountName) {
  const folderPath = path.join(settings.vaultPath, sanitizeFilename(accountName));
  
  if (!fs.existsSync(folderPath)) {
    return [];
  }
  
  try {
    const files = fs.readdirSync(folderPath)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse(); // Most recent first
    
    return files.map(filename => {
      const filePath = path.join(folderPath, filename);
      const stats = fs.statSync(filePath);
      
      return {
        filename,
        path: filePath,
        date: filename.split(' - ')[0],
        modifiedAt: stats.mtime
      };
    });
  } catch (err) {
    return [];
  }
}

/**
 * Open vault in Obsidian
 */
function openInObsidian() {
  const { exec } = require('child_process');
  
  // Try to open the vault in Obsidian
  exec(`open "obsidian://open?vault=${encodeURIComponent(path.basename(settings.vaultPath))}"`, (err) => {
    if (err) {
      // Fallback: open folder in Finder
      exec(`open "${settings.vaultPath}"`);
    }
  });
}

module.exports = {
  configure,
  getSettings,
  isEnabled,
  ensureVaultExists,
  exportMeeting,
  getAccountFolders,
  getNotesForAccount,
  openInObsidian,
  htmlToMarkdown,
  sanitizeFilename,
  DEFAULT_VAULT_PATH
};

