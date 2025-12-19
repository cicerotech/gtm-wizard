/**
 * Johnson Hana Pipeline Data (from separate Salesforce instance)
 * Last Updated: Dec 5, 2025 @ 10:00 AM PST
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

// Active Pipeline - Updated Dec 5, 2025 (81 opportunities)
const activePipeline = [
  // === NON-EUDIA TECH OPPORTUNITIES ===
  { stage: 'Stage 1 Discovery', account: 'Airbnb Ireland UC', oppName: 'Airbnb ODL Rory Collins extension', owner: 'Nathan Shine', acv: 97440, probability: 0.15, weighted: 14616, serviceLine: 'Contracting-BAU', closeDate: '2026-02-20', eudiaTech: false, term: 13 },
  { stage: 'Stage 4 - Proposal', account: 'Airbnb Ireland UC', oppName: 'Airbnb Privacy Support (Ext.1) Erica Gomes', owner: 'Nathan Shine', acv: 76560, probability: 0.50, weighted: 38280, serviceLine: 'Privacy-General Support', closeDate: '2025-12-31', eudiaTech: false, term: 12 },
  { stage: 'Stage 0 Qualifying', account: 'Amphenol', oppName: 'Amphenol Sigma Opp', owner: 'Nathan Shine', acv: 128492, probability: 0.00, weighted: 0, serviceLine: 'Technology', closeDate: '2026-03-31', eudiaTech: false, term: 14 },
  { stage: 'Stage 4 - Proposal', account: 'Autodesk', oppName: 'Autodesk DSAR Support', owner: 'Sean O\'Reilly', acv: 116000, probability: 0.70, weighted: 81200, serviceLine: 'DSAR', closeDate: '2024-12-31', eudiaTech: false },
  { stage: 'Stage 4 - Proposal', account: 'Aviva Insurance', oppName: 'BCL Discovery Review (Opposing Parties)', owner: 'Tanya Kidney', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Discovery', closeDate: '2024-07-31', eudiaTech: false },
  { stage: 'Stage 1 Discovery', account: 'Bank of Ireland', oppName: 'BOI F&P March 26 March 29', owner: 'Alex Fox', acv: 178375, probability: 0.15, weighted: 26756, serviceLine: 'Legal Ops', closeDate: '2026-02-27', eudiaTech: false, term: 36 },
  { stage: 'Stage 4 - Proposal', account: 'Bank of Ireland', oppName: 'BOI FSPO Tracker renewal 2026/2028', owner: 'Alex Fox', acv: 835200, probability: 0.50, weighted: 417600, serviceLine: 'Contracting-BAU', closeDate: '2025-12-19', eudiaTech: false, term: 26 },
  { stage: 'Stage 4 - Proposal', account: 'Coillte', oppName: 'Coillte AIE Support', owner: 'Emer Flynn', acv: 348000, probability: 0.30, weighted: 104400, serviceLine: 'Discovery-Managed Review', closeDate: '2026-01-30', eudiaTech: false, term: 9 },
  { stage: 'Stage 4 - Proposal', account: 'Coimisiún na Meán', oppName: 'Coimisiún na Meán Paralegal Extension', owner: 'Nathan Shine', acv: 133632, probability: 0.70, weighted: 93542, serviceLine: 'Compliance', closeDate: '2026-01-31', eudiaTech: false, term: 11 },
  { stage: 'Stage 4 - Proposal', account: 'Coimisiún na Meán', oppName: 'Coimisiún na Meán Project Levy Extension', owner: 'Nathan Shine', acv: 238960, probability: 0.70, weighted: 167272, serviceLine: 'Compliance', closeDate: '2026-01-31', eudiaTech: false, term: 11 },
  { stage: 'Stage 1 Discovery', account: 'CommScope Technologies LLC', oppName: 'Commscope Conor Hassett 2026', owner: 'Nathan Shine', acv: 203000, probability: 0.15, weighted: 30450, serviceLine: 'Contracting-BAU', closeDate: '2026-01-30', eudiaTech: false, term: 11 },
  { stage: 'Stage 4 - Proposal', account: 'Department of Children, Disability and Equality', oppName: 'DCEDIY Discovery Process Project 2', owner: 'Alex Fox', acv: 117160, probability: 0.70, weighted: 82012, serviceLine: 'Discovery-Managed Review', closeDate: '2025-12-31', eudiaTech: false, term: 5 },
  { stage: 'Stage 4 - Proposal', account: 'Dunnes Stores', oppName: 'Dunnes Stores Commercial Contracts RFT', owner: 'Nathan Shine', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Contracting', closeDate: '2020-08-04', eudiaTech: false, term: 13 },
  { stage: 'Stage 3 Pilot (Optional)', account: 'Dunnes Stores', oppName: 'Dunnes Stores DSAR Subscription Solution Pilot', owner: 'Nathan Shine', acv: 34800, probability: 0.20, weighted: 6960, serviceLine: 'DSAR', closeDate: '2025-12-12', eudiaTech: false, term: 1 },
  { stage: 'Stage 3 Pilot (Optional)', account: 'Dunnes Stores', oppName: 'Dunnes Stores DSAR Subscription Solution Post Pilot', owner: 'Nathan Shine', acv: 185600, probability: 0.20, weighted: 37120, serviceLine: 'DSAR', closeDate: '2026-02-02', eudiaTech: false, term: 10 },
  { stage: 'Stage 1 Discovery', account: 'Etsy Ireland UC', oppName: 'Etsy Privacy Program Manager Extension (Europe - Dave role)', owner: 'Olivia Jung', acv: 58000, probability: 0.15, weighted: 8700, serviceLine: 'Privacy', closeDate: '2026-01-15', eudiaTech: false, term: 4 },
  { stage: 'Stage 5 - Negotiation', account: 'Etsy Ireland UC', oppName: 'Etsy Privacy Support Eleanor Power Extension Jan 2026', owner: 'Olivia Jung', acv: 69600, probability: 0.85, weighted: 59160, serviceLine: 'Contracting-BAU', closeDate: '2025-12-30', eudiaTech: false, term: 6 },
  { stage: 'Stage 0 Qualifying', account: 'FNZ Group', oppName: 'FNZ Group', owner: 'Conor Molloy', acv: 0, probability: 0.02, weighted: 0, serviceLine: 'Other', closeDate: '2025-12-31', eudiaTech: false },
  { stage: 'Stage 4 - Proposal', account: 'IHRB', oppName: 'IHRB Tender', owner: 'Alex Fox', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Other', closeDate: '2020-05-15', eudiaTech: false, term: 31 },
  { stage: 'Stage 1 Discovery', account: 'Indeed Ireland Operations Limited', oppName: 'Indeed ODL Julie Harrington extension Feb 26', owner: 'Nathan Shine', acv: 174000, probability: 0.15, weighted: 26100, serviceLine: 'Contracting-BAU', closeDate: '2026-02-20', eudiaTech: false, term: 12 },
  { stage: 'Stage 1 Discovery', account: 'Indeed Ireland Operations Limited', oppName: 'Indeed ODL paralegal support Consultant 2', owner: 'Nathan Shine', acv: 58000, probability: 0.15, weighted: 8700, serviceLine: 'Compliance', closeDate: '2026-01-31', eudiaTech: false, term: 9 },
  { stage: 'Stage 0 Qualifying', account: 'Irish Life', oppName: 'Irish Life DSAR Support', owner: 'Nathan Shine', acv: 11600, probability: 0.02, weighted: 232, serviceLine: 'DSAR', closeDate: '2026-01-30', eudiaTech: false, term: 11 },
  { stage: 'Stage 4 - Proposal', account: 'Kellogg Europe Trading Limited', oppName: 'Maternity Leave Cover 6 months part time', owner: 'Olivia Jung', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Other', closeDate: '2020-12-31', eudiaTech: false, term: -2 },
  { stage: 'Stage 0 Qualifying', account: 'Nomura', oppName: 'Nomura Sigma & Augmented Contracting', owner: 'Greg MacHale', acv: 0, probability: 0.02, weighted: 0, serviceLine: 'Contracting', closeDate: '2025-12-31', eudiaTech: false },
  { stage: 'Stage 4 - Proposal', account: 'Northern Trust Management Services (Ireland) Limited', oppName: 'Northern Trust - Contracting - Irish regulated fund agreements', owner: 'Nicola Fratini', acv: 69600, probability: 0.30, weighted: 20880, serviceLine: 'Contracting-Repapering/ Remediation', closeDate: '2025-12-31', eudiaTech: false, term: 6 },
  { stage: 'Stage 5 - Negotiation', account: 'OpenAI', oppName: 'OpenAI ODL ---> MLS', owner: 'Alex Fox', acv: 1477941, probability: 0.85, weighted: 1256250, serviceLine: 'Privacy-Outsourced Operations', closeDate: '2025-11-17', eudiaTech: false, term: 27 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'RTE', oppName: 'RTE DSAR Support', owner: 'Emer Flynn', acv: 232000, probability: 0.30, weighted: 69600, serviceLine: 'DSAR', closeDate: '2025-12-19', eudiaTech: false, term: 12 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'Sisk Group', oppName: 'Sisk Group Subscription Tech', owner: 'Emer Flynn', acv: 58580, probability: 0.30, weighted: 17574, serviceLine: 'Discovery-Platform Only', closeDate: '2025-12-19', eudiaTech: false, term: 13 },
  { stage: 'Stage 0 Qualifying', account: 'Taoglas Limited', oppName: 'Taoglas ODL Support 2026 extension #1', owner: 'Conor Molloy', acv: 9048, probability: 0.02, weighted: 181, serviceLine: 'Contracting-BAU', closeDate: '2025-12-12', eudiaTech: false, term: 3 },
  { stage: 'Stage 4 - Proposal', account: 'Revolut', oppName: 'TEST_Certinia Deployment Smoke Test II', owner: 'Lee Morrissey', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Contracting', closeDate: '2024-11-01', eudiaTech: false },
  { stage: 'Stage 5 - Negotiation', account: 'Tiktok Information Technologies UK Limited', oppName: 'TikTok DSAR support ODL 2026', owner: 'Nathan Shine', acv: 61412, probability: 0.90, weighted: 55271, serviceLine: 'Privacy-Outsourced Operations', closeDate: '2026-01-09', eudiaTech: false, term: 17 },
  { stage: 'Stage 1 Discovery', account: 'Tinder LLC', oppName: 'Tinder Consultant Replacement', owner: 'Nathan Shine', acv: 121800, probability: 0.15, weighted: 18270, serviceLine: 'Contracting-BAU', closeDate: '2026-01-08', eudiaTech: false, term: 6 },
  { stage: 'Stage 4 - Proposal', account: 'Uisce Éireann (Irish Water)', oppName: 'Uisce Eireann CDS Amal Elbay extension Jan 2026', owner: 'Tom Clancy', acv: 164349, probability: 0.70, weighted: 115044, serviceLine: 'Contracting-BAU', closeDate: '2025-12-12', eudiaTech: false, term: 12 },
  { stage: 'Stage 4 - Proposal', account: 'Uisce Éireann (Irish Water)', oppName: 'Uisce Eireann CDS Jamie O\'Gorman extension Jan 2026', owner: 'Tom Clancy', acv: 164349, probability: 0.70, weighted: 115044, serviceLine: 'Contracting-BAU', closeDate: '2025-12-12', eudiaTech: false, term: 12 },
  { stage: 'Stage 4 - Proposal', account: 'Uisce Éireann (Irish Water)', oppName: 'Uisce Eireann CDS Luke Sexton extension Jan 2026', owner: 'Tom Clancy', acv: 164349, probability: 0.70, weighted: 115044, serviceLine: 'Contracting-BAU', closeDate: '2025-12-12', eudiaTech: false, term: 12 },
  { stage: 'Stage 4 - Proposal', account: 'Ulster Bank', oppName: 'Ulster Bank Complaints process', owner: 'Alex Fox', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Compliance', closeDate: '2020-04-30', eudiaTech: false, term: 4 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'Version1', oppName: 'Version1 Legal Secondment (6 month)', owner: 'Tom Clancy', acv: 69600, probability: 0.20, weighted: 13920, serviceLine: 'Contracting-BAU', closeDate: '2026-01-16', eudiaTech: false, term: 5 },
  { stage: 'Stage 0 Qualifying', account: 'Wells Fargo', oppName: 'Wells Fargo', owner: 'Conor Molloy', acv: 0, probability: 0.02, weighted: 0, serviceLine: 'Other', closeDate: '2025-12-31', eudiaTech: false },
  { stage: 'Stage 0 Qualifying', account: 'Whitney Moore', oppName: 'Whitney Moore', owner: 'Conor Molloy', acv: 0, probability: 0.00, weighted: 0, serviceLine: 'Discovery', closeDate: '2025-12-31', eudiaTech: false, term: 0 },
  { stage: 'Stage 4 - Proposal', account: 'XACT Data Discovery', oppName: 'XDD Partnership Opportunity', owner: 'Dan Fox', acv: 0, probability: 0.70, weighted: 0, serviceLine: 'Discovery', closeDate: '2020-08-31', eudiaTech: false },
  { stage: 'Stage 0 Qualifying', account: 'Zoom', oppName: 'Zoom', owner: 'Conor Molloy', acv: 0, probability: 0.00, weighted: 0, serviceLine: 'Contracting-Technology', closeDate: '2025-12-31', eudiaTech: false, term: 1 },
  
  // === EUDIA TECH OPPORTUNITIES ===
  { stage: 'Stage 1 Discovery', account: 'Citibank', oppName: 'AI Augmented Contracting', owner: 'Nicola Fratini', acv: 0, probability: 0.15, weighted: 0, serviceLine: 'Contracting', closeDate: '2026-03-31', eudiaTech: true, term: 9 },
  { stage: 'Stage 4 - Proposal', account: 'Anthropic', oppName: 'Anthropic - ODL Privacy Secondment - 6 months', owner: 'Conor Molloy', acv: 111360, probability: 0.60, weighted: 66816, serviceLine: 'Other', closeDate: '2025-12-31', eudiaTech: true, term: 5 },
  { stage: 'Stage 1 Discovery', account: 'CommScope Technologies LLC', oppName: 'Commscope Sigma Opp', owner: 'Nathan Shine', acv: 139200, probability: 0.15, weighted: 20880, serviceLine: 'Technology', closeDate: '2026-01-31', eudiaTech: true, term: 13 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'Davy', oppName: 'Davy - Managed Legal Solution', owner: 'Nicola Fratini', acv: 0, probability: 0.20, weighted: 0, serviceLine: 'Contracting-BAU', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 5 - Negotiation', account: 'Dropbox International Unlimited Company', oppName: 'Dropbox 2026 Extension Fabiane Arguello', owner: 'Nathan Shine', acv: 46400, probability: 0.85, weighted: 39440, serviceLine: 'Contracting-BAU', closeDate: '2025-12-08', eudiaTech: true, term: 12 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'Dropbox International Unlimited Company', oppName: 'Dropbox AI Augmented Contracting Deal', owner: 'Nathan Shine', acv: 348000, probability: 0.30, weighted: 104400, serviceLine: 'Contracting-Technology', closeDate: '2026-01-31', eudiaTech: true, term: 13 },
  { stage: 'Stage 0 Qualifying', account: 'Fexco', oppName: 'Fexco', owner: 'Nicola Fratini', acv: 0, probability: 0.00, weighted: 0, serviceLine: 'Contracting-BAU', closeDate: '2026-03-31', eudiaTech: true, term: 9 },
  { stage: 'Stage 4 - Proposal', account: 'Goodbody Stockbrokers', oppName: 'Goodbody - Sigma & Insights', owner: 'Nicola Fratini', acv: 278400, probability: 0.60, weighted: 167040, serviceLine: 'Contracting-BAU', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 1 Discovery', account: 'Indeed Ireland Operations Limited', oppName: 'Indeed Sigma Tech Opp', owner: 'Nathan Shine', acv: 139200, probability: 0.15, weighted: 20880, serviceLine: 'Technology', closeDate: '2026-02-27', eudiaTech: true, term: 11 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'Keurig Dr Pepper', oppName: 'Keurig Dr Pepper Tech Enabled Consultant', owner: 'Nathan Shine', acv: 143550, probability: 0.20, weighted: 28710, serviceLine: 'Contracting-BAU', closeDate: '2025-12-31', eudiaTech: true, term: 6 },
  { stage: 'Stage 0 Qualifying', account: 'Lenovo', oppName: 'Lenovo MLS', owner: 'Nicola Fratini', acv: 0, probability: 0.00, weighted: 0, serviceLine: 'Contracting-BAU', closeDate: '2026-03-31', eudiaTech: true, term: 21 },
  { stage: 'Stage 0 Qualifying', account: 'White Swan Data', oppName: 'Managed Legal Solution', owner: 'Nicola Fratini', acv: 0, probability: 0.00, weighted: 0, serviceLine: 'Contracting-BAU', closeDate: '2026-03-31', eudiaTech: true, term: 9 },
  { stage: 'Stage 1 Discovery', account: 'Aviva Insurance', oppName: 'Managed Legal Solution', owner: 'Nicola Fratini', acv: 0, probability: 0.15, weighted: 0, serviceLine: 'Contracting-Technology', closeDate: '2026-03-31', eudiaTech: true, term: 9 },
  { stage: 'Stage 1 Discovery', account: 'Verizon', oppName: 'Managed Legal Solution AI Augmented Contracting', owner: 'Nicola Fratini', acv: 0, probability: 0.15, weighted: 0, serviceLine: 'Contracting', closeDate: '2026-03-31', eudiaTech: true, term: 9 },
  { stage: 'Stage 0 Qualifying', account: 'Tinder LLC', oppName: 'Match Group Outsourced Contracts Price Per Output', owner: 'Nathan Shine', acv: 58000, probability: 0.02, weighted: 1160, serviceLine: 'Contracting-BAU', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 0 Qualifying', account: 'Citibank', oppName: 'NDA RFP', owner: 'Nicola Fratini', acv: 0, probability: 0.02, weighted: 0, serviceLine: 'Contracting-BAU', closeDate: '2026-03-31', eudiaTech: true, term: 9 },
  { stage: 'Stage 1 Discovery', account: 'OKG Payments Services Limited', oppName: 'OKX Sigma Deal', owner: 'Nathan Shine', acv: 139200, probability: 0.15, weighted: 20880, serviceLine: 'Technology', closeDate: '2026-03-31', eudiaTech: true, term: 12 },
  { stage: 'Stage 1 Discovery', account: 'Perrigo Pharma', oppName: 'Perrigo Claims Support Service', owner: 'Nathan Shine', acv: 116000, probability: 0.15, weighted: 17400, serviceLine: 'Contracting-Technology', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 5 - Negotiation', account: 'Perrigo Pharma', oppName: 'Perrigo ODL Commercial Contracts Ext', owner: 'Nathan Shine', acv: 81200, probability: 0.85, weighted: 69020, serviceLine: 'Contracting-BAU', closeDate: '2025-12-12', eudiaTech: true, term: 6 },
  { stage: 'Stage 1 Discovery', account: 'Perrigo Pharma', oppName: 'Perrigo Outsourced Contracts MLS', owner: 'Nathan Shine', acv: 145000, probability: 0.15, weighted: 21750, serviceLine: 'Contracting-BAU', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 1 Discovery', account: 'Regeneron', oppName: 'Regeneron Marketing Claims Solution', owner: 'Nathan Shine', acv: 174000, probability: 0.15, weighted: 26100, serviceLine: 'Contracting', closeDate: '2026-01-30', eudiaTech: true, term: 10 },
  { stage: 'Stage 0 Qualifying', account: 'Rio Tinto', oppName: 'Rio Tinto Discovery', owner: 'Greg MacHale', acv: 0, probability: 0.00, weighted: 0, serviceLine: 'Global Legal Services', closeDate: '2026-03-20', eudiaTech: true, term: 2 },
  { stage: 'Stage 5 - Negotiation', account: 'Sequoia Climate Fund', oppName: 'Sequoia Climate Fund - Design phase', owner: 'Conor Molloy', acv: 116000, probability: 0.70, weighted: 81200, serviceLine: 'Technology', closeDate: '2025-12-05', eudiaTech: true, term: 2 },
  { stage: 'Stage 1 Discovery', account: 'StepStone Group Europe Alternative Investments Limited', oppName: 'Stepstone Contracting NDA Service', owner: 'Nathan Shine', acv: 487200, probability: 0.15, weighted: 73080, serviceLine: 'Contracting', closeDate: '2026-02-28', eudiaTech: true, term: 10 },
  { stage: 'Stage 1 Discovery', account: 'StepStone Group Europe Alternative Investments Limited', oppName: 'Stepstone Sigma (AIFMD 2 document review 2025 Consultant', owner: 'Nathan Shine', acv: 11600, probability: 0.15, weighted: 1740, serviceLine: 'Contracting-Repapering/ Remediation', closeDate: '2026-03-27', eudiaTech: true, term: 12 },
  { stage: 'Stage 1 Discovery', account: 'Tiktok Information Technologies UK Limited', oppName: 'TikTok Contract Remediation Opp', owner: 'Nathan Shine', acv: 116000, probability: 0.15, weighted: 17400, serviceLine: 'Contracting', closeDate: '2026-03-31', eudiaTech: true, term: 5 },
  { stage: 'Stage 1 Discovery', account: 'Tiktok Information Technologies UK Limited', oppName: 'TikTok Eudia Compliance Audit Opp', owner: 'Nathan Shine', acv: 696000, probability: 0.15, weighted: 104400, serviceLine: 'Compliance', closeDate: '2026-02-28', eudiaTech: true, term: 13 },
  { stage: 'Stage 1 Discovery', account: 'Tiktok Information Technologies UK Limited', oppName: 'TikTok Eudia Driven CaaS Procurement Solution', owner: 'Nathan Shine', acv: 348000, probability: 0.15, weighted: 52200, serviceLine: 'Contracting-BAU', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'Tiktok Information Technologies UK Limited', oppName: 'TikTok Litigation PM ODL', owner: 'Nathan Shine', acv: 125280, probability: 0.30, weighted: 37584, serviceLine: 'Litigation', closeDate: '2026-01-09', eudiaTech: true, term: 6 },
  { stage: 'Stage 1 Discovery', account: 'Tiktok Information Technologies UK Limited', oppName: 'TikTok OCM', owner: 'Nathan Shine', acv: 58000, probability: 0.15, weighted: 8700, serviceLine: 'Outside Counsel Management', closeDate: '2026-02-27', eudiaTech: true, term: 4 },
  { stage: 'Stage 1 Discovery', account: 'Tiktok Information Technologies UK Limited', oppName: 'TikTok Shop Contracting Solution Deal', owner: 'Nathan Shine', acv: 232000, probability: 0.15, weighted: 34800, serviceLine: 'Contracting-Repapering/ Remediation', closeDate: '2026-01-30', eudiaTech: true, term: 11 },
  { stage: 'Stage 1 Discovery', account: 'Tiktok Information Technologies UK Limited', oppName: 'TikTok Tech Enabled PM RFP', owner: 'Nathan Shine', acv: 522000, probability: 0.15, weighted: 78300, serviceLine: 'Other', closeDate: '2026-01-30', eudiaTech: true, term: 11 },
  { stage: 'Stage 2 SQO (Sales Qualified Op)', account: 'Tiktok Information Technologies UK Limited', oppName: 'TikTok Tech Only Contracting Solution', owner: 'Nathan Shine', acv: 139200, probability: 0.30, weighted: 41760, serviceLine: 'Technology', closeDate: '2026-01-31', eudiaTech: true, term: 12 },
  { stage: 'Stage 1 Discovery', account: 'Tinder LLC', oppName: 'Tinder Outsourced Contract Solution Price Per Output', owner: 'Nathan Shine', acv: 58000, probability: 0.15, weighted: 8700, serviceLine: 'Contracting-BAU', closeDate: '2026-01-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 0 Qualifying', account: 'Transworld Business Advisors', oppName: 'Transworld Business Advisors DD & Contracting', owner: 'Conor Molloy', acv: 0, probability: 0.02, weighted: 0, serviceLine: 'Contracting-Technology', closeDate: '2025-12-31', eudiaTech: true, term: 1 },
  { stage: 'Stage 1 Discovery', account: 'Udemy Ireland Limited', oppName: 'Udemy Contracting Solution Secondments', owner: 'Nathan Shine', acv: 348000, probability: 0.15, weighted: 52200, serviceLine: 'Contracting-Technology', closeDate: '2026-03-31', eudiaTech: true, term: 11 },
  { stage: 'Stage 1 Discovery', account: 'Udemy Ireland Limited', oppName: 'Udemy Sigma Deal', owner: 'Nathan Shine', acv: 139200, probability: 0.15, weighted: 20880, serviceLine: 'Technology', closeDate: '2026-02-28', eudiaTech: true, term: 13 },
  { stage: 'Stage 1 Discovery', account: 'Waystone', oppName: 'Waystone Contracting', owner: 'Conor Molloy', acv: 92800, probability: 0.15, weighted: 13920, serviceLine: 'Contracting', closeDate: '2025-12-19', eudiaTech: true, term: 11 },
  { stage: 'Stage 5 - Negotiation', account: 'Wellspring Philanthropic Fund', oppName: 'Wellspring Philanthropic Fund - Design phase', owner: 'Conor Molloy', acv: 116000, probability: 0.70, weighted: 81200, serviceLine: 'Technology', closeDate: '2025-12-05', eudiaTech: true, term: 2 },
  { stage: 'Stage 4 - Proposal', account: 'Zyte', oppName: 'Zyte - ODL Secondment - 10 months', owner: 'Conor Molloy', acv: 127600, probability: 0.60, weighted: 76560, serviceLine: 'Contracting-Technology', closeDate: '2025-12-31', eudiaTech: true, term: 9 }
];

// Closed Won Nov-Dec 2024 (retained from previous data)
const closedWonNovDec = [
  { stage: 'Closed Won', account: 'Airbnb', oppName: 'Airbnb Privacy Support - Replacement ODL - Erica Gomes', owner: 'Nathan Shine', acv: 35844, term: 4, serviceLine: 'Privacy-General Support', closeDate: '2024-11-12', eudiaTech: false },
  { stage: 'Closed Won', account: 'Aramark Ireland', oppName: 'Aramark Paralegal Support', owner: 'Nathan Shine', acv: 8700, term: 1, serviceLine: 'Contracting', closeDate: '2024-11-21', eudiaTech: false },
  { stage: 'Closed Won', account: 'Aryza', oppName: 'Aryza - ODL Secondment - 2 years', owner: 'Conor Molloy', acv: 226200, term: 24, serviceLine: 'Contracting-Technology', closeDate: '2024-11-12', eudiaTech: true },
  { stage: 'Closed Won', account: 'Datalex (Ireland) Limited', oppName: 'Datalex ODL support Ronan Lupton Extension', owner: 'Nathan Shine', acv: 102544, term: 13, serviceLine: 'Contracting-BAU', closeDate: '2024-11-25', eudiaTech: false },
  { stage: 'Closed Won', account: 'Glanbia Management Services Limited', oppName: 'Glanbia Secondment Extension', owner: 'Nathan Shine', acv: 88044, term: 13, serviceLine: 'Contracting-BAU', closeDate: '2024-11-12', eudiaTech: false },
  { stage: 'Closed Won', account: 'Kellogg Europe Trading Limited', oppName: 'Kellanova ODL Transactions Julie Collins\' team', owner: 'Olivia Jung', acv: 8352, term: 1, serviceLine: 'Contracting-BAU', closeDate: '2024-11-25', eudiaTech: false },
  { stage: 'Closed Won', account: 'Kingspan', oppName: 'Kingspan ODL Contracts Project', owner: 'Nathan Shine', acv: 8120, term: 0, serviceLine: 'Contracting-BAU', closeDate: '2024-11-07', eudiaTech: false },
  { stage: 'Closed Won', account: 'OpenAI', oppName: 'OpenAI privacy team expansion - additional consultant', owner: 'Alex Fox', acv: 52200, term: 3, serviceLine: 'Privacy', closeDate: '2024-11-04', eudiaTech: false },
  { stage: 'Closed Won', account: 'OpenAI', oppName: 'OpenAI - Privacy Team Expansion - Elizabeth Agbaje', owner: 'Alex Fox', acv: 41412, term: 3, serviceLine: 'Privacy', closeDate: '2024-11-11', eudiaTech: false },
  { stage: 'Closed Won', account: 'OpenAI', oppName: 'OpenAI Privacy Team Expansion - Nerea Perez', owner: 'Alex Fox', acv: 41412, term: 3, serviceLine: 'Privacy', closeDate: '2024-11-11', eudiaTech: false }
];

// Last update timestamp
const lastUpdate = {
  date: '2025-12-12',
  time: '10:00 AM PST',
  source: 'Johnson Hana Pipeline_Weekly_11.11 (updated 12.5)'
};

// Johnson Hana Signed Logos by Period (from Excel: first revenue appearance = sign month)
// FY2025 starts August 2024 for JH
// Accounts with values in column C (1/1/) were signed before FY2025
const jhSignedLogos = {
  // FY2024 (signed before Aug 2024) - accounts with values in column C
  fy2024: [
    'ACS', 'Airbnb', 'Airship', 'BOI', 'Coimisiún na Meán', 'CommScope', 'Consensys', 
    'Datalex', 'Dropbox', 'ESB', 'Etsy', 'Gilead', 'Glanbia', 'Indeed', 'Irish Water',
    'Kellanova', 'Kingspan', 'Northern Trust', 'OpenAI', 'Orsted', 'Perrigo', 'Sisk',
    'Stripe', 'Taoglas', 'Teamwork', 'TikTok', 'Tinder', 'Udemy', 'Coillte', 'Coleman Legal',
    'Creed McStay', 'DCEDIY', 'Hayes', 'NTMA'
  ],
  // Q1 FY2025 (Aug-Sep 2024)
  q1fy2025: [],
  // Q2 FY2025 (Oct-Nov-Dec 2024)
  q2fy2025: ['Aryza'], // First value in November column
  // Q3 FY2025 (Jan-Feb-Mar 2025)
  q3fy2025: [],
  // Q4 FY2025 (Apr-May-Jun-Jul 2025 - future)
  q4fy2025: []
};

/**
 * Get Johnson Hana signed logos by fiscal period (for blending with EUDIA)
 */
