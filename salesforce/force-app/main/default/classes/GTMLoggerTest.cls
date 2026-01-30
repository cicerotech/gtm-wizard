/**
 * GTMLoggerTest
 * Test class for GTMLogger utility
 */
@isTest
private class GTMLoggerTest {
    
    @isTest
    static void testGenerateCorrelationId() {
        String correlationId = GTMLogger.generateCorrelationId();
        System.assertNotEquals(null, correlationId, 'Correlation ID should not be null');
        System.assert(correlationId.contains('-'), 'Correlation ID should contain hyphen separator');
    }
    
    @isTest
    static void testLogInfo() {
        Test.startTest();
        GTMLogger.log('INFO', 'Test message', new Map<String, Object>{'key' => 'value'});
        GTMLogger.info('Simple info message');
        GTMLogger.info('Info with context', new Map<String, Object>{'accountId' => '001xxx'});
        Test.stopTest();
        // No assertions needed - just verify no exceptions thrown
    }
    
    @isTest
    static void testLogWarn() {
        Test.startTest();
        GTMLogger.warn('Warning message', new Map<String, Object>{'severity' => 'medium'});
        Test.stopTest();
    }
    
    @isTest
    static void testLogDebug() {
        Test.startTest();
        GTMLogger.debug('Debug message', new Map<String, Object>{'detail' => 'value'});
        Test.stopTest();
    }
    
    @isTest
    static void testLogError() {
        Test.startTest();
        try {
            throw new TestException('Test error');
        } catch (Exception e) {
            GTMLogger.logError('Operation failed', e, new Map<String, Object>{'operation' => 'test'});
        }
        GTMLogger.error('Error without exception', new Map<String, Object>{'reason' => 'test'});
        Test.stopTest();
    }
    
    @isTest
    static void testOperationLifecycle() {
        Test.startTest();
        
        String correlationId = GTMLogger.operationStart('TestOperation', new Map<String, Object>{'input' => 'value'});
        System.assertNotEquals(null, correlationId, 'Should return correlation ID');
        
        GTMLogger.operationSuccess('TestOperation', correlationId, new Map<String, Object>{'recordsProcessed' => 10});
        
        Test.stopTest();
    }
    
    @isTest
    static void testOperationError() {
        Test.startTest();
        
        String correlationId = GTMLogger.operationStart('FailingOperation', null);
        
        try {
            throw new TestException('Simulated failure');
        } catch (Exception e) {
            GTMLogger.operationError('FailingOperation', correlationId, e, new Map<String, Object>{'step' => 'processing'});
        }
        
        Test.stopTest();
    }
    
    @isTest
    static void testPriorityLogging() {
        Test.startTest();
        GTMLogger.priority('P1', 'TemplateApplication', 'Template applied successfully', new Map<String, Object>{'fileId' => 'abc123'});
        GTMLogger.priority('P2', 'SnapshotCreation', 'Created 15 snapshots', new Map<String, Object>{'count' => 15});
        Test.stopTest();
    }
    
    @isTest
    static void testNullContext() {
        Test.startTest();
        GTMLogger.log('INFO', 'Message with null context', null);
        GTMLogger.operationStart('OpWithNullContext', null);
        GTMLogger.operationSuccess('OpWithNullContext', 'test-123', null);
        Test.stopTest();
    }
    
    private class TestException extends Exception {}
}
