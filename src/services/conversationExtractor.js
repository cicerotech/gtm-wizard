/**
 * conversationExtractor.js
 * 
 * Enhanced LLM extraction service for Sales and CS call analytics.
 * Provides deep extraction of pain points, objections, signals, and trends.
 * 
 * @author GTM Brain
 * @date February 2026
 */

const logger = require('../utils/logger');
const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ═══════════════════════════════════════════════════════════════════════════
// SALES CALL EXTRACTION PROMPT
// ═══════════════════════════════════════════════════════════════════════════

const SALES_EXTRACTION_PROMPT = `You are an expert sales analyst for Eudia, a legal AI startup engaging with Fortune 500 legal departments.
Analyze this sales call transcript and extract structured intelligence.

## EXTRACTION REQUIREMENTS

### 1. Pain Points (categorize by type)
Extract customer pain points with exact quotes. Categories:
- **legal**: Contract review bottleneck, compliance burden, litigation costs
- **efficiency**: Manual processes, slow turnaround, resource constraints
- **cost**: Budget pressure, headcount limits, outside counsel spend
- **risk**: Regulatory exposure, audit findings, contract risk

### 2. Buying Signals
Extract positive buying indicators:
- Budget mentions ("we have budget", "approved for Q2")
- Timeline urgency ("need this by", "board deadline")
- Decision process clarity ("legal ops owns this", "CLO decides")
- Champion indicators ("I'll push for this internally")

### 3. Objections (with handling assessment)
For each objection:
- Exact quote of the objection
- Whether rep handled it effectively (true/false)
- How it was handled (if applicable)

### 4. Value Resonance
Which value propositions got positive customer responses:
- Time savings
- Cost reduction
- Risk mitigation
- Competitive advantage
Include evidence of resonance (customer response)

### 5. Competitive Intelligence
Competitor mentions with context and sentiment:
- Which competitors mentioned
- How they're positioned
- Customer perception (positive/negative/neutral)

### 6. MEDDICC Signals
Rate each element 0-100 confidence with evidence:
- M (Metrics): Quantified value/pain
- E (Economic Buyer): Decision maker identified
- D (Decision Criteria): Evaluation factors known
- D (Decision Process): Steps/timeline clear
- I (Identify Pain): Pain articulated clearly
- C (Champion): Internal advocate present
- C (Competition): Competitive landscape clear

### 7. Entities & Keywords
Extract:
- Products mentioned (Eudia products, competitor products)
- Companies referenced
- People mentioned (names, titles)
- Legal terms used
- Key themes (with frequency and sentiment)

Return JSON in this exact format:
{
  "painPoints": [
    {"category": "legal|efficiency|cost|risk", "description": "...", "quote": "exact quote", "severity": "high|medium|low"}
  ],
  "buyingSignals": [
    {"type": "budget|timeline|process|champion", "signal": "...", "quote": "exact quote", "strength": "strong|moderate|weak"}
  ],
  "objections": [
    {"objection": "...", "quote": "exact quote", "handled": true|false, "handling": "how it was addressed"}
  ],
  "valueResonance": [
    {"proposition": "...", "customerResponse": "...", "sentiment": "positive|neutral|negative"}
  ],
  "competitiveIntel": [
    {"competitor": "name", "context": "...", "sentiment": "positive|neutral|negative", "quote": "..."}
  ],
  "meddicc": {
    "metrics": {"confidence": 0-100, "evidence": "...", "quote": "..."},
    "economicBuyer": {"confidence": 0-100, "identified": "name/title or null", "evidence": "..."},
    "decisionCriteria": {"confidence": 0-100, "criteria": ["..."], "evidence": "..."},
    "decisionProcess": {"confidence": 0-100, "steps": ["..."], "timeline": "...", "evidence": "..."},
    "identifyPain": {"confidence": 0-100, "pains": ["..."], "evidence": "..."},
    "champion": {"confidence": 0-100, "identified": "name/title or null", "evidence": "..."},
    "competition": {"confidence": 0-100, "competitors": ["..."], "evidence": "..."}
  },
  "entities": {
    "products": ["..."],
    "companies": ["..."],
    "people": [{"name": "...", "title": "...", "role": "customer|rep"}],
    "legalTerms": ["..."]
  },
  "keywords": [
    {"term": "...", "count": 0, "sentiment": -1.0 to 1.0}
  ],
  "overallSentiment": -1.0 to 1.0,
  "dealHealth": "healthy|at_risk|stalled",
  "summary": "2-3 sentence executive summary"
}`;

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER SUCCESS CALL EXTRACTION PROMPT
// ═══════════════════════════════════════════════════════════════════════════

