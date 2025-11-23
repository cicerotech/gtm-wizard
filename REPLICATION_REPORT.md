# Salesforce Object Replication Report

Generated: 2025-11-21T17:08:57.377Z

## Objects to Create: 220

### 1. Advanced Settings (pse__Advanced_Settings__c)
   - 3 custom fields
   - Fields: Force RPGPR Time Period Update, Force Synchronous Execution, Enable Performance Logging

### 2. Assignment Daily Note (pse__Assignment_Daily_Note__c)
   - 6 custom fields
   - Fields: Assignment, Date, LastModifiedByUsername, Note, Project, Resource

### 3. Assignment Milestone (pse__Assignment_Milestone__c)
   - 3 custom fields
   - Fields: Assignment, Milestone, Resource Id

### 4. Assignment Project Methodology (pse__Assignment_Project_Methodology__c)
   - 2 custom fields
   - Fields: Assignment, Project Methodology

### 5. Assignment Project Phase (pse__Assignment_Project_Phase__c)
   - 2 custom fields
   - Fields: Assignment, Project Phase

### 6. Assignment Settings (pse__Assignment_Settings__c)
   - 46 custom fields
   - Fields: Adjust Hours Strategy Respects Holidays, Allow Resource Currency Code on Assn, AssigRes IsResource Active Lookup FIlter, AssigRes Is Resource Lookup Filter, Assign Multiple Resources Columns, Assign Resource Custom Lookup Columns, Assign Resource Custom Lookup, Assign Resource Milestone Lookup Columns, Assign Resource Milestone Lookup, Assign Resource Milestone Required, Assignment Name Project Name Max Length, Assignment Name Resource Name Max Length, Auto-Assign: Allow Non-Exact Matching, Auto Share with New Resource, Default Scheduling Strategy, Delete Share from Old Resource, Disable Bill Rate Null Check in Trigger, Disable RPG and Role Filter Defaults, Display Planned Bill Rate, Edit Schedule Default Strategy, Hide Adjust Hours Scheduling Strategy, Hide Custom Scheduling Strategy, Hide Ignore Avail Scheduling Strategy, Hide Level Schedule Scheduling Strategy, Hide Percent Alloc Scheduling Strategy, Hide Zero Hour Scheduling Strategy, Link Assignment Header Tooltip Fields, Link Methodology Header Tooltip Fields, Link Milestone Header Tooltip Fields, Link Phase Header Tooltip Fields, Mass Assign Milestone Editable, Mass Assign Milestone Required, Mass Assign Projects Load Limit, Mass Assignments Default Ignore Holidays, Multi Assign Assignment Fieldset Name, Multi Assign Milestone Fieldset Name, Retain Schedule On Assign, Retain Schedule On Hold, Retain schedule exceptions on update, Role Hidden, Role Required On Creation, Timecard Statuses, Update Project Monitor Fields Batch Size, Update Project Monitor Fields Sync Limit, Use Default Cost Rate Clear on Assigning, Use Scheduled Days for Calculations

### 7. Assignment (pse__Assignment__c)
   - 126 custom fields
   - Fields: API Assignment Correlation ID, Action: Refresh EVA Hours From Timecards, Action: Refresh Expense Roll-Ups, Action: Refresh Hours From Schedule, Action: Refresh Timecard Roll-Ups, Action: Sync with External Calendar, Assignment Daily Notes Last Updated, Assignment Daily Notes, Assignment Number, Average Cost Rate Currency Code, Average Cost Rate Number, Batch Sequence, Bill Rate, Billable Amount In Financials, Billable Amount Submitted, Billable Days In Financials, Billable Days Submitted, Billable Expenses In Financials, Billable Expenses Submitted, Billable Hours In Financials, Billable Hours Submitted, Closed for Expense Entry, Closed for Time Entry, Cost Rate Amount, Cost Rate Currency Code, Bill Rate is Daily Rate, Cost Rate is Daily Rate, Daily Timecard Notes Required, Use for Syncing Time from Jira, Description, Foundations Absence Correlation, Eligible for Schedule Recalculation, Estimated Time To Completion, Exclude from External Calendar Sync, Exclude from Utilization, Exclude from Billing, Exclude from Planners, Hours to Days Rule, Billable, Location, Milestone, Nickname, Non-Billable Days In Financials, Non-Billable Days Submitted, Non-Billable Expenses In Financials, Non-Billable Expenses Submitted, Non-Billable Hours In Financials, Non-Billable Hours Submitted, Override Expense Service Line, Override Expense Delivery Model, Override Expense Region, Override RPG Audit Notes, Override RPG Enabled, Override Timecard Cost Service Line, Override Timecard Cost Delivery Model, Override Timecard Cost Region, Override Timecard Revenue Service Line, Override Timecard Revenue Delivery Model, Override Timecard Revenue Region, Percent Allocated, Planned Bill Rate, Planned Hours, Project Task Hours, Project, Projected Revenue, Rate Card, Resource Cost Rate Date, Resource Request, Resource, Role, Schedule Updated, Schedule, Show Assignment Methodologies Only, Show Assignment Milestones Only, Show Assignment Phases Only, Source, Status, Suggested Bill Rate Currency Code, Suggested Bill Rate Number, Team Member Swap Date, Team Member Swapped Out, Team Schedule Slot Key, Team Schedule Slot, Third-Party Expenses App Correlation ID, Time Credited, Time Excluded, Timecard External Costs In Financials, Timecard External Costs Submitted, Timecard Internal Costs In Financials, Timecard Internal Costs Submitted, Use Project Currency For Resource Cost, Use Resource Currency For Resource Cost, Use Resource Default Cost Rate, Use Resource Default Cost Rate as Daily, DEPRECATED: Utilization Run, Average Cost Rate, Batch Sequence Number, Cost Rate, End Date, Planned Revenue (Hours), Scheduled Days, Scheduled Hours, Send to Third-Party Expenses Application, Start Date, Suggested Bill Rate, Services Product, Is Resource Current User, Planner Color, Project Manager Email, Exclude from EVA Calculation, Exclude from Timecard Expense Rollups, Resource Type, Annual Leave Entitlement, Overtime Rate, Consultant Annual Leave Hours (Fixed), Finance Notes, Finance Review, Fixed Monthly Cost Rate, Minimum Hours, Consultant Onboarding Status, Respect Manual Cost Rate, Assignment External ID, Resource email address, Delivery Model, Rating, Rating Score

### 8. Backlog Calculation (pse__Backlog_Calculation__c)
   - 18 custom fields
   - Fields: Batch Id, Calculate Project Backlog, Copy Fields for Current Time Period, End Date, Error Details, Service Line, Include Sublevels, Is Report Master, Post Process Batch Id, Delivery Model, Project, Region, Resource, Reuse Detail Objects, Start Calculating From, Start Date, Status, Time Period Types

### 9. Backlog Detail Converted (pse__Backlog_Detail_Converted__c)
   - 31 custom fields
   - Fields: Backlog Calculation, Backlog Detail, Billings, Bookings, External Time Cost, Held Resource Request External Cost, Held Resource Request Hours, Held Resource Request Internal Cost, Held Resource Request Revenue, Inactive Project Backlog, Internal Time Cost, Is Reusable, Milestone Cost, Milestone Revenue, Project, Resource Requests Cost Held External, Resource Requests Cost Held Internal, Resource Requests Cost Unheld, Resource Requests Hours Held, Resource Requests Hours Unheld, Resource Requests Revenue Held, Resource Requests Revenue Unheld, Scheduled Days, Scheduled Hours, Time Period, Time Revenue, Unheld Resource Request Cost, Unheld Resource Request Hours, Unheld Resource Request Revenue, End Date, Start Date

### 10. Backlog Detail (pse__Backlog_Detail__c)
   - 30 custom fields
   - Fields: Assignment, Backlog Calculation, Billings, Bookings, External Time Cost, Service Line, Held Resource Request External Cost, Held Resource Request Hours, Held Resource Request Internal Cost, Held Resource Request Revenue, Inactive Project Backlog, Internal Time Cost, Is Reusable, Milestone Cost, Milestone Revenue, Delivery Model, Project, Region, Resource, Scheduled Days, Scheduled Hours, Time Period, Time Revenue, Unheld Resource Request Cost, Unheld Resource Request Hours, Unheld Resource Request Revenue, Unscheduled Revenue, End Date, Start Date, Time Period Type

### 11. Backlog (pse__Backlog__c)
   - 16 custom fields
   - Fields: Assignment Batch Size, Backlog Details Corporate Currencies, Copy Fields Default, Default Time Period Types, Delete Details on Calc Deletion, Include Sublevels Default, Milestone Statuses, Post Process Milestone Batch Size, Post Process Project Batch Size, Post Process RPG Batch Size, Post Process Resource Request Batch Size, Resource Request Bill Currency Field, Resource Request Bill Rate Field, Resource Request Cost Currency Field, Resource Request Cost Rate Field, Reuse Detail Objects Default

### 12. Billing Event Batch (pse__Billing_Event_Batch__c)
   - 9 custom fields
   - Fields: Account, Batch Key, Billing Event Calculation, Service Line, Released, Delivery Model, Region, Summary Amount, Time Period

### 13. Billing Event Calculation Detail (pse__Billing_Event_Calculation_Detail__c)
   - 6 custom fields
   - Fields: Billing Event Calculation, Account, Service Line, Delivery Model, Project, Region

### 14. Billing Event Calculation (pse__Billing_Event_Calculation__c)
   - 11 custom fields
   - Fields: Account, Configuration, End Date, Service Line, Include Prior Periods, Locale Information, Delivery Model, Project, Region, Start Date, Time Period

### 15. Billing Event Item (pse__Billing_Event_Item__c)
   - 26 custom fields
   - Fields: Amount, Billing Event Batch, Billing Event Calculation, Billing Event, Budget, Category, Date, Description, Expense, Milestone, Miscellaneous Adjustment, Object Id, Product or Service, Project, Quantity, Rounded Amount, Subcategory, Timecard Split, Unit Price, Invoiced, Released, Summary, Accounting Line Description, Services Product, Unit Price - Credit, Customer Reference

### 16. Billing Event (pse__Billing_Event__c)
   - 22 custom fields
   - Fields: Approver, Billing Contact, Billing Event Batch, Billing Event Calculation, Date, Event Key, Invoice Date, Invoice Number, Invoiced, Approved, Released, Project, Rounded Summary Amount, Skip Sync Check, Status, Summary Amount, Budget Remaining, Account, Automatically Pass to Accounting, Allow Delete Without Validation, Billing Event Stage, Customer Reference

### 17. Billing Queue (pse__Billing_Queue__c)
   - 9 custom fields
   - Fields: Budget, Effective Date, Expense, Milestone, Miscellaneous Adjustment, Project, Timecard, Transaction, Business Record

### 18. Billing (pse__Billing__c)
   - 3 custom fields
   - Fields: Send Failure Email, Send Success Email, Disable Billing Closer to Cap

### 19. Budget Allocation (pse__Budget_Allocation__c)
   - 8 custom fields
   - Fields: Customer Purchase Order, Internal Budget 1, Internal Budget 2 Percent Allocation, Internal Budget 2, Internal Budget 3 Percent Allocation, Internal Budget 3, Project, Internal Budget 1 Percent Allocation

### 20. Budget Header (pse__Budget_Header__c)
   - 21 custom fields
   - Fields: Account, Active, Amount Consumed, Amount Overrun Allowed, Amount Overrun Percentage, Amount, Expense Amount Consumed, Expense Amount Overrun Allowed, Expense Amount Overrun Percentage, Expense Amount, Project, Total Amount Overrun Allowed, Total Amount Overrun Percentage, Type, Amount Remaining, Expense Amount Remaining, Maximum Consumable Total Amount, Percent Total Amount Remaining, Total Amount Consumed, Total Amount Remaining, Total Amount

### 21. Budget (pse__Budget__c)
   - 45 custom fields
   - Fields: Account, Admin Global Edit, Amount, Approved, Approved for Billing, Approver, Audit Notes, Bill Date, Billable, Billed, Billing Event Item, Billing Hold, Budget Header, Description, Effective Date, Exclude from Billing, Expense Amount, Expense Transaction, Include In Financials, Invoice Date, Invoice Number, Invoiced, Opportunity, Override Project Group, Override Project Practice, Override Project Region, DEPRECATED: Pre-Billed Amount, Pre-Billed Amount, Pre-Billed Transaction, Project, Status, Transaction, Type, Billing Event Invoiced, Billing Event Released, Billing Event Status, Billing Event, Eligible for Billing, Override Project Group Currency Code, Override Project Practice Currency Code, Override Project Region Currency Code, Total Amount, Services Product, Amount Consumed, Customer Reference

### 22. Candidate (pse__Candidate__c)
   - 2 custom fields
   - Fields: Resource Request, Resource

### 23. Change Request Settings (pse__Change_Request_Settings__c)
   - 6 custom fields
   - Fields: Budget Name Suffix, Create Change Request Field Set, Default Budget Status, Default Budget Type, Include Budget, Opportunity Name Suffix

### 24. Column Preferences (pse__ColumnPreferences__c)
   - 5 custom fields
   - Fields: Field, Order, Value, Visible, Width

### 25. Column Preferences (pse__Column_Preferences__c)
   - 7 custom fields
   - Fields: Feature, Field, Order, User, Value, Visible, Width

### 26. Common Settings (pse__Common_Settings__c)
   - 3 custom fields
   - Fields: Email When sObject Cloning Fails, Use sObject for Column Preferences, Week Start Day

### 27. Concur Expense Type Mapping (pse__Concur_Expense_Type_Mapping__mdt)
   - 4 custom fields
   - Fields: Active, Concur Expense Category, Concur Expense Type, PSA Expense Type

### 28. Create Billing Documents Batch Log (pse__Create_Billing_Documents_Batch_Log__c)
   - 3 custom fields
   - Fields: Create Billing Documents Batch, Log Type, Message

### 29. Create Billing Documents Batch Settings (pse__Create_Billing_Documents_Batch_Settings__c)
   - 5 custom fields
   - Fields: Create Billing Documents Batch Size, Notifications by Chatter, Notifications by Email, Notification Recipients, Notifications by Task

### 30. Create Billing Documents Batch (pse__Create_Billing_Documents_Batch__c)
   - 8 custom fields
   - Fields: Apex Job ID, Batch Process, Status, Total Number of Aborts, Total Number of Errors, Total Number of External, Total Number of Logs, Notification Type

### 31. Create Project Personal (pse__Create_Project_Personal__c)
   - 33 custom fields
   - Fields: Hide Resource Request Skills, Milestone Opp Product (Opp) Editable, Milestone Opp Product (Tmpl) Read Only, Milestone Opp Product (Tmpl) Editable, Resource Request from Opp Read Only, Budget Editable, Project Details Editable, Resource Skill Request Hidden, Assignment Hidden, Project Location Hidden, Milestone Hidden, Project Methodology Hidden, Project Phase Hidden, Project Details Hidden, Resource Request from Template Hidden, Risk Hidden, Project Task Hidden, Assignment Editable, Assignment Read Only, Project Location Read Only, Milestone Read Only, Project Methodology Read Only, Project Phase Read Only, Resource Request from Template Read Only, Risk Read Only, Project Task Assignment Hidden, Project Location Editable, Milestone Editable, Project Methodology Editable, Project Phase Editable, Resource Request from Template Editable, Risk Editable, Project Task Editable

### 32. Default Assignments for Jira Batch Logs (pse__Default_Assignments_for_Jira_Batch_Logs__c)
   - 4 custom fields
   - Fields: Default Assignments for Jira Batch, Default Assignments Jira Batch Log ID, Log Type, Message

### 33. Default Assignments for Jira Batch (pse__Default_Assignments_for_Jira_Batch__c)
   - 9 custom fields
   - Fields: Apex Job ID, Batch Process, Default Assignments for Jira Batch ID, Status, Total Number of Aborts, Total Number of Errors, Total Number of External, Total Number of Logs, Notification Type

### 34. Default Assignments for Jira Settings (pse__Default_Assignments_for_Jira_Settings__c)
   - 5 custom fields
   - Fields: Default Assignments for Jira Batch Size, Notification Recipients, Notifications by Chatter, Notifications by Email, Notifications by Task

### 35. Foundations PSA Messaging Settings (pse__ERP_PSA_Messaging_Settings__c)
   - 13 custom fields
   - Fields: Absence Filter Field Key, Absence Filter Values, Absence Request Project Frequency, Absence Request Project, Auto-Create Absence Request Project, Automatically Approve API Timecards, Copy Fields on Absence Request Project, Create Records as Active Resources, Update Resource Employment Dates, Worker Account Filter Field Key, Worker Account Filter Values, Worker Filter Field Key, Worker Filter Values

