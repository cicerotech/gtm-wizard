/**
 * Eudia Company Glossary
 * 
 * This file contains domain-specific vocabulary used for:
 * 1. Whisper prompt context (improves transcription accuracy)
 * 2. Post-processing corrections (fixes common misheard words)
 * 3. Product/term normalization
 * 
 * Update this file as new terms, products, or team members are added.
 */

const EUDIA_GLOSSARY = {
  // ═══════════════════════════════════════════════════════════════════════════
  // COMPANY INFORMATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  company: {
    names: ['Eudia', 'eudia.ai', 'Cicero Technology'],
    description: 'AI legal technology company'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTS (exact casing for transcription)
  // ═══════════════════════════════════════════════════════════════════════════
  
  products: [
    'Sigma',
    'AI Contracting',
    'AI Compliance',
    'AI M&A',
    'Insights',
    'Litigation'
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMONLY MISHEARD TERMS -> CORRECT SPELLING
  // Key: what Whisper might output (lowercase for matching)
  // Value: correct spelling
  // ═══════════════════════════════════════════════════════════════════════════
  
  corrections: {
    // Company name variations
    'you dia': 'Eudia',
    'udia': 'Eudia',
    'eudea': 'Eudia',
    'you deal': 'Eudia',
    'e u d i a': 'Eudia',
    'yudia': 'Eudia',
    'edia': 'Eudia',
    'oodia': 'Eudia',
    
    // Product names
    'sigma platform': 'Sigma Platform',
    'signa': 'Sigma',
    'segma': 'Sigma',
    'the sigma': 'Sigma',
    
    // MEDDICC (very commonly misheard)
    'med dick': 'MEDDICC',
    'meadick': 'MEDDICC',
    'medic': 'MEDDICC',
    'med ic': 'MEDDICC',
    'medick': 'MEDDICC',
    'm e d d i c c': 'MEDDICC',
    
    // Sales acronyms
    'acv': 'ACV',
    'a c v': 'ACV',
    'a.c.v.': 'ACV',
    'arr': 'ARR',
    'a r r': 'ARR',
    'a.r.r.': 'ARR',
    'mql': 'MQL',
    'm q l': 'MQL',
    'sql': 'SQL',
    's q l': 'SQL',
    'bdr': 'BDR',
    'b d r': 'BDR',
    'sdr': 'SDR',
    's d r': 'SDR',
    'poc': 'POC',
    'p o c': 'POC',
    'rfp': 'RFP',
    'r f p': 'RFP',
    'sow': 'SOW',
    's o w': 'SOW',
    
    // Legal titles
    'clo': 'CLO',
    'c l o': 'CLO',
    'c.l.o.': 'CLO',
    'gc': 'GC',
    'g c': 'GC',
    'g.c.': 'GC',
    'general counsel': 'General Counsel',
    'deputy gc': 'Deputy GC',
    'vp legal': 'VP Legal',
    'vp of legal': 'VP of Legal',
    'legal ops': 'Legal Ops',
    
    // Legal terms
    'nda': 'NDA',
    'n d a': 'NDA',
    'n.d.a.': 'NDA',
    'msa': 'MSA',
    'm s a': 'MSA',
    'm.s.a.': 'MSA',
    'dpa': 'DPA',
    'd p a': 'DPA',
    'd.p.a.': 'DPA',
    'sla': 'SLA',
    's l a': 'SLA',
    's.l.a.': 'SLA',
    'm and a': 'M&A',
    'm&a': 'M&A',
    'mergers and acquisitions': 'M&A',
    
    // Common tech/sales terms
    'saas': 'SaaS',
    'sass': 'SaaS',
    's a a s': 'SaaS',
    'ai': 'AI',
    'a i': 'AI',
    'a.i.': 'AI',
    'crm': 'CRM',
    'c r m': 'CRM',
    'api': 'API',
    'a p i': 'API',
    'salesforce': 'Salesforce',
    'sales force': 'Salesforce'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INDUSTRY JARGON AND TERMS (for Whisper prompt)
  // ═══════════════════════════════════════════════════════════════════════════
  
  terms: [
    // MEDDICC methodology
    'MEDDICC', 'Economic Buyer', 'Decision Process', 'Decision Criteria',
    'Champion', 'Identify Pain', 'Competition', 'Metrics',
    
    // Sales terms
    'ACV', 'ARR', 'MRR', 'MQL', 'SQL', 'BDR', 'SDR', 'POC', 
    'RFP', 'RFI', 'SOW', 'pipeline', 'quota', 'forecast', 'commit',
    'closed won', 'closed lost', 'stage', 'opportunity',
    
    // Legal terms
    'MSA', 'NDA', 'DPA', 'SLA', 'CLO', 'GC', 'VP Legal',
    'Legal Ops', 'Due Diligence', 'M&A', 'Contracting', 'Compliance',
    'contract lifecycle', 'contract management', 'redlining',
    
    // Tech terms
    'AI', 'SaaS', 'API', 'integration', 'deployment', 'implementation',
    'CRM', 'Salesforce', 'DocuSign', 'Ironclad'
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM MEMBERS (for name transcription accuracy)
  // Add your actual team members here
  // ═══════════════════════════════════════════════════════════════════════════
  
  people: [
    // Eudia Leadership & Internal
    'Keigan', 'Omar', 'Mitchell', 'Stephen',
    // US Pod BLs
    'Ananth', 'Asad', 'Julie', 'Justin', 'Mike', 'Olivia',
    // EU Pod BLs
    'Alex', 'Conor', 'Emer', 'Greg', 'Nathan', 'Nicola', 'Tom'
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPETITOR NAMES (for accurate transcription)
  // ═══════════════════════════════════════════════════════════════════════════
  
  competitors: [
    'Ironclad',
    'DocuSign',
    'Agiloft',
    'Icertis',
    'ContractPodAi',
    'Evisort',
    'LinkSquares',
    'Juro',
    'Concord',
    'Conga'
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMER VERTICALS (for context)
  // ═══════════════════════════════════════════════════════════════════════════
  
  verticals: [
    'Financial Services',
    'Healthcare',
    'Technology',
    'Manufacturing',
    'Retail',
    'Life Sciences',
    'Energy',
    'Insurance'
  ]
};

/**
 * Apply glossary-based corrections to transcript text
 * @param {string} text - Raw transcript text
 * @returns {string} - Corrected transcript
 */
function applyCorrections(text) {
  let corrected = text;
  
  // Apply each correction (case-insensitive matching)
  for (const [wrong, right] of Object.entries(EUDIA_GLOSSARY.corrections)) {
    // Use word boundary matching to avoid partial replacements
    const regex = new RegExp(`\\b${escapeRegex(wrong)}\\b`, 'gi');
    corrected = corrected.replace(regex, right);
  }
  
  return corrected;
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get all terms as a flat list for Whisper prompt
 */
function getAllTerms() {
  return [
    ...EUDIA_GLOSSARY.company.names,
    ...EUDIA_GLOSSARY.products,
    ...EUDIA_GLOSSARY.terms,
    ...EUDIA_GLOSSARY.people,
    ...EUDIA_GLOSSARY.competitors
  ];
}

module.exports = {
  EUDIA_GLOSSARY,
  applyCorrections,
  getAllTerms
};
