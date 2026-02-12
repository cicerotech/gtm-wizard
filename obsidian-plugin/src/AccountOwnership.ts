/**
 * AccountOwnership - Maps users to their owned Salesforce accounts
 * 
 * This module provides the account-to-owner mapping for tailored vault setup.
 * When a user connects to Salesforce, only their owned accounts are imported.
 * 
 * Data source: Business Lead 2026 Accounts spreadsheet
 */

// ═══════════════════════════════════════════════════════════════════════════
// USER GROUP CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Admin users who can see ALL accounts (not just their owned ones).
 * These users get "owned + read-only view of all" access.
 */
export const ADMIN_EMAILS = [
  'keigan.pesenti@eudia.com',
  'michael.ayres@eudia.com',
  'michael.ayers@eudia.com',   // alternate spelling
  'mike.flynn@eudia.com',
  'michael.flynn@eudia.com',   // alternate spelling
  'zack@eudia.com',
  'zach@eudia.com'             // alternate spelling
];

/**
 * Exec users - treated as admin for account visibility
 */
export const EXEC_EMAILS = [
  'omar@eudia.com',
  'david@eudia.com',
  'ashish@eudia.com',
  'siddharth.saxena@eudia.com'  // Product Ops & Partnerships Lead
];

/**
 * Sales Leaders with their regions for roll-up views
 */
export const SALES_LEADERS: Record<string, { name: string; region: string; role: string }> = {
  'mitchell.loquaci@eudia.com': { name: 'Mitchell Loquaci', region: 'US', role: 'RVP Sales' },
  'stephen.mulholland@eudia.com': { name: 'Stephen Mulholland', region: 'EMEA', role: 'VP Sales' },
  'riona.mchale@eudia.com': { name: 'Riona McHale', region: 'IRE_UK', role: 'Head of Sales' }
};

/**
 * Customer Success team - see only Existing customers + CS Staffing flagged accounts
 */
export const CS_EMAILS = [
  'nikhita.godiwala@eudia.com',
  'jon.dedych@eudia.com',
  'farah.haddad@eudia.com'
];

/**
 * CS Manager mapping - managers see their direct reports' notes and a manager dashboard
 */
export const CS_MANAGER_EMAILS = [
  'nikhita.godiwala@eudia.com'
];

export const CS_MANAGER_DIRECT_REPORTS: Record<string, string[]> = {
  'nikhita.godiwala@eudia.com': [
    'jon.dedych@eudia.com',
    'farah.haddad@eudia.com'
  ]
};

/**
 * Static CS account data with REAL Salesforce Account IDs (18-char, start with '001').
 * Used for instant folder creation when server is unavailable (Render cold start).
 * Real SF IDs enable immediate enrichment (contacts, intelligence) without needing server for ID upgrade.
 * 100 accounts: Late-stage pipeline (CS Staffing flagged) + Existing customers
 * Source: /api/bl-accounts/nikhita.godiwala@eudia.com (live server, Feb 12 2026)
 */
