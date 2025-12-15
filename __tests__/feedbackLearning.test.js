/**
 * Comprehensive tests for Feedback Learning System
 * Tests feedback analysis, pattern matching, and learning
 */

const { isFeedbackMessage, processFeedback } = require('../src/ai/feedbackLearning');

describe('FeedbackLearning', () => {
  describe('isFeedbackMessage', () => {
    describe('positive feedback detection', () => {
      test.each([
        'thanks',
        'thank you',
        'perfect',
        'great',
        'awesome',
        'excellent',
        'correct',
        'good answer',
        'helpful',
        'exactly',
        'spot on'
      ])('detects positive feedback: "%s"', (message) => {
        expect(isFeedbackMessage(message)).toBe(true);
      });
    });

    describe('negative feedback detection', () => {
      test.each([
        'wrong',
        'incorrect',
        'not right',
        'mistake',
        'error',
        "doesn't work",
        'broken'
      ])('detects negative feedback: "%s"', (message) => {
        expect(isFeedbackMessage(message)).toBe(true);
      });
    });

    describe('correction feedback detection', () => {
      test.each([
        'actually it is Boeing',
        'should be Microsoft',
        'the correct answer is Intel',
        'not that but this',
        'fix it to Boeing'
      ])('detects correction feedback: "%s"', (message) => {
        expect(isFeedbackMessage(message)).toBe(true);
      });
    });

    describe('non-feedback messages', () => {
      test.each([
        'who owns Boeing',
        'show me late stage pipeline',
        'what is the deal status',
        'how many opportunities'
      ])('does not flag as feedback: "%s"', (message) => {
        expect(isFeedbackMessage(message)).toBe(false);
      });
    });

    describe('edge cases', () => {
      test('handles empty string', () => {
        expect(isFeedbackMessage('')).toBe(false);
      });

      test('handles null', () => {
        expect(isFeedbackMessage(null)).toBe(false);
      });

      test('handles undefined', () => {
        expect(isFeedbackMessage(undefined)).toBe(false);
      });

      test('handles numbers', () => {
        expect(isFeedbackMessage(12345)).toBe(false);
      });
    });
  });
});

// Since processFeedback requires external dependencies (Slack client, etc.)
// We test the module exports and structure
describe('FeedbackLearning Module Exports', () => {
  test('exports isFeedbackMessage function', () => {
    expect(typeof isFeedbackMessage).toBe('function');
  });

  test('exports processFeedback function', () => {
    expect(typeof processFeedback).toBe('function');
  });
});


