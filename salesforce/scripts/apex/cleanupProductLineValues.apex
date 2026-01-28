/**
 * Cleanup Product Line values - fix underscores and case issues
 * 
 * This script:
 * 1. Replaces underscores with " - " in Product_Lines_Multi__c
 * 2. Fixes case issues (sigma → Sigma)
 * 3. Maps old formats to new standard formats
 * 
 * Run with "Sync MultiSelect To Products" flow DEACTIVATED to avoid triggering product creation
 */

// Define the corrections needed
Map<String, String> corrections = new Map<String, String>{
    // Underscore fixes
    'AI-Augmented Contracting_In-House Technology' => 'AI-Augmented Contracting - In-House Technology',
    'AI-Augmented Contracting_Managed Services' => 'AI-Augmented Contracting - Managed Services',
    'AI-Augmented Compliance_In-House Technology' => 'AI-Augmented Compliance - In-House Technology',
    'AI-Augmented M&A_In-House Technology' => 'AI-Augmented M&A - In-House Technology',
    'AI-Augmented M&A_Managed Service' => 'AI-Augmented M&A - Managed Service',
    'Other_Managed Service' => 'Other - Managed Service',
    'Other_Secondee' => 'Other - Secondee',
    
    // Product line renames (Jan 2026)
    'Sigma' => 'AI Platform - Sigma',
    'sigma' => 'AI Platform - Sigma',
    'Litigation' => 'AI Platform - Litigation',
    'Custom Agents' => 'FDE - Custom AI Solution',
    
    // Legacy format fixes
    'Augmented-M&A' => 'AI-Augmented M&A - In-House Technology'
};

// Query opportunities with Product_Lines_Multi__c set
List<Opportunity> oppsToCheck = [
    SELECT Id, Name, Product_Lines_Multi__c
    FROM Opportunity
    WHERE Product_Lines_Multi__c != null
    AND IsClosed = false
    LIMIT 500
];

System.debug('Checking ' + oppsToCheck.size() + ' opportunities for cleanup');

List<Opportunity> oppsToUpdate = new List<Opportunity>();
Integer fixCount = 0;

for (Opportunity opp : oppsToCheck) {
    String original = opp.Product_Lines_Multi__c;
    String fixed = original;
    Boolean wasFixed = false;
    
    // Check each correction
    for (String badValue : corrections.keySet()) {
        if (fixed.contains(badValue)) {
            fixed = fixed.replace(badValue, corrections.get(badValue));
            wasFixed = true;
        }
    }
    
    if (wasFixed && fixed != original) {
        opp.Product_Lines_Multi__c = fixed;
        oppsToUpdate.add(opp);
        fixCount++;
        System.debug('Fixed: ' + opp.Name);
        System.debug('  From: ' + original);
        System.debug('  To:   ' + fixed);
    }
}

if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('=== CLEANUP COMPLETE ===');
    System.debug('Fixed ' + fixCount + ' opportunities');
} else {
    System.debug('No opportunities needed cleanup');
}

