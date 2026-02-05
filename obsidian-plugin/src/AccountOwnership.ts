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
  'michael.ayers@eudia.com',
  'zach@eudia.com'
];

/**
 * Exec users - treated as admin for account visibility
 */
export const EXEC_EMAILS = [
  'omar@eudia.com',
  'david@eudia.com',
  'ashish@eudia.com'
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
 * Customer Success team - see only Existing customers
 */
export const CS_EMAILS = [
  'nikhita.godiwala@eudia.com',
  'jon.dedych@eudia.com',
  'farah.haddad@eudia.com'
];

/**
 * Business Lead region mapping (for Sales Leader roll-ups)
 */
export const BL_REGIONS: Record<string, string[]> = {
  'US': [
    'asad.hussain@eudia.com',
    'nathan.shine@eudia.com',
    'julie.stefanich@eudia.com',
    'olivia@eudia.com',
    'ananth@eudia.com',
    'ananth.cherukupally@eudia.com',
    'justin.hills@eudia.com',
    'mike.masiello@eudia.com',
    'mike@eudia.com',
    'sean.boyd@eudia.com',
    'riley.stack@eudia.com'
  ],
  'EMEA': [
    'greg.machale@eudia.com',
    'tom.clancy@eudia.com',
    'nicola.fratini@eudia.com',
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
    'justin.hills@eudia.com',
    'olivia@eudia.com',
    'sean.boyd@eudia.com',
    'riley.stack@eudia.com'
  ],
  'stephen.mulholland@eudia.com': [
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
  type?: 'Customer' | 'Prospect' | 'Target';
  isOwned?: boolean;  // For admins: true if they own it, false if view-only
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
 * This data is derived from the "Business Lead 2026 Accounts" spreadsheet.
 * Auto-generated from Excel on 2026-02-03
 * 
 * Total: 14 business leads, 266 accounts
 */
const OWNERSHIP_DATA: AccountOwnershipData = {
  version: '2026-02',
  lastUpdated: '2026-02-03',
  businessLeads: {
    // ALEX FOX (8 accounts)
    'alex.fox@eudia.com': {
      email: 'alex.fox@eudia.com',
      name: 'Alex Fox',
      accounts: [
        { id: '001Wj00000mCFsTIAW', name: 'Arabic Computer Systems' },
        { id: '001Wj00000fFuFMIA0', name: 'Bank of Ireland' },
        { id: '001Wj00000mCFsuIAG', name: 'Corrigan & Corrigan Solicitors LLP' },
        { id: '001Wj00000mCFscIAG', name: 'Department of Children, Disability and Equality' },
        { id: '001Wj00000mCFsNIAW', name: 'Department of Climate, Energy and the Environment' },
        { id: '001Wj00000mCFsUIAW', name: 'ESB NI/Electric Ireland' },
        { id: '001Wj00000TV1WzIAL', name: 'OpenAi' },
        { id: '001Wj00000mCFrMIAW', name: 'Sisk Group' },
      ]
    },

    // ANANTH CHERUKUPALLY (13 accounts)
    'ananth@eudia.com': {
      email: 'ananth@eudia.com',
      name: 'Ananth Cherukupally',
      accounts: [
        { id: '001Wj00000RjuhjIAB', name: 'Citadel' },
        { id: '001Wj00000cejJzIAI', name: 'CVC' },
        { id: '001Wj00000Y64qhIAB', name: 'Emigrant Bank' },
        { id: '001Hp00003kIrIIIA0', name: 'GE Healthcare' },
        { id: '001Hp00003kIrIJIA0', name: 'GE Vernova' },
        { id: '001Wj00000Z6zhPIAR', name: 'Liberty Mutual Insurance' },
        { id: '001Wj00000bWBlQIAW', name: 'Pegasystems' },
        { id: '001Wj00000bzz9MIAQ', name: 'Peregrine Hospitality' },
        { id: '001Hp00003ljCJ8IAM', name: 'Petco' },
        { id: '001Hp00003kKXSIIA4', name: 'Pure Storage' },
        { id: '001Wj00000lxbYRIAY', name: 'Spark Brighter Thinking' },
        { id: '001Wj00000tOAoEIAW', name: 'TA Associates' },
        { id: '001Wj00000bn8VSIAY', name: 'Vista Equity Partners' },
      ]
    },

    // ASAD HUSSAIN (35 accounts)
    'asad.hussain@eudia.com': {
      email: 'asad.hussain@eudia.com',
      name: 'Asad Hussain',
      accounts: [
        { id: '001Hp00003kIrCyIAK', name: 'Airbnb' },
        { id: '001Hp00003kIrEeIAK', name: 'Amazon' },
        { id: '001Hp00003kIrCzIAK', name: 'American Express' },
        { id: '001Wj00000TUdXwIAL', name: 'Anthropic' },
        { id: '001Wj00000Y0g8ZIAR', name: 'Asana' },
        { id: '001Wj00000c0wRAIAY', name: 'Away' },
        { id: '001Wj00000WTMCRIA5', name: 'BNY Mellon' },
        { id: '001Wj00000mosEXIAY', name: 'Carta' },
        { id: '001Wj00000ah6dkIAA', name: 'Charlesbank Capital Partners' },
        { id: '001Hp00003kIrE5IAK', name: 'Coherent' },
        { id: '001Hp00003kIrGzIAK', name: 'Deloitte' },
        { id: '001Hp00003kIrE6IAK', name: 'DHL' },
        { id: '001Wj00000W8ZKlIAN', name: 'Docusign' },
        { id: '001Hp00003kIrHNIA0', name: 'Ecolab' },
        { id: '001Hp00003kIrI3IAK', name: 'Fluor' },
        { id: '001Hp00003kIrIAIA0', name: 'Fox' },
        { id: '001Hp00003kJ9oeIAC', name: 'Fresh Del Monte' },
        { id: '001Hp00003kIrIKIA0', name: 'Geico' },
        { id: '001Wj00000oqVXgIAM', name: 'Goosehead Insurance' },
        { id: '001Wj00000tuXZbIAM', name: 'Gopuff' },
        { id: '001Hp00003kIrItIAK', name: 'HSBC' },
        { id: '001Hp00003kIrIyIAK', name: 'Huntsman' },
        { id: '001Wj00000hdoLxIAI', name: 'Insight Enterprises Inc.' },
        { id: '001Hp00003kIrKCIA0', name: 'Mass Mutual Life Insurance' },
        { id: '001Hp00003kIrKOIA0', name: 'Microsoft' },
        { id: '001Wj00000lyDQkIAM', name: 'MidOcean Partners' },
        { id: '001Hp00003kIrKTIA0', name: 'Morgan Stanley' },
        { id: '001Wj00000kNp2XIAS', name: 'Plusgrade' },
        { id: '001Hp00003kIrMKIA0', name: 'ServiceNow' },
        { id: '001Hp00003kIrECIA0', name: 'Southwest Airlines' },
        { id: '001Wj00000tuRNoIAM', name: 'Virtusa' },
        { id: '001Hp00003kIrNwIAK', name: 'W.W. Grainger' },
        { id: '001Wj00000bzz9NIAQ', name: 'Wealth Partners Capital Group' },
        { id: '001Wj00000tuolfIAA', name: 'Wynn Las Vegas' },
        { id: '001Wj00000uzs1fIAA', name: 'Zero RFI' },
      ]
    },

    // CONOR MOLLOY (15 accounts)
    'conor.molloy@eudia.com': {
      email: 'conor.molloy@eudia.com',
      name: 'Conor Molloy',
      accounts: [
        { id: '001Hp00003kIrQDIA0', name: 'Accenture' },
        { id: '001Wj00000qLixnIAC', name: 'Al Dahra Group Llc' },
        { id: '001Hp00003kIrEyIAK', name: 'Aramark Ireland' },
        { id: '001Wj00000mCFrgIAG', name: 'Aryza' },
        { id: '001Wj00000mCFrkIAG', name: 'Coillte' },
        { id: '001Wj00000mCFsHIAW', name: 'Consensys' },
        { id: '001Wj00000mCFr2IAG', name: 'ICON Clinical Research' },
        { id: '001Wj00000Y64qdIAB', name: 'ION' },
        { id: '001Wj00000mCFtMIAW', name: 'Kellanova' },
        { id: '001Wj00000mCFrIIAW', name: 'Orsted' },
        { id: '001Wj00000mI9NmIAK', name: 'Sequoia Climate Fund' },
        { id: '001Wj00000mCFs0IAG', name: 'Taoglas Limited' },
        { id: '001Wj00000mCFtPIAW', name: 'Teamwork.com' },
        { id: '001Wj00000mIBpNIAW', name: 'Transworld Business Advisors' },
        { id: '001Wj00000ZLVpTIAX', name: 'Wellspring Philanthropic Fund' },
      ]
    },

    // EMER FLYNN (1 accounts)
    'emer.flynn@eudia.com': {
      email: 'emer.flynn@eudia.com',
      name: 'Emer Flynn',
      accounts: [
        { id: '001Wj00000mCFr6IAG', name: 'NTMA' },
      ]
    },

    // GREG MACHALE (26 accounts)
    'greg.machale@eudia.com': {
      email: 'greg.machale@eudia.com',
      name: 'Greg MacHale',
      accounts: [
        { id: '001Hp00003kIrEFIA0', name: 'Abbott Laboratories' },
        { id: '001Wj00000mCFqrIAG', name: 'Biomarin International Limited' },
        { id: '001Wj00000Y6VMdIAN', name: 'BNP Paribas' },
        { id: '001Hp00003kIrFdIAK', name: 'Booking Holdings' },
        { id: '001Wj00000X4OqNIAV', name: 'BT Group' },
        { id: '001Wj00000uZ5J7IAK', name: 'Canada Life' },
        { id: '001Wj00000mCFt9IAG', name: 'Cerberus European Servicing' },
        { id: '001Wj00000Y6VMkIAN', name: 'Computershare' },
        { id: '001Wj00000uP5x8IAC', name: 'Cornmarket Financial Services' },
        { id: '001Wj00000Y6VMMIA3', name: 'Diageo' },
        { id: '001Wj00000prFOXIA2', name: 'Doosan Bobcat' },
        { id: '001Wj00000mCFrmIAG', name: 'eShopWorld' },
        { id: '001Wj00000fFuFYIA0', name: 'Grant Thornton' },
        { id: '001Wj00000uZ4A9IAK', name: 'Great West Lifec co' },
        { id: '001Wj00000uZtcTIAS', name: 'Ineos' },
        { id: '001Wj00000tWwYpIAK', name: 'Mail Metrics' },
        { id: '001Wj00000vwSUXIA2', name: 'Mercor' },
        { id: '001Wj00000mCFtUIAW', name: 'Mercury Engineering' },
        { id: '001Wj00000lPFP3IAO', name: 'Nomura' },
        { id: '001Wj00000mCFr1IAG', name: 'Permanent TSB plc' },
        { id: '001Wj00000Y6QfRIAV', name: 'Pernod Ricard' },
        { id: '001Hp00003kIrLiIAK', name: 'Quest Diagnostics' },
        { id: '001Wj00000mCFsFIAW', name: 'Regeneron' },
        { id: '001Wj00000mCFsRIAW', name: 'Ryanair' },
        { id: '001Hp00003kIrMjIAK', name: 'State Street' },
        { id: '001Wj00000mCFsSIAW', name: 'Uniphar PLC' },
      ]
    },

    // JULIE STEFANICH (31 accounts)
    'julie.stefanich@eudia.com': {
      email: 'julie.stefanich@eudia.com',
      name: 'Julie Stefanich',
      accounts: [
        { id: '001Wj00000asSHBIA2', name: 'Airbus' },
        { id: '001Hp00003kIrElIAK', name: 'Ameriprise Financial' },
        { id: '001Hp00003kIrEvIAK', name: 'Apple' },
        { id: '001Hp00003kJ9pXIAS', name: 'Bayer' },
        { id: '001Hp00003kIrE3IAK', name: 'Cargill' },
        { id: '001Hp00003kIrGDIA0', name: 'Charles Schwab' },
        { id: '001Hp00003kIrE4IAK', name: 'Chevron' },
        { id: '001Hp00003kIrGeIAK', name: 'Corebridge Financial' },
        { id: '001Hp00003kIrE7IAK', name: 'ECMS' },
        { id: '001Wj00000iRzqvIAC', name: 'Florida Crystals Corporation' },
        { id: '001Hp00003kIrIPIA0', name: 'Genworth Financial' },
        { id: '001Hp00003kIrIXIA0', name: 'Goldman Sachs' },
        { id: '001Wj00000rceVpIAI', name: 'Hikma' },
        { id: '001Hp00003kIrJVIA0', name: 'KLA' },
        { id: '001Wj00000aLmheIAC', name: 'Macmillan' },
        { id: '001Wj00000X6G8qIAF', name: 'Mainsail Partners' },
        { id: '001Hp00003kIrKLIA0', name: 'MetLife' },
        { id: '001Hp00003kIrDeIAK', name: 'National Grid' },
        { id: '001Hp00003kIrKjIAK', name: 'Nordstrom' },
        { id: '001Hp00003kIrDvIAK', name: 'Oracle' },
        { id: '001Hp00003kIrLNIA0', name: 'Petsmart' },
        { id: '001Hp00003kIrLZIA0', name: 'Procter & Gamble' },
        { id: '001Hp00003lhsUYIAY', name: 'Rio Tinto Group' },
        { id: '001Wj00000svQI3IAM', name: 'Safelite' },
        { id: '001Wj00000fRtLmIAK', name: 'State Farm' },
        { id: '001Wj00000bzz9TIAQ', name: 'Tailored Brands' },
        { id: '001Hp00003kIrNBIA0', name: 'The Wonderful Company' },
        { id: '001Hp00003kIrCrIAK', name: 'TIAA' },
        { id: '001Hp00003kIrNHIA0', name: 'T-Mobile' },
        { id: '001Hp00003kIrNVIA0', name: 'Uber' },
        { id: '001Hp00003kIrOLIA0', name: 'World Wide Technology' },
      ]
    },

    // JUSTIN HILLS (20 accounts)
    'justin.hills@eudia.com': {
      email: 'justin.hills@eudia.com',
      name: 'Justin Hills',
      accounts: [
        { id: '001Hp00003kIrEOIA0', name: 'AES' },
        { id: '001Wj00000Y6VM4IAN', name: 'Ares Management Corporation' },
        { id: '001Wj00000XiEDyIAN', name: 'Coinbase' },
        { id: '001Hp00003kIrDhIAK', name: 'Comcast' },
        { id: '001Wj00000c9oCvIAI', name: 'Cox Media Group' },
        { id: '001Wj00000Y0jPmIAJ', name: 'Delinea' },
        { id: '001Wj00000iwKGQIA2', name: 'Dominos' },
        { id: '001Hp00003kIrDaIAK', name: 'Duracell' },
        { id: '001Hp00003kIrCnIAK', name: 'Home Depot' },
        { id: '001Hp00003kIrDVIA0', name: 'Intel' },
        { id: '001Hp00003kIrE9IAK', name: 'IQVIA' },
        { id: '001Hp00003kIrJJIA0', name: 'Johnson & Johnson' },
        { id: '001Wj00000gnrugIAA', name: 'Kraken' },
        { id: '001Wj00000op4EWIAY', name: 'McCormick & Co Inc' },
        { id: '001Wj00000ix7c2IAA', name: 'Nouryon' },
        { id: '001Wj00000cpxt0IAA', name: 'Novelis' },
        { id: '001Wj00000WYyKIIA1', name: 'Ramp' },
        { id: '001Wj00000o5G0vIAE', name: 'StockX' },
        { id: '001Wj00000YEMa8IAH', name: 'Turing' },
        { id: '001Wj00000oqRycIAE', name: 'Walgreens Boots Alliance' },
      ]
    },

    // KEIGAN PESENTI (11 accounts)
    'keigan.pesenti@eudia.com': {
      email: 'keigan.pesenti@eudia.com',
      name: 'Keigan Pesenti',
      accounts: [
        { id: '001Wj00000mCFt4IAG', name: 'BNRG Renewables Ltd' },
        { id: '001Wj00000mCFtTIAW', name: 'Coleman Legal' },
        { id: '001Wj00000pLPAyIAO', name: 'Creed McStay' },
        { id: '001Hp00003lhyCxIAI', name: 'Eudia Testing Account' },
        { id: '001Wj00000mCFsIIAW', name: 'Fannin Limited' },
        { id: '001Wj00000mCFsJIAW', name: 'Gas Networks Ireland' },
        { id: '001Wj00000mCFseIAG', name: 'Hayes Solicitors LLP' },
        { id: '001Wj00000mCFtJIAW', name: 'LinkedIn' },
        { id: '001Wj00000mCFspIAG', name: 'Moy Park' },
        { id: '001Wj00000mCFt8IAG', name: 'State Claims Agency' },
        { id: '001Wj00000mCFs3IAG', name: 'Wayflyer' },
      ]
    },

    // MIKE MASIELLO (17 accounts)
    'mike.masiello@eudia.com': {
      email: 'mike.masiello@eudia.com',
      name: 'Mike Masiello',
      accounts: [
        { id: '001Wj00000p1lCPIAY', name: 'Army Applications Lab' },
        { id: '001Wj00000p1hYbIAI', name: 'Army Corps of Engineers' },
        { id: '001Wj00000ZxEpDIAV', name: 'Army Futures Command' },
        { id: '001Wj00000bWBlAIAW', name: 'Defense Innovation Unit (DIU)' },
        { id: '001Hp00003kJuJ5IAK', name: 'Gov - DOD' },
        { id: '001Hp00003lhcL9IAI', name: 'GSA (General Services Administration)' },
        { id: '001Wj00000p1PVHIA2', name: 'IFC' },
        { id: '001Wj00000VVJ31IAH', name: 'NATO' },
        { id: '001Wj00000p1YbmIAE', name: 'SOCOM' },
        { id: '001Wj00000p1jH3IAI', name: 'State of Alaska' },
        { id: '001Wj00000hVa6VIAS', name: 'State of Arizona' },
        { id: '001Wj00000p0PcEIAU', name: 'State of California' },
        { id: '001Wj00000bWBkeIAG', name: 'U.S. Air Force' },
        { id: '001Wj00000p1SRXIA2', name: 'U.S. Marine Corps' },
        { id: '001Wj00000Rrm5OIAR', name: 'UK Government' },
        { id: '001Hp00003lieJPIAY', name: 'USDA' },
        { id: '001Wj00000p1SuZIAU', name: 'Vulcan Special Ops' },
      ]
    },

    // NATHAN SHINE (19 accounts)
    'nathan.shine@eudia.com': {
      email: 'nathan.shine@eudia.com',
      name: 'Nathan Shine',
      accounts: [
        { id: '001Hp00003kIrEnIAK', name: 'Amphenol' },
        { id: '001Wj00000mHDBoIAO', name: 'Coimisiun na Mean' },
        { id: '001Wj00000mCFqtIAG', name: 'CommScope Technologies' },
        { id: '001Hp00003kIrDMIA0', name: 'Dropbox' },
        { id: '001Wj00000mCFquIAG', name: 'Fexco' },
        { id: '001Wj00000mCFs5IAG', name: 'Indeed' },
        { id: '001Hp00003kIrJOIA0', name: 'Keurig Dr Pepper' },
        { id: '001Wj00000hkk0zIAA', name: 'Kingspan' },
        { id: '001Wj00000mCFrsIAG', name: 'Kitman Labs' },
        { id: '001Wj00000mCFsMIAW', name: 'McDermott Creed & Martyn' },
        { id: '001Wj00000mCFsoIAG', name: 'Mediolanum' },
        { id: '001Wj00000mCFrFIAW', name: 'OKG Payments Services Limited' },
        { id: '001Wj00000ZDPUIIA5', name: 'Perrigo Pharma' },
        { id: '001Wj00000mCFtSIAW', name: 'Poe Kiely Hogan Lanigan' },
        { id: '001Wj00000mCFtHIAW', name: 'StepStone Group' },
        { id: '001Wj00000c9oD6IAI', name: 'Stripe' },
        { id: '001Wj00000SFiOvIAL', name: 'TikTok' },
        { id: '001Wj00000ZDXTRIA5', name: 'Tinder LLC' },
        { id: '001Wj00000bWBlEIAW', name: 'Udemy' },
      ]
    },

    // NICOLA FRATINI (29 accounts)
    'nicola.fratini@eudia.com': {
      email: 'nicola.fratini@eudia.com',
      name: 'Nicola Fratini',
      accounts: [
        { id: '001Wj00000mCFrGIAW', name: 'AerCap' },
        { id: '001Wj00000thuKEIAY', name: 'Aer Lingus' },
        { id: '001Wj00000sgXdBIAU', name: 'Allianz Insurance' },
        { id: '001Wj00000mCFs7IAG', name: 'Allied Irish Banks plc' },
        { id: '001Wj00000mCFrhIAG', name: 'Avant Money' },
        { id: '001Wj00000mI7NaIAK', name: 'Aviva Insurance' },
        { id: '001Wj00000uNUIBIA4', name: 'Bank of China' },
        { id: '001Hp00003kJ9kNIAS', name: 'Barclays' },
        { id: '001Wj00000ttPZBIA2', name: 'Barings' },
        { id: '001Wj00000tWwXwIAK', name: 'Cairn Homes' },
        { id: '001Wj00000Y6VLhIAN', name: 'Citi' },
        { id: '001Wj00000tx2MQIAY', name: 'CyberArk' },
        { id: '001Wj00000mCFsBIAW', name: 'Datalex' },
        { id: '001Wj00000mCFrlIAG', name: 'Davy' },
        { id: '001Wj00000w0uVVIAY', name: 'Doceree' },
        { id: '001Wj00000uJwxoIAC', name: 'Eir' },
        { id: '001Wj00000sg8GcIAI', name: 'FARFETCH' },
        { id: '001Wj00000mIEAXIA4', name: 'FNZ Group' },
        { id: '001Wj00000mCFt1IAG', name: 'Goodbody Stockbrokers' },
        { id: '001Wj00000ZDXrdIAH', name: 'Intercom' },
        { id: '001Wj00000ullPpIAI', name: 'Jet2 Plc' },
        { id: '001Wj00000au3swIAA', name: 'Lenovo' },
        { id: '001Hp00003kIrKmIAK', name: 'Northern Trust Management Services' },
        { id: '001Wj00000u0eJpIAI', name: 'Re-Turn' },
        { id: '001Wj00000sg2T0IAI', name: 'SHEIN' },
        { id: '001Wj00000mCFs1IAG', name: 'Twitter' },
        { id: '001Hp00003kIrDAIA0', name: 'Verizon' },
        { id: '001Wj00000sgaj9IAA', name: 'Volkswagon Group Ireland' },
        { id: '001Wj00000mIB6EIAW', name: 'Zendesk' },
      ]
    },

    // OLIVIA JUNG (30 accounts)
    'olivia@eudia.com': {
      email: 'olivia@eudia.com',
      name: 'Olivia Jung',
      accounts: [
        { id: '001Wj00000mCFrdIAG', name: 'Airship Group Inc' },
        { id: '001Hp00003kIrFVIA0', name: 'Best Buy' },
        { id: '001Hp00003kIrFkIAK', name: 'Bristol-Myers Squibb' },
        { id: '001Hp00003kIrGKIA0', name: 'CHS' },
        { id: '001Hp00003kIrDZIA0', name: 'Ciena' },
        { id: '001Hp00003kIrGZIA0', name: 'Consolidated Edison' },
        { id: '001Wj00000jK5HlIAK', name: 'Crate & Barrel' },
        { id: '001Hp00003kJ9kwIAC', name: 'CSL' },
        { id: '001Hp00003kIrGoIAK', name: 'Cummins' },
        { id: '001Wj00000bzz9RIAQ', name: 'Datadog' },
        { id: '001Wj00000aZvt9IAC', name: 'Dolby' },
        { id: '001Wj00000hkk0jIAA', name: 'Etsy' },
        { id: '001Hp00003kIrISIA0', name: 'Gilead Sciences' },
        { id: '001Hp00003kIrE8IAK', name: 'Graybar Electric' },
        { id: '001Wj00000dvgdbIAA', name: 'HealthEquity' },
        { id: '001Hp00003kIrJ9IAK', name: 'Intuit' },
        { id: '001Wj00000aLlyVIAS', name: 'J.Crew' },
        { id: '001Hp00003kKKMcIAO', name: 'JPmorganchase' },
        { id: '001Hp00003kIrDjIAK', name: 'Marsh McLennan' },
        { id: '001Hp00003kIrD8IAK', name: 'Medtronic' },
        { id: '001Hp00003kIrKKIA0', name: 'Merck' },
        { id: '001Hp00003kJ9lGIAS', name: 'Meta' },
        { id: '001Hp00003kIrKSIA0', name: 'Mondelez International' },
        { id: '001Hp00003kIrLOIA0', name: 'Pfizer' },
        { id: '001Wj00000iS9AJIA0', name: 'TE Connectivity' },
        { id: '001Hp00003kIrDFIA0', name: 'Thermo Fisher Scientific' },
        { id: '001Wj00000PjGDaIAN', name: 'The Weir Group PLC' },
        { id: '001Hp00003kIrCwIAK', name: 'Toshiba US' },
        { id: '001Wj00000kD7MAIA0', name: 'Wellspan Health' },
        { id: '001Hp00003kIrOAIA0', name: 'Western Digital' },
      ]
    },

    // TOM CLANCY (11 accounts)
    'tom.clancy@eudia.com': {
      email: 'tom.clancy@eudia.com',
      name: 'Tom Clancy',
      accounts: [
        { id: '001Wj00000pB30VIAS', name: 'AIR (Advanced Inhalation Rituals)' },
        { id: '001Wj00000qLRqWIAW', name: 'ASML' },
        { id: '001Wj00000c9oCeIAI', name: 'BLDG Management Co., Inc.' },
        { id: '001Wj00000mCFszIAG', name: 'Electricity Supply Board' },
        { id: '001Wj00000mCFrcIAG', name: 'Glanbia' },
        { id: '001Wj00000pA6d7IAC', name: 'Masdar Future Energy Company' },
        { id: '001Hp00003kIrD9IAK', name: 'Salesforce' },
        { id: '001Wj00000qL7AGIA0', name: 'Seismic' },
        { id: '001Wj00000pAPW2IAO', name: 'Tarmac' },
        { id: '001Wj00000mCFtOIAW', name: 'Uisce Eireann (Irish Water)' },
        { id: '001Wj00000pBibTIAS', name: 'Version1' },
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
   * Get accounts owned by a specific user
   * Tries server first (live Salesforce data), falls back to static data
   */
  async getAccountsForUser(email: string): Promise<OwnedAccount[]> {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Try server endpoint first (live Salesforce data)
    const serverAccounts = await this.fetchFromServer(normalizedEmail);
    if (serverAccounts && serverAccounts.length > 0) {
      console.log(`[AccountOwnership] Got ${serverAccounts.length} accounts from server for ${normalizedEmail}`);
      return serverAccounts;
    }
    
    // Fall back to static data (offline support / backup)
    console.log(`[AccountOwnership] Using static data fallback for ${normalizedEmail}`);
    return this.getAccountsFromStatic(normalizedEmail);
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
    
    // For regular BLs and others, look up directly
    const lead = OWNERSHIP_DATA.businessLeads[email];
    if (!lead) {
      console.log(`[AccountOwnership] No static mapping found for: ${email}`);
      return [];
    }
    console.log(`[AccountOwnership] Found ${lead.accounts.length} static accounts for ${email}`);
    return lead.accounts;
  }

  /**
   * Fetch account ownership from server (live Salesforce data)
   * This is now the PRIMARY source - static data is fallback
   */
  private async fetchFromServer(email: string): Promise<OwnedAccount[] | null> {
    try {
      // Use dynamic import to avoid issues in non-Obsidian environments
      const { requestUrl } = await import('obsidian');
      
      const response = await requestUrl({
        url: `${this.serverUrl}/api/accounts/ownership/${encodeURIComponent(email)}`,
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
