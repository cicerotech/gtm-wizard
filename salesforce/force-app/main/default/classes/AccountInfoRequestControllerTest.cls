@isTest
private class AccountInfoRequestControllerTest {
    @TestSetup
    static void setup() {
        Account a = new Account(Name = 'Test Account');
        insert a;
    }

    @isTest
    static void testSubmitInfoRequest() {
        Account a = [SELECT Id, Name FROM Account WHERE Name = 'Test Account' LIMIT 1];

        Test.startTest();
        Map<String, Object> result = AccountInfoRequestController.submitInfoRequest(
            a.Id,
            new List<String>{ 'Contacts', 'Account Intelligence' },
            'Need updated CLO info'
        );
        Test.stopTest();

        System.assertEquals(true, result.get('success'), 'Should return success');
        System.assert(((String)result.get('message')).contains('Test Account'), 'Message should contain account name');

        List<Task> tasks = [SELECT Subject, Description, WhatId, Status FROM Task WHERE WhatId = :a.Id];
        System.assertEquals(1, tasks.size(), 'Should create one Task');
        System.assert(tasks[0].Subject.contains('[Info Request]'), 'Subject should contain [Info Request]');
        System.assert(tasks[0].Subject.contains('Contacts'), 'Subject should contain request type');
        System.assertEquals('Not Started', tasks[0].Status, 'Status should be Not Started');
    }

    @isTest
    static void testSubmitSingleType() {
        Account a = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];

        Test.startTest();
        Map<String, Object> result = AccountInfoRequestController.submitInfoRequest(
            a.Id,
            new List<String>{ 'Contacts' },
            ''
        );
        Test.stopTest();

        System.assertEquals(true, result.get('success'));
        List<Task> tasks = [SELECT Subject FROM Task WHERE WhatId = :a.Id];
        System.assertEquals(1, tasks.size());
        System.assert(tasks[0].Subject.contains('Contacts'));
    }
}
