/**
 * Zero Render Storage Validation & Purge Utility
 * 
 * This utility validates the Zero Render Storage migration and provides
 * functionality to purge deprecated SQLite tables once file stores are confirmed working.
 * 
 * Usage:
 *   node src/utils/zeroStorageValidation.js validate   - Validate all file stores
 *   node src/utils/zeroStorageValidation.js status     - Show storage status
 *   node src/utils/zeroStorageValidation.js purge      - Purge deprecated SQLite tables (DESTRUCTIVE)
 * 
 * IMPORTANT: Run 'validate' and verify everything is working before running 'purge'
 */

const path = require('path');
const fs = require('fs');

// Simple logger for CLI use
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.log('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: () => {} // Suppress debug in CLI
};

// Mock logger for services
require('../utils/logger').info = logger.info;
require('../utils/logger').warn = logger.warn;
require('../utils/logger').error = logger.error;
require('../utils/logger').debug = logger.debug;

// Data file paths
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILES = {
  tokens: path.join(DATA_DIR, 'user-tokens.enc.json'),
  intel: path.join(DATA_DIR, 'slack-intel-cache.json'),
  meetingPrep: path.join(DATA_DIR, 'meeting-prep-cache.json'),
  enrichment: path.join(DATA_DIR, 'enrichment-cache.json')
};

// SQLite tables that are deprecated by file stores
const DEPRECATED_TABLES = [
  'user_tokens',          // Replaced by user-tokens.enc.json
  // Note: pending_intelligence is still used, but now also writes to file
  // Note: meeting_prep is replaced by meeting-prep-cache.json
  // Note: attendee_enrichment is replaced by enrichment-cache.json
];

/**
 * Check if a data file exists and is valid JSON
 */
function validateDataFile(name, filePath) {
  const result = {
    name,
    path: filePath,
    exists: false,
    valid: false,
    recordCount: 0,
    error: null
  };
  
  try {
    if (!fs.existsSync(filePath)) {
      result.error = 'File does not exist';
      return result;
    }
    
    result.exists = true;
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    result.valid = true;
    
    // Count records based on file type
    if (name === 'tokens') {
      result.recordCount = Object.keys(data.tokens || {}).length;
    } else if (name === 'intel') {
      result.recordCount = data.totalIntelCount || Object.keys(data.accounts || {}).length;
    } else if (name === 'meetingPrep') {
      result.recordCount = Object.keys(data.preps || {}).length;
    } else if (name === 'enrichment') {
      result.recordCount = Object.keys(data.enrichments || {}).length;
    }
    
    result.lastModified = data.lastModified || data.lastRefresh;
    
  } catch (error) {
    result.error = error.message;
  }
  
  return result;
}

/**
 * Validate all data files
 */
