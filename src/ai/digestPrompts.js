/**
 * Digest Prompts - AI prompts for layered intelligence digest
 * 
 * Transforms raw signals into:
 * 1. Topic clusters (grouping related signals)
 * 2. Headlines (1-sentence summaries per topic)
 * 3. Preserved detail with full quotes
 */

/**
 * Prompt to cluster signals by topic and generate headlines
 * Input: Array of signals for one account
 * Output: Topics with headlines and grouped signals
 */
const TOPIC_CLUSTERING_PROMPT = `You are analyzing account intelligence signals from Slack conversations. Your job is to:

1. GROUP related signals into topics/themes (not categories)
2. GENERATE one headline per topic that captures the key insight
3. PRESERVE the original signal details for the detail section

RULES:
- Topics should be business-relevant themes (e.g., "RFP & Partnership Strategy", "IT Review Blockers", "Expansion Opportunity")
- Headlines must be ACCURATE to the signals - never invent details
- Include specific numbers, names, and dates from the signals
- Headlines should answer "what's happening?" in one sentence
- Order topics by importance/urgency
- Maximum 5 topics per account
- If a signal doesn't fit a topic, put it in "Other Updates"

OUTPUT FORMAT (JSON):
{
  "topics": [
    {
      "topicName": "RFP & Partnership Strategy",
      "headline": "Wednesday exec call with Rishi could pivot Cargill from competitive RFP to design partnership",
      "signals": [
        {
          "id": 123,
          "category": "meeting_notes",
          "summary": "Original summary...",
          "fullText": "Full message text...",
          "author": "John Smith",
          "channel": "cargill"
        }
      ]
    }
  ],
  "signalCount": 230
}

SIGNALS TO ANALYZE:
`;

/**
 * Prompt to generate account-level TL;DR from topics
 */
const ACCOUNT_SUMMARY_PROMPT = `Based on these topics and headlines for an account, generate a 2-3 sentence TL;DR that captures:
1. What's the current situation?
2. What needs attention or is noteworthy?

Keep it concise and actionable. Use specifics from the headlines.

TOPICS AND HEADLINES:
`;

/**
 * System prompt for topic clustering
 */
const TOPIC_CLUSTERING_SYSTEM = `You are a business intelligence analyst specializing in sales and customer success.
Your job is to organize raw Slack signals into meaningful topics and generate accurate headlines.

Key principles:
- ACCURACY: Never invent details not present in the signals
- SPECIFICITY: Include numbers, names, dates from the source
- RELEVANCE: Prioritize business-impacting signals
- CLARITY: Headlines should be immediately understandable

Output valid JSON only.`;

/**
 * Build the full prompt for topic clustering
 */
function buildTopicClusteringPrompt(signals) {
  const signalList = signals.map(s => ({
    id: s.id,
    category: s.category,
    summary: s.summary,
    fullText: s.message_text,
    author: s.message_author_name,
    channel: s.channel_name,
    confidence: s.confidence
  }));
  
  return TOPIC_CLUSTERING_PROMPT + JSON.stringify(signalList, null, 2);
}

/**
 * Build prompt for account summary
 */
function buildAccountSummaryPrompt(topics) {
  const topicSummary = topics.map(t => `- ${t.topicName}: ${t.headline}`).join('\n');
  return ACCOUNT_SUMMARY_PROMPT + topicSummary;
}

module.exports = {
  TOPIC_CLUSTERING_PROMPT,
  ACCOUNT_SUMMARY_PROMPT,
  TOPIC_CLUSTERING_SYSTEM,
  buildTopicClusteringPrompt,
  buildAccountSummaryPrompt
};
