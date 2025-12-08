#!/usr/bin/env node

/**
 * Test script to verify all connections are working
 */

require('dotenv').config();
const logger = require('./src/utils/logger');

async function testConnections() {
  console.log('🧪 Testing GTM Brain connections...\n');

  let allTestsPassed = true;

  // Test 1: Environment Variables
  console.log('1️⃣ Testing environment variables...');
  const requiredEnvVars = [
    'SLACK_BOT_TOKEN',
    'SLACK_SIGNING_SECRET',
    'SF_CLIENT_ID',
    'SF_CLIENT_SECRET',
    'SF_INSTANCE_URL',
    'SF_USERNAME',
    'SF_PASSWORD',
    'SF_SECURITY_TOKEN',
    'OPENAI_API_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.log('❌ Missing environment variables:', missingVars.join(', '));
    allTestsPassed = false;
  } else {
    console.log('✅ All required environment variables present');
  }

  // Test 2: Redis Connection
  console.log('\n2️⃣ Testing Redis connection...');
  try {
    const { initializeRedis } = require('./src/utils/cache');
    await initializeRedis();
    console.log('✅ Redis connection successful');
  } catch (error) {
    console.log('❌ Redis connection failed:', error.message);
    console.log('   Make sure Redis is running on', process.env.REDIS_URL || 'redis://localhost:6379');
    allTestsPassed = false;
  }

  // Test 3: AI Service Connection (Socrates or OpenAI)
  console.log('\n3️⃣ Testing AI service connection...');
  try {
    const useOpenAI = process.env.USE_OPENAI === 'true';
    
    if (useOpenAI) {
      console.log('   Using OpenAI...');
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a test.' }],
        max_tokens: 5
      });

      if (response.choices && response.choices.length > 0) {
        console.log('✅ OpenAI connection successful');
      } else {
        console.log('❌ OpenAI returned unexpected response');
        allTestsPassed = false;
      }
    } else {
      console.log('   Using Socrates internal API...');
      const { socratesAdapter } = require('./src/ai/socratesAdapter');
      
      const isConnected = await socratesAdapter.testConnection();
      if (isConnected) {
        console.log('✅ Socrates connection successful');
      } else {
        console.log('❌ Socrates connection failed');
        console.log('   Please check your API key and Socrates endpoint configuration');
        allTestsPassed = false;
      }
    }
  } catch (error) {
    console.log('❌ AI service connection failed:', error.message);
    console.log('   Please check your API configuration');
    allTestsPassed = false;
  }

  // Test 4: Salesforce Connection
  console.log('\n4️⃣ Testing Salesforce connection...');
  try {
    const { initializeSalesforce, testConnection } = require('./src/salesforce/connection');
    await initializeSalesforce();
    
    const isConnected = await testConnection();
    if (isConnected) {
      console.log('✅ Salesforce connection successful');
    } else {
      console.log('❌ Salesforce connection test failed');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('❌ Salesforce connection failed:', error.message);
    console.log('   Please check your credentials and network connectivity');
    allTestsPassed = false;
  }

  // Test 5: Query Builder
  console.log('\n5️⃣ Testing query builder...');
  try {
    const { queryBuilder } = require('./src/salesforce/queries');
    const testQuery = queryBuilder.buildOpportunityQuery({
      timeframe: 'this_month',
      isClosed: false,
      limit: 5
    });

    if (testQuery.includes('SELECT') && testQuery.includes('FROM Opportunity')) {
      console.log('✅ Query builder working correctly');
      console.log('   Sample query:', testQuery.substring(0, 100) + '...');
    } else {
      console.log('❌ Query builder returned invalid query');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('❌ Query builder test failed:', error.message);
    allTestsPassed = false;
  }

  // Test 6: Intent Parser
  console.log('\n6️⃣ Testing intent parser...');
  try {
    const { parseIntent } = require('./src/ai/intentParser');
    const testIntent = await parseIntent('show me my pipeline', null, 'test_user');

    if (testIntent.intent && testIntent.entities) {
      console.log('✅ Intent parser working correctly');
      console.log('   Sample intent:', testIntent.intent);
    } else {
      console.log('❌ Intent parser returned invalid response');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('❌ Intent parser test failed:', error.message);
    allTestsPassed = false;
  }

  // Final Results
  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    console.log('🎉 All tests passed! GTM Brain is ready to use.');
    console.log('\nTo start the bot, run:');
    console.log('  npm start');
    console.log('\nFor development mode:');
    console.log('  npm run dev');
  } else {
    console.log('❌ Some tests failed. Please fix the issues above before starting the bot.');
    process.exit(1);
  }
}

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted');
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run tests
testConnections().catch((error) => {
  console.error('❌ Test suite failed:', error.message);
  process.exit(1);
});
