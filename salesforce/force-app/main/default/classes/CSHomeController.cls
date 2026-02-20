/**
 * CSHomeController
 * 
 * Apex controller for the Customer Success Home Dashboard LWC.
 * Provides account health data, late-stage pipeline (CS Staffing),
 * existing customer expansion pipeline, and contract renewal timelines.
 * 
 * NOTE: All pipeline views use Target_LOI_Date__c (Target Sign Date),
 *       never CloseDate.
 * 
 * @author GTM Brain
 * @date February 2026
 */
public with sharing class CSHomeController {

    // ── Account Health ──

    @AuraEnabled(cacheable=true)
    public static AccountHealthSummary getAccountHealth() {
        AccountHealthSummary summary = new AccountHealthSummary();

        List<Account> accounts = [
            SELECT Id, Name, Health__c, CSM__r.Name, Customer_Type__c,
                Customer_Subtype__c, Account_Health_Overview__c, Owner.Name
            FROM Account
            WHERE Customer_Type__c = 'Existing'
            AND Health__c != null
            ORDER BY Health__c ASC, Name ASC
        ];

        for (Account a : accounts) {
            AccountHealthRow row = new AccountHealthRow(a);
            summary.accounts.add(row);

            if (a.Health__c == 'Green') summary.greenCount++;
            else if (a.Health__c == 'Yellow') summary.yellowCount++;
            else if (a.Health__c == 'Red') summary.redCount++;
        }
        summary.totalAccounts = accounts.size();
        return summary;
    }

    // ── Late-Stage CS Pipeline (S3+ with CS Staffing Flag) ──

    @AuraEnabled(cacheable=true)
    public static CSPipelineSummary getLateStageCSPipeline() {
        CSPipelineSummary summary = new CSPipelineSummary();

        List<Opportunity> opps = [
            SELECT Id, Name, Account.Name, ACV__c, StageName, 
                Target_LOI_Date__c, Owner.Name, Pod__c, Product_Line__c,
                BL_Forecast_Category__c, Probability, CreatedDate,
                Account.Customer_Type__c
            FROM Opportunity
            WHERE IsClosed = false
            AND CS_Staffing__c = true
            ORDER BY Pod__c, Owner.Name, ACV__c DESC
        ];

        // Get WoW changes for these deals
        Set<Id> oppIds = new Set<Id>();
        for (Opportunity o : opps) oppIds.add(o.Id);
        Map<Id, Map<String, PipelineReviewController.FieldChange>> changeMap =
            PipelineReviewController.getFieldChanges(oppIds, 7);

        for (Opportunity opp : opps) {
            CSPipelineRow row = new CSPipelineRow(opp, changeMap.get(opp.Id));
            summary.deals.add(row);
            summary.totalACV += (opp.ACV__c != null ? opp.ACV__c : 0);

            if (opp.StageName != null && opp.StageName.startsWith('Stage 4')) {
                summary.stage4Count++;
                summary.stage4ACV += (opp.ACV__c != null ? opp.ACV__c : 0);
            } else if (opp.StageName != null && opp.StageName.startsWith('Stage 5')) {
                summary.stage5Count++;
                summary.stage5ACV += (opp.ACV__c != null ? opp.ACV__c : 0);
            } else {
                summary.otherStageCount++;
            }
        }
        summary.totalDeals = opps.size();
        return summary;
    }

    // ── Existing Customer Expansion Pipeline ──

    @AuraEnabled(cacheable=true)
    public static List<CSPipelineRow> getExpansionPipeline() {
        List<Opportunity> opps = [
            SELECT Id, Name, Account.Name, ACV__c, StageName,
                Target_LOI_Date__c, Owner.Name, Pod__c, Product_Line__c,
                BL_Forecast_Category__c, Probability, CreatedDate,
                Account.Customer_Type__c
            FROM Opportunity
            WHERE IsClosed = false
            AND Account.Customer_Type__c = 'Existing'
            ORDER BY ACV__c DESC
            LIMIT 50
        ];

        Set<Id> oppIds = new Set<Id>();
        for (Opportunity o : opps) oppIds.add(o.Id);
        Map<Id, Map<String, PipelineReviewController.FieldChange>> changeMap =
            PipelineReviewController.getFieldChanges(oppIds, 7);

        List<CSPipelineRow> rows = new List<CSPipelineRow>();
        for (Opportunity opp : opps) {
            rows.add(new CSPipelineRow(opp, changeMap.get(opp.Id)));
        }
        return rows;
    }

    // ── Upcoming Contract Renewals (forward-looking only) ──

    @AuraEnabled(cacheable=true)
    public static List<ContractRow> getContractRenewals() {
        List<ContractRow> rows = new List<ContractRow>();

        // Only show contracts with EndDate from TODAY onward (forward-looking)
        // Ordered by soonest ending first so CS sees what needs attention next
        for (Contract c : [
            SELECT Id, Account.Name, Account.Health__c, Account.CSM__r.Name,
                StartDate, EndDate, Status
            FROM Contract
            WHERE Account.Customer_Type__c = 'Existing'
            AND EndDate >= TODAY
            ORDER BY EndDate ASC
            LIMIT 50
        ]) {
            rows.add(new ContractRow(c));
        }
        return rows;
    }

    // ── Inner Classes ──

    public class AccountHealthSummary {
        @AuraEnabled public Integer totalAccounts = 0;
        @AuraEnabled public Integer greenCount = 0;
        @AuraEnabled public Integer yellowCount = 0;
        @AuraEnabled public Integer redCount = 0;
        @AuraEnabled public List<AccountHealthRow> accounts = new List<AccountHealthRow>();
    }

    public class AccountHealthRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String health;
        @AuraEnabled public String csmName;
        @AuraEnabled public String ownerName;
        @AuraEnabled public String customerType;
        @AuraEnabled public String customerSubtype;
        @AuraEnabled public String healthOverview;

        public AccountHealthRow(Account a) {
            this.id = a.Id;
            this.name = a.Name;
            this.health = a.Health__c;
            this.csmName = a.CSM__r?.Name;
            this.ownerName = a.Owner?.Name;
            this.customerType = a.Customer_Type__c;
            this.customerSubtype = a.Customer_Subtype__c;
            this.healthOverview = a.Account_Health_Overview__c;
        }
    }

    public class CSPipelineSummary {
        @AuraEnabled public Integer totalDeals = 0;
        @AuraEnabled public Decimal totalACV = 0;
        @AuraEnabled public Integer stage4Count = 0;
        @AuraEnabled public Decimal stage4ACV = 0;
        @AuraEnabled public Integer stage5Count = 0;
        @AuraEnabled public Decimal stage5ACV = 0;
        @AuraEnabled public Integer otherStageCount = 0;
        @AuraEnabled public List<CSPipelineRow> deals = new List<CSPipelineRow>();
    }

    public class CSPipelineRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String accountName;
        @AuraEnabled public Decimal acv;
        @AuraEnabled public String stage;
        @AuraEnabled public String stageShort;
        @AuraEnabled public Date targetSign;
        @AuraEnabled public String ownerName;
        @AuraEnabled public String pod;
        @AuraEnabled public String productLine;
        @AuraEnabled public String forecastCategory;
        @AuraEnabled public Decimal probability;
        @AuraEnabled public Boolean isExisting;
        // WoW
        @AuraEnabled public Decimal acvDelta;
        @AuraEnabled public Boolean stageChanged;
        @AuraEnabled public Integer stageDir;
        @AuraEnabled public Integer targetDeltaDays;
        @AuraEnabled public Boolean anyChange;
        @AuraEnabled public String wowSummary;

        public CSPipelineRow(Opportunity opp, Map<String, PipelineReviewController.FieldChange> changes) {
            this.id = opp.Id;
            this.name = opp.Name;
            this.accountName = opp.Account?.Name;
            this.acv = opp.ACV__c;
            this.stage = opp.StageName;
            this.stageShort = abbreviateStage(opp.StageName);
            this.targetSign = opp.Target_LOI_Date__c;
            this.ownerName = opp.Owner?.Name;
            this.pod = opp.Pod__c;
            this.productLine = opp.Product_Line__c;
            this.forecastCategory = opp.BL_Forecast_Category__c;
            this.probability = opp.Probability;
            this.isExisting = opp.Account?.Customer_Type__c == 'Existing';

            // WoW defaults
            this.acvDelta = 0;
            this.stageChanged = false;
            this.stageDir = 0;
            this.targetDeltaDays = 0;
            this.anyChange = false;

            if (changes != null && !changes.isEmpty()) {
                this.anyChange = true;

                PipelineReviewController.FieldChange acvC = changes.get('ACV__c');
                if (acvC != null) this.acvDelta = acvC.numericDelta();

                PipelineReviewController.FieldChange stageC = changes.get('StageName');
                if (stageC != null) {
                    this.stageChanged = true;
                    this.stageDir = stageC.newValue != null && stageC.oldValue != null ?
                        (extractStageNum(String.valueOf(stageC.newValue)) > extractStageNum(String.valueOf(stageC.oldValue)) ? 1 : -1) : 0;
                }

                PipelineReviewController.FieldChange targetC = changes.get('Target_LOI_Date__c');
                if (targetC != null) this.targetDeltaDays = targetC.daysDelta();
            }

            this.wowSummary = buildWoW();
        }

        private String buildWoW() {
            if (!this.anyChange) return '';
            List<String> parts = new List<String>();
            if (this.acvDelta != 0) {
                String dir = this.acvDelta > 0 ? '↑' : '↓';
                parts.add(dir + ' ACV');
            }
            if (this.stageChanged) parts.add('Stage ' + (this.stageDir > 0 ? '↑' : '↓'));
            if (this.targetDeltaDays > 7) parts.add('Target +' + this.targetDeltaDays + 'd');
            else if (this.targetDeltaDays < -3) parts.add('Target ' + this.targetDeltaDays + 'd');
            return String.join(parts, ' · ');
        }
    }

    public class ContractRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String accountName;
        @AuraEnabled public String health;
        @AuraEnabled public String csmName;
        @AuraEnabled public Date startDate;
        @AuraEnabled public Date endDate;
        @AuraEnabled public String status;
        @AuraEnabled public Integer daysUntilEnd;
        @AuraEnabled public Boolean isExpired;

        public ContractRow(Contract c) {
            this.id = c.Id;
            this.accountName = c.Account?.Name;
            this.health = c.Account?.Health__c;
            this.csmName = c.Account?.CSM__r?.Name;
            this.startDate = c.StartDate;
            this.endDate = c.EndDate;
            this.status = c.Status;
            this.isExpired = c.EndDate != null && c.EndDate < Date.today();
            this.daysUntilEnd = c.EndDate != null ? Date.today().daysBetween(c.EndDate) : 0;
        }
    }

    private static String abbreviateStage(String stageName) {
        if (stageName == null) return '';
        if (stageName.startsWith('Stage 0')) return 'S0';
        if (stageName.startsWith('Stage 1')) return 'S1';
        if (stageName.startsWith('Stage 2')) return 'S2';
        if (stageName.startsWith('Stage 3')) return 'S3';
        if (stageName.startsWith('Stage 4')) return 'S4';
        if (stageName.startsWith('Stage 5')) return 'S5';
        if (stageName.contains('Won')) return 'Won';
        if (stageName.contains('Lost')) return 'Lost';
        return stageName;
    }

    // ── Inline Edit: Save Account Health ──

    @AuraEnabled
    public static void saveAccountHealth(Id accountId, String health, String healthOverview) {
        Account acct = new Account(Id = accountId);
        if (health != null) acct.Health__c = health;
        if (healthOverview != null) acct.Account_Health_Overview__c = healthOverview;
        update acct;
    }

    // ── Inline Edit: Save CS Outcome ──

    @AuraEnabled
    public static void saveCSOutcome(Id accountId, String outcome) {
        Account acct = new Account(Id = accountId);
        acct.CS_Outcome_Data__c = outcome;
        update acct;
    }

    // ── Gate Criteria: Validate Stage 5 CSM Request ──

    @AuraEnabled
    public static String validateCSMRequest(Id opportunityId) {
        Opportunity opp = [
            SELECT Id, CSM_Requested__c, CS_Key_Stakeholders__c, CS_Products_Purchased__c,
                   CS_Commercial_Terms__c, CS_Contract_Term__c, CS_Auto_Renew__c, CS_Customer_Goals__c
            FROM Opportunity WHERE Id = :opportunityId LIMIT 1
        ];

        List<String> missing = new List<String>();
        if (String.isBlank(opp.CS_Key_Stakeholders__c)) missing.add('Key Stakeholders');
        if (String.isBlank(opp.CS_Products_Purchased__c)) missing.add('Products Purchased');
        if (String.isBlank(opp.CS_Commercial_Terms__c)) missing.add('Commercial Terms');
        if (String.isBlank(opp.CS_Contract_Term__c)) missing.add('Contract Term');
        if (opp.CS_Auto_Renew__c == null) missing.add('Auto-Renew');
        if (String.isBlank(opp.CS_Customer_Goals__c)) missing.add('Customer Goals');

        if (!missing.isEmpty()) {
            return 'Missing required fields before requesting CSM: ' + String.join(missing, ', ');
        }
        return 'OK';
    }

    // ── Get CS Outcomes for accounts ──

    @AuraEnabled(cacheable=true)
    public static List<OutcomeRow> getCSOutcomes() {
        List<OutcomeRow> rows = new List<OutcomeRow>();
        for (Account a : [
            SELECT Id, Name, CS_Outcome_Data__c, Health__c,
                (SELECT Product_Line__c, ACV__c FROM Opportunities WHERE IsWon = true ORDER BY CloseDate DESC LIMIT 5)
            FROM Account WHERE Customer_Type__c = 'Existing' AND Health__c != null
            ORDER BY Name LIMIT 100
        ]) {
            OutcomeRow row = new OutcomeRow();
            row.id = a.Id;
            row.name = a.Name;
            row.health = a.Health__c;
            row.outcome = a.CS_Outcome_Data__c;
            row.url = '/' + a.Id;
            row.products = '';
            if (a.Opportunities != null) {
                Set<String> prods = new Set<String>();
                for (Opportunity o : a.Opportunities) {
                    if (o.Product_Line__c != null) prods.add(o.Product_Line__c);
                }
                row.products = String.join(new List<String>(prods), ', ');
            }
            rows.add(row);
        }
        return rows;
    }

    public class OutcomeRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String health;
        @AuraEnabled public String outcome;
        @AuraEnabled public String products;
        @AuraEnabled public String url;
    }

    private static Integer extractStageNum(String stageName) {
        if (stageName == null) return -1;
        if (stageName.startsWith('Stage 0')) return 0;
        if (stageName.startsWith('Stage 1')) return 1;
        if (stageName.startsWith('Stage 2')) return 2;
        if (stageName.startsWith('Stage 3')) return 3;
        if (stageName.startsWith('Stage 4')) return 4;
        if (stageName.startsWith('Stage 5')) return 5;
        if (stageName.contains('Won')) return 6;
        if (stageName.contains('Lost')) return -1;
        return -1;
    }
}