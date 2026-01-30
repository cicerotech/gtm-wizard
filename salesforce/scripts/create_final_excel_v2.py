import pandas as pd

# Sheet 1: Executive Summary with proper breakdown
exec_summary = pd.DataFrame([
    {'Event': 'AI Supper Club Series', 'Commitment (LOI)': 3000000, 'Actual Revenue': 2185000, 'Total Attributed': 5185000, 'Notes': '5 events Q1-Q2; Pure Storage LOI + Coherent/Intuit/IQVIA/DHL recurring'},
    {'Event': 'Lighthouse Event', 'Commitment (LOI)': 0, 'Actual Revenue': 2191000, 'Total Attributed': 2191000, 'Notes': '25+ registered; Coherent/Cargill/DHL/Duracell revenue'},
    {'Event': 'Augmented Intelligence Summit', 'Commitment (LOI)': 7448333, 'Actual Revenue': 4298000, 'Total Attributed': 11746333, 'Notes': '182 registered; largest event; Bayer/Dolby/Weir LOIs'},
    {'Event': 'IQPC Corporate Compliance', 'Commitment (LOI)': 3000000, 'Actual Revenue': 300000, 'Total Attributed': 3300000, 'Notes': 'Bayer LOI directly sourced + recurring deal'},
    {'Event': '', 'Commitment (LOI)': None, 'Actual Revenue': None, 'Total Attributed': None, 'Notes': ''},
    {'Event': 'Intuit + Pure Storage (Supper Club)', 'Commitment (LOI)': 3000000, 'Actual Revenue': 485000, 'Total Attributed': 3485000, 'Notes': 'Pure Storage LOI $3M + Intuit revenue $485K'},
    {'Event': '', 'Commitment (LOI)': None, 'Actual Revenue': None, 'Total Attributed': None, 'Notes': ''},
    {'Event': 'TOTAL (All Closed Won)', 'Commitment (LOI)': 16115000, 'Actual Revenue': 6957132, 'Total Attributed': 23072132, 'Notes': 'Grand total across all sources'},
])

# Sheet 2: AI Supper Club Detail
supper_detail = pd.DataFrame([
    {'Category': 'COMMITMENT (LOI)', 'Account': 'Pure Storage', 'Amount': 3000000, 'Deal': 'Pure Storage - LOI', 'Attendee': 'Niki Armstrong (CLO)', 'Event': '2025-Q2-Palo Alto June'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'DHL', 'Amount': 0, 'Deal': 'DHL - LOI', 'Attendee': 'Event attendee', 'Event': 'Multiple'},
    {'Category': 'RECURRING REVENUE', 'Account': 'Coherent', 'Amount': 1150000, 'Deal': 'Coherent - Contracting', 'Attendee': 'Event attendee', 'Event': 'NYC Supper Club'},
    {'Category': 'RECURRING REVENUE', 'Account': 'Intuit', 'Amount': 410000, 'Deal': 'Intuit - Contracting, Marketing, Sigma', 'Attendee': 'Kerry McLean (GC), Stephanie Cherny (DGC)', 'Event': 'Palo Alto June'},
    {'Category': 'RECURRING REVENUE', 'Account': 'IQVIA', 'Amount': 300000, 'Deal': 'IQVIA - Recurring', 'Attendee': 'Event attendee', 'Event': 'NYC Jan 29'},
    {'Category': 'RECURRING REVENUE', 'Account': 'DHL', 'Amount': 250000, 'Deal': 'DHL - Insights', 'Attendee': 'Event attendee', 'Event': 'Multiple'},
    {'Category': 'PROJECT REVENUE', 'Account': 'Intuit', 'Amount': 75000, 'Deal': 'Intuit - Managed Services', 'Attendee': 'Stephanie Cherny (DGC)', 'Event': 'Palo Alto June'},
    {'Category': 'PROJECT REVENUE', 'Account': 'Chevron', 'Amount': 0, 'Deal': 'Chevron - Marketing Compliance', 'Attendee': 'Event attendee', 'Event': 'Multiple'},
    {'Category': '', 'Account': '', 'Amount': None, 'Deal': '', 'Attendee': '', 'Event': ''},
    {'Category': 'TOTAL COMMITMENT', 'Account': '', 'Amount': 3000000, 'Deal': '', 'Attendee': '', 'Event': ''},
    {'Category': 'TOTAL REVENUE', 'Account': '', 'Amount': 2185000, 'Deal': '', 'Attendee': '', 'Event': ''},
    {'Category': 'GRAND TOTAL', 'Account': '', 'Amount': 5185000, 'Deal': '', 'Attendee': '', 'Event': ''},
])

