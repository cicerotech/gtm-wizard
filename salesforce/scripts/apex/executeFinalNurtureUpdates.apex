// ═══════════════════════════════════════════════════════════════════════════
// FINAL COMBINED UPDATE SCRIPT
// Total: 32 Opportunities to Close + Account Nurture Updates
// ═══════════════════════════════════════════════════════════════════════════

List<Opportunity> oppsToUpdate = new List<Opportunity>();

// ═══════════════════════════════════════════════════════════════════════════
// PART 1A: ORIGINAL 5 OPPS (from Asad/Ananth specific notes)
// ═══════════════════════════════════════════════════════════════════════════

// 1. KLARNA - Never met
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000P2T4LIAV',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Never Met',
    Closed_Lost_Detail__c = 'Never met. Move to nurture / reassign.',
    Closed_Lost_Date__c = Date.today()
));

// 2. LINEAGE - Went to RFP
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000Irsj3IAB',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'RFP Process',
    Closed_Lost_Detail__c = 'Went to RFP. Move to nurture / reassign.',
    Closed_Lost_Date__c = Date.today()
));

// 3. NOVARTIS - No path to CLO
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000GVQoMIAX',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'No Path to DM',
    Closed_Lost_Detail__c = 'No direct path to CLO. DGC / HOLO trap. Move to nurture / reassign.',
    Closed_Lost_Date__c = Date.today()
));

// 4. SANTANDER - Timing (consolidated AI)
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000MugUYIAZ',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Timing',
    Closed_Lost_Detail__c = 'Consolidated AI initiatives to another business unit - my business unit GC went cold. Move to nurture / reassign.',
    Closed_Lost_Date__c = Date.today()
));

// 5. SKIMS - Not qualified
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000JxxE1IAJ',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Not Qualified',
    Closed_Lost_Detail__c = 'Not qualified. Limited budget. Move to nurture / reassign.',
    Closed_Lost_Date__c = Date.today()
));

// ═══════════════════════════════════════════════════════════════════════════
// PART 1B: ANANTH'S STAGE 0 OPPORTUNITIES (20) - All Unresponsive
// ═══════════════════════════════════════════════════════════════════════════

// 6. Albacore Capital Group
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000LT1XjIAL',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 7. Alder
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000M9a1BIAR',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 8. Attack Capital
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000M9aijIAB',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 9. BlueEarth Capital
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000LTOajIAH',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 10. Capvest
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000M9ZJdIAN',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 11. Cardinal Health
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000M9YdhIAF',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 12. Delcor
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000Gu2acIAB',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 13. Discord
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000K481tIAB',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 14. Five Capital
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000M9aM9IAJ',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 15. Freeport-McMoRan
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000GZ9TpIAL',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 16. Graybar Electric
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000I2nDbIAJ',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 17. GTIS Partners
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000LXzTdIAL',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 18. Heidrick & Struggles
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000LTOm1IAH',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 19. Intercorp
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000M9aXRIAZ',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 20. Percheron Capital
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000GpBg9IAF',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 21. Publicis Group
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000LesyTIAR',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 22. Scout Motors
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000M9aqnIAB',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 23. SoundPoint Capital
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000LTOXVIA5',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 24. Symphony Technology Partners
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000LRiSJIA1',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 25. Together Fund (NOT keeping - was false match)
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000M9b5JIAR',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 26. UBS
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000LTOhBIAX',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// ═══════════════════════════════════════════════════════════════════════════
// PART 1C: ANANTH'S STAGE 1 OPPORTUNITIES (6) - All Unresponsive
// KEEPING: GE Healthcare, GE Vernova (x2), Citadel, Liberty Mutual
// ═══════════════════════════════════════════════════════════════════════════

// 27. Advent
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000GpCdpIAF',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 28. Carlyle
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000IP4UHIA1',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 29. HG
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000GvbsrIAB',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 30. Kelly Services
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000LWNQQIA5',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 31. Palomar Holdings
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000JEiSsIAL',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 32. TPG
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000IReAHIA1',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

// 33. Tucker's Farm
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000HCsFlIAL',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Unresponsive',
    Closed_Lost_Detail__c = 'Q1 clean slate. No response / engagement.',
    Closed_Lost_Date__c = Date.today()
));

System.debug('═══════════════════════════════════════════════════════════════');
System.debug('TOTAL OPPORTUNITIES TO CLOSE: ' + oppsToUpdate.size());
System.debug('═══════════════════════════════════════════════════════════════');

