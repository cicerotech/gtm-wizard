#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const salesforce = require('./lib/salesforce');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    });
  }
}

async function main() {
  loadEnv();
  
  await salesforce.connect({
    username: process.env.SF_USERNAME,
    password: process.env.SF_PASSWORD,
    securityToken: process.env.SF_SECURITY_TOKEN || '',
    instanceUrl: process.env.SF_INSTANCE_URL
  });
  
  const conn = salesforce.getConnection();
  
  // Find users
  console.log('\nLooking up Salesforce Users...\n');
  
  const result = await conn.query(`
    SELECT Id, Name, Email, IsActive 
    FROM User 
    WHERE Email LIKE '%keigan%' OR Name LIKE '%Keigan%' OR Email LIKE '%eudia%'
    LIMIT 10
  `);
  
  console.log('Found users:');
  result.records.forEach(u => {
    console.log('  ' + u.Name + ' | ' + u.Email + ' | ID: ' + u.Id + ' | Active: ' + u.IsActive);
  });
}

main().catch(err => console.log('Error:', err.message));