# Sheet 3: Summit Detail
summit_detail = pd.DataFrame([
    {'Category': 'COMMITMENT (LOI)', 'Account': 'Bayer', 'Amount': 3000000, 'Deal': 'Bayer - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'Dolby', 'Amount': 2000000, 'Deal': 'Dolby - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'The Weir Group PLC', 'Amount': 1000000, 'Deal': 'Weir Group - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'Cox Media Group', 'Amount': 350000, 'Deal': 'Cox Media Group - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'AES', 'Amount': 333333, 'Deal': 'AES - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'Western Digital', 'Amount': 250000, 'Deal': 'Western Digital - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'CHS', 'Amount': 250000, 'Deal': 'CHS - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'GE Vernova', 'Amount': 200000, 'Deal': 'GE Vernova - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'Asana', 'Amount': 65000, 'Deal': 'Asana - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'Delinea', 'Amount': 0, 'Deal': 'Delinea - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'BNY Mellon', 'Amount': 0, 'Deal': 'BNY Mellon - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'Tailored Brands', 'Amount': 0, 'Deal': 'Tailored Brands - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'Amazon', 'Amount': 0, 'Deal': 'Amazon - EL'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'DHL', 'Amount': 0, 'Deal': 'DHL - LOI'},
    {'Category': 'COMMITMENT (LOI)', 'Account': 'Wealth Partners', 'Amount': 0, 'Deal': 'Wealth Partners - LOI'},
    {'Category': '', 'Account': '', 'Amount': None, 'Deal': ''},
    {'Category': 'RECURRING REVENUE', 'Account': 'Coherent', 'Amount': 1150000, 'Deal': 'Coherent - Contracting'},
    {'Category': 'RECURRING REVENUE', 'Account': 'Cargill', 'Amount': 521000, 'Deal': 'Cargill - Contracting'},
    {'Category': 'RECURRING REVENUE', 'Account': 'Intuit', 'Amount': 410000, 'Deal': 'Intuit - Contracting, Marketing, Sigma'},
    {'Category': 'RECURRING REVENUE', 'Account': 'Meta', 'Amount': 350000, 'Deal': 'Meta - 2026 Extension'},
    {'Category': 'RECURRING REVENUE', 'Account': 'IQVIA', 'Amount': 300000, 'Deal': 'IQVIA - Recurring'},
    {'Category': 'RECURRING REVENUE', 'Account': 'Bayer', 'Amount': 300000, 'Deal': 'Bayer - Marketing Compliance'},
    {'Category': 'RECURRING REVENUE', 'Account': 'Peregrine Hospitality', 'Amount': 275000, 'Deal': 'Peregrine Hospitality - Contracting'},
    {'Category': 'RECURRING REVENUE', 'Account': 'DHL', 'Amount': 250000, 'Deal': 'DHL - Insights'},
    {'Category': 'RECURRING REVENUE', 'Account': 'CHS', 'Amount': 120000, 'Deal': 'CHS - Contracting'},
    {'Category': 'RECURRING REVENUE', 'Account': 'Delinea', 'Amount': 120000, 'Deal': 'Delinea - Recurring (sigma)'},
    {'Category': 'RECURRING REVENUE', 'Account': 'Duracell', 'Amount': 120000, 'Deal': 'Duracell - G2N'},
    {'Category': 'RECURRING REVENUE', 'Account': 'Samsara', 'Amount': 40000, 'Deal': 'Samsara - Negotiation'},
    {'Category': '', 'Account': '', 'Amount': None, 'Deal': ''},
    {'Category': 'PROJECT REVENUE', 'Account': 'Cargill', 'Amount': 150000, 'Deal': 'Cargill - Cortex Pilot'},
    {'Category': 'PROJECT REVENUE', 'Account': 'Intuit', 'Amount': 75000, 'Deal': 'Intuit - Managed Services'},
    {'Category': 'PROJECT REVENUE', 'Account': 'Asana', 'Amount': 75000, 'Deal': 'Asana - Contracting & Insights Pilot'},
    {'Category': 'PROJECT REVENUE', 'Account': 'Peregrine Hospitality', 'Amount': 42000, 'Deal': 'Peregrine - Eudia Counsel'},
    {'Category': 'PROJECT REVENUE', 'Account': 'Chevron', 'Amount': 0, 'Deal': 'Chevron - Marketing Compliance'},
    {'Category': '', 'Account': '', 'Amount': None, 'Deal': ''},
    {'Category': 'TOTAL COMMITMENT', 'Account': '', 'Amount': 7448333, 'Deal': ''},
    {'Category': 'TOTAL REVENUE', 'Account': '', 'Amount': 4298000, 'Deal': ''},
    {'Category': 'GRAND TOTAL', 'Account': '', 'Amount': 11746333, 'Deal': ''},
])

