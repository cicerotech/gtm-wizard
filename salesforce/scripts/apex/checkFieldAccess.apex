// Check FLS for Product Lines fields
Map<String, Schema.SObjectField> fieldMap = Schema.SObjectType.Opportunity.fields.getMap();

List<String> fieldsToCheck = new List<String>{
    'Product_Line__c',
    'Product_Lines_Multi__c', 
    'Product_Lines_Text__c',
    'Products_Breakdown__c',
    'Products_Summary__c'
};

System.debug('=== Field Accessibility Check ===');
for (String fieldName : fieldsToCheck) {
    String lowerFieldName = fieldName.toLowerCase();
    if (fieldMap.containsKey(lowerFieldName)) {
        Schema.DescribeFieldResult dfr = fieldMap.get(lowerFieldName).getDescribe();
        System.debug(fieldName + ':');
        System.debug('  Accessible: ' + dfr.isAccessible());
        System.debug('  Filterable: ' + dfr.isFilterable());
        System.debug('  Sortable: ' + dfr.isSortable());
        System.debug('  Type: ' + dfr.getType());
    } else {
        System.debug(fieldName + ': FIELD NOT FOUND IN SCHEMA');
    }
}

