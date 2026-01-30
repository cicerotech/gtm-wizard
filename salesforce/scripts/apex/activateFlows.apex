// List all Flow versions to understand the structure
// Note: This uses the FlowVersionView which is queryable

System.debug('=== CHECKING FLOW VERSIONS ===');

// Query flows that are relevant
List<String> flowNames = new List<String>{
    'Sync_MultiSelect_To_Products',
    'Sync_ProductLine_To_Multi_On_Create',
    'Update_Delivery_Forecast_Status'
};

for (String flowName : flowNames) {
    System.debug('\n--- ' + flowName + ' ---');
    
    // We can't directly activate flows via Apex, but we can show the status
    // The user will need to activate via Setup UI
    
    // Query the Flow by DeveloperName using a workaround
    Http http = new Http();
    HttpRequest request = new HttpRequest();
    request.setEndpoint(URL.getOrgDomainUrl().toExternalForm() + '/services/data/v59.0/tooling/query/?q=SELECT+Id,ActiveVersionId,LatestVersionId,DeveloperName+FROM+FlowDefinition+WHERE+DeveloperName=\'' + flowName + '\'');
    request.setMethod('GET');
    request.setHeader('Authorization', 'Bearer ' + UserInfo.getSessionId());
    request.setHeader('Content-Type', 'application/json');
    
    try {
        HttpResponse response = http.send(request);
        System.debug('Response: ' + response.getBody());
    } catch (Exception e) {
        System.debug('Error querying ' + flowName + ': ' + e.getMessage());
    }
}

System.debug('\n=== TO ACTIVATE FLOWS ===');
System.debug('1. Go to Setup → Flows');
System.debug('2. Find "Sync MultiSelect To Products"');
System.debug('3. Click the dropdown → View Details and Versions');
System.debug('4. Find the latest version and click Activate');
System.debug('Or the user can use the Salesforce UI to activate.');