function getJHSignedLogosByPeriod() {
  return {
    fy2024Total: jhSignedLogos.fy2024.length,
    q1fy2025: jhSignedLogos.q1fy2025,
    q2fy2025: jhSignedLogos.q2fy2025,
    q3fy2025: jhSignedLogos.q3fy2025,
    q4fy2025: jhSignedLogos.q4fy2025,
    // Map to EUDIA's period format
    byPeriod: {
      'FY2024 Total': jhSignedLogos.fy2024.length,
      'Q1 FY2025': jhSignedLogos.q1fy2025.length,
      'Q2 FY2025': jhSignedLogos.q2fy2025.length,
      'Q3 FY2025': jhSignedLogos.q3fy2025.length,
      'Q4 FY2025 (to date)': jhSignedLogos.q4fy2025.length
    },
    allLogos: [
      ...jhSignedLogos.fy2024,
      ...jhSignedLogos.q1fy2025,
      ...jhSignedLogos.q2fy2025,
      ...jhSignedLogos.q3fy2025,
      ...jhSignedLogos.q4fy2025
    ],
    total: jhSignedLogos.fy2024.length + 
           jhSignedLogos.q1fy2025.length + 
           jhSignedLogos.q2fy2025.length + 
           jhSignedLogos.q3fy2025.length + 
           jhSignedLogos.q4fy2025.length
  };
}

