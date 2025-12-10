/**
 * Comprehensive tests for formatters utility module
 * Testing all exported functions with happy path, edge cases, and error conditions
 */

const {
  formatCurrency,
  formatNumber,
  formatPercentage,
  formatDate,
  formatRelativeDate,
  formatDuration,
  cleanStageName,
  formatFieldName,
  truncateText,
  formatTable,
  formatFileSize,
  formatPhoneNumber
} = require('../src/utils/formatters');

describe('formatCurrency', () => {
  describe('happy path', () => {
    test('formats millions correctly', () => {
      expect(formatCurrency(5000000)).toBe('$5.0M');
    });

    test('formats billions correctly', () => {
      expect(formatCurrency(2500000000)).toBe('$2.5B');
    });

    test('formats thousands correctly', () => {
      expect(formatCurrency(75000)).toBe('$75K');
    });

    test('formats small amounts correctly', () => {
      expect(formatCurrency(500)).toBe('$500');
    });

    test('formats exact million', () => {
      expect(formatCurrency(1000000)).toBe('$1.0M');
    });
  });

  describe('edge cases', () => {
    test('handles zero', () => {
      expect(formatCurrency(0)).toBe('$0');
    });

    test('handles null', () => {
      expect(formatCurrency(null)).toBe('$0');
    });

    test('handles undefined', () => {
      expect(formatCurrency(undefined)).toBe('$0');
    });

    test('handles negative values', () => {
      const result = formatCurrency(-5000000);
      expect(result).toContain('-');
    });

    test('handles decimal amounts', () => {
      expect(formatCurrency(1500000)).toBe('$1.5M');
    });
  });

  describe('options', () => {
    test('non-compact formatting', () => {
      const result = formatCurrency(1234567, { compact: false });
      expect(result).toBe('$1,234,567');
    });

    test('different currency', () => {
      const result = formatCurrency(1000, { compact: false, currency: 'EUR' });
      expect(result).toContain('€');
    });
  });
});

describe('formatNumber', () => {
  describe('happy path', () => {
    test('formats large numbers with commas', () => {
      const result = formatNumber(1234567);
      expect(result).toBe('1,234,567');
    });

    test('formats decimals correctly', () => {
      const result = formatNumber(1234.56, { minimumFractionDigits: 2 });
      expect(result).toBe('1,234.56');
    });
  });

  describe('edge cases', () => {
    test('handles zero', () => {
      expect(formatNumber(0)).toBe('0');
    });

    test('handles null', () => {
      expect(formatNumber(null)).toBe('0');
    });

    test('handles undefined', () => {
      expect(formatNumber(undefined)).toBe('0');
    });

    test('handles negative numbers', () => {
      const result = formatNumber(-1234);
      expect(result).toBe('-1,234');
    });
  });
});

describe('formatPercentage', () => {
  describe('happy path', () => {
    test('formats whole percentage', () => {
      expect(formatPercentage(50)).toBe('50%');
    });

    test('formats decimal percentage', () => {
      const result = formatPercentage(33.33);
      expect(result).toMatch(/33\.?\d*%/);
    });
  });

  describe('edge cases', () => {
    test('handles zero', () => {
      expect(formatPercentage(0)).toBe('0%');
    });

    test('handles null', () => {
      expect(formatPercentage(null)).toBe('0%');
    });

    test('handles undefined', () => {
      expect(formatPercentage(undefined)).toBe('0%');
    });

    test('handles 100%', () => {
      expect(formatPercentage(100)).toBe('100%');
    });

    test('handles values over 100', () => {
      const result = formatPercentage(150);
      expect(result).toContain('150');
    });
  });
});

describe('formatDate', () => {
  describe('happy path', () => {
    test('formats date string in short style', () => {
      const result = formatDate('2025-12-10');
      // Date may vary by timezone, just check it contains Dec and 2025
      expect(result).toMatch(/Dec.*2025/);
    });

    test('formats with medium style', () => {
      const result = formatDate('2025-12-10', { style: 'medium' });
      expect(result).toContain('December');
      expect(result).toContain('2025');
    });
  });

  describe('edge cases', () => {
    test('handles null', () => {
      expect(formatDate(null)).toBe('No date');
    });

    test('handles undefined', () => {
      expect(formatDate(undefined)).toBe('No date');
    });

    test('handles empty string', () => {
      expect(formatDate('')).toBe('No date');
    });

    test('handles invalid date string', () => {
      expect(formatDate('not-a-date')).toBe('Invalid date');
    });

    test('handles ISO date format', () => {
      const result = formatDate('2025-01-15T10:30:00Z');
      expect(result).toContain('2025');
    });
  });

  describe('relative style', () => {
    test('formats today', () => {
      const today = new Date().toISOString();
      const result = formatDate(today, { style: 'relative' });
      expect(result).toBe('Today');
    });
  });
});

describe('formatRelativeDate', () => {
  describe('happy path', () => {
    test('returns Today for current date', () => {
      expect(formatRelativeDate(new Date())).toBe('Today');
    });

    test('returns Yesterday for previous day', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatRelativeDate(yesterday)).toBe('Yesterday');
    });

    test('returns days ago for recent dates', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      expect(formatRelativeDate(threeDaysAgo)).toBe('3 days ago');
    });

    test('returns weeks ago for older dates', () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      expect(formatRelativeDate(twoWeeksAgo)).toBe('2 weeks ago');
    });
  });

  describe('future dates', () => {
    test('returns Tomorrow for next day', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(formatRelativeDate(tomorrow)).toBe('Tomorrow');
    });

    test('returns in X days for near future', () => {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      expect(formatRelativeDate(threeDaysFromNow)).toBe('in 3 days');
    });
  });
});

