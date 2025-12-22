#!/usr/bin/env python3
"""
Compare Surgical Extraction against November Run Rate
"""

# November Run Rate benchmarks (from earlier analysis - annualized USD)
NOVEMBER_RR = {
    'BOI': 1654884,
    'OpenAI': 1537776,
    'Stripe': 1221816,
    'Udemy': 533832,
    'ESB': 473184,
    'Irish Water': 440640,
    'Indeed': 418056,
    'Coimisiún na Meán': 389556,
    'Etsy': 303564,
    'Tinder': 228612,
    'Dropbox': 221988,
    'Airbnb': 211536,
    'TikTok': 208392,
    'Coillte': 194676,
    'Gilead': 186912,
    'NTMA': 171384,
    'Airship': 166608,
    'CommScope': 158256,
    'Kellanova': 149532,
    'Northern Trust': 145956,
    'Perrigo': 127260,
    'Glanbia': 106836,
    'ACS': 86616,
    'Kingspan': 73692,
    'Sisk': 68916,
    'Taoglas': 61272,
}

# Surgical extraction results (from the run we just did)
SURGICAL = {
    'BOI': 613600,
    'OpenAI': 871312,
    'Stripe': 0,
    'Udemy': 0,
    'ESB': 0,
    'Irish Water': 448848,
    'Indeed': 354000,
    'Coimisiún na Meán': 0,
    'Etsy': 0,
    'Tinder': 248508,
    'Dropbox': 0,
    'Airbnb': 0,
    'TikTok': 157082,
    'Coillte': 0,
    'Gilead': 191160,
    'NTMA': 0,
    'Airship': 0,
    'CommScope': 316618,
    'Kellanova': 0,
    'Northern Trust': 690300,
    'Perrigo': 147264,
    'Glanbia': 0,
    'ACS': 0,
    'Kingspan': 0,
    'Sisk': 0,
    'Taoglas': 0,
    'Aryza': 230100,
}

print("=" * 100)
print("SURGICAL EXTRACTION vs NOVEMBER RUN RATE RECONCILIATION")
print("=" * 100)
print()

total_rr = sum(NOVEMBER_RR.values())
total_surgical = sum(SURGICAL.values())

print(f"{'Account':<25} {'Nov RR':>15} {'Surgical':>15} {'Gap':>15} {'Coverage':>10}")
print("-" * 80)

all_clients = set(list(NOVEMBER_RR.keys()) + list(SURGICAL.keys()))
reconciliation = []

for client in sorted(all_clients):
    rr = NOVEMBER_RR.get(client, 0)
    surg = SURGICAL.get(client, 0)
    gap = rr - surg
    coverage = (surg / rr * 100) if rr > 0 else (100 if surg > 0 else 0)
    
    status = "✓" if coverage >= 80 else ("~" if coverage >= 50 else "✗")
    
    print(f"{status} {client:<23} ${rr:>13,} ${surg:>13,} ${gap:>13,} {coverage:>8.0f}%")
    
    reconciliation.append({
        'Client': client,
        'November_RR': rr,
        'Surgical_Extracted': surg,
        'Gap': gap,
        'Coverage_%': coverage
    })

print("-" * 80)
print(f"{'TOTAL':<25} ${total_rr:>13,} ${total_surgical:>13,} ${total_rr - total_surgical:>13,} {total_surgical/total_rr*100:>8.1f}%")

print()
print("=" * 100)
print("SUMMARY")
print("=" * 100)
print(f"November Run Rate Target:    ${total_rr:>12,}")
print(f"Surgical Extraction Total:   ${total_surgical:>12,}")
print(f"GAP:                         ${total_rr - total_surgical:>12,}")
print(f"Coverage:                    {total_surgical/total_rr*100:>11.1f}%")

# Breakdown by status
aligned = [c for c in reconciliation if c['Coverage_%'] >= 80]
partial = [c for c in reconciliation if 50 <= c['Coverage_%'] < 80]
missing = [c for c in reconciliation if c['Coverage_%'] < 50]

print()
print(f"✓ Aligned (≥80%):    {len(aligned)} accounts, ${sum(r['Surgical_Extracted'] for r in aligned):,}")
print(f"~ Partial (50-80%):  {len(partial)} accounts, ${sum(r['Surgical_Extracted'] for r in partial):,}")
print(f"✗ Missing (<50%):    {len(missing)} accounts, ${sum(r['November_RR'] for r in missing):,} in RR not covered")

print()
print("=" * 100)
print("CRITICAL GAPS (>$200K)")
print("=" * 100)
for r in sorted(reconciliation, key=lambda x: x['Gap'], reverse=True):
    if r['Gap'] > 200000:
        print(f"  {r['Client']}: ${r['Gap']:,} gap (have ${r['Surgical_Extracted']:,} of ${r['November_RR']:,})")

