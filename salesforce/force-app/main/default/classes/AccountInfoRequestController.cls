public with sharing class AccountInfoRequestController {
    @AuraEnabled
    public static Map<String, Object> submitInfoRequest(
        Id accountId,
        List<String> requestTypes,
        String additionalDetail
    ) {
        Account acct = [SELECT Name, Owner.Name FROM Account WHERE Id = :accountId LIMIT 1];
        String typeStr = String.join(requestTypes, ', ');

        Task t = new Task(
            Subject = '[Info Request] ' + typeStr,
            Description = 'Requested by: ' + UserInfo.getName() + '\n'
                + 'Account: ' + acct.Name + '\n'
                + 'Types: ' + typeStr + '\n'
                + (String.isNotBlank(additionalDetail) ? 'Detail: ' + additionalDetail : ''),
            WhatId = accountId,
            OwnerId = UserInfo.getUserId(),
            Status = 'Not Started',
            Priority = 'Normal',
            ActivityDate = Date.today().addDays(3)
        );
        insert t;

        Info_Request__e evt = new Info_Request__e(
            Account_Name__c = acct.Name,
            Account_Id__c = String.valueOf(accountId),
            Request_Types__c = typeStr,
            Additional_Detail__c = additionalDetail,
            Requested_By__c = UserInfo.getName(),
            Account_Owner__c = acct.Owner.Name
        );
        EventBus.publish(evt);

        return new Map<String, Object>{
            'success' => true,
            'message' => 'Request submitted for ' + acct.Name
        };
    }
}