describe('formatDuration', () => {
  describe('happy path', () => {
    test('formats milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    test('formats seconds', () => {
      expect(formatDuration(5000)).toBe('5s');
    });

    test('formats minutes', () => {
      expect(formatDuration(90000)).toBe('1m 30s');
    });

    test('formats hours', () => {
      expect(formatDuration(3660000)).toBe('1h 1m');
    });
  });

  describe('edge cases', () => {
    test('handles zero', () => {
      expect(formatDuration(0)).toBe('0ms');
    });

    test('handles exactly one second', () => {
      expect(formatDuration(1000)).toBe('1s');
    });

    test('handles exactly one minute', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
    });
  });
});

describe('cleanStageName', () => {
  describe('happy path', () => {
    test('cleans Closed Won stage', () => {
      expect(cleanStageName('Stage 6. Closed(Won)')).toBe('Closed Won');
    });

    test('cleans Closed Lost stage', () => {
      expect(cleanStageName('Stage 7. Closed(Lost)')).toBe('Closed Lost');
    });

    test('cleans variant format', () => {
      expect(cleanStageName('Stage 6.Closed(Won)')).toBe('Closed Won');
    });

    test('passes through other stages unchanged', () => {
      expect(cleanStageName('Stage 3 - Pilot')).toBe('Stage 3 - Pilot');
    });
  });

  describe('edge cases', () => {
    test('handles null', () => {
      expect(cleanStageName(null)).toBe('No Stage');
    });

    test('handles undefined', () => {
      expect(cleanStageName(undefined)).toBe('No Stage');
    });

    test('handles empty string', () => {
      expect(cleanStageName('')).toBe('No Stage');
    });
  });
});

describe('formatFieldName', () => {
  describe('happy path', () => {
    test('maps known API name to label', () => {
      expect(formatFieldName('StageName')).toBe('Stage');
      expect(formatFieldName('CloseDate')).toBe('Close Date');
      expect(formatFieldName('Owner.Name')).toBe('Owner');
    });

    test('formats unknown field names', () => {
      const result = formatFieldName('Some_Custom_Field__c');
      // Should replace underscores with spaces and add spaces before capitals
      expect(result).toContain('Some');
      expect(result).toContain('Custom');
      expect(result).toContain('Field');
    });
  });

  describe('edge cases', () => {
    test('handles CamelCase', () => {
      const result = formatFieldName('MyCustomField');
      expect(result).toContain('My');
    });
  });
});

describe('truncateText', () => {
  describe('happy path', () => {
    test('truncates long text', () => {
      const longText = 'This is a very long text that needs to be truncated';
      const result = truncateText(longText, 20);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result).toContain('...');
    });

    test('does not truncate short text', () => {
      const shortText = 'Short';
      expect(truncateText(shortText, 50)).toBe('Short');
    });
  });

  describe('edge cases', () => {
    test('handles null', () => {
      expect(truncateText(null)).toBe('');
    });

    test('handles undefined', () => {
      expect(truncateText(undefined)).toBe('');
    });

    test('handles empty string', () => {
      expect(truncateText('')).toBe('');
    });

    test('handles exact length', () => {
      expect(truncateText('12345', 5)).toBe('12345');
    });
  });

  describe('custom suffix', () => {
    test('uses custom suffix', () => {
      const result = truncateText('This is a long text', 15, '…');
      expect(result).toContain('…');
    });
  });
});

describe('formatTable', () => {
  describe('happy path', () => {
    test('formats simple table', () => {
      const data = [
        { name: 'John', age: '30' },
        { name: 'Jane', age: '25' }
      ];
      const columns = [
        { key: 'name', header: 'Name' },
        { key: 'age', header: 'Age' }
      ];
      const result = formatTable(data, columns);
      expect(result).toContain('Name');
      expect(result).toContain('Age');
      expect(result).toContain('John');
      expect(result).toContain('30');
    });
  });

  describe('edge cases', () => {
    test('handles empty array', () => {
      expect(formatTable([], [])).toBe('No data to display');
    });

    test('handles null', () => {
      expect(formatTable(null, [])).toBe('No data to display');
    });
  });
});

describe('formatFileSize', () => {
  describe('happy path', () => {
    test('formats bytes', () => {
      expect(formatFileSize(500)).toBe('500 Bytes');
    });

    test('formats kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
    });

    test('formats megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1 MB');
    });

    test('formats gigabytes', () => {
      expect(formatFileSize(1073741824)).toBe('1 GB');
    });
  });

  describe('edge cases', () => {
    test('handles zero', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
    });

    test('handles decimal KB', () => {
      const result = formatFileSize(1536); // 1.5 KB
      expect(result).toBe('1.5 KB');
    });
  });
});

describe('formatPhoneNumber', () => {
  describe('happy path', () => {
    test('formats 10-digit US phone number', () => {
      expect(formatPhoneNumber('5551234567')).toBe('(555) 123-4567');
    });

    test('formats phone number with existing formatting', () => {
      expect(formatPhoneNumber('555-123-4567')).toBe('(555) 123-4567');
    });
  });

  describe('edge cases', () => {
    test('handles null', () => {
      expect(formatPhoneNumber(null)).toBe('');
    });

    test('handles undefined', () => {
      expect(formatPhoneNumber(undefined)).toBe('');
    });

    test('handles empty string', () => {
      expect(formatPhoneNumber('')).toBe('');
    });

    test('returns original if cannot format', () => {
      expect(formatPhoneNumber('123')).toBe('123');
    });

    test('handles international numbers', () => {
      const result = formatPhoneNumber('+1-555-123-4567');
      expect(result).toBeDefined();
    });
  });
});

