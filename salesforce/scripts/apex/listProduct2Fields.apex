// List all fields on Product2
Set<String> fields = Schema.SObjectType.Product2.fields.getMap().keySet();
System.debug('Product2 fields: ' + fields);

// Check for our specific fields
Boolean hasCustomerFacing = Schema.SObjectType.Product2.fields.getMap().containsKey('Customer_Facing_Name__c');
Boolean hasRequiresDelivery = Schema.SObjectType.Product2.fields.getMap().containsKey('Requires_Delivery__c');

System.debug('Has Customer_Facing_Name__c: ' + hasCustomerFacing);
System.debug('Has Requires_Delivery__c: ' + hasRequiresDelivery);
