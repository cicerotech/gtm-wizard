#!/bin/bash
# Delete all Top Level contracts from Campfire

API_KEY="91d539b2946b6959458348fb320ce842206d78a580c0a58680af2c22fec1397b"
BASE_URL="https://api.meetcampfire.com/rr/api/v1/contracts"

# Top Level contract IDs (85 total)
IDS=(332596 332595 332594 332593 332592 332591 332590 332589 332588 332587 332586 332585 332584 332583 332582 327517 327515 310922 310921 310920 310919 310918 273042 273041 273040 273039 273038 273037 273036 273035 273034 273033 273032 273031 273030 273029 273028 273027 273026 273025 273024 273023 273022 273021 273020 273019 273018 273017 273016 273015 273014 273013 273012 273011 273010 273009 273008 273007 273006 273005 273004 273003 273002 273001 273000 272999 272998 272997 272996 272995 272994 272993 272992 272991 272990 272989 272988 272987 272986 272985 272984 272983 272982 272981 272980)

echo "Deleting ${#IDS[@]} Top Level contracts from Campfire..."
echo ""

deleted=0
errors=0

for id in "${IDS[@]}"; do
    status=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
        -H "Authorization: Token $API_KEY" \
        "$BASE_URL/$id")
    
    if [ "$status" = "204" ] || [ "$status" = "200" ]; then
        echo "✅ Deleted: $id"
        ((deleted++))
    elif [ "$status" = "404" ]; then
        echo "⏭️  Already gone: $id"
    else
        echo "❌ Error $status: $id"
        ((errors++))
    fi
done

echo ""
echo "Done! Deleted: $deleted, Errors: $errors"