### 36. Est Vs Actuals Settings (pse__Est_Vs_Actuals_Settings__c)
   - 15 custom fields
   - Fields: Adjust Past Est on Records with Actuals, Delete Est Vs Actuals Batch Size, Delete Out of Range Records With Actuals, Generate Custom Time Period Records, Generate Monthly Records, Generate Quarterly Records, Generate Weekly Records, Process Out Of Range Timecards, Timecard Statuses, Update Actuals Batch Size, Update Estimates Batch Size, Update Project Manager Field Batch Size, Update Project Manager From Project, Update Project Manager Field Sync Limit, Disable Automatic Weekly Time Periods

### 37. Est Vs Actuals (pse__Est_Vs_Actuals__c)
   - 31 custom fields
   - Fields: Actual Billable Amount, Actual Days (Aggregated), Actual Days, Actual Hours, Assignment, End Date, Estimated Days, Estimated Hours, Project Currency Exchange Rate, Project Manager, Project, Resource Request Bill Rate, Resource Request Days, Resource Request Hours, Resource Request, Resource, Start Date, Time Period Type, Time Period, Timecards Submitted, Actual Average Bill Rate, Days Percent Variance, Days Variance, Hours Percent Variance, Scheduled Bill Rate, Scheduled Bill Rate is Daily Rate, Hours Variance, End Date Is Last Sunday, High Hours Percent Variance, Project Manager Is Current User, Scheduled Billings

### 38. Expense Approval UI (pse__Expense_Approval_UI__c)
   - 3 custom fields
   - Fields: Number Of Expenses Shown Per Page, Show Number of Expense Lines, Tooltip Fields

### 39. Expense Limit / Rate (pse__Expense_Limit_Rate__c)
   - 15 custom fields
   - Fields: Amount, Cascading, Currency Effective Date, Description, End Date, Service Line, Active, Rate, Delivery Model, Project, Rate Unit, Region, Resource Role, Start Date, Type

### 40. Expense Report (pse__Expense_Report__c)
   - 40 custom fields
   - Fields: Action: Update Include In Financials, Admin Global Edit, Approved, Approver, Assignment, Audit Notes History, Audit Notes, Billable, Lines Billed, Description, Disable Approval Auto Submit, Exclude from Billing, Expense Report Reference, First Expense Date, Include In Financials, Lines Invoiced, Last Expense Date, Milestone, Override Service Line, Override Delivery Model, Override Region, Project Methodology, Project Phase, Project, Reimbursement Currency, Resource, Status, Submitted, Third-Party Expenses App Report ID, Total Billable Amount, Total Non-Billable Amount, Total Reimbursement Amount, Project Expense Notes, Automatically Pass to Accounting, Expense Reimbursement Account, Passed to Accounting, Services Product, Eligible for Payable Credit Note, Eligible for Payable Invoice, Is Resource Current User

### 41. Expense (pse__Expense__c)
   - 91 custom fields
   - Fields: Admin Global Edit, Amount, Applied Expense Rate, Approved, Approved for Billing, Approved for Vendor Payment, Assignment, Attachments moved to ER, Audit Notes History, Audit Notes, Bill Date, Bill Transaction, Billable Fee Flat Amount, Billable Fee Percentage, Billable, Billed, Billing Amount (Pre-Fee Subtotal), Billing Amount, Billing Currency, Billing Event Item, Billing Hold, Cost Transaction, Description, Distance, Exchange Rate (Billing Currency), Exchange Rate (Incurred Currency), Exchange Rate (Reimbursement Currency), Exchange Rate (Resource-Defined), Exclude from Billing, Expense Date, Expense Report, Expense Split Parent, Include In Financials, Incurred Tax Non-Billable, Incurred Tax, Invoice Date, Invoice Number, Invoice Transaction, Invoiced, Lost Receipt, Milestone, Mobile Expense Reference ID, Non-Billable Incurred Amount, Non-Reimbursable, Notes, Override Service Line, Override Delivery Model, Override Rate (Billing Currency), Override Rate (Incurred Currency), Override Rate (Reimbursement Currency), Override Region, Project Methodology, Project Phase, Project, Rate Unit, Recognition Method, Reimbursement Amount In Project Currency, Reimbursement Amount, Reimbursement Currency, Resource, Revenue Transaction, Split Expense, Split Notes, Status, Submitted, Synchronous Update Required, Tax Type, Third-Party Expenses App Expense ID, Type, Vendor Invoice Item, Amount To Bill, Amount To Reimburse, Billable Amount, Billable Fee Flat, Billing Event Invoiced, Billing Event Released, Billing Event Status, Billing Event, Eligible for Billing, Non-Billable Amount, Non-Billable Incurred Subtotal, Override Service Line Currency, Override Delivery Model Currency, Override Region Currency, Process, Reimbursement Tax, Services Product, Net Value - Credit, Net Value, Reimbursement Tax - Credit, Expense Notification

### 42. Experience Skill (pse__Experience_Skill__c)
   - 2 custom fields
   - Fields: Experience, Skill or Certification

### 43. Experience (pse__Experience__c)
   - 7 custom fields
   - Fields: Assignment, Description, Project Task Assignment, Resource, End Date, Hours, Start Date

### 44. External API Credential (pse__External_API_Credential__mdt)
   - 3 custom fields
   - Fields: API URL, Crypto Key, Encrypt

### 45. External Calendar Events Settings (pse__External_Calendar_Events_Settings__c)
   - 10 custom fields
   - Fields: Assignment Calendar Event Title, Assignment Event Description Fieldset, Named Credential for Google, Named Credential for Outlook, PTA Calendar Event Title, PTA Event Description Fieldset, Resource Calendar Id Field, Show as Busy, Sync Assignment with External Calendar, Sync PTA with External Calendar

### 46. External Job (pse__External_Job__c)
   - 3 custom fields
   - Fields: Completed Date, Initiated Date, Status

### 47. External Systems (pse__External_Systems__c)
   - 2 custom fields
   - Fields: Use for Intelligent Staffing, Use for Resource Optimizer

### 48. Filter Set (pse__Filter_Set__c)
   - 7 custom fields
   - Fields: Available In, Filter Set Name, Filters, Is Default, Is Private, Related SObject, SObject

### 49. Filter (pse__Filter__c)
   - 8 custom fields
   - Fields: Filter Set, Custom Filter Arguments, Custom Filter Handler, Field, Is Active, Operator, Value, Filter Set SObject

### 50. Billing Forecast Batch Settings (pse__Forecast_Batch_Settings__c)
   - 6 custom fields
   - Fields: Billing Forecast Batch Size, Maximum Queue Size, Notifications by Chatter, Notifications by Email, Notification Recipients, Notifications by Task

### 51. Billing Forecast Curve Detail (pse__Forecast_Curve_Detail__c)
   - 4 custom fields
   - Fields: Billing Forecast Curve, Percent Burndown, Period, Sequence

### 52. Billing Forecast Curve (pse__Forecast_Curve__c)
   - 3 custom fields
   - Fields: Lag, Total Curve Period, Max Billing Forecast Period

### 53. Billing Forecast Calculation Log (pse__Forecast_Enhanced_Calculation_Log__c)
   - 2 custom fields
   - Fields: Billing Forecast Calculation, Message

### 54. Billing Forecast Calculation (pse__Forecast_Enhanced_Calculation__c)
   - 13 custom fields
   - Fields: Backlog Calculation, Batch Id, Batch Process, Committed, Current, Billing Forecast Setup, Service Line, Delivery Model, Region, Status, Time Period, Total Number of Logs, Related Owner

### 55. Billing Forecast Detail Category (pse__Forecast_Enhanced_Detail_Category__c)
   - 21 custom fields
   - Fields: Billing Forecast Detail, Actuals, Billings: Expenses, Billings: Milestones, Billings: Misc Adjustments, Billings: Timecards, Billing Forecast Override, Billing Forecast Setup Category, Billing Forecast Total Value, Override Created By, Scheduled: Assignments, Scheduled Backlog, Scheduled: Held RRs, Scheduled: Milestones, Scheduled: Unheld RRs, Unscheduled Backlog, Adjusted Value, Category Label, Override Created Date, Override Notes, Override Value

### 56. Billing Forecast Detail (pse__Forecast_Enhanced_Detail__c)
   - 23 custom fields
   - Fields: Billings: Budgets, Billings: Expenses, Billings: Milestones, Billings: Misc Adjustments, Billings: Timecards, Billing Forecast Calculation, Opportunity, Parent Billing Forecast Summary, Perpetual Backlog: Budgets, Perpetual Backlog: Held RRs, Perpetual Backlog: Unheld RRs, Perpetual Billings: Budgets, Perpetual Billings: Expenses, Perpetual Billings: Milestones, Perpetual Billings: Misc Adjustments, Perpetual Billings: Timecards, Project, Scheduled: Assignments, Scheduled: Held Resource Requests, Scheduled: Milestones, Scheduled: Unheld Resource Requests, Unscheduled Backlog, Unscheduled Revenue

### 57. Billing Forecast Override (pse__Forecast_Enhanced_Override__c)
   - 11 custom fields
   - Fields: Billing Forecast Calculation, Billing Forecast Detail Category, Billing Forecast Summary Category, Service Line, Is Active, Notes, Opportunity, Override Value, Delivery Model, Project, Region

### 58. Billing Forecast Summary Category (pse__Forecast_Enhanced_Summary_Category__c)
   - 14 custom fields
   - Fields: Billing Forecast Summary, Billing Forecast Override, Billing Forecast Opportunities Value, Billing Forecast Projects Value, Billing Forecast Setup Category, Billing Forecast Sublevels Value, Billing Forecast Total Value, Override Created By, Override Roll-Up Variance, Adjusted Value, Category Label, Override Created Date, Override Notes, Override Value

### 59. Billing Forecast Summary (pse__Forecast_Enhanced_Summary__c)
   - 8 custom fields
   - Fields: Billing Forecast Calculation, Service Line Plan, Service Line, Parent Billing Forecast Summary, Delivery Model Plan, Delivery Model, Region Plan, Region

### 60. Billing Forecast Run Info (pse__Forecast_Run_Info__c)
   - 5 custom fields
   - Fields: Billing Forecast Calculation Name, Service Line, Delivery Model, Region, Time Period

### 61. Billing Forecast Setup Category (pse__Forecast_Setup_Category__c)
   - 12 custom fields
   - Fields: Billings, Expenses, Billing Forecast Setup, Label, Opportunities, Category Order, zDeprecated:Category Order, Scheduled Assignments, Held Resource Requests, Scheduled Milestones, Unheld Resource Requests, Unscheduled Backlog

### 62. Billing Forecast Setup (pse__Forecast_Setup__c)
   - 6 custom fields
   - Fields: Actuals Cutoff Offset, Default Opportunity Curve, Default Project Curve, Active, Use Is Services Product On Opp Product, Use Opportunity Curve for Products

### 63. Gantt Global Settings (pse__Gantt_Global_Settings__c)
   - 10 custom fields
   - Fields: Respect Sharing When Deleting Tasks, Respect Sharing When Editing a Project, Save Project Task Assignment Batch Size, Save Project Task Batch Size, Show Create Assignments Button, Show Create Held Resource Request Button, Show Create Resource Requests Button, Show Project Milestones Button, Suppress Auto Link Assignment, Show Equal Split Button

### 64. Generic Batch Task Log (pse__Generic_Batch_Task_Log__c)
   - 3 custom fields
   - Fields: Generic Batch Task Log, Log Type, Message

### 65. Generic Batch Task (pse__Generic_Batch_Task__c)
   - 4 custom fields
   - Fields: Apex Job Id, Batch Process, Status, Unique Identifier

### 66. Service Line Actuals (pse__Group_Actuals__c)
   - 57 custom fields
   - Fields: Service Line, Time Period, Billable Hours (External), Billable Hours (Internal), Billed, Billings, Bookings, Credited Hours, Excluded Hours, Expense Budget, Expense Costs, External Costs, Internal Budget, Internal Costs, Invoiced, Is Verification, Individual Billable Hours (External), Individual Billable Hours (Internal), Individual Billed, Individual Billings, Individual Bookings, Individual Credited Hours, Individual Excluded Hours, Individual Expense Budget, Individual Expense Costs, Individual External Costs, Individual Internal Budget, Individual Internal Costs, Individual Invoiced, Individual Non-Billable Hours (External), Individual Non-Billable Hours (Internal), Individual Other Costs, Individual Pass-Through Billings, Individual Pre-Billed, Individual Revenue, Non-Billable Hours (External), Non-Billable Hours (Internal), Other Costs, Pass-Through Billings, Pre-Billed, Revenue, Scheduled Backlog Calculated Date, Scheduled Milestone, Scheduled Time, Unique Name, Unscheduled Backlog, Verified By, End Date, Service Line Owner, Has Difference in Verification, Margin, Individual Difference in Verification, Individual Margin, Individual Total Costs, Start Date, Time Period Type, Total Costs

### 67. Service Line Plan (pse__Group_Plan__c)
   - 15 custom fields
   - Fields: Time Period, Service Line, Planned Billings, Planned Bookings, Planned External Costs, Planned Internal Costs, Planned Revenue, Planned Utilization, Unique Name, End Date, Service Line Owner, Service Line Plan For, Planned Margin, Start Date, Time Period Type

### 68. Service Line (pse__Grp__c)
   - 92 custom fields
   - Fields: Action: Update Current Time Period, Actuals: Last Update Date, Actuals: Last Updated By, Backlog: Last Update Date, Backlog: Last Updated By, Billable Hours (External), Billable Hours (Internal), Billed, Billings, Bookings, Credited Hours, Current Time Period End Date, Current Time Period, Default Work Calendar, Exclude from Utilization, Excluded Hours, Expense Budget, Expense Costs, External Costs, Service Line Owner, Service Line ID Chain, Service Line Name Chain, Hierarchy Depth, Hist Sch Utilization Billable Hours, Hist Sch Utilization Credited Hours, Hist Sch Utilization Excluded Hours, Hist Sch Utilization Held Hours, Hist Sch Utilization Non Billable Hrs, Historical Utilization Billable Hours, Historical Utilization Calendar Hours, Historical Utilization Credited Hours, Historical Utilization Excluded Hours, Historical Utilization Non Billable Hrs, Historical Utilization Target Hours, Historical Utilization, Inactive Project Backlog, Include In Forecasting, Internal Budget, Internal Costs, Invoiced, Non-Billable Hours (External), Non-Billable Hours (Internal), Other Costs, Parent Service Line, Pass-Through Billings, Plan: Last Update Date, Plan: Last Updated By, Planned Billings, Planned Bookings, Planned External Costs, Planned Internal Costs, Planned Revenue, Planned Utilization, Pre-Billed, Revenue, Reverse Service Line ID Chain, Scheduled Backlog Calculated Date, Scheduled Backlog End Date, Scheduled Milestone, Scheduled Time, Scheduled Utilization Billable Hours, Scheduled Utilization Calendar Hours, Scheduled Utilization Credited Hours, Scheduled Utilization Excluded Hours, Scheduled Utilization Held Hours, Scheduled Utilization Non Billable Hrs, Scheduled Utilization Target Hours, Scheduled Utilization, Top-Level Group, Total Time Period Hours, Utilization, Unscheduled Backlog, Utilization Calculation Date, Utilization: Elapsed Hours, Utilization: Last Calculation Date, Utilization: Last Update Date, Utilization: Last Updated By, Utilization: Over Full Time Period, Utilization Period End Date, Utilization Period Start Date, Utilization Target Hours, Utilization, Historical Utilization Target Attainment, Historical Utilization Target, Margin, Planned Margin, Scheduled Utilization Target Attainment, Scheduled Utilization Target, Total Costs, Utilization Target Attainment, Utilization Target, Accounting Reporting Code

### 69. Holiday (pse__HolidayObj__c)
   - 3 custom fields
   - Fields: Date, Work Calendar, Work Hours

