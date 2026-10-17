#!/bin/bash

# Visual test of the Context Health Bar

echo "📊 Context Health Bar - Visual Test"
echo "===================================="
echo ""

# ANSI colors
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"
BOLD="\033[1m"

# Function to render bar
render_bar() {
    local tokens=$1
    local max=$2
    local ratio=$(echo "scale=2; $tokens / $max" | bc)
    local filled=$(printf "%.0f" $(echo "$ratio * 18" | bc))

    local bar=""
    local color=""

    # Determine color based on filled bars
    if (( filled < 6 )); then
        color=$GREEN
    elif (( filled < 12 )); then
        color=$YELLOW
    else
        color=$RED
    fi

    # Build bar
    for ((i=0; i<18; i++)); do
        if (( i < filled )); then
            bar+="█"
        else
            bar+="░"
        fi
    done

    # Color the filled part
    local filled_part="${bar:0:$filled}"
    local empty_part="${bar:$filled}"

    # Format tokens
    local tokens_fmt=""
    if (( tokens >= 1000 )); then
        tokens_fmt="$((tokens / 1000))k"
    else
        tokens_fmt="$tokens"
    fi

    local percentage=$((tokens * 100 / max))

    # Output with colors
    printf "${color}${filled_part}${RESET}${empty_part} ${tokens_fmt}/${max}k (${percentage}%%)\n"
}

echo "🟢 Green Zone (0-60k tokens) - Light Usage:"
echo "-------------------------------------------"
render_bar 0 180
render_bar 20000 180
render_bar 40000 180
render_bar 60000 180
echo ""

echo "🟡 Yellow Zone (60-120k tokens) - Medium Usage:"
echo "---------------------------------------------"
render_bar 70000 180
render_bar 100000 180
render_bar 120000 180
echo ""

echo "🔴 Red Zone (120-180k tokens) - Heavy Usage:"
echo "-------------------------------------------"
render_bar 130000 180
render_bar 160000 180
render_bar 180000 180
echo ""

echo "✅ Test Scenarios:"
echo "------------------"
echo "1. Session starts: 0/180k (0%)"
render_bar 0 180

echo ""
echo "2. After first message: ~30k tokens (16%)"
render_bar 30000 180

echo ""
echo "3. After several messages: ~100k tokens (55%)"
render_bar 100000 180

echo ""
echo "4. Heavy usage: ~165k tokens (91%)"
render_bar 165000 180

echo ""
echo "5. Session limit reached: 180k tokens (100%)"
render_bar 180000 180

echo ""
echo "🎯 The bar will appear in the bottom-right corner of Claude Code"
