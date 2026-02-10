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
  'michael.flynn@eudia.com',
  'zach@eudia.com'
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
  'riley.stack@eudia.com': 'US'
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
 * Source: "Business Lead Account Assignment latest version.xlsx"
 * Filter: Customer Type = Existing OR Open Opps > 0 (matches BoB report)
 * Auto-generated on 2026-02-10
 * 
 * Total: 18 business leads, 219 accounts
 */
const OWNERSHIP_DATA: AccountOwnershipData = {
  version: '2026-02-10',
  lastUpdated: '2026-02-10',
  businessLeads: {

    // ALEX FOX (5 accounts)
    'alex.fox@eudia.com': {
      email: 'alex.fox@eudia.com',
      name: 'Alex Fox',
      accounts: [
        { id: '001Wj00000mCFsT', name: 'Arabic Computer Systems' },
        { id: '001Wj00000mCFsc', name: 'Department of Children, Disability and Equality' },
        { id: '001Wj00000mCFsN', name: 'Department of Climate, Energy and the Environment' },
        { id: '001Wj00000mCFsU', name: 'ESB NI/Electric Ireland' },
        { id: '001Wj00000mCFrM', name: 'Sisk Group' },
      ]
    },

    // ANANTH CHERUKUPALLY (10 accounts)
    'ananth@eudia.com': {
      email: 'ananth@eudia.com',
      name: 'Ananth Cherukupally',
      accounts: [
        { id: '001Wj00000cejJz', name: 'CVC' },
        { id: '001Wj00000Y64qh', name: 'Emigrant Bank' },
        { id: '001Hp00003kIrIJ', name: 'GE Vernova' },
        { id: '001Wj00000Z6zhP', name: 'Liberty Mutual Insurance' },
        { id: '001Wj00000bWBlQ', name: 'Pegasystems' },
        { id: '001Wj00000bzz9M', name: 'Peregrine Hospitality' },
        { id: '001Hp00003ljCJ8', name: 'Petco' },
        { id: '001Hp00003kKXSI', name: 'Pure Storage' },
        { id: '001Wj00000lxbYR', name: 'Spark Brighter Thinking' },
        { id: '001Wj00000bn8VS', name: 'Vista Equity Partners' },
      ]
    },

    // ASAD HUSSAIN (24 accounts)
    'asad.hussain@eudia.com': {
      email: 'asad.hussain@eudia.com',
      name: 'Asad Hussain',
      accounts: [
        { id: '001Hp00003kIrCy', name: 'Airbnb' },
        { id: '001Hp00003kIrEe', name: 'Amazon' },
        { id: '001Wj00000Y0g8Z', name: 'Asana' },
        { id: '001Wj00000c0wRA', name: 'Away' },
        { id: '001Wj00000WTMCR', name: 'BNY Mellon' },
        { id: '001Wj00000ah6dk', name: 'Charlesbank Capital Partners' },
        { id: '001Hp00003kIrE5', name: 'Coherent' },
        { id: '001Hp00003kIrE6', name: 'DHL' },
        { id: '001Wj00000W8ZKl', name: 'Docusign' },
        { id: '001Hp00003kIrHN', name: 'Ecolab' },
        { id: '001Hp00003kIrI3', name: 'Fluor' },
        { id: '001Hp00003kIrIA', name: 'Fox' },
        { id: '001Hp00003kJ9oe', name: 'Fresh Del Monte' },
        { id: '001Hp00003kIrIK', name: 'Geico' },
        { id: '001Wj00000oqVXg', name: 'Goosehead Insurance' },
        { id: '001Wj00000hdoLx', name: 'Insight Enterprises Inc.' },
        { id: '001Hp00003kIrKC', name: 'Mass Mutual Life Insurance' },
        { id: '001Wj00000kNp2X', name: 'Plusgrade' },
        { id: '001Hp00003kIrD9', name: 'Salesforce' },
        { id: '001Hp00003kIrMK', name: 'ServiceNow' },
        { id: '001Hp00003kIrEC', name: 'Southwest Airlines' },
        { id: '001Wj00000bzz9N', name: 'Wealth Partners Capital Group' },
        { id: '001Wj00000tuolf', name: 'Wynn Las Vegas' },
        { id: '001Wj00000uzs1f', name: 'Zero RFI' },
      ]
    },

    // CONOR MOLLOY (13 accounts)
    'conor.molloy@eudia.com': {
      email: 'conor.molloy@eudia.com',
      name: 'Conor Molloy',
      accounts: [
        { id: '001Hp00003kIrQD', name: 'Accenture' },
        { id: '001Hp00003kIrEy', name: 'Aramark Ireland' },
        { id: '001Wj00000mCFrg', name: 'Aryza' },
        { id: '001Wj00000tsfWO', name: 'Baker Tilly' },
        { id: '001Wj00000mCFrk', name: 'Coillte' },
        { id: '001Wj00000mCFsH', name: 'Consensys' },
        { id: '001Wj00000Y64qd', name: 'ION' },
        { id: '001Wj00000mCFtM', name: 'Kellanova' },
        { id: '001Wj00000mCFrI', name: 'Orsted' },
        { id: '001Wj00000mI9Nm', name: 'Sequoia Climate Fund' },
        { id: '001Wj00000mCFs0', name: 'Taoglas Limited' },
        { id: '001Wj00000mCFtP', name: 'Teamwork.com' },
        { id: '001Wj00000ZLVpT', name: 'Wellspring Philanthropic Fund' },
      ]
    },

    // EMER FLYNN (1 accounts)
    'emer.flynn@eudia.com': {
      email: 'emer.flynn@eudia.com',
      name: 'Emer Flynn',
      accounts: [
        { id: '001Wj00000mCFr6', name: 'NTMA' },
      ]
    },

    // GREG MACHALE (23 accounts)
    'greg.machale@eudia.com': {
      email: 'greg.machale@eudia.com',
      name: 'Greg MacHale',
      accounts: [
        { id: '001Hp00003kIrEF', name: 'Abbott Laboratories' },
        { id: '001Wj00000sgXdB', name: 'Allianz Insurance' },
        { id: '001Wj00000Y6VMd', name: 'BNP Paribas' },
        { id: '001Wj00000X4OqN', name: 'BT Group' },
        { id: '001Wj00000uZ5J7', name: 'Canada Life' },
        { id: '001Wj00000Y6VMk', name: 'Computershare' },
        { id: '001Wj00000uP5x8', name: 'Cornmarket Financial Services' },
        { id: '001Wj00000Y6VMM', name: 'Diageo' },
        { id: '001Wj00000fFuFY', name: 'Grant Thornton' },
        { id: '001Wj00000uZ4A9', name: 'Great West Lifec co' },
        { id: '001Wj00000xW3SE', name: 'Hayfin' },
        { id: '001Wj00000wvtPl', name: 'ICEYE' },
        { id: '001Wj00000uZtcT', name: 'Ineos' },
        { id: '001Wj00000vwSUX', name: 'Mercor' },
        { id: '001Wj00000mCFtU', name: 'Mercury Engineering' },
        { id: '001Wj00000lPFP3', name: 'Nomura' },
        { id: '001Wj00000mCFr1', name: 'Permanent TSB plc' },
        { id: '001Wj00000Y6QfR', name: 'Pernod Ricard' },
        { id: '001Wj00000mCFsF', name: 'Regeneron' },
        { id: '001Wj00000mCFsR', name: 'Ryanair' },
        { id: '001Wj00000pAxKo', name: 'SSP Group' },
        { id: '001Hp00003kIrMj', name: 'State Street' },
        { id: '001Wj00000mCFrm', name: 'eShopWorld' },
      ]
    },

    // JULIE STEFANICH (26 accounts)
    'julie.stefanich@eudia.com': {
      email: 'julie.stefanich@eudia.com',
      name: 'Julie Stefanich',
      accounts: [
        { id: '001Hp00003kIrEv', name: 'Apple' },
        { id: '001Hp00003kJ9pX', name: 'Bayer' },
        { id: '001Hp00003kIrE3', name: 'Cargill' },
        { id: '001Hp00003kIrGD', name: 'Charles Schwab' },
        { id: '001Hp00003kIrE4', name: 'Chevron' },
        { id: '001Hp00003kIrDh', name: 'Comcast' },
        { id: '001Hp00003kIrGe', name: 'Corebridge Financial' },
        { id: '001Hp00003kIrE7', name: 'ECMS' },
        { id: '001Hp00003kIrIP', name: 'Genworth Financial' },
        { id: '001Hp00003kIrIX', name: 'Goldman Sachs' },
        { id: '001Wj00000rceVp', name: 'Hikma' },
        { id: '001Hp00003kIrJV', name: 'KLA' },
        { id: '001Wj00000aLmhe', name: 'Macmillan' },
        { id: '001Wj00000X6G8q', name: 'Mainsail Partners' },
        { id: '001Hp00003kIrKL', name: 'MetLife' },
        { id: '001Hp00003kIrDe', name: 'National Grid' },
        { id: '001Hp00003kIrLN', name: 'Petsmart' },
        { id: '001Hp00003kIrLZ', name: 'Procter & Gamble' },
        { id: '001Hp00003lhsUY', name: 'Rio Tinto Group' },
        { id: '001Wj00000svQI3', name: 'Safelite' },
        { id: '001Wj00000fRtLm', name: 'State Farm' },
        { id: '001Hp00003kIrNH', name: 'T-Mobile' },
        { id: '001Wj00000bzz9T', name: 'Tailored Brands' },
        { id: '001Hp00003kIrNB', name: 'The Wonderful Company' },
        { id: '001Hp00003kIrNV', name: 'Uber' },
        { id: '001Hp00003kIrOL', name: 'World Wide Technology' },
      ]
    },

    // JUSTIN HILLS (12 accounts)
    'justin.hills@eudia.com': {
      email: 'justin.hills@eudia.com',
      name: 'Justin Hills',
      accounts: [
        { id: '001Wj00000Y6VM4', name: 'Ares Management Corporation' },
        { id: '001Wj00000c9oCv', name: 'Cox Media Group' },
        { id: '001Wj00000Y0jPm', name: 'Delinea' },
        { id: '001Wj00000iwKGQ', name: 'Dominos' },
        { id: '001Hp00003kIrDa', name: 'Duracell' },
        { id: '001Hp00003kIrDV', name: 'Intel' },
        { id: '001Hp00003kIrJJ', name: 'Johnson & Johnson' },
        { id: '001Wj00000gnrug', name: 'Kraken' },
        { id: '001Wj00000WYyKI', name: 'Ramp' },
        { id: '001Hp00003kIrMi', name: 'Starbucks' },
        { id: '001Wj00000o5G0v', name: 'StockX' },
        { id: '001Wj00000YEMa8', name: 'Turing' },
      ]
    },

    // KEIGAN PESENTI (3 accounts)
    'keigan.pesenti@eudia.com': {
      email: 'keigan.pesenti@eudia.com',
      name: 'Keigan Pesenti',
      accounts: [
        { id: '001Wj00000mCFtT', name: 'Coleman Legal' },
        { id: '001Wj00000pLPAy', name: 'Creed McStay' },
        { id: '001Wj00000mCFse', name: 'Hayes Solicitors LLP' },
      ]
    },

    // MIKE MASIELLO (17 accounts)
    'mike.masiello@eudia.com': {
      email: 'mike.masiello@eudia.com',
      name: 'Mike Masiello',
      accounts: [
        { id: '001Wj00000p1lCP', name: 'Army Applications Lab' },
        { id: '001Wj00000p1hYb', name: 'Army Corps of Engineers' },
        { id: '001Wj00000ZxEpD', name: 'Army Futures Command' },
        { id: '001Wj00000bWBlA', name: 'Defense Innovation Unit (DIU)' },
        { id: '001Hp00003kJuJ5', name: 'Gov - DOD' },
        { id: '001Wj00000p1PVH', name: 'IFC' },
        { id: '001Wj00000VVJ31', name: 'NATO' },
        { id: '001Wj00000p1Ybm', name: 'SOCOM' },
        { id: '001Hp00003lhcL9', name: 'Social Security Administration' },
        { id: '001Wj00000p1jH3', name: 'State of Alaska' },
        { id: '001Wj00000hVa6V', name: 'State of Arizona' },
        { id: '001Wj00000p0PcE', name: 'State of California' },
        { id: '001Wj00000bWBke', name: 'U.S. Air Force' },
        { id: '001Wj00000p1SRX', name: 'U.S. Marine Corps' },
        { id: '001Wj00000Rrm5O', name: 'UK Government' },
        { id: '001Hp00003lieJP', name: 'USDA' },
        { id: '001Wj00000p1SuZ', name: 'Vulcan Special Ops' },
      ]
    },

    // MITCH LOQUACI (1 accounts)
    'mitchell.loquaci@eudia.com': {
      email: 'mitchell.loquaci@eudia.com',
      name: 'Mitch Loquaci',
      accounts: [
        { id: '001Wj00000cpxt0', name: 'Novelis' },
      ]
    },

    // NATHAN SHINE (14 accounts)
    'nathan.shine@eudia.com': {
      email: 'nathan.shine@eudia.com',
      name: 'Nathan Shine',
      accounts: [
        { id: '001Hp00003kIrEn', name: 'Amphenol' },
        { id: '001Wj00000mHDBo', name: 'Coimisiun na Mean' },
        { id: '001Wj00000mCFqt', name: 'CommScope Technologies' },
        { id: '001Hp00003kIrDM', name: 'Dropbox' },
        { id: '001Wj00000mCFqu', name: 'Fexco' },
        { id: '001Wj00000mCFs5', name: 'Indeed' },
        { id: '001Wj00000hkk0z', name: 'Kingspan' },
        { id: '001Wj00000mCFso', name: 'Mediolanum' },
        { id: '001Wj00000mCFrF', name: 'OKG Payments Services Limited' },
        { id: '001Wj00000ZDPUI', name: 'Perrigo Pharma' },
        { id: '001Wj00000mCFtH', name: 'StepStone Group' },
        { id: '001Wj00000SFiOv', name: 'TikTok' },
        { id: '001Wj00000ZDXTR', name: 'Tinder LLC' },
        { id: '001Wj00000bWBlE', name: 'Udemy' },
      ]
    },

    // NICOLA FRATINI (30 accounts)
    'nicola.fratini@eudia.com': {
      email: 'nicola.fratini@eudia.com',
      name: 'Nicola Fratini',
      accounts: [
        { id: '001Wj00000thuKE', name: 'Aer Lingus' },
        { id: '001Wj00000mCFrG', name: 'AerCap' },
        { id: '001Wj00000mCFs7', name: 'Allied Irish Banks plc' },
        { id: '001Wj00000wvc5a', name: 'AppliedAI' },
        { id: '001Wj00000mCFrh', name: 'Avant Money' },
        { id: '001Wj00000mI7Na', name: 'Aviva Insurance' },
        { id: '001Wj00000uNUIB', name: 'Bank of China' },
        { id: '001Hp00003kJ9kN', name: 'Barclays' },
        { id: '001Wj00000ttPZB', name: 'Barings' },
        { id: '001Wj00000tWwXW', name: 'Beauparc Group' },
        { id: '001Wj00000tWwXw', name: 'Cairn Homes' },
        { id: '001Wj00000Y6VLh', name: 'Citi' },
        { id: '001Wj00000tx2MQ', name: 'CyberArk' },
        { id: '001Wj00000mCFsB', name: 'Datalex' },
        { id: '001Wj00000mCFrl', name: 'Davy' },
        { id: '001Wj00000w0uVV', name: 'Doceree' },
        { id: '001Wj00000uJwxo', name: 'Eir' },
        { id: '001Wj00000sg8Gc', name: 'FARFETCH' },
        { id: '001Wj00000mCFt1', name: 'Goodbody Stockbrokers' },
        { id: '001Wj00000ullPp', name: 'Jet2 Plc' },
        { id: '001Wj00000au3sw', name: 'Lenovo' },
        { id: '001Hp00003kIrKm', name: 'Northern Trust Management Services' },
        { id: '001Wj00000TV1Wz', name: 'OpenAi' },
        { id: '001Wj00000sg2T0', name: 'SHEIN' },
        { id: '001Wj00000c9oD6', name: 'Stripe' },
        { id: '001Wj00000mIBpN', name: 'Transworld Business Advisors' },
        { id: '001Wj00000xV8Vg', name: 'UNHCR, the UN Refugee Agency' },
        { id: '001Hp00003kIrDA', name: 'Verizon' },
        { id: '001Wj00000sgaj9', name: 'Volkswagon' },
        { id: '001Wj00000mIB6E', name: 'Zendesk' },
      ]
    },

    // OLIVIA JUNG (26 accounts)
    'olivia@eudia.com': {
      email: 'olivia@eudia.com',
      name: 'Olivia Jung',
      accounts: [
        { id: '001Hp00003kIrEO', name: 'AES' },
        { id: '001Wj00000mCFrd', name: 'Airship Group Inc' },
        { id: '001Hp00003kIrFV', name: 'Best Buy' },
        { id: '001Hp00003kIrFk', name: 'Bristol-Myers Squibb' },
        { id: '001Hp00003kIrGK', name: 'CHS' },
        { id: '001Hp00003kIrGZ', name: 'Consolidated Edison' },
        { id: '001Wj00000jK5Hl', name: 'Crate & Barrel' },
        { id: '001Hp00003kIrGo', name: 'Cummins' },
        { id: '001Wj00000bzz9R', name: 'Datadog' },
        { id: '001Wj00000aZvt9', name: 'Dolby' },
        { id: '001Wj00000hkk0j', name: 'Etsy' },
        { id: '001Hp00003kIrIS', name: 'Gilead Sciences' },
        { id: '001Hp00003kIrE8', name: 'Graybar Electric' },
        { id: '001Hp00003kIrJ9', name: 'Intuit' },
        { id: '001Hp00003kIrD8', name: 'Medtronic' },
        { id: '001Hp00003kIrKK', name: 'Merck' },
        { id: '001Hp00003kJ9lG', name: 'Meta' },
        { id: '001Hp00003kIrLO', name: 'Pfizer' },
        { id: '001Wj00000iS9AJ', name: 'TE Connectivity' },
        { id: '001Wj00000PjGDa', name: 'The Weir Group PLC' },
        { id: '001Hp00003kIrDF', name: 'Thermo Fisher Scientific' },
        { id: '001Hp00003kIrCw', name: 'Toshiba US' },
        { id: '001Wj00000kD7MA', name: 'Wellspan Health' },
        { id: '001Hp00003kIrOA', name: 'Western Digital' },
        { id: '001Wj00000kD3s1', name: 'White Cap' },
      ]
    },

    // RAJEEV PATEL (1 accounts)
    'rajeev.patel@eudia.com': {
      email: 'rajeev.patel@eudia.com',
      name: 'Rajeev Patel',
      accounts: [
        { id: '001Wj00000fFW35', name: 'Alnylam Pharmaceuticals' },
      ]
    },

    // RILEY STACK (1 accounts)
    'riley.stack@eudia.com': {
      email: 'riley.stack@eudia.com',
      name: 'Riley Stack',
      accounts: [
        { id: '001Wj00000XiEDy', name: 'Coinbase' },
      ]
    },

    // SEAN BOYD (1 accounts)
    'sean.boyd@eudia.com': {
      email: 'sean.boyd@eudia.com',
      name: 'Sean Boyd',
      accounts: [
        { id: '001Hp00003kIrE9', name: 'IQVIA' },
      ]
    },

    // TOM CLANCY (11 accounts)
    'tom.clancy@eudia.com': {
      email: 'tom.clancy@eudia.com',
      name: 'Tom Clancy',
      accounts: [
        { id: '001Wj00000pB30V', name: 'AIR (Advanced Inhalation Rituals)' },
        { id: '001Wj00000qLRqW', name: 'ASML' },
        { id: '001Wj00000c9oCe', name: 'BLDG Management Co., Inc.' },
        { id: '001Wj00000fFuFM', name: 'Bank of Ireland' },
        { id: '001Wj00000mCFsz', name: 'Electricity Supply Board' },
        { id: '001Wj00000mCFrc', name: 'Glanbia' },
        { id: '001Wj00000pA6d7', name: 'Masdar Future Energy Company' },
        { id: '001Wj00000qL7AG', name: 'Seismic' },
        { id: '001Wj00000pAPW2', name: 'Tarmac' },
        { id: '001Wj00000mCFtO', name: 'Uisce Eireann (Irish Water)' },
        { id: '001Wj00000pBibT', name: 'Version1' },
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
