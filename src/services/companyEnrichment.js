/**
 * Company Enrichment Service
 * Fetches real-time context about companies for email personalization
 * Uses multiple APIs to gather recent news, funding, acquisitions, leadership changes
 */

const axios = require('axios');

class CompanyEnrichmentService {
  constructor() {
    // News API keys
    this.newsApiOrgKey = process.env.NEWSAPI_ORG_KEY || null; // NewsAPI.org (reliable fallback)
    this.newsApiAiKey = process.env.NEWS_API_AI_KEY || '85a8c4fd-7a59-48a0-b316-6a30617245d4'; // newsapi.ai
    this.cacheTimeout = 3600000; // 1 hour cache
    this.cache = new Map();
  }

  /**
   * Main enrichment function - gets ALL context for a company
   */
  async enrichCompany(companyName) {
    // Check cache first
    const cacheKey = companyName.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`[Enrichment] Cache hit for ${companyName}`);
        return cached.data;
      }
    }

    console.log(`[Enrichment] Fetching fresh data for ${companyName}`);

    // Parallel API calls for speed
    const [newsData, fundingData, leadershipData] = await Promise.allSettled([
      this.getRecentNews(companyName),
      this.getFundingInfo(companyName),
      this.getLeadershipChanges(companyName)
    ]);

    const enrichment = {
      company: companyName,
      timestamp: new Date().toISOString(),
      recentNews: newsData.status === 'fulfilled' ? newsData.value : [],
      fundingInfo: fundingData.status === 'fulfilled' ? fundingData.value : null,
      leadershipChanges: leadershipData.status === 'fulfilled' ? leadershipData.value : [],
      triggers: [], // Will populate based on analysis
      suggestedContext: []
    };

    // Extract triggers from all sources
    enrichment.triggers = this.extractTriggers(enrichment);
    enrichment.suggestedContext = this.generateContextSuggestions(enrichment);

    // Cache the result
    this.cache.set(cacheKey, {
      timestamp: Date.now(),
      data: enrichment
    });

    return enrichment;
  }

  /**
   * Get recent news using newsapi.ai
   */
  async getRecentNews(companyName) {
    try {
      // newsapi.ai article search endpoint
      const response = await axios.get(`${this.newsApiBaseUrl}/article/getArticles`, {
        params: {
          query: {
            $query: {
              $and: [
                {
                  conceptUri: { $or: [companyName] }
                },
                {
                  lang: "eng"
                }
              ]
            },
            $filter: {
              isDuplicate: "skipDuplicates"
            }
          },
          resultType: "articles",
          articlesSortBy: "date",
          articlesCount: 20,
          apiKey: this.newsApiKey
        },
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.articles && response.data.articles.results) {
        return response.data.articles.results.map(article => ({
          title: article.title,
          source: article.source?.title || 'Unknown',
          date: article.dateTime || article.date,
          url: article.url,
          description: article.body?.substring(0, 200) || ''
        }));
      }
      
      // Fallback to simpler search
      return await this.getNewsSimpleSearch(companyName);
      
    } catch (error) {
      console.warn(`[Enrichment] newsapi.ai fetch failed for ${companyName}:`, error.message);
      // Try fallback
      return await this.getNewsSimpleSearch(companyName);
    }
  }
  
  /**
   * Simpler newsapi.ai search (fallback)
   */
  async getNewsSimpleSearch(companyName) {
    try {
      const response = await axios.post(
        `${this.newsApiBaseUrl}/article/getArticles`,
        {
          keyword: companyName,
          lang: 'eng',
          articlesPage: 1,
          articlesCount: 15,
          articlesSortBy: 'date',
          dataType: ['news'],
          apiKey: this.newsApiKey
        },
        {
          timeout: 8000,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      if (response.data && response.data.articles && response.data.articles.results) {
        return response.data.articles.results.map(article => ({
          title: article.title || '',
          source: article.source?.title || 'Unknown',
          date: article.dateTime || article.date || '',
          url: article.url || '',
          description: article.body?.substring(0, 200) || article.title || ''
        })).filter(a => a.title);
      }
      
      return [];
    } catch (error) {
      console.warn(`[Enrichment] Fallback search also failed:`, error.message);
      return [];
    }
  }

  /**
   * Fallback: Google News RSS feed (no API key required)
   */
  async getGoogleNewsRSS(companyName) {
    try {
      const searchQuery = encodeURIComponent(`"${companyName}" (acquisition OR funding OR expansion OR appointed OR hired)`);
      const rssUrl = `https://news.google.com/rss/search?q=${searchQuery}&hl=en-US&gl=US&ceid=US:en`;
      
      const response = await axios.get(rssUrl, { timeout: 5000 });
      
      // Parse RSS (simple regex extraction - would use xml parser in production)
      const titleMatches = response.data.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g) || [];
      const dateMatches = response.data.match(/<pubDate>(.*?)<\/pubDate>/g) || [];
      
      const articles = [];
      for (let i = 0; i < Math.min(titleMatches.length, 10); i++) {
        const title = titleMatches[i]?.replace(/<title><!\[CDATA\[|\]\]><\/title>/g, '') || '';
        const date = dateMatches[i]?.replace(/<pubDate>|<\/pubDate>/g, '') || '';
        
        if (title && !title.includes('Google News')) {
          articles.push({
            title,
            date,
            source: 'Google News',
            description: title
          });
        }
      }
      
      return articles;
    } catch (error) {
      console.warn(`[Enrichment] Google News RSS failed:`, error.message);
      return [];
    }
  }

  /**
   * Get funding information (from Crunchbase-like data or news)
   */
  async getFundingInfo(companyName) {
    // In MVP: Extract from news headlines
    // In production: Use Crunchbase API
    return null; // Will be populated from news analysis
  }

  /**
   * Get leadership changes
   */
  async getLeadershipChanges(companyName) {
    // Extract from news mentioning "appointed," "hired," "new," "CLO," "General Counsel"
    return []; // Will be populated from news analysis
  }

  /**
   * Extract actionable triggers from enrichment data
   */
  extractTriggers(enrichment) {
    const triggers = [];
    
    // Analyze news headlines for common trigger patterns
    for (const article of enrichment.recentNews) {
      const headline = article.title.toLowerCase();
      const desc = (article.description || '').toLowerCase();
      const text = headline + ' ' + desc;
      
      // Acquisition triggers
      if (text.match(/acquir(e|ed|es|ing|ition)/)) {
        const match = article.title.match(/acquir\w+\s+([A-Z][a-zA-Z\s&]+)/);
        if (match) {
          triggers.push({
            type: 'acquisition',
            text: `recent acquisition of ${match[1].trim()}`,
            source: article.title,
            date: article.date
          });
        } else {
          triggers.push({
            type: 'acquisition',
            text: 'recent M&A activity',
            source: article.title,
            date: article.date
          });
        }
      }
      
      // Funding triggers
      if (text.match(/rais(e|ed|es|ing).*(\$\d+[MB]|series [A-D]|round)/i)) {
        const match = article.title.match(/(\$\d+[MB]|Series [A-D])/i);
        if (match) {
          triggers.push({
            type: 'funding',
            text: `${match[0]} funding round`,
            source: article.title,
            date: article.date
          });
        }
      }
      
      // Geographic expansion
      if (text.match(/expand(s|ed|ing)?\s+(into|in|to)\s+([A-Z][a-zA-Z]+|EMEA|APAC|Europe|Asia)/)) {
        const match = article.title.match(/(expand\w+\s+(?:into|in|to)\s+([A-Z][a-zA-Z]+|EMEA|APAC|Europe|Asia))/i);
        if (match) {
          triggers.push({
            type: 'expansion',
            text: match[0].toLowerCase(),
            source: article.title,
            date: article.date
          });
        }
      }
      
      // Leadership changes (CLO, GC, Legal)
      if (text.match(/(appoint|hire|name|join)\w*\s+(new\s+)?(chief legal|general counsel|clo|gc)/i)) {
        triggers.push({
          type: 'leadership',
          text: 'recent legal leadership change',
          source: article.title,
          date: article.date
        });
      }
      
      // Regulatory/compliance news
      if (text.match(/(regulat|compliance|sec|ftc|doj|investigation|settlement)/i)) {
        triggers.push({
          type: 'regulatory',
          text: 'recent regulatory activity',
          source: article.title,
          date: article.date
        });
      }
    }
    
    // Deduplicate and sort by date (most recent first)
    const unique = [];
    const seen = new Set();
    for (const trigger of triggers) {
      if (!seen.has(trigger.text)) {
        seen.add(trigger.text);
        unique.push(trigger);
      }
    }
    
    return unique.slice(0, 5); // Top 5 most relevant triggers
  }

  /**
   * Generate suggested context snippets for email variables
   */
  generateContextSuggestions(enrichment) {
    const suggestions = [];
    
    for (const trigger of enrichment.triggers) {
      switch (trigger.type) {
        case 'acquisition':
          suggestions.push({
            variable: '[recent trigger]',
            suggestion: trigger.text,
            confidence: 'high',
            reasoning: 'M&A activity suggests need for due diligence acceleration'
          });
          suggestions.push({
            variable: '[specific situation]',
            suggestion: `${trigger.text} increasing legal workload`,
            confidence: 'medium',
            reasoning: 'Acquisitions typically stress legal teams'
          });
          break;
          
        case 'funding':
          suggestions.push({
            variable: '[recent trigger]',
            suggestion: trigger.text,
            confidence: 'high',
            reasoning: 'Funding indicates growth, which stresses legal capacity'
          });
          suggestions.push({
            variable: '[specific situation]',
            suggestion: 'rapid growth scaling legal operations',
            confidence: 'medium',
            reasoning: 'Funded companies need to scale legal without proportional headcount'
          });
          break;
          
        case: 'expansion':
          suggestions.push({
            variable: '[recent trigger]',
            suggestion: trigger.text,
            confidence: 'high',
            reasoning: 'Geographic expansion creates compliance challenges'
          });
          suggestions.push({
            variable: '[specific situation]',
            suggestion: 'managing compliance across new markets',
            confidence: 'high',
            reasoning: 'International expansion requires regulatory navigation'
          });
          break;
          
        case 'leadership':
          suggestions.push({
            variable: '[recent trigger]',
            suggestion: 'new legal leadership',
            confidence: 'medium',
            reasoning: 'New CLO/GC often brings transformation mandate'
          });
          break;
          
        case 'regulatory':
          suggestions.push({
            variable: '[recent trigger]',
            suggestion: trigger.text,
            confidence: 'high',
            reasoning: 'Regulatory issues create urgency for legal efficiency'
          });
          break;
      }
    }
    
    return suggestions;
  }

  /**
   * Get enrichment summary for display
   */
  getSummary(enrichment) {
    return {
      company: enrichment.company,
      lastUpdated: enrichment.timestamp,
      newsCount: enrichment.recentNews.length,
      triggersFound: enrichment.triggers.length,
      topTriggers: enrichment.triggers.slice(0, 3).map(t => t.text),
      suggestedVariables: enrichment.suggestedContext.length
    };
  }
}

module.exports = new CompanyEnrichmentService();

