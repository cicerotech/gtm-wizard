/**
 * Update Product Names to Simplified Naming
 * 
 * Removes "Augmented" and updates to align with new naming convention:
 * - AI-Augmented Contracting - In-House Technology → AI Contracting – Technology
 * - AI-Augmented Contracting - Managed Services → AI Contracting – Managed Services
 * - etc.
 * 
 * ⚠️ RUN IN SANDBOX FIRST
 * Execute in: Developer Console → Debug → Open Execute Anonymous Window
 */

// Define name mappings (old name → new name)
Map<String, String> nameUpdates = new Map<String, String>{
    'AI-Augmented Contracting - In-House Technology' => 'AI Contracting – Technology',
    'AI-Augmented Contracting - Managed Services' => 'AI Contracting – Managed Services',
    'AI-Augmented Compliance - In-House Technology' => 'AI Compliance – Technology',
    'AI-Augmented M&A - In-House Technology' => 'AI M&A – Technology',
    'AI-Augmented M&A - Managed Service' => 'AI M&A – Managed Services',
    'Sigma' => 'AI Platform – Sigma',
    'Custom Agents' => 'FDE – Custom AI Solution',
    'Litigation' => 'AI Platform – Litigation'
};

// Query all products that need updating
List<Product2> productsToUpdate = new List<Product2>();

for (Product2 p : [SELECT Id, Name, ProductCode, IsActive FROM Product2]) {
    if (nameUpdates.containsKey(p.Name)) {
        String newName = nameUpdates.get(p.Name);
        System.debug('Will update: "' + p.Name + '" → "' + newName + '"');
        p.Name = newName;
        productsToUpdate.add(p);
    }
}

System.debug('');
System.debug('════════════════════════════════════════════════════════════════');
System.debug('PRODUCT NAME UPDATE PREVIEW');
System.debug('════════════════════════════════════════════════════════════════');
System.debug('Products to update: ' + productsToUpdate.size());
System.debug('');

if (!productsToUpdate.isEmpty()) {
    // Uncomment the next line to actually apply the updates
    // update productsToUpdate;
    
    System.debug('⚠️ DRY RUN - No changes made');
    System.debug('To apply changes, uncomment the "update productsToUpdate;" line above');
} else {
    System.debug('✅ No products need updating - names are already current');
}

// Show all current products for reference
System.debug('');
System.debug('════════════════════════════════════════════════════════════════');
System.debug('ALL CURRENT PRODUCTS:');
System.debug('════════════════════════════════════════════════════════════════');
for (Product2 p : [SELECT Id, Name, ProductCode, Family, IsActive FROM Product2 ORDER BY Family, Name]) {
    String status = p.IsActive ? '✓' : '✗';
    System.debug(status + ' [' + (p.Family != null ? p.Family : 'No Family') + '] ' + p.Name);
}


