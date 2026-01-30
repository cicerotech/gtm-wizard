/**
 * LLM Front Agent - Customer Support Layer
 * 
 * Architecture:
 * User Query → LLM (flexible understanding) → Deterministic Backend (reliable execution)
 * 
 * Purpose:
 * - Handle variations in user queries ("Create Levi Strauss assigned to a BL")
 * - Extract entities even when phrasing is non-standard
 * - Provide helpful guidance when confused
 * - Route to appropriate deterministic function
 * 
 * Flow:
 * 1. User sends query
 * 2. LLM analyzes intent and extracts entities
 * 3. If confident (>80%): Route to deterministic function with extracted params
 * 4. If uncertain (50-80%): Ask clarifying question with suggestions
 * 5. If confused (<50%): Show related capabilities based on keywords
 */

const { OpenAI } = require('openai');

class LLMFrontAgent {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Map of deterministic functions available
    this.availableFunctions = {
      'create_account': {
        description: 'Create a new account in Salesforce with geographic assignment',
        params: ['companyName'],
        examples: ['create Asana', 'add Novelis to salesforce', 'create account for PetSmart'],
        keywords: ['create', 'add', 'new account']
      },
      'account_ownership': {
        description: 'Get account owner information',
        params: ['companyName'],
        examples: ['who owns Dolby', 'Pure Storage owner', 'who is the owner of Ecolab'],
        keywords: ['who owns', 'owner', 'owned by']
      },
      'account_reassign': {
        description: 'Reassign account to different Business Lead',
        params: ['companyName', 'newOwner'],
        examples: ['reassign Dolby to Julie', 'transfer Ecolab to Mitchell'],
        keywords: ['reassign', 'transfer', 'change owner']
      },
      'late_stage_pipeline': {
        description: 'Show Stage 3 + Stage 4 opportunities',
        params: [],
        examples: ['late stage pipeline', 'show me stage 3 and 4', 'proposal and pilot deals'],
        keywords: ['late stage', 'stage 3', 'stage 4', 'proposal', 'pilot']
      },
      'account_opportunities': {
        description: 'Show all opportunities for an account',
        params: ['companyName'],
        examples: ['show me Pure Storage opportunities', 'what opps does Dolby have'],
        keywords: ['opportunities', 'opps', 'deals at']
      }
      // Add all other capabilities...
    };
  }

  /**
   * Main entry point: Understand user query and route appropriately
   */
  async processQuery(userMessage, userId) {
    try {
      // Step 1: Use LLM to understand intent and extract entities
      const understanding = await this.understandIntent(userMessage);
      
      // Step 2: Route based on confidence
      if (understanding.confidence >= 0.8) {
        // High confidence: Execute directly
        return {
          action: 'execute',
          function: understanding.function,
          params: understanding.params,
          confidence: understanding.confidence
        };
      } else if (understanding.confidence >= 0.5) {
        // Medium confidence: Ask for clarification
        return {
          action: 'clarify',
          message: this.generateClarification(understanding),
          suggestions: understanding.alternatives
        };
      } else {
        // Low confidence: Show related capabilities
        return {
          action: 'help',
          message: this.generateSmartHelp(userMessage, understanding),
          relatedCapabilities: this.findRelatedCapabilities(userMessage)
        };
      }
      
    } catch (error) {
      console.error('[LLM Front Agent] Error:', error);
      return {
        action: 'error',
        message: 'I had trouble understanding that. Could you rephrase?'
      };
    }
  }

  /**
   * Use LLM to understand intent and extract entities
   */
  async understandIntent(userMessage) {
    const systemPrompt = `You are a helpful assistant for GTM-Brain, a Salesforce query system. 

Your job is to understand user queries and extract:
1. Intent (what function they want to call)
2. Entities (company names, people names, etc.)
3. Confidence (0-1 how sure you are)

Available functions:
${Object.entries(this.availableFunctions).map(([name, func]) => 
  `- ${name}: ${func.description}\n  Params: ${func.params.join(', ')}\n  Examples: ${func.examples.join('; ')}`
).join('\n')}

User query: "${userMessage}"

Respond ONLY with JSON:
{
  "function": "function_name",
  "params": {"paramName": "value"},
  "confidence": 0.95,
  "reasoning": "why you chose this",
  "alternatives": ["other_possible_function"]
}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3, // Low temperature for consistency
      max_tokens: 200
    });

    const llmResponse = response.choices[0].message.content;
    
    try {
      const parsed = JSON.parse(llmResponse);
      return parsed;
    } catch (error) {
      // LLM didn't return valid JSON, fallback
      return {
        function: 'unknown',
        params: {},
        confidence: 0.1,
        reasoning: 'Failed to parse LLM response',
        alternatives: []
      };
    }
  }

  /**
   * Generate clarifying question when confidence is medium
   */
  generateClarification(understanding) {
    if (understanding.function === 'create_account' && !understanding.params.companyName) {
      return 'I can help create an account. Which company name should I use?';
    }
    
    if (understanding.function === 'account_reassign') {
      if (!understanding.params.companyName) {
        return 'Which account would you like to reassign?';
      }
      if (!understanding.params.newOwner) {
        return `Got it - reassigning ${understanding.params.companyName}. Who should I assign it to? (Julie Stefanich, Mitchell Agarwal, Justin Hills, etc.)`;
      }
    }
    
    return `Did you mean: ${understanding.function.replace(/_/g, ' ')}?`;
  }

  /**
   * Generate smart help based on keywords in query
   */
  generateSmartHelp(userMessage, understanding) {
    const keywords = this.extractKeywords(userMessage);
    const related = this.findRelatedCapabilities(userMessage);
    
    if (related.length > 0) {
      return `I'm not sure exactly what you're asking, but based on your question, I can help with:\n\n${related.map(r => `• ${r.description}\n  Example: "${r.examples[0]}"`).join('\n\n')}`;
    }
    
    return `I didn't understand that. Here are some things I can help with:\n\n• Account ownership: "who owns Pure Storage?"\n• Pipeline queries: "late stage pipeline"\n• Create accounts: "create Asana and assign to BL"\n\nTry rephrasing your question to match one of these patterns.`;
  }

  /**
   * Find related capabilities based on keywords
   */
  findRelatedCapabilities(userMessage) {
    const messageLower = userMessage.toLowerCase();
    const related = [];
    
    for (const [funcName, func] of Object.entries(this.availableFunctions)) {
      // Check if any keywords match
      const keywordMatch = func.keywords.some(keyword => 
        messageLower.includes(keyword.toLowerCase())
      );
      
      if (keywordMatch) {
        related.push({
          function: funcName,
          description: func.description,
          examples: func.examples
        });
      }
    }
    
    return related.slice(0, 3); // Top 3 related
  }

  /**
   * Extract keywords from message
   */
  extractKeywords(message) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
    const words = message.toLowerCase().match(/\b\w+\b/g) || [];
    return words.filter(w => !stopWords.has(w) && w.length > 2);
  }
}

module.exports = new LLMFrontAgent();

