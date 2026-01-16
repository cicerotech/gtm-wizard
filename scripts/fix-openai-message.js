require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

async function fixOpenAIMessage() {
  // GTM Account Planning channel
  const channelId = 'C097L4HK3PY';
  
  console.log(`Looking for OpenAI message in channel ${channelId}...`);
  
  // Get recent messages
  const result = await client.conversations.history({
    channel: channelId,
    limit: 20
  });
  
  // Find the OpenAI closed won message
  const openAIMessage = result.messages.find(msg => 
    msg.text && 
    msg.text.includes('OpenAi') && 
    msg.text.includes('A Deal has been Won')
  );
  
  if (!openAIMessage) {
    console.log('Could not find OpenAI closed won message');
    console.log('Recent messages:', result.messages.map(m => m.text?.substring(0, 50)));
    return;
  }
  
  console.log('Found message at timestamp:', openAIMessage.ts);
  console.log('Current text preview:', openAIMessage.text.substring(0, 200));
  
  // Build the corrected message
  const correctedMessage = `*A Deal has been Won!*

*Client:* OpenAi
*Deal Owner:* Alex Fox
*Product Line:* Other Managed Service
*ACV:* $1,477,941
*Net Change:* $0
*Sales Type:* Expansion
*Type:* _Subject to Finance Review_*
*Close Date:* January 15, 2026

_*No incremental revenue vs. December run-rate. 21-month term secures capacity for near-term expansion._`;

  // Update the message
  const updateResult = await client.chat.update({
    channel: channelId,
    ts: openAIMessage.ts,
    text: correctedMessage
  });
  
  console.log('Message updated successfully!');
}

fixOpenAIMessage().catch(console.error);