// Pipeline totals - calculated from activePipeline array (updated 12.5)
const pipelineTotals = {
  totalRecords: 81,
  totalACV: 11309837,  // $11.3m - sum of all active pipeline
  totalWeightedACV: 4389278,  // $4.4m weighted
  eudiaTechCount: 40
};

/**
 * Get Johnson Hana pipeline summary
 * 
 * DEPRECATED: As of Dec 10, 2025, Johnson Hana opportunities have been migrated
 * to the Eudia Salesforce instance. This function now returns empty/zero data
 * to prevent double-counting in the dashboard.
 * 
 * For Johnson Hana opportunities, use the custom "Johnson_Hana_Account_Owner__c" 
 * field on Opportunity to get the original owner (instead of "Keigan Pesenti").
 */
function getJohnsonHanaSummary() {
  // DISABLED: JH data now lives in Eudia Salesforce
  // Return empty data to prevent double-counting
  return {
    totalOpportunities: 0,
    totalPipeline: 0,
    totalWeighted: 0,
    closedDealsCount: 0,
    closedTotal: 0,
    uniqueAccounts: 0,
    lastUpdate: 'Migrated to Salesforce - Dec 10, 2025',
    pipeline: [], // Empty - use Salesforce data
    eudiaTech: {
      opportunityCount: 0,
      pipelineValue: 0,
      weightedValue: 0,
      closedValue: 0,
      percentOfOpps: 0,
      percentOfValue: 0
    },
    byStage: {},
    byOwner: {}
  };
  
  /* ORIGINAL CODE - Preserved for reference
  const totalPipeline = pipelineTotals.totalACV;
  const totalWeighted = pipelineTotals.totalWeightedACV;
  const closedTotal = closedWonNovDec.reduce((sum, o) => sum + o.acv, 0);
  const eudiaTechOpps = activePipeline.filter(o => o.eudiaTech);
  const eudiaTechPipeline = eudiaTechOpps.reduce((sum, o) => sum + o.acv, 0);
  const eudiaTechWeighted = eudiaTechOpps.reduce((sum, o) => sum + o.weighted, 0);
  const eudiaTechClosed = closedWonNovDec.filter(o => o.eudiaTech).reduce((sum, o) => sum + o.acv, 0);
  const byStage = {};
  activePipeline.forEach(o => {
    const mappedStage = mapStage(o.stage);
    if (!byStage[mappedStage]) byStage[mappedStage] = { count: 0, totalACV: 0, weighted: 0 };
    byStage[mappedStage].count++;
    byStage[mappedStage].totalACV += o.acv;
    byStage[mappedStage].weighted += o.weighted;
  });
  const uniqueAccounts = [...new Set(activePipeline.map(o => o.account))];
  const byOwner = {};
  activePipeline.forEach(o => {
    if (!byOwner[o.owner]) byOwner[o.owner] = { count: 0, acv: 0, weighted: 0 };
    byOwner[o.owner].count++;
    byOwner[o.owner].acv += o.acv;
    byOwner[o.owner].weighted += o.weighted;
  });
  return {
    totalOpportunities: activePipeline.length,
    totalPipeline,
    totalWeighted,
    closedDealsCount: closedWonNovDec.length,
    closedTotal,
    uniqueAccounts: uniqueAccounts.length,
    lastUpdate,
    pipeline: activePipeline,
    eudiaTech: {
      opportunityCount: eudiaTechOpps.length,
      pipelineValue: eudiaTechPipeline,
      weightedValue: eudiaTechWeighted,
      closedValue: eudiaTechClosed,
      percentOfOpps: Math.round((eudiaTechOpps.length / activePipeline.length) * 100),
      percentOfValue: totalPipeline > 0 ? Math.round((eudiaTechPipeline / totalPipeline) * 100) : 0
    },
    byStage,
    byOwner
  };
  */
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
 * DEPRECATED: JH data now in Salesforce - return empty array
 */
function getAccountSummaries() {
  // DISABLED: JH data now lives in Eudia Salesforce
  return [];
}

// EUDIA November ARR (Active Revenue as of Nov 2025 - from source file)
const eudiaNovemberARR = {
  'Bayer': 300000,
  'Cargill': 1400000, // 1,250,000 + 150,000 (combined)
  'Chevron': 1200000,
  'Coherent': 1541667, // 391,667 + 1,150,000 (combined)
  'Delinea': 120000,
  'DHL North America': 250000,
  'Duracell': 395000,
  'ECMS': 360000,
  'Gov - DOD': 830287,
  'Graybar Electric': 300000,
  'IQVIA': 300000,
  'Toshiba US': 166667,
  'Asana': 75000,
  'Intuit': 75000,
  'Novelis': 90000,
  'Peregrine Hospitality': 42000,
  'Sandbox': 8975,
  'Spark Brighter Thinking': 6500
};

// Johnson Hana November ARR (Active Revenue as of Nov 2025)
const jhNovemberARR = {
  'ACS': 156453,
  'Airbnb': 211907,
  'Airship': 166528,
  'Aryza': 104080,
  'BOI': 1652400,
  'Coimisiún na Meán': 389675,
  'CommScope': 158201,
  'Consensys': 79101,
  'Datalex': 104913,
  'Dropbox': 222037,
  'ESB': 473355,
  'Etsy': 304330,
  'Gilead': 186511,
  'Glanbia': 90341,
  'Indeed': 417846,
  'Irish Water': 440882,
  'Kellanova': 150291,
  'Kingspan': 97086,
  'Northern Trust': 145712,
  'OpenAI': 1537052,
  'Orsted': 104080,
  'Perrigo': 127394,
  'Sisk': 69387,
  'Stripe': 1223979,
  'Taoglas': 60783,
  'Teamwork': 70358,
  'TikTok': 208160,
  'Tinder': 228976,
  'Udemy': 533722,
  'Coillte': 194838,
  'Coleman Legal': 16653,
  'Creed McStay': 38804,
  'DCEDIY': 37153,
  'Hayes': 69387,
  'NTMA': 170691
};

// Out-House November ARR (Meta - signed Oct 2025)
const outHouseNovemberARR = {
  'Meta': 1558211
};
    
// Calculate totals
const eudiaNovemberARRTotal = Object.values(eudiaNovemberARR).reduce((sum, val) => sum + val, 0);
const jhNovemberARRTotal = Object.values(jhNovemberARR).reduce((sum, val) => sum + val, 0);
const outHouseNovemberARRTotal = Object.values(outHouseNovemberARR).reduce((sum, val) => sum + val, 0);
const totalNovemberARR = eudiaNovemberARRTotal + jhNovemberARRTotal + outHouseNovemberARRTotal;

function getJHNovemberARR() {
  return jhNovemberARR;
}

function getJHNovemberARRTotal() {
  return jhNovemberARRTotal;
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
  getAccountSummaries,
  getJHSignedLogosByPeriod,
  jhSignedLogos,
  lastUpdate,
  eudiaNovemberARR,
  eudiaNovemberARRTotal,
  jhNovemberARR,
  jhNovemberARRTotal,
  outHouseNovemberARR,
  outHouseNovemberARRTotal,
  totalNovemberARR
};