const CS_EXTRACTION_PROMPT = `You are an expert Customer Success analyst for Eudia, a legal AI startup with Fortune 500 customers.
Analyze this customer success call transcript and extract actionable intelligence for retention and expansion.

## EXTRACTION REQUIREMENTS

### 1. Product Issues & Bugs
Extract any technical issues mentioned:
- **blocking**: Prevents core workflow, needs immediate fix
- **annoying**: Friction but workaround exists
- **minor**: Nice-to-have improvement

### 2. Feature Requests
Extract feature requests with business justification:
- What feature is requested
- Why they need it (business case)
- Priority/urgency

### 3. Adoption Blockers
What's preventing full adoption:
- **training**: Need more user education
- **integration**: Technical integration challenges
- **workflow**: Doesn't fit current process
- **change_management**: Internal resistance

### 4. Positive Feedback
What's working well - capture wins for reference:
- Features they love
- Value they've realized
- Quotes for testimonials

### 5. Risk Indicators
Early warning signs for churn:
- Frustration expressions
- Competitor mentions
- Renewal concerns
- Usage decline mentions
- Executive sponsor changes

### 6. Expansion Opportunities
Signals for upsell/cross-sell:
- New use cases mentioned
- Additional teams/users
- New products of interest
- Budget availability

### 7. Health Score Inputs
Rate overall relationship health:
- Engagement level (active/passive/disengaged)
- Satisfaction sentiment
- Advocacy likelihood

Return JSON in this exact format:
{
  "productIssues": [
    {"issue": "...", "severity": "blocking|annoying|minor", "quote": "...", "area": "product area"}
  ],
  "featureRequests": [
    {"feature": "...", "businessJustification": "...", "priority": "high|medium|low", "quote": "..."}
  ],
  "adoptionBlockers": [
    {"blocker": "...", "type": "training|integration|workflow|change_management", "quote": "..."}
  ],
  "positiveFeedback": [
    {"feedback": "...", "feature": "...", "quote": "...", "testimonialWorthy": true|false}
  ],
  "riskIndicators": [
    {"indicator": "...", "severity": "high|medium|low", "type": "frustration|competitor|renewal|usage|sponsor", "quote": "..."}
  ],
  "expansionOpportunities": [
    {"opportunity": "...", "type": "users|teams|products|useCase", "quote": "...", "readiness": "hot|warm|future"}
  ],
  "healthScore": {
    "engagement": "active|passive|disengaged",
    "satisfaction": -1.0 to 1.0,
    "advocacyLikelihood": "promoter|passive|detractor",
    "overallHealth": "healthy|at_risk|critical",
    "riskLevel": 0-100
  },
  "painPoints": [
    {"category": "product|process|support|value", "description": "...", "quote": "..."}
  ],
  "entities": {
    "products": ["..."],
    "teams": ["teams/departments mentioned"],
    "people": [{"name": "...", "title": "...", "role": "stakeholder type"}]
  },
  "keywords": [
    {"term": "...", "count": 0, "sentiment": -1.0 to 1.0}
  ],
  "escalationNeeded": true|false,
  "escalationReason": "reason if true",
  "followUpActions": ["action1", "action2"],
  "summary": "2-3 sentence executive summary"
}`;

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract comprehensive analytics from a sales call transcript
 * @param {string} transcript - Full transcript text
 * @param {Object} context - Optional context (account, rep info)
 * @returns {Object} Extracted sales intelligence
 */
