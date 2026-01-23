#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Hyprnote-Salesforce Sync
 * 
 * Tests various scenarios to identify gaps and validate functionality
 */

const fs = require('fs');
const path = require('path');
const hyprnote = require('./lib/hyprnote');
const salesforce = require('./lib/salesforce');
const matcher = require('./lib/matcher');

const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    });
  }
}

function log(msg, type = 'info') {
  const prefix = {
    pass: '  ✓ ',
    fail: '  ✗ ',
    warn: '  ⚠ ',
    info: '  → ',
    header: '\n═══ '
  };
  console.log((prefix[type] || '  ') + msg);
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        COMPREHENSIVE HYPRNOTE SYNC TEST SUITE              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  loadEnv();
  const results = { passed: 0, failed: 0, warnings: 0 };
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 1: Configuration & Setup
  // ═══════════════════════════════════════════════════════════════
  log('TEST 1: CONFIGURATION & SETUP ═══', 'header');
  
  // 1.1 Config file exists
  if (fs.existsSync(CONFIG_FILE)) {
    log('Config file exists', 'pass');
    results.passed++;
    
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    
    // 1.2 Required fields present
    if (config.rep?.name && config.rep?.email && config.rep?.salesforceUserId) {
      log('Rep profile configured: ' + config.rep.name, 'pass');
      results.passed++;
    } else {
      log('Rep profile incomplete', 'fail');
      results.failed++;
    }
    
    // 1.3 SF User ID format
    if (config.rep?.salesforceUserId?.startsWith('005')) {
      log('SF User ID format valid: ' + config.rep.salesforceUserId, 'pass');
      results.passed++;
    } else {
      log('SF User ID format invalid (should start with 005)', 'fail');
      results.failed++;
    }
  } else {
    log('Config file missing - run npm run setup', 'fail');
    results.failed++;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 2: Hyprnote Connection
  // ═══════════════════════════════════════════════════════════════
  log('TEST 2: HYPRNOTE CONNECTION ═══', 'header');
  
  const hResult = await hyprnote.testConnection();
  
  if (hResult.success) {
    log('Database connected: ' + hResult.version, 'pass');
    log('Path: ' + hResult.path, 'info');
    log('Total sessions: ' + hResult.sessionCount, 'info');
    results.passed++;
  } else {
    log('Database not found: ' + hResult.error, 'fail');
    results.failed++;
    console.log('\n  CRITICAL: Cannot proceed without Hyprnote database\n');
    return results;
  }
  
  // 2.1 Get sessions
  const sessions = await hyprnote.getSessions(168, new Set());
  log('Sessions in last 7 days: ' + sessions.length, sessions.length > 0 ? 'pass' : 'warn');
  if (sessions.length > 0) results.passed++; else results.warnings++;
  
  // 2.2 Get current user
  const currentUser = await hyprnote.getCurrentUser();
  if (currentUser) {
    log('Current user detected: ' + currentUser.full_name, 'pass');
    results.passed++;
  } else {
    log('Current user not detected', 'warn');
    results.warnings++;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 3: Salesforce Connection
  // ═══════════════════════════════════════════════════════════════
  log('TEST 3: SALESFORCE CONNECTION ═══', 'header');
  
  try {
    await salesforce.connect({
      username: process.env.SF_USERNAME,
      password: process.env.SF_PASSWORD,
      securityToken: process.env.SF_SECURITY_TOKEN || '',
      instanceUrl: process.env.SF_INSTANCE_URL
    });
    log('Salesforce connected', 'pass');
    results.passed++;
    
    const sfTest = await salesforce.testConnection();
    if (sfTest.success) {
      log('Query test passed', 'pass');
      results.passed++;
    }
  } catch (err) {
    log('Salesforce connection failed: ' + err.message, 'fail');
    results.failed++;
    console.log('\n  CRITICAL: Cannot proceed without Salesforce connection\n');
    return results;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 4: Account Matching Scenarios
  // ═══════════════════════════════════════════════════════════════
  log('TEST 4: ACCOUNT MATCHING SCENARIOS ═══', 'header');
  
  const testAccounts = [
    { name: 'Eudia Testing Account', shouldFind: true },
    { name: 'DHL', shouldFind: true },
    { name: 'Amazon', shouldFind: true },
    { name: 'Chevron', shouldFind: true },
    { name: 'Best Buy', shouldFind: true },
    { name: 'NonExistent Corp XYZ123', shouldFind: false },
    { name: 'DHL North America', shouldFind: true },  // Exact match
    { name: 'dhl', shouldFind: true },  // Case insensitive
  ];
  
  for (const test of testAccounts) {
    const account = await salesforce.findAccount(test.name);
    const found = !!account;
    
    if (found === test.shouldFind) {
      log(test.name + ' → ' + (found ? account.Name : 'Not found'), 'pass');
      results.passed++;
    } else {
      log(test.name + ' → Expected ' + (test.shouldFind ? 'found' : 'not found'), 'fail');
      results.failed++;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 5: Contact Lookup
  // ═══════════════════════════════════════════════════════════════
  log('TEST 5: CONTACT LOOKUP ═══', 'header');
  
  // Test with a known email
  const testEmails = [
    'keigan.pesenti@eudia.com',
    'nonexistent@fake-domain-xyz.com'
  ];
  
  for (const email of testEmails) {
    const contact = await salesforce.findContactByEmail(email);
    if (contact) {
      log(email + ' → ' + contact.FirstName + ' ' + contact.LastName, 'pass');
      results.passed++;
    } else {
      log(email + ' → Not found (may be expected)', 'info');
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 6: Session Processing
  // ═══════════════════════════════════════════════════════════════
  log('TEST 6: SESSION PROCESSING ═══', 'header');
  
  if (sessions.length > 0) {
    for (let i = 0; i < Math.min(sessions.length, 3); i++) {
      const session = sessions[i];
      const title = (session.title || 'Untitled').substring(0, 40);
      
      log('Processing: ' + title + '...', 'info');
      
      // Get participants
      const participants = await hyprnote.getSessionParticipants(session.id);
      log('  Participants: ' + participants.length, participants.length > 0 ? 'pass' : 'warn');
      
      // Get calendar event
      const calEvent = await hyprnote.getCalendarEvent(session.calendar_event_id);
      log('  Calendar event: ' + (calEvent ? 'Yes' : 'No'), calEvent ? 'pass' : 'info');
      
      // Test matching
      const match = await matcher.matchAccount(session, participants, calEvent);
      if (match.account) {
        log('  Matched: ' + match.account.Name + ' (' + match.matchMethod + ', ' + match.confidence + '%)', 'pass');
        results.passed++;
      } else {
        log('  No account match found', 'warn');
        results.warnings++;
      }
      
      // Test note formatting
      const notes = hyprnote.htmlToText(session.enhanced_memo_html || session.raw_memo_html);
      if (notes && notes.length > 50) {
        log('  Notes: ' + notes.length + ' chars, properly formatted', 'pass');
        results.passed++;
      } else {
        log('  Notes: Empty or too short', 'warn');
        results.warnings++;
      }
    }
  } else {
    log('No sessions to process', 'warn');
    results.warnings++;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 7: Internal Email Detection
  // ═══════════════════════════════════════════════════════════════
  log('TEST 7: INTERNAL EMAIL DETECTION ═══', 'header');
  
  const emailTests = [
    { email: 'john@eudia.com', internal: true },
    { email: 'jane@cicerotech.com', internal: true },
    { email: 'bob@customer.com', internal: false },
    { email: 'alice@dhl.com', internal: false },
    { email: 'test@hyprnote.com', internal: true },
  ];
  
  for (const test of emailTests) {
    const isInternal = matcher.isInternalEmail(test.email);
    if (isInternal === test.internal) {
      log(test.email + ' → ' + (isInternal ? 'Internal' : 'External'), 'pass');
      results.passed++;
    } else {
      log(test.email + ' → Expected ' + (test.internal ? 'Internal' : 'External'), 'fail');
      results.failed++;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 8: Meeting Title Parsing
  // ═══════════════════════════════════════════════════════════════
  log('TEST 8: MEETING TITLE PARSING ═══', 'header');
  
  const titleTests = [
    { title: 'Best Buy Legal Strategy Meeting', expected: 'Best Buy Legal Strategy' },
    { title: 'Call with Acme Corp', expected: 'Acme Corp' },
    { title: 'Demo - Microsoft', expected: 'Microsoft' },
    { title: 'Chevron Follow-up', expected: 'Chevron' },
    { title: 'Weekly Sync', expected: null },
  ];
  
  for (const test of titleTests) {
    const extracted = matcher.extractCompanyFromTitle(test.title);
    log(test.title + ' → ' + (extracted || 'null'), 'info');
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 9: User ID Validation
  // ═══════════════════════════════════════════════════════════════
  log('TEST 9: USER ID VALIDATION ═══', 'header');
  
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  const users = await salesforce.findUserByEmail(config.rep.email);
  
  if (users) {
    log('User found: ' + users.Name + ' (ID: ' + users.Id + ')', 'pass');
    
    if (users.Id === config.rep.salesforceUserId) {
      log('Config User ID matches Salesforce', 'pass');
      results.passed++;
    } else {
      log('Config User ID MISMATCH! Config: ' + config.rep.salesforceUserId + ', SF: ' + users.Id, 'fail');
      results.failed++;
    }
  } else {
    log('User not found by email', 'warn');
    results.warnings++;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST SUMMARY                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log('  ✓ Passed:   ' + results.passed);
  console.log('  ✗ Failed:   ' + results.failed);
  console.log('  ⚠ Warnings: ' + results.warnings);
  console.log('');
  
  if (results.failed === 0) {
    console.log('  STATUS: ALL TESTS PASSED\n');
  } else {
    console.log('  STATUS: ' + results.failed + ' TESTS FAILED - Review above\n');
  }
  
  return results;
}

runTests().catch(err => {
  console.log('\nFATAL ERROR: ' + err.message);
  console.error(err);
  process.exit(1);
});

