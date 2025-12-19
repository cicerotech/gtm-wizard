#!/usr/bin/env python3
"""
Probability Impact Analysis
Compares current vs proposed probabilities and outputs validation Excel
"""

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from datetime import datetime
from collections import defaultdict

# Current probabilities (from existing formula)
CURRENT_PROBS = {
    "Stage 0 - Qualifying": {"New Logo": 0.02, "Existing Client": 0.02, "LOI": 0.02, "Government": 0.02},
    "Stage 1 - Discovery": {"New Logo": 0.10, "Existing Client": 0.18, "LOI": 0.20, "Government": 0.08},
    "Stage 2 - SQO": {"New Logo": 0.20, "Existing Client": 0.32, "LOI": 0.35, "Government": 0.12},
    "Stage 3 - Pilot": {"New Logo": 0.25, "Existing Client": 0.42, "LOI": 0.45, "Government": 0.18},
    "Stage 4 - Proposal": {"New Logo": 0.33, "Existing Client": 0.50, "LOI": 0.55, "Government": 0.22},
    "Stage 5 - Negotiation": {"New Logo": 0.58, "Existing Client": 0.72, "LOI": 0.72, "Government": 0.35},
}

# NEW probabilities (proposed changes)
NEW_PROBS = {
    "Stage 0 - Qualifying": {"New Logo": 0.02, "Existing Client": 0.02, "LOI": 0.02, "Government": 0.02},
    "Stage 1 - Discovery": {"New Logo": 0.10, "Existing Client": 0.19, "LOI": 0.17, "Government": 0.08},
    "Stage 2 - SQO": {"New Logo": 0.20, "Existing Client": 0.33, "LOI": 0.30, "Government": 0.12},
    "Stage 3 - Pilot": {"New Logo": 0.25, "Existing Client": 0.43, "LOI": 0.40, "Government": 0.18},
    "Stage 4 - Proposal": {"New Logo": 0.33, "Existing Client": 0.52, "LOI": 0.48, "Government": 0.22},
    # Stage 5 removed - will default to 0
}

