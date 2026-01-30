// Delete the corrupted fields using Metadata API
Metadata.DeployContainer container = new Metadata.DeployContainer();

// For Product2 custom fields, we can't delete via Apex. 
// Just list the fields to confirm they're not in schema
System.debug('Checking Product2 fields...');
Map<String, Schema.SObjectField> fieldMap = Schema.SObjectType.Product2.fields.getMap();
for (String fieldName : fieldMap.keySet()) {
    if (fieldName.contains('custom') || fieldName.contains('facing') || fieldName.contains('delivery')) {
        System.debug('Found field: ' + fieldName);
    }
}
System.debug('Total Product2 fields: ' + fieldMap.size());
