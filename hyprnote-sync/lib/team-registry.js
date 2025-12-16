/**
 * Team Registry - Pre-configured User IDs and Roles
 * 
 * This eliminates the need for reps to look up their Salesforce User ID.
 * Setup wizard will auto-detect based on email or name.
 */

const TEAM_MEMBERS = {
  // ============================
  // US POD - Business Leads
  // ============================
  'julie.stefanich@eudia.com': {
    name: 'Julie Stefanich',
    salesforceUserId: '005Hp00000kywEtIAI',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'US'
  },
  'justin.hills@eudia.com': {
    name: 'Justin Hills',
    salesforceUserId: '005Wj00000UVn1ZIAT',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'US'
  },
  'asad.hussain@eudia.com': {
    name: 'Asad Hussain',
    salesforceUserId: '005Wj00000DT05BIAT',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'US'
  },
  'himanshu@eudia.com': {
    name: 'Himanshu Agarwal',
    salesforceUserId: '005Hp00000kywEeIAI',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'US'
  },
  'ananth@eudia.com': {
    name: 'Ananth Cherukupally',
    salesforceUserId: '005Wj00000DSlJ6IAL',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'US'
  },
  'olivia@eudia.com': {
    name: 'Olivia Jung',
    salesforceUserId: '005Hp00000kywEiIAI',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'US'
  },
  
  // ============================
  // EU POD - Business Leads
  // ============================
  'greg.machale@eudia.com': {
    name: 'Greg MacHale',
    salesforceUserId: '005Wj00000XDuuEIAT',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'EU'
  },
  'nathan.shine@eudia.com': {
    name: 'Nathan Shine',
    salesforceUserId: '005Wj00000XDd3lIAD',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'EU'
  },
  'tom.clancy@eudia.com': {
    name: 'Tom Clancy',
    salesforceUserId: '005Wj00000XfSYVIA3',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'EU'
  },
  'conor.molloy@eudia.com': {
    name: 'Conor Molloy',
    salesforceUserId: '005Wj00000XfSYUIA3',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'EU'
  },
  'alex.fox@eudia.com': {
    name: 'Alex Fox',
    salesforceUserId: '005Wj00000XfSYRIA3',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'EU'
  },
  'nicola.fratini@eudia.com': {
    name: 'Nicola Fratini',
    salesforceUserId: '005Wj00000XfSYTIA3',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'EU'
  },
  'emer.flynn@eudia.com': {
    name: 'Emer Flynn',
    salesforceUserId: '005Wj00000XfSYXIA3',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'EU'
  },
  'riona.mchale@eudia.com': {
    name: 'Riona McHale',
    salesforceUserId: '005Wj00000XDaKQIA1',
    role: 'Sales Manager',
    team: 'Sales',
    pod: 'EU'
  },
  
  // ============================
  // DEPRECATED - No longer active
  // ============================
  'jonathan.cobb@eudia.com': {
    name: 'Jon Cobb',
    salesforceUserId: '005Wj00000MxJI6IAN',
    role: 'Business Lead',
    team: 'Sales',
    pod: 'US',
    deprecated: true
  },
  
  // Product Team
  'zack.huffstutter@eudia.com': {
    name: 'Zack Huffstutter',
    salesforceUserId: '005Wj00000J5ljJIAR',
    role: 'Product',
    team: 'Product'
  },
  
  // Executive
  'omar@eudia.com': {
    name: 'Omar Haroun',
    salesforceUserId: '005Hp00000kywEkIAI',
    role: 'CEO',
    team: 'Executive'
  },
  'david@eudia.com': {
    name: 'David Van Reyk',
    salesforceUserId: '005Hp00000kywEoIAI',
    role: 'COO',
    team: 'Executive'
  },
  
  // Admin
  'keigan.pesenti@eudia.com': {
    name: 'Keigan Pesenti',
    salesforceUserId: '005Wj00000IPqFZIA1',
    role: 'RevOps',
    team: 'Operations'
  }
};

// Alternate email patterns
// Standard format: firstname.lastname@eudia.com
// Exceptions: olivia@, omar@, david@, himanshu@, ananth@
const EMAIL_ALIASES = {
  // Jon variations
  'jon.cobb@eudia.com': 'jonathan.cobb@eudia.com',
  'joncobb@eudia.com': 'jonathan.cobb@eudia.com',
  
  // Himanshu variations
  'himanshu.agarwal@eudia.com': 'himanshu@eudia.com',
  
  // Ananth variations
  'ananth.cherukupally@eudia.com': 'ananth@eudia.com',
  
  // Olivia variations
  'olivia.jung@eudia.com': 'olivia@eudia.com',
  
  // Omar variations
  'omar.haroun@eudia.com': 'omar@eudia.com',
  
  // David variations
  'david.vanreyk@eudia.com': 'david@eudia.com',
  'david.van.reyk@eudia.com': 'david@eudia.com',
  
  // Zack variations
  'zack@eudia.com': 'zack.huffstutter@eudia.com'
};

/**
 * Look up team member by email
 */
function findByEmail(email) {
  if (!email) return null;
  
  const normalizedEmail = email.toLowerCase().trim();
  
  // Check direct match
  if (TEAM_MEMBERS[normalizedEmail]) {
    return TEAM_MEMBERS[normalizedEmail];
  }
  
  // Check aliases
  const aliasedEmail = EMAIL_ALIASES[normalizedEmail];
  if (aliasedEmail && TEAM_MEMBERS[aliasedEmail]) {
    return TEAM_MEMBERS[aliasedEmail];
  }
  
  // Check partial match (first part of email)
  const emailPrefix = normalizedEmail.split('@')[0];
  for (const [key, member] of Object.entries(TEAM_MEMBERS)) {
    const memberPrefix = key.split('@')[0];
    if (memberPrefix.includes(emailPrefix) || emailPrefix.includes(memberPrefix)) {
      return member;
    }
  }
  
  return null;
}

/**
 * Look up team member by name
 */
function findByName(name) {
  if (!name) return null;
  
  const normalizedName = name.toLowerCase().trim();
  
  for (const member of Object.values(TEAM_MEMBERS)) {
    if (member.name.toLowerCase() === normalizedName) {
      return member;
    }
    // Partial match (first name or last name)
    const nameParts = member.name.toLowerCase().split(' ');
    if (nameParts.some(part => normalizedName.includes(part) || part.includes(normalizedName))) {
      return member;
    }
  }
  
  return null;
}

/**
 * Look up team member by Salesforce User ID
 */
function findByUserId(userId) {
  if (!userId) return null;
  
  for (const member of Object.values(TEAM_MEMBERS)) {
    if (member.salesforceUserId === userId) {
      return member;
    }
  }
  
  return null;
}

/**
 * Get all team members
 */
function getAllMembers() {
  return Object.values(TEAM_MEMBERS);
}

/**
 * Get members by team
 */
function getByTeam(team) {
  return Object.values(TEAM_MEMBERS).filter(m => m.team === team);
}

/**
 * Get members by role
 */
function getByRole(role) {
  return Object.values(TEAM_MEMBERS).filter(m => m.role === role);
}

/**
 * Validate a Salesforce User ID format
 */
function isValidUserId(userId) {
  return userId && typeof userId === 'string' && userId.startsWith('005') && userId.length >= 15;
}

module.exports = {
  TEAM_MEMBERS,
  findByEmail,
  findByName,
  findByUserId,
  getAllMembers,
  getByTeam,
  getByRole,
  isValidUserId
};

