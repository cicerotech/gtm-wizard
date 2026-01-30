// List all fields on Delivery__c
Set<String> fields = Schema.SObjectType.Delivery__c.fields.getMap().keySet();
System.debug('Delivery__c field count: ' + fields.size());
System.debug('Delivery__c fields: ' + fields);

// Check for our specific new fields
Boolean hasDeliveryName = Schema.SObjectType.Delivery__c.fields.getMap().containsKey('Delivery_Name__c');
Boolean hasForecastStatus = Schema.SObjectType.Delivery__c.fields.getMap().containsKey('Forecast_Status__c');
Boolean hasProductCode = Schema.SObjectType.Delivery__c.fields.getMap().containsKey('Product_Code__c');

System.debug('Has Delivery_Name__c: ' + hasDeliveryName);
System.debug('Has Forecast_Status__c: ' + hasForecastStatus);
System.debug('Has Product_Code__c: ' + hasProductCode);
