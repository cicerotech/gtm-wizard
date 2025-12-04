/**
 * Johnson Hana Pipeline Data (from separate Salesforce instance)
 * Updated: Dec 3, 2024
 * Note: Updated weekly until systems sync
 */

// Stage mapping from Johnson Hana → Eudia format
const stageMapping = {
  'Stage 0 Qualifying': 'Stage 0 - Qualifying',
  'Stage 1 Discovery': 'Stage 1 - Discovery',
  'Stage 2 SQO (Sales Qualified Op)': 'Stage 2 - SQO',
  'Stage 3 Pilot (Optional)': 'Stage 3 - Pilot',
  'Stage 4 - Proposal': 'Stage 4 - Proposal',
  'Stage 5 - Negotiation': 'Stage 5 - Negotiation',
  'Closed Won': 'Stage 6. Closed(Won)'
};

// Service line mapping where possible
const serviceLineMapping = {
  'Contracting-BAU': 'Contracting',
  'Contracting-Repapering/ Remediation': 'Contracting',
  'Contracting-Technology': 'Contracting',
  'Privacy-General Support': 'Privacy',
  'Privacy-Outsourced Operations': 'Privacy',
  'Discovery-Managed Review': 'Discovery',
  'Discovery-Platform Only': 'Discovery',
  'Compliance-Complaints': 'Compliance',
  'Global Legal Services': 'Legal Services',
  'Outside Counsel Management': 'Legal Services'
  // Others pass through as-is
};

function mapStage(jhStage) {
  return stageMapping[jhStage] || jhStage;
}

function mapServiceLine(jhServiceLine) {
  if (!jhServiceLine) return 'Other';
  return serviceLineMapping[jhServiceLine] || jhServiceLine;
}