function validateAllFiles() {
  console.log('\n=== Zero Render Storage Validation ===\n');
  
  const results = [];
  let allValid = true;
  
  for (const [name, filePath] of Object.entries(DATA_FILES)) {
    const result = validateDataFile(name, filePath);
    results.push(result);
    
    if (!result.exists || !result.valid) {
      allValid = false;
    }
    
    const status = result.valid ? '✅' : (result.exists ? '⚠️' : '❌');
    console.log(`${status} ${name}:`);
    console.log(`   Path: ${result.path}`);
    console.log(`   Exists: ${result.exists}`);
    console.log(`   Valid: ${result.valid}`);
    if (result.recordCount > 0) {
      console.log(`   Records: ${result.recordCount}`);
    }
    if (result.lastModified) {
      console.log(`   Last Modified: ${result.lastModified}`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log();
  }
  
  // Check feature flags
  console.log('=== Feature Flags ===\n');
  console.log(`USE_SQLITE_TOKENS: ${process.env.USE_SQLITE_TOKENS || 'not set (file store enabled)'}`);
  console.log(`USE_SQLITE_MEETING_PREP: ${process.env.USE_SQLITE_MEETING_PREP || 'not set (file store enabled)'}`);
  console.log(`USE_SQLITE_ENRICHMENT: ${process.env.USE_SQLITE_ENRICHMENT || 'not set (file store enabled)'}`);
  console.log();
  
  // Summary
  console.log('=== Summary ===\n');
  if (allValid) {
    console.log('✅ All data files are valid and ready');
    console.log('   You can safely enable Zero Render Storage in production');
  } else {
    console.log('⚠️  Some data files have issues');
    console.log('   Please fix the issues above before proceeding');
  }
  
  return { success: allValid, results };
}

/**
 * Show storage status
 */
async function showStatus() {
  console.log('\n=== Zero Render Storage Status ===\n');
  
  // Validate files
  const validation = validateAllFiles();
  
  // Show SQLite status if database exists
  const dbPath = path.join(DATA_DIR, 'intelligence.db');
  console.log('\n=== SQLite Database ===\n');
  
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    console.log(`Path: ${dbPath}`);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Last Modified: ${stats.mtime.toISOString()}`);
    
    // Try to get table counts
    try {
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(dbPath);
      
      const tables = ['user_tokens', 'pending_intelligence', 'meeting_prep', 'attendee_enrichment'];
      
      for (const table of tables) {
        await new Promise((resolve) => {
          db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
            if (!err && row) {
              const deprecated = DEPRECATED_TABLES.includes(table) ? ' (can be purged)' : '';
              console.log(`   ${table}: ${row.count} rows${deprecated}`);
            }
            resolve();
          });
        });
      }
      
      db.close();
    } catch (e) {
      console.log('   (Could not read table counts)');
    }
  } else {
    console.log('SQLite database not found (expected at', dbPath, ')');
  }
  
  console.log();
}

/**
 * Purge deprecated SQLite tables (DESTRUCTIVE)
 */
async function purgeTables() {
  console.log('\n=== Purge Deprecated SQLite Tables ===\n');
  console.log('⚠️  WARNING: This is a DESTRUCTIVE operation!');
  console.log('⚠️  The following tables will be CLEARED:\n');
  
  for (const table of DEPRECATED_TABLES) {
    console.log(`   - ${table}`);
  }
  
  console.log('\n');
  
  // Validate files first
  const validation = validateAllFiles();
  
  if (!validation.success) {
    console.log('\n❌ Cannot purge: Some data files are invalid');
    console.log('   Please run "validate" and fix issues first\n');
    process.exit(1);
  }
  
  // Check for confirmation flag
  if (!process.argv.includes('--confirm')) {
    console.log('\n❌ Purge cancelled: Missing --confirm flag');
    console.log('   To proceed, run: node src/utils/zeroStorageValidation.js purge --confirm\n');
    process.exit(1);
  }
  
  console.log('\n🔧 Proceeding with purge...\n');
  
  const dbPath = path.join(DATA_DIR, 'intelligence.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ SQLite database not found');
    process.exit(1);
  }
  
  try {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(dbPath);
    
    for (const table of DEPRECATED_TABLES) {
      await new Promise((resolve, reject) => {
        // Get count first
        db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
          if (err) {
            console.log(`   ⚠️  ${table}: Table may not exist`);
            resolve();
            return;
          }
          
          const count = row?.count || 0;
          
          // Clear table
          db.run(`DELETE FROM ${table}`, function(deleteErr) {
            if (deleteErr) {
              console.log(`   ❌ ${table}: Failed to purge - ${deleteErr.message}`);
            } else {
              console.log(`   ✅ ${table}: Purged ${count} rows`);
            }
            resolve();
          });
        });
      });
    }
    
    // Vacuum to reclaim space
    await new Promise((resolve) => {
      db.run('VACUUM', (err) => {
        if (!err) {
          console.log('\n   ✅ Database vacuumed (space reclaimed)');
        }
        resolve();
      });
    });
    
    db.close();
    
    console.log('\n✅ Purge complete!');
    console.log('   Deprecated tables have been cleared.');
    console.log('   File stores are now the primary data source.\n');
    
  } catch (error) {
    console.error('\n❌ Purge failed:', error.message);
    process.exit(1);
  }
}

/**
 * Main CLI handler
 */
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'validate':
      validateAllFiles();
      break;
      
    case 'status':
      await showStatus();
      break;
      
    case 'purge':
      await purgeTables();
      break;
      
    default:
      console.log('\nZero Render Storage Validation Utility');
      console.log('========================================\n');
      console.log('Usage:');
      console.log('  node src/utils/zeroStorageValidation.js validate   - Validate all file stores');
      console.log('  node src/utils/zeroStorageValidation.js status     - Show storage status');
      console.log('  node src/utils/zeroStorageValidation.js purge      - Purge deprecated SQLite tables\n');
      console.log('Options:');
      console.log('  --confirm    Required for purge command (safety measure)\n');
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  validateAllFiles,
  showStatus,
  purgeTables,
  DATA_FILES,
  DEPRECATED_TABLES
};
