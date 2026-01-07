#!/usr/bin/env node
/**
 * Contact Enrichment Test Data Generator
 * Pulls real contacts from Salesforce and generates test fixtures
 * Run weekly to keep test data fresh as contacts are added
 * 
 * Usage: node scripts/generate-contact-test-data.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query } = require('../src/salesforce/connection');
const logger = require('../src/utils/logger');

// Name variations for fuzzy matching tests
const NAME_VARIATIONS = {
  'Robert': ['Bob', 'Rob', 'Robbie'],
  'William': ['Bill', 'Will', 'Billy'],
  'Michael': ['Mike', 'Mick', 'Mickey'],
  'James': ['Jim', 'Jimmy', 'Jamie'],
  'Thomas': ['Tom', 'Tommy'],
  'Richard': ['Dick', 'Rick', 'Rich'],
  'Joseph': ['Joe', 'Joey'],
  'Daniel': ['Dan', 'Danny'],
  'David': ['Dave', 'Davy'],
  'Steven': ['Steve', 'Stevie'],
  'Christopher': ['Chris'],
  'Matthew': ['Matt', 'Matty'],
  'Anthony': ['Tony'],
  'Nicholas': ['Nick', 'Nicky'],
  'Alexander': ['Alex'],
  'Edward': ['Ed', 'Eddie', 'Ted'],
  'Charles': ['Charlie', 'Chuck'],
  'John': ['Jack', 'Johnny'],
  'Katherine': ['Kate', 'Katie', 'Kathy'],
  'Elizabeth': ['Liz', 'Lizzy', 'Beth', 'Betty'],
  'Jennifer': ['Jenny', 'Jen'],
  'Samuel': ['Sam', 'Sammy'],
  'Benjamin': ['Ben', 'Benny'],
  'Andrew': ['Andy', 'Drew'],
  'Patrick': ['Pat', 'Paddy'],
  'Margaret': ['Meg', 'Maggie', 'Peggy'],
  'Susan': ['Sue', 'Suzy', 'Susie'],
  'Barbara': ['Barb', 'Barbie'],
  'Deborah': ['Deb', 'Debbie'],
  'Victoria': ['Vicky', 'Vic'],
  'Stephanie': ['Steph', 'Stephie'],
  'Rebecca': ['Becky', 'Becca'],
  'Lawrence': ['Larry'],
  'Gregory': ['Greg'],
  'Phillip': ['Phil'],
  'Ronald': ['Ron'],
  'Donald': ['Don', 'Donny'],
  'Raymond': ['Ray'],
  'Timothy': ['Tim', 'Timmy'],
  'Frederick': ['Fred', 'Freddy']
};

// Company abbreviations for matching tests
const COMPANY_ABBREVIATIONS = {
  'Microsoft Corporation': ['Microsoft', 'MSFT', 'MS'],
  'International Business Machines': ['IBM'],
  'General Electric': ['GE'],
  'Johnson & Johnson': ['J&J', 'JNJ'],
  'Procter & Gamble': ['P&G', 'PG'],
  'American Express': ['Amex'],
  'Hewlett-Packard': ['HP'],
  'Bank of America': ['BofA', 'BoA'],
  'Goldman Sachs': ['GS'],
  'Morgan Stanley': ['MS']
};

async function generateContactTestData() {
  console.log('🔄 Starting contact test data generation...\n');

  try {
    // 1. Query SF for diverse contact sample
    console.log('📥 Fetching contacts from Salesforce...');
    
    const contactsResult = await query(`
      SELECT Id, FirstName, LastName, Name, Title, Email, MobilePhone, Phone,
             Account.Id, Account.Name, Owner.Name, OwnerId,
             MailingCity, MailingState, CreatedDate, LastModifiedDate
      FROM Contact
      WHERE Account.Name != null
      ORDER BY LastModifiedDate DESC
      LIMIT 300
    `);

    const contacts = contactsResult.records || [];
    console.log(`✅ Fetched ${contacts.length} contacts\n`);

    // 2. Also query Leads
    console.log('📥 Fetching leads from Salesforce...');
    
    const leadsResult = await query(`
      SELECT Id, FirstName, LastName, Name, Title, Email, MobilePhone, Phone,
             Company, Owner.Name, OwnerId, City, State, Status,
             CreatedDate, LastModifiedDate
      FROM Lead
      WHERE IsConverted = false
      ORDER BY LastModifiedDate DESC
      LIMIT 100
    `);

    const leads = leadsResult.records || [];
    console.log(`✅ Fetched ${leads.length} leads\n`);

    // 3. Categorize contacts by completeness
    console.log('📊 Categorizing contacts...');
    
    const complete = contacts.filter(c => c.Email && c.MobilePhone);
    const incomplete = contacts.filter(c => !c.Email || !c.MobilePhone);
    const emailOnly = contacts.filter(c => c.Email && !c.MobilePhone);
    const phoneOnly = contacts.filter(c => !c.Email && c.MobilePhone);
    const noContactInfo = contacts.filter(c => !c.Email && !c.MobilePhone && !c.Phone);

    console.log(`  Complete (email + phone): ${complete.length}`);
    console.log(`  Email only: ${emailOnly.length}`);
    console.log(`  Phone only: ${phoneOnly.length}`);
    console.log(`  No contact info: ${noContactInfo.length}\n`);

    // 4. Generate name variations for fuzzy test
    console.log('🔤 Generating name variations...');
    const variations = generateNameVariations(contacts);
    console.log(`  Generated ${variations.length} name variation test cases\n`);

    // 5. Build comprehensive test cases
    console.log('🧪 Building test cases...');
    const testCases = buildTestCases(contacts, leads);
    console.log(`  Built ${testCases.total} test cases\n`);

    // 6. Save to test fixtures
    const outputPath = path.join(__dirname, '../data/contact-test-fixtures.json');
    
    const testData = {
      generatedAt: new Date().toISOString(),
      stats: {
        totalContacts: contacts.length,
        totalLeads: leads.length,
        complete: complete.length,
        incomplete: incomplete.length,
        emailOnly: emailOnly.length,
        phoneOnly: phoneOnly.length,
        noContactInfo: noContactInfo.length,
        nameVariationTests: variations.length,
        totalTestCases: testCases.total
      },
      categories: {
        completeRecords: complete.slice(0, 50).map(formatContact),
        incompleteRecords: incomplete.slice(0, 50).map(formatContact),
        emailOnlyRecords: emailOnly.slice(0, 25).map(formatContact),
        phoneOnlyRecords: phoneOnly.slice(0, 25).map(formatContact),
        leadsToTest: leads.slice(0, 25).map(formatLead)
      },
      nameVariations: variations,
      companyVariations: buildCompanyVariations(contacts),
      testCases: testCases.cases,
      queryTemplates: {
        simpleNameCompany: testCases.cases.filter(tc => tc.type === 'name_company').slice(0, 20),
        nicknameTests: testCases.cases.filter(tc => tc.type === 'nickname'),
        companyAbbreviations: testCases.cases.filter(tc => tc.type === 'company_abbr'),
        lastNameOnly: testCases.cases.filter(tc => tc.type === 'lastname_only').slice(0, 10),
        withTitle: testCases.cases.filter(tc => tc.type === 'with_title').slice(0, 10)
      }
    };

    fs.writeFileSync(outputPath, JSON.stringify(testData, null, 2));
    console.log(`✅ Saved test fixtures to: ${outputPath}\n`);

    // 7. Print summary
    console.log('═══════════════════════════════════════════════════');
    console.log('📋 TEST DATA GENERATION SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Total Contacts:      ${contacts.length}`);
    console.log(`  Total Leads:         ${leads.length}`);
    console.log(`  Complete Records:    ${complete.length} (${Math.round(complete.length/contacts.length*100)}%)`);
    console.log(`  Incomplete Records:  ${incomplete.length} (${Math.round(incomplete.length/contacts.length*100)}%)`);
    console.log(`  Name Variation Tests: ${variations.length}`);
    console.log(`  Total Test Cases:    ${testCases.total}`);
    console.log('═══════════════════════════════════════════════════\n');

    console.log('🎯 Test categories created:');
    console.log('  1. Complete SF records (should skip enrichment)');
    console.log('  2. Incomplete SF records (should trigger enrichment)');
    console.log('  3. Name variations (fuzzy matching test)');
    console.log('  4. Company abbreviations (company matching test)');
    console.log('  5. Last name only searches');
    console.log('  6. Name + Title + Company searches\n');

    return testData;

  } catch (error) {
    console.error('❌ Error generating test data:', error);
    throw error;
  }
}

/**
 * Generate name variation test cases from real contacts
 */