async function extractSalesAnalytics(transcript, context = {}) {
  if (!anthropic) {
    logger.error('Anthropic not configured for sales extraction');
    return { success: false, error: 'Anthropic API key not configured' };
  }

  try {
    const startTime = Date.now();
    
    let userPrompt = `Analyze this sales call transcript:\n\n`;
    if (context.accountName) {
      userPrompt += `Customer Account: ${context.accountName}\n`;
    }
    if (context.repName) {
      userPrompt += `Sales Rep: ${context.repName}\n`;
    }
    userPrompt += `\n---TRANSCRIPT---\n${transcript}\n---END TRANSCRIPT---`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: SALES_EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const content = response.content[0]?.text || '{}';
    const analytics = JSON.parse(content);
    
    const duration = Date.now() - startTime;
    logger.info(`[SalesExtraction] Completed in ${duration}ms`);

    return {
      success: true,
      callType: 'sales',
      ...analytics,
      extractionTime: duration
    };

  } catch (error) {
    logger.error('[SalesExtraction] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Extract comprehensive analytics from a CS call transcript
 * @param {string} transcript - Full transcript text
 * @param {Object} context - Optional context (account, CSM info)
 * @returns {Object} Extracted CS intelligence
 */
async function extractCSAnalytics(transcript, context = {}) {
  if (!anthropic) {
    logger.error('Anthropic not configured for CS extraction');
    return { success: false, error: 'Anthropic API key not configured' };
  }

  try {
    const startTime = Date.now();
    
    let userPrompt = `Analyze this customer success call transcript:\n\n`;
    if (context.accountName) {
      userPrompt += `Customer Account: ${context.accountName}\n`;
    }
    if (context.csmName) {
      userPrompt += `CSM: ${context.csmName}\n`;
    }
    userPrompt += `\n---TRANSCRIPT---\n${transcript}\n---END TRANSCRIPT---`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: CS_EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const content = response.content[0]?.text || '{}';
    const analytics = JSON.parse(content);
    
    const duration = Date.now() - startTime;
    logger.info(`[CSExtraction] Completed in ${duration}ms`);

    return {
      success: true,
      callType: 'cs',
      ...analytics,
      extractionTime: duration
    };

  } catch (error) {
    logger.error('[CSExtraction] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Auto-detect call type and extract appropriate analytics
 * @param {string} transcript - Full transcript text
 * @param {Object} context - Context with user group info
 * @returns {Object} Extracted analytics
 */
async function extractAnalytics(transcript, context = {}) {
  // Determine call type based on user group or explicit setting
  let callType = context.callType;
  
  if (!callType) {
    // Auto-detect based on user group
    if (context.userGroup === 'cs') {
      callType = 'cs';
    } else if (['bl', 'sales_leader'].includes(context.userGroup)) {
      callType = 'sales';
    } else {
      // Default to sales for unknown
      callType = 'sales';
    }
  }
  
  if (callType === 'cs') {
    return await extractCSAnalytics(transcript, context);
  } else {
    return await extractSalesAnalytics(transcript, context);
  }
}

/**
 * Extract entities and keywords from a transcript
 * Lightweight extraction for quick tagging
 * @param {string} transcript - Transcript text
 * @returns {Object} Entities and keywords
 */
async function extractEntitiesAndKeywords(transcript) {
  if (!anthropic) {
    return { success: false, error: 'Anthropic not configured' };
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `Extract entities and keywords from this sales/CS call transcript.
Return JSON:
{
  "entities": {
    "products": ["Eudia products mentioned"],
    "competitors": ["competitor products/companies"],
    "companies": ["customer companies mentioned"],
    "people": [{"name": "...", "title": "if mentioned", "company": "if known"}],
    "legalTerms": ["MSA", "NDA", etc.]
  },
  "keywords": [
    {"term": "key topic", "count": frequency, "sentiment": -1.0 to 1.0}
  ],
  "themes": ["main themes of the conversation"]
}`,
      messages: [{ role: 'user', content: transcript.substring(0, 15000) }]
    });

    const content = response.content[0]?.text || '{}';
    return { success: true, ...JSON.parse(content) };

  } catch (error) {
    logger.error('[EntityExtraction] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Aggregate pain points from multiple calls
 * @param {Array} painPointsArrays - Array of pain point arrays from different calls
 * @returns {Object} Aggregated and ranked pain points
 */
function aggregatePainPoints(painPointsArrays) {
  const aggregated = {};
  
  for (const painPoints of painPointsArrays) {
    if (!Array.isArray(painPoints)) continue;
    
    for (const pp of painPoints) {
      const key = pp.description?.toLowerCase().trim() || '';
      if (!key) continue;
      
      if (!aggregated[key]) {
        aggregated[key] = {
          description: pp.description,
          category: pp.category,
          count: 0,
          quotes: [],
          severities: []
        };
      }
      
      aggregated[key].count++;
      if (pp.quote) aggregated[key].quotes.push(pp.quote);
      if (pp.severity) aggregated[key].severities.push(pp.severity);
    }
  }
  
  // Convert to array and sort by count
  return Object.values(aggregated)
    .sort((a, b) => b.count - a.count)
    .map(pp => ({
      ...pp,
      averageSeverity: calculateAverageSeverity(pp.severities),
      exampleQuotes: pp.quotes.slice(0, 3)
    }));
}

/**
 * Calculate average severity from severity strings
 */
function calculateAverageSeverity(severities) {
  if (!severities || severities.length === 0) return 'medium';
  
  const scores = severities.map(s => {
    if (s === 'high' || s === 'blocking') return 3;
    if (s === 'medium' || s === 'annoying') return 2;
    return 1;
  });
  
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 2.5) return 'high';
  if (avg >= 1.5) return 'medium';
  return 'low';
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA SCIENCE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

// Lazy load callIntelligence to avoid circular dependency
let callIntelligence = null;
function getCallIntelligence() {
  if (!callIntelligence) {
    callIntelligence = require('./callIntelligence');
  }
  return callIntelligence;
}

/**
 * Store extracted analytics to data science tables
 * This enriches the database with keywords, entities, and patterns
 * @param {Object} analytics - Extracted analytics (from extractSalesAnalytics or extractCSAnalytics)
 * @param {Object} context - Call context (callId, accountId, repEmail)
 */
async function storeExtractedAnalytics(analytics, context) {
  const ci = getCallIntelligence();
  const { callId, accountId, repEmail } = context;
  
  if (!analytics || !analytics.success) {
    return { stored: false, reason: 'No analytics data' };
  }
  
  let storedCounts = { keywords: 0, entities: 0, patterns: 0 };
  
  try {
    // Store keywords
    if (analytics.keywords && Array.isArray(analytics.keywords)) {
      for (const kw of analytics.keywords) {
        ci.storeKeyword({
          term: kw.term,
          category: kw.category || 'general',
          sentiment: kw.sentiment || 0,
          callId,
          accountId,
          repEmail,
          context: kw.context
        });
        storedCounts.keywords++;
      }
    }
    
    // Store entities from various sources
    if (analytics.entities) {
      // Products
      for (const product of analytics.entities.products || []) {
        ci.storeEntity({
          type: 'product',
          name: product,
          callId,
          accountId,
          isCompetitor: false
        });
        storedCounts.entities++;
      }
      
      // Competitors
      for (const competitor of analytics.entities.competitors || []) {
        ci.storeEntity({
          type: 'company',
          name: competitor,
          callId,
          accountId,
          isCompetitor: true
        });
        storedCounts.entities++;
      }
      
      // Companies
      for (const company of analytics.entities.companies || []) {
        ci.storeEntity({
          type: 'company',
          name: company,
          callId,
          accountId,
          isCompetitor: false
        });
        storedCounts.entities++;
      }
      
      // People
      for (const person of analytics.entities.people || []) {
        ci.storeEntity({
          type: 'person',
          name: person.name || person,
          callId,
          accountId
        });
        storedCounts.entities++;
      }
      
      // Legal terms
      for (const term of analytics.entities.legalTerms || []) {
        ci.storeEntity({
          type: 'legal_term',
          name: term,
          callId,
          accountId
        });
        storedCounts.entities++;
      }
    }
    
    // Store competitive intel as patterns
    if (analytics.competitiveIntel && Array.isArray(analytics.competitiveIntel)) {
      for (const intel of analytics.competitiveIntel) {
        ci.storeEntity({
          type: 'company',
          name: intel.competitor,
          callId,
          context: intel.quote,
          sentiment: intel.sentiment === 'positive' ? 0.5 : intel.sentiment === 'negative' ? -0.5 : 0,
          accountId,
          isCompetitor: true
        });
      }
    }
    
    // Store pain points as patterns
    if (analytics.painPoints && Array.isArray(analytics.painPoints)) {
      for (const pp of analytics.painPoints) {
        ci.storePattern({
          type: 'pain_point',
          text: pp.description,
          exampleQuote: pp.quote,
          outcomeCorrelation: pp.severity === 'high' ? 0.7 : pp.severity === 'medium' ? 0.5 : 0.3
        });
        storedCounts.patterns++;
      }
    }
    
    // Store objections as patterns
    if (analytics.objections && Array.isArray(analytics.objections)) {
      for (const obj of analytics.objections) {
        ci.storePattern({
          type: 'objection',
          text: obj.objection,
          exampleQuote: obj.quote,
          outcomeCorrelation: obj.handled ? 0.8 : -0.3
        });
        storedCounts.patterns++;
      }
    }
    
    // Store feature requests as patterns (for CS calls)
    if (analytics.featureRequests && Array.isArray(analytics.featureRequests)) {
      for (const fr of analytics.featureRequests) {
        ci.storePattern({
          type: 'feature_request',
          text: fr.feature,
          exampleQuote: fr.quote || fr.businessJustification,
          outcomeCorrelation: fr.priority === 'high' ? 0.8 : 0.5
        });
        storedCounts.patterns++;
      }
    }
    
    // Store risk indicators as patterns (for CS calls)
    if (analytics.riskIndicators && Array.isArray(analytics.riskIndicators)) {
      for (const risk of analytics.riskIndicators) {
        ci.storePattern({
          type: 'risk_indicator',
          text: risk.indicator || risk.description,
          exampleQuote: risk.quote,
          outcomeCorrelation: -0.7 // Risk indicators negatively correlated with success
        });
        storedCounts.patterns++;
      }
    }
    
    // Store success factors (from value resonance)
    if (analytics.valueResonance && Array.isArray(analytics.valueResonance)) {
      for (const vr of analytics.valueResonance) {
        if (vr.sentiment === 'positive') {
          ci.storePattern({
            type: 'success_factor',
            text: vr.proposition,
            exampleQuote: vr.customerResponse,
            outcomeCorrelation: 0.85
          });
          storedCounts.patterns++;
        }
      }
    }
    
    logger.info(`[DataScience] Stored analytics: ${storedCounts.keywords} keywords, ${storedCounts.entities} entities, ${storedCounts.patterns} patterns`);
    return { stored: true, counts: storedCounts };
    
  } catch (error) {
    logger.error('[DataScience] Error storing analytics:', error);
    return { stored: false, error: error.message };
  }
}

/**
 * Extract and store all analytics for a call
 * Convenience function that extracts and stores in one call
 * @param {string} transcript - Call transcript
 * @param {Object} context - Call context
 * @returns {Object} Combined extraction and storage results
 */
async function extractAndStoreAnalytics(transcript, context) {
  // Extract analytics based on call type
  const analytics = await extractAnalytics(transcript, context);
  
  if (!analytics.success) {
    return analytics;
  }
  
  // Also extract entities and keywords
  const entityData = await extractEntitiesAndKeywords(transcript);
  
  // Merge entity data into analytics
  if (entityData.success) {
    analytics.entities = entityData.entities;
    if (!analytics.keywords) {
      analytics.keywords = entityData.keywords;
    } else {
      analytics.keywords = [...analytics.keywords, ...(entityData.keywords || [])];
    }
    analytics.themes = entityData.themes;
  }
  
  // Store to data science tables
  const storageResult = await storeExtractedAnalytics(analytics, context);
  
  return {
    ...analytics,
    storage: storageResult
  };
}

module.exports = {
  extractSalesAnalytics,
  extractCSAnalytics,
  extractAnalytics,
  extractEntitiesAndKeywords,
  aggregatePainPoints,
  storeExtractedAnalytics,
  extractAndStoreAnalytics,
  // Export prompts for customization
  SALES_EXTRACTION_PROMPT,
  CS_EXTRACTION_PROMPT
};
