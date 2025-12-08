require('dotenv').config();
const jsforce = require('jsforce');
const fs = require('fs');

/**
 * Salesforce Metadata Replication Tool
 * Extracts custom objects from Source SF and creates them in Target SF
 */

// Source Salesforce (Johnson Hana instance) - OAuth credentials from environment
const SOURCE_CONN = {
  oauth2: {
    clientId: process.env.SOURCE_SF_CLIENT_ID,
    clientSecret: process.env.SOURCE_SF_CLIENT_SECRET,
    loginUrl: 'https://login.salesforce.com'
  },
  username: process.env.SOURCE_SF_USERNAME,
  password: process.env.SOURCE_SF_PASSWORD
};

// Target Salesforce (Your Eudia instance - already configured in .env)
const TARGET_CONN = {
  oauth2: {
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
    loginUrl: process.env.SF_INSTANCE_URL
  },
  username: process.env.SF_USERNAME,
  password: process.env.SF_PASSWORD
};

async function connectToSalesforce(config, label) {
  console.log(`\n🔌 Connecting to ${label} Salesforce...`);
  
  // Use simple username-password login (works with OAuth orgs)
  const conn = new jsforce.Connection({
    loginUrl: config.oauth2.loginUrl || 'https://login.salesforce.com'
  });
  
  // Login with username + password (jsforce handles OAuth internally)
  await conn.login(config.username, config.password);
  
  console.log(`✅ Connected to ${label} SF`);
  console.log(`   Instance: ${conn.instanceUrl}`);
  console.log(`   User: ${config.username}`);
  console.log(`   Access Token: ${conn.accessToken ? 'Obtained' : 'Missing'}`);
  
  return conn;
}

async function extractCustomObjects(sourceConn) {
  console.log(`\n📊 Extracting custom objects from Source SF...`);
  
  // Get all custom objects (those ending in __c)
  const describeResult = await sourceConn.describeGlobal();
  const customObjects = describeResult.sobjects
    .filter(obj => obj.custom && obj.name.startsWith('pse__'))
    .map(obj => obj.name);
  
  console.log(`\n✅ Found ${customObjects.length} pse__ custom objects:`);
  customObjects.forEach((obj, i) => {
    console.log(`   ${i + 1}. ${obj}`);
  });
  
  return customObjects;
}

async function extractObjectMetadata(sourceConn, objectName) {
  console.log(`\n📋 Extracting metadata for: ${objectName}`);
  
  // Describe the object to get all fields
  const describe = await sourceConn.sobject(objectName).describe();
  
  const metadata = {
    apiName: describe.name,
    label: describe.label,
    pluralLabel: describe.labelPlural,
    fields: describe.fields
      .filter(f => f.custom) // Only custom fields
      .map(f => ({
        apiName: f.name,
        label: f.label,
        type: f.type,
        length: f.length,
        precision: f.precision,
        scale: f.scale,
        required: !f.nillable,
        unique: f.unique,
        externalId: f.externalId,
        defaultValue: f.defaultValue,
        picklistValues: f.picklistValues,
        referenceTo: f.referenceTo,
        relationshipName: f.relationshipName,
        formula: f.calculatedFormula,
        helpText: f.inlineHelpText
      }))
  };
  
  console.log(`   ✅ ${describe.label}: ${metadata.fields.length} custom fields`);
  
  return metadata;
}

async function generateCreationReport(allMetadata) {
  console.log(`\n📝 Generating creation report...`);
  
  let report = `# Salesforce Object Replication Report\n\n`;
  report += `Generated: ${new Date().toISOString()}\n\n`;
  report += `## Objects to Create: ${allMetadata.length}\n\n`;
  
  allMetadata.forEach((obj, i) => {
    report += `### ${i + 1}. ${obj.label} (${obj.apiName})\n`;
    report += `   - ${obj.fields.length} custom fields\n`;
    report += `   - Fields: ${obj.fields.map(f => f.label).join(', ')}\n\n`;
  });
  
  fs.writeFileSync('REPLICATION_REPORT.md', report);
  console.log(`   ✅ Report saved: REPLICATION_REPORT.md`);
  
  return report;
}

async function main() {
  try {
    console.log('🚀 Salesforce Metadata Replication Tool');
    console.log('========================================\n');
    
    // Step 1: Connect to Source SF (OAuth)
    const sourceConn = await connectToSalesforce(SOURCE_CONN, 'Source');
    
    // Step 2: Use existing Target SF connection from GTM-brain
    console.log(`\n🔌 Using existing Target SF connection...`);
    const { sfConnection } = require('./src/salesforce/connection');
    await sfConnection.initialize();
    const targetConn = sfConnection.getConnection();
    console.log(`✅ Connected to Target SF (Eudia instance)`);
    
    // Step 2: Extract custom objects from Source
    const customObjects = await extractCustomObjects(sourceConn);
    
    // Step 3: Extract detailed metadata for each object
    const allMetadata = [];
    for (const objectName of customObjects) {
      const metadata = await extractObjectMetadata(sourceConn, objectName);
      allMetadata.push(metadata);
    }
    
    // Step 4: Generate report
    const report = await generateCreationReport(allMetadata);
    
    console.log('\n========================================');
    console.log('✅ Extraction Complete!');
    console.log('========================================');
    console.log(`\nExtracted metadata for ${allMetadata.length} objects`);
    console.log(`Total custom fields: ${allMetadata.reduce((sum, obj) => sum + obj.fields.length, 0)}`);
    console.log(`\nReport saved: REPLICATION_REPORT.md`);
    console.log(`\nNext: Review report, then I'll create objects in Target SF`);
    
    // Save metadata to JSON for creation phase
    fs.writeFileSync('source-metadata.json', JSON.stringify(allMetadata, null, 2));
    console.log(`Metadata JSON saved: source-metadata.json`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run extraction
main();