### 70. Hours to Days Rule (pse__Hours_to_Days_Rule__c)
   - 77 custom fields
   - Fields: Custom Plugin Name, Custom Plugin Namespace, Days Value 10, Days Value 11, Days Value 12, Days Value 13, Days Value 14, Days Value 15, Days Value 16, Days Value 17, Days Value 18, Days Value 19, Days Value 1, Days Value 20, Days Value 21, Days Value 22, Days Value 23, Days Value 24, Days Value 2, Days Value 3, Days Value 4, Days Value 5, Days Value 6, Days Value 7, Days Value 8, Days Value 9, Hour Threshold 10, Hour Threshold 11, Hour Threshold 12, Hour Threshold 13, Hour Threshold 14, Hour Threshold 15, Hour Threshold 16, Hour Threshold 17, Hour Threshold 18, Hour Threshold 19, Hour Threshold 1, Hour Threshold 20, Hour Threshold 21, Hour Threshold 22, Hour Threshold 23, Hour Threshold 24, Hour Threshold 2, Hour Threshold 3, Hour Threshold 4, Hour Threshold 5, Hour Threshold 6, Hour Threshold 7, Hour Threshold 8, Hour Threshold 9, Is Default, Maximum Days Value, Per Increment 10, Per Increment 11, Per Increment 12, Per Increment 13, Per Increment 14, Per Increment 15, Per Increment 16, Per Increment 17, Per Increment 18, Per Increment 19, Per Increment 1, Per Increment 20, Per Increment 21, Per Increment 22, Per Increment 23, Per Increment 24, Per Increment 2, Per Increment 3, Per Increment 4, Per Increment 5, Per Increment 6, Per Increment 7, Per Increment 8, Per Increment 9, Rule Type

### 71. IHC Mapping Concur to PSA (pse__IHC_Mapping_Concur_to_PSA__mdt)
   - 7 custom fields
   - Fields: PSA Field, PSA Object, Third Party Application Field, Third Party Application Object, Third Party Application, VDR Key, VDR Name

### 72. IHC Mapping Jira to PSA (pse__IHC_Mapping_Jira_to_PSA__mdt)
   - 7 custom fields
   - Fields: Jira Field, Jira Cloud Object, Jira On-Prem Object, PSA Field, PSA Object, VDR Key, VDR Name

### 73. Integration Hub Connector: Concur - PSA (pse__Integration_Hub_Connector_Instances__c)
   - 21 custom fields
   - Fields: Allow Deletion of Assignments, Allow Deletion of Projects, Approval Status, Concur API URL Suffix, Concur Filter By Billable Expenses Field, Concur field for Expense Billable Type, Concur field for PSA Project, Concur field for PSA Resource-Assignment, Delete Workflow Name, Email, Expense Report Billable Mapping, Expense Report Status Mapping, Expenses Sync Workflow Name, Initial Sync Chunk Size, Initial Sync Workflow Name, Project Sync Workflow Name, Resource-Assignment Sync Workflow Name, Sync Project Managers, Assignments Synced, Projects Synced, Resources Synced

### 74. Integration Hub Connector: Jira - PSA (pse__Integration_Hub_Connector_Jira_PSA__c)
   - 23 custom fields
   - Fields: Email, Jira Application URL, Jira Issue Status Category, Jira Issue Type, Jira Welcome Email for Synced Resources, Map PSA Projects to Jira Issues, Max Resource Days Per Week, Max Resource Hours Per Day, PSA Field Value for Updating Projects, Parent Issue Field, Project Task Jira Issue Types, Retry Project Task Sync Batch Size, Sync Jira Issues to PSA Project Tasks, Sync Jira Work Logs to PSA Timecards, Sync PSA Project Tasks to Jira Issues, Sync PSA Projects to Jira Issues, Sync PSA Projects to Jira Projects, Sync PSA Resources to Jira Users, Timecard Status, Update Projects Based on Issue Status, Update Task Status Based on Issue Status, Use Jira Cloud, Use PSA as Source for Project Task Sync

### 75. Issue (pse__Issue__c)
   - 20 custom fields
   - Fields: Account, Action Plan, Closed Date, Comments, Date Raised, Impact, Issue Description, Issue Name, Issue Owner, Milestone, Opportunity, Priority, Project Task, Project, Status, Risk, Closed, Severity, Severity, Severity

### 76. Jira Work Log (pse__Jira_Work_Log__c)
   - 7 custom fields
   - Fields: Comment, Issue Key, Start Date, Task Time, Time Spent (Formatted), Time Spent (Seconds), Timecard

### 77. Mass Link PTA UI Settings (pse__Mass_Link_PTA_UI_Settings__c)
   - 3 custom fields
   - Fields: Assignment Custom Lookup Field Set, Custom Field Set Name, Resource Request Lookup Field Set

### 78. Milestone (pse__Milestone__c)
   - 88 custom fields
   - Fields: Action: Refresh Expense Roll-Ups, Action: Refresh Timecard Roll-Ups, Actual Date, Admin Global Edit, Apply Default Bill Rate to Timecard, Approved, Approved for Billing, Approved for Vendor Payment, Approver, Audit Notes, Bill Date, Bill Transaction, Billable Amount In Financials, Billable Amount Submitted, Billable Days In Financials, Billable Days Submitted, Billable Expenses In Financials, Billable Expenses Submitted, Billable Hours In Financials, Billable Hours Submitted, Billed, Billing Event Item, Billing Hold, Closed for Expense Entry, Closed for Time Entry, Cost Transaction, Default Bill Rate, Default Bill Rate is Daily Rate, Description, Disable Project Task Hours Roll Up, Estimated Time To Completion, Exclude from Billing, Include In Financials, Invoice Date, Invoice Number, Invoice Transaction, Invoiced, Log Milestone Cost As External, Milestone Amount, Milestone Cost, Non-Billable Days In Financials, Non-Billable Days Submitted, Non-Billable Expenses In Financials, Non-Billable Expenses Submitted, Non-Billable Hours In Financials, Non-Billable Hours Submitted, Opportunity Product, Override Project Service Line, Override Project Delivery Model, Override Project Region, % Hours Completed for Recognition, Planned Hours, Project Currency Exchange Rate, Project Task Hours, Project, Recognition Method, Requires Customer Sign-off, Start Date, Status, Target Date, Timecard External Costs In Financials, Timecard External Costs Submitted, Timecard Internal Costs In Financials, Timecard Internal Costs Submitted, Total Completed Points from Tasks, Total Number of Completed Tasks, Total Number of Tasks, Total Points from Tasks, Transaction, Vendor Account, Vendor Invoice Item, Billing Event Invoiced, Billing Event Released, Billing Event Status, Billing Event, Eligible for Billing, Override Project Service Line Currency, Override Project Delivery Model Currency, Override Project Region Currency, Services Product, Is Milestone Late, Project Is Active, Project Manager Is Current User, % Complete (Hours), PSR Days Remaining, PSR Sort, Budget Allocation, Exclude from Timecard Expense Rollups

### 79. Miscellaneous Adjustment (pse__Miscellaneous_Adjustment__c)
   - 43 custom fields
   - Fields: Admin Global Edit, Amount, Approved, Approved for Billing, Approved for Vendor Payment, Approver, Audit Notes, Bill Date, Bill Transaction, Billed, Billing Event Item, Billing Hold, Description, Effective Date, Exclude from Billing, Include In Financials, Invoice Date, Invoice Number, Invoice Transaction, Invoiced, Override Project Service Line, Override Project Delivery Model, Override Project Region, Project, Recognition Method, Status, Transaction Category, Transaction, Vendor Account, Vendor Invoice Item, Billing Event Invoiced, Billing Event Released, Billing Event Status, Billing Event, Eligible for Billing, Override Project Service Line Currency, Override Project Delivery Model Currency, Override Project Region Currency, Automatically Pass to Accounting, Balancing Amount, Eligible for Journal, Passed To Accounting, Services Product

### 80. Missing Timecard Calculation (pse__Missing_Timecard_Calculation__c)
   - 9 custom fields
   - Fields: Batch Id, Configuration, Date Type, Service Line, Include Sublevels, Delivery Model, Region, Week End Date, Week Start Date

### 81. Missing Timecard (pse__Missing_Timecard__c)
   - 6 custom fields
   - Fields: Date Timecard Entered, Week End Date, Include Sublevels, Missing Timecard Calculation, Resource, Week Start Date

### 82. Missing Timecards (pse__Missing_Timecards__c)
   - 3 custom fields
   - Fields: Check Assignments for internal Resource, Ignore Closed Assignments, Use Resource Work Calendar Week Start

### 83. Permission Control Settings (pse__Permission_Control_Settings__c)
   - 13 custom fields
   - Fields: Allow Limited Exp Report Edit Post Submt, Allow Limited Expense Entry Post Submit, Allow Limited TC Header Edit Post Submit, Default Record Limit, Exp Report FieldSet WhiteList PostSubmit, Exp Report Field White List Post Submit, Exp Rpt PSE Field White List Post Smt, Expense FieldSet White List Post Submit, Expense Field White List Post Submit, Expense PSE Field White List Post Submit, TC Header FieldSet WhiteList Post Submit, TC Header Field White List Post Submit, TC Header PSE Field White List Post Smt

### 84. Permission Control (pse__Permission_Control__c)
   - 32 custom fields
   - Fields: Billing, Cascading Permission, Project Version Compare, Project Version Create, Project Version Delete, Project Task Gantt Edit, End Date, Expense Entry, Expense Ops Edit, Revenue Forecast Version Adjust, Revenue Forecast Version View, Service Line, Invoicing, Opportunity, Delivery Model, Project, Region, Resource Request Entry, Resource, Skills And Certifications Entry, Skills And Certifications View, Staffing, Start Date, Team Create, Team Edit, Team View, Team, Timecard Entry, Timecard Ops Edit, User, Project Task Gantt View, View All Utilization

### 85. Delivery Model Actuals (pse__Practice_Actuals__c)
   - 57 custom fields
   - Fields: Delivery Model, Time Period, Billable Hours (External), Billable Hours (Internal), Billed, Billings, Bookings, Credited Hours, Excluded Hours, Expense Budget, Expense Costs, External Costs, Internal Budget, Internal Costs, Invoiced, Is Verification, Individual Billable Hours (External), Individual Billable Hours (Internal), Individual Billed, Individual Billings, Individual Bookings, Individual Credited Hours, Individual Excluded Hours, Individual Expense Budget, Individual Expense Costs, Individual External Costs, Individual Internal Budget, Individual Internal Costs, Individual Invoiced, Individual Non-Billable Hours (External), Individual Non-Billable Hours (Internal), Individual Other Costs, Individual Pass-Through Billings, Individual Pre-Billed, Individual Revenue, Non-Billable Hours (External), Non-Billable Hours (Internal), Other Costs, Pass-Through Billings, Pre-Billed, Revenue, Scheduled Backlog Calculated Date, Scheduled Milestone, Scheduled Time, Unique Name, Unscheduled Backlog, Verified By, End Date, Has Difference in Verification, Margin, Individual Difference in Verification, Individual Margin, Individual Total Costs, Delivery Model Owner, Start Date, Time Period Type, Total Costs

### 86. Delivery Model Plan (pse__Practice_Plan__c)
   - 15 custom fields
   - Fields: Time Period, Delivery Model, Planned Billings, Planned Bookings, Planned External Costs, Planned Internal Costs, Planned Revenue, Planned Utilization, Unique Name, End Date, Planned Margin, Delivery Model Owner, Delivery Plan For, Start Date, Time Period Type

### 87. Delivery Model (pse__Practice__c)
   - 92 custom fields
   - Fields: Action: Update Current Time Period, Actuals: Last Update Date, Actuals: Last Updated By, Backlog: Last Update Date, Backlog: Last Updated By, Billable Hours (External), Billable Hours (Internal), Billed, Billings, Bookings, Credited Hours, Current Time Period End Date, Current Time Period, Default Work Calendar, Exclude from Utilization, Excluded Hours, Expense Budget, Expense Costs, External Costs, Global Delivery Model, Hierarchy Depth, Hist Sch Utilization Billable Hours, Hist Sch Utilization Credited Hours, Hist Sch Utilization Excluded Hours, Hist Sch Utilization Held Hours, Hist Sch Utilization Non Billable Hrs, Historical Utilization Billable Hours, Historical Utilization Calendar Hours, Historical Utilization Credited Hours, Historical Utilization Excluded Hours, Historical Utilization Non Billable Hrs, Historical Utilization Target Hours, Historical Utilization, Inactive Project Backlog, Include In Forecasting, Internal Budget, Internal Costs, Invoiced, Non-Billable Hours (External), Non-Billable Hours (Internal), Other Costs, Parent Delivery Model, Pass-Through Billings, Plan: Last Update Date, Plan: Last Updated By, Planned Billings, Planned Bookings, Planned External Costs, Planned Internal Costs, Planned Revenue, Planned Utilization, Delivery Model Owner, Delivery Model ID Chain, Delivery Model Name Chain, Pre-Billed, Revenue, Reversed Practise ID Chain, Scheduled Backlog Calculated Date, Scheduled Backlog End Date, Scheduled Milestone, Scheduled Time, Scheduled Utilization Billable Hours, Scheduled Utilization Calendar Hours, Scheduled Utilization Credited Hours, Scheduled Utilization Excluded Hours, Scheduled Utilization Held Hours, Scheduled Utilization Non Billable Hrs, Scheduled Utilization Target Hours, Scheduled Utilization, Total Time Period Hours, Utilization, Unscheduled Backlog, Utilization Calculation Date, Utilization: Elapsed Hours, Utilization: Last Calculation Date, Utilization: Last Update Date, Utilization: Last Updated By, Utilization: Over Full Time Period, Utilization Period End Date, Utilization Period Start Date, Utilization Target Hours, Utilization, Historical Utilization Target Attainment, Historical Utilization Target, Margin, Planned Margin, Scheduled Utilization Target Attainment, Scheduled Utilization Target, Total Costs, Utilization Target Attainment, Utilization Target, Accounting Reporting Code

### 88. Preference (pse__Preference__c)
   - 2 custom fields
   - Fields: Feature, Value

### 89. Process Lock (pse__Process_Lock__c)
   - 1 custom fields
   - Fields: Process Key

### 90. Project (pse__Proj__c)
   - 227 custom fields
   - Fields: API Time Period, Account, Action: Count Billing Eligible Records, Action: Update Current Time Period, Actuals: Last Recalc Date, Actuals: Last Update Date, Actuals: Last Updated By, Actuals: Need Recalc, Add BEIs To Existing Batches, Adjust End Date, Alert Threshold, Allow Expenses Without Assignment, Allow Self-Staffing, Allow Timecards Without Assignment, Deprecated:Amount, Apply Billing Cap, Auto-Cap Billing, Backlog: Last Update Date, Backlog: Last Updated By, Baseline, Batch Sequence, Billable Expense Fee Flat, Billable Expense Fee Percentage, Billable Hours (External), Billable Hours (Internal), Billed, Billing Eligible Budgets, Billing Eligible Expenses, Billing Eligible Last Updated, Billing Eligible Milestones, Billing Eligible Misc Adjustments, Billing Eligible Timecard Splits, Billing Queues Need Recalc, Billing Type, Billings, Bookings, Closed for Expense Entry, Closed for Time Entry, Company, Copy Child Records from Template Async, Credited Hours, Current Time Period End Date, Current Time Period, Daily Timecard Notes Required, Alert Recipient, End Date, Engagement, Approval Status, Deprecated:Estimated Cost, Estimated Hours at Completion, Deprecated:Estimated Margin (Amount), Exclude Project From Display On Billing, Exclude From Billing, Exclude from Backlog, Exclude from Project Planner, Exclude from Project Variance Batch, Excluded Hours, Expense Budget, Expense Costs, Expense Notes, Deprecatd:Expense (Amount), External Costs, External Time Cost, Financial Status, Forecast Curve, Service Line, Hierarchy Depth, Hours Cut Off Date, Hours to Days Rule, Inactive Project Backlog, Include In Forecasting, Internal Budget, Internal Costs, Internal Time Cost, Invoiced, Active, Billable, Deprecated:Primary Estimate, Template, Jira Correlation ID, Jira Project Key, Jira Project Type, Jira Project, Location, Master Project, Milestone Cost, Non-Billable Hours (External), Non-Billable Hours (Internal), Notes, Opportunity Owner, Opportunity, Other Costs, Parent Project, Pass-Through Billings, Deprecated:Discount (%), Deprecated:Estimated Margin (%), Percent Hours Complete, % Hours Completed for Recognition, Planned Hours, Delivery Model, Pre-Bill Type, Pre-Billed, Project ID Chain, Project ID, Project Manager, Project Name Chain, Project Phase, Project Status Notes, Project Status, Project Type, Rate Card Discount Limit, Rate Card Percentage Discount, Rate Card Set, Recognition Method, Region, Requires Dependency Sync, Revenue Forecast Batch Update Pending, Revenue Forecast Last Updated, Revenue Forecast Processing Status, Revenue, Schedule Status, Scheduled Backlog Calculated Date, Scheduled Backlog End Date, Scheduled Hours Remaining, Scheduled Milestone, Scheduled Time, Scope Status, Services Billing Time Period Type, Share with Project Manager, Share with Project Team, Stage, Start Date, Sync with Jira, Tasks Total Points Complete, Tasks Total Points, Time Credited, Time Excluded, Time Logged in Days, Time Zone, Total Assigned Hours, Total Number of Tasks, Total Projected Revenue From Assignments, Total Submitted Hours, Unscheduled Backlog, Variance from Plan, Variance at Completion, Work Calendar, Baseline End Date, Baseline Project Phase, Baseline Project Status, Baseline Stage, Baseline Start Date, Batch Sequence Number, Deprecated:Discount (Amount), Duration (Days), Financial Status, Jira Project URL, Margin, Deprecated:Net Amount, Percentage Used, Remaining Amount, Schedule Status, Scope Status, Send to Third-Party Expenses Application, Project Status, Tasks Total Percent Complete (Points), Total Costs, Services Product, Actual Hours, Is Close to Budget, Project Manager Is Current User, High Actual Hours, FDN Time Delay, Budget % Complete, Expense Notification, Margin %, PSR Assignments Segment, PSR Budgets Segment, PSR Current Week Ending Date, PSR Expenses Segment, PSR Financials Status, PSR Issues Segment, PSR Last Week Ending Date, PSR Milestone Segment, PSR Next Week Ending Date, PSR Overall Project Status, PSR Project Funds Remaining, PSR Project Status Notes, PSR Remaining Billable Hours, PSR Risks Segment, PSR Schedule Status, PSR Scope Status, PSR Status Segment, PSR Tasks Segment, PSR Timecard Billable Segment, PSR Timecard Non Billable Segment, PSR Timecards ALL Segment, PSR Week Ending Date, Percent Complete (Hours), Process Delay, Status Report Week Ending, Timecard Notification, % Complete - Revenue, % Complete - Time, Exclude from EVA Calculation, Exclude from Monitor Rollup, Account ID, Client Approval for Timecards, Matter Code, Entity, Opportunity Value, Opportunity Close Date, Alchemy, Eudia Tech, Lift and Shift, Per Unit Pricing, Industry, Opportunity Origin, Timecards Require DocID, Billing Client Contact, Primary Client Contact, Project Description, Sales Rep, Timecard Approver, Charging Type, Recurring/Project, AI