// Output each opp for verification
for (Integer i = 0; i < oppsToUpdate.size(); i++) {
    Opportunity opp = oppsToUpdate[i];
    System.debug((i+1) + '. ' + opp.Id + ' | ' + opp.Closed_Lost_Reason__c + ' | ' + opp.Closed_Lost_Detail__c.left(50));
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 2: ACCOUNT NURTURE UPDATES
// ═══════════════════════════════════════════════════════════════════════════

// Get all Account IDs from the opportunities we're closing
Set<Id> oppIds = new Set<Id>();
for (Opportunity opp : oppsToUpdate) {
    oppIds.add(opp.Id);
}

// Query the current account IDs
List<Opportunity> oppsWithAccounts = [SELECT AccountId, Account.Name, Account.Nurture__c FROM Opportunity WHERE Id IN :oppIds];

Set<Id> accountIdsToUpdate = new Set<Id>();
for (Opportunity opp : oppsWithAccounts) {
    if (opp.Account.Nurture__c != true) {
        accountIdsToUpdate.add(opp.AccountId);
    }
}

// Also add the 33 accounts from original list that have no open opps
List<String> additionalAccountIds = new List<String>{
    '001Wj00000WElj9IAD', // American Arbitration Association
    '001Wj00000hewsXIAQ', // Amkor
    '001Hp00003kIrExIAK', // Applied Materials
    '001Hp00003kIrEzIAK', // Archer Daniels Midland
    '001Wj00000gGYAQIA4', // Autodesk
    '001Wj00000c6DHyIAM', // BetterUp
    '001Hp00003kIrFeIAK', // Booz Allen Hamilton
    '001Wj00000XiYqzIAF', // Canva
    '001Hp00003kIrG0IAK', // Carrier Global
    '001Hp00003kIrGfIAK', // Corning
    '001Wj00000fgfGuIAI', // Cyware
    '001Wj00000duIWrIAM', // Deepmind
    '001Wj00000dheQNIAY', // Emory
    '001Hp00003kIrHsIAK', // FedEx
    '001Wj00000lMcwTIAS', // Flo Health
    '001Wj00000dw1gbIAA', // Glean
    '001Wj00000d7IL8IAM', // IAC
    '001Wj00000gH7uaIAC', // JFrog
    '001Wj00000bWIxqIAG', // Motiva
    '001Wj00000hVTTBIA4', // One Oncology
    '001Wj00000Y6VVWIA3', // Oscar Health
    '001Wj00000YE3bzIAD', // Palantir
    '001Wj00000eLHLOIA4', // Palo Alto Networks
    '001Hp00003kIrLxIAK', // Republic Services
    '001Wj00000eL760IAC', // Shell
    '001Wj00000aCGR3IAO', // Solventum
    '001Hp00003kIrMcIAK', // SpaceX
    '001Wj00000SdYHqIAN', // Spotify
    '001Hp00003kIrDlIAK', // StoneX Group
    '001Wj00000WYtsUIAT', // Tenable
    '001Hp00003kIrN5IAK', // Tesla
    '001Wj00000c0wRKIAY', // The Initial Group
    '001Hp00003kIrCsIAK'  // UPS
};

// Query which of these need updating
List<Account> additionalAccounts = [SELECT Id, Name, Nurture__c FROM Account WHERE Id IN :additionalAccountIds AND Nurture__c != true];

List<Account> accountsToUpdate = new List<Account>();
for (Id accId : accountIdsToUpdate) {
    accountsToUpdate.add(new Account(Id = accId, Nurture__c = true));
}
for (Account acc : additionalAccounts) {
    accountsToUpdate.add(new Account(Id = acc.Id, Nurture__c = true));
}

System.debug('');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('ACCOUNTS TO SET NURTURE = TRUE: ' + accountsToUpdate.size());
System.debug('═══════════════════════════════════════════════════════════════');

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

System.debug('');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('FINAL EXECUTION SUMMARY');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('Opportunities to close to Stage 7. Closed Lost: ' + oppsToUpdate.size());
System.debug('Accounts to set Nurture = true: ' + accountsToUpdate.size());
System.debug('');
System.debug('KEEPING (not closing):');
System.debug('  - 006Wj00000L5nf7IAB | Citadel');
System.debug('  - 006Wj00000Fzzh3IAB | GE Healthcare');
System.debug('  - 006Wj00000HlxVtIAJ | GE Vernova - M&A');
System.debug('  - 006Wj00000K00PVIAZ | GE Vernova - Contracting');
System.debug('  - 006Wj00000PejjBIAR | Liberty Mutual Insurance');
System.debug('');
System.debug('⚠️  UNCOMMENT THE LINES BELOW TO EXECUTE');
System.debug('═══════════════════════════════════════════════════════════════');

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTE
// ═══════════════════════════════════════════════════════════════════════════

update oppsToUpdate;
System.debug('✅ CLOSED ' + oppsToUpdate.size() + ' opportunities');

update accountsToUpdate;
System.debug('✅ SET NURTURE=TRUE on ' + accountsToUpdate.size() + ' accounts');
