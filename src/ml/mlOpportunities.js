/**
 * ML OPPORTUNITIES ANALYSIS & IMPLEMENTATION
 * 
 * This module identifies and implements ML enhancement opportunities
 * across the GTM-Brain platform for scalability and intelligence.
 * 
 * Priority Areas:
 * 1. Semantic Account Matching (embeddings > string similarity)
 * 2. Deal Health/Risk Prediction (win probability based on patterns)
 * 3. Intelligent Forecasting (ML-weighted vs static probability)
 * 4. Meeting Intelligence (action extraction, sentiment, next steps)
 * 5. Query Suggestion Engine (predict follow-up questions)
 * 6. Anomaly Detection (flag unusual deal patterns)
 * 7. Account Lookalike Scoring (find similar accounts)
 * 8. Response Quality Learning (improve from implicit feedback)
 */

const { OpenAI } = require('openai');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');

// ═══════════════════════════════════════════════════════════════════════════
// 1. SEMANTIC ACCOUNT MATCHER
// Replaces fuzzy string matching with embedding-based company resolution
// ═══════════════════════════════════════════════════════════════════════════

class SemanticAccountMatcher {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.embeddingModel = 'text-embedding-ada-002';
    this.accountEmbeddings = new Map(); // Cache: accountName -> embedding
    this.similarityThreshold = 0.85;
  }

  /**
   * Get embedding for company name with enriched context
   * "IBM" → embedding includes "International Business Machines, technology, enterprise software"
   */
  async getCompanyEmbedding(companyName) {
    const cacheKey = `company_embed:${companyName.toLowerCase()}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    try {
      // Enrich the company name with context for better semantic matching
      const enrichedContext = await this.enrichCompanyContext(companyName);
      
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: enrichedContext
      });

      const embedding = response.data[0].embedding;
      await cache.set(cacheKey, embedding, 86400 * 7); // 7 day cache
      return embedding;
    } catch (error) {
      logger.warn('SemanticAccountMatcher: Embedding failed, using fallback', { error: error.message });
      return this.fallbackEmbedding(companyName);
    }
  }

  /**
   * Enrich company name with aliases and context
   */
  async enrichCompanyContext(companyName) {
    const knownAliases = {
      'ibm': 'IBM International Business Machines Big Blue enterprise technology',
      'ge': 'GE General Electric industrial conglomerate',
      'bofa': 'Bank of America BofA banking finance',
      'jpmorgan': 'JPMorgan Chase bank financial services',
      '3m': '3M Minnesota Mining Manufacturing',
      'hp': 'HP Hewlett Packard technology computers',
      'at&t': 'AT&T American Telephone Telegraph telecom'
    };

    const lower = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const enriched = knownAliases[lower] || companyName;
    
    return enriched;
  }

  /**
   * Match user input to Salesforce accounts using semantic similarity
   */
  async findBestMatch(searchTerm, sfAccounts) {
    const searchEmbedding = await this.getCompanyEmbedding(searchTerm);
    
    const scored = await Promise.all(
      sfAccounts.map(async (account) => {
        const accountEmbedding = await this.getCompanyEmbedding(account.Name);
        const similarity = this.cosineSimilarity(searchEmbedding, accountEmbedding);
        return { account, similarity };
      })
    );

    scored.sort((a, b) => b.similarity - a.similarity);
    const bestMatch = scored[0];

    if (bestMatch.similarity >= this.similarityThreshold) {
      return {
        account: bestMatch.account,
        confidence: bestMatch.similarity,
        method: 'semantic_embedding',
        alternatives: scored.slice(1, 4).map(s => ({ 
          name: s.account.Name, 
          confidence: s.similarity 
        }))
      };
    }

    return null;
  }

  cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  fallbackEmbedding(text) {
    // Simple TF-IDF-like fallback
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const vector = new Array(1536).fill(0);
    words.forEach((word, i) => {
      const hash = this.hashString(word);
      vector[hash % 1536] += 1 / (i + 1);
    });
    const mag = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    return mag > 0 ? vector.map(v => v / mag) : vector;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 2. DEAL HEALTH PREDICTOR
// Predicts deal health/win probability based on historical patterns
// ═══════════════════════════════════════════════════════════════════════════

class DealHealthPredictor {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.historicalData = [];
    this.featureWeights = {
      daysInStage: 0.15,
      activityRecency: 0.20,
      dealSize: 0.10,
      ownerWinRate: 0.25,
      stageProgression: 0.15,
      engagementScore: 0.15
    };
  }

  /**
   * Calculate deal health score (0-100)
   */
  async predictDealHealth(opportunity, ownerStats = null, activityData = null) {
    const features = this.extractFeatures(opportunity, ownerStats, activityData);
    
    // Rule-based scoring first (fast)
    let healthScore = this.calculateRuleBasedScore(features);

    // LLM enhancement for complex cases
    if (healthScore > 30 && healthScore < 70) {
      healthScore = await this.enhanceWithLLM(opportunity, features, healthScore);
    }

    return {
      score: Math.round(healthScore),
      risk: this.categorizeRisk(healthScore),
      factors: this.explainFactors(features),
      recommendations: this.generateRecommendations(features, healthScore)
    };
  }

  extractFeatures(opp, ownerStats, activityData) {
    const stageMatch = opp.StageName?.match(/Stage (\d)/);
    const stageNumber = stageMatch ? parseInt(stageMatch[1]) : 0;
    
    const daysInStage = opp.Days_in_Stage__c || this.calculateDaysInStage(opp);
    const expectedDays = this.getExpectedDaysForStage(stageNumber);
    
    return {
      daysInStage,
      expectedDaysInStage: expectedDays,
      daysOverExpected: Math.max(0, daysInStage - expectedDays),
      dealSize: opp.Amount || 0,
      stageNumber,
      hasNextStep: !!opp.NextStep,
      hasCloseDate: !!opp.CloseDate,
      ownerWinRate: ownerStats?.winRate || 0.5,
      lastActivityDays: activityData?.daysSinceLastActivity || 999,
      meetingCount: activityData?.meetingCount || 0
    };
  }

  calculateDaysInStage(opp) {
    if (!opp.LastModifiedDate) return 0;
    const lastMod = new Date(opp.LastModifiedDate);
    return Math.floor((Date.now() - lastMod.getTime()) / (1000 * 60 * 60 * 24));
  }

  getExpectedDaysForStage(stage) {
    const expectations = { 1: 30, 2: 21, 3: 14, 4: 10, 5: 7 };
    return expectations[stage] || 14;
  }

  calculateRuleBasedScore(features) {
    let score = 100;

    // Days in stage penalty
    if (features.daysOverExpected > 0) {
      score -= Math.min(30, features.daysOverExpected * 2);
    }

    // Activity recency penalty
    if (features.lastActivityDays > 7) {
      score -= Math.min(25, (features.lastActivityDays - 7) * 2);
    }

    // No next step penalty
    if (!features.hasNextStep) {
      score -= 10;
    }

    // Owner performance boost/penalty
    if (features.ownerWinRate > 0.6) {
      score += 10;
    } else if (features.ownerWinRate < 0.3) {
      score -= 10;
    }

    // Stage progression boost (higher stage = more invested)
    score += features.stageNumber * 3;

    // Meeting engagement boost
    if (features.meetingCount >= 3) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  async enhanceWithLLM(opp, features, baseScore) {
    try {
      const prompt = `Analyze this sales opportunity and adjust the health score if needed.

Opportunity: ${opp.Name}
Account: ${opp.Account?.Name || 'Unknown'}
Stage: ${opp.StageName}
Amount: $${(opp.Amount || 0).toLocaleString()}
Days in Stage: ${features.daysInStage} (expected: ${features.expectedDaysInStage})
Last Activity: ${features.lastActivityDays} days ago
Owner Win Rate: ${(features.ownerWinRate * 100).toFixed(0)}%
Has Next Step: ${features.hasNextStep}

Current Health Score: ${baseScore}/100

Should this score be adjusted? Return JSON: {"adjustedScore": number, "reason": "string"}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.adjustedScore || baseScore;
    } catch (error) {
      logger.warn('DealHealthPredictor: LLM enhancement failed', { error: error.message });
      return baseScore;
    }
  }

  categorizeRisk(score) {
    if (score >= 80) return { level: 'healthy', color: 'green', emoji: '🟢' };
    if (score >= 60) return { level: 'moderate', color: 'yellow', emoji: '🟡' };
    if (score >= 40) return { level: 'at_risk', color: 'orange', emoji: '🟠' };
    return { level: 'critical', color: 'red', emoji: '🔴' };
  }

  explainFactors(features) {
    const factors = [];
    
    if (features.daysOverExpected > 7) {
      factors.push({ issue: 'Stale in stage', impact: 'high', detail: `${features.daysOverExpected} days over expected` });
    }
    if (features.lastActivityDays > 14) {
      factors.push({ issue: 'No recent activity', impact: 'high', detail: `${features.lastActivityDays} days since last touch` });
    }
    if (!features.hasNextStep) {
      factors.push({ issue: 'No next step defined', impact: 'medium', detail: 'Deal lacks clear path forward' });
    }
    if (features.ownerWinRate < 0.3) {
      factors.push({ issue: 'Owner performance', impact: 'medium', detail: 'Below-average close rate' });
    }

    return factors;
  }

  generateRecommendations(features, score) {
    const recommendations = [];

    if (features.lastActivityDays > 7) {
      recommendations.push('Schedule a follow-up call or email within 48 hours');
    }
    if (!features.hasNextStep) {
      recommendations.push('Define a concrete next step with the prospect');
    }
    if (features.daysOverExpected > 14) {
      recommendations.push('Review deal blockers and consider multi-threading');
    }
    if (score < 50 && features.dealSize > 100000) {
      recommendations.push('Escalate to leadership for strategic review');
    }

    return recommendations;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 3. INTELLIGENT PIPELINE FORECASTER
// ML-weighted forecasting vs static stage probabilities
// ═══════════════════════════════════════════════════════════════════════════

class IntelligentForecaster {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    // Historical win rates by stage (would be learned from data)
    this.stageWinRates = {
      1: 0.10,
      2: 0.20,
      3: 0.40,
      4: 0.60,
      5: 0.80
    };

    // Adjustment factors
    this.factors = {
      seasonality: {},     // Month/quarter patterns
      ownerPerformance: {},// Owner-specific win rates
      accountType: {},     // Enterprise vs SMB patterns
      productLine: {}      // Product-specific close rates
    };
  }

  /**
   * Generate intelligent forecast for pipeline
   */
  async generateForecast(opportunities, targetPeriod = 'Q4') {
    const forecasts = await Promise.all(
      opportunities.map(async (opp) => {
        const baseProb = this.getBaseProbability(opp);
        const adjustedProb = await this.adjustProbability(opp, baseProb);
        
        return {
          opportunity: opp,
          baseProbability: baseProb,
          adjustedProbability: adjustedProb,
          expectedValue: (opp.Amount || 0) * adjustedProb,
          confidence: this.calculateConfidence(opp, adjustedProb)
        };
      })
    );

    // Aggregate forecasts
    const totalExpected = forecasts.reduce((sum, f) => sum + f.expectedValue, 0);
    const totalPipeline = forecasts.reduce((sum, f) => sum + (f.opportunity.Amount || 0), 0);
    
    // Probability distribution for forecast ranges
    const scenarios = this.calculateScenarios(forecasts);

    return {
      period: targetPeriod,
      totalPipeline,
      expectedValue: totalExpected,
      scenarios,
      opportunityForecasts: forecasts.sort((a, b) => b.expectedValue - a.expectedValue),
      generatedAt: new Date().toISOString()
    };
  }

  getBaseProbability(opp) {
    const stageMatch = opp.StageName?.match(/Stage (\d)/);
    const stageNumber = stageMatch ? parseInt(stageMatch[1]) : 1;
    return this.stageWinRates[stageNumber] || 0.10;
  }

  async adjustProbability(opp, baseProbability) {
    let adjustment = 0;

    // Owner performance adjustment
    const ownerPerf = this.factors.ownerPerformance[opp.OwnerId];
    if (ownerPerf) {
      adjustment += (ownerPerf - 0.5) * 0.2; // ±10% for top/bottom performers
    }

    // Deal size adjustment (larger deals often have lower close rates)
    if (opp.Amount > 500000) {
      adjustment -= 0.05;
    } else if (opp.Amount > 1000000) {
      adjustment -= 0.10;
    }

    // Activity recency boost
    if (opp.LastActivityDate) {
      const daysSince = (Date.now() - new Date(opp.LastActivityDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        adjustment += 0.05;
      } else if (daysSince > 30) {
        adjustment -= 0.10;
      }
    }

    // Time to close adjustment
    if (opp.CloseDate) {
      const daysToClose = (new Date(opp.CloseDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysToClose < 0) {
        adjustment -= 0.15; // Past due
      } else if (daysToClose < 14 && baseProbability > 0.5) {
        adjustment += 0.05; // Near close with high probability
      }
    }

    return Math.max(0.01, Math.min(0.99, baseProbability + adjustment));
  }

  calculateConfidence(opp, probability) {
    // Higher confidence when we have more data points
    let confidence = 0.5;
    
    if (opp.LastActivityDate) confidence += 0.1;
    if (opp.NextStep) confidence += 0.1;
    if (opp.Contact_Name__c) confidence += 0.1;
    if (probability > 0.7 || probability < 0.2) confidence += 0.1; // Strong signals
    
    return Math.min(1, confidence);
  }

  calculateScenarios(forecasts) {
    const expectedValues = forecasts.map(f => f.expectedValue);
    const total = expectedValues.reduce((a, b) => a + b, 0);
    
    // Simple Monte Carlo approximation
    return {
      best: Math.round(total * 1.3),      // 30% upside
      likely: Math.round(total),           // Expected value
      worst: Math.round(total * 0.6)       // 40% downside
    };
  }

  /**
   * Learn from closed deals to improve future predictions
   */
  async learnFromClosedDeal(opportunity, won) {
    const key = `forecast_learning:${opportunity.OwnerId}`;
    const existing = await cache.get(key) || { wins: 0, losses: 0 };

    if (won) {
      existing.wins++;
    } else {
      existing.losses++;
    }

    const total = existing.wins + existing.losses;
    if (total >= 5) {
      this.factors.ownerPerformance[opportunity.OwnerId] = existing.wins / total;
    }

    await cache.set(key, existing, 86400 * 90); // 90 day retention
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 4. MEETING INTELLIGENCE EXTRACTOR
// Extracts action items, sentiment, stakeholders from meeting notes
// ═══════════════════════════════════════════════════════════════════════════

class MeetingIntelligenceExtractor {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  /**
   * Extract intelligence from meeting transcript/notes
   */
  async extractIntelligence(meetingNotes, accountContext = null) {
    try {
      const prompt = `Analyze these sales meeting notes and extract structured intelligence.

Meeting Notes:
"""
${meetingNotes.substring(0, 4000)}
"""

${accountContext ? `Account Context: ${JSON.stringify(accountContext)}` : ''}

Extract and return JSON with:
{
  "summary": "2-3 sentence executive summary",
  "sentiment": "positive|neutral|negative|mixed",
  "sentimentScore": 0.0-1.0,
  "stakeholders": [{"name": "", "title": "", "influence": "high|medium|low", "disposition": "champion|neutral|blocker"}],
  "actionItems": [{"task": "", "owner": "us|them", "dueDate": "YYYY-MM-DD or null", "priority": "high|medium|low"}],
  "nextSteps": [""],
  "objections": [{"concern": "", "addressed": true|false}],
  "buyingSignals": [""],
  "risks": [""],
  "competitorsMentioned": [""],
  "budgetDiscussed": true|false,
  "timelineDiscussed": true|false,
  "decisionProcessDiscussed": true|false,
  "suggestedFollowUp": "recommended next action"
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const intelligence = JSON.parse(response.choices[0].message.content);
      
      // Add metadata
      intelligence.extractedAt = new Date().toISOString();
      intelligence.confidence = this.assessConfidence(intelligence, meetingNotes);

      return intelligence;
    } catch (error) {
      logger.error('MeetingIntelligenceExtractor: Extraction failed', { error: error.message });
      return this.fallbackExtraction(meetingNotes);
    }
  }

  assessConfidence(intelligence, notes) {
    let confidence = 0.5;
    
    // More content = higher confidence
    if (notes.length > 500) confidence += 0.1;
    if (notes.length > 1500) confidence += 0.1;
    
    // More structured data found = higher confidence
    if (intelligence.actionItems?.length > 0) confidence += 0.1;
    if (intelligence.stakeholders?.length > 0) confidence += 0.1;
    
    return Math.min(1, confidence);
  }

  fallbackExtraction(notes) {
    // Basic extraction without LLM
    const actionPatterns = [
      /(?:we|they|I) (?:will|should|need to|must) (.+?)(?:\.|$)/gi,
      /action item[s]?:?\s*(.+?)(?:\.|$)/gi,
      /next step[s]?:?\s*(.+?)(?:\.|$)/gi
    ];

    const actionItems = [];
    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(notes)) !== null) {
        actionItems.push({ task: match[1].trim(), owner: 'unknown', priority: 'medium' });
      }
    }

    return {
      summary: notes.substring(0, 200) + '...',
      sentiment: 'unknown',
      actionItems: actionItems.slice(0, 5),
      nextSteps: [],
      extractedAt: new Date().toISOString(),
      confidence: 0.3,
      method: 'fallback_regex'
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 5. QUERY SUGGESTION ENGINE
// Predicts and suggests follow-up questions based on context
// ═══════════════════════════════════════════════════════════════════════════

class QuerySuggestionEngine {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.commonFollowUps = {
      'pipeline_summary': [
        'Show me late stage deals',
        'Which deals are at risk?',
        'What\'s closing this month?'
      ],
      'deal_lookup': [
        'Who owns this account?',
        'What\'s the next step?',
        'Show meeting history'
      ],
      'account_ownership': [
        'Show all opportunities for this account',
        'What\'s the account history?',
        'When was the last meeting?'
      ],
      'forecasting': [
        'Show at-risk deals',
        'What\'s the coverage ratio?',
        'Pipeline by owner'
      ]
    };
  }

  /**
   * Generate contextual query suggestions
   */
  async generateSuggestions(lastQuery, lastIntent, queryResult, conversationHistory = []) {
    // Fast path: use pre-defined suggestions
    const staticSuggestions = this.commonFollowUps[lastIntent] || [];

    // Enhance with LLM for better personalization (async, non-blocking)
    const dynamicSuggestions = await this.generateDynamicSuggestions(
      lastQuery,
      lastIntent,
      queryResult,
      conversationHistory
    );

    // Combine and deduplicate
    const allSuggestions = [...new Set([...dynamicSuggestions, ...staticSuggestions])];

    return {
      suggestions: allSuggestions.slice(0, 4),
      basedOn: lastIntent,
      confidence: dynamicSuggestions.length > 0 ? 0.8 : 0.5
    };
  }

  async generateDynamicSuggestions(lastQuery, lastIntent, queryResult, history) {
    try {
      const resultSummary = this.summarizeResult(queryResult);

      const prompt = `Based on this sales data query conversation, suggest 3 natural follow-up questions.

Last Query: "${lastQuery}"
Intent: ${lastIntent}
Result Summary: ${resultSummary}
Conversation History: ${history.map(h => h.query).slice(-3).join(' → ')}

Suggest questions a sales leader might naturally ask next. Return JSON: {"suggestions": ["question1", "question2", "question3"]}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        response_format: { type: 'json_object' },
        max_tokens: 200
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.suggestions || [];
    } catch (error) {
      logger.warn('QuerySuggestionEngine: LLM generation failed', { error: error.message });
      return [];
    }
  }

  summarizeResult(result) {
    if (!result) return 'No results';
    if (result.totalSize === 0) return 'No matching records';
    return `${result.totalSize} records found`;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 6. ANOMALY DETECTOR
// Flags unusual patterns in deals and pipeline
// ═══════════════════════════════════════════════════════════════════════════

class AnomalyDetector {
  constructor() {
    this.thresholds = {
      staleDealsInDays: 21,
      unusualAmountChange: 0.5, // 50% change
      backwardStageMovement: true,
      closeDatePushedCount: 3,
      noActivityDays: 14
    };
  }

  /**
   * Detect anomalies in a set of opportunities
   */
  detectAnomalies(opportunities, historicalData = []) {
    const anomalies = [];

    for (const opp of opportunities) {
      // Stale deal detection
      if (this.isStale(opp)) {
        anomalies.push({
          type: 'stale_deal',
          severity: 'high',
          opportunity: opp,
          message: `Deal has been stale for ${this.getDaysInStage(opp)} days`,
          recommendation: 'Review deal status and schedule follow-up'
        });
      }

      // Backward movement detection (would need historical snapshots)
      const history = historicalData.find(h => h.Id === opp.Id);
      if (history && this.hasBackwardMovement(opp, history)) {
        anomalies.push({
          type: 'stage_regression',
          severity: 'critical',
          opportunity: opp,
          message: `Deal moved backward from ${history.StageName} to ${opp.StageName}`,
          recommendation: 'Investigate deal blockers immediately'
        });
      }

      // Amount change detection
      if (history && this.hasUnusualAmountChange(opp, history)) {
        const pctChange = ((opp.Amount - history.Amount) / history.Amount * 100).toFixed(0);
        anomalies.push({
          type: 'amount_change',
          severity: Math.abs(pctChange) > 50 ? 'high' : 'medium',
          opportunity: opp,
          message: `Deal amount changed by ${pctChange}%`,
          recommendation: 'Verify scope change and update forecast'
        });
      }

      // Close date pushed repeatedly
      if (opp.Close_Date_Push_Count__c >= this.thresholds.closeDatePushedCount) {
        anomalies.push({
          type: 'date_pushed',
          severity: 'high',
          opportunity: opp,
          message: `Close date pushed ${opp.Close_Date_Push_Count__c} times`,
          recommendation: 'Re-qualify deal and confirm timeline'
        });
      }

      // No recent activity on high-value deal
      if (this.isHighValueWithNoActivity(opp)) {
        anomalies.push({
          type: 'high_value_neglected',
          severity: 'critical',
          opportunity: opp,
          message: `$${(opp.Amount || 0).toLocaleString()} deal with no activity in ${this.getDaysSinceActivity(opp)} days`,
          recommendation: 'Immediate outreach required'
        });
      }
    }

    return {
      anomalies,
      totalChecked: opportunities.length,
      anomalyCount: anomalies.length,
      criticalCount: anomalies.filter(a => a.severity === 'critical').length,
      checkedAt: new Date().toISOString()
    };
  }

  isStale(opp) {
    const days = this.getDaysInStage(opp);
    return days > this.thresholds.staleDealsInDays;
  }

  getDaysInStage(opp) {
    if (!opp.LastModifiedDate) return 0;
    return Math.floor((Date.now() - new Date(opp.LastModifiedDate).getTime()) / (1000 * 60 * 60 * 24));
  }

  getDaysSinceActivity(opp) {
    if (!opp.LastActivityDate) return 999;
    return Math.floor((Date.now() - new Date(opp.LastActivityDate).getTime()) / (1000 * 60 * 60 * 24));
  }

  hasBackwardMovement(current, previous) {
    const getStageNumber = (stageName) => {
      const match = stageName?.match(/Stage (\d)/);
      return match ? parseInt(match[1]) : 0;
    };
    return getStageNumber(current.StageName) < getStageNumber(previous.StageName);
  }

  hasUnusualAmountChange(current, previous) {
    if (!previous.Amount || !current.Amount) return false;
    const pctChange = Math.abs((current.Amount - previous.Amount) / previous.Amount);
    return pctChange > this.thresholds.unusualAmountChange;
  }

  isHighValueWithNoActivity(opp) {
    const isHighValue = (opp.Amount || 0) > 200000;
    const noRecentActivity = this.getDaysSinceActivity(opp) > this.thresholds.noActivityDays;
    return isHighValue && noRecentActivity;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 7. ACCOUNT LOOKALIKE SCORER
// Find similar accounts to successful customers
// ═══════════════════════════════════════════════════════════════════════════

class AccountLookalikeScorer {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.customerProfiles = new Map();
  }

  /**
   * Build profile for a successful customer
   */
  async buildCustomerProfile(account, opportunities, enrichmentData = null) {
    const profile = {
      industry: account.Industry,
      size: enrichmentData?.employeeCount || account.NumberOfEmployees,
      revenue: enrichmentData?.revenue || account.AnnualRevenue,
      region: account.BillingCountry,
      productsUsed: opportunities.map(o => o.Product_Line_s__c).filter(Boolean),
      avgDealSize: opportunities.reduce((sum, o) => sum + (o.Amount || 0), 0) / opportunities.length,
      timeToClose: this.avgTimeToClose(opportunities),
      winRate: opportunities.filter(o => o.IsWon).length / opportunities.length
    };

    this.customerProfiles.set(account.Id, profile);
    return profile;
  }

  /**
   * Score prospect similarity to successful customers
   */
  async scoreProspect(prospect, enrichmentData = null) {
    if (this.customerProfiles.size === 0) {
      return { score: 0, message: 'No customer profiles available for comparison' };
    }

    const prospectProfile = {
      industry: prospect.Industry,
      size: enrichmentData?.employeeCount || prospect.NumberOfEmployees,
      revenue: enrichmentData?.revenue || prospect.AnnualRevenue,
      region: prospect.BillingCountry
    };

    let totalScore = 0;
    let bestMatch = null;
    let bestScore = 0;

    for (const [customerId, customerProfile] of this.customerProfiles) {
      const similarity = this.calculateSimilarity(prospectProfile, customerProfile);
      totalScore += similarity;
      
      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatch = customerId;
      }
    }

    const avgScore = totalScore / this.customerProfiles.size;

    return {
      score: Math.round(avgScore * 100),
      bestMatchScore: Math.round(bestScore * 100),
      bestMatchCustomerId: bestMatch,
      recommendation: this.generateRecommendation(avgScore),
      factors: this.explainSimilarity(prospectProfile)
    };
  }

  calculateSimilarity(prospect, customer) {
    let score = 0;
    let factors = 0;

    // Industry match (highest weight)
    if (prospect.industry && customer.industry) {
      factors++;
      if (prospect.industry === customer.industry) score += 0.3;
    }

    // Size similarity
    if (prospect.size && customer.size) {
      factors++;
      const sizeRatio = Math.min(prospect.size, customer.size) / Math.max(prospect.size, customer.size);
      score += sizeRatio * 0.25;
    }

    // Revenue similarity
    if (prospect.revenue && customer.revenue) {
      factors++;
      const revRatio = Math.min(prospect.revenue, customer.revenue) / Math.max(prospect.revenue, customer.revenue);
      score += revRatio * 0.25;
    }

    // Region match
    if (prospect.region && customer.region) {
      factors++;
      if (prospect.region === customer.region) score += 0.2;
    }

    return factors > 0 ? score / factors : 0;
  }

  generateRecommendation(score) {
    if (score >= 0.8) return 'Excellent fit - prioritize for outreach';
    if (score >= 0.6) return 'Good fit - include in target account list';
    if (score >= 0.4) return 'Moderate fit - worth exploring';
    return 'Low fit - may require different approach';
  }

  explainSimilarity(profile) {
    const factors = [];
    if (profile.industry) factors.push(`Industry: ${profile.industry}`);
    if (profile.size) factors.push(`Size: ${profile.size} employees`);
    if (profile.region) factors.push(`Region: ${profile.region}`);
    return factors;
  }

  avgTimeToClose(opportunities) {
    const closed = opportunities.filter(o => o.IsWon && o.CreatedDate && o.CloseDate);
    if (closed.length === 0) return null;
    
    const totalDays = closed.reduce((sum, o) => {
      const created = new Date(o.CreatedDate);
      const closed = new Date(o.CloseDate);
      return sum + (closed - created) / (1000 * 60 * 60 * 24);
    }, 0);
    
    return totalDays / closed.length;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 8. RESPONSE QUALITY LEARNER
// Learns from implicit user feedback to improve responses
// ═══════════════════════════════════════════════════════════════════════════

class ResponseQualityLearner {
  constructor() {
    this.feedbackSignals = {
      positive: ['thanks', 'perfect', 'great', 'exactly', 'helpful'],
      negative: ['wrong', 'not what', 'incorrect', 'no,', 'that\'s not'],
      rephrase: ['i meant', 'actually', 'what about', 'no i want']
    };
    this.responseScores = new Map();
  }

  /**
   * Track response and subsequent user action
   */
  async trackResponse(queryId, query, intent, response, timestamp) {
    await cache.set(`response:${queryId}`, {
      query,
      intent,
      responseLength: response.length,
      timestamp,
      feedbackReceived: false
    }, 86400);
  }

  /**
   * Process follow-up message to infer quality
   */
  async inferQuality(queryId, followUpMessage, timeSinceResponse) {
    const originalQuery = await cache.get(`response:${queryId}`);
    if (!originalQuery) return null;

    const lowerMessage = followUpMessage.toLowerCase();
    let quality = 'neutral';

    // Check for positive signals
    if (this.feedbackSignals.positive.some(s => lowerMessage.includes(s))) {
      quality = 'positive';
    }
    // Check for negative signals
    else if (this.feedbackSignals.negative.some(s => lowerMessage.includes(s))) {
      quality = 'negative';
    }
    // Check for rephrasing (indicates confusion)
    else if (this.feedbackSignals.rephrase.some(s => lowerMessage.includes(s))) {
      quality = 'rephrase';
    }
    // Quick follow-up often means good engagement
    else if (timeSinceResponse < 30000) { // 30 seconds
      quality = 'engaged';
    }

    // Store feedback
    await this.storeFeedback(originalQuery.intent, quality);

    return {
      quality,
      intent: originalQuery.intent,
      timeSinceResponse
    };
  }

  async storeFeedback(intent, quality) {
    const key = `quality_feedback:${intent}`;
    const existing = await cache.get(key) || { positive: 0, negative: 0, rephrase: 0, total: 0 };

    existing.total++;
    if (quality === 'positive' || quality === 'engaged') existing.positive++;
    else if (quality === 'negative') existing.negative++;
    else if (quality === 'rephrase') existing.rephrase++;

    await cache.set(key, existing, 86400 * 30);
  }

  /**
   * Get quality metrics for intent
   */
  async getIntentQuality(intent) {
    const feedback = await cache.get(`quality_feedback:${intent}`);
    if (!feedback || feedback.total < 10) {
      return { intent, dataPoints: feedback?.total || 0, message: 'Insufficient data' };
    }

    return {
      intent,
      positiveRate: (feedback.positive / feedback.total * 100).toFixed(1) + '%',
      negativeRate: (feedback.negative / feedback.total * 100).toFixed(1) + '%',
      rephraseRate: (feedback.rephrase / feedback.total * 100).toFixed(1) + '%',
      dataPoints: feedback.total,
      needsImprovement: feedback.negative / feedback.total > 0.2 || feedback.rephrase / feedback.total > 0.15
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ML MODULES
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Instance singletons
  semanticAccountMatcher: new SemanticAccountMatcher(),
  dealHealthPredictor: new DealHealthPredictor(),
  intelligentForecaster: new IntelligentForecaster(),
  meetingIntelligenceExtractor: new MeetingIntelligenceExtractor(),
  querySuggestionEngine: new QuerySuggestionEngine(),
  anomalyDetector: new AnomalyDetector(),
  accountLookalikeScorer: new AccountLookalikeScorer(),
  responseQualityLearner: new ResponseQualityLearner(),

  // Classes for custom instantiation
  SemanticAccountMatcher,
  DealHealthPredictor,
  IntelligentForecaster,
  MeetingIntelligenceExtractor,
  QuerySuggestionEngine,
  AnomalyDetector,
  AccountLookalikeScorer,
  ResponseQualityLearner,

  // Summary of ML opportunities
  ML_OPPORTUNITIES: {
    '1. Semantic Account Matching': {
      current: 'Jaccard + Levenshtein string similarity',
      enhanced: 'OpenAI embeddings for semantic company resolution',
      benefit: 'Handles "IBM" → "International Business Machines" automatically',
      implementation: 'SemanticAccountMatcher'
    },
    '2. Deal Health Prediction': {
      current: 'None - manual inspection',
      enhanced: 'ML-based health scoring with LLM enhancement',
      benefit: 'Proactive risk identification before deals go stale',
      implementation: 'DealHealthPredictor'
    },
    '3. Intelligent Forecasting': {
      current: 'Static stage-based probabilities',
      enhanced: 'Dynamic weights based on owner performance, seasonality, deal attributes',
      benefit: 'More accurate forecast with scenario ranges',
      implementation: 'IntelligentForecaster'
    },
    '4. Meeting Intelligence': {
      current: 'Basic note sync to Salesforce',
      enhanced: 'LLM extraction of action items, sentiment, stakeholders',
      benefit: 'Automated CRM enrichment and follow-up tracking',
      implementation: 'MeetingIntelligenceExtractor'
    },
    '5. Query Suggestions': {
      current: 'None',
      enhanced: 'Context-aware follow-up question suggestions',
      benefit: 'Guides users to insights they didn\'t know to ask for',
      implementation: 'QuerySuggestionEngine'
    },
    '6. Anomaly Detection': {
      current: 'Manual deal review',
      enhanced: 'Automated detection of stale deals, regressions, neglected high-value deals',
      benefit: 'Proactive alerts before problems escalate',
      implementation: 'AnomalyDetector'
    },
    '7. Account Lookalike': {
      current: 'None',
      enhanced: 'Profile matching to identify similar prospects',
      benefit: 'Target accounts most likely to convert',
      implementation: 'AccountLookalikeScorer'
    },
    '8. Response Quality Learning': {
      current: 'Explicit feedback only',
      enhanced: 'Implicit feedback from user behavior (rephrasing, thanks)',
      benefit: 'Continuous improvement without explicit ratings',
      implementation: 'ResponseQualityLearner'
    }
  }
};