### 91. Project Variance Batch Logs (pse__ProjectVarianceBatchLog__c)
   - 3 custom fields
   - Fields: Project Variance Batch, Log Type, Message

### 92. Project Variance Batch (pse__ProjectVarianceBatch__c)
   - 8 custom fields
   - Fields: Apex Job ID, Batch Process, Status, Total Number of Aborts, Total Number of Errors, Total Number of External, Total Number of Logs, Notification Type

### 93. Project Actuals Converted (pse__Project_Actuals_Converted__c)
   - 59 custom fields
   - Fields: Time Period, Project, Billable Hours (External), Billable Hours (Internal), Billed, Billings, Bookings, Credited Hours, Excluded Hours, Expense Budget, Expense Costs, External Costs, Internal Budget, Internal Costs, Invoiced, Is Verification, Individual Billable Hours (External), Individual Billable Hours (Internal), Individual Billed, Individual Billings, Individual Bookings, Individual Credited Hours, Individual Excluded Hours, Individual Expense Budget, Individual Expense Costs, Individual External Costs, Individual Internal Budget, Individual Internal Costs, Individual Invoiced, Individual Non-Billable Hours (External), Individual Non-Billable Hours (Internal), Individual Other Costs, Individual Pass-Through Billings, Individual Pre-Billed, Individual Revenue, Non-Billable Hours (External), Non-Billable Hours (Internal), Other Costs, Pass-Through Billings, Pre-Billed, Project Actuals, Revenue, Scheduled Backlog Calculated Date, Scheduled Milestone, Scheduled Time, Unique Name, Unscheduled Backlog, Verified By, End Date, Has Difference in Verification, Margin, Individual Difference in Verification, Individual Margin, Individual Total Costs, Project Manager, Start Date, Time Period Type, Total Costs, PM Is User

### 94. Project Actuals (pse__Project_Actuals__c)
   - 57 custom fields
   - Fields: Time Period, Project, Billable Hours (External), Billable Hours (Internal), Billed, Billings, Bookings, Credited Hours, Excluded Hours, Expense Budget, Expense Costs, External Costs, Internal Budget, Internal Costs, Invoiced, Is Verification, Individual Billable Hours (External), Individual Billable Hours (Internal), Individual Billed, Individual Billings, Individual Bookings, Individual Credited Hours, Individual Excluded Hours, Individual Expense Budget, Individual Expense Costs, Individual External Costs, Individual Internal Budget, Individual Internal Costs, Individual Invoiced, Individual Non-Billable Hours (External), Individual Non-Billable Hours (Internal), Individual Other Costs, Individual Pass-Through Billings, Individual Pre-Billed, Individual Revenue, Non-Billable Hours (External), Non-Billable Hours (Internal), Other Costs, Pass-Through Billings, Pre-Billed, Revenue, Scheduled Backlog Calculated Date, Scheduled Milestone, Scheduled Time, Unique Name, Unscheduled Backlog, Verified By, End Date, Has Difference in Verification, Margin, Individual Difference in Verification, Individual Margin, Individual Total Costs, Project Manager, Start Date, Time Period Type, Total Costs

### 95. Project Financials Settings (pse__Project_Financials_Settings__c)
   - 1 custom fields
   - Fields: Timecard Statuses - Hours

### 96. Project Task Gantt Preferences (pse__Project_Gantt_Preferences__c)
   - 11 custom fields
   - Fields: Alerts - Task dates - Milestone, Alerts - Task dates - PTA dates, Alerts - Task dates - Project, Alerts - Task hours - PTA hours, Enable Day Detail, Hide Preview and Confirmation on Save, Resource Demand Default, Show Task Notes, Single Click Task Selection, Suppress Auto Link Assignment, Zoom Level

### 97. Project Task Gantt Settings (pse__Project_Gantt_Settings__c)
   - 16 custom fields
   - Fields: Always Allow Breaking Locks, Columns Field Set, Disable Buffered Rendering, Disable Resolve Dependency Btn on Sync, Leading Buffer Zone, Milestone Tooltip Field Set, PTA Tooltip Field Set, Project Manager Access, Project Tooltip Field Set, Read Only Field Set, Save Column Preferences, Show "Create Resource Demand" button, Show Hours Completion % in Task Bar, Show Points Completion % in Task Bar, Task Tooltip Field Set, Trailing Buffer Zone

### 98. Project Location (pse__Project_Location__c)
   - 4 custom fields
   - Fields: Description, End Date, Project, Start Date

### 99. Project Methodology (pse__Project_Methodology__c)
   - 4 custom fields
   - Fields: Description, End Date, Project, Start Date

### 100. Project Phase (pse__Project_Phase__c)
   - 4 custom fields
   - Fields: Description, End Date, Project, Start Date

### 101. Planners Preferences - Project (pse__Project_Planner_Preferences__c)
   - 6 custom fields
   - Fields: Display Decimal Precision Cutoff, Hide Inline Edit Dialog, Hold total assignment hours constant, Show Project Start/End Date Indicators, Show Shift Management Assignments, Zoom Level

### 102. Planners - Project (pse__Project_Planner_Settings__c)
   - 41 custom fields
   - Fields: Add Holidays On Assignment Adjust, Allow Mass Move Assignments, Assn Additional Fields Field Set Name, Assignment Color Field, Assignment Ordering, Assignment Search Fieldset Name, Assignment Tooltip Field Set, Columns Field Set, Default Future Days to Show Assignments, Default Past Days to Show Assignments, Default Resource Image, Project Planner Filter Field Set, Hide Cost Rate fields, DEPRECATED: Hide Inline Edit Dialog, Inherit Dates For Create Assignment, Inherit Role For Create Assignment, DEPRECATED: Hold total hours constant, Override Assignment Name Field, Override Resource Request Name Field, Project Search Fieldset Name, Project Summary Color Field, Project Tooltip Field Set, Record Load Limit, Resource Request Tooltip Field Set, Resource Request Search Fieldset Name, Resource Request Color Field, Resource Request Ordering, Restrict Creation Past Dates, Restrict Editing Past Dates, Restrict Swapping Past Dates, Save Column Preferences, Respect Schedules, Use Beige, Use Light Blue, Use Light Green, Use Light Red, Use Light Yellow, Use Pink, Use Purple, Use Turquoise, Edit Requires Staffing Permission

### 103. Project Source (pse__Project_Source__c)
   - 2 custom fields
   - Fields: Project, Source

### 104. Project Task Assignment (pse__Project_Task_Assignment__c)
   - 26 custom fields
   - Fields: Project Task, Action: Sync with External Calendar, Actual Cost, Allocation Hours, Allocation Percentage, Assignment, Estimated Cost, Estimated Hours, Exclude from External Calendar Sync, External Resource, Resource Request, Resource Role, Resource, End Date, Hours, Project ID, Project Task End Date, Project Task Start Date, Project, Schedule Type, Start Date, Is Resource Current User, Project Task Status, Estimated Hours, Is Running User's Record, Estimated Hours per PTA

### 105. Project Task Dependency (pse__Project_Task_Dependency__c)
   - 17 custom fields
   - Fields: Dependent Task, Cross Project, Dependency Display Units, Lag Time, New Dependency Record, Preceding Task, Type, Dependent Task End Date & Time, Dependent Task End Date, Dependent Task Start Date & Time, Dependent Task Start Date, Lag Units, Preceding Task End Date & Time, Preceding Task End Date, Preceding Task Start Date & Time, Preceding Task Start Date, Project

### 106. Project Task Gantt Global Settings (pse__Project_Task_Gantt_Global_Settings__c)
   - 4 custom fields
   - Fields: Bypass Sharing Settings During Save, Save Plugin Class, Save Plugin Namespace, Task Dependancy Lag Designation

### 107. Project Task Points Complete History (pse__Project_Task_Points_Complete_History__c)
   - 5 custom fields
   - Fields: Project Task, Change Date, Change in Value, New Value, Old Value

### 108. Project Task Points History (pse__Project_Task_Points_History__c)
   - 5 custom fields
   - Fields: Project Task, Change Date, Change in Value, New Value, Old Value

### 109. Project Task (pse__Project_Task__c)
   - 82 custom fields
   - Fields: Action: Sync with External Calendar, Actual Cost, Actual End Date & Time, Actual Hours, Actual Start Date & Time, Assigned Resources (Long), Assigned Resources, Blocked, Closed for Time Entry, Completed, Description, Do Not Auto Update Parents, Do Not Auto Update This Task, Duration Units, End Date & Time, Estimated Cost, Estimated Hours Rollup, Estimated Hours, Estimated Time To Completion (Task), Exclude from External Calendar Sync, External Task ID, Flag - Information, Flag - Task Dates - No Coverage, Flag - Task Dates - Partial Coverage, Flag - Task End - Milestone Bounds, Flag - Task End - Project Bounds, Flag - Task Hours - No Coverage, Flag - Task Hours - Partial Coverage, Flag - Task Start - Milestone Bounds, Flag - Task Start  - Project Bounds, Hierarchy Depth, Jira Correlation ID, Jira Issue Type Category, Long Description, Milestone, Notes, Peer Order, Override Estimated Hours, Override Points Complete, Override Points, Parent Task, Percent Complete (Points), Percent Complete (Tasks), Points Baseline, Points Complete Rollup, Points Complete, Points Rollup, Points, Priority, Project, Start Date & Time, Started, Status, Summary, Sync with Jira, Synchronize Milestone and Task, Task ID Chain, Task Key Chain, Task Key, Task Name Chain (Long), Task Name Chain, Task Number, Timecard Actual Hours, Top-level Parent Task, WBS Element Number, Work Calendar, Work Remaining, Number of Assignments, Actual End Date, Actual Start Date, End Date, Hours Remaining, Jira Issue Type, Parent Task End Date & Time, Parent Task End Date, Parent Task Start Date & Time, Parent Task Start Date, Percent Complete (Hours), Points Remaining, Projected Hours, Start Date, Timecard Hours

### 110. Project Variance Batch Settings (pse__Project_Variance_Batch_Setting__c)
   - 5 custom fields
   - Fields: Notifications by Chatter, Notifications by Email, Notification Recipients, Notifications by Task, Project Variance Batch Size

### 111. Project Versioning Global Settings (pse__Project_Versioning_Global_Settings__c)
   - 4 custom fields
   - Fields: Create Version Batch Size, Delete Version Batch Size, View Project Version Quick Help Resource, View Project Version Records Loaded

### 112. Project Versioning Settings (pse__Project_Versioning_Settings__c)
   - 4 custom fields
   - Fields: Notifications Chatter, Notifications Email, Notifications_Recipients, Notifications Task

### 113. Resource Request Milestone Junction (pse__RR_Milestone__c)
   - 2 custom fields
   - Fields: Resource Request, Milestone

### 114. Resource Search Service (pse__RSS_Custom_Settings__c)
   - 9 custom fields
   - Fields: Availability Priority, Custom Filter Fields Weighting, Filter Fields Priority, Service Line Weighting, Delivery Model Weighting, Region Weighting, Role Weighting, Skills Priority, Worked With Customer Weighting

### 115. Rate Card Set Junction (pse__Rate_Card_Set_Junction__c)
   - 2 custom fields
   - Fields: Rate Card Set, Rate Card

### 116. Rate Card Set (pse__Rate_Card_Set__c)
   - 0 custom fields
   - Fields: 

### 117. Rate Card (pse__Rate_Card__c)
   - 11 custom fields
   - Fields: Account, Average Cost Rate, Cascading Role, End Date, Service Line, Delivery Model, Region, Resource Role, Start Date, Suggested Bill Rate, External

### 118. Region Plan (pse__Region_Plan__c)
   - 15 custom fields
   - Fields: Region, Time Period, Planned Billings, Planned Bookings, Planned External Costs, Planned Internal Costs, Planned Revenue, Planned Utilization, Unique Name, End Date, Planned Margin, Region Owner, Region Plan For, Start Date, Time Period Type

### 119. Region (pse__Region__c)
   - 92 custom fields
   - Fields: Action: Update Current Time Period, Actuals: Last Update Date, Actuals: Last Updated By, Backlog: Last Update Date, Backlog: Last Updated By, Billable Hours (External), Billable Hours (Internal), Billed, Billings, Bookings, Credited Hours, Current Time Period End Date, Current Time Period, Default Work Calendar, Exclude from Utilization, Excluded Hours, Expense Budget, Expense Costs, External Costs, Headquarters Region, Hierarchy Depth, Hist Sch Utilization Billable Hours, Hist Sch Utilization Credited Hours, Hist Sch Utilization Excluded Hours, Hist Sch Utilization Held Hours, Hist Sch Utilization Non Billable Hrs, Historical Utilization Billable Hours, Historical Utilization Calendar Hours, Historical Utilization Credited Hours, Historical Utilization Excluded Hours, Historical Utilization Non Billable Hrs, Historical Utilization Target Hours, Historical Utilization, Inactive Project Backlog, Include In Forecasting, Internal Budget, Internal Costs, Invoiced, Non-Billable Hours (External), Non-Billable Hours (Internal), Other Costs, Parent Region, Pass-Through Billings, Plan: Last Update Date, Plan: Last Updated By, Planned Billings, Planned Bookings, Planned External Costs, Planned Internal Costs, Planned Revenue, Planned Utilization, Pre-Billed, Region Owner, Region ID Chain, Region Name Chain, Revenue, Reversed Region ID Chain, Scheduled Backlog Calculated Date, Scheduled Backlog End Date, Scheduled Milestone, Scheduled Time, Scheduled Utilization Billable Hours, Scheduled Utilization Calendar Hours, Scheduled Utilization Credited Hours, Scheduled Utilization Excluded Hours, Scheduled Utilization Held Hours, Scheduled Utilization Non Billable Hrs, Scheduled Utilization Target Hours, Scheduled Utilization, Total Time Period Hours, Utilization, Unscheduled Backlog, Utilization Calculation Date, Utilization: Elapsed Hours, Utilization: Last Calculation Date, Utilization: Last Update Date, Utilization: Last Updated By, Utilization: Over Full Time Period, Utilization Period End Date, Utilization Period Start Date, Utilization Target Hours, Utilization, Historical Utilization Target Attainment, Historical Utilization Target, Margin, Planned Margin, Scheduled Utilization Target Attainment, Scheduled Utilization Target, Total Costs, Utilization Target Attainment, Utilization Target, Accounting Reporting Code

