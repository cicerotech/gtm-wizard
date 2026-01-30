/**
 * emailIntelligence.test.js
 * Integration tests for email intelligence service
 */

const { 
  extractDomain,
  determineRouting
} = require('../src/services/emailIntelligence');

describe('Email Intelligence Service', () => {
  describe('extractDomain', () => {
    test('extracts domain from valid email', () => {
      expect(extractDomain('user@example.com')).toBe('example.com');
    });

    test('handles null email', () => {
      expect(extractDomain(null)).toBeNull();
    });

    test('handles invalid email format', () => {
      expect(extractDomain('notanemail')).toBeNull();
    });

    test('normalizes domain to lowercase', () => {
      expect(extractDomain('User@EXAMPLE.COM')).toBe('example.com');
    });
  });

  describe('determineRouting', () => {
    test('routes high urgency to Slack', () => {
      const classification = {
        urgency: 'high',
        requestType: 'Support'
      };
      const account = null;
      const alias = 'cs-inbound';

      const routing = determineRouting(classification, account, alias);

      expect(routing.sendSlackAlert).toBe(true);
      expect(routing.urgency).toBe('high');
    });

    test('assigns to account owner when matched', () => {
      const classification = {
        urgency: 'medium',
        requestType: 'General'
      };
      const account = {
        ownerId: '005xxx',
        name: 'Test Account'
      };
      const alias = 'cs-inbound';

      const routing = determineRouting(classification, account, alias);

      expect(routing.assignTo).toBe('005xxx');
    });

    test('routes quotes alias to Sales Ops queue', () => {
      const classification = {
        urgency: 'low',
        requestType: 'Quote Request'
      };
      const account = null;
      const alias = 'quotes';

      const routing = determineRouting(classification, account, alias);

      expect(routing.queueName).toBe('Sales_Ops_Queue');
    });

    test('routes reminders alias to Renewals queue', () => {
      const classification = {
        urgency: 'low',
        requestType: 'Renewal Alert'
      };
      const account = null;
      const alias = 'reminders';

      const routing = determineRouting(classification, account, alias);

      expect(routing.queueName).toBe('CS_Renewals_Queue');
    });
  });
});
