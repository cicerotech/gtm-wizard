/**
 * Product Line Data Migration Script - January 2026
 * 
 * Purpose: Migrate ALL existing opportunity product line values to new naming
 * 
 * Mappings:
 * - "AI-Augmented M&A - In-House Technology" → "AI-Augmented M&A - Managed Service"
 * - "Sigma" → "AI Platform - Sigma"
 * - "Custom Agents" → "FDE - Custom AI Solution"
 * - "Litigation" → "AI Platform - Litigation"
 * - "Insights" → "AI Platform - Insights"
 * - Any other legacy values → map appropriately
 * 
 * Run in Developer Console: Anonymous Apex
 * 
 * @author RevOps
 * @date January 2026
 */

// Define value mappings: OLD API Name → NEW API Name
Map<String, String> valueMappings = new Map<String, String>{
    // M&A Technology → M&A Managed
    'AI-Augmented M&A - In-House Technology' => 'AI-Augmented M&A - Managed Service',
    
    // Short forms → Full API names
    'Sigma' => 'AI Platform - Sigma',
    'Custom Agents' => 'FDE - Custom AI Solution',
    'Litigation' => 'AI Platform - Litigation',
    'Insights' => 'AI Platform - Insights',
    
    // Legacy formats that might exist
    'AI Platform - Custom Agents' => 'FDE - Custom AI Solution',
    'FDE' => 'FDE - Custom AI Solution',
    'M&A' => 'AI-Augmented M&A - Managed Service',
    'Contracting' => 'AI-Augmented Contracting - Managed Services',
    'Compliance' => 'AI-Augmented Compliance - In-House Technology',
    
    // Augmented short forms
    'Augmented-M&A' => 'AI-Augmented M&A - Managed Service',
    'AI-Augmented M&A' => 'AI-Augmented M&A - Managed Service'
};

// Find all opportunities with product lines set
List<Opportunity> allOppsWithProducts = [
    SELECT Id, Name, Product_Lines_Multi__c, OwnerId, Owner.Name
    FROM Opportunity 
    WHERE Product_Lines_Multi__c != null
    AND Product_Lines_Multi__c != ''
];

System.debug('Found ' + allOppsWithProducts.size() + ' opportunities with product lines');

List<Opportunity> oppsToUpdate = new List<Opportunity>();
Integer migrationCount = 0;

for (Opportunity opp : allOppsWithProducts) {
    String originalValue = opp.Product_Lines_Multi__c;
    List<String> currentValues = originalValue.split(';');
    List<String> newValues = new List<String>();
    Boolean changed = false;
    
    for (String val : currentValues) {
        String trimmedVal = val.trim();
        
        // Check if this value needs mapping
        if (valueMappings.containsKey(trimmedVal)) {
            String newVal = valueMappings.get(trimmedVal);
            // Avoid duplicates
            if (!newValues.contains(newVal)) {
                newValues.add(newVal);
            }
            changed = true;
            System.debug('Mapping: "' + trimmedVal + '" → "' + newVal + '"');
        } else {
            // Keep existing value if no mapping needed
            if (!newValues.contains(trimmedVal)) {
                newValues.add(trimmedVal);
            }
        }
    }
    
    if (changed) {
        String newValueString = String.join(newValues, ';');
        opp.Product_Lines_Multi__c = newValueString;
        oppsToUpdate.add(opp);
        migrationCount++;
        System.debug('Opp: ' + opp.Name + ' | Before: ' + originalValue + ' | After: ' + newValueString);
    }
}

// Summary
System.debug('');
System.debug('═══════════════════════════════════════════');
System.debug('MIGRATION SUMMARY');
System.debug('═══════════════════════════════════════════');
System.debug('Total opps scanned: ' + allOppsWithProducts.size());
System.debug('Opps needing update: ' + oppsToUpdate.size());
System.debug('═══════════════════════════════════════════');

// Execute update
if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('✓ Successfully updated ' + oppsToUpdate.size() + ' opportunities');
}

// List opps that still have legacy/unmapped values for manual review
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

System.debug('');
System.debug('Checking for any remaining unmapped values...');

List<Opportunity> refreshedOpps = [
    SELECT Id, Name, Product_Lines_Multi__c, Owner.Name
    FROM Opportunity 
    WHERE Product_Lines_Multi__c != null
    AND Product_Lines_Multi__c != ''
];

Set<String> unmappedValues = new Set<String>();
for (Opportunity opp : refreshedOpps) {
    for (String val : opp.Product_Lines_Multi__c.split(';')) {
        String trimmed = val.trim();
        if (!validAPINames.contains(trimmed) && String.isNotBlank(trimmed)) {
            unmappedValues.add(trimmed);
            System.debug('⚠️ Unmapped value found: "' + trimmed + '" on opp: ' + opp.Name);
        }
    }
}

if (unmappedValues.isEmpty()) {
    System.debug('✓ All values are properly mapped!');
} else {
    System.debug('');
    System.debug('⚠️ ATTENTION: Found ' + unmappedValues.size() + ' unmapped values:');
    for (String val : unmappedValues) {
        System.debug('   - ' + val);
    }
}
