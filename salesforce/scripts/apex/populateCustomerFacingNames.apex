// Populate Customer_Facing_Name__c on all products based on David's mapping

Map<String, String> productNameMapping = new Map<String, String>{
    'AI Compliance - Technology' => 'Compliance Platform',
    'AI Contracting - Managed Services' => 'AI-Augmented Contracting Delivery',
    'AI Contracting - Technology' => 'Contracting Platform',
    'AI M&A - Managed Services' => 'AI-Augmented M&A Delivery',
    'AI Platform - Insights' => 'Insights Platform',
    'AI Platform - Litigation' => 'Litigation Platform',
    'AI Platform - Sigma' => 'Sigma Platform',
    'Contracting - Secondee' => 'Secondee (Contracting)',
    'FDE - Custom AI Solution' => 'Custom AI Solution',
    'Other - Managed Service' => 'Managed Service Delivery',
    'Other - Secondee' => 'Secondee (Other)'
};

// Query all products
List<Product2> products = [SELECT Id, Name, ProductCode, Customer_Facing_Name__c FROM Product2];

List<Product2> toUpdate = new List<Product2>();

for (Product2 p : products) {
    String customerFacingName = productNameMapping.get(p.Name);
    if (customerFacingName != null && p.Customer_Facing_Name__c != customerFacingName) {
        p.Customer_Facing_Name__c = customerFacingName;
        toUpdate.add(p);
        System.debug('Updating: ' + p.Name + ' -> ' + customerFacingName);
    }
}

if (!toUpdate.isEmpty()) {
    update toUpdate;
    System.debug('Updated ' + toUpdate.size() + ' products with customer-facing names');
} else {
    System.debug('No products needed updating');
}

// Also set Requires_Delivery__c = true for all products (default)
// This can be adjusted later for pure software subscriptions
List<Product2> allProducts = [SELECT Id, Name, Requires_Delivery__c FROM Product2 WHERE Requires_Delivery__c = false OR Requires_Delivery__c = null];
for (Product2 p : allProducts) {
    p.Requires_Delivery__c = true;
}
if (!allProducts.isEmpty()) {
    update allProducts;
    System.debug('Set Requires_Delivery__c = true for ' + allProducts.size() + ' products');
}
