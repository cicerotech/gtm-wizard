// Backfill Deal Codes for all historical Closed Won opportunities
// Processes non-renewals first (by CloseDate ASC), then renewals
// Safe: only touches opportunities where BOI_Deal_Code__c is null
// Idempotent: won't overwrite existing codes

BOIDealCodeService.backfillExistingWonOpps();