# Sheet 4: IQPC/Bayer Detail
iqpc_detail = pd.DataFrame([
    {'Category': 'COMMITMENT (LOI)', 'Account': 'Bayer', 'Amount': 3000000, 'Deal': 'Bayer - LOI', 'Attendee': 'Jeremy Jessen (GC)', 'Source Event': 'Corporate Compliance Exchange'},
    {'Category': 'RECURRING REVENUE', 'Account': 'Bayer', 'Amount': 300000, 'Deal': 'Bayer - Marketing Compliance', 'Attendee': 'Jeremy Jessen (GC)', 'Source Event': 'Corporate Compliance Exchange'},
    {'Category': '', 'Account': '', 'Amount': None, 'Deal': '', 'Attendee': '', 'Source Event': ''},
    {'Category': 'TOTAL COMMITMENT', 'Account': '', 'Amount': 3000000, 'Deal': '', 'Attendee': '', 'Source Event': ''},
    {'Category': 'TOTAL REVENUE', 'Account': '', 'Amount': 300000, 'Deal': '', 'Attendee': '', 'Source Event': ''},
    {'Category': 'GRAND TOTAL', 'Account': '', 'Amount': 3300000, 'Deal': '', 'Attendee': '', 'Source Event': 'BAYER DIRECTLY SOURCED FROM IQPC'},
])

# Sheet 5: Key Accounts (Intuit, Pure Storage, Bayer)
key_accounts = pd.DataFrame([
    {'Account': 'PURE STORAGE', 'Deal Type': 'Commitment (LOI)', 'Amount': 3000000, 'Deal Name': 'Pure Storage - LOI', 'Event': '2025-Q2-Palo Alto June', 'Attendee': 'Niki Armstrong (CLO)', 'Status': 'LOI - Not yet revenue'},
    {'Account': '', 'Deal Type': '', 'Amount': None, 'Deal Name': '', 'Event': '', 'Attendee': '', 'Status': ''},
    {'Account': 'INTUIT', 'Deal Type': 'Project', 'Amount': 75000, 'Deal Name': 'Intuit - Managed Services', 'Event': 'SummitX / Palo Alto June', 'Attendee': 'Kerry McLean (GC), Stephanie Cherny (DGC)', 'Status': 'Actual revenue'},
    {'Account': 'INTUIT', 'Deal Type': 'Recurring', 'Amount': 410000, 'Deal Name': 'Intuit - Contracting, Marketing, Sigma', 'Event': 'SummitX / Palo Alto June', 'Attendee': 'Kerry McLean (GC), Stephanie Cherny (DGC)', 'Status': 'Actual revenue'},
    {'Account': 'INTUIT TOTAL', 'Deal Type': '', 'Amount': 485000, 'Deal Name': '', 'Event': '', 'Attendee': '', 'Status': 'All actual revenue'},
    {'Account': '', 'Deal Type': '', 'Amount': None, 'Deal Name': '', 'Event': '', 'Attendee': '', 'Status': ''},
    {'Account': 'BAYER', 'Deal Type': 'Commitment (LOI)', 'Amount': 3000000, 'Deal Name': 'Bayer - LOI', 'Event': 'Corporate Compliance Exchange', 'Attendee': 'Jeremy Jessen (GC)', 'Status': 'LOI - Not yet revenue'},
    {'Account': 'BAYER', 'Deal Type': 'Recurring', 'Amount': 300000, 'Deal Name': 'Bayer - Marketing Compliance', 'Event': 'Corporate Compliance Exchange', 'Attendee': 'Jeremy Jessen (GC)', 'Status': 'Actual revenue'},
    {'Account': 'BAYER TOTAL', 'Deal Type': '', 'Amount': 3300000, 'Deal Name': '', 'Event': '', 'Attendee': '', 'Status': '$3M LOI + $300K revenue'},
    {'Account': '', 'Deal Type': '', 'Amount': None, 'Deal Name': '', 'Event': '', 'Attendee': '', 'Status': ''},
    {'Account': 'INTUIT + PURE STORAGE COMBINED', 'Deal Type': '', 'Amount': 3485000, 'Deal Name': '', 'Event': '', 'Attendee': '', 'Status': '$3M Pure LOI + $485K Intuit revenue'},
])