### 120. Regional Actuals (pse__Regional_Actuals__c)
   - 57 custom fields
   - Fields: Region, Time Period, Billable Hours (External), Billable Hours (Internal), Billed, Billings, Bookings, Credited Hours, Excluded Hours, Expense Budget, Expense Costs, External Costs, Internal Budget, Internal Costs, Invoiced, Is Verification, Individual Billable Hours (External), Individual Billable Hours (Internal), Individual Billed, Individual Billings, Individual Bookings, Individual Credited Hours, Individual Excluded Hours, Individual Expense Budget, Individual Expense Costs, Individual External Costs, Individual Internal Budget, Individual Internal Costs, Individual Invoiced, Individual Non-Billable Hours (External), Individual Non-Billable Hours (Internal), Individual Other Costs, Individual Pass-Through Billings, Individual Pre-Billed, Individual Revenue, Non-Billable Hours (External), Non-Billable Hours (Internal), Other Costs, Pass-Through Billings, Pre-Billed, Revenue, Scheduled Backlog Calculated Date, Scheduled Milestone, Scheduled Time, Unique Name, Unscheduled Backlog, Verified By, End Date, Has Difference in Verification, Margin, Individual Difference in Verification, Individual Margin, Individual Total Costs, Region Owner, Start Date, Time Period Type, Total Costs

### 121. Resource Actuals (pse__Resource_Actuals__c)
   - 34 custom fields
   - Fields: Resource, Time Period, Billable Hours (External), Billable Hours (Internal), Billed, Billings, Bookings, Credited Hours, Excluded Hours, Expense Budget, Expense Costs, External Costs, Internal Budget, Internal Costs, Invoiced, Is Verification, Non-Billable Hours (External), Non-Billable Hours (Internal), Other Costs, Pass-Through Billings, Pre-Billed, Revenue, Total Time Period Hours, Unique Name, Utilization: Last Calculation Date, Utilization: Elapsed Hours, Verified By, End Date, Has Difference in Verification, Margin, Start Date, Total Costs, Utilization: Over Full Time Period, Utilization

### 122. Resource Change (pse__Resource_Change__c)
   - 18 custom fields
   - Fields: Resource, Change Date, New Service Line, New Is Resource Active, New Is Resource, New Delivery Model, New Region, New Resource Role, New Utilization Target, New Work Calendar, Old Service Line, Old Is Resource Active, Old Is Resource, Old Delivery Model, Old Region, Old Resource Role, Old Utilization Target, Old Work Calendar

### 123. Resource Optimizer Settings (pse__Resource_Optimizer_Settings__c)
   - 1 custom fields
   - Fields: Use External System

### 124. Planners Preferences - Resource (pse__Resource_Planner_Preferences__c)
   - 10 custom fields
   - Fields: Display Decimal Precision Cutoff, Hide Inline Edit Dialog, Hold total assignment hours constant, lower threshold summary bar limit, Resource Availability in Hours, Show Holiday Icon, Show Shift Management Assignments, Upper threshold summary bar limit, Use Utilization Target, Zoom Level

### 125. Planners - Resource (pse__Resource_Planner_Settings__c)
   - 43 custom fields
   - Fields: Add Holidays On Assignment Adjust, Assn Additional Fields Field Set Name, Assignment Color Field, Assignment Ordering, Assignment Search Fieldset Name, Assignment Tooltip Field Set, Availability Decimal Precision, Columns Field Set, Default Future Days to Show Assignments, Default Past Days to Show Assignments, Default Resource Image, Add Included Dates After RR End Date, Add Included Dates Before RR Start Date, Resource Planner Filter Field Set, Hide Cost Rate fields, DEPRECATED: Hide Inline Edit Dialog, Inherit Dates For Create Assignment, Inherit Role For Create Assignment, DEPRECATED: Hold total hours constant, Override Assignment Name Field, Override Resource Request Name Field, Resource Request Tooltip Field Set, Resource Request Search Fieldset Name, Resource Request Color Field, Resource Request Ordering, Search Fieldset Name, Resource Tooltip Field Set, Restrict Creation Past Dates, Restrict Editing Past Dates, Restrict Swapping Past Dates, Save Column Preferences, Respect Schedules, Show Availability Column, Use Beige, Use Light Blue, Use Light Green, Use Light Red, Use Light Yellow, Use Pink, Use Purple, Use Turquoise, Record Load Limit, Edit Requires Staffing Permission

### 126. Resource Replacement (pse__Resource_Replacement__c)
   - 5 custom fields
   - Fields: Records Per Page, Show All Records, Show Assignments, Show Project Task Assignments, Show Resource Requests

### 127. Resource Request Set (pse__Resource_Request_Set__c)
   - 6 custom fields
   - Fields: Account, Master Resource Request, Opportunity, Project, Staffed On, Staffed Resource Request

### 128. Resource Request (pse__Resource_Request__c)
   - 73 custom fields
   - Fields: Allow Candidates to Self-Nominate, Assignment, Average Cost Rate Currency Code, Average Cost Rate Number, Eligible for Schedule Recalculation, End Date, Exclude from Utilization, Exclude from Planners, Service Line, Information for Prospective Candidates, Latitude (PSA), Longitude (PSA), Milestone, Notes, Opportunity, Percent Allocated, Planned Bill Rate, Delivery Model, Preferred Schedule, Primary Skill or Certification, Primary Skill Minimum Rating, Processing Stage, Project, Rate Card, Region, Related Resource Request Staffed On, Request Priority, Requested Bill Rate, Resource Held, Resource Request Name, Resource Request Set, Resource Role, Suggested Resource, Requested Hours, Self-Nomination Deadline, Staffed Related Resource Request, Staffer Approval Required, Resource, Start Date, Status, Suggested Bill Rate Currency Code, Suggested Bill Rate Number, Update Related Resource Requests, DEPRECATED: Utilization Run, Work City (PSA), Work Country (PSA), Work Zip/Postal Code (PSA), Work State/Province (PSA), Work Street (PSA), AccountId, Account Link, Account, Average Cost Rate, Opportunity Probability (%), Request Billable Amount, Suggested Bill Rate, Close To Start Date, Project Manager Is Current User, Requires Staffing, Cost Rate Amount, Planner Color, Project Name, Project Owner Email, Resource Request Type, Generic Resource ?, Distance Unit, Maximum Distance, Total Billings, Total Cost, Hours per Week, Interview Prep Conducted, Override Requested Hours, Total Margin

### 129. Resource Skill Request (pse__Resource_Skill_Request__c)
   - 9 custom fields
   - Fields: Skill or Certification, Desirable, Primary, Match All, Minimum Rating, Resource Request, Skill Set, Skill Record Type, Skill or Certification

### 130. Resource Transmission (pse__Resource_Transmission__c)
   - 3 custom fields
   - Fields: Timecard Transmission, Resource, Status

### 131. Revenue Forecast Batch Lock (pse__Revenue_Forecast_Batch_Lock__c)
   - 1 custom fields
   - Fields: Record ID

### 132. Revenue Forecast Batch Log (pse__Revenue_Forecast_Batch_Log__c)
   - 4 custom fields
   - Fields: Revenue Forecast Batch, Message, Opportunity, Project

### 133. Revenue Forecast Batch Status (pse__Revenue_Forecast_Batch_Status__c)
   - 5 custom fields
   - Fields: Opportunity, Record ID, Revenue Forecast Batch Update Pending, Revenue Forecast Last Updated, Revenue Forecast Processing Status

### 134. Revenue Forecast Batch (pse__Revenue_Forecast_Batch__c)
   - 3 custom fields
   - Fields: Batch ID, Batch Process, Status

### 135. Revenue Forecast Setup (pse__Revenue_Forecast_Setup__c)
   - 49 custom fields
   - Fields: Active, Assignment Bill Rate Field, Assignment % Complete Weighting Field, Custom Date for Deliverable Expenses, Custom Date for Deliverable Milestones, Custom Date for Deliverable Misc Adjusts, Custom Filter Field Set, Exclude from Forecast Assignment Field, Exclude from Forecast RR Field, Exclude Opportunities for Versions, Exclude Opportunities, Exclude Probability from Opportunities, Exclude Resource Requests on Project, Exclude Revenue Recognition Actuals, Exclude Scheduled Hrs in Closed Periods, Exclude Unscheduled Revenue for Versions, Forecast Factor Batch Size, Hover Details Field Set on Milestone, Hover Details Field Set on Opportunity, Hover Details Field Set on Project, Include Best Case, Include Worst Case, Total Revenue Field on Milestone, Opportunity Batch Size, Opportunity Best Case Threshold (%), Opportunity Expected Threshold (%), Opportunity Scheduler Batch Size, Opportunity Worst Case Threshold (%), Project Batch Size, Expected Project End Date Field on Opp, Project Scheduler Batch Size, Expected Project Start Date Field on Opp, Total Revenue Field on Project, RR % Complete Weighting Field, Resource Request Bill Rate Field, Respect Permission Controls, Retain Pending Revenue in Closed Periods, Total Hours Field on Project, Use Sched and Actual Hrs for % Complete, Use Weighting for % Complete, Version Detail Batch Size, Version Forecast Period, Object for Version Grouping, Actuals Cutoff Day, Exclude Actuals After Cutoff Day, Include RRs on Opportunities, Persist Adjustments Across Versions, Use Mid Month Forecast Calculations, Version Forecast Period Override

### 136. Revenue Forecast Type (pse__Revenue_Forecast_Type__c)
   - 17 custom fields
   - Fields: Revenue Forecast, Corp: Currency, Corp: Revenue Pending Recognition, Corp: Revenue Recognized to Date, Corp: Scheduled Revenue, Corp: Unscheduled Revenue, Milestone, Opportunity, Project, Revenue Pending Recognition, Revenue Recognized to Date, Revenue Source, Revenue Type, Scheduled Revenue, Unscheduled Revenue, Actuals, Corp: Actuals

### 137. Revenue Forecast Version Adjustment (pse__Revenue_Forecast_Version_Adjustment__c)
   - 18 custom fields
   - Fields: Active, Corp: Adjustment Value, Corp: Currency, Exchange Rate, Service Line, Milestone, Notes, Opportunity, Delivery Model, Project, Region, Revenue Forecast Version, Scenario, Time Period, Unique identifier, Adjusted By, Adjustment Date, Expiration Date

### 138. Revenue Forecast Version Batch Log (pse__Revenue_Forecast_Version_Batch_Log__c)
   - 2 custom fields
   - Fields: Revenue Forecast Version, Message

### 139. Revenue Forecast Version Detail (pse__Revenue_Forecast_Version_Detail__c)
   - 70 custom fields
   - Fields: Revenue Forecast Version, Corp: Currency, Corp: Equal Split: Milestone: Pending, Corp: Equal Split: Milestone: Recognized, Corp: Equal Split: Milestone: Scheduled, Corp: Equal Split: Project: Pending, Corp: Equal Split: Project: Recognized, Corp: Equal Split: Project: Scheduled, Corp: Deliverable: EVA: Scheduled, Corp: Deliverable: Expense: Pending, Corp: Deliverable: Expense: Recognized, Corp: Deliverable: Milestone: Pending, Corp: Deliverable: Milestone: Recognized, Corp: Deliverable: Milestone: Scheduled, Corp: Deliverable: MA: Pending, Corp: Deliverable: MA: Recognized, Corp: Opportunity: Unscheduled Best, Corp: Opportunity: Unscheduled Worst, Corp: Opportunity: Unscheduled, Corp: % Complete: Milestone: Pending, Corp: % Complete: Milestone: Recognized, Corp: % Complete: Milestone: Scheduled, Corp: % Complete: Milestone: Unscheduled, Corp: % Complete: Project: Pending, Corp: % Complete: Project: Recognized, Corp: % Complete: Project: Scheduled, Corp: % Complete: Project: Unscheduled, Corp: Deliverable: Timecard: Pending, Corp: Deliverable: Timecard: Recognized, Equal Split: Milestone: Pending, Equal Split: Milestone: Recognized, Equal Split: Milestone: Scheduled, Equal Split: Project: Pending, Equal Split: Project: Recognized, Equal Split: Project: Scheduled, Deliverable: EVA: Scheduled, Deliverable: Expense: Pending, Deliverable: Expense: Recognized, Service Line, Deliverable: Milestone: Pending, Deliverable: Milestone: Recognized, Deliverable: Milestone: Scheduled, Milestone, Deliverable: Misc Adjustment: Pending, Deliverable: Misc Adjustment: Recognized, Opportunity Probability (%), Opportunity: Unscheduled Best, Opportunity: Unscheduled Worst, Opportunity: Unscheduled, Opportunity, % Complete: Milestone: Pending, % Complete: Milestone: Recognized, % Complete: Milestone: Scheduled, % Complete: Milestone: Unscheduled, % Complete: Project: Pending, % Complete: Project: Recognized, % Complete: Project: Scheduled, % Complete: Project: Unscheduled, Delivery Model, Project, Region, Time Period End, Time Period Start, Time Period, Deliverable: Timecard: Pending, Deliverable: Timecard: Recognized, Actuals Total, Corp: Actuals Total, Corp: Scheduled Total, Scheduled Total

### 140. Revenue Forecast Version (pse__Revenue_Forecast_Version__c)
   - 14 custom fields
   - Fields: Apex Job ID, Batch Process, Batch Processing Status, Corp: Currency, Exclude Probability from Opportunities, Include Best Case, Include Worst Case, Date and Time Locked, Locked, Opportunity Best Case Threshold (%), Opportunity Expected Threshold (%), Opportunity Worst Case Threshold (%), Status, Object for Version Grouping

### 141. Revenue Forecast (pse__Revenue_Forecast__c)
   - 24 custom fields
   - Fields: Actual Hours, Actual Weighted Effort, Corp: Currency, Last Updated, Milestone, Opportunity Probability (%), Opportunity, Project, Scheduled Hours, Scheduled Weighted Effort, Time Period, Unscheduled Hours, Corp: Revenue Pending Recognition, Corp: Revenue Recognized to Date, Corp: Scheduled Revenue, Corp: Unscheduled Revenue, Revenue Pending Recognition, Revenue Recognized to Date, Scheduled Revenue, Unscheduled Revenue, Actuals, Corp: Actuals, Time Period End, Time Period Start

### 142. Risk (pse__Risk__c)
   - 21 custom fields
   - Fields: Account, Closed Date, Comments, Contingency, Date Raised, Impact, Issue, Likelihood, Milestone, Mitigation Plan, Opportunity, Project Task, Project, Risk Description, Risk Name, Risk Owner, Status, Closed, Severity, Severity, Severity

### 143. Schedule Exception (pse__Schedule_Exception__c)
   - 25 custom fields
   - Fields: Schedule, Start Date, End Date, Default Exception Hours Per Day, Friday End Time, Friday Hours, Friday Start Time, Monday End Time, Monday Hours, Monday Start Time, Saturday End Time, Saturday Hours, Saturday Start Time, Sunday End Time, Sunday Hours, Sunday Start Time, Thursday End Time, Thursday Hours, Thursday Start Time, Tuesday End Time, Tuesday Hours, Tuesday Start Time, Wednesday End Time, Wednesday Hours, Wednesday Start Time

### 144. Schedule (pse__Schedule__c)
   - 32 custom fields
   - Fields: Action: Force Schedule Refresh, Action: Update Future Scheduled Hours, End Date, Friday End Time, Friday Hours, Friday Start Time, Future Scheduled Hours Last Update Date, Future Scheduled Hours, Is Blocking, Monday End Time, Monday Hours, Monday Start Time, Saturday End Time, Saturday Hours, Saturday Start Time, Scheduled Days, Scheduled Hours, Start Date, Sunday End Time, Sunday Hours, Sunday Start Time, Thursday End Time, Thursday Hours, Thursday Start Time, Tuesday End Time, Tuesday Hours, Tuesday Start Time, Wednesday End Time, Wednesday Hours, Wednesday Start Time, Week Total Hours, Assignment External ID

### 145. Search Resources Global (pse__Search_Resources_Global__c)
   - 8 custom fields
   - Fields: Allow Special Characters In Address, Contact Field 1, Contact Field 2, Contact Field 3, Display Resource Description, Geolocation Service URL, Invalid Longitude and Latitude, Mapquest Endpoint URL

