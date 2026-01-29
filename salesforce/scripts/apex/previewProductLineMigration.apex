/**
 * PREVIEW ONLY - Product Line Migration Analysis
 * 
 * This script DOES NOT make any changes.
 * It only reports what values exist and what would be migrated.
 * 
 * Run this FIRST to review before running the actual migration.
 * 
 * @author RevOps
 * @date January 2026
 */

// Define value mappings: OLD stored value → NEW API value
Map<String, String> valueMappings = new Map<String, String>{
    // Short forms → Full API names (these need migration)
    'Sigma' => 'AI Platform - Sigma',
    'Litigation' => 'AI Platform - Litigation',
    'Custom Agents' => 'FDE - Custom AI Solution',
    'Insights' => 'AI Platform - Insights',
    
    // M&A Technology → M&A Managed (deactivated value)
    'AI-Augmented M&A - In-House Technology' => 'AI-Augmented M&A - Managed Service'
};

// Valid API names (values that should NOT be changed)
Set<String> validAPINames = new Set<String>{
    'AI-Augmented Contracting - In-House Technology',
    'AI-Augmented Contracting - Managed Services',
    'Contracting - Secondee',
    'AI-Augmented Compliance - In-House Technology',
    'AI-Augmented M&A - Managed Service',
    'AI Platform - Sigma',
    'AI Platform - Insights',
    'AI Platform - Litigation',
    'FDE - Custom AI Solution',
    'Other - Managed Service',
    'Other - Secondee',
    'Undetermined',
    'Multiple (BL Review)'
};

// Query all opportunities with product lines
List<Opportunity> allOpps = [
    SELECT Id, Name, Product_Lines_Multi__c, Owner.Name, StageName
    FROM Opportunity 
    WHERE Product_Lines_Multi__c != null
    AND Product_Lines_Multi__c != ''
    ORDER BY Owner.Name, Name
];

System.debug('═══════════════════════════════════════════════════════════════');
System.debug('PRODUCT LINE MIGRATION PREVIEW');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('Total opportunities with product lines: ' + allOpps.size());
System.debug('');

// Track statistics
Map<String, Integer> valueCounts = new Map<String, Integer>();
Map<String, List<String>> valueToOpps = new Map<String, List<String>>();
List<String> changesPreview = new List<String>();

for (Opportunity opp : allOpps) {
    List<String> values = opp.Product_Lines_Multi__c.split(';');
    
    for (String val : values) {
        String trimmed = val.trim();
        if (String.isBlank(trimmed)) continue;
        
        // Count occurrences
        if (!valueCounts.containsKey(trimmed)) {
            valueCounts.put(trimmed, 0);
            valueToOpps.put(trimmed, new List<String>());
        }
        valueCounts.put(trimmed, valueCounts.get(trimmed) + 1);
        valueToOpps.get(trimmed).add(opp.Name + ' (' + opp.Owner.Name + ')');
        
        // Check if this value needs migration
        if (valueMappings.containsKey(trimmed)) {
            String newVal = valueMappings.get(trimmed);
            changesPreview.add('WILL CHANGE: "' + trimmed + '" → "' + newVal + '" on: ' + opp.Name);
        }
    }
}

// Report 1: All unique values found
System.debug('───────────────────────────────────────────────────────────────');
System.debug('ALL UNIQUE VALUES FOUND:');
System.debug('───────────────────────────────────────────────────────────────');

for (String val : valueCounts.keySet()) {
    Integer count = valueCounts.get(val);
    Boolean isValid = validAPINames.contains(val);
    Boolean needsMigration = valueMappings.containsKey(val);
    
    String status = '';
    if (isValid) {
        status = '✓ VALID';
    } else if (needsMigration) {
        status = '→ NEEDS MIGRATION to: ' + valueMappings.get(val);
    } else {
        status = '⚠️ UNKNOWN (not in valid list or mappings)';
    }
    
    System.debug('"' + val + '" - Count: ' + count + ' - ' + status);
}

// Report 2: Values that need migration
System.debug('');
System.debug('───────────────────────────────────────────────────────────────');
System.debug('VALUES THAT NEED MIGRATION:');
System.debug('───────────────────────────────────────────────────────────────');

Integer migrationCount = 0;
for (String oldVal : valueMappings.keySet()) {
    if (valueCounts.containsKey(oldVal)) {
        Integer count = valueCounts.get(oldVal);
        String newVal = valueMappings.get(oldVal);
        migrationCount += count;
        System.debug('"' + oldVal + '" → "' + newVal + '" (' + count + ' records)');
        
        // Show affected opps
        List<String> affectedOpps = valueToOpps.get(oldVal);
        for (String oppName : affectedOpps) {
            System.debug('   • ' + oppName);
        }
    }
}

if (migrationCount == 0) {
    System.debug('No values need migration.');
}

// Report 3: Unknown values (not valid, not in mappings)
System.debug('');
System.debug('───────────────────────────────────────────────────────────────');
System.debug('UNKNOWN VALUES (need review):');
System.debug('───────────────────────────────────────────────────────────────');

Boolean hasUnknown = false;
for (String val : valueCounts.keySet()) {
    if (!validAPINames.contains(val) && !valueMappings.containsKey(val)) {
        hasUnknown = true;
        System.debug('⚠️ "' + val + '" (' + valueCounts.get(val) + ' records)');
        List<String> affectedOpps = valueToOpps.get(val);
        for (String oppName : affectedOpps) {
            System.debug('   • ' + oppName);
        }
    }
}

if (!hasUnknown) {
    System.debug('✓ No unknown values - all values are either valid or have mappings.');
}

System.debug('');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('SUMMARY');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('Total unique values: ' + valueCounts.size());
System.debug('Records needing migration: ' + migrationCount);
System.debug('');
System.debug('>>> THIS WAS A PREVIEW ONLY - NO CHANGES MADE <<<');
System.debug('>>> Run migrateProductLineNaming.apex to apply changes <<<');