# Sheet 6: EOY Review Fill-in Values
eoy_values = pd.DataFrame([
    {'Statement': 'AI Supper Club Series', 'Fill-in Value': '$5.2M', 'Breakdown': 'Commitment: $3M (Pure Storage LOI) + Revenue: $2.2M (Coherent, Intuit, IQVIA, DHL)', 'Recommended Wording': 'contributing $5.2M in total value (including $2.2M in actual revenue and $3M in committed ARR)'},
    {'Statement': 'Lighthouse Event - Intuit & Pure Storage', 'Fill-in Value': '$3.5M', 'Breakdown': 'Commitment: $3M (Pure Storage LOI) + Revenue: $485K (Intuit)', 'Recommended Wording': 'resulted in $3.5M in total value ($3M Pure Storage commitment + $485K Intuit revenue)'},
    {'Statement': 'Augmented Intelligence Summit', 'Fill-in Value': '$11.7M total / $4.3M revenue', 'Breakdown': 'Commitment: $7.4M + Revenue: $4.3M', 'Recommended Wording': 'driven $4.3M in actual revenue and $7.4M in committed ARR to date'},
    {'Statement': 'IQPC - Bayer Deal', 'Fill-in Value': '$3.3M', 'Breakdown': 'Commitment: $3M (LOI) + Revenue: $300K (recurring)', 'Recommended Wording': 'directly sourced the Bayer deal totaling $3.3M ($3M LOI + $300K in recurring revenue)'},
])

# Sheet 7: Terminology Guide
terminology = pd.DataFrame([
    {'Term': 'Commitment (LOI)', 'Definition': 'Letter of Intent - Customer has committed to this amount but it is NOT yet booked as revenue', 'Status': 'Committed, not revenue'},
    {'Term': 'Recurring Revenue', 'Definition': 'Actual recurring revenue - renewals, extensions, subscriptions that have been invoiced/booked', 'Status': 'Actual revenue'},
    {'Term': 'Project Revenue', 'Definition': 'One-time project-based revenue that has been invoiced/booked', 'Status': 'Actual revenue'},
    {'Term': 'Total Attributed', 'Definition': 'Commitment + Recurring + Project = Total value attributed to event', 'Status': 'Combined value'},
    {'Term': 'Actual Revenue', 'Definition': 'Recurring + Project only - excludes commitments/LOIs', 'Status': 'Real $ received'},
])

# Write to Excel
output_path = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/salesforce/scripts/exports/MARKETING_EOY_FINAL_VALIDATED.xlsx'
with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    exec_summary.to_excel(writer, sheet_name='Executive Summary', index=False)
    supper_detail.to_excel(writer, sheet_name='AI Supper Club Detail', index=False)
    summit_detail.to_excel(writer, sheet_name='Summit Detail', index=False)
    iqpc_detail.to_excel(writer, sheet_name='IQPC Bayer Detail', index=False)
    key_accounts.to_excel(writer, sheet_name='Key Accounts', index=False)
    eoy_values.to_excel(writer, sheet_name='EOY Fill-in Values', index=False)
    terminology.to_excel(writer, sheet_name='Terminology Guide', index=False)

print(f'✅ Excel file saved to: {output_path}')

# Also copy to Desktop
import shutil
desktop_path = '/Users/keiganpesenti/Desktop/MARKETING_EOY_FINAL_VALIDATED.xlsx'
shutil.copy(output_path, desktop_path)
print(f'✅ Also copied to: {desktop_path}')
