/**
 * Salesforce API Client
 * 
 * Handles authentication and CRUD operations for syncing meeting notes.
 * Uses jsforce library for API calls.
 * 
 * Supports two auth methods:
 * 1. Username/Password (legacy) - for CLI sync
 * 2. OAuth 2.0 (preferred) - for Electron app with token refresh
 */

const jsforce = require('jsforce');
const fs = require('fs');
const path = require('path');

let connection = null;

// OAuth configuration for Eudia Connected App
// These should be set in environment or passed in
const OAUTH_CONFIG = {
  clientId: process.env.SF_OAUTH_CLIENT_ID || '',
  clientSecret: process.env.SF_OAUTH_CLIENT_SECRET || '',
  redirectUri: 'http://localhost:3000/oauth/callback',
  loginUrl: 'https://login.salesforce.com'
};

/**
 * Initialize Salesforce connection (username/password method)
 * @param {Object} config - Configuration with SF credentials
 */
async function connect(config) {
  const conn = new jsforce.Connection({
    loginUrl: config.loginUrl || 'https://login.salesforce.com',
    instanceUrl: config.instanceUrl
  });
  
  await conn.login(
    config.username,
    config.password + (config.securityToken || '')
  );
  
  connection = conn;
  return conn;
}

/**
 * Initialize Salesforce connection using OAuth tokens
 * @param {Object} tokens - OAuth tokens (accessToken, refreshToken, instanceUrl)
 */
async function connectWithOAuth(tokens) {
  const conn = new jsforce.Connection({
    oauth2: {
      clientId: OAUTH_CONFIG.clientId,
      clientSecret: OAUTH_CONFIG.clientSecret,
      redirectUri: OAUTH_CONFIG.redirectUri
    },
    instanceUrl: tokens.instanceUrl,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken
  });
  
  // Set up auto-refresh
  conn.on('refresh', (accessToken, res) => {
    console.log('Salesforce token refreshed');
    // Store the new access token
    saveOAuthTokens({
      ...tokens,
      accessToken
    });
  });
  
  connection = conn;
  return conn;
}

/**
 * Get OAuth authorization URL for user to login
 */
function getOAuthAuthorizationUrl() {
  const oauth2 = new jsforce.OAuth2({
    clientId: OAUTH_CONFIG.clientId,
    clientSecret: OAUTH_CONFIG.clientSecret,
    redirectUri: OAUTH_CONFIG.redirectUri,
    loginUrl: OAUTH_CONFIG.loginUrl
  });
  
  return oauth2.getAuthorizationUrl({ scope: 'api refresh_token' });
}

/**
 * Exchange OAuth authorization code for tokens
 * @param {string} code - Authorization code from callback
 */
async function exchangeOAuthCode(code) {
  const oauth2 = new jsforce.OAuth2({
    clientId: OAUTH_CONFIG.clientId,
    clientSecret: OAUTH_CONFIG.clientSecret,
    redirectUri: OAUTH_CONFIG.redirectUri
  });
  
  const conn = new jsforce.Connection({ oauth2 });
  await conn.authorize(code);
  
  const tokens = {
    accessToken: conn.accessToken,
    refreshToken: conn.refreshToken,
    instanceUrl: conn.instanceUrl
  };
  
  connection = conn;
  return tokens;
}

/**
 * Save OAuth tokens securely
 * In production, use macOS Keychain via 'keytar' package
 * @param {Object} tokens - OAuth tokens
 */
function saveOAuthTokens(tokens) {
  // For now, save to file (in production, use keytar for Keychain)
  const tokensPath = path.join(__dirname, '..', 'data', '.oauth-tokens.json');
  try {
    fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    return true;
  } catch (err) {
    console.error('Failed to save OAuth tokens:', err);
    return false;
  }
}

/**
 * Load OAuth tokens
 */