### 146. Search Resources Personal (pse__Search_Resources_Personal__c)
   - 10 custom fields
   - Fields: Default Search Logic Additional Fields, Default Search Logic For Certification, Default Search Logic For Skill, Distance Unit, Fields to List in Map Push Pin, Max Columns Allowed in Result Section, Maximum Resources, Number of Allowed Push Pins on Map, Page Size, Show Latitude Longitude Fields

### 147. Skill Set Skill (pse__SkillSet_Skill__c)
   - 4 custom fields
   - Fields: Skill Set, Skill or Certification, Desirable, Rating

### 148. Skill or Certification Rating (pse__Skill_Certification_Rating__c)
   - 15 custom fields
   - Fields: Resource, Skill or Certification, Approval Status, Aspiration, Certified, Date Achieved, Evaluation Date, Expiration Date, Last Used Date, Notes, Rating, Years of Experience, Numerical Rating, Is Resource Current User, Skill or Certification

### 149. Skill or Certification Zone (pse__Skill_Certification_Zone__c)
   - 5 custom fields
   - Fields: Skill or Certification, Cascading, Service Line, Delivery Model, Region

### 150. Skill Set (pse__Skill_Set__c)
   - 2 custom fields
   - Fields: Description, Resource Roles

### 151. Skill or Certification (pse__Skill__c)
   - 15 custom fields
   - Fields: Certification Source, Description, External ID, Group, Parent Category, Resource Roles, Skill Or Certification, Type, Unique Name, Hierarchy Key Path, Hierarchy Level, Hierarchy Path, Parent Hierarchy Level, Parent Record Type, Record Type Name

### 152. Skills Management (pse__Skills_Management__c)
   - 11 custom fields
   - Fields: Add Skills - Filter Field Set, Additional Add Skills Fields, Display Evaluate Skills button, Enable Desirable Skills, Enable Experience, Outdated Skills Threshold in Days, Override Skill Zones, Restrict Skills and Skill Sets by Role, Restrict to Skills with Existing Rating, Skill Sets Custom Lookup Columns, Skills Custom Lookup Columns

### 153. Task-Based Resourcing (pse__Task_Based_Resourcing__c)
   - 9 custom fields
   - Fields: Assignment Columns, Assignment Editable Columns, Assignment Groupings, Held Resource Request Groupings, Resource Request Columns, Resource Request Editable Columns, Resource Request Groupings, Show Estimated Amount Column, Show Estimated Cost Column

### 154. Task Management Settings (pse__Task_Management_Settings__c)
   - 19 custom fields
   - Fields: Auto Create Task Assignments All or None, Automatically Create Task Assignments, Auto Remove Task Assignments All or None, Automatically Remove Task Assignments, Default Task Ordering, PTA Require Lock Fieldset, PTD Require Lock Fieldset, PT Require Lock Fieldset, Project Task Scheduling, Recalculate Actual Hours Batch Size, Recalculate Project Tasks Batch Size, Restrict Edit - End Date - Milestone, Restrict Edit - End Date - Project, Restrict Edit - PTA - Dates, Restrict Edit - PTA - Hours, Restrict Edit - Start Date - Milestone, Restrict Edit - Start Date - Project, Timecard Statuses, Track Points History Disabled

### 155. Task Time (pse__Task_Time__c)
   - 27 custom fields
   - Fields: Timecard, Project Task, Friday Days, Friday Hours, Friday Notes, Monday Days, Monday Hours, Monday Notes, Project Task Assignment, Saturday Days, Saturday Hours, Saturday Notes, Start Date, Sunday Days, Sunday Hours, Sunday Notes, Thursday Days, Thursday Hours, Thursday Notes, Timer Session, Tuesday Days, Tuesday Hours, Tuesday Notes, Wednesday Days, Wednesday Hours, Wednesday Notes, Total Hours

### 156. Team Membership (pse__Team_Membership__c)
   - 4 custom fields
   - Fields: Team, Team Member Initials, Team Member, Team Scheduler Permission

### 157. Team Schedule Slot Type (pse__Team_Schedule_Slot_Type__c)
   - 5 custom fields
   - Fields: Description, Is Blocking, Is Holiday, Is Weekend, Type

### 158. Team Schedule Slot (pse__Team_Schedule_Slot__c)
   - 6 custom fields
   - Fields: End Time, Hours, Resources Required, Start Time, Team Schedule Slot Type, Team Schedule

### 159. Team Schedule Template Slot (pse__Team_Schedule_Template_Slot__c)
   - 6 custom fields
   - Fields: End Time, Hours, Resources Required, Start Time, Team Schedule Slot Type, Team Schedule Template

### 160. Team Schedule Template (pse__Team_Schedule_Template__c)
   - 3 custom fields
   - Fields: Date Last Used, Is Default, Team

### 161. Team Schedule (pse__Team_Schedule__c)
   - 6 custom fields
   - Fields: Effective Date, Notes, Send Notifications, Status, Team Schedule Template, Team

### 162. Team Settings (pse__Team_Settings__c)
   - 5 custom fields
   - Fields: Enable Send Notifications, Fill Schedule Tooltip, Email Template (Schedule), Email Template (Swap), Team Member Permission Level

### 163. Team (pse__Team__c)
   - 17 custom fields
   - Fields: All Team Members, Anyone with Edit Access, Description, Enable Swapping, Currently Assigned Team Member, Previously Assigned Team Member, Project, Custom Template Name (Schedule), Other Email Addresses (Schedule), Send Email to Others (Schedule), Use Custom Template (Schedule), Custom Template Name (Swap), Other Email Addresses (Swap), Send Email to Others (Swap), Use Custom Template (Swap), Team Owner, Time Zone

### 164. Time Date (pse__Time_Date__c)
   - 4 custom fields
   - Fields: Timecard, Date, Hours, Day Of Week

### 165. Time Period (pse__Time_Period__c)
   - 5 custom fields
   - Fields: Date Marked as Closed for Forecasting, Closed for Forecasting, End Date, Start Date, Type

### 166. Time Variance Calculation (pse__Time_Variance_Calculation__c)
   - 10 custom fields
   - Fields: Allowed Variance Over, Allowed Variance Under, Date Type, End Date, Service Line, Include Sublevels, Delivery Model, Region, Start Date, Week End Date

### 167. Time Variance (pse__Time_Variance_Detail__c)
   - 22 custom fields
   - Fields: Allowed Variance Over, Allowed Variance Under, Billable Hours, Credited Hours, End Date, Exclude Billable Hours, Exclude Credited Hours, Exclude Excluded Hours, Excluded Hours, Service Line, Non-billable Hours, Delivery Model, Region, Resource, Start Date, Time Variance Calculation, Total Hours Submitted, Variance, Work Calendar Hours, Is Last Week, Is Resource Current User, Time Variance Difference

### 168. Time Variance Settings (pse__Time_Variance_Settings__c)
   - 7 custom fields
   - Fields: Allowed Variance Over, Allowed Variance Under, Exclude Billable Hours, Exclude Credited Hours, Exclude Excluded Hours, Report All, Use Percentage

### 169. Timecard API Settings (pse__Timecard_API_Settings__c)
   - 3 custom fields
   - Fields: Earnings Code (Assignment), Earnings Code (Project), Exclude Project Type from POST Response

### 170. Timecard Approval UI (pse__Timecard_Approval_UI__c)
   - 9 custom fields
   - Fields: Always Group Timecard Approvals, Filter Section Field Set Name, Number Of Timecards Shown Per Page, Selected Primary Group, Selected Secondary Group, Show Daily Notes With Hours, Show Week Dates As Column Headers, Timecard Tooltip Fieldset Name, Tooltip Fields

### 171. Timecard Entry UI Global (pse__Timecard_Entry_UI_Global__c)
   - 33 custom fields
   - Fields: Allow Time Entry for Summary Task, Allow timecard with negative hours, Assignment Lookup Fieldset Name, Assignment load limit, Assignment lookup columns, Assignments load date restriction, Assignments Status Values, Check For Previous Week Timecards, Day hour auto revert ceiling, Day hour auto revert floor, Disable Hours in Timecard Copy, Display account on resource lookup, Enforce Submit All Timecards, Project Lookup Fieldset Name, Project lookup columns, Projects load date restriction, Resource Lookup Fieldset Name, Resource access, Resource lookup columns, Time Entry Submit Batch Size, Save timecard with zero hours, Schedule editable, Time Entry Save Batch Size, TC Sorted By Order, Timecard edit status values, Timecard save button action, Timecard submit button action, Use Local Storage For Column Preferences, Use Project Location Records, Use Project Methodology Records, Use Project Phase Records, Week start day, Submit timecard with zero hours

### 172. Timecard Entry UI Personal (pse__Timecard_Entry_UI_Personal__c)
   - 96 custom fields
   - Fields: Additional Fields, Allow Zero Entry, Assignment project editable after save, Assignment tooltip fields, Billable Header Field Position Is Left, Combine Similar Timecards, Copy AdditionalFields From Previous Week, Copy ETC From Previous Week, Copy Hours From Previous Week, Copy Locations From Previous Week, Copy Methodology From Previous Week, Copy Milestone From Previous Week, Copy Notes From Previous Week, Copy Phase From Previous Week, Copy Schedule Assignment Daily Notes, Copy Task Hours From Previous Week, Copy Tasks From Previous Week, Copy Travel From Previous Week, Default Single Resource Search Result, Default Week Offset, Default billable, Disable cache, Empty lines to append on add lines, Empty timecard lines to append by def, Hide Billable Column, Hide Copy From Previous Week Button, Hide Copy Schedules Button, Hide Expand Tasks, Hide Notes Column, Hide Save Button, Hide Show All Tasks/My Tasks, Hide Submit Button, Lock Timecard Hours in Calculated Mode, Hide View Edit Details Link, Holiday Color Code, Hours Cell Pixel Width, Max Resource Hours Per Day, Maximum Resource Hours Per Week, Methodology HeaderField Position Is Left, Methodology field position is popup, Milestone Header Field Position Is Left, Milestone field position is popup, Minimum Resource Hours Per Week, Nickname Editable, Note location allowed, Note primary location allowed, Phase Header Field Position Is Left, Phase field position is popup, Pre Populate Task, Primary Loc HeaderField Position Is Left, Primary Location field position is popup, Proj assig dropdown account custom field, Project Task Tooltip Fieldset Name, Project editable after save audit Notes, Project tooltip fields, Restrict Task Based On Assignment, Restrict Task Based On Milestone, Save Column Preferences, Schedule Assignment Tooltip Fields, Schedule grid weekend delta, Schedule Project Tooltip Fields, Show Alert For NonZero HolidayHours, Show Alert For NonZero WeekendHours, Show Billable NonBillable Hours, Show Easy Entry Popup, Show Milestone As Field, Show ProjectName Assignment Dropdown, Show Recall On Timecards, Show Schedule Grid Expanded By Default, Show Travel, Show schedule grid, Show Schedule Tooltips, Show timecard etc, Show timecard methodology, Show timecard milestone, Show timecard phase, Status/Recall Column Not Fixed, TC HeaderRow Left Editable Fieldset Name, TC Header Row Editable Fieldset Name, TC Header Row Readonly Fieldset Name, TC Hour Fields To Copy From Schedule, TC Notes Field Editable Fieldset Name, TC Notes Field Readonly Fieldset Name, TC Status To Hide, Task Statuses To Hide, Task Time: Only show assigned tasks., Task Time: Filter task dates, Task Time Entry Mode, Top assignment to show count, Top_assignment_week_load_limit, Top project to show count, Use Field Set for Timecard UI, Use assignment id, Weekend Color Code, Width_px_for_milestone_drop_down, Width px for project assig drop down

### 173. Timecard (pse__Timecard_Header__c)
   - 110 custom fields
   - Fields: Additional Notes, Admin Global Edit, Approved, Approver, Assignment, Audit Notes History, Audit Notes, Bill Rate Defaulted from Milestone, Bill Rate, Billable, Billed, Cost Rate Amount, Cost Rate Currency Code, Cost Rate Exchange Rate, Bill Rate is Daily Rate, Cost Rate is Daily Rate, Days Worked Override, Disable Approval Auto Submit, End Date, Estimated Time To Completion, Exclude from Utilization, Exclude from Billing, Exclude from Daily Maximum, External Resource, Friday Days, Friday Hours, Friday Notes, Include In Financials, Invoiced, Location - Friday, Location - Monday, Location - Saturday, Location - Sunday, Location - Thursday, Location - Tuesday, Location - Wednesday, Milestone, Monday Days, Monday Hours, Monday Notes, Override Cost Service Line, Override Cost Delivery Model, Override Cost Region, Override Revenue Service Line, Override Revenue Delivery Model, Override Revenue Region, Primary Location, Primary Project Location, Project Exchange Rate, Project Location - Friday, Project Location - Monday, Project Location - Saturday, Project Location - Sunday, Project Location - Thursday, Project Location - Tuesday, Project Location - Wednesday, Project Methodology, Project Methodology, Project Phase, Project Phase, Project, Resource, Saturday Days, Saturday Hours, Saturday Notes, Start Date, Status, Submitted, Sunday Days, Sunday Hours, Sunday Notes, Thursday Days, Thursday Hours, Thursday Notes, Time Credited, Time Excluded, Time Logged in Days, Timecard Notes, Timecard UI Save/Submit Needed, Timer Session, Travel - Friday, Travel - Monday, Travel - Saturday, Travel - Sunday, Travel - Thursday, Travel - Tuesday, Travel - Wednesday, Tuesday Days, Tuesday Hours, Tuesday Notes, Wednesday Days, Wednesday Hours, Wednesday Notes, Total Days Worked Advanced, Cost Rate, Hours To Days Rule (Assignment), Hours To Days Rule (Project), Total Billable Amount, Total Cost, Total Days Worked, Total Hours, Travel Week, Project Task Hours, Services Product, Is Resource Current User, PSR Total Billable Hours, Timecard Notification, Time Logged with Start And End Time, Doc ID, Timecard External ID

### 174. Timecard Transmission (pse__Timecard_Transmission__c)
   - 6 custom fields
   - Fields: Batch Limit, End Date, Message, Records Processed, Start Date, Status

### 175. Timecard Split (pse__Timecard__c)
   - 91 custom fields
   - Fields: Timecard Header, Approved, Approved for Billing, Approved for Vendor Payment, Assignment, Bill Date, Bill Transaction, Billable, Billed, Billing Event Item, Billing Hold, Cost Rate Exchange Rate, Cost Transaction, End Date, Est Vs Actuals, Estimated Time To Completion, Exclude from Billing, External Resource, Friday Hours, Friday Notes, Include In Financials, Invoice Date, Invoice Number, Invoice Transaction, Invoiced, Location - Fri, Location - Mon, Location - Sat, Location - Sun, Location - Thu, Location - Tue, Location - Wed, Milestone, Monday Hours, Monday Notes, Override Cost Group Currency Code, Override Cost Group, Override Cost Practice Currency Code, Override Cost Practice, Override Cost Region Currency Code, Override Cost Region, Override Revenue Group Currency Code, Override Revenue Group, Override Revenue Practice Currency Code, Override Revenue Practice, Override Revenue Region Currency Code, Override Revenue Region, Project Exchange Rate, Project, Recognition Method, Resource, Revenue Transaction, Saturday Hours, Saturday Notes, Start Date, Status, Submitted, Sunday Hours, Sunday Notes, Synchronous Update Required, Thursday Hours, Thursday Notes, Time Credited, Time Excluded, Time Transaction, Timecard Notes, Total Billable Amount, Total Cost, Total Days Worked, Total Hours, Travel - Fri, Travel - Mon, Travel - Sat, Travel - Sun, Travel - Thu, Travel - Tue, Travel - Wed, Tuesday Hours, Tuesday Notes, Vendor Invoice Item, Wednesday Hours, Wednesday Notes, Billing Event Invoiced, Billing Event Released, Billing Event Status, Billing Event, Cost Rate Currency Code, Eligible for Billing, Travel?, Recurring/Project, Project ID

### 176. Timer Session Event (pse__Timer_Session_Event__c)
   - 10 custom fields
   - Fields: Timer Session, End Date Time, Notes, Start Date Time, Duration (Hours), Duration, Is Running, Location, Project Location, Travel

### 177. Timer Session (pse__Timer_Session__c)
   - 20 custom fields
   - Fields: Assignment, Case, Timer Session Display Name, Milestone, Project Task, Project, Sync to Timecard, Timecard Assignment, Timecard Sync Log, Timecard Milestone, Timecard Project Task, Timecard Project, User, Start Date Time, Duration (Hours), End Date Time, Is Running, Latest Event End Date Time, Running Event Count, Total Duration