def analyze_pipeline():
    # Load source file
    print("Loading 222.xlsx...")
    wb = openpyxl.load_workbook("/Users/keiganpesenti/Desktop/222.xlsx")
    ws = wb.active
    
    # Get headers
    headers = [cell.value for cell in ws[1]]
    print(f"Headers: {headers}")
    
    # Find column indices
    col_map = {h: i for i, h in enumerate(headers) if h}
    print(f"Column map: {col_map}")
    
    # Q4 cutoff
    q4_cutoff = datetime(2026, 1, 31)
    
    # Collect all deals
    all_deals = []
    
    for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row[0]:  # Skip empty rows
            continue
            
        # Extract fields
        deal = {
            "row": row_num,
            "pod": row[col_map.get("Pod", 0)] if "Pod" in col_map else row[0],
            "sales_type": row[col_map.get("Sales Type", 1)] if "Sales Type" in col_map else row[1],
            "acct_class": row[col_map.get("Account Type Classification", 2)] if "Account Type Classification" in col_map else row[2],
            "stage": row[col_map.get("Stage", 3)] if "Stage" in col_map else row[3],
            "deal_status": row[col_map.get("Deal Status", 4)] if "Deal Status" in col_map else (row[4] if len(row) > 4 else None),
            "owner": row[col_map.get("Opportunity Owner: Full Name", 5)] if "Opportunity Owner: Full Name" in col_map else (row[5] if len(row) > 5 else None),
            "opp_name": row[col_map.get("Opportunity Name", 6)] if "Opportunity Name" in col_map else (row[6] if len(row) > 6 else None),
            "target_date": row[col_map.get("Target sign date", 7)] if "Target sign date" in col_map else (row[7] if len(row) > 7 else None),
            "weighted_acv": row[col_map.get("Weighted ACV", 8)] if "Weighted ACV" in col_map else (row[8] if len(row) > 8 else 0),
            "calc_prob": row[col_map.get("Calculated Probability", 9)] if "Calculated Probability" in col_map else (row[9] if len(row) > 9 else None),
            "custom_prob": row[col_map.get("Custom Probability Value", 10)] if "Custom Probability Value" in col_map else (row[10] if len(row) > 10 else None),
        }
        
        # Parse weighted ACV
        if deal["weighted_acv"] is None:
            deal["weighted_acv"] = 0
        elif isinstance(deal["weighted_acv"], str):
            deal["weighted_acv"] = float(deal["weighted_acv"].replace("$", "").replace(",", ""))
        
        # Parse calc_prob
        if deal["calc_prob"] is not None:
            if isinstance(deal["calc_prob"], str):
                deal["calc_prob"] = float(deal["calc_prob"].replace("%", "")) / 100
            elif deal["calc_prob"] > 1:
                deal["calc_prob"] = deal["calc_prob"] / 100
        
        # Parse custom_prob
        if deal["custom_prob"] is not None:
            if isinstance(deal["custom_prob"], str):
                deal["custom_prob"] = float(deal["custom_prob"].replace("%", "")) / 100
            elif deal["custom_prob"] > 1:
                deal["custom_prob"] = deal["custom_prob"] / 100
        
        # Check if Q4 (target date <= 1/31/2026)
        deal["is_q4"] = False
        if deal["target_date"]:
            dt = None
            if isinstance(deal["target_date"], datetime):
                dt = deal["target_date"]
            elif isinstance(deal["target_date"], str):
                for fmt in ["%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"]:
                    try:
                        dt = datetime.strptime(deal["target_date"], fmt)
                        break
                    except:
                        pass
            if dt and dt <= q4_cutoff:
                deal["is_q4"] = True
        
        # Calculate ACV from weighted if possible
        if deal["weighted_acv"] and deal["weighted_acv"] > 0:
            # Use custom prob if set, else calc prob
            if deal["custom_prob"] and deal["custom_prob"] > 0:
                deal["current_prob"] = deal["custom_prob"]
                deal["has_override"] = True
            elif deal["calc_prob"] and deal["calc_prob"] > 0:
                deal["current_prob"] = deal["calc_prob"]
                deal["has_override"] = False
            else:
                deal["current_prob"] = 0.33  # default
                deal["has_override"] = False
            
            if deal["current_prob"] > 0:
                deal["acv"] = deal["weighted_acv"] / deal["current_prob"]
            else:
                deal["acv"] = 0
        else:
            deal["acv"] = 0
            deal["current_prob"] = 0
            deal["has_override"] = False
        
        # Get new probability based on stage and classification
        stage = deal["stage"] or ""
        acct_class = deal["acct_class"] or "New Logo"
        
        # Map stage names
        stage_key = stage
        if "Stage 0" in stage:
            stage_key = "Stage 0 - Qualifying"
        elif "Stage 1" in stage:
            stage_key = "Stage 1 - Discovery"
        elif "Stage 2" in stage or "SQO" in stage:
            stage_key = "Stage 2 - SQO"
        elif "Stage 3" in stage or "Pilot" in stage:
            stage_key = "Stage 3 - Pilot"
        elif "Stage 4" in stage or "Proposal" in stage:
            stage_key = "Stage 4 - Proposal"
        elif "Stage 5" in stage or "Negotiation" in stage:
            stage_key = "Stage 5 - Negotiation"
        
        deal["stage_key"] = stage_key
        
        # Get old and new standard probabilities
        deal["old_std_prob"] = CURRENT_PROBS.get(stage_key, {}).get(acct_class, 0.33)
        deal["new_std_prob"] = NEW_PROBS.get(stage_key, {}).get(acct_class, 0.33)
        
        # Calculate new weighted
        if deal["has_override"]:
            # Override deals don't change
            deal["new_weighted"] = deal["weighted_acv"]
            deal["delta"] = 0
        else:
            # Apply new probability
            deal["new_weighted"] = deal["acv"] * deal["new_std_prob"]
            deal["delta"] = deal["new_weighted"] - deal["weighted_acv"]
        
        all_deals.append(deal)
    
    print(f"\nTotal deals loaded: {len(all_deals)}")
    
    # Filter Q4 deals
    q4_deals = [d for d in all_deals if d["is_q4"]]
    print(f"Q4 deals (target <= 1/31/2026): {len(q4_deals)}")
    
    # Create output workbook
    out_wb = openpyxl.Workbook()
    
    # ==================== SHEET 1: SUMMARY ====================
    summary_ws = out_wb.active
    summary_ws.title = "Summary"
    
    # Styles
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    money_format = '"$"#,##0.00'
    pct_format = "0.0%"
    
    # Summary stats
    summary_ws["A1"] = "PROBABILITY IMPACT ANALYSIS"
    summary_ws["A1"].font = Font(bold=True, size=16)
    
    summary_ws["A3"] = "Generated:"
    summary_ws["B3"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    # Q4 totals
    current_total = sum(d["weighted_acv"] for d in q4_deals)
    new_total = sum(d["new_weighted"] for d in q4_deals)
    delta_total = new_total - current_total
    
    summary_ws["A5"] = "Q4 WEIGHTED PIPELINE (Target <= 1/31/2026)"
    summary_ws["A5"].font = Font(bold=True, size=12)
    
    summary_ws["A6"] = "Current Weighted ACV:"
    summary_ws["B6"] = current_total
    summary_ws["B6"].number_format = money_format
    
    summary_ws["A7"] = "New Weighted ACV:"
    summary_ws["B7"] = new_total
    summary_ws["B7"].number_format = money_format
    
    summary_ws["A8"] = "Net Change:"
    summary_ws["B8"] = delta_total
    summary_ws["B8"].number_format = money_format
    summary_ws["B8"].font = Font(bold=True, color="00AA00" if delta_total <= 0 else "AA0000")
    
    summary_ws["A9"] = "% Change:"
    summary_ws["B9"] = delta_total / current_total if current_total > 0 else 0
    summary_ws["B9"].number_format = pct_format
    
    # By classification
    summary_ws["A11"] = "BY ACCOUNT TYPE CLASSIFICATION"
    summary_ws["A11"].font = Font(bold=True, size=12)
    
    headers = ["Classification", "Deals", "Current Weighted", "New Weighted", "Delta", "% Change"]
    for col, h in enumerate(headers, 1):
        cell = summary_ws.cell(row=12, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
    
    by_class = defaultdict(lambda: {"count": 0, "current": 0, "new": 0})
    for d in q4_deals:
        ac = d["acct_class"] or "New Logo"
        by_class[ac]["count"] += 1
        by_class[ac]["current"] += d["weighted_acv"]
        by_class[ac]["new"] += d["new_weighted"]
    
    row = 13
    for ac in ["New Logo", "Existing Client", "LOI", "Government"]:
        if ac in by_class:
            summary_ws.cell(row=row, column=1, value=ac)
            summary_ws.cell(row=row, column=2, value=by_class[ac]["count"])
            summary_ws.cell(row=row, column=3, value=by_class[ac]["current"]).number_format = money_format
            summary_ws.cell(row=row, column=4, value=by_class[ac]["new"]).number_format = money_format
            delta = by_class[ac]["new"] - by_class[ac]["current"]
            summary_ws.cell(row=row, column=5, value=delta).number_format = money_format
            pct = delta / by_class[ac]["current"] if by_class[ac]["current"] > 0 else 0
            summary_ws.cell(row=row, column=6, value=pct).number_format = pct_format
            row += 1
    
    # Override vs non-override
    summary_ws.cell(row=row+1, column=1, value="OVERRIDE vs NON-OVERRIDE").font = Font(bold=True, size=12)
    
    override_deals = [d for d in q4_deals if d["has_override"]]
    non_override_deals = [d for d in q4_deals if not d["has_override"]]
    
    headers = ["Category", "Deals", "Weighted", "Impact"]
    for col, h in enumerate(headers, 1):
        cell = summary_ws.cell(row=row+2, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
    
    summary_ws.cell(row=row+3, column=1, value="Override Deals (no change)")
    summary_ws.cell(row=row+3, column=2, value=len(override_deals))
    summary_ws.cell(row=row+3, column=3, value=sum(d["weighted_acv"] for d in override_deals)).number_format = money_format
    summary_ws.cell(row=row+3, column=4, value="$0 (locked)")
    
    summary_ws.cell(row=row+4, column=1, value="Non-Override Deals")
    summary_ws.cell(row=row+4, column=2, value=len(non_override_deals))
    summary_ws.cell(row=row+4, column=3, value=sum(d["weighted_acv"] for d in non_override_deals)).number_format = money_format
    summary_ws.cell(row=row+4, column=4, value=sum(d["delta"] for d in non_override_deals)).number_format = money_format
    
    # ==================== SHEET 2: PROBABILITY MATRIX ====================
    matrix_ws = out_wb.create_sheet("Probability Matrix")
    
    matrix_ws["A1"] = "CURRENT vs NEW PROBABILITY MATRIX"
    matrix_ws["A1"].font = Font(bold=True, size=14)
    
    matrix_ws["A3"] = "CURRENT PROBABILITIES"
    matrix_ws["A3"].font = Font(bold=True)
    
    headers = ["Stage", "New Logo", "Existing Client", "LOI", "Government"]
    for col, h in enumerate(headers, 1):
        cell = matrix_ws.cell(row=4, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
    
    row = 5
    for stage in ["Stage 0 - Qualifying", "Stage 1 - Discovery", "Stage 2 - SQO", "Stage 3 - Pilot", "Stage 4 - Proposal", "Stage 5 - Negotiation"]:
        matrix_ws.cell(row=row, column=1, value=stage)
        for col, ac in enumerate(["New Logo", "Existing Client", "LOI", "Government"], 2):
            val = CURRENT_PROBS.get(stage, {}).get(ac, 0)
            matrix_ws.cell(row=row, column=col, value=val).number_format = pct_format
        row += 1
    
    matrix_ws.cell(row=row+1, column=1, value="NEW PROBABILITIES").font = Font(bold=True)
    
    for col, h in enumerate(headers, 1):
        cell = matrix_ws.cell(row=row+2, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
    
    row = row + 3
    for stage in ["Stage 0 - Qualifying", "Stage 1 - Discovery", "Stage 2 - SQO", "Stage 3 - Pilot", "Stage 4 - Proposal"]:
        matrix_ws.cell(row=row, column=1, value=stage)
        for col, ac in enumerate(["New Logo", "Existing Client", "LOI", "Government"], 2):
            val = NEW_PROBS.get(stage, {}).get(ac, 0)
            cell = matrix_ws.cell(row=row, column=col, value=val)
            cell.number_format = pct_format
            # Highlight changes
            old_val = CURRENT_PROBS.get(stage, {}).get(ac, 0)
            if val != old_val:
                cell.fill = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")
        row += 1
    
    matrix_ws.cell(row=row, column=1, value="Stage 5 - Negotiation")
    matrix_ws.cell(row=row, column=2, value="REMOVED").font = Font(color="FF0000")
    
    # ==================== SHEET 3: Q4 DEAL DETAIL ====================
    detail_ws = out_wb.create_sheet("Q4 Deal Detail")
    
    headers = [
        "Row", "Opportunity Name", "Stage", "Account Type Classification", 
        "Sales Type", "Has Override", "ACV", "Current Prob", "Current Weighted",
        "New Prob", "New Weighted", "Delta"
    ]
    
    for col, h in enumerate(headers, 1):
        cell = detail_ws.cell(row=1, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
    
    row = 2
    for d in sorted(q4_deals, key=lambda x: x.get("delta", 0), reverse=True):
        detail_ws.cell(row=row, column=1, value=d["row"])
        detail_ws.cell(row=row, column=2, value=d["opp_name"])
        detail_ws.cell(row=row, column=3, value=d["stage"])
        detail_ws.cell(row=row, column=4, value=d["acct_class"])
        detail_ws.cell(row=row, column=5, value=d["sales_type"])
        detail_ws.cell(row=row, column=6, value="Yes" if d["has_override"] else "No")
        detail_ws.cell(row=row, column=7, value=d["acv"]).number_format = money_format
        detail_ws.cell(row=row, column=8, value=d["current_prob"]).number_format = pct_format
        detail_ws.cell(row=row, column=9, value=d["weighted_acv"]).number_format = money_format
        
        if d["has_override"]:
            detail_ws.cell(row=row, column=10, value="OVERRIDE")
            detail_ws.cell(row=row, column=11, value=d["weighted_acv"]).number_format = money_format
            detail_ws.cell(row=row, column=12, value=0).number_format = money_format
        else:
            detail_ws.cell(row=row, column=10, value=d["new_std_prob"]).number_format = pct_format
            detail_ws.cell(row=row, column=11, value=d["new_weighted"]).number_format = money_format
            delta_cell = detail_ws.cell(row=row, column=12, value=d["delta"])
            delta_cell.number_format = money_format
            if d["delta"] > 0:
                delta_cell.font = Font(color="00AA00")
            elif d["delta"] < 0:
                delta_cell.font = Font(color="AA0000")
        
        row += 1
    
    # Add totals row
    detail_ws.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
    detail_ws.cell(row=row, column=9, value=sum(d["weighted_acv"] for d in q4_deals)).number_format = money_format
    detail_ws.cell(row=row, column=11, value=sum(d["new_weighted"] for d in q4_deals)).number_format = money_format
    detail_ws.cell(row=row, column=12, value=sum(d["delta"] for d in q4_deals)).number_format = money_format
    
    # Adjust column widths
    for ws in [summary_ws, matrix_ws, detail_ws]:
        for col in range(1, 20):
            ws.column_dimensions[get_column_letter(col)].width = 18
    
    # Save output
    output_path = "/Users/keiganpesenti/Desktop/Probability_Impact_Analysis.xlsx"
    out_wb.save(output_path)
    print(f"\n✅ Output saved to: {output_path}")
    
    # Print summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Q4 Deals Analyzed: {len(q4_deals)}")
    print(f"Override Deals (no change): {len(override_deals)} (${sum(d['weighted_acv'] for d in override_deals):,.2f})")
    print(f"Non-Override Deals: {len(non_override_deals)} (${sum(d['weighted_acv'] for d in non_override_deals):,.2f})")
    print()
    print(f"Current Q4 Weighted: ${current_total:,.2f}")
    print(f"New Q4 Weighted: ${new_total:,.2f}")
    print(f"Net Change: ${delta_total:+,.2f} ({delta_total/current_total*100:+.2f}%)")
    print("="*60)

if __name__ == "__main__":
    analyze_pipeline()

