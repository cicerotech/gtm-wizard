/**
 * Test class for BLMetricsCalculationService using real org data
 * Separate from main test class because it uses SeeAllData
 * 
 * @author GTM Brain
 * @date January 2026
 */
@isTest(SeeAllData=true)
private class BLMetricsRealDataTest {
    
    @isTest
    static void testWithRealOpportunities() {
        // This test uses real org data to test the ramp date calculation
        // which requires actual Opportunity records
        
        // Get any existing BL who has closed won opportunities
        List<User> blsWithOpps = [
            SELECT Id, Name FROM User 
            WHERE Id IN (
                SELECT OwnerId FROM Opportunity 
                WHERE StageName = 'Stage 6. Closed(Won)'
            )
            AND IsActive = true
            LIMIT 1
        ];
        
        if (blsWithOpps.isEmpty()) {
            // No BLs with opportunities - skip this test
            System.debug('No BLs with closed won opportunities found - skipping test');
            return;
        }
        
        User bl = blsWithOpps[0];
        
        // Check if this BL already has a metrics record
        List<BL_Performance_Metrics__c> existing = [
            SELECT Id FROM BL_Performance_Metrics__c 
            WHERE Business_Lead__c = :bl.Id
        ];
        
        if (!existing.isEmpty()) {
            // Use existing record
            BL_Performance_Metrics__c metrics = existing[0];
            metrics.Active__c = true;
            metrics.Start_Date__c = Date.newInstance(2023, 1, 1);
            metrics.Ramp_Milestone__c = 100;
            update metrics;
        } else {
            // Create a metrics record for this BL
            BL_Performance_Metrics__c metrics = new BL_Performance_Metrics__c(
                Business_Lead__c = bl.Id,
                Pod__c = 'US',
                Start_Date__c = Date.newInstance(2023, 1, 1),
                Ramp_Milestone__c = 100,
                Active__c = true
            );
            insert metrics;
        }
        
        Test.startTest();
        BLMetricsCalculationService.calculateAllMetrics();
        Test.stopTest();
        
        // Verify metrics were calculated
        BL_Performance_Metrics__c resultMetrics = [
            SELECT Total_Closed_Won_ACV__c, Ramp_Achieved_Date__c, Days_to_Ramp__c, Last_Calculated__c
            FROM BL_Performance_Metrics__c 
            WHERE Business_Lead__c = :bl.Id
            LIMIT 1
        ];
        
        System.assertNotEquals(null, resultMetrics.Last_Calculated__c, 'Last calculated should be set');
    }
    
    @isTest
    static void testFiscalDatesWithRealData() {
        // Test fiscal date calculations
        Date fyStart = BLMetricsCalculationService.getFiscalYearStart();
        Date fqStart = BLMetricsCalculationService.getFiscalQuarterStart();
        
        System.assertNotEquals(null, fyStart, 'FY start should not be null');
        System.assertNotEquals(null, fqStart, 'FQ start should not be null');
        System.assertEquals(1, fyStart.day(), 'FY should start on first of month');
        System.assertEquals(1, fqStart.day(), 'FQ should start on first of month');
    }
}

