/**
 * COMPREHENSIVE CHEAT SHEET COMMAND VALIDATION
 * Tests all commands listed in the GTM-Brain cheat sheet to ensure they work
 */

const { IntentParser } = require('../src/ai/intentParser');

describe('Cheat Sheet Command Validation', () => {
  let parser;

  beforeEach(() => {
    parser = new IntentParser();
  });

  describe('Account Queries', () => {
    describe('Find Account Owner', () => {
      test('who owns Boeing', () => {
        const result = parser.parse('who owns Boeing');
        expect(result.intent).toBe('account_owner');
        expect(result.entities.accountName).toBe('Boeing');
      });

      test('BL for Intel', () => {
        const result = parser.parse('BL for Intel');
        expect(result.intent).toBe('account_owner');
        expect(result.entities.accountName).toBe('Intel');
      });
    });

    describe('Accounts by Owner', () => {
      test('what accounts does Julie own', () => {
        const result = parser.parse('what accounts does Julie own');
        expect(result.intent).toBe('accounts_by_owner');
        expect(result.entities.ownerName).toContain('Julie');
      });

      test('Himanshu\'s accounts', () => {
        const result = parser.parse('Himanshu\'s accounts');
        expect(result.intent).toBe('accounts_by_owner');
        expect(result.entities.ownerName).toContain('Himanshu');
      });
    });

    describe('Accounts by Stage', () => {
      test('what accounts are in Stage 2', () => {
        const result = parser.parse('what accounts are in Stage 2');
        expect(result.intent).toBe('accounts_by_stage');
        expect(result.entities.stage).toMatch(/2|SQO/i);
      });

      test('accounts in Stage 4', () => {
        const result = parser.parse('accounts in Stage 4');
        expect(result.intent).toBe('accounts_by_stage');
        expect(result.entities.stage).toMatch(/4|Proposal/i);
      });
    });

    describe('Legal Team Size', () => {
      test('what is the legal team size at Boeing', () => {
        const result = parser.parse('what is the legal team size at Boeing');
        expect(result.intent).toBe('legal_team_size');
        expect(result.entities.accountName).toBe('Boeing');
      });
    });

    describe('Decision Makers', () => {
      test('who are the decision makers at Microsoft', () => {
        const result = parser.parse('who are the decision makers at Microsoft');
        expect(result.intent).toBe('decision_makers');
        expect(result.entities.accountName).toBe('Microsoft');
      });
    });

    describe('Use Cases', () => {
      test('what use cases is Boeing discussing', () => {
        const result = parser.parse('what use cases is Boeing discussing');
        expect(result.intent).toBe('use_cases');
        expect(result.entities.accountName).toBe('Boeing');
      });
    });

    describe('Competitive Landscape', () => {
      test('competitive landscape for Intel', () => {
        const result = parser.parse('competitive landscape for Intel');
        expect(result.intent).toBe('competitive_landscape');
        expect(result.entities.accountName).toBe('Intel');
      });
    });

    describe('Customer List', () => {
      test('who are our current customers', () => {
        const result = parser.parse('who are our current customers');
        expect(result.intent).toBe('customer_list');
      });
    });
  });

  describe('Pipeline Queries', () => {
    describe('Full Pipeline', () => {
      test('show me pipeline', () => {
        const result = parser.parse('show me pipeline');
        expect(result.intent).toBe('pipeline');
      });

      test('pipeline overview', () => {
        const result = parser.parse('pipeline overview');
        expect(result.intent).toBe('pipeline');
      });
    });

    describe('My Pipeline', () => {
      test('show me my pipeline', () => {
        const result = parser.parse('show me my pipeline');
        expect(result.intent).toBe('my_pipeline');
      });

      test('my deals', () => {
        const result = parser.parse('my deals');
        expect(result.intent).toBe('my_pipeline');
      });
    });

    describe('Someone\'s Pipeline', () => {
      test('Himanshu\'s deals', () => {
        const result = parser.parse('Himanshu\'s deals');
        expect(result.intent).toBe('pipeline_by_owner');
        expect(result.entities.ownerName).toContain('Himanshu');
      });

      test('Julie\'s pipeline', () => {
        const result = parser.parse('Julie\'s pipeline');
        expect(result.intent).toBe('pipeline_by_owner');
        expect(result.entities.ownerName).toContain('Julie');
      });
    });

    describe('Early Stage', () => {
      test('early stage pipeline', () => {
        const result = parser.parse('early stage pipeline');
        expect(result.intent).toBe('pipeline_by_stage');
        expect(result.entities.stage).toMatch(/early|0|1/i);
      });
    });

    describe('Mid Stage', () => {
      test('mid stage deals', () => {
        const result = parser.parse('mid stage deals');
        expect(result.intent).toBe('pipeline_by_stage');
        expect(result.entities.stage).toMatch(/mid|2|3/i);
      });
    });

    describe('Late Stage', () => {
      test('late stage pipeline', () => {
        const result = parser.parse('late stage pipeline');
        expect(result.intent).toBe('pipeline_by_stage');
        expect(result.entities.stage).toMatch(/late|4|5/i);
      });
    });

    describe('Product Pipeline', () => {
      test('contracting pipeline', () => {
        const result = parser.parse('contracting pipeline');
        expect(result.intent).toBe('pipeline_by_product');
        expect(result.entities.productType).toMatch(/contract/i);
      });

      test('late stage contracting', () => {
        const result = parser.parse('late stage contracting');
        expect(result.intent).toBe('pipeline_by_product');
        expect(result.entities.productType).toMatch(/contract/i);
        expect(result.entities.stage).toMatch(/late|4|5/i);
      });
    });

    describe('New Pipeline', () => {
      test('what deals were added to pipeline this week', () => {
        const result = parser.parse('what deals were added to pipeline this week');
        expect(result.intent).toBe('new_pipeline');
        expect(result.entities.timeframe).toMatch(/week/i);
      });

      test('new deals this month', () => {
        const result = parser.parse('new deals this month');
        expect(result.intent).toBe('new_pipeline');
        expect(result.entities.timeframe).toMatch(/month/i);
      });
    });

    describe('Weighted Pipeline', () => {
      test('weighted pipeline', () => {
        const result = parser.parse('weighted pipeline');
        expect(result.intent).toBe('weighted_pipeline');
      });
    });

    describe('Specific Stage', () => {
      test('Stage 2 pipeline', () => {
        const result = parser.parse('Stage 2 pipeline');
        expect(result.intent).toBe('pipeline_by_stage');
        expect(result.entities.stage).toMatch(/2|SQO/i);
      });

      test('Stage 4 opportunities', () => {
        const result = parser.parse('Stage 4 opportunities');
        expect(result.intent).toBe('pipeline_by_stage');
        expect(result.entities.stage).toMatch(/4|Proposal/i);
      });
    });
  });

  describe('Closed Deals', () => {
    describe('What Closed', () => {
      test('what closed this month', () => {
        const result = parser.parse('what closed this month');
        expect(result.intent).toBe('closed_deals');
        expect(result.entities.timeframe).toMatch(/month/i);
      });

      test('what closed this week', () => {
        const result = parser.parse('what closed this week');
        expect(result.intent).toBe('closed_deals');
        expect(result.entities.timeframe).toMatch(/week/i);
      });
    });

    describe('LOIs / Bookings', () => {
      test('what LOIs have we signed', () => {
        const result = parser.parse('what LOIs have we signed');
        expect(result.intent).toBe('loi_deals');
      });

      test('how many LOIs this month', () => {
        const result = parser.parse('how many LOIs this month');
        expect(result.intent).toBe('loi_deals');
        expect(result.entities.timeframe).toMatch(/month/i);
      });
    });

    describe('ARR Deals', () => {
      test('show ARR deals', () => {
        const result = parser.parse('show ARR deals');
        expect(result.intent).toBe('arr_deals');
      });

      test('how many ARR contracts', () => {
        const result = parser.parse('how many ARR contracts');
        expect(result.intent).toBe('arr_deals');
      });
    });

    describe('Contracts', () => {
      test('show contracts', () => {
        const result = parser.parse('show contracts');
        expect(result.intent).toBe('contracts');
      });

      test('contracts for Boeing', () => {
        const result = parser.parse('contracts for Boeing');
        expect(result.intent).toBe('contracts');
        expect(result.entities.accountName).toBe('Boeing');
      });
    });
  });

  describe('Metrics', () => {
    describe('Count Deals', () => {
      test('how many deals', () => {
        const result = parser.parse('how many deals');
        expect(result.intent).toBe('count_deals');
      });

      test('how many deals in Stage 2', () => {
        const result = parser.parse('how many deals in Stage 2');
        expect(result.intent).toBe('count_deals');
        expect(result.entities.stage).toMatch(/2|SQO/i);
      });
    });

    describe('Days in Stage', () => {
      test('average days in Stage 2', () => {
        const result = parser.parse('average days in Stage 2');
        expect(result.intent).toBe('days_in_stage');
        expect(result.entities.stage).toMatch(/2|SQO/i);
      });

      test('avg days in Stage 4', () => {
        const result = parser.parse('avg days in Stage 4');
        expect(result.intent).toBe('days_in_stage');
        expect(result.entities.stage).toMatch(/4|Proposal/i);
      });
    });

    describe('Customer Count', () => {
      test('how many customers', () => {
        const result = parser.parse('how many customers');
        expect(result.intent).toBe('customer_count');
      });
    });
  });

  describe('Create (ADMIN)', () => {
    describe('Create Opportunity', () => {
      test('create opp for Boeing', () => {
        const result = parser.parse('create opp for Boeing');
        expect(result.intent).toBe('create_opportunity');
        expect(result.entities.accountName).toBe('Boeing');
      });

      test('create opportunity for Intel', () => {
        const result = parser.parse('create opportunity for Intel');
        expect(result.intent).toBe('create_opportunity');
        expect(result.entities.accountName).toBe('Intel');
      });
    });

    describe('Create with Details', () => {
      test('create a stage 2 opp for Apple', () => {
        const result = parser.parse('create a stage 2 opp for Apple');
        expect(result.intent).toBe('create_opportunity');
        expect(result.entities.accountName).toBe('Apple');
        expect(result.entities.stage).toMatch(/2|SQO/i);
      });

      test('create opportunity for Amazon with $500k ACV', () => {
        const result = parser.parse('create opportunity for Amazon with $500k ACV');
        expect(result.intent).toBe('create_opportunity');
        expect(result.entities.accountName).toBe('Amazon');
        expect(result.entities.acv).toMatch(/500/);
      });
    });
  });

  describe('Update (ADMIN)', () => {
    describe('Reassign Account', () => {
      test('reassign Boeing to Julie', () => {
        const result = parser.parse('reassign Boeing to Julie');
        expect(result.intent).toBe('reassign_account');
        expect(result.entities.accountName).toBe('Boeing');
        expect(result.entities.newOwner).toContain('Julie');
      });

      test('assign Intel to Himanshu', () => {
        const result = parser.parse('assign Intel to Himanshu');
        expect(result.intent).toBe('reassign_account');
        expect(result.entities.accountName).toBe('Intel');
        expect(result.entities.newOwner).toContain('Himanshu');
      });
    });

    describe('Batch Reassign', () => {
      test('batch reassign: Boeing, Intel, Microsoft to Julie', () => {
        const result = parser.parse('batch reassign: Boeing, Intel, Microsoft to Julie');
        expect(result.intent).toBe('batch_reassign_accounts');
        expect(result.entities.accountNames).toEqual(expect.arrayContaining(['Boeing', 'Intel', 'Microsoft']));
        expect(result.entities.newOwner).toContain('Julie');
      });

      test('reassign Boeing, Intel to Himanshu', () => {
        const result = parser.parse('reassign Boeing, Intel to Himanshu');
        expect(result.intent).toBe('batch_reassign_accounts');
        expect(result.entities.accountNames).toEqual(expect.arrayContaining(['Boeing', 'Intel']));
        expect(result.entities.newOwner).toContain('Himanshu');
      });
    });

    describe('Move to Nurture', () => {
      test('move Boeing to nurture', () => {
        const result = parser.parse('move Boeing to nurture');
        expect(result.intent).toBe('move_to_nurture');
        expect(result.entities.accountName).toBe('Boeing');
      });

      test('mark Intel as nurture', () => {
        const result = parser.parse('mark Intel as nurture');
        expect(result.intent).toBe('move_to_nurture');
        expect(result.entities.accountName).toBe('Intel');
      });
    });

    describe('Batch Nurture', () => {
      test('batch nurture: Boeing, Intel, Microsoft', () => {
        const result = parser.parse('batch nurture: Boeing, Intel, Microsoft');
        expect(result.intent).toBe('batch_nurture');
        expect(result.entities.accountNames).toEqual(expect.arrayContaining(['Boeing', 'Intel', 'Microsoft']));
      });

      test('move Boeing, Intel, Microsoft to nurture', () => {
        const result = parser.parse('move Boeing, Intel, Microsoft to nurture');
        expect(result.intent).toBe('batch_nurture');
        expect(result.entities.accountNames).toEqual(expect.arrayContaining(['Boeing', 'Intel', 'Microsoft']));
      });
    });

    describe('Close Lost', () => {
      test('close Boeing lost', () => {
        const result = parser.parse('close Boeing lost');
        expect(result.intent).toBe('close_lost');
        expect(result.entities.accountName).toBe('Boeing');
      });

      test('mark Intel as lost', () => {
        const result = parser.parse('mark Intel as lost');
        expect(result.intent).toBe('close_lost');
        expect(result.entities.accountName).toBe('Intel');
      });
    });

    describe('Save Customer Note', () => {
      test('add to customer history: Boeing met with CLO today', () => {
        const result = parser.parse('add to customer history: Boeing met with CLO today');
        expect(result.intent).toBe('customer_note');
        expect(result.entities.accountName).toBe('Boeing');
        expect(result.entities.note).toContain('met with CLO');
      });
    });
  });

  describe('Export', () => {
    describe('Excel Export', () => {
      test('send pipeline excel', () => {
        const result = parser.parse('send pipeline excel');
        expect(result.intent).toBe('export_excel');
      });

      test('export active pipeline', () => {
        const result = parser.parse('export active pipeline');
        expect(result.intent).toBe('export_excel');
      });
    });

    describe('Pagination', () => {
      test('show next 10', () => {
        const result = parser.parse('show next 10');
        expect(result.intent).toBe('pagination');
        expect(result.entities.count).toBe(10);
      });

      test('show all', () => {
        const result = parser.parse('show all');
        expect(result.intent).toBe('pagination');
        expect(result.entities.showAll).toBe(true);
      });
    });
  });
});

