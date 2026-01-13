const logger = require('../utils/logger');

/**
 * Register interactive handlers for buttons, modals, etc.
 */
function registerInteractiveHandlers(app) {
  
  // Handle button interactions
  app.action('drill_down', async ({ ack, body, client }) => {
    await ack();
    
    try {
      await handleDrillDown(body, client);
    } catch (error) {
      logger.error('Drill down action error:', error);
    }
  });

  // Handle modal submissions
  app.view('query_builder', async ({ ack, body, view, client }) => {
    await ack();
    
    try {
      await handleQueryBuilder(body, view, client);
    } catch (error) {
      logger.error('Query builder error:', error);
    }
  });

  // Handle select menu interactions
  app.action('filter_select', async ({ ack, body, client }) => {
    await ack();
    
    try {
      await handleFilterSelect(body, client);
    } catch (error) {
      logger.error('Filter select error:', error);
    }
  });

  logger.info('✅ Interactive handlers registered');
}

/**
 * Handle drill down button clicks
 */
async function handleDrillDown(body, client) {
  const userId = body.user.id;
  const channelId = body.channel.id;
  const value = JSON.parse(body.actions[0].value);

  logger.slackInteraction('button_click', userId, channelId, 'drill_down');

  // Process drill down query
  const drillDownQuery = buildDrillDownQuery(value);
  
  await client.chat.postMessage({
    channel: channelId,
    text: `🔍 Drilling down into ${value.category}...`,
    thread_ts: body.message.ts
  });

  // Execute the drill down query here
  // This would integrate with the same query processing logic
}

/**
 * Handle query builder modal
 */
async function handleQueryBuilder(body, view, client) {
  const userId = body.user.id;
  const values = view.state.values;

  // Extract form values
  const queryParams = {
    timeframe: values.timeframe?.timeframe_select?.selected_option?.value,
    stage: values.stage?.stage_select?.selected_option?.value,
    owner: values.owner?.owner_input?.value,
    minAmount: values.amount?.min_amount?.value
  };

  logger.slackInteraction('modal_submit', userId, null, 'query_builder');

  // Build and execute query based on form inputs
  const naturalQuery = buildNaturalQuery(queryParams);
  
  // Send results to user's DM
  await client.chat.postMessage({
    channel: userId,
    text: `🎯 Query results for: "${naturalQuery}"\n\n[Results would be processed here]`
  });
}

/**
 * Handle filter select interactions
 */
async function handleFilterSelect(body, client) {
  const userId = body.user.id;
  const selectedValue = body.actions[0].selected_option.value;

  logger.slackInteraction('select_menu', userId, null, 'filter_select');

  // Update the message with new filter applied
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: `Filter applied: ${selectedValue}`,
    blocks: buildUpdatedBlocks(selectedValue)
  });
}

/**
 * Build drill down query
 */
function buildDrillDownQuery(value) {
  return {
    category: value.category,
    filters: value.filters,
    action: 'drill_down'
  };
}

/**
 * Build natural language query from form params
 */
function buildNaturalQuery(params) {
  let query = 'show me deals';

  if (params.timeframe) {
    query += ` ${params.timeframe}`;
  }

  if (params.stage) {
    query += ` in ${params.stage}`;
  }

  if (params.owner) {
    query += ` owned by ${params.owner}`;
  }

  if (params.minAmount) {
    query += ` over $${params.minAmount}`;
  }

  return query;
}

/**
 * Build updated blocks for filter selection
 */
function buildUpdatedBlocks(selectedValue) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Filter updated to: *${selectedValue}*`
      }
    }
  ];
}

/**
 * Create interactive blocks for responses
 */
function createInteractiveBlocks(queryResult, parsedIntent) {
  const blocks = [];

  // Add action buttons
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Drill Down'
        },
        action_id: 'drill_down',
        value: JSON.stringify({
          category: parsedIntent.intent,
          filters: parsedIntent.entities
        })
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Export Data'
        },
        action_id: 'export_data',
        value: 'csv'
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Share Results'
        },
        action_id: 'share_results',
        value: 'share'
      }
    ]
  });

  return blocks;
}

/**
 * Create query builder modal
 */
function createQueryBuilderModal() {
  return {
    type: 'modal',
    callback_id: 'query_builder',
    title: {
      type: 'plain_text',
      text: 'Query Builder'
    },
    submit: {
      type: 'plain_text',
      text: 'Run Query'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Build your custom sales query:'
        }
      },
      {
        type: 'input',
        block_id: 'timeframe',
        element: {
          type: 'static_select',
          action_id: 'timeframe_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select timeframe'
          },
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Today'
              },
              value: 'today'
            },
            {
              text: {
                type: 'plain_text',
                text: 'This Week'
              },
              value: 'this_week'
            },
            {
              text: {
                type: 'plain_text',
                text: 'This Month'
              },
              value: 'this_month'
            },
            {
              text: {
                type: 'plain_text',
                text: 'This Quarter'
              },
              value: 'this_quarter'
            }
          ]
        },
        label: {
          type: 'plain_text',
          text: 'Timeframe'
        }
      },
      {
        type: 'input',
        block_id: 'stage',
        element: {
          type: 'static_select',
          action_id: 'stage_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select stage'
          },
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Stage 0 - Prospecting'
              },
              value: 'Stage 0 - Prospecting'
            },
            {
              text: {
                type: 'plain_text',
                text: 'Stage 1 - Discovery'
              },
              value: 'Stage 1 - Discovery'
            },
            {
              text: {
                type: 'plain_text',
                text: 'Stage 2 - SOO'
              },
              value: 'Stage 2 - SOO'
            },
            {
              text: {
                type: 'plain_text',
                text: 'Stage 3 - Pilot'
              },
              value: 'Stage 3 - Pilot'
            },
            {
              text: {
                type: 'plain_text',
                text: 'Stage 4 - Proposal'
              },
              value: 'Stage 4 - Proposal'
            }
          ]
        },
        label: {
          type: 'plain_text',
          text: 'Stage'
        },
        optional: true
      },
      {
        type: 'input',
        block_id: 'owner',
        element: {
          type: 'plain_text_input',
          action_id: 'owner_input',
          placeholder: {
            type: 'plain_text',
            text: 'Enter owner name'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Owner'
        },
        optional: true
      },
      {
        type: 'input',
        block_id: 'amount',
        element: {
          type: 'plain_text_input',
          action_id: 'min_amount',
          placeholder: {
            type: 'plain_text',
            text: 'e.g. 100000'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Minimum Amount'
        },
        optional: true
      }
    ]
  };
}

module.exports = {
  registerInteractiveHandlers,
  createInteractiveBlocks,
  createQueryBuilderModal
};

