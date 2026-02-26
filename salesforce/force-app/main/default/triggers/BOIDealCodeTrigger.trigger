/**
 * BOIDealCodeTrigger
 * Fires on Opportunity after update to generate Deal Codes on Closed Won.
 * Format: [CLIENT_PREFIX]-[SEQ] for new deals, [CLIENT_PREFIX]-[SEQ]-[RENEWAL] for renewals.
 */
trigger BOIDealCodeTrigger on Opportunity (after update) {
    BOIDealCodeService.generateCodes(Trigger.new, Trigger.oldMap);
}