### 178. Timer Settings (pse__Timer_Settings__c)
   - 4 custom fields
   - Fields: Auto Enable Timecard Sync, Supported Object Fields, Timecard Sync Interval Rounding, Timecard Sync Rounding Mode

### 179. Transaction Delta (pse__Transaction_Delta__c)
   - 24 custom fields
   - Fields: Is Time, Is Update, New Amount, New Category, New Currency, New Effective Date, New Service Line, New Hours, New Delivery Model, New Project, New Region, New Related Record Ineligible, New Resource, Old Amount, Old Category, Old Currency, Old Effective Date, Old Service Line, Old Hours, Old Delivery Model, Old Project, Old Region, Old Related Record Ineligible, Old Resource

### 180. Transaction (pse__Transaction__c)
   - 41 custom fields
   - Fields: Amount, Budget, Category, Effective Date, Expense, Service Line Currency, Service Line Currency Exchange Rate, Service Line, Hours, Milestone, Miscellaneous Adjustment, Overridden Service Line, Overriden Delivery Model, Overridden Region, Delivery Model Currency, Delivery Model Exchange Rate, Delivery Model, Project Currency Code, Project Currency Exchange Rate, Project, Region Currency Code, Region Currency Exchange Rate, Region, Related Record Ineligible, Related Record ID, Related Record Name, Resource Currency Code, Resource Currency Exchange Rate, Resource, Timecard, Type, For Billing, Is Cost, Is Expense, For Invoicing, Is Revenue, Is Time, Amount (Service Line Currency), Amount (Delivery Model Currency), Amount (Region Currency), Related Record

### 181. Triggers (pse__Triggers__c)
   - 17 custom fields
   - Fields: RecalculateEstVsActuals Disabled, RecalculateEstVsActuals Enabled, Res Request Geolocation Trigger Disabled, Resource Geolocation Trigger Disabled, Skill Unique Name Trigger Disabled, Skill Unique Name Under Parent Enabled, Task Assignment-Delete Disabled, Task Assignment-Insert Disabled, Task Assignment-Update Disabled, Task-Delete Disabled, Task-Insert Disabled, Task-Update Disabled, Task Validation Trigger Disabled, TrackResourceChanges_Disabled, Deprecated:TrackResourceChanges Enabled, handleAsnProjPhaseChangeDisabled, handleAsnProjMethChangeDisabled

### 182. UI Helper (pse__UI_Helper__c)
   - 19 custom fields
   - Fields: Account, Active Resource, Checkbox, Contact, Date Time, Date, Service Line, Number.0, Number.1, Number.2, Opportunity, Percentage, Delivery Model, Project, Region, Resource, UI Storage Index, UI Storage, User

### 183. Utilization Calculation (pse__Utilization_Calculation__c)
   - 29 custom fields
   - Fields: Batch Id Unheld Calc, Batch Id, Calculate Historical Utilization, Calculate Scheduled Utilization, Default Opportunity Probability, Delete Prior Calculation, Deleted Date, Error Details, Excluded Roles, Service Line, Historical Utilization Cut-Off Date, Historical Utilization End Date, Historical Utilization Start Date, Include Sublevels, Include Sublevels in Subtotals, Is Report Master, Minimum Opportunity Probability, Delivery Model, Region, Resource, Scheduled Utilization End Date, Scheduled Utilization Start Date, Status, Subtotal Service Line, Subtotal Delivery Model, Subtotal by Region, Time Period Types, Time Period, Type

### 184. Utilization Detail (pse__Utilization_Detail__c)
   - 49 custom fields
   - Fields: Utilization Calculation, Service Line, Historical Scheduled Billable Hours, Historical Scheduled Credited Hours, Historical Scheduled Excluded Hours, Historical Scheduled Held Hours, Historical Scheduled Non-Billable Hours, Historical Billable Hours, Historical Calendar Hours, Historical Credited Hours, Historical End Date, Historical Excluded Hours, Historical Non-Billable Hours, Historical Start Date, Historical Utilization Target Hours, Delivery Model, Region, Resource, Scheduled Billable Hours, Scheduled Calendar Hours, Scheduled Credited Hours, Scheduled End Date, Scheduled Excluded Hours, Scheduled Held Hours, Scheduled Non-Billable Hours, Scheduled Start Date, Scheduled Utilization Target Hours, Template Key, Time Period Type, Time Period, Type, Utilization Target Hours, Historical Utilization (Billable Only), Historical Utilization Target Attainment, Historical Utilization Target, Historical Utilization, Is Report Master, Scheduled Utilization (Billable Only), Scheduled Utilization Target Attainment, Scheduled Utilization Target, Scheduled Utilization, Total Utilization (Billable Only), Total Utilization, Utilization Target Attainment, Utilization Target, Is Resource Current User, Remaining Capacity hours, Total Scheduled Hours, Remaining Capacity

### 185. Utilization Engine TOD (pse__Utilization_Engine_TOD__c)
   - 290 custom fields
   - Fields: Period, Resource, Assigned 00:00, Assigned 00:15, Assigned 00:30, Assigned 00:45, Assigned 01:00, Assigned 01:15, Assigned 01:30, Assigned 01:45, Assigned 02:00, Assigned 02:15, Assigned 02:30, Assigned 02:45, Assigned 03:00, Assigned 03:15, Assigned 03:30, Assigned 03:45, Assigned 04:00, Assigned 04:15, Assigned 04:30, Assigned 04:45, Assigned 05:00, Assigned 05:15, Assigned 05:30, Assigned 05:45, Assigned 06:00, Assigned 06:15, Assigned 06:30, Assigned 06:45, Assigned 07:00, Assigned 07:15, Assigned 07:30, Assigned 07:45, Assigned 08:00, Assigned 08:15, Assigned 08:30, Assigned 08:45, Assigned 09:00, Assigned 09:15, Assigned 09:30, Assigned 09:45, Assigned 10:00, Assigned 10:15, Assigned 10:30, Assigned 10:45, Assigned 11:00, Assigned 11:15, Assigned 11:30, Assigned 11:45, Assigned 12:00, Assigned 12:15, Assigned 12:30, Assigned 12:45, Assigned 13:00, Assigned 13:15, Assigned 13:30, Assigned 13:45, Assigned 14:00, Assigned 14:15, Assigned 14:30, Assigned 14:45, Assigned 15:00, Assigned 15:15, Assigned 15:30, Assigned 15:45, Assigned 16:00, Assigned 16:15, Assigned 16:30, Assigned 16:45, Assigned 17:00, Assigned 17:15, Assigned 17:30, Assigned 17:45, Assigned 18:00, Assigned 18:15, Assigned 18:30, Assigned 18:45, Assigned 19:00, Assigned 19:15, Assigned 19:30, Assigned 19:45, Assigned 20:00, Assigned 20:15, Assigned 20:30, Assigned 20:45, Assigned 21:00, Assigned 21:15, Assigned 21:30, Assigned 21:45, Assigned 22:00, Assigned 22:15, Assigned 22:30, Assigned 22:45, Assigned 23:00, Assigned 23:15, Assigned 23:30, Assigned 23:45, Calendar 00:00, Calendar 00:15, Calendar 00:30, Calendar 00:45, Calendar 01:00, Calendar 01:15, Calendar 01:30, Calendar 01:45, Calendar 02:00, Calendar 02:15, Calendar 02:30, Calendar 02:45, Calendar 03:00, Calendar 03:15, Calendar 03:30, Calendar 03:45, Calendar 04:00, Calendar 04:15, Calendar 04:30, Calendar 04:45, Calendar 05:00, Calendar 05:15, Calendar 05:30, Calendar 05:45, Calendar 06:00, Calendar 06:15, Calendar 06:30, Calendar 06:45, Calendar 07:00, Calendar 07:15, Calendar 07:30, Calendar 07:45, Calendar 08:00, Calendar 08:15, Calendar 08:30, Calendar 08:45, Calendar 09:00, Calendar 09:15, Calendar 09:30, Calendar 09:45, Calendar 10:00, Calendar 10:15, Calendar 10:30, Calendar 10:45, Calendar 11:00, Calendar 11:15, Calendar 11:30, Calendar 11:45, Calendar 12:00, Calendar 12:15, Calendar 12:30, Calendar 12:45, Calendar 13:00, Calendar 13:15, Calendar 13:30, Calendar 13:45, Calendar 14:00, Calendar 14:15, Calendar 14:30, Calendar 14:45, Calendar 15:00, Calendar 15:15, Calendar 15:30, Calendar 15:45, Calendar 16:00, Calendar 16:15, Calendar 16:30, Calendar 16:45, Calendar 17:00, Calendar 17:15, Calendar 17:30, Calendar 17:45, Calendar 18:00, Calendar 18:15, Calendar 18:30, Calendar 18:45, Calendar 19:00, Calendar 19:15, Calendar 19:30, Calendar 19:45, Calendar 20:00, Calendar 20:15, Calendar 20:30, Calendar 20:45, Calendar 21:00, Calendar 21:15, Calendar 21:30, Calendar 21:45, Calendar 22:00, Calendar 22:15, Calendar 22:30, Calendar 22:45, Calendar 23:00, Calendar 23:15, Calendar 23:30, Calendar 23:45, Held 00:00, Held 00:15, Held 00:30, Held 00:45, Held 01:00, Held 01:15, Held 01:30, Held 01:45, Held 02:00, Held 02:15, Held 02:30, Held 02:45, Held 03:00, Held 03:15, Held 03:30, Held 03:45, Held 04:00, Held 04:15, Held 04:30, Held 04:45, Held 05:00, Held 05:15, Held 05:30, Held 05:45, Held 06:00, Held 06:15, Held 06:30, Held 06:45, Held 07:00, Held 07:15, Held 07:30, Held 07:45, Held 08:00, Held 08:15, Held 08:30, Held 08:45, Held 09:00, Held 09:15, Held 09:30, Held 09:45, Held 10:00, Held 10:15, Held 10:30, Held 10:45, Held 11:00, Held 11:15, Held 11:30, Held 11:45, Held 12:00, Held 12:15, Held 12:30, Held 12:45, Held 13:00, Held 13:15, Held 13:30, Held 13:45, Held 14:00, Held 14:15, Held 14:30, Held 14:45, Held 15:00, Held 15:15, Held 15:30, Held 15:45, Held 16:00, Held 16:15, Held 16:30, Held 16:45, Held 17:00, Held 17:15, Held 17:30, Held 17:45, Held 18:00, Held 18:15, Held 18:30, Held 18:45, Held 19:00, Held 19:15, Held 19:30, Held 19:45, Held 20:00, Held 20:15, Held 20:30, Held 20:45, Held 21:00, Held 21:15, Held 21:30, Held 21:45, Held 22:00, Held 22:15, Held 22:30, Held 22:45, Held 23:00, Held 23:15, Held 23:30, Held 23:45

### 186. Utilization Engine (pse__Utilization_Engine__c)
   - 430 custom fields
   - Fields: Period, Resource, Type, 10-10, 10-11, 10-12, 10-13, 10-14, 10-15, 10-16, 10-17, 10-18, 10-19, 10-1, 10-20, 10-21, 10-22, 10-23, 10-24, 10-25, 10-26, 10-27, 10-28, 10-29, 10-2, 10-30, 10-31, 10-3, 10-4, 10-5, 10-6, 10-7, 10-8, 10-9, Month 10, 11-10, 11-11, 11-12, 11-13, 11-14, 11-15, 11-16, 11-17, 11-18, 11-19, 11-1, 11-20, 11-21, 11-22, 11-23, 11-24, 11-25, 11-26, 11-27, 11-28, 11-29, 11-2, 11-30, 11-3, 11-4, 11-5, 11-6, 11-7, 11-8, 11-9, Month 11, 12-10, 12-11, 12-12, 12-13, 12-14, 12-15, 12-16, 12-17, 12-18, 12-19, 12-1, 12-20, 12-21, 12-22, 12-23, 12-24, 12-25, 12-26, 12-27, 12-28, 12-29, 12-2, 12-30, 12-31, 12-3, 12-4, 12-5, 12-6, 12-7, 12-8, 12-9, Month 12, 1-10, 1-11, 1-12, 1-13, 1-14, 1-15, 1-16, 1-17, 1-18, 1-19, 1-1, 1-20, 1-21, 1-22, 1-23, 1-24, 1-25, 1-26, 1-27, 1-28, 1-29, 1-2, 1-30, 1-31, 1-3, 1-4, 1-5, 1-6, 1-7, 1-8, 1-9, Month 1, 2-10, 2-11, 2-12, 2-13, 2-14, 2-15, 2-16, 2-17, 2-18, 2-19, 2-1, 2-20, 2-21, 2-22, 2-23, 2-24, 2-25, 2-26, 2-27, 2-28, 2-29, 2-2, 2-3, 2-4, 2-5, 2-6, 2-7, 2-8, 2-9, Month 2, 3-10, 3-11, 3-12, 3-13, 3-14, 3-15, 3-16, 3-17, 3-18, 3-19, 3-1, 3-20, 3-21, 3-22, 3-23, 3-24, 3-25, 3-26, 3-27, 3-28, 3-29, 3-2, 3-30, 3-31, 3-3, 3-4, 3-5, 3-6, 3-7, 3-8, 3-9, Month 3, 4-10, 4-11, 4-12, 4-13, 4-14, 4-15, 4-16, 4-17, 4-18, 4-19, 4-1, 4-20, 4-21, 4-22, 4-23, 4-24, 4-25, 4-26, 4-27, 4-28, 4-29, 4-2, 4-30, 4-3, 4-4, 4-5, 4-6, 4-7, 4-8, 4-9, Month 4, 5-10, 5-11, 5-12, 5-13, 5-14, 5-15, 5-16, 5-17, 5-18, 5-19, 5-1, 5-20, 5-21, 5-22, 5-23, 5-24, 5-25, 5-26, 5-27, 5-28, 5-29, 5-2, 5-30, 5-31, 5-3, 5-4, 5-5, 5-6, 5-7, 5-8, 5-9, Month 5, 6-10, 6-11, 6-12, 6-13, 6-14, 6-15, 6-16, 6-17, 6-18, 6-19, 6-1, 6-20, 6-21, 6-22, 6-23, 6-24, 6-25, 6-26, 6-27, 6-28, 6-29, 6-2, 6-30, 6-3, 6-4, 6-5, 6-6, 6-7, 6-8, 6-9, Month 6, 7-10, 7-11, 7-12, 7-13, 7-14, 7-15, 7-16, 7-17, 7-18, 7-19, 7-1, 7-20, 7-21, 7-22, 7-23, 7-24, 7-25, 7-26, 7-27, 7-28, 7-29, 7-2, 7-30, 7-31, 7-3, 7-4, 7-5, 7-6, 7-7, 7-8, 7-9, Month 7, 8-10, 8-11, 8-12, 8-13, 8-14, 8-15, 8-16, 8-17, 8-18, 8-19, 8-1, 8-20, 8-21, 8-22, 8-23, 8-24, 8-25, 8-26, 8-27, 8-28, 8-29, 8-2, 8-30, 8-31, 8-3, 8-4, 8-5, 8-6, 8-7, 8-8, 8-9, Month 8, 9-10, 9-11, 9-12, 9-13, 9-14, 9-15, 9-16, 9-17, 9-18, 9-19, 9-1, 9-20, 9-21, 9-22, 9-23, 9-24, 9-25, 9-26, 9-27, 9-28, 9-29, 9-2, 9-30, 9-3, 9-4, 9-5, 9-6, 9-7, 9-8, 9-9, Month 9, Year, month 10-14 day total, month 10-21 day total, month 10-28 day total, month 10-7 day total, month 11-14 day total, month 11-21 day total, month 11-28 day total, month 11-7 day total, month 12-14 day total, month 12-21 day total, month 12-28 day total, month 12-7 day total, month 1-14 day total, month 1-21 day total, month 1-28 day total, month 1-7 day total, month 2-14 day total, month 2-21 day total, month 2-28 day total, month 2-7 day total, month 3-14 day total, month 3-21 day total, month 3-28 day total, month 3-7 day total, month 4-14 day total, month 4-21 day total, month 4-28 day total, month 4-7 day total, month 5-14 day total, month 5-21 day total, month 5-28 day total, month 5-7 day total, month 6-14 day total, month 6-21 day total, month 6-28 day total, month 6-7 day total, month 7-14 day total, month 7-21 day total, month 7-28 day total, month 7-7 day total, month 8-14 day total, month 8-21 day total, month 8-28 day total, month 8-7 day total, month 9-14 day total, month 9-21 day total, month 9-28 day total, month 9-7 day total

