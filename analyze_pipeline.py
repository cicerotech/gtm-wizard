#!/usr/bin/env python3
"""Analyze pipeline data for reclassification impact"""

import openpyxl
from datetime import datetime
from collections import Counter

def analyze_pipeline():
    wb = openpyxl.load_workbook("/Users/keiganpesenti/Desktop/222.xlsx")
    ws = wb.active

    # Column indices (0-based)
    pod_idx = 0
    sales_type_idx = 1
    acct_class_idx = 2
    stage_idx = 3
    target_date_idx = 7
    weighted_idx = 8
    calc_prob_idx = 9
    custom_prob_idx = 10

    # Q4 cutoff
    q4_cutoff = datetime(2026, 1, 31)
    q4_deals = []

    for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row[0]:
            continue
        
        deal = {
            "row": row_num,
            "sales_type": row[sales_type_idx],
            "acct_class": row[acct_class_idx],
            "stage": row[stage_idx],
            "target_date": row[target_date_idx],
            "weighted_acv": row[weighted_idx] or 0,
            "calc_prob": row[calc_prob_idx],
            "custom_prob": row[custom_prob_idx]
        }
        
        # Check if Q4
        if deal["target_date"]:
            dt = None
            if isinstance(deal["target_date"], datetime):
                dt = deal["target_date"]
            elif isinstance(deal["target_date"], str):
                try:
                    dt = datetime.strptime(deal["target_date"], "%m/%d/%Y")
                except:
                    try:
                        dt = datetime.strptime(deal["target_date"], "%Y-%m-%d")
                    except:
                        pass
            
            if dt and dt <= q4_cutoff:
                q4_deals.append(deal)

    print(f"Q4 deals (target <= 1/31/2026): {len(q4_deals)}")
    
    # Current weighted Q4
    total_weighted_q4 = sum(d["weighted_acv"] for d in q4_deals if d["weighted_acv"])
    print(f"\nCurrent Q4 Weighted ACV: ${total_weighted_q4:,.2f}")

    # Count by classification in Q4
    class_counts = Counter(d["acct_class"] for d in q4_deals)
    print("\n=== Q4 BY ACCOUNT TYPE CLASSIFICATION ===")
    for k in ["New Logo", "Existing Client", "LOI", "Government"]:
        if k in class_counts:
            v = class_counts[k]
            weighted = sum(d["weighted_acv"] for d in q4_deals if d["acct_class"] == k and d["weighted_acv"])
            print(f"  {k}: {v} deals, ${weighted:,.2f} weighted")

    # Current probabilities by stage
    current_probs = {
        "Stage 4 - Proposal": {"New Logo": 0.33, "Existing Client": 0.50, "LOI": 0.55, "Government": 0.22},
        "Stage 3 - Pilot": {"New Logo": 0.25, "Existing Client": 0.42, "LOI": 0.45, "Government": 0.18},
        "Stage 2 - SQO": {"New Logo": 0.20, "Existing Client": 0.32, "LOI": 0.35, "Government": 0.12},
        "Stage 1 - Discovery": {"New Logo": 0.10, "Existing Client": 0.18, "LOI": 0.20, "Government": 0.08},
        "Stage 0 - Qualifying": {"New Logo": 0.02, "Existing Client": 0.02, "LOI": 0.02, "Government": 0.02},
    }

    # New probabilities (swapped EC <-> LOI)
    new_probs = {
        "Stage 4 - Proposal": {"New Logo": 0.33, "Existing Client": 0.55, "LOI": 0.50, "Government": 0.22},
        "Stage 3 - Pilot": {"New Logo": 0.25, "Existing Client": 0.45, "LOI": 0.42, "Government": 0.18},
        "Stage 2 - SQO": {"New Logo": 0.20, "Existing Client": 0.35, "LOI": 0.32, "Government": 0.12},
        "Stage 1 - Discovery": {"New Logo": 0.10, "Existing Client": 0.20, "LOI": 0.18, "Government": 0.08},
        "Stage 0 - Qualifying": {"New Logo": 0.02, "Existing Client": 0.02, "LOI": 0.02, "Government": 0.02},
    }

    print("\n=== PROBABILITY SWAP IMPACT (EC <-> LOI) ===")
    
    ec_delta = 0
    loi_delta = 0
    
    for d in q4_deals:
        stage = d["stage"]
        ac = d["acct_class"]
        
        if not d["weighted_acv"] or d["weighted_acv"] == 0:
            continue
            
        # Get current probability
        if d["custom_prob"] and d["custom_prob"] > 0:
            current_prob = d["custom_prob"] / 100 if d["custom_prob"] > 1 else d["custom_prob"]
        elif d["calc_prob"] and d["calc_prob"] > 0:
            current_prob = d["calc_prob"] / 100 if d["calc_prob"] > 1 else d["calc_prob"]
        else:
            current_prob = current_probs.get(stage, {}).get(ac, 0.33)
        
        if current_prob == 0:
            continue
            
        # Calculate ACV from weighted
        acv = d["weighted_acv"] / current_prob
        
        # Get new probability from swap
        if stage in new_probs and ac in new_probs[stage]:
            old_std_prob = current_probs.get(stage, {}).get(ac, current_prob)
            new_std_prob = new_probs.get(stage, {}).get(ac, current_prob)
            
            # Only apply delta for non-custom deals
            if not d["custom_prob"]:
                delta = acv * (new_std_prob - old_std_prob)
                if ac == "Existing Client":
                    ec_delta += delta
                elif ac == "LOI":
                    loi_delta += delta

    print(f"  Existing Client weighted change: ${ec_delta:+,.2f}")
    print(f"  LOI weighted change: ${loi_delta:+,.2f}")
    print(f"  Net change from swap: ${ec_delta + loi_delta:+,.2f}")
    print(f"\n  New estimated Q4 weighted: ${total_weighted_q4 + ec_delta + loi_delta:,.2f}")

    # Show breakdown by stage for Q4
    print("\n=== Q4 DEALS BY STAGE ===")
    stage_counts = Counter(d["stage"] for d in q4_deals)
    for stage in ["Stage 4 - Proposal", "Stage 3 - Pilot", "Stage 2 - SQO", "Stage 1 - Discovery", "Stage 0 - Qualifying"]:
        if stage in stage_counts:
            count = stage_counts[stage]
            weighted = sum(d["weighted_acv"] for d in q4_deals if d["stage"] == stage and d["weighted_acv"])
            print(f"  {stage}: {count} deals, ${weighted:,.2f} weighted")

if __name__ == "__main__":
    analyze_pipeline()