function generateNameVariations(contacts) {
  const variations = [];

  for (const contact of contacts) {
    const firstName = contact.FirstName || '';
    const lastName = contact.LastName || '';
    
    if (!firstName || !lastName) continue;

    // Check if first name has known variations
    const formalName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
    
    for (const [formal, nicknames] of Object.entries(NAME_VARIATIONS)) {
      if (formalName === formal) {
        // Add nickname test cases
        for (const nickname of nicknames) {
          variations.push({
            input: `${nickname} ${lastName}`,
            expectedSFName: `${firstName} ${lastName}`,
            sfFirstName: firstName,
            sfLastName: lastName,
            company: contact.Account?.Name,
            sfId: contact.Id,
            variationType: 'nickname_to_formal'
          });
        }
      }
      
      // Also check reverse (if contact has nickname stored)
      if (nicknames.map(n => n.toLowerCase()).includes(firstName.toLowerCase())) {
        variations.push({
          input: `${formal} ${lastName}`,
          expectedSFName: `${firstName} ${lastName}`,
          sfFirstName: firstName,
          sfLastName: lastName,
          company: contact.Account?.Name,
          sfId: contact.Id,
          variationType: 'formal_to_nickname'
        });
      }
    }
  }

  // Deduplicate and limit
  const seen = new Set();
  return variations.filter(v => {
    const key = `${v.input}-${v.sfId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 100);
}

/**
 * Build company variation test cases
 */
function buildCompanyVariations(contacts) {
  const variations = [];
  const seenCompanies = new Set();

  for (const contact of contacts) {
    const company = contact.Account?.Name;
    if (!company || seenCompanies.has(company)) continue;
    seenCompanies.add(company);

    // Check for known abbreviations
    for (const [fullName, abbrs] of Object.entries(COMPANY_ABBREVIATIONS)) {
      if (company.toLowerCase().includes(fullName.toLowerCase().split(' ')[0])) {
        for (const abbr of abbrs) {
          variations.push({
            input: `${contact.FirstName} ${contact.LastName} at ${abbr}`,
            expectedCompany: company,
            sfId: contact.Id,
            abbreviation: abbr
          });
        }
      }
    }

    // Test with/without common suffixes
    const suffixes = ['Inc', 'Inc.', 'Corporation', 'Corp', 'LLC', 'Ltd'];
    for (const suffix of suffixes) {
      if (company.includes(suffix)) {
        const withoutSuffix = company.replace(new RegExp(`\\s*${suffix}\\.?\\s*$`, 'i'), '').trim();
        variations.push({
          input: `${contact.FirstName} ${contact.LastName} at ${withoutSuffix}`,
          expectedCompany: company,
          sfId: contact.Id,
          variationType: 'suffix_removed'
        });
        break;
      }
    }
  }

  return variations.slice(0, 50);
}

/**
 * Build comprehensive test cases
 */
function buildTestCases(contacts, leads) {
  const cases = [];

  // 1. Simple name + company queries
  for (const contact of contacts.slice(0, 30)) {
    if (contact.FirstName && contact.LastName && contact.Account?.Name) {
      cases.push({
        type: 'name_company',
        input: `${contact.FirstName} ${contact.LastName} at ${contact.Account.Name}`,
        expectedId: contact.Id,
        expectedName: contact.Name,
        expectedCompany: contact.Account.Name,
        hasEmail: !!contact.Email,
        hasPhone: !!(contact.MobilePhone || contact.Phone)
      });
    }
  }

  // 2. Last name only queries
  for (const contact of contacts.slice(0, 20)) {
    if (contact.LastName && contact.Account?.Name) {
      cases.push({
        type: 'lastname_only',
        input: `${contact.LastName} at ${contact.Account.Name}`,
        expectedId: contact.Id,
        expectedName: contact.Name,
        mayMatchMultiple: true
      });
    }
  }

  // 3. With title queries
  for (const contact of contacts.filter(c => c.Title).slice(0, 15)) {
    cases.push({
      type: 'with_title',
      input: `${contact.FirstName} ${contact.LastName}, ${contact.Title} at ${contact.Account?.Name}`,
      expectedId: contact.Id,
      expectedName: contact.Name,
      expectedTitle: contact.Title
    });
  }

  // 4. Nickname test cases (from name variations)
  const nicknameContacts = contacts.filter(c => {
    const firstName = (c.FirstName || '').toLowerCase();
    return Object.keys(NAME_VARIATIONS).some(formal => 
      formal.toLowerCase() === firstName
    );
  }).slice(0, 15);

  for (const contact of nicknameContacts) {
    const formal = contact.FirstName;
    const nicknames = NAME_VARIATIONS[formal.charAt(0).toUpperCase() + formal.slice(1).toLowerCase()] || [];
    
    if (nicknames.length > 0) {
      cases.push({
        type: 'nickname',
        input: `${nicknames[0]} ${contact.LastName} at ${contact.Account?.Name}`,
        expectedId: contact.Id,
        expectedName: contact.Name,
        nicknameUsed: nicknames[0],
        formalName: formal
      });
    }
  }

  // 5. Lead test cases
  for (const lead of leads.slice(0, 15)) {
    if (lead.FirstName && lead.LastName && lead.Company) {
      cases.push({
        type: 'lead',
        input: `${lead.FirstName} ${lead.LastName} at ${lead.Company}`,
        expectedId: lead.Id,
        expectedName: lead.Name,
        isLead: true,
        hasEmail: !!lead.Email,
        hasPhone: !!(lead.MobilePhone || lead.Phone)
      });
    }
  }

  return {
    total: cases.length,
    cases
  };
}

/**
 * Format contact for output
 */
function formatContact(contact) {
  return {
    id: contact.Id,
    firstName: contact.FirstName,
    lastName: contact.LastName,
    name: contact.Name,
    title: contact.Title,
    email: contact.Email,
    mobilePhone: contact.MobilePhone,
    phone: contact.Phone,
    accountId: contact.Account?.Id,
    accountName: contact.Account?.Name,
    ownerName: contact.Owner?.Name,
    city: contact.MailingCity,
    state: contact.MailingState,
    isComplete: !!(contact.Email && contact.MobilePhone)
  };
}

/**
 * Format lead for output
 */
function formatLead(lead) {
  return {
    id: lead.Id,
    firstName: lead.FirstName,
    lastName: lead.LastName,
    name: lead.Name,
    title: lead.Title,
    email: lead.Email,
    mobilePhone: lead.MobilePhone,
    phone: lead.Phone,
    company: lead.Company,
    ownerName: lead.Owner?.Name,
    city: lead.City,
    state: lead.State,
    status: lead.Status,
    isComplete: !!(lead.Email && lead.MobilePhone)
  };
}

// Run if executed directly
if (require.main === module) {
  generateContactTestData()
    .then(() => {
      console.log('✅ Test data generation complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

module.exports = { generateContactTestData };

