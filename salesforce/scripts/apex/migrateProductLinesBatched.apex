// ═══════════════════════════════════════════════════════════════════════════
// BATCHED PRODUCT LINE MIGRATION - Run multiple times if needed
// Processes only 10 records per execution to avoid SOQL limits
// ═══════════════════════════════════════════════════════════════════════════

Map<String, String> valueMappings = new Map<String, String>{
    'AI-Augmented Contracting - In-House Technology' => 'AI Contracting - Technology',
    'AI-Augmented Contracting - Managed Services' => 'AI Contracting - Managed Services',
    'AI-Augmented Compliance - In-House Technology' => 'AI Compliance - Technology',
    'AI-Augmented M&A - In-House Technology' => 'AI M&A - Managed Services',
    'AI-Augmented M&A - Managed Service' => 'AI M&A - Managed Services',
    'Sigma' => 'AI Platform - Sigma',
    'Litigation' => 'AI Platform - Litigation',
    'Custom Agents' => 'FDE - Custom AI Solution'
};

// Only process 10 at a time
Integer BATCH_SIZE = 10;
List<Opportunity> oppsToUpdate = new List<Opportunity>();
Integer totalRemaining = 0;

for (Opportunity opp : [
    SELECT Id, Name, Product_Lines_Multi__c, Product_Line__c 
    FROM Opportunity 
    WHERE Product_Lines_Multi__c != null
    LIMIT 200
]) {
    Boolean needsUpdate = false;
    
    // Check multi-select
    if (opp.Product_Lines_Multi__c != null) {
        for (String oldVal : valueMappings.keySet()) {
            if (opp.Product_Lines_Multi__c.contains(oldVal)) {
                needsUpdate = true;
                break;
            }
        }
    }
    
    // Check single-select
    if (opp.Product_Line__c != null && valueMappings.containsKey(opp.Product_Line__c)) {
        needsUpdate = true;
    }
    
    if (needsUpdate) {
        if (oppsToUpdate.size() < BATCH_SIZE) {
            // Update multi-select
            if (opp.Product_Lines_Multi__c != null) {
                String original = opp.Product_Lines_Multi__c;
                List<String> values = original.split(';');
                List<String> newValues = new List<String>();
                for (String val : values) {
                    String trimmed = val.trim();
                    if (valueMappings.containsKey(trimmed)) {
                        newValues.add(valueMappings.get(trimmed));
                    } else {
                        newValues.add(trimmed);
                    }
                }
                opp.Product_Lines_Multi__c = String.join(newValues, ';');
                System.debug('MULTI: ' + opp.Name + ' | ' + original + ' → ' + opp.Product_Lines_Multi__c);
            }
            
            // Update single-select
            if (opp.Product_Line__c != null && valueMappings.containsKey(opp.Product_Line__c)) {
                String original = opp.Product_Line__c;
                opp.Product_Line__c = valueMappings.get(original);
                System.debug('SINGLE: ' + opp.Name + ' | ' + original + ' → ' + opp.Product_Line__c);
            }
            
            oppsToUpdate.add(opp);
        } else {
            totalRemaining++;
        }
    }
}

if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('═══════════════════════════════════════════════════════════════');
    System.debug('✅ UPDATED ' + oppsToUpdate.size() + ' OPPORTUNITIES');
    if (totalRemaining > 0) {
        System.debug('⚠️ ' + totalRemaining + ' MORE REMAINING - RUN THIS SCRIPT AGAIN');
    } else {
        System.debug('✅ ALL DONE - NO MORE RECORDS TO MIGRATE');
    }
    System.debug('═══════════════════════════════════════════════════════════════');
} else {
    System.debug('═══════════════════════════════════════════════════════════════');
    System.debug('✅ NO MORE RECORDS TO MIGRATE - ALL CLEAN!');
    System.debug('═══════════════════════════════════════════════════════════════');
}


