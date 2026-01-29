/**
 * COMPLETE PRODUCT NAMING FIX
 * 
 * This script:
 * 1. Updates Product2 names (Price Book products)
 * 2. Migrates Opportunity Product_Lines_Multi__c values
 * 
 * Execute in: Developer Console → Debug → Open Execute Anonymous Window
 */

// ════════════════════════════════════════════════════════════════════════════
// STEP 1: UPDATE PRODUCT NAMES (Price Book)
// ════════════════════════════════════════════════════════════════════════════

Map<String, String> productNameUpdates = new Map<String, String>{
    'AI-Augmented Contracting - In-House Technology' => 'AI Contracting – Technology',
    'AI-Augmented Contracting - Managed Services' => 'AI Contracting – Managed Services',
    'AI-Augmented Compliance - In-House Technology' => 'AI Compliance – Technology',
    'AI-Augmented M&A - In-House Technology' => 'AI M&A – Managed Services',
    'AI-Augmented M&A - Managed Service' => 'AI M&A – Managed Services',
    'Sigma' => 'AI Platform – Sigma',
    'Custom Agents' => 'FDE – Custom AI Solution',
    'Litigation' => 'AI Platform – Litigation'
};

List<Product2> productsToUpdate = new List<Product2>();
for (Product2 p : [SELECT Id, Name FROM Product2]) {
    if (productNameUpdates.containsKey(p.Name)) {
        System.debug('Product: "' + p.Name + '" → "' + productNameUpdates.get(p.Name) + '"');
        p.Name = productNameUpdates.get(p.Name);
        productsToUpdate.add(p);
    }
}

System.debug('');
System.debug('════════════════════════════════════════════════════════════════');
System.debug('PRODUCTS TO UPDATE: ' + productsToUpdate.size());
System.debug('════════════════════════════════════════════════════════════════');

if (!productsToUpdate.isEmpty()) {
    update productsToUpdate;
    System.debug('✅ Updated ' + productsToUpdate.size() + ' products');
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 2: UPDATE OPPORTUNITY PRODUCT LINES (Multi-Select Values)
// ════════════════════════════════════════════════════════════════════════════

// Map old API values to new API values
Map<String, String> valueUpdates = new Map<String, String>{
    'Sigma' => 'AI Platform - Sigma',
    'Litigation' => 'AI Platform - Litigation',
    'Custom Agents' => 'FDE - Custom AI Solution',
    'AI-Augmented M&A - In-House Technology' => 'AI-Augmented M&A - Managed Service'
};

List<Opportunity> oppsToUpdate = new List<Opportunity>();

for (Opportunity opp : [SELECT Id, Name, Product_Lines_Multi__c FROM Opportunity WHERE Product_Lines_Multi__c != null]) {
    String originalValue = opp.Product_Lines_Multi__c;
    List<String> values = originalValue.split(';');
    List<String> newValues = new List<String>();
    Boolean changed = false;
    
    for (String val : values) {
        String trimmed = val.trim();
        if (valueUpdates.containsKey(trimmed)) {
            newValues.add(valueUpdates.get(trimmed));
            changed = true;
        } else {
            newValues.add(trimmed);
        }
    }
    
    if (changed) {
        opp.Product_Lines_Multi__c = String.join(newValues, ';');
        oppsToUpdate.add(opp);
        System.debug('Opp: ' + opp.Name);
        System.debug('  From: ' + originalValue);
        System.debug('  To:   ' + opp.Product_Lines_Multi__c);
    }
}

System.debug('');
System.debug('════════════════════════════════════════════════════════════════');
System.debug('OPPORTUNITIES TO UPDATE: ' + oppsToUpdate.size());
System.debug('════════════════════════════════════════════════════════════════');

if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('✅ Updated ' + oppsToUpdate.size() + ' opportunities');
}

// ════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════════════════
System.debug('');
System.debug('════════════════════════════════════════════════════════════════');
System.debug('COMPLETE');
System.debug('════════════════════════════════════════════════════════════════');
System.debug('Products updated: ' + productsToUpdate.size());
System.debug('Opportunities updated: ' + oppsToUpdate.size());