### 187. Utilization Result (pse__Utilization_Result__c)
   - 39 custom fields
   - Fields: Billable Assignment Hours, Billable Timecard Hours, Calendar Hours, Credited Assignment Hours, Credited Timecard Hours, Date, Service Line, Held Resource Request Hours, Hours at Threshold Value 1, Hours at Threshold Value 2, Hours at Threshold Value 3, Hours at Threshold Value 4, Hours at Threshold Value 5, Hours at Threshold Value 6, Utilization Run, Non-Billable Assignment Hours, Non-Billable Timecard Hours, Delivery Model, Region, Resource Change, Resource Role, Resource, Time Excluded Assignment Hours, Time Excluded Timecard Hours, Unheld Resource Request Hours, Unheld Resource Request Weighted Hours, Unique Identifier, DEPRECATED: Util Excluded Assignment Hrs, DEPRECATED: Util Excluded Held RR Hrs, DEPRECATED: Util Excluded Timecard Hrs, DEPRECATED: Util Excluded Unheld RR Hrs, Utilization Target Hours, Utilization Target, Weighted Hours at Threshold Value 1, Weighted Hours at Threshold Value 2, Weighted Hours at Threshold Value 3, Weighted Hours at Threshold Value 4, Weighted Hours at Threshold Value 5, Weighted Hours at Threshold Value 6

### 188. Utilization Run Batch (pse__Utilization_Run_Batch__c)
   - 8 custom fields
   - Fields: Apex Job ID, End Date, Message, Scope, Stage, Start Date, Status, Utilization Run

### 189. Utilization Run Processed (pse__Utilization_Run_Processed__c)
   - 0 custom fields
   - Fields: 

### 190. Utilization Run (pse__Utilization_Run__c)
   - 20 custom fields
   - Fields: End Date, Message, Process End Date & Time, Process Start Date & Time, Send Failure Email, Send Failure Notification, Send Success Email, Send Success Notification, Start Date of Changes, Start Date, Status, Subtract Holidays From Calendar Hours, Threshold Value 1, Threshold Value 2, Threshold Value 3, Threshold Value 4, Threshold Value 5, Threshold Value 6, Timecard Statuses, Total Batches

### 191. Utilization Setup (pse__Utilization_Setup__c)
   - 27 custom fields
   - Fields: Active, Assignment Batch Size, Calculate Hours For Threshold Values, End Date, Held Resource Request Batch Size, Only Include Changes, Resource Batch Size, Schedule Exception Batch Size, Send Failure Email, Send Failure Notification, Send Success Email, Send Success Notification, Start Date, Subtract Holidays From Calendar Hours, Threshold Value 1, Threshold Value 2, Threshold Value 3, Threshold Value 4, Threshold Value 5, Threshold Value 6, Timecard Batch Size, Timecard Statuses, Unheld Resource Request Batch Size, Utilization Period, Utilization Result Batch Size, Utilization Run Monitor Interval, Work Calendar Batch Size

### 192. Utilization Summary (pse__Utilization_Summary__c)
   - 27 custom fields
   - Fields: Utilization Calculation, Actual Billable Hours, Actual Credited Hours, Actual Excluded Hours, Actual Non-Billable Hours, Assigned Billable Hours, Assigned Credited Hours, Assigned Excluded Hours, Assigned Non-Billable Hours, Calendar Hours, Service Line, Held Hours Opp Pct Weighted, Held Hours, Delivery Model, Region, Resource Role, Target Hours, Template Key, Time Period, Type, Unheld Hours Opp Pct Weighted, Unheld Hours, Remaining Capacity, Total Hours Opp Pct Weighted, Total Hours, Period Ending, Remaining Capacity Hours

### 193. Utilization (pse__Utilization__c)
   - 28 custom fields
   - Fields: Assignment Batch Size, Batch Deletion Cut-Off Point, Calculate Cross Products, Calculate Held Resource Request Time, Calculate Summary By Role, Calculate Unheld Resource Request Time, Custom Filters for Unheld RR Utilization, Default Opportunity Probability, Deletion Batch Size, Deletion Child Record Batch Size, Disable Legacy Utilization, Historical UTE Work Cal Start Day, Minimum Opportunity Probability, Resource Batch Size, Resource Request Batch Size, Target Utilization Approach, Timecard Batch Size, Timecard Statuses, Uncheck Master Based On Type/Parent, Use Start Date and Last Date on Resource, DEPRECATED: Use Utilization Calculation, Use Utilization Engine for Shift Mgmt, Use Utilization Engine, Utilization Engine Batch Size, Utilization Eng Max Range Shift Mgmt, Utilization Engine Max Range, Utilization Eng Start Range Shift Mgmt, Utilization Engine Start Range

### 194. Vendor Invoice Item (pse__Vendor_Invoice_Item__c)
   - 31 custom fields
   - Fields: Vendor Invoice, Action: Recalc Vendor Currency Amount:, Amount, Budget Header, Date, Description, Expense, Item Exchange Rate Override, Milestone, Miscellaneous Adjustment, Override Item Exchange Rate, Project Currency Exchange Rate, Project, Quantity, Resource, Timecard, Unit Price, Vendor Currency Amount Number, Vendor Currency Exchange Rate, Account Currency, Vendor Currency Amount, Vendor Currency, Vendor Invoice ER Override Applied, Calculate Tax Value From Rate, Derive Tax Rate From Code, Set Tax Code To Default, Tax Rate, Tax Value, Net Value - Credit, Net Value, Tax Value - Credit

### 195. Vendor Invoice (pse__Vendor_Invoice__c)
   - 27 custom fields
   - Fields: Account, Action: Recalc Vendor Currency Amount, Approved for Payment, Date, Description, Invoice Number, Override Vendor Invoice Exchange Rate, PO/WO Number, SFDC VAT#, Status, Submitted, Target Payment Date, Vendor Currency, Vendor Invoice Exchange Rate Override, Vendor VAT#, First Item Date, Last Item Date, Total, Vendor Currency Total Number, Account Currency, Vendor Currency Total, Automatically Pass to Accounting, Eligible Expense for Credit Note, Eligible Expense for Invoice, Eligible for Payable Credit Note, Eligible for Payable Invoice, Passed to Accounting

### 196. Version Item Assignment (pse__VersionItem_Assignment__c)
   - 38 custom fields
   - Fields: Version, Assignment Name, Assignment Number, Bill Rate, Cost Rate Amount, Cost Rate Currency Code, Cost Rate, End Date, Billable, Location, Milestone Id, Milestone Name, Original Created By Id, Original Created By Name, Original Created Date, Original Id, Original Last Modified By Id, Original Last Modified By Name, Original Last Modified Date, Original Owner Id, Original Owner Name, Percentage Allocated, Project Task Hours, Rate Card Id, Rate Card Name, Resource Id, Resource Name, Resource Request Id, Resource Request Name, Resource, Role, Schedule Id, Schedule Name, Scheduled Hours, Start Date, Status, Time Credited, Time Excluded

### 197. Version Item Budget (pse__VersionItem_Budget__c)
   - 28 custom fields
   - Fields: Version, Account Id, AccountName, Amount, Approved, Billable, Billed, Budget Name, Effective Date, Expense Amount, Include In Financials, Invoiced, Opportunity Id, Opportunity Name, Original Created By Id, Original Created By Name, Original Created Date, Original Id, Original Last Modified By Id, Original Last Modified Date, OriginalOwnerId, Original Owner Name, Original Last Modified By Name, Status, Total Amount, Transaction Id, Transaction Name, Type

### 198. Version Item Estimates Vs Actuals (pse__VersionItem_EstimatesVsActuals__c)
   - 24 custom fields
   - Fields: Version, Actual Days, Actual Hours, Assignment Id, Assignment Name, End Date, Estimated Days, Estimated Hours, Estimates Vs Actuals Name, Original Created By Id, Original Created By Name, Original Created Date, Original Id, Original Last Modified By Id, Original Last Modified By Name, Original Last Modified Date, Original Owner Id, Original Owner Name, Resource Id, Resource Name, Start Date, Time Period Id, Time Period Name, Time Period Type

### 199. Version Item Issue (pse__VersionItem_Issue__c)
   - 26 custom fields
   - Fields: Version, Account Id, Account Name, Action Plan, Closed Date, Closed, Comments, Date Raised, Impact, Issue Owner Id, Issue Owner Name, Issue Description, Issue Name, Issue Number, Milestone Id, Milestone Name, Opportunity Id, Opportunity Name, Original Id, Priority, Project Task Id, Project Task Name, Risk Id, Risk Name, Severity, Status

### 200. Version Item Milestone (pse__VersionItem_Milestone__c)
   - 26 custom fields
   - Fields: Version, Actual Date, Approved, Approved for Billing, Bill Date, Billed, Include In Financials, Invoice Date, Log Milestone Cost As External, Milestone Name, Milestone Amount, Milestone Cost, Original Created By Id, Original Created By Name, Original Created Date, Original Id, Original Last Modified By Id, Original Last Modified By Name, Original Last Modified Date, Original Owner Id, Original Owner Name, Planned Hours, Project Task Hours, Status, Target Date, Total Number of Tasks

### 201. Version Item Phase (pse__VersionItem_Phase__c)
   - 14 custom fields
   - Fields: Version, Description, End Date, Original Created By Id, Original Created By Name, Original Created Date, Original Id, Original Last Modified By Id, Original Last Modified By Name, Original Last Modified Date, Original Owner Id, Original Owner Name, Project Phase Name, Start Date

### 202. Version Item Project Detail (pse__VersionItem_ProjectDetail__c)
   - 33 custom fields
   - Fields: Version, Account Id, Account Name, Billing Type, End Date, Service Line Id, Service Line Name, Active, Billable, Opportunity Id, Opportunity Name, Original Created By Id, Original Created By Name, Original Created Date, Original Id, Original Last Modified By Id, Original Last Modified By Name, Original Last Modified Date, Original Owner Id, Original Owner Name, Delivery Model Id, Delivery Model Name, Project Manager Id, Project Manager Name, Project Name, Project Phase, Project Status, Project Type, Region Id, Region Name, Stage, Start Date, Total Costs

### 203. Version Item Resource Request (pse__VersionItem_ResourceRequest__c)
   - 30 custom fields
   - Fields: Version, Account, Assignment Id, Assignment Name, End Date, Milestone Id, Milestone Name, Original Created By Id, Original Created By Name, Original Created Date, Original Id, Original Last Modified By Id, Original Last Modified By Name, Original Last Modified Date, Original Owner Id, Original Owner Name, Percent Allocated, Request Priority, Requested Bill Rate, Suggested Resource Id, Suggested Resource Name, Resource Request Id, Resource Held, Resource Request Name, Resource Role, Requested Hours, Resource Id, Resource Name, Start Date, Status

### 204. Version Item Risk (pse__VersionItem_Risk__c)
   - 27 custom fields
   - Fields: Version, Account Id, Account Name, Closed Date, Closed, Comments, Contingency, Date Raised, Impact, Issue Id, Issue Name, Likelihood, Milestone Id, Milestone Name, Mitigation Plan, Opportunity Id, Opportunity Name, Original Id, Project Task Id, Project Task Name, Risk Owner Id, Risk Owner Name, Risk Description, Risk Name, Risk Number, Severity, Status

### 205. Version Item Task (pse__VersionItem_Task__c)
   - 31 custom fields
   - Fields: Version, Actual End Date and Time, Actual Hours, Actual Start Date and Time, Assigned Resources, Blocked, Completed, End Date and Time, Estimated Hours, Hierarchy Depth, Hours Remaining, Peer Order, Original Created By Id, Original Created By Name, Original Created Date, Original Id, Original Last Modified By Id, Original Last Modified By Name, Original Last Modified Date, Original Owner Id, Original Owner Name, Parent Task Id, Parent Task Name, Percent Complete (Hours), Points, Project Task Name, Start Date and Time, Status, Summary, Task Key Chain, Task Number

### 206. Version Batch Control Log (pse__Version_Batch_Control_Log__c)
   - 2 custom fields
   - Fields: Version, Message

### 207. Version Config (pse__Version_Config__c)
   - 4 custom fields
   - Fields: Fields To Include, Default, Summary, Unique Name

### 208. Version (pse__Version__c)
   - 6 custom fields
   - Fields: Baseline, Batch Apex Job Id, Batch Process, Notes, Project, Status

### 209. DEPRECATED: WorkQueues (pse__WorkQueues__c)
   - 18 custom fields
   - Fields: Last Queue Manager Execution, Scheduled Job ID, Use With Actuals, Use With Backlog, Use With Billing Clear, Use With Billing Generation, Use With Billing Invoice, Use With Billing Recalc, Use With Billing Release, Use With Billing Remove, Use With Missing Time Cards, Use With RPGPR Maint, Use With Utilization, Use Work Queue Manager, Use Work Queue Monitor, Work Queue Manager Max Threads, Work Queue Manager Poll Frequency, Work Queue Monitor Schedule ID

### 210. Work Calendar (pse__Work_Calendar__c)
   - 26 custom fields
   - Fields: Available Time Entry Modes, Friday End Hour, Friday Hours, Friday Start Hour, Monday End Hour, Monday Hours, Monday Start Hour, Saturday End Hour, Saturday Hours, Saturday Start Hour, Standard Hours Per Day, Sunday End Hour, Sunday Hours, Sunday Start Hour, Thursday End Hour, Thursday Hours, Thursday Start Hour, Tuesday End Hour, Tuesday Hours, Tuesday Start Hour, Wednesday End Hour, Wednesday Hours, Wednesday Start Hour, Week Start Day, Allow Start/End on Non-working Days, Week Total Hours

### 211. Work Event Invite (pse__Work_Event_Invite__c)
   - 2 custom fields
   - Fields: Work Event, Contact

### 212. Work Event (pse__Work_Event__c)
   - 8 custom fields
   - Fields: Short Description, End Date & Time, External Event ID, Host, Project, Start Date & Time, Is Online Meeting, Description

### 213. Work Opportunities Hub (pse__Work_Opportunity_Hub__c)
   - 8 custom fields
   - Fields: Candidate Limit, Candidates Can Self-Nominate for Work, Deprecated:Filter by Primary Skill, Filter by Resource Service Line, Filter by Resource Delivery Model, Filter by Resource Region, Filter by Resource Role, Filter by Resource Skill Request

### 214. DEPRECATED: Work Queue (pse__Work_Queue__c)
   - 10 custom fields
   - Fields: ApexClass, Batch ID, Constructor Data, Cron Day Parameter, Cron Schedule, Last Run, Next Run, Status Message, Status, Time Zone Offset

### 215. PSA Batch Process Detail (pse__fflib_BatchProcessDetail__c)
   - 5 custom fields
   - Fields: Batch Process, Apex Job Id, Chain Number, Status Detail, Status

### 216. PSA Batch Process (pse__fflib_BatchProcess__c)
   - 16 custom fields
   - Fields: Apex Job Class Name, Apex Job ID, Batch Control Record ID, Concurrency Mode Unique ID, Deprecated: Current Chain Index, Current Chain Number, Failed Record ID, From Progress Bar, Number of Chains in Batch, Process Name, Progress Information, Status Detail, Status, Successful Record ID, Deprecated: Total Chain Number, Use Default Constructor

### 217. PSA Scheduler Configuration (pse__fflib_SchedulerConfiguration__c)
   - 14 custom fields
   - Fields: Number of Occurrences to End After, End Date, Hours Between Each Occurrence, Monthly Fixed Date, Recurs Every Month on a, Flavor, Ordinal, Run on nearest weekday, Preferred Start Time Hour, Preferred Start Time Minute, Scheduling Frequency, Start Date, Visible Fields, Recur Every Week on

### 218. XXX Batch Test Opportunity 2 Line Item (pse__fflib_XXXBatchTestOpportunity2LineItem__c)
   - 5 custom fields
   - Fields: XXX Batch Test Opportunity 2, XXX Line Description, XXX Pricebook Entry, XXX Quantity, XXX Sales Price

### 219. XXX Batch Test Opportunity 2 (pse__fflib_XXXBatchTestOpportunity2__c)
   - 5 custom fields
   - Fields: XXX Account, XXX Batch Process, XXX Description, XXX Forecast Category, XXX Next Step

### 220. PSA Permission Settings (pse__security__c)
   - 2 custom fields
   - Fields: Bypass Internal FLS and CRUD, Disable Permission Checks