function loadOAuthTokens() {
  const tokensPath = path.join(__dirname, '..', 'data', '.oauth-tokens.json');
  try {
    if (fs.existsSync(tokensPath)) {
      return JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load OAuth tokens:', err);
  }
  return null;
}

/**
 * Clear stored OAuth tokens (logout)
 */
function clearOAuthTokens() {
  const tokensPath = path.join(__dirname, '..', 'data', '.oauth-tokens.json');
  try {
    if (fs.existsSync(tokensPath)) {
      fs.unlinkSync(tokensPath);
    }
    connection = null;
    return true;
  } catch (err) {
    console.error('Failed to clear OAuth tokens:', err);
    return false;
  }
}

/**
 * Check if OAuth is configured
 */
function isOAuthConfigured() {
  return !!(OAUTH_CONFIG.clientId && OAUTH_CONFIG.clientSecret);
}

/**
 * Try to connect using stored OAuth tokens
 */
async function tryAutoConnect() {
  const tokens = loadOAuthTokens();
  if (tokens && tokens.accessToken) {
    try {
      await connectWithOAuth(tokens);
      // Test the connection
      const test = await testConnection();
      if (test.success) {
        return true;
      }
    } catch (err) {
      console.log('Auto-connect failed:', err.message);
    }
  }
  return false;
}

/**
 * Get the current connection
 */
function getConnection() {
  if (!connection) {
    throw new Error('Salesforce not connected. Call connect() first.');
  }
  return connection;
}

/**
 * Search for Account by name (fuzzy match)
 * @param {string} companyName - Company name to search
 */
async function findAccount(companyName) {
  if (!companyName) return null;
  
  const conn = getConnection();
  
  // Clean company name for search
  const cleanName = companyName
    .replace(/\s*(Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Company|Co\.?)\s*$/i, '')
    .trim();
  
  // Try exact match first
  let result = await conn.query(`
    SELECT Id, Name, OwnerId, Owner.Name, Customer_Brain__c
    FROM Account
    WHERE Name = '${cleanName.replace(/'/g, "\\'")}'
    LIMIT 1
  `);
  
  if (result.records && result.records.length > 0) {
    return result.records[0];
  }
  
  // Try LIKE match
  const searchTerm = cleanName.substring(0, 20).replace(/'/g, "\\'");
  result = await conn.query(`
    SELECT Id, Name, OwnerId, Owner.Name, Customer_Brain__c
    FROM Account
    WHERE Name LIKE '%${searchTerm}%'
    ORDER BY Name
    LIMIT 5
  `);
  
  if (result.records && result.records.length > 0) {
    // Return shortest matching name (most specific)
    return result.records.sort((a, b) => a.Name.length - b.Name.length)[0];
  }
  
  return null;
}

/**
 * Search for Contact by email
 * @param {string} email - Email address
 */
async function findContactByEmail(email) {
  if (!email) return null;
  
  const conn = getConnection();
  
  const result = await conn.query(`
    SELECT Id, FirstName, LastName, Email, Title, AccountId, Account.Name
    FROM Contact
    WHERE Email = '${email.replace(/'/g, "\\'")}'
    LIMIT 1
  `);
  
  return result.records && result.records.length > 0 ? result.records[0] : null;
}

/**
 * Create a new Contact
 * @param {Object} data - Contact data
 */
async function createContact(data) {
  const conn = getConnection();
  
  const result = await conn.sobject('Contact').create({
    FirstName: data.firstName || '',
    LastName: data.lastName || 'Unknown',
    Email: data.email,
    Title: data.title || '',
    AccountId: data.accountId || null
  });
  
  return result;
}

/**
 * Format datetime for Salesforce (remove microseconds)
 */
function formatSalesforceDateTime(dateStr) {
  if (!dateStr) return null;
  // Convert to ISO format without microseconds
  const date = new Date(dateStr);
  return date.toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

/**
 * Create an Event (meeting record)
 * @param {Object} data - Event data
 */
async function createEvent(data) {
  const conn = getConnection();
  
  // Format times for Salesforce
  const startTime = formatSalesforceDateTime(data.startTime);
  const endTime = formatSalesforceDateTime(data.endTime) || formatSalesforceDateTime(new Date(new Date(data.startTime).getTime() + 30*60000)); // Default 30 min
  
  const eventData = {
    Subject: (data.subject || 'Meeting').substring(0, 255),
    Description: (data.description || '').substring(0, 32000),
    StartDateTime: startTime,
    EndDateTime: endTime,
    IsAllDayEvent: false
  };
  
  // Link to Contact (WhoId)
  if (data.contactId) {
    eventData.WhoId = data.contactId;
  }
  
  // Link to Account (WhatId) - only if no contact
  if (data.accountId && !data.contactId) {
    eventData.WhatId = data.accountId;
  }
  
  // Set owner (the rep who recorded the meeting)
  if (data.ownerId) {
    eventData.OwnerId = data.ownerId;
  }
  
  const result = await conn.sobject('Event').create(eventData);
  return result;
}

/**
 * Create a Task (fallback if Event fails)
 * @param {Object} data - Task data
 */
async function createTask(data) {
  const conn = getConnection();
  
  const taskData = {
    Subject: (data.subject || 'Meeting Notes').substring(0, 255),
    Description: (data.description || '').substring(0, 32000),
    Status: 'Completed',
    Priority: 'Normal',
    ActivityDate: data.activityDate
  };
  
  if (data.contactId) taskData.WhoId = data.contactId;
  if (data.accountId) taskData.WhatId = data.accountId;
  if (data.ownerId) taskData.OwnerId = data.ownerId;
  
  const result = await conn.sobject('Task').create(taskData);
  return result;
}

/**
 * Update Account's Customer_Brain__c field
 * @param {string} accountId - Account ID
 * @param {string} newEntry - New content to prepend
 */
async function updateCustomerBrain(accountId, newEntry) {
  const conn = getConnection();
  
  // Get current Customer_Brain value
  const account = await conn.sobject('Account').retrieve(accountId);
  const existingBrain = account.Customer_Brain__c || '';
  
  // Prepend new entry (most recent first)
  const updatedBrain = newEntry + '\n\n' + existingBrain;
  
  // Update Account
  const result = await conn.sobject('Account').update({
    Id: accountId,
    Customer_Brain__c: updatedBrain.substring(0, 131072) // SF long text limit
  });
  
  return result;
}

/**
 * Look up a User by name
 * @param {string} name - User's name
 */
async function findUserByName(name) {
  if (!name) return null;
  
  const conn = getConnection();
  
  const result = await conn.query(`
    SELECT Id, Name, Email
    FROM User
    WHERE Name LIKE '%${name.replace(/'/g, "\\'")}%'
      AND IsActive = true
    LIMIT 5
  `);
  
  return result.records || [];
}

/**
 * Look up a User by email
 * @param {string} email - User's email
 */
async function findUserByEmail(email) {
  if (!email) return null;
  
  const conn = getConnection();
  
  const result = await conn.query(`
    SELECT Id, Name, Email
    FROM User
    WHERE Email = '${email.replace(/'/g, "\\'")}'
      AND IsActive = true
    LIMIT 1
  `);
  
  return result.records && result.records.length > 0 ? result.records[0] : null;
}

/**
 * Test the connection
 */
async function testConnection() {
  try {
    const conn = getConnection();
    const result = await conn.query('SELECT Id, Name FROM Account LIMIT 1');
    return {
      success: true,
      sampleAccount: result.records[0]?.Name || 'N/A'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  // Authentication
  connect,
  connectWithOAuth,
  getOAuthAuthorizationUrl,
  exchangeOAuthCode,
  saveOAuthTokens,
  loadOAuthTokens,
  clearOAuthTokens,
  isOAuthConfigured,
  tryAutoConnect,
  getConnection,
  
  // Queries
  findAccount,
  findContactByEmail,
  findUserByName,
  findUserByEmail,
  
  // CRUD
  createContact,
  createEvent,
  createTask,
  updateCustomerBrain,
  
  // Utilities
  testConnection
};

