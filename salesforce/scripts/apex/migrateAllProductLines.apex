// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE PRODUCT LINE MIGRATION
// Migrates ALL old "Augmented" values to new clean naming
// ═══════════════════════════════════════════════════════════════════════════

Map<String, String> valueMappings = new Map<String, String>{
    // CONTRACTING
    'AI-Augmented Contracting - In-House Technology' => 'AI Contracting - Technology',
    'AI-Augmented Contracting - Managed Services' => 'AI Contracting - Managed Services',
    
    // COMPLIANCE
    'AI-Augmented Compliance - In-House Technology' => 'AI Compliance - Technology',
    
    // M&A - Both old variants go to Managed Services
    'AI-Augmented M&A - In-House Technology' => 'AI M&A - Managed Services',
    'AI-Augmented M&A - Managed Service' => 'AI M&A - Managed Services',
    
    // PLATFORM
    'Sigma' => 'AI Platform - Sigma',
    'Litigation' => 'AI Platform - Litigation',
    
    // FDE
    'Custom Agents' => 'FDE - Custom AI Solution'
};

// Track changes
Integer multiSelectUpdated = 0;
Integer singleSelectUpdated = 0;
List<String> changesLog = new List<String>();

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATE MULTI-SELECT FIELD (Product_Lines_Multi__c)
// ═══════════════════════════════════════════════════════════════════════════

List<Opportunity> oppsToUpdate = new List<Opportunity>();

for (Opportunity opp : [
    SELECT Id, Name, Product_Lines_Multi__c, Product_Line__c 
    FROM Opportunity 
    WHERE Product_Lines_Multi__c != null
]) {
    String original = opp.Product_Lines_Multi__c;
    List<String> values = original.split(';');
    List<String> newValues = new List<String>();
    Boolean changed = false;
    
    for (String val : values) {
        String trimmed = val.trim();
        if (valueMappings.containsKey(trimmed)) {
            newValues.add(valueMappings.get(trimmed));
            changed = true;
        } else {
            newValues.add(trimmed);
        }
    }
    
    if (changed) {
        String newValue = String.join(newValues, ';');
        opp.Product_Lines_Multi__c = newValue;
        oppsToUpdate.add(opp);
        changesLog.add('MULTI: ' + opp.Name + ' | ' + original + ' → ' + newValue);
        multiSelectUpdated++;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATE SINGLE-SELECT FIELD (Product_Line__c)
// ═══════════════════════════════════════════════════════════════════════════

for (Opportunity opp : [
    SELECT Id, Name, Product_Line__c 
    FROM Opportunity 
    WHERE Product_Line__c != null
]) {
    String original = opp.Product_Line__c;
    
    if (valueMappings.containsKey(original)) {
        String newValue = valueMappings.get(original);
        opp.Product_Line__c = newValue;
        
        // Check if already in update list
        Boolean alreadyInList = false;
        for (Opportunity existingOpp : oppsToUpdate) {
            if (existingOpp.Id == opp.Id) {
                existingOpp.Product_Line__c = newValue;
                alreadyInList = true;
                break;
            }
        }
        if (!alreadyInList) {
            oppsToUpdate.add(opp);
        }
        
        changesLog.add('SINGLE: ' + opp.Name + ' | ' + original + ' → ' + newValue);
        singleSelectUpdated++;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// APPLY UPDATES
// ═══════════════════════════════════════════════════════════════════════════

if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════════

System.debug('═══════════════════════════════════════════════════════════════');
System.debug('PRODUCT LINE MIGRATION COMPLETE');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('Multi-select values updated: ' + multiSelectUpdated);
System.debug('Single-select values updated: ' + singleSelectUpdated);
System.debug('Total opportunities modified: ' + oppsToUpdate.size());
System.debug('═══════════════════════════════════════════════════════════════');

for (String log : changesLog) {
    System.debug(log);
}

System.debug('═══════════════════════════════════════════════════════════════');
System.debug('✅ ALL "AUGMENTED" VALUES REMOVED - MIGRATION COMPLETE');
System.debug('═══════════════════════════════════════════════════════════════');


