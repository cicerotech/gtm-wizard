/**
 * Obsidian Vault Reader
 * Reads and parses markdown files from an Obsidian vault
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

/**
 * Find Obsidian vault on the system
 * Checks common locations
 */
function findVault(vaultName) {
  const homeDir = require('os').homedir();
  
  // Common vault locations
  const searchPaths = [
    path.join(homeDir, 'Documents', vaultName),
    path.join(homeDir, 'Documents', 'Obsidian', vaultName),
    path.join(homeDir, 'Obsidian', vaultName),
    path.join(homeDir, vaultName),
    // iCloud
    path.join(homeDir, 'Library/Mobile Documents/iCloud~md~obsidian/Documents', vaultName),
    // Dropbox
    path.join(homeDir, 'Dropbox', vaultName),
    path.join(homeDir, 'Dropbox/Obsidian', vaultName),
  ];
  
  for (const vaultPath of searchPaths) {
    if (fs.existsSync(vaultPath)) {
      // Verify it's an Obsidian vault by checking for .obsidian folder
      const obsidianDir = path.join(vaultPath, '.obsidian');
      if (fs.existsSync(obsidianDir)) {
        console.log(`✓ Found vault at: ${vaultPath}`);
        return vaultPath;
      }
    }
  }
  
  return null;
}

/**
 * Scan vault for markdown files
 */
function scanVault(vaultPath, options = {}) {
  const {
    folder = null,  // Specific folder to scan (e.g., 'Meetings')
    maxAge = 30,    // Only files modified in last N days
    recursive = true
  } = options;
  
  const targetPath = folder ? path.join(vaultPath, folder) : vaultPath;
  
  if (!fs.existsSync(targetPath)) {
    console.log(`Warning: Path not found: ${targetPath}`);
    return [];
  }
  
  const files = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAge);
  
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip hidden folders and .obsidian
      if (entry.name.startsWith('.')) continue;
      
      if (entry.isDirectory() && recursive) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const stats = fs.statSync(fullPath);
        if (stats.mtime >= cutoffDate) {
          files.push({
            path: fullPath,
            relativePath: path.relative(vaultPath, fullPath),
            name: entry.name.replace('.md', ''),
            modified: stats.mtime
          });
        }
      }
    }
  }
  
  scanDir(targetPath);
  return files.sort((a, b) => b.modified - a.modified);
}

/**
 * Parse a markdown file with frontmatter
 */
function parseNote(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { data: frontmatter, content: body } = matter(content);
    
    return {
      frontmatter,
      body: body.trim(),
      title: path.basename(filePath, '.md'),
      path: filePath
    };
  } catch (err) {
    console.error(`Error parsing ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Extract meeting metadata from note
 */
function extractMeetingInfo(note) {
  const { frontmatter, body, title } = note;
  
  // Try to extract account from frontmatter or folder path
  let account = frontmatter.account || frontmatter.company || null;
  
  // If not in frontmatter, try to extract from folder structure
  // e.g., "Accounts/AT&T/Meetings/2025-01-21 - Discovery.md"
  if (!account) {
    const pathParts = note.path.split(path.sep);
    const accountsIdx = pathParts.findIndex(p => p.toLowerCase() === 'accounts');
    if (accountsIdx >= 0 && pathParts[accountsIdx + 1]) {
      account = pathParts[accountsIdx + 1];
    }
  }
  
  // Extract date from title or frontmatter
  let date = frontmatter.date || null;
  if (!date) {
    // Try to extract from title like "2025-01-21 - Meeting Name"
    const dateMatch = title.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      date = dateMatch[1];
    }
  }
  
  // Extract attendees
  const attendees = frontmatter.attendees || [];
  
  // Check if already synced
  const syncedToSf = frontmatter.synced_to_sf === true;
  
  // Extract key sections from body
  const sections = {
    keyPoints: extractSection(body, 'Key Discussion Points', 'Key Points'),
    actionItems: extractSection(body, 'Action Items'),
    nextSteps: extractSection(body, 'Next Steps'),
    transcription: extractSection(body, 'Transcription', 'Transcript')
  };
  
  return {
    title,
    account,
    date,
    attendees,
    syncedToSf,
    type: frontmatter.type || 'meeting',
    sections,
    rawBody: body,
    frontmatter
  };
}

/**
 * Extract a section from markdown body
 */
function extractSection(body, ...sectionNames) {
  for (const name of sectionNames) {
    // Match ## Section Name or # Section Name
    const regex = new RegExp(`##?\\s*${name}[\\s\\S]*?(?=##|$)`, 'i');
    const match = body.match(regex);
    if (match) {
      // Remove the header and clean up
      return match[0]
        .replace(/##?\s*[\w\s]+\n/, '')
        .trim();
    }
  }
  return null;
}

/**
 * Generate summary from meeting note
 */
function generateSummary(meetingInfo, maxLength = 500) {
  const parts = [];
  
  if (meetingInfo.date) {
    parts.push(`Date: ${meetingInfo.date}`);
  }
  
  if (meetingInfo.attendees?.length) {
    parts.push(`Attendees: ${meetingInfo.attendees.join(', ')}`);
  }
  
  if (meetingInfo.sections.keyPoints) {
    parts.push('\nKey Points:\n' + meetingInfo.sections.keyPoints.substring(0, 300));
  }
  
  if (meetingInfo.sections.nextSteps) {
    parts.push('\nNext Steps:\n' + meetingInfo.sections.nextSteps.substring(0, 200));
  }
  
  let summary = parts.join('\n');
  if (summary.length > maxLength) {
    summary = summary.substring(0, maxLength - 3) + '...';
  }
  
  return summary;
}

/**
 * Mark a note as synced by updating its frontmatter
 */
function markAsSynced(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { data: frontmatter, content: body } = matter(content);
    
    frontmatter.synced_to_sf = true;
    frontmatter.synced_at = new Date().toISOString();
    
    const newContent = matter.stringify(body, frontmatter);
    fs.writeFileSync(filePath, newContent, 'utf8');
    
    return true;
  } catch (err) {
    console.error(`Error marking as synced: ${err.message}`);
    return false;
  }
}

module.exports = {
  findVault,
  scanVault,
  parseNote,
  extractMeetingInfo,
  generateSummary,
  markAsSynced
};