// Active Pipeline (82 opportunities)
const activePipeline = [
  { stage: 'Stage 1 Discovery', account: 'Airbnb Ireland UC', oppName: 'Airbnb ODL Rory Collins extension', acv: 97440, probability: 0.15, weighted: 14616, serviceLine: 'Contracting-BAU', closeDate: '2026-02-20', eudiaTech: false, term: 13 },
  { stage: 'Stage 4 - Proposal', account: 'Airbnb Ireland UC', oppName: 'Airbnb Privacy Support (Ext.1) Erica Gomes', acv: 76560, probability: 0.50, weighted: 38280, serviceLine: 'Privacy-General Support', closeDate: '2025-12-31', eudiaTech: false, term: 12 },
  { stage: 'Stage 0 Qualifying', account: 'Amphenol', oppName: 'Amphenol Sigma Opp', acv: 128492, probability: 0.00, weighted: 0, serviceLine: 'Technology', closeDate: '2026-03-31', eudiaTech: false, term: 14 },
  { stage: 'Stage 4 - Proposal', account: 'Autodesk', oppName: 'Autodesk DSAR Support', acv: 116000, probability: 0.70, weighted: 81200, serviceLine: 'DSAR', closeDate: '2024-12-31', eudiaTech: false },
  { stage: 'Stage 4 - Proposal', account: 'Aviva Insurance', oppName: 'BCL Discovery Review (Opposing Parties)', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Discovery', closeDate: '2024-07-31', eudiaTech: false },
  { stage: 'Stage 1 Discovery', account: 'Bank of Ireland', oppName: 'BOI F&P March 26 March 29', acv: 178375, probability: 0.15, weighted: 26756, serviceLine: 'Legal Ops', closeDate: '2026-02-27', eudiaTech: false, term: 36 },
  { stage: 'Stage 4 - Proposal', account: 'Bank of Ireland', oppName: 'BOI FSPO Tracker renewal 2026/2028', acv: 828240, probability: 0.50, weighted: 414120, serviceLine: 'Contracting-BAU', closeDate: '2025-12-19', eudiaTech: false, term: 26 },
  { stage: 'Stage 4 - Proposal', account: 'Coillte', oppName: 'Coillte AIE Support', acv: 348000, probability: 0.30, weighted: 104400, serviceLine: 'Discovery-Managed Review', closeDate: '2026-01-30', eudiaTech: false, term: 9 },
  { stage: 'Stage 4 - Proposal', account: 'Coimisiún na Meán', oppName: 'Coimisiún na Meán Paralegal Extension', acv: 133632, probability: 0.70, weighted: 93542, serviceLine: 'Compliance', closeDate: '2026-01-31', eudiaTech: false, term: 11 },
  { stage: 'Stage 4 - Proposal', account: 'Coimisiún na Meán', oppName: 'Coimisiún na Meán Project Levy Extension', acv: 238960, probability: 0.70, weighted: 167272, serviceLine: 'Compliance', closeDate: '2026-01-31', eudiaTech: false, term: 11 },
  { stage: 'Stage 1 Discovery', account: 'CommScope Technologies LLC', oppName: 'Commscope Conor Hassett 2026', acv: 203000, probability: 0.15, weighted: 30450, serviceLine: 'Contracting-BAU', closeDate: '2026-01-30', eudiaTech: false, term: 11 },
  { stage: 'Stage 4 - Proposal', account: 'Department of Children, Disability and Equality', oppName: 'DCEDIY Discovery Process Project 2', acv: 117160, probability: 0.70, weighted: 82012, serviceLine: 'Discovery-Managed Review', closeDate: '2025-12-31', eudiaTech: false, term: 5 },
  { stage: 'Stage 4 - Proposal', account: 'Dunnes Stores', oppName: 'Dunnes Stores Commercial Contracts RFT', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Contracting', closeDate: '2020-08-04', eudiaTech: false, term: 13 },
  { stage: 'Stage 3 Pilot (Optional)', account: 'Dunnes Stores', oppName: 'Dunnes Stores DSAR Subscription Solution Pilot', acv: 34800, probability: 0.20, weighted: 6960, serviceLine: 'DSAR', closeDate: '2025-12-12', eudiaTech: false, term: 1 },
  { stage: 'Stage 3 Pilot (Optional)', account: 'Dunnes Stores', oppName: 'Dunnes Stores DSAR Subscription Solution Post Pilot', acv: 185600, probability: 0.20, weighted: 37120, serviceLine: 'DSAR', closeDate: '2026-02-02', eudiaTech: false, term: 10 },
  { stage: 'Stage 1 Discovery', account: 'Etsy Ireland UC', oppName: 'Etsy Privacy Program Manager Extension', acv: 58000, probability: 0.15, weighted: 8700, serviceLine: 'Privacy', closeDate: '2026-01-15', eudiaTech: false, term: 4 },
  { stage: 'Stage 5 - Negotiation', account: 'Etsy Ireland UC', oppName: 'Etsy Privacy Support Eleanor Power Extension', acv: 69600, probability: 0.85, weighted: 59160, serviceLine: 'Contracting-BAU', closeDate: '2025-12-30', eudiaTech: false, term: 6 },
  { stage: 'Stage 0 Qualifying', account: 'FNZ Group', oppName: 'FNZ Group', acv: 0, probability: 0.02, weighted: 0, serviceLine: 'Other', closeDate: '2025-12-31', eudiaTech: false },
  { stage: 'Stage 4 - Proposal', account: 'IHRB', oppName: 'IHRB Tender', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Other', closeDate: '2020-05-15', eudiaTech: false, term: 31 },
  { stage: 'Stage 1 Discovery', account: 'Indeed Ireland Operations Limited', oppName: 'Indeed ODL Julie Harrington extension', acv: 174000, probability: 0.15, weighted: 26100, serviceLine: 'Contracting-BAU', closeDate: '2026-02-20', eudiaTech: false, term: 12 },
  { stage: 'Stage 1 Discovery', account: 'Indeed Ireland Operations Limited', oppName: 'Indeed ODL paralegal support Consultant 2', acv: 58000, probability: 0.15, weighted: 8700, serviceLine: 'Compliance', closeDate: '2026-01-31', eudiaTech: false, term: 9 },
  { stage: 'Stage 0 Qualifying', account: 'Irish Life', oppName: 'Irish Life DSAR Support', acv: 11600, probability: 0.02, weighted: 232, serviceLine: 'DSAR', closeDate: '2026-01-30', eudiaTech: false, term: 11 },
  { stage: 'Stage 4 - Proposal', account: 'Kellogg Europe Trading Limited', oppName: 'Maternity Leave Cover 6 months part time', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Other', closeDate: '2020-12-31', eudiaTech: false, term: -2 },
  { stage: 'Stage 0 Qualifying', account: 'Nomura', oppName: 'Nomura Sigma & Augmented Contracting', acv: 0, probability: 0.02, weighted: 0, serviceLine: 'Contracting', closeDate: '2025-12-31', eudiaTech: false },
  { stage: 'Stage 4 - Proposal', account: 'Northern Trust', oppName: 'Northern Trust Irish regulated fund agreements', acv: 69600, probability: 0.30, weighted: 20880, serviceLine: 'Contracting-Repapering/ Remediation', closeDate: '2025-12-31', eudiaTech: false, term: 6 },
  { stage: 'Stage 5 - Negotiation', account: 'OpenAI', oppName: 'OpenAI ODL ---> MLS', acv: 1477941, probability: 0.85, weighted: 1256250, serviceLine: 'Privacy-Outsourced Operations', closeDate: '2025-11-17', eudiaTech: false, term: 27 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'RTE', oppName: 'RTE DSAR Support', acv: 232000, probability: 0.30, weighted: 69600, serviceLine: 'DSAR', closeDate: '2025-12-19', eudiaTech: false, term: 12 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'Sisk Group', oppName: 'Sisk Group Subscription Tech', acv: 58580, probability: 0.30, weighted: 17574, serviceLine: 'Discovery-Platform Only', closeDate: '2025-12-19', eudiaTech: false, term: 13 },
  { stage: 'Stage 0 Qualifying', account: 'Taoglas Limited', oppName: 'Taoglas ODL Support 2026 extension', acv: 9048, probability: 0.02, weighted: 181, serviceLine: 'Contracting-BAU', closeDate: '2025-12-12', eudiaTech: false, term: 3 },
  { stage: 'Stage 4 - Proposal', account: 'Revolut', oppName: 'TEST_Certinia Deployment Smoke Test II', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Contracting', closeDate: '2024-11-01', eudiaTech: false },
  { stage: 'Stage 5 - Negotiation', account: 'TikTok Information Technologies UK Limited', oppName: 'TikTok DSAR support ODL 2026', acv: 61412, probability: 0.90, weighted: 55271, serviceLine: 'Privacy-Outsourced Operations', closeDate: '2026-01-09', eudiaTech: false, term: 17 },
  { stage: 'Stage 1 Discovery', account: 'Tinder LLC', oppName: 'Tinder Consultant Replacement', acv: 121800, probability: 0.15, weighted: 18270, serviceLine: 'Contracting-BAU', closeDate: '2026-01-08', eudiaTech: false, term: 6 },
  { stage: 'Stage 4 - Proposal', account: 'Uisce Éireann (Irish Water)', oppName: 'Uisce Eireann CDS Amal Elbay extension', acv: 164349, probability: 0.70, weighted: 115044, serviceLine: 'Contracting-BAU', closeDate: '2025-12-12', eudiaTech: false, term: 12 },
  { stage: 'Stage 4 - Proposal', account: 'Uisce Éireann (Irish Water)', oppName: 'Uisce Eireann CDS Jamie O\'Gorman extension', acv: 164349, probability: 0.70, weighted: 115044, serviceLine: 'Contracting-BAU', closeDate: '2025-12-12', eudiaTech: false, term: 12 },
  { stage: 'Stage 4 - Proposal', account: 'Uisce Éireann (Irish Water)', oppName: 'Uisce Eireann CDS Luke Sexton extension', acv: 164349, probability: 0.70, weighted: 115044, serviceLine: 'Contracting-BAU', closeDate: '2025-12-12', eudiaTech: false, term: 12 },
  { stage: 'Stage 4 - Proposal', account: 'Ulster Bank', oppName: 'Ulster Bank Complaints process', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Compliance', closeDate: '2020-04-30', eudiaTech: false, term: 4 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'Version1', oppName: 'Version1 Legal Secondment (6 month)', acv: 69600, probability: 0.20, weighted: 13920, serviceLine: 'Contracting-BAU', closeDate: '2026-01-16', eudiaTech: false, term: 5 },
  { stage: 'Stage 0 Qualifying', account: 'Wells Fargo', oppName: 'Wells Fargo', acv: 0, probability: 0.02, weighted: 0, serviceLine: 'Other', closeDate: '2025-12-31', eudiaTech: false },
  { stage: 'Stage 0 Qualifying', account: 'Whitney Moore', oppName: 'Whitney Moore', acv: 0, probability: 0.00, weighted: 0, serviceLine: 'Discovery', closeDate: '2025-12-31', eudiaTech: false, term: 0 },
  { stage: 'Stage 4 - Proposal', account: 'XACT Data Discovery', oppName: 'XDD Partnership Opportunity', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Discovery', closeDate: '2020-08-31', eudiaTech: false },
  { stage: 'Stage 0 Qualifying', account: 'Zoom', oppName: 'Zoom', acv: 0, probability: 0.00, weighted: 0, serviceLine: 'Contracting-Technology', closeDate: '2025-12-31', eudiaTech: false, term: 1 },
  // === EUDIA TECH OPPORTUNITIES ===
  { stage: 'Stage 1 Discovery', account: 'Citibank', oppName: 'AI Augmented Contracting', acv: 0.01, probability: 0.15, weighted: 0, serviceLine: 'Contracting', closeDate: '2026-03-31', eudiaTech: true, term: 9 },
  { stage: 'Stage 4 - Proposal', account: 'Anthropic', oppName: 'Anthropic - ODL Privacy Secondment - 6 months', acv: 111360, probability: 0.60, weighted: 66816, serviceLine: 'Other', closeDate: '2025-12-31', eudiaTech: true, term: 5 },
  { stage: 'Stage 4 - Proposal', account: 'Bank of Ireland', oppName: 'BOI Sigma & Insights', acv: 139200, probability: 0.50, weighted: 69600, serviceLine: 'Compliance-Complaints', closeDate: '2025-12-19', eudiaTech: true, term: 26 },
  { stage: 'Stage 1 Discovery', account: 'CommScope Technologies LLC', oppName: 'Commscope Sigma Opp', acv: 139200, probability: 0.15, weighted: 20880, serviceLine: 'Technology', closeDate: '2026-01-31', eudiaTech: true, term: 13 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'Davy', oppName: 'Davy - Managed Legal Solution', acv: 0.01, probability: 0.20, weighted: 0, serviceLine: 'Contracting-BAU', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 5 - Negotiation', account: 'Dropbox International Unlimited Company', oppName: 'Dropbox 2026 Extension Fabiane Arguello', acv: 46400, probability: 0.85, weighted: 39440, serviceLine: 'Contracting-BAU', closeDate: '2025-12-08', eudiaTech: true, term: 12 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'Dropbox International Unlimited Company', oppName: 'Dropbox AI Augmented Contracting Deal', acv: 348000, probability: 0.30, weighted: 104400, serviceLine: 'Contracting-Technology', closeDate: '2026-01-31', eudiaTech: true, term: 13 },
  { stage: 'Stage 0 Qualifying', account: 'Fexco', oppName: 'Fexco', acv: 0.01, probability: 0.00, weighted: 0, serviceLine: 'Contracting-BAU', closeDate: '2026-03-31', eudiaTech: true, term: 9 },
  { stage: 'Stage 4 - Proposal', account: 'Goodbody Stockbrokers', oppName: 'Goodbody - Sigma & Insights', acv: 278400, probability: 0.60, weighted: 167040, serviceLine: 'Contracting-BAU', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 1 Discovery', account: 'Indeed Ireland Operations Limited', oppName: 'Indeed Sigma Tech Opp', acv: 139200, probability: 0.15, weighted: 20880, serviceLine: 'Technology', closeDate: '2026-02-27', eudiaTech: true, term: 11 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'Keurig Dr Pepper', oppName: 'Keurig Dr Pepper Tech Enabled Consultant', acv: 143550, probability: 0.20, weighted: 28710, serviceLine: 'Contracting-BAU', closeDate: '2025-12-31', eudiaTech: true, term: 6 },
  { stage: 'Stage 0 Qualifying', account: 'Lenovo', oppName: 'Lenovo MLS', acv: 0.01, probability: 0.00, weighted: 0, serviceLine: 'Contracting-BAU', closeDate: '2026-03-31', eudiaTech: true, term: 21 },
  { stage: 'Stage 0 Qualifying', account: 'White Swan Data', oppName: 'Managed Legal Solution', acv: 0.01, probability: 0.00, weighted: 0, serviceLine: 'Contracting-BAU', closeDate: '2026-03-31', eudiaTech: true, term: 9 },
  { stage: 'Stage 1 Discovery', account: 'Aviva Insurance', oppName: 'Managed Legal Solution', acv: 0.01, probability: 0.15, weighted: 0, serviceLine: 'Contracting-Technology', closeDate: '2026-03-31', eudiaTech: true, term: 9 },
  { stage: 'Stage 1 Discovery', account: 'Verizon', oppName: 'Managed Legal Solution AI Augmented Contracting', acv: 0.01, probability: 0.15, weighted: 0, serviceLine: 'Contracting', closeDate: '2026-03-31', eudiaTech: true, term: 9 },
  { stage: 'Stage 0 Qualifying', account: 'Tinder LLC', oppName: 'Match Group Outsourced Contracts Price Per Output', acv: 58000, probability: 0.02, weighted: 1160, serviceLine: 'Contracting-BAU', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 0 Qualifying', account: 'Citibank', oppName: 'NDA RFP', acv: 0.01, probability: 0.02, weighted: 0, serviceLine: 'Contracting-BAU', closeDate: '2026-03-31', eudiaTech: true, term: 9 },
  { stage: 'Stage 1 Discovery', account: 'OKG Payments Services Limited', oppName: 'OKX Sigma Deal', acv: 139200, probability: 0.15, weighted: 20880, serviceLine: 'Technology', closeDate: '2026-03-31', eudiaTech: true, term: 12 },
  { stage: 'Stage 1 Discovery', account: 'Perrigo Pharma', oppName: 'Perrigo Claims Support Service', acv: 116000, probability: 0.15, weighted: 17400, serviceLine: 'Contracting-Technology', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 5 - Negotiation', account: 'Perrigo Pharma', oppName: 'Perrigo ODL Commercial Contracts Ext', acv: 81200, probability: 0.85, weighted: 69020, serviceLine: 'Contracting-BAU', closeDate: '2025-12-12', eudiaTech: true, term: 6 },
  { stage: 'Stage 1 Discovery', account: 'Perrigo Pharma', oppName: 'Perrigo Outsourced Contracts MLS', acv: 145000, probability: 0.15, weighted: 21750, serviceLine: 'Contracting-BAU', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 1 Discovery', account: 'Regeneron', oppName: 'Regeneron Marketing Claims Solution', acv: 174000, probability: 0.15, weighted: 26100, serviceLine: 'Contracting', closeDate: '2026-01-30', eudiaTech: true, term: 10 },
  { stage: 'Stage 0 Qualifying', account: 'Rio Tinto', oppName: 'Rio Tinto Discovery', acv: 0, probability: 0.00, weighted: 0, serviceLine: 'Global Legal Services', closeDate: '2026-03-20', eudiaTech: true, term: 2 },
  { stage: 'Stage 5 - Negotiation', account: 'Sequoia Climate Fund', oppName: 'Sequoia Climate Fund - Design phase', acv: 116000, probability: 0.70, weighted: 81200, serviceLine: 'Technology', closeDate: '2025-12-05', eudiaTech: true, term: 2 },
  { stage: 'Stage 1 Discovery', account: 'StepStone Group Europe Alternative Investments Limited', oppName: 'Stepstone Contracting NDA Service', acv: 487200, probability: 0.15, weighted: 73080, serviceLine: 'Contracting', closeDate: '2026-02-28', eudiaTech: true, term: 10 },
  { stage: 'Stage 1 Discovery', account: 'StepStone Group Europe Alternative Investments Limited', oppName: 'Stepstone Sigma AIFMD 2 document review', acv: 11600, probability: 0.15, weighted: 1740, serviceLine: 'Contracting-Repapering/ Remediation', closeDate: '2026-03-27', eudiaTech: true, term: 12 },
  { stage: 'Stage 1 Discovery', account: 'TikTok Information Technologies UK Limited', oppName: 'TikTok Contract Remediation Opp', acv: 116000, probability: 0.15, weighted: 17400, serviceLine: 'Contracting', closeDate: '2026-03-31', eudiaTech: true, term: 5 },
  { stage: 'Stage 1 Discovery', account: 'TikTok Information Technologies UK Limited', oppName: 'TikTok Eudia Compliance Audit Opp', acv: 696000, probability: 0.15, weighted: 104400, serviceLine: 'Compliance', closeDate: '2026-02-28', eudiaTech: true, term: 13 },
  { stage: 'Stage 1 Discovery', account: 'TikTok Information Technologies UK Limited', oppName: 'TikTok Eudia Driven CaaS Procurement Solution', acv: 348000, probability: 0.15, weighted: 52200, serviceLine: 'Contracting-BAU', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'TikTok Information Technologies UK Limited', oppName: 'TikTok Litigation PM ODL', acv: 125280, probability: 0.30, weighted: 37584, serviceLine: 'Litigation', closeDate: '2026-01-09', eudiaTech: true, term: 6 },
  { stage: 'Stage 1 Discovery', account: 'TikTok Information Technologies UK Limited', oppName: 'TikTok OCM', acv: 58000, probability: 0.15, weighted: 8700, serviceLine: 'Outside Counsel Management', closeDate: '2026-02-27', eudiaTech: true, term: 4 },
  { stage: 'Stage 1 Discovery', account: 'TikTok Information Technologies UK Limited', oppName: 'TikTok Shop Contracting Solution Deal', acv: 232000, probability: 0.15, weighted: 34800, serviceLine: 'Contracting-Repapering/ Remediation', closeDate: '2026-01-30', eudiaTech: true, term: 11 },
  { stage: 'Stage 1 Discovery', account: 'TikTok Information Technologies UK Limited', oppName: 'TikTok Tech Enabled PM RFP', acv: 522000, probability: 0.15, weighted: 78300, serviceLine: 'Other', closeDate: '2026-01-30', eudiaTech: true, term: 11 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'TikTok Information Technologies UK Limited', oppName: 'TikTok Tech Only Contracting Solution', acv: 139200, probability: 0.30, weighted: 41760, serviceLine: 'Technology', closeDate: '2026-01-31', eudiaTech: true, term: 12 },
  { stage: 'Stage 1 Discovery', account: 'Tinder LLC', oppName: 'Tinder Outsourced Contract Solution', acv: 58000, probability: 0.15, weighted: 8700, serviceLine: 'Contracting-BAU', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 0 Qualifying', account: 'Transworld Business Advisors', oppName: 'Transworld Business Advisors DD & Contracting', acv: 0, probability: 0.02, weighted: 0, serviceLine: 'Contracting-Technology', closeDate: '2025-12-31', eudiaTech: true, term: 1 },
  { stage: 'Stage 1 Discovery', account: 'Udemy Ireland Limited', oppName: 'Udemy Contracting Solution Secondments', acv: 348000, probability: 0.15, weighted: 52200, serviceLine: 'Contracting-Technology', closeDate: '2026-03-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 1 Discovery', account: 'Udemy Ireland Limited', oppName: 'Udemy Sigma Deal', acv: 139200, probability: 0.15, weighted: 20880, serviceLine: 'Technology', closeDate: '2026-02-28', eudiaTech: true, term: 13 },
  { stage: 'Stage 1 Discovery', account: 'Waystone', oppName: 'Waystone Contracting', acv: 92800, probability: 0.15, weighted: 13920, serviceLine: 'Contracting', closeDate: '2025-12-19', eudiaTech: true, term: 11 },
  { stage: 'Stage 5 - Negotiation', account: 'Wellspring Philanthropic Fund', oppName: 'Wellspring Philanthropic Fund - Design phase', acv: 116000, probability: 0.70, weighted: 81200, serviceLine: 'Technology', closeDate: '2025-12-05', eudiaTech: true, term: 2 },
  { stage: 'Stage 4 - Proposal', account: 'Zyte', oppName: 'Zyte - ODL Secondment - 10 months', acv: 127600, probability: 0.60, weighted: 76560, serviceLine: 'Contracting-Technology', closeDate: '2025-12-31', eudiaTech: true, term: 9 }
];

// Closed Won Nov-Dec 2024 (10 deals)
const closedWonNovDec = [
  { stage: 'Closed Won', account: 'Airbnb', oppName: 'Airbnb Privacy Support - Replacement ODL - Erica Gomes', acv: 35844, term: 4, serviceLine: 'Privacy-General Support', closeDate: '2024-11-12', eudiaTech: false },
  { stage: 'Closed Won', account: 'Aramark Ireland', oppName: 'Aramark Paralegal Support', acv: 8700, term: 1, serviceLine: 'Contracting', closeDate: '2024-11-21', eudiaTech: false },
  { stage: 'Closed Won', account: 'Aryza', oppName: 'Aryza - ODL Secondment - 2 years', acv: 226200, term: 24, serviceLine: 'Contracting-Technology', closeDate: '2024-11-12', eudiaTech: true },
  { stage: 'Closed Won', account: 'Datalex (Ireland) Limited', oppName: 'Datalex ODL support Ronan Lupton Extension', acv: 102544, term: 13, serviceLine: 'Contracting-BAU', closeDate: '2024-11-25', eudiaTech: false },
  { stage: 'Closed Won', account: 'Glanbia Management Services Limited', oppName: 'Glanbia Secondment Extension', acv: 88044, term: 13, serviceLine: 'Contracting-BAU', closeDate: '2024-11-12', eudiaTech: false },
  { stage: 'Closed Won', account: 'Kellogg Europe Trading Limited', oppName: 'Kellanova ODL Transactions Julie Collins\' team', acv: 8352, term: 1, serviceLine: 'Contracting-BAU', closeDate: '2024-11-25', eudiaTech: false },
  { stage: 'Closed Won', account: 'Kingspan', oppName: 'Kingspan ODL Contracts Project', acv: 8120, term: 0, serviceLine: 'Contracting-BAU', closeDate: '2024-11-07', eudiaTech: false },
  { stage: 'Closed Won', account: 'OpenAI', oppName: 'OpenAI privacy team expansion - additional consultant', acv: 52200, term: 3, serviceLine: 'Privacy', closeDate: '2024-11-04', eudiaTech: false },
  { stage: 'Closed Won', account: 'OpenAI', oppName: 'OpenAI - Privacy Team Expansion - Elizabeth Agbaje', acv: 41412, term: 3, serviceLine: 'Privacy', closeDate: '2024-11-11', eudiaTech: false },
  { stage: 'Closed Won', account: 'OpenAI', oppName: 'OpenAI Privacy Team Expansion - Nerea Perez', acv: 41412, term: 3, serviceLine: 'Privacy', closeDate: '2024-11-11', eudiaTech: false }
];

/**
 * Get Johnson Hana pipeline summary
 */
function getJohnsonHanaSummary() {
  const totalPipeline = activePipeline.reduce((sum, o) => sum + o.acv, 0);
  const totalWeighted = activePipeline.reduce((sum, o) => sum + o.weighted, 0);
  const closedTotal = closedWonNovDec.reduce((sum, o) => sum + o.acv, 0);
  
  // Eudia Tech breakdown
  const eudiaTechOpps = activePipeline.filter(o => o.eudiaTech);
  const eudiaTechPipeline = eudiaTechOpps.reduce((sum, o) => sum + o.acv, 0);
  const eudiaTechWeighted = eudiaTechOpps.reduce((sum, o) => sum + o.weighted, 0);
  const eudiaTechClosed = closedWonNovDec.filter(o => o.eudiaTech).reduce((sum, o) => sum + o.acv, 0);
  
  // Stage breakdown (mapped)
  const byStage = {};
  activePipeline.forEach(o => {
    const mappedStage = mapStage(o.stage);
    if (!byStage[mappedStage]) byStage[mappedStage] = { count: 0, acv: 0, weighted: 0 };
    byStage[mappedStage].count++;
    byStage[mappedStage].acv += o.acv;
    byStage[mappedStage].weighted += o.weighted;
  });
  
  // Unique accounts
  const uniqueAccounts = [...new Set(activePipeline.map(o => o.account))];
  
  return {
    totalOpportunities: activePipeline.length,
    totalPipeline,
    totalWeighted,
    closedDealsCount: closedWonNovDec.length,
    closedTotal,
    uniqueAccounts: uniqueAccounts.length,
    eudiaTech: {
      opportunityCount: eudiaTechOpps.length,
      pipelineValue: eudiaTechPipeline,
      weightedValue: eudiaTechWeighted,
      closedValue: eudiaTechClosed,
      percentOfOpps: Math.round((eudiaTechOpps.length / activePipeline.length) * 100),
      percentOfValue: Math.round((eudiaTechPipeline / totalPipeline) * 100)
    },
    byStage
  };
}

/**
 * Get opportunities by stage (mapped to Eudia format)
 */
function getOpportunitiesByStage() {
  const byStage = {
    'Stage 5 - Negotiation': [],
    'Stage 4 - Proposal': [],
    'Stage 3 - Pilot': [],
    'Stage 2 - SQO': [],
    'Stage 1 - Discovery': [],
    'Stage 0 - Qualifying': []
  };
  
  activePipeline.forEach(o => {
    const mappedStage = mapStage(o.stage);
    if (byStage[mappedStage]) {
      byStage[mappedStage].push({
        ...o,
        stage: mappedStage,
        mappedServiceLine: mapServiceLine(o.serviceLine)
      });
    }
  });
  
  return byStage;
}

/**
 * Get accounts with pipeline summary
 */
function getAccountSummaries() {
  const accounts = {};
  
  activePipeline.forEach(o => {
    if (!accounts[o.account]) {
      accounts[o.account] = {
        name: o.account,
        opportunities: [],
        totalACV: 0,
        weightedACV: 0,
        highestStage: 0,
        hasEudiaTech: false
      };
    }
    
    accounts[o.account].opportunities.push({
      ...o,
      stage: mapStage(o.stage),
      mappedServiceLine: mapServiceLine(o.serviceLine)
    });
    accounts[o.account].totalACV += o.acv;
    accounts[o.account].weightedACV += o.weighted;
    
    // Track highest stage
    const stageNum = parseInt(mapStage(o.stage).match(/Stage (\d)/)?.[1] || 0);
    accounts[o.account].highestStage = Math.max(accounts[o.account].highestStage, stageNum);
    
    if (o.eudiaTech) accounts[o.account].hasEudiaTech = true;
  });
  
  return Object.values(accounts).sort((a, b) => b.totalACV - a.totalACV);
}

module.exports = {
  activePipeline,
  closedWonNovDec,
  stageMapping,
  serviceLineMapping,
  mapStage,
  mapServiceLine,
  getJohnsonHanaSummary,
  getOpportunitiesByStage,
  getAccountSummaries
};