export const CS_STATIC_ACCOUNTS: OwnedAccount[] = [
  { id: '001Hp00003kIrQDIA0', name: 'Accenture', type: 'Prospect', isOwned: false, hadOpportunity: true, website: 'accenture.com', industry: 'Information Technology Services', csmName: null, ownerName: 'Conor Molloy' },
  { id: '001Hp00003kIrEOIA0', name: 'AES', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'alesaei-aes.com', industry: 'Utilities: Gas and Electric', csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Hp00003kIrCyIAK', name: 'Airbnb', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'airbnb.com', industry: 'Internet Services and Retailing', csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Wj00000mCFrdIAG', name: 'Airship Group Inc', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'airship.com', industry: null, csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Hp00003kIrEeIAK', name: 'Amazon', type: 'Prospect - SQO', isOwned: false, hadOpportunity: true, website: 'amazon.com', industry: 'Internet Services and Retailing', csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Wj00000TUdXwIAL', name: 'Anthropic', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'anthropic.com', industry: null, csmName: null, ownerName: 'Nicola Fratini' },
  { id: '001Wj00000wvc5aIAA', name: 'AppliedAI', type: 'New', isOwned: false, hadOpportunity: true, website: 'https://www.applied-ai.com/', industry: null, csmName: null, ownerName: 'Nicola Fratini' },
  { id: '001Wj00000mCFsTIAW', name: 'Arabic Computer Systems', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'acs.com.sa', industry: null, csmName: null, ownerName: 'Alex Fox' },
  { id: '001Hp00003kIrEyIAK', name: 'Aramark Ireland', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'aramark.ie', industry: 'Diversified Outsourcing Services', csmName: null, ownerName: 'Conor Molloy' },
  { id: '001Wj00000p1hYbIAI', name: 'Army Corps of Engineers', type: 'New', isOwned: false, hadOpportunity: true, website: 'https://www.usace.army.mil/', industry: null, csmName: null, ownerName: 'Mike Masiello' },
  { id: '001Wj00000mCFrgIAG', name: 'Aryza', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'aryza.com', industry: null, csmName: null, ownerName: 'Conor Molloy' },
  { id: '001Wj00000Y0g8ZIAR', name: 'Asana', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'asana.com', industry: null, csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Wj00000mI7NaIAK', name: 'Aviva Insurance', type: 'New', isOwned: false, hadOpportunity: true, website: 'aviva.com', industry: null, csmName: null, ownerName: 'Nicola Fratini' },
  { id: '001Wj00000fFuFMIA0', name: 'Bank of Ireland', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'bankofireland.com', industry: 'Banking', csmName: null, ownerName: 'Tom Clancy' },
  { id: '001Hp00003kJ9pXIAS', name: 'Bayer', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'bayer.com', industry: null, csmName: null, ownerName: 'Julie Stefanich' },
  { id: '001Hp00003kIrFVIA0', name: 'Best Buy', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'bestbuy.com', industry: 'Specialty Retailers: Other', csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Wj00000WTMCRIA5', name: 'BNY Mellon', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'bny.com', industry: null, csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Hp00003kIrE3IAK', name: 'Cargill', type: 'Customer - Active Pipeline', isOwned: false, hadOpportunity: true, website: 'cargill.com', industry: null, csmName: null, ownerName: 'Julie Stefanich' },
  { id: '001Hp00003kIrE4IAK', name: 'Chevron', type: 'Customer - Active Pipeline', isOwned: false, hadOpportunity: true, website: 'chevron.com', industry: 'Petroleum Refining', csmName: null, ownerName: 'Julie Stefanich' },
  { id: '001Hp00003kIrGKIA0', name: 'CHS', type: 'Prospect - SQO', isOwned: false, hadOpportunity: true, website: 'chsinc.com', industry: 'Food Production', csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Hp00003kIrE5IAK', name: 'Coherent', type: 'Customer - Active Pipeline', isOwned: false, hadOpportunity: true, website: 'coherent.com', industry: 'Semiconductors and Lasers', csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Wj00000mCFrkIAG', name: 'Coillte', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'coillte.ie', industry: null, csmName: null, ownerName: 'Conor Molloy' },
  { id: '001Wj00000mHDBoIAO', name: 'Coimisiun na Mean', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'cnam.ie', industry: null, csmName: null, ownerName: 'Nathan Shine' },
  { id: '001Wj00000mCFtTIAW', name: 'Coleman Legal', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'colemanlegalpllc.com', industry: null, csmName: null, ownerName: 'Keigan Pesenti' },
  { id: '001Wj00000mCFqtIAG', name: 'CommScope Technologies', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'commscope.com', industry: null, csmName: null, ownerName: 'Nathan Shine' },
  { id: '001Wj00000mCFsHIAW', name: 'Consensys', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: null, industry: null, csmName: null, ownerName: 'Conor Molloy' },
  { id: '001Hp00003kIrGeIAK', name: 'Corebridge Financial', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'corebridgefinancial.com', industry: null, csmName: null, ownerName: 'Julie Stefanich' },
  { id: '001Wj00000c9oCvIAI', name: 'Cox Media Group', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'cmg.com', industry: null, csmName: null, ownerName: 'Justin Hills' },
  { id: '001Wj00000pLPAyIAO', name: 'Creed McStay', type: 'New', isOwned: false, hadOpportunity: true, website: 'creedmcstay.ie', industry: null, csmName: null, ownerName: 'Keigan Pesenti' },
  { id: '001Wj00000mCFsBIAW', name: 'Datalex', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'datalex.com', industry: null, csmName: null, ownerName: 'Nicola Fratini' },
  { id: '001Wj00000mCFrlIAG', name: 'Davy', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'davy.ie', industry: null, csmName: null, ownerName: 'Nicola Fratini' },
  { id: '001Wj00000Y0jPmIAJ', name: 'Delinea', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'delinea.com', industry: null, csmName: null, ownerName: 'Justin Hills' },
  { id: '001Wj00000mCFscIAG', name: 'Department of Children, Disability and Equality', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'https://www.gov.ie/en/department-of-children-disability-and-equality/', industry: null, csmName: null, ownerName: 'Alex Fox' },
  { id: '001Wj00000mCFsNIAW', name: 'Department of Climate, Energy and the Environment', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'https://www.gov.ie/en/department-of-climate-energy-and-the-environment/', industry: null, csmName: null, ownerName: 'Alex Fox' },
  { id: '001Hp00003kIrE6IAK', name: 'DHL', type: 'Customer - Active Pipeline', isOwned: false, hadOpportunity: true, website: 'dhl.com', industry: 'Logistics and Shipping', csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Wj00000aZvt9IAC', name: 'Dolby', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'dolbyblaissegee.com', industry: null, csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Hp00003kIrDMIA0', name: 'Dropbox', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'dropbox.com', industry: 'Cloud Storage and Software', csmName: null, ownerName: 'Nathan Shine' },
  { id: '001Hp00003kIrDaIAK', name: 'Duracell', type: 'Customer - Active Pipeline', isOwned: false, hadOpportunity: true, website: 'duracell.com', industry: 'Consumer goods', csmName: null, ownerName: 'Justin Hills' },
  { id: '001Hp00003kIrE7IAK', name: 'ECMS', type: 'Customer - No Active Pipeline', isOwned: false, hadOpportunity: true, website: 'ecmsglobal-jp.com', industry: null, csmName: null, ownerName: 'Julie Stefanich' },
  { id: '001Hp00003kIrHNIA0', name: 'Ecolab', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'ecolab.com', industry: 'Chemicals', csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Wj00000mCFszIAG', name: 'Electricity Supply Board', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'esb.ie', industry: null, csmName: null, ownerName: 'Tom Clancy' },
  { id: '001Wj00000mCFsUIAW', name: 'ESB NI/Electric Ireland', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'esb.ie', industry: null, csmName: null, ownerName: 'Alex Fox' },
  { id: '001Wj00000hkk0jIAA', name: 'Etsy', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'etsy.com', industry: 'information technology & services', csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Hp00003kIrIAIA0', name: 'Fox', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'foxcorporation.com', industry: 'Entertainment', csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Hp00003kJ9oeIAC', name: 'Fresh Del Monte', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'freshdelmonte.com', industry: null, csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Hp00003kIrIJIA0', name: 'GE Vernova', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'gevernova.com', industry: null, csmName: null, ownerName: 'Ananth Cherukupally' },
  { id: '001Hp00003kIrISIA0', name: 'Gilead Sciences', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'gilead.com', industry: 'Pharmaceuticals', csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Wj00000mCFrcIAG', name: 'Glanbia', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'glanbia.com', industry: null, csmName: null, ownerName: 'Tom Clancy' },
  { id: '001Wj00000mCFt1IAG', name: 'Goodbody Stockbrokers', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'goodbody.ie', industry: null, csmName: null, ownerName: 'Nicola Fratini' },
  { id: '001Hp00003kIrE8IAK', name: 'Graybar Electric', type: 'Customer - Active Pipeline', isOwned: false, hadOpportunity: true, website: 'graybar.com', industry: 'Wholesalers: Diversified', csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Wj00000mCFseIAG', name: 'Hayes Solicitors LLP', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'hayes-solicitors.ie', industry: null, csmName: null, ownerName: 'Keigan Pesenti' },
  { id: '001Hp00003kIrCnIAK', name: 'Home Depot', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'thdroadcompanion.com', industry: 'Specialty Retailers: Other', csmName: null, ownerName: 'Mitch Loquaci' },
  { id: '001Wj00000mCFs5IAG', name: 'Indeed', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'indeed.com', industry: null, csmName: null, ownerName: 'Nathan Shine' },
  { id: '001Hp00003kIrJ9IAK', name: 'Intuit', type: 'Customer - Active Pipeline', isOwned: false, hadOpportunity: true, website: 'intuit.com', industry: 'Computer Software', csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Hp00003kIrE9IAK', name: 'IQVIA', type: 'Customer - Active Pipeline', isOwned: false, hadOpportunity: true, website: 'onekeydata.com', industry: 'Health Care: Pharmacy and Other Services', csmName: null, ownerName: 'Sean Boyd' },
  { id: '001Wj00000mCFtMIAW', name: 'Kellanova', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'www.kellanova.com', industry: null, csmName: null, ownerName: 'Conor Molloy' },
  { id: '001Hp00003kIrJOIA0', name: 'Keurig Dr Pepper', type: 'Prospect', isOwned: false, hadOpportunity: true, website: 'keurigdrpepper.com', industry: 'Beverages', csmName: null, ownerName: 'Nathan Shine' },
  { id: '001Wj00000hkk0zIAA', name: 'Kingspan', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'kingspan.com', industry: 'building materials', csmName: null, ownerName: 'Nathan Shine' },
  { id: '001Wj00000mCFsoIAG', name: 'Mediolanum', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'mediolanum.com', industry: null, csmName: null, ownerName: 'Nathan Shine' },
  { id: '001Hp00003kIrD8IAK', name: 'Medtronic', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'medtronic.com', industry: null, csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Hp00003kJ9lGIAS', name: 'Meta', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'meta.com', industry: null, csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Hp00003kIrDeIAK', name: 'National Grid', type: 'Customer - Active Pipeline', isOwned: false, hadOpportunity: true, website: 'nationalgrid.com', industry: null, csmName: null, ownerName: 'Julie Stefanich' },
  { id: '001Wj00000VVJ31IAH', name: 'NATO', type: 'Prospect', isOwned: false, hadOpportunity: true, website: 'https://www.nato.int/', industry: null, csmName: null, ownerName: 'Mike Masiello' },
  { id: '001Hp00003kIrKmIAK', name: 'Northern Trust Management Services', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'northerntrust.com', industry: 'Commercial Banks', csmName: null, ownerName: 'Nicola Fratini' },
  { id: '001Wj00000cpxt0IAA', name: 'Novelis', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'novelis.com', industry: null, csmName: null, ownerName: 'Mitch Loquaci' },
  { id: '001Wj00000mCFr6IAG', name: 'NTMA', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'ntma.ie', industry: null, csmName: null, ownerName: 'Emer Flynn' },
  { id: '001Wj00000TV1WzIAL', name: 'OpenAi', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'openai.com', industry: null, csmName: null, ownerName: 'Nicola Fratini' },
  { id: '001Wj00000mCFrIIAW', name: 'Orsted', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'orsted.com', industry: null, csmName: null, ownerName: 'Conor Molloy' },
  { id: '001Wj00000bzz9MIAQ', name: 'Peregrine Hospitality', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'peregrinehg.com', industry: null, csmName: null, ownerName: 'Ananth Cherukupally' },
  { id: '001Wj00000ZDPUIIA5', name: 'Perrigo Pharma', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'perrigo.com', industry: null, csmName: null, ownerName: 'Nathan Shine' },
  { id: '001Hp00003kIrLNIA0', name: 'Petsmart', type: 'Prospect - SQO', isOwned: false, hadOpportunity: true, website: 'petsmart.com', industry: 'Retailing', csmName: null, ownerName: 'Julie Stefanich' },
  { id: '001Wj00000kNp2XIAS', name: 'Plusgrade', type: 'New', isOwned: false, hadOpportunity: true, website: 'plusgrade.com', industry: null, csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Hp00003kKXSIIA4', name: 'Pure Storage', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'purestorage.com', industry: null, csmName: null, ownerName: 'Ananth Cherukupally' },
  { id: '001Wj00000u0eJpIAI', name: 'Re-Turn', type: 'New', isOwned: false, hadOpportunity: true, website: 'https://re-turn.ie/', industry: null, csmName: null, ownerName: 'Nicola Fratini' },
  { id: '001Hp00003kIrD9IAK', name: 'Salesforce', type: 'Prospect - SQO', isOwned: false, hadOpportunity: true, website: 'salesforce.com', industry: 'Computer Software', csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Wj00000mI9NmIAK', name: 'Sequoia Climate Fund', type: 'New', isOwned: false, hadOpportunity: true, website: 'sequoiaclimate.org', industry: null, csmName: null, ownerName: 'Conor Molloy' },
  { id: '001Hp00003kIrMKIA0', name: 'ServiceNow', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'servicenow.com', industry: 'Computer Software', csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Wj00000mCFrMIAW', name: 'Sisk Group', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'sisk.com', industry: null, csmName: null, ownerName: 'Alex Fox' },
  { id: '001Hp00003kIrECIA0', name: 'Southwest Airlines', type: 'Customer - Active Pipeline', isOwned: false, hadOpportunity: true, website: 'southwest.com', industry: 'Airlines', csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Wj00000lxbYRIAY', name: 'Spark Brighter Thinking', type: 'New', isOwned: false, hadOpportunity: true, website: 'hellospark.com', industry: null, csmName: null, ownerName: 'Ananth Cherukupally' },
  { id: '001Wj00000c9oD6IAI', name: 'Stripe', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'stripe.com', industry: null, csmName: null, ownerName: 'Nicola Fratini' },
  { id: '001Wj00000bzz9TIAQ', name: 'Tailored Brands', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'tailoredbrands.com', industry: null, csmName: null, ownerName: 'Julie Stefanich' },
  { id: '001Wj00000mCFs0IAG', name: 'Taoglas Limited', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'taoglas.com', industry: null, csmName: null, ownerName: 'Conor Molloy' },
  { id: '001Wj00000iS9AJIA0', name: 'TE Connectivity', type: 'New', isOwned: false, hadOpportunity: true, website: 'te.com', industry: null, csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Wj00000mCFtPIAW', name: 'Teamwork.com', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'teamwork.com', industry: null, csmName: null, ownerName: 'Conor Molloy' },
  { id: '001Wj00000PjGDaIAN', name: 'The Weir Group PLC', type: 'Prospect - SQO', isOwned: false, hadOpportunity: true, website: 'global.weir', industry: null, csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Hp00003kIrNBIA0', name: 'The Wonderful Company', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'wonderful.com', industry: 'Multicompany', csmName: null, ownerName: 'Julie Stefanich' },
  { id: '001Wj00000SFiOvIAL', name: 'TikTok', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'tiktok.com', industry: null, csmName: null, ownerName: 'Nathan Shine' },
  { id: '001Wj00000ZDXTRIA5', name: 'Tinder LLC', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'tinder.com', industry: null, csmName: null, ownerName: 'Nathan Shine' },
  { id: '001Hp00003kIrCwIAK', name: 'Toshiba US', type: 'Customer - Active Pipeline', isOwned: false, hadOpportunity: true, website: 'toshiba.com', industry: 'Electronics and IT Solutions', csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Wj00000bWBkeIAG', name: 'U.S. Air Force', type: 'New', isOwned: false, hadOpportunity: true, website: 'eprc.or.ug', industry: null, csmName: null, ownerName: 'Mike Masiello' },
  { id: '001Wj00000bWBlEIAW', name: 'Udemy', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'udemy.com', industry: null, csmName: null, ownerName: 'Nathan Shine' },
  { id: '001Wj00000mCFtOIAW', name: 'Uisce Eireann (Irish Water)', type: 'Johnson Hana Owned', isOwned: false, hadOpportunity: true, website: 'water.ie', industry: null, csmName: null, ownerName: 'Tom Clancy' },
  { id: '001Wj00000bn8VSIAY', name: 'Vista Equity Partners', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'vistaequitypartners.com', industry: null, csmName: null, ownerName: 'Ananth Cherukupally' },
  { id: '001Wj00000p1SuZIAU', name: 'Vulcan Special Ops', type: 'New', isOwned: false, hadOpportunity: true, website: 'vulcan-v.com', industry: null, csmName: null, ownerName: 'Mike Masiello' },
  { id: '001Hp00003kIrNwIAK', name: 'W.W. Grainger', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'grainger.com', industry: 'Wholesalers: Diversified', csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Wj00000bzz9NIAQ', name: 'Wealth Partners Capital Group', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'wealthpcg.com', industry: null, csmName: null, ownerName: 'Asad Hussain' },
  { id: '001Wj00000ZLVpTIAX', name: 'Wellspring Philanthropic Fund', type: 'Prospect - Discovery', isOwned: false, hadOpportunity: true, website: 'wpfund.org', industry: null, csmName: null, ownerName: 'Conor Molloy' },
  { id: '001Hp00003kIrOAIA0', name: 'Western Digital', type: 'Prospect - SQO', isOwned: false, hadOpportunity: true, website: 'westerndigital.com', industry: 'Computers, Office Equipment', csmName: null, ownerName: 'Olivia Jung' },
  { id: '001Hp00003kIrOLIA0', name: 'World Wide Technology', type: 'Prospect', isOwned: false, hadOpportunity: true, website: 'wwt.com', industry: 'Technology Hardware & Equipment', csmName: null, ownerName: 'Julie Stefanich' },
];

/**
 * Business Lead region mapping (for Sales Leader roll-ups)
 */
export const BL_REGIONS: Record<string, string[]> = {
  'US': [
    'asad.hussain@eudia.com',
    'julie.stefanich@eudia.com',
    'olivia@eudia.com',
    'ananth@eudia.com',
    'ananth.cherukupally@eudia.com',
    'justin.hills@eudia.com',
    'mike.masiello@eudia.com',
    'mike@eudia.com',
    'sean.boyd@eudia.com',
    'riley.stack@eudia.com',
    'rajeev.patel@eudia.com'
  ],
  'EMEA': [
    'greg.machale@eudia.com',
    'tom.clancy@eudia.com',
    'nicola.fratini@eudia.com',
    'nathan.shine@eudia.com',
    'stephen.mulholland@eudia.com'
  ],
  'IRE_UK': [
    'conor.molloy@eudia.com',
    'alex.fox@eudia.com',
    'emer.flynn@eudia.com',
    'riona.mchale@eudia.com'
  ]
};

/**
 * Explicit direct reports for Sales Leaders
 * These are the BLs whose accounts a sales leader should see preloaded
 */
export const SALES_LEADER_DIRECT_REPORTS: Record<string, string[]> = {
  'mitchell.loquaci@eudia.com': [
    'asad.hussain@eudia.com',
    'julie.stefanich@eudia.com',
    'olivia@eudia.com',
    'ananth@eudia.com',
    'ananth.cherukupally@eudia.com',
    'justin.hills@eudia.com',
    'mike.masiello@eudia.com',
    'mike@eudia.com',
    'sean.boyd@eudia.com',
    'riley.stack@eudia.com',
    'rajeev.patel@eudia.com'
  ],
  'stephen.mulholland@eudia.com': [
    'greg.machale@eudia.com',
    'tom.clancy@eudia.com',
    'conor.molloy@eudia.com',
    'nathan.shine@eudia.com',
    'nicola.fratini@eudia.com'
  ],
  'riona.mchale@eudia.com': [
    'conor.molloy@eudia.com',
    'alex.fox@eudia.com',
    'emer.flynn@eudia.com'
  ]
};

/**
 * Pod-view users: specific BLs who get the full pod/region view (like sales leaders)
 * Maps email -> region to determine which pod's accounts they see
 */
export const POD_VIEW_USERS: Record<string, string> = {
  'sean.boyd@eudia.com': 'US',
  'riley.stack@eudia.com': 'US',
  'rajeev.patel@eudia.com': 'US'
};

/**
 * User group types
 */
export type UserGroup = 'admin' | 'exec' | 'sales_leader' | 'cs' | 'bl';

/**
 * Get the user group for an email
 */
export function getUserGroup(email: string): UserGroup {
  const normalized = email.toLowerCase().trim();
  if (ADMIN_EMAILS.includes(normalized)) return 'admin';
  if (EXEC_EMAILS.includes(normalized)) return 'exec';
  if (normalized in SALES_LEADERS) return 'sales_leader';
  if (CS_EMAILS.includes(normalized)) return 'cs';
  return 'bl';
}

/**
 * Get the region for a sales leader
 */
export function getSalesLeaderRegion(email: string): string | null {
  const normalized = email.toLowerCase().trim();
  return SALES_LEADERS[normalized]?.region || null;
}

/**
 * Get BL emails for a region
 */
export function getRegionBLEmails(region: string): string[] {
  return BL_REGIONS[region] || [];
}

/**
 * Get direct reports for a sales leader
 * Returns explicit mapping if exists, falls back to region-based lookup
 */
export function getSalesLeaderDirectReports(email: string): string[] {
  const normalized = email.toLowerCase().trim();
  
  // First check explicit direct reports mapping
  if (SALES_LEADER_DIRECT_REPORTS[normalized]) {
    return SALES_LEADER_DIRECT_REPORTS[normalized];
  }
  
  // Fall back to region-based lookup
  const region = getSalesLeaderRegion(normalized);
  return region ? getRegionBLEmails(region) : [];
}

/**
 * Check if a user is an admin with elevated account visibility
 */
export function isAdminUser(email: string): boolean {
  const normalizedEmail = email.toLowerCase().trim();
  return ADMIN_EMAILS.includes(normalizedEmail) || EXEC_EMAILS.includes(normalizedEmail);
}

/**
 * Check if a user is a Customer Success team member
 */
export function isCSUser(email: string): boolean {
  const normalizedEmail = email.toLowerCase().trim();
  return CS_EMAILS.includes(normalizedEmail);
}

/**
 * Check if a user is a CS Manager
 */
export function isCSManager(email: string): boolean {
  const normalizedEmail = email.toLowerCase().trim();
  return CS_MANAGER_EMAILS.includes(normalizedEmail);
}

/**
 * Get CS Manager direct reports
 */
export function getCSManagerDirectReports(email: string): string[] {
  const normalizedEmail = email.toLowerCase().trim();
  return CS_MANAGER_DIRECT_REPORTS[normalizedEmail] || [];
}

/**
 * Check if user should see all accounts (admin or exec)
 */
export function hasFullAccountAccess(email: string): boolean {
  const group = getUserGroup(email);
  return group === 'admin' || group === 'exec';
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface OwnedAccount {
  id: string;
  name: string;
  type?: string; // Customer, Prospect, Target, New, Existing, etc.
  isOwned?: boolean;  // For admins: true if they own it, false if view-only
  hadOpportunity?: boolean; // true = active (has opp history), false = prospect
  website?: string | null;
  industry?: string | null;
  ownerName?: string | null; // Salesforce account owner (Business Lead)
  csmName?: string | null;   // Assigned CSM (from Account.CSM__c in Salesforce)
}

export interface BusinessLead {
  email: string;
  name: string;
  salesforceUserId?: string;
  accounts: OwnedAccount[];
}

export interface AccountOwnershipData {
  version: string;
  lastUpdated: string;
  businessLeads: Record<string, BusinessLead>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT OWNERSHIP MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Static mapping of business leads to their owned accounts.
 * Source: "Business Lead Account Assignment latest version.xlsx"
 * Filter: Customer Type = Existing OR Open Opps > 0 (matches BoB report)
 * Auto-generated on 2026-02-10
 * 
 * Total: 18 business leads, 219 accounts
 */
/**
 * Static mapping of business leads to their owned accounts.
 * Source: "BUSINESS LEAD FULL BOOK OF BUSINESS.xlsx"
 * Full BoB: ALL owned accounts, each with hadOpportunity flag
 * Auto-generated on 2026-02-09
 * 
 * Total: 21 business leads, 1109 accounts (293 active + 816 prospect)
 */
/**
 * Static mapping of business leads to their owned accounts.
 * Source: "BUSINESS LEAD FULL BOOK OF BUSINESS.xlsx"
 * Full BoB: ALL owned accounts, each with hadOpportunity flag
 * Auto-generated on 2026-02-09
 * 
 * Total: 21 business leads, 1109 accounts (457 active + 652 prospect)
 */
const OWNERSHIP_DATA: AccountOwnershipData = {
  version: '2026-02-09',
  lastUpdated: '2026-02-09',
  businessLeads: {

    // ALEX FOX (9 active + 3 prospect = 12 total)
    'alex.fox@eudia.com': {
      email: 'alex.fox@eudia.com',
      name: 'Alex Fox',
      accounts: [
        { id: '001Wj00000mCFsT', name: 'Arabic Computer Systems', hadOpportunity: true },
        { id: '001Wj00000mCFsO', name: 'Brown Thomas', hadOpportunity: true },
        { id: '001Wj00000mCFt2', name: 'Byrne Wallace Shields', hadOpportunity: true },
        { id: '001Wj00000mCFsu', name: 'Corrigan & Corrigan Solicitors LLP', hadOpportunity: true },
        { id: '001Wj00000pzTPY', name: 'Defence Forces Tribunal', hadOpportunity: false },
        { id: '001Wj00000mCFsc', name: 'Department of Children, Disability and Equality', hadOpportunity: true },
        { id: '001Wj00000mCFsN', name: 'Department of Climate, Energy and the Environment', hadOpportunity: true },
        { id: '001Wj00000mCFrZ', name: 'Department of Housing', hadOpportunity: true },
        { id: '001Wj00000mCFsU', name: 'ESB NI/Electric Ireland', hadOpportunity: true },
        { id: '001Wj00000pzTPV', name: 'MW Keller', hadOpportunity: false },
        { id: '001Wj00000pzTPX', name: 'Murphy\'s Ice Cream', hadOpportunity: false },
        { id: '001Wj00000mCFrM', name: 'Sisk Group', hadOpportunity: true },
      ]
    },

    // ANANTH CHERUKUPALLY (58 active + 122 prospect = 180 total)
    'ananth.cherukupally@eudia.com': {
      email: 'ananth.cherukupally@eudia.com',
      name: 'Ananth Cherukupally',
      accounts: [
        { id: '001Wj00000PfssX', name: 'AGC Partners', hadOpportunity: false },
        { id: '001Wj00000ahBZt', name: 'AMETEK', hadOpportunity: false },
        { id: '001Wj00000ahBZr', name: 'Accel-KKR', hadOpportunity: false },
        { id: '001Wj00000bwVu4', name: 'Addtech', hadOpportunity: false },
        { id: '001Wj00000YNV7Z', name: 'Advent', hadOpportunity: true },
        { id: '001Wj00000VZScK', name: 'Affinity Consulting Group', hadOpportunity: false },
        { id: '001Wj00000lyFyt', name: 'Albacore Capital Group', hadOpportunity: true },
        { id: '001Wj00000nlL88', name: 'Alder', hadOpportunity: true },
        { id: '001Wj00000XumF6', name: 'Alpine Investors', hadOpportunity: true },
        { id: '001Wj00000QTbLP', name: 'Alvarez AI Advisors', hadOpportunity: false },
        { id: '001Wj00000ahFCJ', name: 'American Pacific Group', hadOpportunity: false },
        { id: '001Wj00000ah6dg', name: 'Angeles Equity Partners', hadOpportunity: false },
        { id: '001Hp00003kIrEu', name: 'Apollo Global Management', hadOpportunity: true },
        { id: '001Wj00000cl5pq', name: 'Arizona MBDA Business Center', hadOpportunity: false },
        { id: '001Wj00000nlRev', name: 'Attack Capital', hadOpportunity: true },
        { id: '001Wj00000ahFBx', name: 'Audax Group', hadOpportunity: false },
        { id: '001Wj00000YhZAE', name: 'Beacon Software', hadOpportunity: true },
        { id: '001Wj00000cfg0c', name: 'Beekers Capital', hadOpportunity: false },
        { id: '001Wj00000bwVsk', name: 'Bertram Capital', hadOpportunity: false },
        { id: '001Wj00000ahBa0', name: 'Bessemer Venture Partners', hadOpportunity: false },
        { id: '001Wj00000lzDWj', name: 'BlueEarth Capital', hadOpportunity: true },
        { id: '001Wj00000ah6dZ', name: 'Brentwood Associates', hadOpportunity: false },
        { id: '001Wj00000ah6dL', name: 'Brown & Brown', hadOpportunity: false },
        { id: '001Hp00003kIrCh', name: 'CBRE Group', hadOpportunity: true },
        { id: '001Wj00000cejJz', name: 'CVC', hadOpportunity: true },
        { id: '001Wj00000ahFCV', name: 'Caltius Equity Partners', hadOpportunity: false },
        { id: '001Wj00000ahFBz', name: 'Capstone Partners', hadOpportunity: false },
        { id: '001Wj00000nlB0g', name: 'Capvest', hadOpportunity: true },
        { id: '001Hp00003kIrFy', name: 'Cardinal Health', hadOpportunity: true },
        { id: '001Hp00003kIrDg', name: 'Carlyle', hadOpportunity: true },
        { id: '001Wj00000PbIZ8', name: 'Cascadia Capital', hadOpportunity: false },
        { id: '001Wj00000ah6dW', name: 'Catterton', hadOpportunity: false },
        { id: '001Wj00000ahFC7', name: 'Century Park Capital Partners', hadOpportunity: false },
        { id: '001Wj00000Rjuhj', name: 'Citadel', hadOpportunity: true },
        { id: '001Wj00000ah6dn', name: 'Clearlake Capital Group', hadOpportunity: false },
        { id: '001Wj00000ah6dY', name: 'Cognex Corporation', hadOpportunity: false },
        { id: '001Wj00000ah6do', name: 'Comvest Partners', hadOpportunity: false },
        { id: '001Wj00000ah6dv', name: 'Constellation Software', hadOpportunity: true },
        { id: '001Wj00000ahFCI', name: 'Cortec Group', hadOpportunity: false },
        { id: '001Wj00000ahBa4', name: 'Crosslink Capital', hadOpportunity: false },
        { id: '001Wj00000ahFCR', name: 'DCA Partners', hadOpportunity: false },
        { id: '001Wj00000ah6dc', name: 'DFO Management', hadOpportunity: false },
        { id: '001Wj00000W8fEu', name: 'Davis Polk', hadOpportunity: false },
        { id: '001Wj00000crdDR', name: 'Delcor', hadOpportunity: true },
        { id: '001Wj00000ahFCM', name: 'Diploma', hadOpportunity: false },
        { id: '001Wj00000kcANH', name: 'Discord', hadOpportunity: true },
        { id: '001Wj00000ahFCU', name: 'Doughty Hanson & Co', hadOpportunity: false },
        { id: '001Wj00000ah6dd', name: 'Edgewater Capital Partners', hadOpportunity: false },
        { id: '001Wj00000Y64qh', name: 'Emigrant Bank', hadOpportunity: true },
        { id: '001Wj00000ah6dM', name: 'Encore Consumer Capital', hadOpportunity: false },
        { id: '001Wj00000ahFCL', name: 'Endeavour Capital', hadOpportunity: false },
        { id: '001Wj00000ah6di', name: 'FFL Partners', hadOpportunity: false },
        { id: '001Wj00000ah6dV', name: 'Falfurrias Capital Partners', hadOpportunity: false },
        { id: '001Wj00000ah6dU', name: 'FirstService Corporation', hadOpportunity: false },
        { id: '001Wj00000nlLZU', name: 'Five Capital', hadOpportunity: true },
        { id: '001Wj00000ahFCK', name: 'Flexpoint Ford', hadOpportunity: false },
        { id: '001Wj00000QkjJL', name: 'Floodgate', hadOpportunity: false },
        { id: '001Wj00000bwVu6', name: 'Fortive Corporation', hadOpportunity: false },
        { id: '001Wj00000ahFCa', name: 'Foundry Group', hadOpportunity: false },
        { id: '001Hp00003kIrID', name: 'Freeport-McMoRan', hadOpportunity: true },
        { id: '001Wj00000bwVuN', name: 'Fremont Partners', hadOpportunity: false },
        { id: '001Wj00000ahFCO', name: 'Frontenac Company', hadOpportunity: false },
        { id: '001Hp00003kIrII', name: 'GE Healthcare', hadOpportunity: true },
        { id: '001Hp00003kIrIJ', name: 'GE Vernova', hadOpportunity: true },
        { id: '001Wj00000lz2Jb', name: 'GTIS Partners', hadOpportunity: true },
        { id: '001Wj00000ah6dh', name: 'Gallant Capital Partners', hadOpportunity: false },
        { id: '001Hp00003kJ9oP', name: 'General Catalyst', hadOpportunity: true },
        { id: '001Wj00000ah6dr', name: 'Genstar Capital', hadOpportunity: false },
        { id: '001Hp00003kIrIT', name: 'GlaxoSmithKline', hadOpportunity: true },
        { id: '001Wj00000ahFCb', name: 'Goldner Hawn Johnson & Morrison', hadOpportunity: false },
        { id: '001Wj00000ah6du', name: 'Great Point Partners', hadOpportunity: false },
        { id: '001Wj00000ahBZx', name: 'Greenoaks Capital', hadOpportunity: true },
        { id: '001Wj00000ahFCB', name: 'Greenspring Associates', hadOpportunity: false },
        { id: '001Wj00000ahFCX', name: 'Group 206', hadOpportunity: false },
        { id: '001Wj00000ahBZz', name: 'Gryphon Investors', hadOpportunity: false },
        { id: '001Wj00000ah6dT', name: 'HEICO Corporation', hadOpportunity: false },
        { id: '001Wj00000cy4m1', name: 'HG', hadOpportunity: true },
        { id: '001Wj00000ahBZn', name: 'HGGC', hadOpportunity: false },
        { id: '001Wj00000ah6df', name: 'Halma', hadOpportunity: false },
        { id: '001Wj00000ah48X', name: 'Harvest Partners', hadOpportunity: false },
        { id: '001Wj00000ahFCS', name: 'HealthpointCapital', hadOpportunity: false },
        { id: '001Wj00000lzDtJ', name: 'Heidrick & Struggles', hadOpportunity: true },
        { id: '001Hp00003kIrIl', name: 'Hellman & Friedman', hadOpportunity: true },
        { id: '001Wj00000ahFCW', name: 'Highview Capital', hadOpportunity: false },
        { id: '001Wj00000Pg7rW', name: 'Houlihan Lokey', hadOpportunity: false },
        { id: '001Wj00000ahFCH', name: 'Housatonic Partners', hadOpportunity: false },
        { id: '001Wj00000ahFC9', name: 'Huron Capital', hadOpportunity: false },
        { id: '001Wj00000ahFC6', name: 'Indutrade', hadOpportunity: false },
        { id: '001Wj00000ahBa5', name: 'Insight Partners', hadOpportunity: false },
        { id: '001Wj00000nlbr9', name: 'Intercorp', hadOpportunity: true },
        { id: '001Wj00000ahFCA', name: 'Irving Place Capital', hadOpportunity: false },
        { id: '001Wj00000bwVtt', name: 'Jack Henry & Associates', hadOpportunity: false },
        { id: '001Wj00000Pg9oT', name: 'Jackim Woods & Co.', hadOpportunity: false },
        { id: '001Wj00000ah6de', name: 'Jonas Software', hadOpportunity: false },
        { id: '001Hp00003kIrJU', name: 'KKR', hadOpportunity: false },
        { id: '001Wj00000ahBa1', name: 'Kayne Anderson Capital Advisors', hadOpportunity: false },
        { id: '001Wj00000m5kud', name: 'Kelly Services', hadOpportunity: true },
        { id: '001Wj00000ahBZp', name: 'Keysight Technologies', hadOpportunity: false },
        { id: '001Wj00000ahFC8', name: 'L Squared Capital Partners', hadOpportunity: false },
        { id: '001Wj00000QGTNV', name: 'LCS Forensic Accounting & Advisory', hadOpportunity: false },
        { id: '001Wj00000ahFCD', name: 'Lagercrantz Group', hadOpportunity: false },
        { id: '001Wj00000ahBZs', name: 'Levine Leichtman Capital Partners', hadOpportunity: false },
        { id: '001Wj00000Z6zhP', name: 'Liberty Mutual Insurance', hadOpportunity: true },
        { id: '001Wj00000ahFCC', name: 'Lifco', hadOpportunity: false },
        { id: '001Wj00000ahFCP', name: 'LightBay Capital', hadOpportunity: false },
        { id: '001Wj00000iYEVS', name: 'Lightstone Group', hadOpportunity: true },
        { id: '001Wj00000ahFCT', name: 'Lincolnshire Management', hadOpportunity: false },
        { id: '001Wj00000c8ynV', name: 'Littelfuse', hadOpportunity: true },
        { id: '001Wj00000W95CX', name: 'Long Lake', hadOpportunity: true },
        { id: '001Wj00000ahBa3', name: 'Luminate Capital', hadOpportunity: false },
        { id: '001Wj00000ahFC1', name: 'Lumine Group', hadOpportunity: false },
        { id: '001Wj00000bwVuH', name: 'Markel Corporation', hadOpportunity: false },
        { id: '001Wj00000Pfppo', name: 'Marks Baughan', hadOpportunity: false },
        { id: '001Wj00000ah6dm', name: 'Martis Capital', hadOpportunity: false },
        { id: '001Hp00003kKrRR', name: 'Marvell Technology', hadOpportunity: true },
        { id: '001Wj00000PbJ2B', name: 'Meridian Capital', hadOpportunity: false },
        { id: '001Wj00000ahFC3', name: 'Nexa Equity', hadOpportunity: false },
        { id: '001Wj00000ahBZv', name: 'Norwest Venture Partners', hadOpportunity: false },
        { id: '001Wj00000ah6dp', name: 'Novanta', hadOpportunity: false },
        { id: '001Wj00000ah6dQ', name: 'Pacific Avenue Capital Partners', hadOpportunity: false },
        { id: '001Wj00000ah6dt', name: 'Palladium Equity Partners', hadOpportunity: false },
        { id: '001Wj00000iXNFs', name: 'Palomar Holdings', hadOpportunity: true },
        { id: '001Wj00000ahFCG', name: 'Pamlico Capital', hadOpportunity: false },
        { id: '001Wj00000W3R2u', name: 'Paradigm', hadOpportunity: false },
        { id: '001Wj00000bWBlQ', name: 'Pegasystems', hadOpportunity: true },
        { id: '001Wj00000YcPTM', name: 'Percheron Capital', hadOpportunity: true },
        { id: '001Wj00000bzz9M', name: 'Peregrine Hospitality', hadOpportunity: true },
        { id: '001Wj00000VZkJ3', name: 'PerformLaw', hadOpportunity: false },
        { id: '001Hp00003ljCJ8', name: 'Petco', hadOpportunity: true },
        { id: '001Wj00000ahFBy', name: 'Pharos Capital Group', hadOpportunity: false },
        { id: '001Wj00000bwVuF', name: 'Pool Corporation', hadOpportunity: false },
        { id: '001Wj00000ah48Y', name: 'Pritzker Private Capital', hadOpportunity: false },
        { id: '001Wj00000mRFNX', name: 'Publicis Group', hadOpportunity: true },
        { id: '001Hp00003kKXSI', name: 'Pure Storage', hadOpportunity: true },
        { id: '001Wj00000ah6dS', name: 'Quad-C Management', hadOpportunity: false },
        { id: '001Hp00003kIrLo', name: 'Raymond James Financial', hadOpportunity: false },
        { id: '001Wj00000ah6ds', name: 'Resilience Capital Partners', hadOpportunity: false },
        { id: '001Wj00000m0jBC', name: 'RingCentral', hadOpportunity: true },
        { id: '001Wj00000ahFC4', name: 'Riverside Acceleration Capital', hadOpportunity: false },
        { id: '001Wj00000ah48a', name: 'Riverside Partners', hadOpportunity: false },
        { id: '001Wj00000ahFCE', name: 'Rustic Canyon Partners', hadOpportunity: false },
        { id: '001Wj00000ah6dR', name: 'Sageview Capital', hadOpportunity: false },
        { id: '001Wj00000ahFCN', name: 'Salt Creek Capital', hadOpportunity: false },
        { id: '001Wj00000lzlLX', name: 'Sandbox', hadOpportunity: true },
        { id: '001Wj00000nldrK', name: 'Scout Motors', hadOpportunity: true },
        { id: '001Wj00000ah48Z', name: 'Searchlight Capital', hadOpportunity: false },
        { id: '001Wj00000ahBZq', name: 'Serent Capital', hadOpportunity: false },
        { id: '001Hp00003kIrEB', name: 'Silver Lake', hadOpportunity: true },
        { id: '001Wj00000ahBZo', name: 'Siris Capital Group', hadOpportunity: false },
        { id: '001Wj00000ah6db', name: 'Solace Capital Partners', hadOpportunity: false },
        { id: '001Wj00000ahFCF', name: 'Solis Capital Partners', hadOpportunity: false },
        { id: '001Wj00000VkQyY', name: 'Sonja Cotton & Associates', hadOpportunity: false },
        { id: '001Wj00000ah6dO', name: 'Sorenson Capital', hadOpportunity: false },
        { id: '001Wj00000lygkU', name: 'SoundPoint Capital', hadOpportunity: true },
        { id: '001Wj00000lxbYR', name: 'Spark Brighter Thinking', hadOpportunity: true },
        { id: '001Wj00000ah6dj', name: 'Spectrum Equity', hadOpportunity: true },
        { id: '001Wj00000lusqi', name: 'Symphony Technology Partners', hadOpportunity: true },
        { id: '001Wj00000tOAoE', name: 'TA Associates', hadOpportunity: true },
        { id: '001Hp00003kKrU1', name: 'TPG', hadOpportunity: true },
        { id: '001Wj00000dNhDy', name: 'TSS Europe', hadOpportunity: true },
        { id: '001Wj00000QTbzh', name: 'Taytrom', hadOpportunity: false },
        { id: '001Wj00000ahFCY', name: 'The Courtney Group', hadOpportunity: false },
        { id: '001Wj00000ahFCZ', name: 'The Riverside Company', hadOpportunity: false },
        { id: '001Wj00000cgCF8', name: 'Titan AI', hadOpportunity: false },
        { id: '001Wj00000nlOIv', name: 'Together Fund', hadOpportunity: true },
        { id: '001Wj00000ah6dX', name: 'Topicus.com', hadOpportunity: false },
        { id: '001Hp00003kIrNO', name: 'TransDigm Group', hadOpportunity: false },
        { id: '001Wj00000ah6dN', name: 'Transom Capital Group', hadOpportunity: false },
        { id: '001Wj00000ahBZu', name: 'Trimble Inc.', hadOpportunity: false },
        { id: '001Wj00000ah6dl', name: 'Trivest Partners', hadOpportunity: false },
        { id: '001Wj00000dXDo3', name: 'Tucker\'s Farm', hadOpportunity: true },
        { id: '001Wj00000ah6da', name: 'Tyler Technologies', hadOpportunity: false },
        { id: '001Wj00000Y6VMa', name: 'UBS', hadOpportunity: true },
        { id: '001Wj00000ahFCQ', name: 'Vance Street Capital', hadOpportunity: false },
        { id: '001Wj00000bn8VS', name: 'Vista Equity Partners', hadOpportunity: true },
        { id: '001Wj00000ahFC0', name: 'Vitec Software', hadOpportunity: false },
        { id: '001Wj00000ah6dP', name: 'Volaris Group', hadOpportunity: false },
        { id: '001Hp00003kIrO2', name: 'Watsco', hadOpportunity: false },
        { id: '001Wj00000ahBZw', name: 'West Lane Capital Partners', hadOpportunity: false },
        { id: '001Wj00000ahBZy', name: 'Zebra Technologies', hadOpportunity: false },
      ]
    },

    // ASAD HUSSAIN (80 active + 18 prospect = 98 total)
    'asad.hussain@eudia.com': {
      email: 'asad.hussain@eudia.com',
      name: 'Asad Hussain',
      accounts: [
        { id: '001Hp00003kIrFC', name: 'AT&T', hadOpportunity: true },
        { id: '001Hp00003kIrCy', name: 'Airbnb', hadOpportunity: true },
        { id: '001Hp00003kIrEe', name: 'Amazon', hadOpportunity: true },
        { id: '001Wj00000WElj9', name: 'American Arbitration Association', hadOpportunity: true },
        { id: '001Hp00003kIrCz', name: 'American Express', hadOpportunity: true },
        { id: '001Wj00000hewsX', name: 'Amkor', hadOpportunity: true },
        { id: '001Wj00000WZ05x', name: 'Applied Intuition', hadOpportunity: true },
        { id: '001Hp00003kIrEx', name: 'Applied Materials', hadOpportunity: false },
        { id: '001Hp00003kIrEz', name: 'Archer Daniels Midland', hadOpportunity: true },
        { id: '001Wj00000Y0g8Z', name: 'Asana', hadOpportunity: true },
        { id: '001Wj00000gGYAQ', name: 'Autodesk', hadOpportunity: true },
        { id: '001Wj00000c0wRA', name: 'Away', hadOpportunity: true },
        { id: '001Wj00000WTMCR', name: 'BNY Mellon', hadOpportunity: true },
        { id: '001Wj00000c6DHy', name: 'BetterUp', hadOpportunity: true },
        { id: '001Hp00003kIrFY', name: 'BlackRock', hadOpportunity: false },
        { id: '001Hp00003kIrFe', name: 'Booz Allen Hamilton', hadOpportunity: false },
        { id: '001Wj00000XhcVG', name: 'Box.com', hadOpportunity: true },
        { id: '001Wj00000bWBla', name: 'CNA Insurance', hadOpportunity: true },
        { id: '001Wj00000XiYqz', name: 'Canva', hadOpportunity: true },
        { id: '001Hp00003kIrG0', name: 'Carrier Global', hadOpportunity: false },
        { id: '001Wj00000mosEX', name: 'Carta', hadOpportunity: true },
        { id: '001Wj00000ah6dk', name: 'Charlesbank Capital Partners', hadOpportunity: true },
        { id: '001Wj00000XiXjd', name: 'Circle', hadOpportunity: true },
        { id: '001Hp00003kIrE5', name: 'Coherent', hadOpportunity: true },
        { id: '001Hp00003kIrGf', name: 'Corning', hadOpportunity: true },
        { id: '001Wj00000fgfGu', name: 'Cyware', hadOpportunity: true },
        { id: '001Hp00003kIrE6', name: 'DHL', hadOpportunity: true },
        { id: '001Wj00000duIWr', name: 'Deepmind', hadOpportunity: true },
        { id: '001Hp00003kIrGy', name: 'Dell Technologies', hadOpportunity: false },
        { id: '001Hp00003kIrGz', name: 'Deloitte', hadOpportunity: true },
        { id: '001Wj00000W8ZKl', name: 'Docusign', hadOpportunity: true },
        { id: '001Hp00003kIrHN', name: 'Ecolab', hadOpportunity: true },
        { id: '001Wj00000dheQN', name: 'Emory', hadOpportunity: true },
        { id: '001Wj00000bWIxP', name: 'Ericsson', hadOpportunity: true },
        { id: '001Hp00003kIrHs', name: 'FedEx', hadOpportunity: false },
        { id: '001Wj00000lMcwT', name: 'Flo Health', hadOpportunity: true },
        { id: '001Hp00003kIrI3', name: 'Fluor', hadOpportunity: true },
        { id: '001Hp00003kIrIA', name: 'Fox', hadOpportunity: true },
        { id: '001Hp00003kJ9oe', name: 'Fresh Del Monte', hadOpportunity: true },
        { id: '001Wj00000Y6HEY', name: 'G-III Apparel Group', hadOpportunity: true },
        { id: '001Wj00000kNTF0', name: 'GLG', hadOpportunity: true },
        { id: '001Hp00003kIrIK', name: 'Geico', hadOpportunity: true },
        { id: '001Hp00003lhVuD', name: 'General Atlantic', hadOpportunity: true },
        { id: '001Wj00000dw1gb', name: 'Glean', hadOpportunity: true },
        { id: '001Hp00003kJ9l1', name: 'Google', hadOpportunity: true },
        { id: '001Wj00000oqVXg', name: 'Goosehead Insurance', hadOpportunity: true },
        { id: '001Wj00000tuXZb', name: 'Gopuff', hadOpportunity: true },
        { id: '001Hp00003kIrDP', name: 'HP', hadOpportunity: true },
        { id: '001Hp00003kIrIt', name: 'HSBC', hadOpportunity: true },
        { id: '001Hp00003kL3Mo', name: 'Honeywell', hadOpportunity: true },
        { id: '001Hp00003kIrIy', name: 'Huntsman', hadOpportunity: true },
        { id: '001Wj00000d7IL8', name: 'IAC', hadOpportunity: true },
        { id: '001Hp00003kIrJ0', name: 'IBM', hadOpportunity: true },
        { id: '001Wj00000hdoLx', name: 'Insight Enterprises Inc.', hadOpportunity: true },
        { id: '001Wj00000gH7ua', name: 'JFrog', hadOpportunity: true },
        { id: '001Wj00000tNwur', name: 'Janus Henderson', hadOpportunity: false },
        { id: '001Wj00000iC14X', name: 'Klarna', hadOpportunity: true },
        { id: '001Wj00000wSLUl', name: 'LexisNexis', hadOpportunity: false },
        { id: '001Wj00000mCFtJ', name: 'LinkedIn', hadOpportunity: true },
        { id: '001Hp00003kIrJu', name: 'Lockheed Martin', hadOpportunity: true },
        { id: '001Hp00003kIrKC', name: 'Mass Mutual Life Insurance', hadOpportunity: true },
        { id: '001Hp00003kIrKO', name: 'Microsoft', hadOpportunity: true },
        { id: '001Wj00000lyDQk', name: 'MidOcean Partners', hadOpportunity: true },
        { id: '001Hp00003kIrKT', name: 'Morgan Stanley', hadOpportunity: true },
        { id: '001Wj00000bWIxq', name: 'Motiva', hadOpportunity: true },
        { id: '001Hp00003kIrKr', name: 'NVIDIA', hadOpportunity: false },
        { id: '001Hp00003kIrCx', name: 'Novartis', hadOpportunity: true },
        { id: '001Wj00000hVTTB', name: 'One Oncology', hadOpportunity: true },
        { id: '001Wj00000Y6VVW', name: 'Oscar Health', hadOpportunity: true },
        { id: '001Wj00000eLHLO', name: 'Palo Alto Networks', hadOpportunity: false },
        { id: '001Wj00000kNp2X', name: 'Plusgrade', hadOpportunity: true },
        { id: '001Wj00000YoLqW', name: 'Procore Technologies', hadOpportunity: true },
        { id: '001Wj00000lXD0F', name: 'RBI (Burger King)', hadOpportunity: false },
        { id: '001Hp00003kIrLx', name: 'Republic Services', hadOpportunity: false },
        { id: '001Wj00000bWJ0J', name: 'SAP', hadOpportunity: false },
        { id: '001Hp00003kIrD9', name: 'Salesforce', hadOpportunity: true },
        { id: '001Wj00000fPr6N', name: 'Santander', hadOpportunity: true },
        { id: '001Hp00003kIrMK', name: 'ServiceNow', hadOpportunity: true },
        { id: '001Wj00000eL760', name: 'Shell', hadOpportunity: false },
        { id: '001Wj00000kNmsg', name: 'Skims', hadOpportunity: true },
        { id: '001Wj00000aCGR3', name: 'Solventum', hadOpportunity: true },
        { id: '001Hp00003kIrEC', name: 'Southwest Airlines', hadOpportunity: true },
        { id: '001Hp00003kIrMc', name: 'SpaceX', hadOpportunity: false },
        { id: '001Wj00000SdYHq', name: 'Spotify', hadOpportunity: true },
        { id: '001Hp00003kIrDl', name: 'StoneX Group', hadOpportunity: true },
        { id: '001Wj00000WYtsU', name: 'Tenable', hadOpportunity: true },
        { id: '001Hp00003kIrN5', name: 'Tesla', hadOpportunity: false },
        { id: '001Wj00000c0wRK', name: 'The Initial Group', hadOpportunity: true },
        { id: '001Wj00000bWBlX', name: 'Thomson Reuters Ventures', hadOpportunity: false },
        { id: '001Hp00003kIrCs', name: 'UPS', hadOpportunity: true },
        { id: '001Wj00000tuRNo', name: 'Virtusa', hadOpportunity: true },
        { id: '001Hp00003kIrNw', name: 'W.W. Grainger', hadOpportunity: true },
        { id: '001Hp00003kIrNy', name: 'Walmart', hadOpportunity: true },
        { id: '001Wj00000Y64qk', name: 'Warburg Pincus LLC', hadOpportunity: false },
        { id: '001Wj00000bzz9N', name: 'Wealth Partners Capital Group', hadOpportunity: true },
        { id: '001Wj00000tuolf', name: 'Wynn Las Vegas', hadOpportunity: true },
        { id: '001Wj00000bzz9Q', name: 'Youtube', hadOpportunity: true },
        { id: '001Wj00000uzs1f', name: 'Zero RFI', hadOpportunity: true },
      ]
    },

    // CONOR MOLLOY (19 active + 77 prospect = 96 total)
    'conor.molloy@eudia.com': {
      email: 'conor.molloy@eudia.com',
      name: 'Conor Molloy',
      accounts: [
        { id: '001Wj00000mCFrf', name: 'APEX Group', hadOpportunity: false },
        { id: '001Wj00000xxtg6', name: 'ASR Nederland', hadOpportunity: false },
        { id: '001Hp00003kIrQD', name: 'Accenture', hadOpportunity: true },
        { id: '001Wj00000qLixn', name: 'Al Dahra Group Llc', hadOpportunity: true },
        { id: '001Wj00000syNyn', name: 'Alliance Healthcare', hadOpportunity: false },
        { id: '001Hp00003kIrEy', name: 'Aramark Ireland', hadOpportunity: true },
        { id: '001Wj00000tWwXk', name: 'Aramex', hadOpportunity: false },
        { id: '001Wj00000xyXlY', name: 'Arkema', hadOpportunity: false },
        { id: '001Wj00000mCFrg', name: 'Aryza', hadOpportunity: true },
        { id: '001Wj00000xz3F7', name: 'Aurubis', hadOpportunity: false },
        { id: '001Wj00000bWIzJ', name: 'BAE Systems, Inc.', hadOpportunity: false },
        { id: '001Wj00000fFhea', name: 'BBC News', hadOpportunity: false },
        { id: '001Wj00000Y6Vk4', name: 'BBC Studios', hadOpportunity: false },
        { id: '001Wj00000xypIc', name: 'BMW Group', hadOpportunity: false },
        { id: '001Wj00000eLPna', name: 'BP', hadOpportunity: false },
        { id: '001Wj00000tsfWO', name: 'Baker Tilly', hadOpportunity: true },
        { id: '001Wj00000tWwXr', name: 'Bestseller', hadOpportunity: false },
        { id: '001Wj00000xz3LZ', name: 'Bouygues', hadOpportunity: false },
        { id: '001Wj00000xz3Td', name: 'British Broadcasting Corporation', hadOpportunity: false },
        { id: '001Wj00000xyc3f', name: 'Carrefour', hadOpportunity: false },
        { id: '001Wj00000tWwXy', name: 'Citco', hadOpportunity: false },
        { id: '001Wj00000mCFrk', name: 'Coillte', hadOpportunity: true },
        { id: '001Wj00000mCFsH', name: 'Consensys', hadOpportunity: true },
        { id: '001Wj00000xxS3B', name: 'Currys', hadOpportunity: false },
        { id: '001Wj00000Y6Vgo', name: 'Cushman & Wakefield', hadOpportunity: false },
        { id: '001Wj00000tWwY2', name: 'DB Schenker', hadOpportunity: false },
        { id: '001Wj00000xxpXf', name: 'DZ Bank', hadOpportunity: false },
        { id: '001Wj00000bWIzG', name: 'DZB BANK GmbH', hadOpportunity: false },
        { id: '001Wj00000Y6VMZ', name: 'Danone', hadOpportunity: false },
        { id: '001Wj00000xyCKX', name: 'Deutsche Bahn', hadOpportunity: false },
        { id: '001Wj00000tWwY3', name: 'Dyson', hadOpportunity: false },
        { id: '001Wj00000xy3Iu', name: 'E.ON', hadOpportunity: false },
        { id: '001Wj00000xz3Jx', name: 'Electricite de France', hadOpportunity: false },
        { id: '001Hp00003kIrHR', name: 'Electronic Arts', hadOpportunity: false },
        { id: '001Wj00000xz373', name: 'Energie Baden-Wurttemberg', hadOpportunity: false },
        { id: '001Wj00000xwnL0', name: 'Evonik Industries', hadOpportunity: false },
        { id: '001Wj00000xyr5v', name: 'FMS Wertmanagement', hadOpportunity: false },
        { id: '001Wj00000Y6DDb', name: 'Federal Reserve Bank of New York', hadOpportunity: false },
        { id: '001Wj00000tWwYf', name: 'Fenergo', hadOpportunity: false },
        { id: '001Wj00000xxuFZ', name: 'Finatis', hadOpportunity: false },
        { id: '001Wj00000xz3QP', name: 'Groupe SEB', hadOpportunity: false },
        { id: '001Wj00000syXLZ', name: 'Guerbet', hadOpportunity: false },
        { id: '001Wj00000xyP83', name: 'Heraeus Holding', hadOpportunity: false },
        { id: '001Wj00000xxuVh', name: 'Hermes International', hadOpportunity: false },
        { id: '001Wj00000xz32D', name: 'Hornbach Group', hadOpportunity: false },
        { id: '001Wj00000hkk0u', name: 'ICON', hadOpportunity: false },
        { id: '001Wj00000mCFr2', name: 'ICON Clinical Research', hadOpportunity: true },
        { id: '001Wj00000Y64qd', name: 'ION', hadOpportunity: true },
        { id: '001Wj00000xz3AH', name: 'Ingka Group', hadOpportunity: false },
        { id: '001Wj00000tWwXa', name: 'Jacobs Engineering Group', hadOpportunity: false },
        { id: '001Wj00000xz30c', name: 'Johnson Matthey', hadOpportunity: false },
        { id: '001Wj00000mCFtM', name: 'Kellanova', hadOpportunity: true },
        { id: '001Wj00000xz3S1', name: 'Klockner', hadOpportunity: false },
        { id: '001Wj00000tWwYC', name: 'Kuehne & Nagel', hadOpportunity: false },
        { id: '001Wj00000bWIym', name: 'LSEG', hadOpportunity: false },
        { id: '001Wj00000Y6VZE', name: 'Linde', hadOpportunity: false },
        { id: '001Wj00000xy1Lu', name: 'M&G', hadOpportunity: false },
        { id: '001Wj00000xz0h4', name: 'Metinvest', hadOpportunity: false },
        { id: '001Wj00000xyNse', name: 'NN Group', hadOpportunity: false },
        { id: '001Wj00000xyECc', name: 'Network Rail', hadOpportunity: false },
        { id: '001Wj00000xyudG', name: 'Nordex', hadOpportunity: false },
        { id: '001Wj00000tWwXc', name: 'Ocorian', hadOpportunity: false },
        { id: '001Wj00000fFW1m', name: 'Okta', hadOpportunity: false },
        { id: '001Wj00000mCFrI', name: 'Orsted', hadOpportunity: true },
        { id: '001Wj00000tWwYK', name: 'PGIM', hadOpportunity: false },
        { id: '001Wj00000xz38f', name: 'PPF Group', hadOpportunity: false },
        { id: '001Wj00000tWwYi', name: 'Penneys', hadOpportunity: false },
        { id: '001Wj00000tWwYL', name: 'Philips Electronics', hadOpportunity: false },
        { id: '001Wj00000tWwYP', name: 'Reddit', hadOpportunity: false },
        { id: '001Wj00000mCFrU', name: 'Riot Games', hadOpportunity: true },
        { id: '001Wj00000xyD0Q', name: 'Rolls-Royce', hadOpportunity: false },
        { id: '001Wj00000xxIqC', name: 'Royal Ahold Delhaize', hadOpportunity: false },
        { id: '001Wj00000xz3Gj', name: 'Rubis', hadOpportunity: false },
        { id: '001Wj00000xyrh0', name: 'Salzgitter', hadOpportunity: false },
        { id: '001Wj00000bWBm6', name: 'Schneider Electric', hadOpportunity: false },
        { id: '001Wj00000mI9Nm', name: 'Sequoia Climate Fund', hadOpportunity: false },
        { id: '001Wj00000fCp7J', name: 'Siemens', hadOpportunity: false },
        { id: '001Wj00000tWwYR', name: 'Smurfit Kappa', hadOpportunity: false },
        { id: '001Wj00000tWwYS', name: 'Stewart', hadOpportunity: false },
        { id: '001Wj00000syavy', name: 'Symrise AG', hadOpportunity: false },
        { id: '001Wj00000mCFs0', name: 'Taoglas Limited', hadOpportunity: true },
        { id: '001Wj00000mCFtP', name: 'Teamwork.com', hadOpportunity: true },
        { id: '001Wj00000sxsOq', name: 'TechnipFMC', hadOpportunity: false },
        { id: '001Wj00000tWwXe', name: 'Teneo', hadOpportunity: false },
        { id: '001Wj00000Y64qc', name: 'Thales', hadOpportunity: false },
        { id: '001Hp00003kIrNJ', name: 'Toyota', hadOpportunity: true },
        { id: '001Wj00000mCFqw', name: 'Ulster Bank', hadOpportunity: false },
        { id: '001Wj00000xxDSI', name: 'Unedic', hadOpportunity: false },
        { id: '001Wj00000mCFs2', name: 'Vantage Towers', hadOpportunity: true },
        { id: '001Hp00003kIrNs', name: 'Vistra', hadOpportunity: true },
        { id: '001Wj00000Y6VZD', name: 'WPP', hadOpportunity: true },
        { id: '001Wj00000ZLVpT', name: 'Wellspring Philanthropic Fund', hadOpportunity: true },
        { id: '001Wj00000mCFsY', name: 'World Rugby', hadOpportunity: false },
        { id: '001Wj00000xyygs', name: 'Wurth', hadOpportunity: false },
        { id: '001Wj00000aLlzL', name: 'Xerox', hadOpportunity: false },
        { id: '001Wj00000j3QNL', name: 'adidas', hadOpportunity: false },
      ]
    },

    // DAVID VAN REYK (2 active + 0 prospect = 2 total)
    'david.vanreyk@eudia.com': {
      email: 'david.vanreyk@eudia.com',
      name: 'David Van Reyk',
      accounts: [
        { id: '001Wj00000cIA4i', name: 'Amerivet', hadOpportunity: true },
        { id: '001Wj00000dw9pN', name: 'Ardian', hadOpportunity: true },
      ]
    },

    // EMER FLYNN (1 active + 9 prospect = 10 total)
    'emer.flynn@eudia.com': {
      email: 'emer.flynn@eudia.com',
      name: 'Emer Flynn',
      accounts: [
        { id: '001Wj00000syUts', name: 'Bakkavor', hadOpportunity: false },
        { id: '001Wj00000syAdO', name: 'Bonduelle', hadOpportunity: false },
        { id: '001Wj00000syAoe', name: 'Gerresheimer', hadOpportunity: false },
        { id: '001Wj00000syBb5', name: 'Harbour Energy', hadOpportunity: false },
        { id: '001Wj00000soqIv', name: 'Lundbeck', hadOpportunity: false },
        { id: '001Wj00000mCFr6', name: 'NTMA', hadOpportunity: true },
        { id: '001Wj00000sxy9J', name: 'Orion Pharma', hadOpportunity: false },
        { id: '001Wj00000soqNk', name: 'Sobi', hadOpportunity: false },
        { id: '001Wj00000sy54F', name: 'SubSea7', hadOpportunity: false },
        { id: '001Wj00000sxvzJ', name: 'Virbac', hadOpportunity: false },
      ]
    },

    // GREG MACHALE (38 active + 116 prospect = 154 total)
    'greg.machale@eudia.com': {
      email: 'greg.machale@eudia.com',
      name: 'Greg MacHale',
      accounts: [
        { id: '001Wj00000Y64ql', name: 'ABN AMRO Bank N.V.', hadOpportunity: false },
        { id: '001Wj00000tWwYd', name: 'AXA', hadOpportunity: false },
        { id: '001Hp00003kIrEF', name: 'Abbott Laboratories', hadOpportunity: true },
        { id: '001Wj00000tWwXg', name: 'Abtran', hadOpportunity: false },
        { id: '001Wj00000umCEl', name: 'Aerogen', hadOpportunity: false },
        { id: '001Wj00000xyMyB', name: 'Air Liquide', hadOpportunity: false },
        { id: '001Wj00000tWwYa', name: 'Allergan', hadOpportunity: false },
        { id: '001Wj00000sgXdB', name: 'Allianz Insurance', hadOpportunity: true },
        { id: '001Wj00000tWwYb', name: 'Almac Group', hadOpportunity: false },
        { id: '001Hp00003kIrEm', name: 'Amgen', hadOpportunity: false },
        { id: '001Wj00000pzTPu', name: 'Arrow Global Group PLC/Mars Capital', hadOpportunity: false },
        { id: '001Wj00000tWwXm', name: 'Arvato Digital Services', hadOpportunity: false },
        { id: '001Wj00000tWwXn', name: 'Arvato Supply Chain Solutions', hadOpportunity: false },
        { id: '001Wj00000tWwYc', name: 'Arvato Systems', hadOpportunity: false },
        { id: '001Wj00000xz3VF', name: 'Asklepios', hadOpportunity: false },
        { id: '001Wj00000vWwfx', name: 'Associated British Foods', hadOpportunity: false },
        { id: '001Hp00003kIrFB', name: 'AstraZeneca', hadOpportunity: false },
        { id: '001Wj00000bWJ0A', name: 'Atos', hadOpportunity: false },
        { id: '001Wj00000hfWMu', name: 'Aya Healthcare', hadOpportunity: false },
        { id: '001Wj00000tWwXV', name: 'BCM Group', hadOpportunity: false },
        { id: '001Wj00000tWwXU', name: 'BCMGlobal ASI Ltd', hadOpportunity: false },
        { id: '001Wj00000Y6VMd', name: 'BNP Paribas', hadOpportunity: true },
        { id: '001Wj00000X4OqN', name: 'BT Group', hadOpportunity: true },
        { id: '001Wj00000vRJ13', name: 'BWG Group', hadOpportunity: false },
        { id: '001Wj00000bWBsw', name: 'Bausch + Lomb', hadOpportunity: false },
        { id: '001Hp00003kIrFO', name: 'Baxter International', hadOpportunity: false },
        { id: '001Wj00000wLIjh', name: 'Baywa', hadOpportunity: false },
        { id: '001Wj00000tWwXs', name: 'Bidvest Noonan', hadOpportunity: false },
        { id: '001Wj00000mCFqr', name: 'Biomarin International Limited', hadOpportunity: true },
        { id: '001Hp00003kIrFd', name: 'Booking Holdings', hadOpportunity: true },
        { id: '001Wj00000T5gdt', name: 'Bosch', hadOpportunity: false },
        { id: '001Hp00003kIrFg', name: 'Boston Scientific', hadOpportunity: false },
        { id: '001Wj00000xyNsd', name: 'Brenntag', hadOpportunity: false },
        { id: '001Wj00000tgYgj', name: 'British American Tobacco ( BAT )', hadOpportunity: false },
        { id: '001Wj00000ulXoK', name: 'British Petroleum ( BP )', hadOpportunity: false },
        { id: '001Hp00003kIrDK', name: 'Bupa', hadOpportunity: false },
        { id: '001Wj00000bWBkr', name: 'CRH', hadOpportunity: false },
        { id: '001Wj00000uZ5J7', name: 'Canada Life', hadOpportunity: true },
        { id: '001Hp00003kIrFu', name: 'Capgemini', hadOpportunity: false },
        { id: '001Wj00000tWwYe', name: 'Capita', hadOpportunity: false },
        { id: '001Wj00000mCFt9', name: 'Cerberus European Servicing', hadOpportunity: true },
        { id: '001Wj00000tWwXz', name: 'CluneTech', hadOpportunity: false },
        { id: '001Wj00000wKnrE', name: 'Co-operative Group ( Co-op )', hadOpportunity: false },
        { id: '001Wj00000Y6HEM', name: 'Commerzbank AG', hadOpportunity: false },
        { id: '001Wj00000aLp9L', name: 'Compass', hadOpportunity: false },
        { id: '001Wj00000cSBr6', name: 'Compass Group Equity Partners', hadOpportunity: false },
        { id: '001Wj00000Y6VMk', name: 'Computershare', hadOpportunity: true },
        { id: '001Wj00000uP5x8', name: 'Cornmarket Financial Services', hadOpportunity: true },
        { id: '001Wj00000tWwY0', name: 'Cornmarket Hill Trading Limited', hadOpportunity: false },
        { id: '001Hp00003kIrGk', name: 'Covestro', hadOpportunity: false },
        { id: '001Wj00000tWwXY', name: 'DCC Vital', hadOpportunity: false },
        { id: '001Wj00000mCFrV', name: 'Danske Bank', hadOpportunity: false },
        { id: '001Hp00003kJ9fx', name: 'Deutsche Bank AG', hadOpportunity: false },
        { id: '001Wj00000Y6VMM', name: 'Diageo', hadOpportunity: true },
        { id: '001Wj00000prFOX', name: 'Doosan Bobcat', hadOpportunity: true },
        { id: '001Wj00000wKzZ1', name: 'Drax Group', hadOpportunity: false },
        { id: '001Hp00003kIrHQ', name: 'EG Group', hadOpportunity: false },
        { id: '001Wj00000hUcQZ', name: 'EY', hadOpportunity: true },
        { id: '001Wj00000wK30S', name: 'EY ( Ernst & Young )', hadOpportunity: false },
        { id: '001Hp00003kIrHL', name: 'Eaton Corporation', hadOpportunity: false },
        { id: '001Wj00000mCFtR', name: 'Ekco Cloud Limited', hadOpportunity: true },
        { id: '001Hp00003kIrHS', name: 'Elevance Health', hadOpportunity: false },
        { id: '001Hp00003kIrHT', name: 'Eli Lilly', hadOpportunity: false },
        { id: '001Wj00000Y6HEn', name: 'Ferring Pharmaceuticals', hadOpportunity: false },
        { id: '001Wj00000tWwYn', name: 'Fibrus', hadOpportunity: false },
        { id: '001Hp00003kIrHu', name: 'Fidelity Investments', hadOpportunity: false },
        { id: '001Hp00003kIrI0', name: 'Fiserv', hadOpportunity: false },
        { id: '001Wj00000xxg4V', name: 'Fnac Darty', hadOpportunity: false },
        { id: '001Wj00000wL79x', name: 'Frasers Group', hadOpportunity: false },
        { id: '001Wj00000aLlyX', name: 'Gartner', hadOpportunity: false },
        { id: '001Wj00000fFuFY', name: 'Grant Thornton', hadOpportunity: true },
        { id: '001Wj00000uZ4A9', name: 'Great West Lifec co', hadOpportunity: true },
        { id: '001Wj00000pzTPt', name: 'Gym Plus Coffee', hadOpportunity: false },
        { id: '001Wj00000xW3SE', name: 'Hayfin', hadOpportunity: true },
        { id: '001Wj00000pzTPm', name: 'Hedgserv', hadOpportunity: false },
        { id: '001Wj00000xxsbv', name: 'Heidelberg Materials', hadOpportunity: false },
        { id: '001Wj00000wvtPl', name: 'ICEYE', hadOpportunity: true },
        { id: '001Wj00000mCFrH', name: 'Indra', hadOpportunity: false },
        { id: '001Wj00000uZtcT', name: 'Ineos', hadOpportunity: true },
        { id: '001Wj00000vXdt1', name: 'International Airline Group ( IAG )', hadOpportunity: false },
        { id: '001Wj00000wKnZU', name: 'International Distribution Services', hadOpportunity: false },
        { id: '001Wj00000wKTao', name: 'John Swire & Sons', hadOpportunity: false },
        { id: '001Wj00000vaqot', name: 'Johnson Controls', hadOpportunity: false },
        { id: '001Wj00000xwwRX', name: 'Jumbo Groep Holding', hadOpportunity: false },
        { id: '001Hp00003kIrJb', name: 'KPMG', hadOpportunity: false },
        { id: '001Wj00000Y6VZM', name: 'Kering', hadOpportunity: false },
        { id: '001Wj00000mCFrr', name: 'Kerry Group', hadOpportunity: false },
        { id: '001Wj00000xyyk7', name: 'La Poste', hadOpportunity: false },
        { id: '001Wj00000tWwYr', name: 'Laya Healthcare', hadOpportunity: false },
        { id: '001Wj00000tWwYE', name: 'Leaseplan', hadOpportunity: false },
        { id: '001Wj00000tWwYF', name: 'Linked Finance', hadOpportunity: false },
        { id: '001Wj00000Y6HEA', name: 'Lloyds Banking Group', hadOpportunity: false },
        { id: '001Wj00000xyDV4', name: 'LyondellBasell Industries', hadOpportunity: false },
        { id: '001Wj00000tWwYG', name: 'MSC - Mediterranean Shipping Company', hadOpportunity: false },
        { id: '001Wj00000wvGLB', name: 'MTU Maintenance Lease Services', hadOpportunity: false },
        { id: '001Wj00000iC14L', name: 'MUFG Investor Services', hadOpportunity: false },
        { id: '001Wj00000xyp2U', name: 'MVV Energie', hadOpportunity: false },
        { id: '001Wj00000tWwYp', name: 'Mail Metrics', hadOpportunity: true },
        { id: '001Wj00000qFtCk', name: 'Mars Capital', hadOpportunity: false },
        { id: '001Wj00000pAeWg', name: 'Meetingsbooker', hadOpportunity: true },
        { id: '001Hp00003kIrKJ', name: 'Mercedes-Benz Group', hadOpportunity: true },
        { id: '001Wj00000YEMaI', name: 'Mercer', hadOpportunity: false },
        { id: '001Wj00000vwSUX', name: 'Mercor', hadOpportunity: true },
        { id: '001Wj00000mCFtU', name: 'Mercury Engineering', hadOpportunity: true },
        { id: '001Wj00000yGZth', name: 'Monzo', hadOpportunity: false },
        { id: '001Wj00000tWwYg', name: 'Musgrave', hadOpportunity: false },
        { id: '001Wj00000lPFP3', name: 'Nomura', hadOpportunity: true },
        { id: '001Wj00000tWwYH', name: 'Norbrook Laboratories', hadOpportunity: false },
        { id: '001Hp00003kIrKn', name: 'Northrop Grumman', hadOpportunity: false },
        { id: '001Wj00000xxcH4', name: 'Orange', hadOpportunity: false },
        { id: '001Wj00000tWwYI', name: 'P.J. Carroll (BAT Ireland)', hadOpportunity: false },
        { id: '001Wj00000mCFsf', name: 'Pepper Finance Corporation', hadOpportunity: true },
        { id: '001Wj00000mCFrO', name: 'Peptalk', hadOpportunity: true },
        { id: '001Wj00000mCFr1', name: 'Permanent TSB plc', hadOpportunity: true },
        { id: '001Wj00000Y6QfR', name: 'Pernod Ricard', hadOpportunity: true },
        { id: '001Wj00000vVxFy', name: 'Phoenix Group', hadOpportunity: false },
        { id: '001Wj00000tWwYM', name: 'Pinewood Laboratories', hadOpportunity: false },
        { id: '001Wj00000tWwYN', name: 'Pinsent Masons', hadOpportunity: false },
        { id: '001Wj00000tWwYO', name: 'Pramerica', hadOpportunity: false },
        { id: '001Hp00003kIrLf', name: 'PwC', hadOpportunity: false },
        { id: '001Hp00003kIrLi', name: 'Quest Diagnostics', hadOpportunity: true },
        { id: '001Wj00000xy735', name: 'RATP Group', hadOpportunity: false },
        { id: '001Wj00000xyKjS', name: 'Randstad', hadOpportunity: false },
        { id: '001Wj00000mCFsF', name: 'Regeneron', hadOpportunity: true },
        { id: '001Wj00000xwh4H', name: 'Renault', hadOpportunity: false },
        { id: '001Wj00000xy1P5', name: 'Rheinmetall', hadOpportunity: false },
        { id: '001Wj00000tWwYQ', name: 'Roche', hadOpportunity: false },
        { id: '001Wj00000wKi8O', name: 'Royal London', hadOpportunity: false },
        { id: '001Wj00000mCFsR', name: 'Ryanair', hadOpportunity: true },
        { id: '001Wj00000xyJqd', name: 'SCOR', hadOpportunity: false },
        { id: '001Wj00000pAxKo', name: 'SSP Group', hadOpportunity: true },
        { id: '001Wj00000bWIzx', name: 'Saint-Gobain', hadOpportunity: false },
        { id: '001Wj00000pzTPv', name: 'Scottish Friendly', hadOpportunity: false },
        { id: '001Wj00000bzz9U', name: 'Signify Group', hadOpportunity: true },
        { id: '001Wj00000fFuG4', name: 'Sky', hadOpportunity: false },
        { id: '001Hp00003kIrDR', name: 'Smith & Nephew', hadOpportunity: false },
        { id: '001Hp00003kIrE1', name: 'Societe Generale', hadOpportunity: false },
        { id: '001Hp00003kIrMj', name: 'State Street', hadOpportunity: true },
        { id: '001Wj00000xyy4A', name: 'Sudzucker', hadOpportunity: false },
        { id: '001Wj00000mCFtB', name: 'SurveyMonkey', hadOpportunity: false },
        { id: '001Wj00000xypQh', name: 'TUI', hadOpportunity: false },
        { id: '001Wj00000tWwYT', name: 'Takeda', hadOpportunity: false },
        { id: '001Wj00000wKD4c', name: 'Talanx', hadOpportunity: false },
        { id: '001Wj00000mCFr9', name: 'Tesco', hadOpportunity: true },
        { id: '001Wj00000tWwYX', name: 'Tullow Oil', hadOpportunity: false },
        { id: '001Wj00000mCFsS', name: 'Uniphar PLC', hadOpportunity: true },
        { id: '001Hp00003kIrNg', name: 'UnitedHealth Group', hadOpportunity: false },
        { id: '001Wj00000mCFsx', name: 'Vodafone Ireland', hadOpportunity: false },
        { id: '001Wj00000xybh4', name: 'Wendel', hadOpportunity: false },
        { id: '001Wj00000sCb3D', name: 'Willis Towers Watson', hadOpportunity: false },
        { id: '001Wj00000tWwYY', name: 'Winthrop', hadOpportunity: false },
        { id: '001Wj00000pzTPW', name: 'WizzAir', hadOpportunity: false },
        { id: '001Wj00000mCFrm', name: 'eShopWorld', hadOpportunity: true },
        { id: '001Hp00003kJ9Ck', name: 'wnco.com', hadOpportunity: false },
      ]
    },

    // HIMANSHU AGARWAL (20 active + 7 prospect = 27 total)
    'himanshu.agarwal@eudia.com': {
      email: 'himanshu.agarwal@eudia.com',
      name: 'Himanshu Agarwal',
      accounts: [
        { id: '001Hp00003kIrEs', name: 'AON', hadOpportunity: true },
        { id: '001Wj00000RwUpO', name: 'Acrisure', hadOpportunity: true },
        { id: '001Hp00003kIrCd', name: 'Adobe', hadOpportunity: false },
        { id: '001Hp00003kIrEU', name: 'Albertsons', hadOpportunity: true },
        { id: '001Wj00000T6Hrw', name: 'Atlassian', hadOpportunity: true },
        { id: '001Wj00000ZRrYl', name: 'Avis Budget Group', hadOpportunity: true },
        { id: '001Wj00000kIYAD', name: 'Axis Bank', hadOpportunity: true },
        { id: '001Hp00003kIrD0', name: 'Broadcom', hadOpportunity: true },
        { id: '001Hp00003kIrGh', name: 'Costco Wholesale', hadOpportunity: false },
        { id: '001Hp00003kIrCu', name: 'Disney', hadOpportunity: false },
        { id: '001Hp00003kIrIF', name: 'Gap', hadOpportunity: true },
        { id: '001Hp00003kIrDN', name: 'Genpact', hadOpportunity: true },
        { id: '001Wj00000Zcmad', name: 'Geodis', hadOpportunity: true },
        { id: '001Wj00000Q2yaX', name: 'Innovative Driven', hadOpportunity: false },
        { id: '001Hp00003lhshd', name: 'Instacart', hadOpportunity: true },
        { id: '001Hp00003kIrJx', name: 'Lowe\'s', hadOpportunity: false },
        { id: '001Hp00003kIrDk', name: 'Moderna', hadOpportunity: true },
        { id: '001Wj00000hDvCc', name: 'Nykaa', hadOpportunity: true },
        { id: '001Wj00000h9r1F', name: 'Piramal Finance', hadOpportunity: true },
        { id: '001Hp00003kIrDc', name: 'Progressive', hadOpportunity: true },
        { id: '001Wj00000cyDxS', name: 'Pyxus', hadOpportunity: true },
        { id: '001Wj00000XXvnk', name: 'Relativity', hadOpportunity: true },
        { id: '001Wj00000kIFDh', name: 'Reliance', hadOpportunity: true },
        { id: '001Wj00000eKsGZ', name: 'Snowflake', hadOpportunity: false },
        { id: '001Hp00003kIrNr', name: 'Visa', hadOpportunity: true },
        { id: '001Hp00003kIrO0', name: 'Warner Bros Discovery', hadOpportunity: false },
        { id: '001Hp00003kIrDT', name: 'xAI', hadOpportunity: true },
      ]
    },

    // JON COBB (2 active + 0 prospect = 2 total)
    'jon.cobb@eudia.com': {
      email: 'jon.cobb@eudia.com',
      name: 'Jon Cobb',
      accounts: [
        { id: '001Wj00000XTOQZ', name: 'Armstrong World Industries', hadOpportunity: true },
        { id: '001Wj00000c0Cxn', name: 'U.S. Aircraft Insurance Group', hadOpportunity: true },
      ]
    },

    // JULIE STEFANICH (47 active + 5 prospect = 52 total)
    'julie.stefanich@eudia.com': {
      email: 'julie.stefanich@eudia.com',
      name: 'Julie Stefanich',
      accounts: [
        { id: '001Wj00000asSHB', name: 'Airbus', hadOpportunity: true },
        { id: '001Hp00003kIrEl', name: 'Ameriprise Financial', hadOpportunity: true },
        { id: '001Wj00000X6IDs', name: 'Andersen', hadOpportunity: true },
        { id: '001Hp00003kIrEv', name: 'Apple', hadOpportunity: true },
        { id: '001Wj00000soLVH', name: 'Base Power', hadOpportunity: true },
        { id: '001Hp00003kJ9pX', name: 'Bayer', hadOpportunity: true },
        { id: '001Hp00003kIrFP', name: 'Bechtel', hadOpportunity: true },
        { id: '001Hp00003kIrFZ', name: 'Block', hadOpportunity: true },
        { id: '001Hp00003kIrE3', name: 'Cargill', hadOpportunity: true },
        { id: '001Hp00003kIrGD', name: 'Charles Schwab', hadOpportunity: true },
        { id: '001Hp00003kIrE4', name: 'Chevron', hadOpportunity: true },
        { id: '001Hp00003kIrDh', name: 'Comcast', hadOpportunity: true },
        { id: '001Hp00003kIrGe', name: 'Corebridge Financial', hadOpportunity: true },
        { id: '001Wj00000eLJAK', name: 'CrowdStrike', hadOpportunity: false },
        { id: '001Hp00003liBe9', name: 'DoorDash', hadOpportunity: false },
        { id: '001Hp00003kIrE7', name: 'ECMS', hadOpportunity: true },
        { id: '001Hp00003kIrHP', name: 'Edward Jones', hadOpportunity: true },
        { id: '001Wj00000iRzqv', name: 'Florida Crystals Corporation', hadOpportunity: true },
        { id: '001Wj00000XS3MX', name: 'Flutter', hadOpportunity: true },
        { id: '001Hp00003kIrIP', name: 'Genworth Financial', hadOpportunity: true },
        { id: '001Hp00003kIrIX', name: 'Goldman Sachs', hadOpportunity: true },
        { id: '001Wj00000rceVp', name: 'Hikma', hadOpportunity: true },
        { id: '001Hp00003kIrJV', name: 'KLA', hadOpportunity: true },
        { id: '001Wj00000XkT43', name: 'Kaiser Permanente', hadOpportunity: true },
        { id: '001Wj00000aLmhe', name: 'Macmillan', hadOpportunity: true },
        { id: '001Wj00000X6G8q', name: 'Mainsail Partners', hadOpportunity: true },
        { id: '001Hp00003kIrDb', name: 'McKinsey & Company', hadOpportunity: true },
        { id: '001Hp00003kIrKL', name: 'MetLife', hadOpportunity: true },
        { id: '001Hp00003kIrCp', name: 'Mosaic', hadOpportunity: true },
        { id: '001Hp00003kIrDe', name: 'National Grid', hadOpportunity: true },
        { id: '001Hp00003kIrKY', name: 'Netflix', hadOpportunity: true },
        { id: '001Hp00003kIrKj', name: 'Nordstrom', hadOpportunity: true },
        { id: '001Hp00003kIrL2', name: 'O\'Reilly Automotive', hadOpportunity: true },
        { id: '001Hp00003kIrDv', name: 'Oracle', hadOpportunity: true },
        { id: '001Hp00003kIrLP', name: 'PG&E', hadOpportunity: false },
        { id: '001Hp00003kIrLH', name: 'PayPal inc.', hadOpportunity: false },
        { id: '001Hp00003kIrLN', name: 'Petsmart', hadOpportunity: true },
        { id: '001Hp00003kIrLZ', name: 'Procter & Gamble', hadOpportunity: true },
        { id: '001Wj00000XcHEb', name: 'Resmed', hadOpportunity: true },
        { id: '001Hp00003lhsUY', name: 'Rio Tinto Group', hadOpportunity: true },
        { id: '001Wj00000svQI3', name: 'Safelite', hadOpportunity: true },
        { id: '001Wj00000Yfysf', name: 'Samsara', hadOpportunity: true },
        { id: '001Wj00000fRtLm', name: 'State Farm', hadOpportunity: true },
        { id: '001Hp00003kIrNH', name: 'T-Mobile', hadOpportunity: true },
        { id: '001Hp00003kIrCr', name: 'TIAA', hadOpportunity: true },
        { id: '001Wj00000bIVo1', name: 'TSMC', hadOpportunity: true },
        { id: '001Wj00000bzz9T', name: 'Tailored Brands', hadOpportunity: true },
        { id: '001Hp00003kIrNB', name: 'The Wonderful Company', hadOpportunity: true },
        { id: '001Hp00003kIrNV', name: 'Uber', hadOpportunity: true },
        { id: '001Wj00000Y6VYk', name: 'Verifone', hadOpportunity: true },
        { id: '001Hp00003kIrOL', name: 'World Wide Technology', hadOpportunity: true },
        { id: '001Wj00000bWIza', name: 'eBay', hadOpportunity: false },
      ]
    },

    // JUSTIN HILLS (18 active + 7 prospect = 25 total)
    'justin.hills@eudia.com': {
      email: 'justin.hills@eudia.com',
      name: 'Justin Hills',
      accounts: [
        { id: '001Wj00000vCx6j', name: '1800 Flowers', hadOpportunity: false },
        { id: '001Wj00000Y6VM4', name: 'Ares Management Corporation', hadOpportunity: true },
        { id: '001Hp00003kIrG8', name: 'Centene', hadOpportunity: true },
        { id: '001Wj00000c9oCv', name: 'Cox Media Group', hadOpportunity: true },
        { id: '001Wj00000vCPMs', name: 'Crusoe', hadOpportunity: false },
        { id: '001Wj00000vCiAw', name: 'Deel', hadOpportunity: false },
        { id: '001Wj00000Y0jPm', name: 'Delinea', hadOpportunity: true },
        { id: '001Wj00000iwKGQ', name: 'Dominos', hadOpportunity: true },
        { id: '001Hp00003kIrDa', name: 'Duracell', hadOpportunity: true },
        { id: '001Wj00000Y6Vde', name: 'EPIC Insurance Brokers & Consultants', hadOpportunity: false },
        { id: '001Hp00003kIrIC', name: 'Freddie Mac', hadOpportunity: false },
        { id: '001Hp00003kJ9gW', name: 'Genentech', hadOpportunity: true },
        { id: '001Hp00003kIrDV', name: 'Intel', hadOpportunity: true },
        { id: '001Hp00003kIrJJ', name: 'Johnson & Johnson', hadOpportunity: true },
        { id: '001Wj00000gnrug', name: 'Kraken', hadOpportunity: true },
        { id: '001Wj00000op4EW', name: 'McCormick & Co Inc', hadOpportunity: true },
        { id: '001Wj00000RCeqA', name: 'Nielsen', hadOpportunity: true },
        { id: '001Wj00000YEMZp', name: 'Notion', hadOpportunity: false },
        { id: '001Wj00000ix7c2', name: 'Nouryon', hadOpportunity: true },
        { id: '001Wj00000WYyKI', name: 'Ramp', hadOpportunity: true },
        { id: '001Wj00000hzxnD', name: 'Ro Healthcare', hadOpportunity: false },
        { id: '001Hp00003kIrMi', name: 'Starbucks', hadOpportunity: true },
        { id: '001Wj00000o5G0v', name: 'StockX', hadOpportunity: true },
        { id: '001Wj00000f3bWU', name: 'TransUnion', hadOpportunity: true },
        { id: '001Wj00000oqRyc', name: 'Walgreens Boots Alliance', hadOpportunity: true },
      ]
    },

    // MIKE AYRES (0 active + 1 prospect = 1 total)
    'mike.ayres@eudia.com': {
      email: 'mike.ayres@eudia.com',
      name: 'Mike Ayres',
      accounts: [
        { id: '001Wj00000synYD', name: 'Barry Callebaut Group', hadOpportunity: false },
      ]
    },

    // MIKE MASIELLO (20 active + 6 prospect = 26 total)
    'mike@eudia.com': {
      email: 'mike@eudia.com',
      name: 'Mike Masiello',
      accounts: [
        { id: '001Wj00000celOy', name: 'Arizona Gov Office', hadOpportunity: false },
        { id: '001Wj00000p1lCP', name: 'Army Applications Lab', hadOpportunity: true },
        { id: '001Wj00000p1hYb', name: 'Army Corps of Engineers', hadOpportunity: true },
        { id: '001Wj00000ZxEpD', name: 'Army Futures Command', hadOpportunity: true },
        { id: '001Hp00003lhZrR', name: 'DARPA', hadOpportunity: true },
        { id: '001Wj00000bWBlA', name: 'Defense Innovation Unit (DIU)', hadOpportunity: true },
        { id: '001Hp00003kJzoR', name: 'Gov - Civ', hadOpportunity: false },
        { id: '001Hp00003kJuJ5', name: 'Gov - DOD', hadOpportunity: true },
        { id: '001Wj00000p1PVH', name: 'IFC', hadOpportunity: true },
        { id: '001Wj00000UkYiC', name: 'MITRE', hadOpportunity: false },
        { id: '001Wj00000VVJ31', name: 'NATO', hadOpportunity: true },
        { id: '001Wj00000Ukxzt', name: 'SIIA', hadOpportunity: false },
        { id: '001Wj00000p1Ybm', name: 'SOCOM', hadOpportunity: true },
        { id: '001Wj00000Zwarp', name: 'Second Front', hadOpportunity: false },
        { id: '001Hp00003lhcL9', name: 'Social Security Administration', hadOpportunity: true },
        { id: '001Wj00000p1jH3', name: 'State of Alaska', hadOpportunity: true },
        { id: '001Wj00000hVa6V', name: 'State of Arizona', hadOpportunity: true },
        { id: '001Wj00000p0PcE', name: 'State of California', hadOpportunity: true },
        { id: '001Wj00000bWBke', name: 'U.S. Air Force', hadOpportunity: true },
        { id: '001Wj00000bWIzN', name: 'U.S. Army', hadOpportunity: true },
        { id: '001Hp00003kIrDU', name: 'U.S. Government', hadOpportunity: false },
        { id: '001Wj00000p1SRX', name: 'U.S. Marine Corps', hadOpportunity: true },
        { id: '001Wj00000hfaDc', name: 'U.S. Navy', hadOpportunity: true },
        { id: '001Wj00000Rrm5O', name: 'UK Government', hadOpportunity: true },
        { id: '001Hp00003lieJP', name: 'USDA', hadOpportunity: true },
        { id: '001Wj00000p1SuZ', name: 'Vulcan Special Ops', hadOpportunity: true },
      ]
    },

    // MITCH LOQUACI (2 active + 1 prospect = 3 total)
    'mitch.loquaci@eudia.com': {
      email: 'mitch.loquaci@eudia.com',
      name: 'Mitch Loquaci',
      accounts: [
        { id: '001Hp00003kIrCn', name: 'Home Depot', hadOpportunity: true },
        { id: '001Wj00000wlTbU', name: 'Mimecast', hadOpportunity: false },
        { id: '001Wj00000cpxt0', name: 'Novelis', hadOpportunity: true },
      ]
    },

    // NATHAN SHINE (30 active + 70 prospect = 100 total)
    'nathan.shine@eudia.com': {
      email: 'nathan.shine@eudia.com',
      name: 'Nathan Shine',
      accounts: [
        { id: '001Wj00000xy4hv', name: 'ASDA Group', hadOpportunity: false },
        { id: '001Wj00000xz26A', name: 'Achmea', hadOpportunity: false },
        { id: '001Wj00000xyb9C', name: 'Adient', hadOpportunity: false },
        { id: '001Hp00003kIrEn', name: 'Amphenol', hadOpportunity: true },
        { id: '001Wj00000mCFr3', name: 'Ancestry', hadOpportunity: true },
        { id: '001Wj00000xxHhF', name: 'Ashtead Group', hadOpportunity: false },
        { id: '001Wj00000mCFr5', name: 'Boomi', hadOpportunity: false },
        { id: '001Wj00000mCFrQ', name: 'CaliberAI', hadOpportunity: false },
        { id: '001Wj00000WiFP8', name: 'Cantor Fitzgerald', hadOpportunity: true },
        { id: '001Wj00000mCFrj', name: 'CarTrawler', hadOpportunity: true },
        { id: '001Wj00000xz2UM', name: 'Carnival', hadOpportunity: false },
        { id: '001Wj00000pzTPd', name: 'Circle K', hadOpportunity: false },
        { id: '001Wj00000xyP82', name: 'Claas Group', hadOpportunity: false },
        { id: '001Wj00000bW3KA', name: 'Cloud Software Group', hadOpportunity: false },
        { id: '001Wj00000mHDBo', name: 'Coimisiun na Mean', hadOpportunity: true },
        { id: '001Wj00000mCFqt', name: 'CommScope Technologies', hadOpportunity: true },
        { id: '001Wj00000xz2ZC', name: 'Continental', hadOpportunity: false },
        { id: '001Wj00000Y6wFZ', name: 'Coursera', hadOpportunity: false },
        { id: '001Wj00000xz3DV', name: 'Credit Mutuel Group', hadOpportunity: false },
        { id: '001Wj00000Y6DDY', name: 'Credit Suisse', hadOpportunity: false },
        { id: '001Wj00000pzTPZ', name: 'CubeMatch', hadOpportunity: false },
        { id: '001Wj00000pzTPb', name: 'Dawn Meats', hadOpportunity: false },
        { id: '001Wj00000xxtwB', name: 'Deutsche Telekom', hadOpportunity: false },
        { id: '001Hp00003kIrDM', name: 'Dropbox', hadOpportunity: true },
        { id: '001Wj00000mCFra', name: 'Dunnes Stores', hadOpportunity: true },
        { id: '001Wj00000xxq75', name: 'ELO Group', hadOpportunity: false },
        { id: '001Wj00000xyEnj', name: 'Engie', hadOpportunity: false },
        { id: '001Wj00000mCFqu', name: 'Fexco', hadOpportunity: true },
        { id: '001Wj00000mCFsA', name: 'First Derivatives', hadOpportunity: false },
        { id: '001Wj00000mCFtD', name: 'Flynn O\'Driscoll, Business Lawyers', hadOpportunity: false },
        { id: '001Wj00000xyMmu', name: 'Forvia', hadOpportunity: false },
        { id: '001Wj00000xz3Bt', name: 'Freudenberg Group', hadOpportunity: false },
        { id: '001Wj00000mCFro', name: 'GemCap', hadOpportunity: true },
        { id: '001Wj00000xxqjp', name: 'Groupama', hadOpportunity: false },
        { id: '001Wj00000xyFdR', name: 'Groupe Eiffage', hadOpportunity: false },
        { id: '001Wj00000xxtuZ', name: 'Hays', hadOpportunity: false },
        { id: '001Wj00000xy4A2', name: 'HelloFresh', hadOpportunity: false },
        { id: '001Wj00000mCFrq', name: 'ID-Pal', hadOpportunity: false },
        { id: '001Wj00000xz3IL', name: 'ING Group', hadOpportunity: false },
        { id: '001Wj00000xz2xN', name: 'Inchcape', hadOpportunity: false },
        { id: '001Wj00000mCFs5', name: 'Indeed', hadOpportunity: true },
        { id: '001Wj00000sooaT', name: 'Ipsen', hadOpportunity: false },
        { id: '001Wj00000mCFss', name: 'Irish League of Credit Unions', hadOpportunity: true },
        { id: '001Wj00000mCFrS', name: 'Irish Life', hadOpportunity: true },
        { id: '001Wj00000mCFsV', name: 'Irish Residential Properties REIT Plc', hadOpportunity: false },
        { id: '001Hp00003kIrJO', name: 'Keurig Dr Pepper', hadOpportunity: true },
        { id: '001Wj00000hkk0z', name: 'Kingspan', hadOpportunity: true },
        { id: '001Wj00000mCFrs', name: 'Kitman Labs', hadOpportunity: true },
        { id: '001Wj00000xy1VZ', name: 'LDC Group', hadOpportunity: false },
        { id: '001Wj00000mCFtF', name: 'Let\'s Get Checked', hadOpportunity: false },
        { id: '001Hp00003kIrJo', name: 'Liberty Insurance', hadOpportunity: false },
        { id: '001Wj00000xz2yz', name: 'Marks and Spencer Group', hadOpportunity: false },
        { id: '001Wj00000mCFsM', name: 'McDermott Creed & Martyn', hadOpportunity: true },
        { id: '001Hp00003kIrKF', name: 'McKesson', hadOpportunity: false },
        { id: '001Wj00000mCFso', name: 'Mediolanum', hadOpportunity: true },
        { id: '001Wj00000xyP9g', name: 'Munich Re Group', hadOpportunity: false },
        { id: '001Wj00000xxIyF', name: 'Nationwide Building Society', hadOpportunity: false },
        { id: '001Wj00000xxgZB', name: 'Nebius Group', hadOpportunity: false },
        { id: '001Wj00000symlp', name: 'Nestlé Health Science', hadOpportunity: false },
        { id: '001Wj00000xyYPq', name: 'Nexans', hadOpportunity: false },
        { id: '001Wj00000xybvb', name: 'Next', hadOpportunity: false },
        { id: '001Wj00000syczN', name: 'Nomad Foods', hadOpportunity: false },
        { id: '001Wj00000mCFrF', name: 'OKG Payments Services Limited', hadOpportunity: true },
        { id: '001Wj00000mCFqy', name: 'Oneview Healthcare', hadOpportunity: false },
        { id: '001Wj00000aCGRB', name: 'Optum', hadOpportunity: false },
        { id: '001Wj00000sylmX', name: 'Orlen', hadOpportunity: false },
        { id: '001Wj00000mCFrL', name: 'PROS', hadOpportunity: false },
        { id: '001Wj00000ZDPUI', name: 'Perrigo Pharma', hadOpportunity: true },
        { id: '001Wj00000xz33p', name: 'Phoenix Pharma', hadOpportunity: false },
        { id: '001Wj00000mCFqz', name: 'Phoenix Tower International', hadOpportunity: true },
        { id: '001Wj00000pzTPf', name: 'Pipedrive', hadOpportunity: false },
        { id: '001Wj00000mCFtS', name: 'Poe Kiely Hogan Lanigan', hadOpportunity: true },
        { id: '001Wj00000xxwys', name: 'REWE Group', hadOpportunity: false },
        { id: '001Wj00000xz3On', name: 'Rexel', hadOpportunity: false },
        { id: '001Wj00000xyJLy', name: 'Royal BAM Group', hadOpportunity: false },
        { id: '001Wj00000xysZq', name: 'SPIE', hadOpportunity: false },
        { id: '001Wj00000xxuVg', name: 'SSE', hadOpportunity: false },
        { id: '001Wj00000xxk1y', name: 'Schaeffler', hadOpportunity: false },
        { id: '001Wj00000syeJe', name: 'Schott Pharma', hadOpportunity: false },
        { id: '001Wj00000mCFrX', name: 'South East Financial Services Cluster', hadOpportunity: false },
        { id: '001Wj00000mCFry', name: 'Spectrum Wellness Holdings Limited', hadOpportunity: true },
        { id: '001Wj00000mCFsq', name: 'Speed Fibre Group(enet)', hadOpportunity: true },
        { id: '001Wj00000mCFtH', name: 'StepStone Group', hadOpportunity: true },
        { id: '001Hp00003kIrMp', name: 'Stryker', hadOpportunity: false },
        { id: '001Wj00000pzTPa', name: 'SuperNode Ltd', hadOpportunity: false },
        { id: '001Wj00000mCFtI', name: 'Swish Fibre', hadOpportunity: false },
        { id: '001Wj00000SFiOv', name: 'TikTok', hadOpportunity: true },
        { id: '001Wj00000ZDXTR', name: 'Tinder LLC', hadOpportunity: true },
        { id: '001Wj00000mCFrC', name: 'Tines Security Services Limited', hadOpportunity: true },
        { id: '001Wj00000xxQsc', name: 'UDG Healthcare', hadOpportunity: false },
        { id: '001Wj00000pzTPe', name: 'Udaras na Gaeltachta', hadOpportunity: false },
        { id: '001Wj00000bWBlE', name: 'Udemy', hadOpportunity: true },
        { id: '001Wj00000Y6VMX', name: 'Unilever', hadOpportunity: false },
        { id: '001Wj00000pzTPc', name: 'Urban Volt', hadOpportunity: false },
        { id: '001Wj00000xwB2o', name: 'Vitesco Technologies Group', hadOpportunity: false },
        { id: '001Hp00003liCZY', name: 'Workday', hadOpportunity: false },
        { id: '001Wj00000xyOlT', name: 'X5 Retail Group', hadOpportunity: false },
        { id: '001Wj00000xyXQZ', name: 'Zalando', hadOpportunity: false },
        { id: '001Wj00000Y6VZ3', name: 'Ziff Davis', hadOpportunity: false },
        { id: '001Wj00000mCFsZ', name: 'Zurich Irish Life plc', hadOpportunity: true },
      ]
    },

    // NICOLA FRATINI (47 active + 91 prospect = 138 total)
    'nicola.fratini@eudia.com': {
      email: 'nicola.fratini@eudia.com',
      name: 'Nicola Fratini',
      accounts: [
        { id: '001Wj00000mCFqs', name: 'AIB', hadOpportunity: true },
        { id: '001Wj00000tWwXp', name: 'AXIS Capital', hadOpportunity: false },
        { id: '001Wj00000tWwXh', name: 'Actavo Group Ltd', hadOpportunity: false },
        { id: '001Wj00000thuKE', name: 'Aer Lingus', hadOpportunity: true },
        { id: '001Wj00000tWwXi', name: 'Aer Rianta', hadOpportunity: false },
        { id: '001Wj00000mCFrG', name: 'AerCap', hadOpportunity: true },
        { id: '001Wj00000YEMaB', name: 'Aligned Incentives, a Bureau Veritas company', hadOpportunity: false },
        { id: '001Wj00000mCFs7', name: 'Allied Irish Banks plc', hadOpportunity: true },
        { id: '001Wj00000mCFsb', name: 'Amundi Ireland Limited', hadOpportunity: true },
        { id: '001Wj00000uZ7w2', name: 'Anna Charles', hadOpportunity: false },
        { id: '001Wj00000TUdXw', name: 'Anthropic', hadOpportunity: true },
        { id: '001Wj00000mCFrD', name: 'Applegreen', hadOpportunity: false },
        { id: '001Wj00000wvc5a', name: 'AppliedAI', hadOpportunity: true },
        { id: '001Wj00000socke', name: 'Archer The Well Company', hadOpportunity: false },
        { id: '001Wj00000tWwXl', name: 'Ardagh Glass Sales', hadOpportunity: false },
        { id: '001Wj00000sgB1h', name: 'Autorek', hadOpportunity: false },
        { id: '001Wj00000mCFrh', name: 'Avant Money', hadOpportunity: true },
        { id: '001Wj00000tWwXT', name: 'Avantcard', hadOpportunity: false },
        { id: '001Wj00000mI7Na', name: 'Aviva Insurance', hadOpportunity: true },
        { id: '001Wj00000tWwXo', name: 'Avolon', hadOpportunity: false },
        { id: '001Wj00000uNUIB', name: 'Bank of China', hadOpportunity: true },
        { id: '001Hp00003kJ9kN', name: 'Barclays', hadOpportunity: true },
        { id: '001Wj00000ttPZB', name: 'Barings', hadOpportunity: true },
        { id: '001Wj00000tWwXW', name: 'Beauparc Group', hadOpportunity: true },
        { id: '001Wj00000xxRyK', name: 'Bertelsmann', hadOpportunity: false },
        { id: '001Wj00000tWwXX', name: 'Bidx1', hadOpportunity: false },
        { id: '001Wj00000soanc', name: 'Borr Drilling', hadOpportunity: false },
        { id: '001Wj00000tWwXu', name: 'Boylesports', hadOpportunity: false },
        { id: '001Wj00000uYz0o', name: 'Bud Financial', hadOpportunity: false },
        { id: '001Wj00000tWwXv', name: 'Bunzl', hadOpportunity: false },
        { id: '001Wj00000xxtGE', name: 'Burelle', hadOpportunity: false },
        { id: '001Wj00000mCFr0', name: 'CNP Santander Insurance Services Limited', hadOpportunity: true },
        { id: '001Wj00000tWwXw', name: 'Cairn Homes', hadOpportunity: true },
        { id: '001Wj00000uZ2hp', name: 'Centrica', hadOpportunity: false },
        { id: '001Wj00000uYYWv', name: 'Checkout.com', hadOpportunity: false },
        { id: '001Wj00000Y64qg', name: 'Christian Dior Couture', hadOpportunity: false },
        { id: '001Wj00000Y6VLh', name: 'Citi', hadOpportunity: true },
        { id: '001Wj00000mCFrE', name: 'Clanwilliam Group', hadOpportunity: true },
        { id: '001Wj00000tWwYl', name: 'Clevercards', hadOpportunity: false },
        { id: '001Wj00000mCFsm', name: 'Coca-Cola HBC Ireland Limited', hadOpportunity: true },
        { id: '001Wj00000xz30b', name: 'Compagnie de l\'Odet', hadOpportunity: false },
        { id: '001Wj00000xxtOM', name: 'Credit Industriel & Commercial', hadOpportunity: false },
        { id: '001Wj00000uZ7RN', name: 'Cuvva', hadOpportunity: false },
        { id: '001Wj00000tx2MQ', name: 'CyberArk', hadOpportunity: true },
        { id: '001Wj00000tWwY1', name: 'DAA', hadOpportunity: false },
        { id: '001Wj00000xyNnm', name: 'DS Smith', hadOpportunity: false },
        { id: '001Wj00000hkk0s', name: 'DSM', hadOpportunity: false },
        { id: '001Wj00000hfWMt', name: 'Dassault Syst?mes', hadOpportunity: false },
        { id: '001Wj00000mCFsB', name: 'Datalex', hadOpportunity: true },
        { id: '001Wj00000mCFrl', name: 'Davy', hadOpportunity: true },
        { id: '001Wj00000tWwYm', name: 'Deliveroo', hadOpportunity: false },
        { id: '001Wj00000w0uVV', name: 'Doceree', hadOpportunity: true },
        { id: '001Wj00000vbvuX', name: 'Dole plc', hadOpportunity: false },
        { id: '001Wj00000tWwXZ', name: 'EVO Payments', hadOpportunity: false },
        { id: '001Wj00000xxsvH', name: 'EXOR Group', hadOpportunity: false },
        { id: '001Wj00000tWwY4', name: 'Easons', hadOpportunity: false },
        { id: '001Wj00000xz35R', name: 'EasyJet', hadOpportunity: false },
        { id: '001Wj00000xx4SK', name: 'Edeka Zentrale', hadOpportunity: false },
        { id: '001Wj00000uJwxo', name: 'Eir', hadOpportunity: true },
        { id: '001Wj00000tWwY5', name: 'Elavon', hadOpportunity: false },
        { id: '001Wj00000pzTPn', name: 'Euronext Dublin', hadOpportunity: false },
        { id: '001Wj00000sg8Gc', name: 'FARFETCH', hadOpportunity: true },
        { id: '001Wj00000mIEAX', name: 'FNZ Group', hadOpportunity: true },
        { id: '001Wj00000tWwY7', name: 'First Data', hadOpportunity: false },
        { id: '001Wj00000soigL', name: 'Fresenius Kabi', hadOpportunity: false },
        { id: '001Wj00000xyXyQ', name: 'FrieslandCampina', hadOpportunity: false },
        { id: '001Wj00000xyAP9', name: 'GasTerra', hadOpportunity: false },
        { id: '001Wj00000mCFt1', name: 'Goodbody Stockbrokers', hadOpportunity: true },
        { id: '001Wj00000soN5f', name: 'Greencore', hadOpportunity: false },
        { id: '001Wj00000xyyli', name: 'Groupe BPCE', hadOpportunity: false },
        { id: '001Wj00000xz9xF', name: 'Haleon', hadOpportunity: false },
        { id: '001Wj00000xz3S2', name: 'Hapag-Lloyd', hadOpportunity: false },
        { id: '001Wj00000tWwY9', name: 'Henderson Group', hadOpportunity: false },
        { id: '001Wj00000Y6VMb', name: 'Henkel', hadOpportunity: false },
        { id: '001Hp00003liHvf', name: 'Hubspot', hadOpportunity: true },
        { id: '001Wj00000sg9MN', name: 'INNIO Group', hadOpportunity: false },
        { id: '001Wj00000bzz9O', name: 'IPG Mediabrands', hadOpportunity: true },
        { id: '001Wj00000tWwYA', name: 'IPL Plastics', hadOpportunity: false },
        { id: '001Wj00000ZDXrd', name: 'Intercom', hadOpportunity: true },
        { id: '001Wj00000tWwYB', name: 'Ires Reit', hadOpportunity: false },
        { id: '001Wj00000xy2WS', name: 'J. Sainsbury', hadOpportunity: false },
        { id: '001Wj00000xyG3B', name: 'JD Sports Fashion', hadOpportunity: false },
        { id: '001Wj00000ullPp', name: 'Jet2 Plc', hadOpportunity: true },
        { id: '001Wj00000xyIeR', name: 'KION Group', hadOpportunity: false },
        { id: '001Wj00000tWwXb', name: 'Keywords Studios', hadOpportunity: false },
        { id: '001Wj00000xxdOO', name: 'Kingfisher', hadOpportunity: false },
        { id: '001Wj00000xy0o1', name: 'Knorr-Bremse', hadOpportunity: false },
        { id: '001Wj00000xxuVi', name: 'L\'Oreal', hadOpportunity: false },
        { id: '001Wj00000xwh4I', name: 'Landesbank Baden-Wurttemberg', hadOpportunity: false },
        { id: '001Wj00000au3sw', name: 'Lenovo', hadOpportunity: true },
        { id: '001Wj00000sobq8', name: 'MOL Magyarország', hadOpportunity: false },
        { id: '001Wj00000xwrq3', name: 'Michelin', hadOpportunity: false },
        { id: '001Wj00000xz3i9', name: 'Mondi Group', hadOpportunity: false },
        { id: '001Wj00000xxaf3', name: 'NatWest Group', hadOpportunity: false },
        { id: '001Wj00000xzFJV', name: 'Norddeutsche Landesbank', hadOpportunity: false },
        { id: '001Hp00003kIrKm', name: 'Northern Trust Management Services', hadOpportunity: true },
        { id: '001Wj00000bWIxi', name: 'Novo Nordisk', hadOpportunity: false },
        { id: '001Wj00000TV1Wz', name: 'OpenAi', hadOpportunity: true },
        { id: '001Wj00000tWwYh', name: 'Origin Enterprises', hadOpportunity: false },
        { id: '001Wj00000xz3dJ', name: 'Otto', hadOpportunity: false },
        { id: '001Wj00000tWwYs', name: 'Panda Waste', hadOpportunity: false },
        { id: '001Wj00000tWwYJ', name: 'Paysafe', hadOpportunity: false },
        { id: '001Wj00000souuM', name: 'Premier Foods', hadOpportunity: false },
        { id: '001Wj00000xyzrT', name: 'RWE', hadOpportunity: false },
        { id: '001Wj00000u0eJp', name: 'Re-Turn', hadOpportunity: true },
        { id: '001Wj00000xyAdg', name: 'SGAM La Mondiale', hadOpportunity: false },
        { id: '001Wj00000sg2T0', name: 'SHEIN', hadOpportunity: true },
        { id: '001Wj00000hfaEC', name: 'Safran', hadOpportunity: false },
        { id: '001Wj00000sonmQ', name: 'Sandoz', hadOpportunity: false },
        { id: '001Wj00000xz9ik', name: 'Savencia', hadOpportunity: false },
        { id: '001Wj00000xyGKs', name: 'Sodexo', hadOpportunity: false },
        { id: '001Wj00000c9oD6', name: 'Stripe', hadOpportunity: true },
        { id: '001Hp00003kKrS0', name: 'Sword Health', hadOpportunity: true },
        { id: '001Wj00000soZus', name: 'Tate & Lyle', hadOpportunity: false },
        { id: '001Wj00000mEEkG', name: 'Team Car Care dba Jiffy Lube', hadOpportunity: true },
        { id: '001Hp00003kIrN0', name: 'Teleperformance', hadOpportunity: false },
        { id: '001Wj00000vzG8f', name: 'Temu', hadOpportunity: false },
        { id: '001Wj00000xy9fz', name: 'Tennet Holding', hadOpportunity: false },
        { id: '001Wj00000tWwXf', name: 'The Estée Lauder Companies Inc.', hadOpportunity: false },
        { id: '001Wj00000Y6DDc', name: 'The HEINEKEN Company', hadOpportunity: false },
        { id: '001Wj00000tWwYV', name: 'The Irish Stock Exchange', hadOpportunity: false },
        { id: '001Wj00000xxp7o', name: 'Thuga Holding', hadOpportunity: false },
        { id: '001Wj00000xyBgC', name: 'ThyssenKrupp', hadOpportunity: false },
        { id: '001Wj00000tWwYW', name: 'Total Produce plc', hadOpportunity: false },
        { id: '001Wj00000xxxLU', name: 'TotalEnergies', hadOpportunity: false },
        { id: '001Wj00000mIBpN', name: 'Transworld Business Advisors', hadOpportunity: true },
        { id: '001Wj00000mCFs1', name: 'Twitter', hadOpportunity: true },
        { id: '001Wj00000xV8Vg', name: 'UNHCR, the UN Refugee Agency', hadOpportunity: true },
        { id: '001Wj00000xxo5I', name: 'United Internet', hadOpportunity: false },
        { id: '001Wj00000bWIzw', name: 'Veolia | Water Tech', hadOpportunity: false },
        { id: '001Hp00003kIrDA', name: 'Verizon', hadOpportunity: true },
        { id: '001Wj00000tWwXd', name: 'Virgin Media Ireland Limited', hadOpportunity: false },
        { id: '001Wj00000sgaj9', name: 'Volkswagon', hadOpportunity: true },
        { id: '001Wj00000ZDTG9', name: 'Waystone', hadOpportunity: true },
        { id: '001Wj00000pB5DX', name: 'White Swan Data', hadOpportunity: true },
        { id: '001Wj00000xwL2A', name: 'Wm. Morrison Supermarkets', hadOpportunity: false },
        { id: '001Wj00000mIB6E', name: 'Zendesk', hadOpportunity: true },
        { id: '001Wj00000S4r49', name: 'Zoom', hadOpportunity: true },
      ]
    },

    // OLIVIA JUNG (47 active + 44 prospect = 91 total)
    'olivia.jung@eudia.com': {
      email: 'olivia.jung@eudia.com',
      name: 'Olivia Jung',
      accounts: [
        { id: '001Hp00003kIrED', name: '3M', hadOpportunity: false },
        { id: '001Hp00003kIrEK', name: 'ADP', hadOpportunity: false },
        { id: '001Hp00003kIrEO', name: 'AES', hadOpportunity: true },
        { id: '001Hp00003kIrEG', name: 'AbbVie', hadOpportunity: false },
        { id: '001Wj00000mCFrd', name: 'Airship Group Inc', hadOpportunity: true },
        { id: '001Hp00003kIrET', name: 'Albemarle', hadOpportunity: false },
        { id: '001Hp00003kIrEZ', name: 'Ally Financial', hadOpportunity: false },
        { id: '001Hp00003kIrEc', name: 'Altria Group', hadOpportunity: false },
        { id: '001Hp00003kIrEf', name: 'Ameren', hadOpportunity: false },
        { id: '001Hp00003kIrEi', name: 'American Family Insurance Group', hadOpportunity: false },
        { id: '001Wj00000YIOI1', name: 'Aptiv', hadOpportunity: true },
        { id: '001Hp00003kIrFA', name: 'Astellas', hadOpportunity: true },
        { id: '001Hp00003kIrFD', name: 'Autoliv', hadOpportunity: false },
        { id: '001Hp00003kIrDJ', name: 'Avery Dennison', hadOpportunity: false },
        { id: '001Hp00003kIrDG', name: 'Bain', hadOpportunity: true },
        { id: '001Hp00003kIrFL', name: 'Bank of America', hadOpportunity: true },
        { id: '001Hp00003kIrFN', name: 'Bath & Body Works', hadOpportunity: false },
        { id: '001Hp00003kIrFQ', name: 'Becton Dickinson', hadOpportunity: false },
        { id: '001Hp00003kIrFV', name: 'Best Buy', hadOpportunity: true },
        { id: '001Hp00003kIrDY', name: 'Blackstone', hadOpportunity: true },
        { id: '001Hp00003kIrFb', name: 'Boeing', hadOpportunity: true },
        { id: '001Hp00003kIrFf', name: 'BorgWarner', hadOpportunity: false },
        { id: '001Hp00003kIrFk', name: 'Bristol-Myers Squibb', hadOpportunity: true },
        { id: '001Hp00003kIrFo', name: 'Burlington Stores', hadOpportunity: false },
        { id: '001Wj00000Y6VLn', name: 'CHANEL', hadOpportunity: false },
        { id: '001Hp00003kIrGK', name: 'CHS', hadOpportunity: true },
        { id: '001Hp00003kJ9kw', name: 'CSL', hadOpportunity: true },
        { id: '001Hp00003kIrGq', name: 'CVS Health', hadOpportunity: false },
        { id: '001Hp00003kIrG7', name: 'Cencora (formerly AmerisourceBergen)', hadOpportunity: false },
        { id: '001Hp00003kIrGE', name: 'Charter Communications', hadOpportunity: true },
        { id: '001Hp00003kIrDZ', name: 'Ciena', hadOpportunity: true },
        { id: '001Hp00003kIrGL', name: 'Cintas', hadOpportunity: false },
        { id: '001Wj00000c6df9', name: 'Clear', hadOpportunity: true },
        { id: '001Wj00000eLOI4', name: 'Cleveland Clinic', hadOpportunity: false },
        { id: '001Hp00003kIrGO', name: 'Cleveland-Cliffs', hadOpportunity: false },
        { id: '001Hp00003kIrGQ', name: 'Coca-Cola', hadOpportunity: false },
        { id: '001Hp00003kIrGX', name: 'Conagra Brands', hadOpportunity: false },
        { id: '001Hp00003kIrGZ', name: 'Consolidated Edison', hadOpportunity: true },
        { id: '001Wj00000jK5Hl', name: 'Crate & Barrel', hadOpportunity: true },
        { id: '001Hp00003kIrGo', name: 'Cummins', hadOpportunity: true },
        { id: '001Hp00003kIrGu', name: 'Danaher', hadOpportunity: false },
        { id: '001Wj00000bzz9R', name: 'Datadog', hadOpportunity: true },
        { id: '001Wj00000aZvt9', name: 'Dolby', hadOpportunity: true },
        { id: '001Hp00003kIrHB', name: 'Dominion Energy', hadOpportunity: false },
        { id: '001Hp00003kIrHE', name: 'Dow', hadOpportunity: false },
        { id: '001Hp00003kIrHH', name: 'Duke Energy', hadOpportunity: false },
        { id: '001Wj00000hkk0j', name: 'Etsy', hadOpportunity: true },
        { id: '001Hp00003kIrI7', name: 'Ford', hadOpportunity: false },
        { id: '001Hp00003kIrIL', name: 'General Dynamics', hadOpportunity: false },
        { id: '001Wj00000ScUQ3', name: 'General Electric', hadOpportunity: false },
        { id: '001Hp00003kIrIN', name: 'General Motors', hadOpportunity: false },
        { id: '001Hp00003kIrIS', name: 'Gilead Sciences', hadOpportunity: true },
        { id: '001Hp00003kIrE8', name: 'Graybar Electric', hadOpportunity: true },
        { id: '001Hp00003kIrDO', name: 'Guardian Life Ins', hadOpportunity: true },
        { id: '001Wj00000dvgdb', name: 'HealthEquity', hadOpportunity: true },
        { id: '001Hp00003kIrJ9', name: 'Intuit', hadOpportunity: true },
        { id: '001Wj00000aLlyV', name: 'J.Crew', hadOpportunity: true },
        { id: '001Hp00003kKKMc', name: 'JPmorganchase', hadOpportunity: true },
        { id: '001Hp00003kIrJI', name: 'John Deere', hadOpportunity: false },
        { id: '001Hp00003kIrDQ', name: 'Jones Lang LaSalle', hadOpportunity: true },
        { id: '001Wj00000hfaE1', name: 'Lowe', hadOpportunity: false },
        { id: '001Hp00003kIrDj', name: 'Marsh McLennan', hadOpportunity: true },
        { id: '001Hp00003kIrEA', name: 'Mastercard', hadOpportunity: true },
        { id: '001Wj00000QBapC', name: 'Mayo Clinic', hadOpportunity: false },
        { id: '001Hp00003kIrD7', name: 'McDonald\'s', hadOpportunity: false },
        { id: '001Hp00003kIrD8', name: 'Medtronic', hadOpportunity: true },
        { id: '001Hp00003kIrKK', name: 'Merck', hadOpportunity: true },
        { id: '001Hp00003kJ9lG', name: 'Meta', hadOpportunity: true },
        { id: '001Hp00003kIrKS', name: 'Mondelez International', hadOpportunity: true },
        { id: '001Hp00003kIrKU', name: 'Motorola Solutions', hadOpportunity: true },
        { id: '001Wj00000Y6VYj', name: 'NBCUniversal', hadOpportunity: false },
        { id: '001Wj00000j3QN2', name: 'Nasdaq Private Market', hadOpportunity: false },
        { id: '001Hp00003kIrCq', name: 'Nationwide Insurance', hadOpportunity: false },
        { id: '001Wj00000Y6VML', name: 'Nestle', hadOpportunity: false },
        { id: '001Hp00003kIrLF', name: 'Paramount', hadOpportunity: false },
        { id: '001Hp00003kIrLO', name: 'Pfizer', hadOpportunity: true },
        { id: '001Wj00000wzgaP', name: 'Philip Morris International', hadOpportunity: false },
        { id: '001Hp00003kIrLa', name: 'Prudential', hadOpportunity: false },
        { id: '001Hp00003kIrLp', name: 'Raytheon Technologies', hadOpportunity: false },
        { id: '001Hp00003kIrDz', name: 'Shopify', hadOpportunity: true },
        { id: '001Wj00000eLWPF', name: 'Stellantis', hadOpportunity: false },
        { id: '001Wj00000iS9AJ', name: 'TE Connectivity', hadOpportunity: true },
        { id: '001Hp00003kIrMx', name: 'Target', hadOpportunity: false },
        { id: '001Wj00000PjGDa', name: 'The Weir Group PLC', hadOpportunity: true },
        { id: '001Hp00003kIrDF', name: 'Thermo Fisher Scientific', hadOpportunity: true },
        { id: '001Hp00003kIrCw', name: 'Toshiba US', hadOpportunity: true },
        { id: '001Hp00003kIrNb', name: 'Unisys', hadOpportunity: true },
        { id: '001Hp00003kIrO7', name: 'Wells Fargo', hadOpportunity: true },
        { id: '001Wj00000kD7MA', name: 'Wellspan Health', hadOpportunity: true },
        { id: '001Hp00003kIrOA', name: 'Western Digital', hadOpportunity: true },
        { id: '001Wj00000kD3s1', name: 'White Cap', hadOpportunity: true },
      ]
    },

    // RAJEEV PATEL (1 active + 6 prospect = 7 total)
    'rajeev.patel@eudia.com': {
      email: 'rajeev.patel@eudia.com',
      name: 'Rajeev Patel',
      accounts: [
        { id: '001Wj00000fFW35', name: 'Alnylam Pharmaceuticals', hadOpportunity: true },
        { id: '001Wj00000woNmQ', name: 'Beiersdorf', hadOpportunity: false },
        { id: '001Wj00000vCOx2', name: 'Cambridge Associates', hadOpportunity: false },
        { id: '001Wj00000wE56T', name: 'Care Vet Health', hadOpportunity: false },
        { id: '001Wj00000dIjyB', name: 'CareVet, LLC', hadOpportunity: false },
        { id: '001Wj00000xZEkY', name: 'Modern Treasury', hadOpportunity: false },
        { id: '001Wj00000vv2vX', name: 'Nextdoor', hadOpportunity: false },
      ]
    },

    // RILEY STACK (2 active + 0 prospect = 2 total)
    'riley.stack@eudia.com': {
      email: 'riley.stack@eudia.com',
      name: 'Riley Stack',
      accounts: [
        { id: '001Wj00000XiEDy', name: 'Coinbase', hadOpportunity: true },
        { id: '001Wj00000YEMa8', name: 'Turing', hadOpportunity: true },
      ]
    },

    // SEAN BOYD (1 active + 0 prospect = 1 total)
    'sean.boyd@eudia.com': {
      email: 'sean.boyd@eudia.com',
      name: 'Sean Boyd',
      accounts: [
        { id: '001Hp00003kIrE9', name: 'IQVIA', hadOpportunity: true },
      ]
    },

    // TOM CLANCY (13 active + 69 prospect = 82 total)
    'tom.clancy@eudia.com': {
      email: 'tom.clancy@eudia.com',
      name: 'Tom Clancy',
      accounts: [
        { id: '001Wj00000pB30V', name: 'AIR (Advanced Inhalation Rituals)', hadOpportunity: true },
        { id: '001Wj00000qLRqW', name: 'ASML', hadOpportunity: true },
        { id: '001Wj00000xyA0y', name: 'Aegon', hadOpportunity: false },
        { id: '001Wj00000xxpcR', name: 'Air France-KLM Group', hadOpportunity: false },
        { id: '001Wj00000xyIg2', name: 'Akzo Nobel', hadOpportunity: false },
        { id: '001Wj00000qFynV', name: 'Alexion Pharmaceuticals', hadOpportunity: false },
        { id: '001Wj00000xwuUW', name: 'Alstom', hadOpportunity: false },
        { id: '001Wj00000xxtL6', name: 'Anglo American', hadOpportunity: false },
        { id: '001Wj00000syHJt', name: 'Aryzta', hadOpportunity: false },
        { id: '001Wj00000tWwXq', name: 'BAM Ireland', hadOpportunity: false },
        { id: '001Wj00000c9oCe', name: 'BLDG Management Co., Inc.', hadOpportunity: true },
        { id: '001Wj00000hfWN1', name: 'Balfour Beatty US', hadOpportunity: false },
        { id: '001Wj00000fFuFM', name: 'Bank of Ireland', hadOpportunity: true },
        { id: '001Wj00000xy23Q', name: 'Bayerische Landesbank', hadOpportunity: false },
        { id: '001Wj00000tWwXt', name: 'Boots', hadOpportunity: false },
        { id: '001Wj00000xyIOL', name: 'Ceconomy', hadOpportunity: false },
        { id: '001Wj00000tWwXx', name: 'Chanelle Pharma', hadOpportunity: false },
        { id: '001Hp00003kIrD3', name: 'Cisco Systems', hadOpportunity: true },
        { id: '001Wj00000xyqxq', name: 'Computacenter', hadOpportunity: false },
        { id: '001Wj00000xy0ss', name: 'Constellium', hadOpportunity: false },
        { id: '001Wj00000Y6Vk0', name: 'Credit Agricole CIB', hadOpportunity: false },
        { id: '001Wj00000xwf7G', name: 'Daimler Truck Holding', hadOpportunity: false },
        { id: '001Wj00000xyaWU', name: 'Delivery Hero', hadOpportunity: false },
        { id: '001Wj00000mCFsz', name: 'Electricity Supply Board', hadOpportunity: true },
        { id: '001Wj00000sp0Bl', name: 'Ensco PLC', hadOpportunity: false },
        { id: '001Wj00000xz374', name: 'EssilorLuxottica', hadOpportunity: false },
        { id: '001Wj00000hfaDT', name: 'Experian', hadOpportunity: false },
        { id: '001Wj00000tWwY6', name: 'Fineos', hadOpportunity: false },
        { id: '001Wj00000mCFsd', name: 'Fujitsu', hadOpportunity: false },
        { id: '001Wj00000mCFrc', name: 'Glanbia', hadOpportunity: true },
        { id: '001Wj00000mHuzr', name: 'IHRB', hadOpportunity: false },
        { id: '001Wj00000xy9Ho', name: 'Imperial Brands', hadOpportunity: false },
        { id: '001Wj00000sp1nl', name: 'Ina Groupa', hadOpportunity: false },
        { id: '001Wj00000xz3ev', name: 'Infineon', hadOpportunity: false },
        { id: '001Wj00000xyMzn', name: 'JDE Peet\'s', hadOpportunity: false },
        { id: '001Wj00000hfWN2', name: 'Jazz Pharmaceuticals', hadOpportunity: false },
        { id: '001Wj00000soxsD', name: 'Jazz Pharmaceuticals', hadOpportunity: false },
        { id: '001Wj00000xxtcq', name: 'John Lewis Partnership', hadOpportunity: false },
        { id: '001Wj00000tWwYo', name: 'Just Eat', hadOpportunity: false },
        { id: '001Wj00000xz3jl', name: 'KfW Group', hadOpportunity: false },
        { id: '001Wj00000tWwYD', name: 'Ladbrokes', hadOpportunity: false },
        { id: '001Wj00000xystC', name: 'Lanxess Group', hadOpportunity: false },
        { id: '001Wj00000vRNFu', name: 'Legal & General', hadOpportunity: false },
        { id: '001Wj00000xxgZC', name: 'Legrand', hadOpportunity: false },
        { id: '001Wj00000Y64qm', name: 'Louis Dreyfus Company', hadOpportunity: false },
        { id: '001Wj00000xyGRQ', name: 'Lufthansa Group', hadOpportunity: false },
        { id: '001Wj00000pA6d7', name: 'Masdar Future Energy Company', hadOpportunity: true },
        { id: '001Wj00000xz0xC', name: 'Metro', hadOpportunity: false },
        { id: '001Wj00000xzAen', name: 'Motability Operations Group', hadOpportunity: false },
        { id: '001Wj00000mCFrv', name: 'Ornua', hadOpportunity: false },
        { id: '001Hp00003kIrLK', name: 'Pepsi', hadOpportunity: false },
        { id: '001Wj00000qFudS', name: 'Pluralsight', hadOpportunity: false },
        { id: '001Wj00000xyODc', name: 'Puma', hadOpportunity: false },
        { id: '001Wj00000iC14Z', name: 'RELX', hadOpportunity: false },
        { id: '001Wj00000tWwYj', name: 'Rabobank', hadOpportunity: false },
        { id: '001Wj00000xyU9M', name: 'Reckitt Benckiser', hadOpportunity: false },
        { id: '001Wj00000xz3bh', name: 'Rentokil Initial', hadOpportunity: false },
        { id: '001Wj00000sp1hL', name: 'SBM Offshore', hadOpportunity: false },
        { id: '001Wj00000xybkK', name: 'SHV Holdings', hadOpportunity: false },
        { id: '001Wj00000xz3gX', name: 'SNCF Group', hadOpportunity: false },
        { id: '001Wj00000tWwYt', name: 'Sage', hadOpportunity: false },
        { id: '001Wj00000sGEuO', name: 'Sanofi', hadOpportunity: false },
        { id: '001Wj00000qL7AG', name: 'Seismic', hadOpportunity: true },
        { id: '001Wj00000soyhp', name: 'Stada Group', hadOpportunity: false },
        { id: '001Wj00000xytSg', name: 'Standard Chartered', hadOpportunity: false },
        { id: '001Wj00000tWwYq', name: 'Symantec', hadOpportunity: false },
        { id: '001Wj00000pAPW2', name: 'Tarmac', hadOpportunity: true },
        { id: '001Wj00000xxvA1', name: 'Technip Energies', hadOpportunity: false },
        { id: '001Wj00000tWwYU', name: 'Tegral Building Products', hadOpportunity: false },
        { id: '001Wj00000fFuFq', name: 'The Boots Group', hadOpportunity: false },
        { id: '001Wj00000tWwYk', name: 'Three', hadOpportunity: false },
        { id: '001Wj00000xy5HP', name: 'Trane Technologies', hadOpportunity: false },
        { id: '001Wj00000sohCP', name: 'Trans Ocean', hadOpportunity: false },
        { id: '001Wj00000mCFtO', name: 'Uisce Eireann (Irish Water)', hadOpportunity: true },
        { id: '001Wj00000xyQ5k', name: 'Uniper', hadOpportunity: false },
        { id: '001Wj00000xz1GY', name: 'Valeo', hadOpportunity: false },
        { id: '001Wj00000pBibT', name: 'Version1', hadOpportunity: true },
        { id: '001Wj00000xy2BT', name: 'Vivendi', hadOpportunity: false },
        { id: '001Wj00000xyulK', name: 'Wacker Chemie', hadOpportunity: false },
        { id: '001Wj00000tWwYZ', name: 'Wyeth Nutritionals Ireland', hadOpportunity: false },
        { id: '001Wj00000mI9qo', name: 'XACT Data Discovery', hadOpportunity: true },
        { id: '001Wj00000xyq3P', name: 'ZF Friedrichshafen', hadOpportunity: false },
      ]
    },

  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class AccountOwnershipService {
  private serverUrl: string;
  private cachedData: AccountOwnershipData | null = null;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * Get accounts owned by a specific user (active accounts only for backward compat)
   * Tries server first (live Salesforce data), falls back to static data
   */
  async getAccountsForUser(email: string): Promise<OwnedAccount[]> {
    const result = await this.getAccountsWithProspects(email);
    return result.accounts;
  }

  /**
   * Get both active AND prospect accounts for a user.
   * Returns { accounts: active[], prospects: prospect[] }
   */
  async getAccountsWithProspects(email: string): Promise<{ accounts: OwnedAccount[]; prospects: OwnedAccount[] }> {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Try server endpoint first (live Salesforce data)
    const serverResult = await this.fetchFromServerWithProspects(normalizedEmail);
    if (serverResult && (serverResult.accounts.length > 0 || serverResult.prospects.length > 0)) {
      console.log(`[AccountOwnership] Got ${serverResult.accounts.length} active + ${serverResult.prospects.length} prospects from server for ${normalizedEmail}`);
      return serverResult;
    }
    
    // Fall back to static data (offline support / backup)
    console.log(`[AccountOwnership] Using static data fallback for ${normalizedEmail}`);
    const staticAccounts = this.getAccountsFromStatic(normalizedEmail);
    // Static data has hadOpp flag -- split into active and prospect
    const accounts = staticAccounts.filter(a => a.hadOpportunity !== false);
    const prospects = staticAccounts.filter(a => a.hadOpportunity === false);
    return { accounts, prospects };
  }

  /**
   * Get accounts from static mapping (offline fallback)
   * For sales leaders, aggregates accounts from all direct reports
   */
  private getAccountsFromStatic(email: string): OwnedAccount[] {
    const userGroup = getUserGroup(email);
    
    // For sales leaders, aggregate accounts from their direct reports
    if (userGroup === 'sales_leader') {
      const directReports = getSalesLeaderDirectReports(email);
      
      if (directReports.length === 0) {
        console.log(`[AccountOwnership] No direct reports found for sales leader: ${email}`);
        return [];
      }
      
      // Collect all accounts from direct reports (deduplicated by ID)
      const allAccounts: Map<string, OwnedAccount> = new Map();
      
      for (const reportEmail of directReports) {
        const reportLead = OWNERSHIP_DATA.businessLeads[reportEmail];
        if (reportLead) {
          for (const acc of reportLead.accounts) {
            if (!allAccounts.has(acc.id)) {
              // Mark as view-only for sales leaders (they don't own these accounts)
              allAccounts.set(acc.id, { ...acc, isOwned: false });
            }
          }
        }
      }
      
      const accounts = Array.from(allAccounts.values()).sort((a, b) => 
        a.name.localeCompare(b.name)
      );
      
      console.log(`[AccountOwnership] Found ${accounts.length} static accounts for sales leader ${email} (from ${directReports.length} direct reports)`);
      return accounts;
    }
    
    // For regular BLs, look up ONLY their owned accounts
    const lead = OWNERSHIP_DATA.businessLeads[email];
    const ownedAccounts: OwnedAccount[] = lead ? lead.accounts.map(a => ({ ...a, isOwned: true })) : [];
    
    // Check if this BL is a designated pod-view user (e.g. Riley, Sean)
    // Only these specific users get the full region view — regular BLs see only their own accounts
    const podRegion = POD_VIEW_USERS[email];
    if (podRegion) {
      const regionBLs = getRegionBLEmails(podRegion);
      const ownedIds = new Set(ownedAccounts.map(a => a.id));
      
      for (const blEmail of regionBLs) {
        const blLead = OWNERSHIP_DATA.businessLeads[blEmail];
        if (blLead) {
          for (const acc of blLead.accounts) {
            if (!ownedIds.has(acc.id)) {
              ownedAccounts.push({ ...acc, isOwned: false });
              ownedIds.add(acc.id);
            }
          }
        }
      }
      
      const sorted = ownedAccounts.sort((a, b) => a.name.localeCompare(b.name));
      console.log(`[AccountOwnership] Pod-view user ${email} (${podRegion}): ${sorted.length} static accounts (${lead?.accounts.length || 0} owned + region)`);
      return sorted;
    }
    
    if (!lead) {
      console.log(`[AccountOwnership] No static mapping found for: ${email}`);
      return [];
    }
    console.log(`[AccountOwnership] Found ${lead.accounts.length} static accounts for ${email} (own accounts only)`);
    return lead.accounts;
  }

  /**
   * Fetch account ownership from server (live Salesforce data) -- active accounts only
   * This is now the PRIMARY source - static data is fallback
   */
  private async fetchFromServer(email: string): Promise<OwnedAccount[] | null> {
    const result = await this.fetchFromServerWithProspects(email);
    return result ? result.accounts : null;
  }

  /**
   * Fetch both active and prospect accounts from server
   */
  private async fetchFromServerWithProspects(email: string): Promise<{ accounts: OwnedAccount[]; prospects: OwnedAccount[] } | null> {
    try {
      const { requestUrl } = await import('obsidian');
      
      const response = await requestUrl({
        url: `${this.serverUrl}/api/accounts/ownership/${encodeURIComponent(email)}`,
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.json?.success) {
        const mapAccount = (acc: any): OwnedAccount => ({
          id: acc.id,
          name: acc.name,
          type: acc.type || 'Prospect',
          hadOpportunity: acc.hadOpportunity ?? true,
          website: acc.website || undefined,
          industry: acc.industry || undefined
        });
        
        const accounts = (response.json.accounts || []).map(mapAccount);
        const prospects = (response.json.prospectAccounts || []).map(mapAccount);
        
        return { accounts, prospects };
      }
      return null;
    } catch (error) {
      console.log('[AccountOwnership] Server fetch failed, will use static data:', error);
      return null;
    }
  }

  /**
   * Check for new accounts that don't have folders yet
   * Returns accounts that exist in ownership but not in the provided folder list
   */
  async getNewAccounts(email: string, existingFolderNames: string[]): Promise<OwnedAccount[]> {
    const allAccounts = await this.getAccountsForUser(email);
    const normalizedFolders = existingFolderNames.map(f => f.toLowerCase().trim());
    
    return allAccounts.filter(account => {
      const normalizedAccountName = account.name.toLowerCase().trim();
      // Check if any existing folder matches this account (fuzzy match)
      return !normalizedFolders.some(folder => 
        folder === normalizedAccountName ||
        folder.startsWith(normalizedAccountName) ||
        normalizedAccountName.startsWith(folder)
      );
    });
  }

  /**
   * Find the sales leader a BL reports to (reverse-lookup of direct reports)
   */
  private findTeamLeader(email: string): string | null {
    const normalized = email.toLowerCase().trim();
    for (const [leaderEmail, reports] of Object.entries(SALES_LEADER_DIRECT_REPORTS)) {
      if (reports.includes(normalized)) {
        return leaderEmail;
      }
    }
    return null;
  }

  /**
   * Check if a user exists in the ownership mapping
   */
  hasUser(email: string): boolean {
    const normalizedEmail = email.toLowerCase().trim();
    return normalizedEmail in OWNERSHIP_DATA.businessLeads;
  }

  /**
   * Get all registered business leads
   */
  getAllBusinessLeads(): string[] {
    return Object.keys(OWNERSHIP_DATA.businessLeads);
  }

  /**
   * Get business lead info by email
   */
  getBusinessLead(email: string): BusinessLead | null {
    const normalizedEmail = email.toLowerCase().trim();
    return OWNERSHIP_DATA.businessLeads[normalizedEmail] || null;
  }

  /**
   * Get the version of the ownership data
   */
  getDataVersion(): string {
    return OWNERSHIP_DATA.version;
  }

  /**
   * Get ALL accounts for admin users
   * Returns all accounts with isOwned flag to distinguish owned vs view-only
   */
  async getAllAccountsForAdmin(adminEmail: string): Promise<OwnedAccount[]> {
    const normalizedEmail = adminEmail.toLowerCase().trim();
    
    if (!isAdminUser(normalizedEmail)) {
      console.log(`[AccountOwnership] ${normalizedEmail} is not an admin, returning owned accounts only`);
      return this.getAccountsForUser(normalizedEmail);
    }

    // Try server endpoint first (live Salesforce data for all accounts)
    const serverAccounts = await this.fetchAllAccountsFromServer();
    if (serverAccounts && serverAccounts.length > 0) {
      // Get admin's owned accounts to mark ownership
      const ownedAccounts = await this.getAccountsForUser(normalizedEmail);
      const ownedIds = new Set(ownedAccounts.map(a => a.id));
      
      // Mark each account with ownership status
      return serverAccounts.map(acc => ({
        ...acc,
        isOwned: ownedIds.has(acc.id)
      }));
    }

    // Fall back to static data (combine all accounts from all BLs)
    console.log(`[AccountOwnership] Using static data fallback for admin all-accounts`);
    return this.getAllAccountsFromStatic(normalizedEmail);
  }

  /**
   * Get all accounts from static mapping for admins
   */
  private getAllAccountsFromStatic(adminEmail: string): OwnedAccount[] {
    const allAccounts: Map<string, OwnedAccount> = new Map();
    const ownedIds = new Set<string>();
    
    // Get admin's owned accounts first
    const adminLead = OWNERSHIP_DATA.businessLeads[adminEmail];
    if (adminLead) {
      for (const acc of adminLead.accounts) {
        ownedIds.add(acc.id);
        allAccounts.set(acc.id, { ...acc, isOwned: true });
      }
    }
    
    // Collect all accounts from all BLs
    for (const lead of Object.values(OWNERSHIP_DATA.businessLeads)) {
      for (const acc of lead.accounts) {
        if (!allAccounts.has(acc.id)) {
          allAccounts.set(acc.id, { ...acc, isOwned: false });
        }
      }
    }
    
    // Sort by name
    return Array.from(allAccounts.values()).sort((a, b) => 
      a.name.localeCompare(b.name)
    );
  }

  /**
   * Get CS-relevant accounts for Customer Success users.
   * Uses /api/bl-accounts/:email which has CS-specific query logic:
   *   - Accounts where Customer_Type__c = 'Existing'
   *   - Accounts attached to opportunities where CS_Staffing_Flag__c = true
   * 
   * Includes retry logic for Render cold-start resilience.
   */
  async getCSAccounts(email: string): Promise<{ accounts: OwnedAccount[]; prospects: OwnedAccount[] }> {
    const normalizedEmail = email.toLowerCase().trim();
    console.log(`[AccountOwnership] Fetching CS accounts for: ${normalizedEmail}`);
    
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 3000; // 3 seconds between retries (Render cold start)
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { requestUrl, Notice } = await import('obsidian');
        
        console.log(`[AccountOwnership] CS fetch attempt ${attempt}/${MAX_RETRIES} for ${normalizedEmail}`);
        
        const response = await requestUrl({
          url: `${this.serverUrl}/api/bl-accounts/${encodeURIComponent(normalizedEmail)}`,
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          throw: false
        });
        
        console.log(`[AccountOwnership] CS fetch response status: ${response.status}`);
        
        if (response.status === 200 && response.json?.success) {
          const activeAccounts: OwnedAccount[] = (response.json.accounts || []).map((acc: any) => ({
            id: acc.id,
            name: acc.name,
            type: acc.customerType || acc.type || 'Customer',
            isOwned: false,
            hadOpportunity: true,
            website: acc.website || null,
            industry: acc.industry || null,
            ownerName: acc.ownerName || null,
            csmName: acc.csmName || null
          }));
          
          const prospectAccounts: OwnedAccount[] = (response.json.prospectAccounts || []).map((acc: any) => ({
            id: acc.id,
            name: acc.name,
            type: acc.customerType || acc.type || 'Prospect',
            isOwned: false,
            hadOpportunity: false,
            website: acc.website || null,
            industry: acc.industry || null,
            ownerName: acc.ownerName || null,
            csmName: acc.csmName || null
          }));
          
          // KEY FIX: Server may return success:true but 0 accounts when Salesforce
          // connection is still initializing after Render cold start. In that case,
          // fall through to static fallback instead of returning empty.
          if (activeAccounts.length > 0) {
            console.log(`[AccountOwnership] CS accounts for ${normalizedEmail}: ${activeAccounts.length} active + ${prospectAccounts.length} prospects`);
            new Notice(`Found ${activeAccounts.length} CS accounts`);
            return { accounts: activeAccounts, prospects: prospectAccounts };
          }
          
          // Server returned success but 0 accounts — Salesforce likely not ready
          console.warn(`[AccountOwnership] CS fetch attempt ${attempt}: server returned success but 0 accounts (Salesforce not ready)`);
          if (attempt < MAX_RETRIES) {
            console.log(`[AccountOwnership] Retrying in ${RETRY_DELAY}ms...`);
            await new Promise(r => setTimeout(r, RETRY_DELAY));
            continue;
          }
          // Last attempt still 0 — fall through to static fallback below
        } else {
          // Non-200 or no success flag — retry
          console.warn(`[AccountOwnership] CS fetch attempt ${attempt} returned status ${response.status} for ${normalizedEmail}`);
          if (attempt < MAX_RETRIES) {
            console.log(`[AccountOwnership] Retrying in ${RETRY_DELAY}ms...`);
            await new Promise(r => setTimeout(r, RETRY_DELAY));
          }
        }
      } catch (error) {
        console.error(`[AccountOwnership] CS account fetch attempt ${attempt} failed for ${normalizedEmail}:`, error);
        if (attempt < MAX_RETRIES) {
          console.log(`[AccountOwnership] Retrying in ${RETRY_DELAY}ms after error...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
      }
    }
    
    // All server attempts failed or returned 0 accounts — use static fallback
    console.warn(`[AccountOwnership] Server returned no CS accounts after ${MAX_RETRIES} attempts. Using static fallback (${CS_STATIC_ACCOUNTS.length} accounts).`);
    const { Notice } = await import('obsidian');
    new Notice(`Loading ${CS_STATIC_ACCOUNTS.length} CS accounts (server warming up)`);
    return { accounts: [...CS_STATIC_ACCOUNTS], prospects: [] };
  }

  /**
   * Fetch ALL accounts from server (for admin users)
   */
  private async fetchAllAccountsFromServer(): Promise<OwnedAccount[] | null> {
    try {
      const { requestUrl } = await import('obsidian');
      
      const response = await requestUrl({
        url: `${this.serverUrl}/api/accounts/all`,
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.json?.success && response.json?.accounts) {
        return response.json.accounts.map((acc: any) => ({
          id: acc.id,
          name: acc.name,
          type: acc.type || 'Prospect'
        }));
      }
      return null;
    } catch (error) {
      console.log('[AccountOwnership] Server fetch all accounts failed:', error);
      return null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create the folder structure for an account
 */
export function getAccountFolderStructure(accountName: string): string[] {
  const safeName = accountName.replace(/[<>:"/\\|?*]/g, '_').trim();
  return [
    `Accounts/${safeName}`,
    // Note: We don't create subfolders by default to keep it simple
    // Users can create their own structure as needed
  ];
}

/**
 * Generate the initial overview note for an account
 */
export function generateAccountOverviewNote(account: OwnedAccount): string {
  const date = new Date().toISOString().split('T')[0];
  
  return `---
account: "${account.name}"
account_id: "${account.id}"
type: "${account.type || 'Account'}"
created: ${date}
sync_to_salesforce: false
---

# ${account.name}

## Account Overview

*Add account context, key contacts, and strategy notes here.*

## Key Contacts

| Name | Title | Email | Notes |
|------|-------|-------|-------|
|      |       |       |       |

## Recent Activity

*Meeting notes will appear in this folder when you create them.*

---

## Quick Actions

- **New Meeting Note**: Click a calendar meeting or use Cmd/Ctrl+P → "New Meeting Note"
- **Transcribe**: Click the microphone icon during a call
- **Sync to Salesforce**: Set \`sync_to_salesforce: true\` in any note

`;
}
