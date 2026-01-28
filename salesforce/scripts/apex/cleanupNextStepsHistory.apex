/**
 * Cleanup Next Steps History Field
 * 
 * This script removes HTML <br> tags and escaped HTML entities from
 * the Next_Step_Eudia__c (Customer history + Next steps) field.
 * 
 * Converts:
 *   "<br>" → newline
 *   "&lt;br&gt;" → newline  
 *   "&amp;lt;br&amp;gt;" → newline
 *   "---<br>" → "---" + newline
 * 
 * Run once to clean up existing data.
 */

// Query open opportunities (can't filter Long Text Area at all in SOQL)
List<Opportunity> oppsToUpdate = new List<Opportunity>();

List<Opportunity> oppsWithHistory = [
    SELECT Id, Name, Next_Step_Eudia__c
    FROM Opportunity
    WHERE IsClosed = false
    LIMIT 500
];

System.debug('Found ' + oppsWithHistory.size() + ' opportunities with HTML in history');

for (Opportunity opp : oppsWithHistory) {
    String original = opp.Next_Step_Eudia__c;
    
    // Skip if null or empty
    if (String.isBlank(original)) {
        continue;
    }
    
    // Skip if no HTML entities found
    if (!original.contains('<br>') && !original.contains('&lt;') && !original.contains('&amp;') && !original.contains('&gt;')) {
        continue;
    }
    
    String cleaned = original;
    
    // Replace various HTML entities and tags with newlines
    // Order matters - do most escaped versions first
    
    // Triple-escaped
    cleaned = cleaned.replace('&amp;amp;lt;br&amp;amp;gt;', '\n');
    cleaned = cleaned.replace('&amp;amp;lt;', '');
    cleaned = cleaned.replace('&amp;amp;gt;', '');
    
    // Double-escaped  
    cleaned = cleaned.replace('&amp;lt;br&amp;gt;', '\n');
    cleaned = cleaned.replace('&amp;lt;', '');
    cleaned = cleaned.replace('&amp;gt;', '');
    
    // Single-escaped
    cleaned = cleaned.replace('&lt;br&gt;', '\n');
    cleaned = cleaned.replace('&lt;', '');
    cleaned = cleaned.replace('&gt;', '');
    
    // Raw HTML
    cleaned = cleaned.replace('<br>', '\n');
    cleaned = cleaned.replace('<br/>', '\n');
    cleaned = cleaned.replace('<BR>', '\n');
    
    // Clean up multiple consecutive newlines (more than 2)
    while (cleaned.contains('\n\n\n')) {
        cleaned = cleaned.replace('\n\n\n', '\n\n');
    }
    
    // Clean up --- separators to have proper spacing
    cleaned = cleaned.replace('\n---\n', '\n\n---\n\n');
    cleaned = cleaned.replace('---\n', '\n---\n\n');
    cleaned = cleaned.replace('\n---', '\n\n---\n');
    
    // Avoid too many newlines around separators
    while (cleaned.contains('\n\n\n---')) {
        cleaned = cleaned.replace('\n\n\n---', '\n\n---');
    }
    while (cleaned.contains('---\n\n\n')) {
        cleaned = cleaned.replace('---\n\n\n', '---\n\n');
    }
    
    if (cleaned != original) {
        opp.Next_Step_Eudia__c = cleaned;
        oppsToUpdate.add(opp);
        
        System.debug('---');
        System.debug('Opp: ' + opp.Name);
        System.debug('BEFORE: ' + original.left(200));
        System.debug('AFTER: ' + cleaned.left(200));
    }
}

if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('');
    System.debug('========================================');
    System.debug('Cleaned up ' + oppsToUpdate.size() + ' opportunities');
    System.debug('========================================');
} else {
    System.debug('No opportunities needed cleanup');
}

