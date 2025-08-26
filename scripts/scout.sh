#!/bin/bash

# -----------------------------------------------------------------------------
# Scout: Polkadot-SDK Release Data Harvester
#
# Purpose
# -------
#   Given a Polkadot-SDK release tag (e.g. "polkadot-stable2409") this script
#   queries GitHub and builds a local, self-contained snapshot of everything
#   an engineer needs to review or automate an upgrade for that release:
#
#     1. Release notes (via `gh release view`).
#     2. Every Pull Request referenced in those notes, each stored under its own
#        directory containing:
#           • description.md  – the PR body in Markdown.
#           • patch.diff      – the complete unified diff for the PR.
#
# Inputs
# ------
#   $1  Release tag (string, *required*) – must correspond to an existing tag
#       in the `paritytech/polkadot-sdk` repository.
#
# Prerequisites
# -------------
#   • GitHub CLI (`gh`) installed *and* authenticated with permissions to read
#     the `paritytech/polkadot-sdk` repository.
#   • Standard POSIX utilities: `curl`, `grep`, `sed`, `sort`.
#
# Output
# ------
#   Creates (or overwrites) a directory tree relative to the project root:
#
#       resources/scout/polkadot-sdk-<release-tag>/
#           └── pr-<PR_NUMBER>/
#               ├── description.md
#               └── patch.diff
#
#   The script is idempotent; running it again for the same tag replaces the
#   previously generated artefacts.
# -----------------------------------------------------------------------------

set -e

usage() {
  echo "Usage: $0 [-f] [-o <output-dir>] <release-tag>"
  echo "Options:"
  echo "  -f, --force   Overwrite existing release directory if present"
  echo "  -o, --output  Base directory where release data will be placed"
  echo "  -h, --help    Show this help message"
  echo "Example: $0 polkadot-stable2409"
}

# ---- CLI args ------------------------------------------------------------
FORCE=false
OUTPUT_BASE=""
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--force)
      FORCE=true
      shift
      ;;
    -o|--output)
      OUTPUT_BASE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done
set -- "${POSITIONAL[@]}"

RELEASE_TAG=$(echo "$1" | xargs) # trim whitespace

if [ -z "$RELEASE_TAG" ]; then
  usage
  exit 1
fi

echo "Scout is starting its mission for release: $RELEASE_TAG"

# Ask user if they want to create a new branch for applying patches
SUGGESTED_BRANCH="sdk-upgrade-${RELEASE_TAG}"
echo ""
read -p "🌿 Create new branch '$SUGGESTED_BRANCH'? (y/n) [n]: " -r CREATE_BRANCH

if [[ $CREATE_BRANCH =~ ^[Yy]$ ]]; then
  read -p "Branch name [$SUGGESTED_BRANCH]: " -r BRANCH_NAME
  BRANCH_NAME=${BRANCH_NAME:-$SUGGESTED_BRANCH}
  
  if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Not in a git repository. Cannot create branch."
    exit 1
  fi
  
  if git show-ref --verify --quiet refs/heads/"$BRANCH_NAME"; then
    git checkout "$BRANCH_NAME"
    echo "🔄 Switched to existing branch: $BRANCH_NAME"
  else
    git checkout -b "$BRANCH_NAME"
    echo "🌱 Created branch: $BRANCH_NAME"
  fi
fi

# Fetch the release notes using GitHub CLI
echo "Fetching release notes from GitHub..."
RELEASE_BODY=$(gh release view "$RELEASE_TAG" --repo paritytech/polkadot-sdk --json body -q .body 2>/dev/null || true)

if [ -z "$RELEASE_BODY" ]; then
    echo "Error: could not fetch release notes for tag '$RELEASE_TAG'."
    echo "       • Verify the tag exists: https://github.com/paritytech/polkadot-sdk/releases"
    echo "       • Ensure GitHub CLI is installed and you have authenticated via 'gh auth login'"
    exit 1
fi

echo "Release notes fetched successfully."

echo "Extracting PR numbers from the release notes..."
# 1. URLs already containing /pull/<num>
URL_NUMS=$(echo "$RELEASE_BODY" | grep -oE 'https://github\.com/paritytech/polkadot-sdk/pull/[0-9]+' | sed 's#.*/##' || true)

# 2. Markdown references like [#1234]:
BRACKET_NUMS=$(echo "$RELEASE_BODY" | grep -oE '\[#([0-9]+)\]:' | grep -oE '[0-9]+' || true)

# 2b. Header lines like "#### [#1234] ..."
BRACKET_HEAD_NUMS=$(echo "$RELEASE_BODY" | grep -oE '^#### \[#([0-9]+)\]' | grep -oE '[0-9]+' || true)

# 2c. Bracket references without trailing colon anywhere in the text: "[#1234]"
BRACKET_NO_COLON=$(echo "$RELEASE_BODY" | grep -oE '\[#([0-9]+)\]' | grep -oE '[0-9]+' || true)

# 2d. Parenthetical references like "(#1234)"
PAREN_NUMS=$(echo "$RELEASE_BODY" | grep -oE '\(#([0-9]+)\)' | grep -oE '[0-9]+' || true)

# 3. Inline repo shorthand polkadot-sdk/1234 (with or without link)
SLASH_NUMS=$(echo "$RELEASE_BODY" | grep -oE 'polkadot-sdk/[0-9]+' | grep -oE '[0-9]+' || true)

# 4. GitHub shorthand "paritytech/polkadot-sdk#1234"
GH_SHORTHAND_NUMS=$(echo "$RELEASE_BODY" | grep -oE 'paritytech/polkadot-sdk#[0-9]+' | grep -oE '[0-9]+' || true)

# Combine and filter out empty lines
PR_NUMBERS_RAW=$(printf "%s\n%s\n%s\n%s\n%s\n%s\n%s\n" "$URL_NUMS" "$BRACKET_NUMS" "$BRACKET_HEAD_NUMS" "$BRACKET_NO_COLON" "$PAREN_NUMS" "$SLASH_NUMS" "$GH_SHORTHAND_NUMS" | grep -v '^$' | sort -u)

if [ -z "$PR_NUMBERS_RAW" ]; then
  echo "No PR references found in the release notes."
  exit 1
fi

PR_COUNT=$(echo "$PR_NUMBERS_RAW" | wc -l | tr -d ' ')
echo "Found ${PR_COUNT} PR numbers."

# Build full URLs list
PR_URLS=()
while IFS= read -r num; do
  PR_URLS+=("https://github.com/paritytech/polkadot-sdk/pull/${num}")
done <<< "$PR_NUMBERS_RAW"

printf '%s\n' "${PR_URLS[@]}"

# Get the directory where the script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
PROJECT_ROOT_DIR=$(dirname "$(dirname "$SCRIPT_DIR")")

# Determine base directory for release artefacts
if [ -n "$OUTPUT_BASE" ]; then
  # Expand relative path to absolute
  if [ "${OUTPUT_BASE:0:1}" != "/" ]; then
    OUTPUT_BASE="$PWD/$OUTPUT_BASE"
  fi
else
  # Default: place artefacts under resources/scout
  OUTPUT_BASE="$(dirname "$SCRIPT_DIR")/resources/scout"
fi

RELEASE_DIR="${OUTPUT_BASE}/polkadot-sdk-${RELEASE_TAG}"
if [ -d "$RELEASE_DIR" ]; then
  if [ "$FORCE" = true ]; then
    rm -rf "$RELEASE_DIR"
  else
    # Check if directory is not empty
    if [ -n "$(ls -A "$RELEASE_DIR" 2>/dev/null)" ]; then
      echo "Directory $RELEASE_DIR already exists and is not empty. Exiting successfully."
      exit 0
    else
      echo "Error: directory $RELEASE_DIR already exists. Use --force to overwrite."
      exit 1
    fi
  fi
fi
mkdir -p "$RELEASE_DIR"
echo "Created directory: $RELEASE_DIR"

# Ensure release artefacts are not accidentally committed
if [ ! -f "${RELEASE_DIR}/.gitignore" ]; then
  printf '*\n!.gitignore\n' > "${RELEASE_DIR}/.gitignore"
fi

# Save release notes and declared PR lists for future reference
echo "$RELEASE_BODY" > "${RELEASE_DIR}/release-notes.md"
echo "$PR_NUMBERS_RAW" > "${RELEASE_DIR}/declared_prs.txt"
printf '%s\n' "${PR_URLS[@]}" > "${RELEASE_DIR}/declared_pr_urls.txt"

# Process each PR
for PR_URL in "${PR_URLS[@]}"; do
    PR_NUMBER=$(basename "$PR_URL")

    echo "Processing PR #${PR_NUMBER}..."

    # Fetch PR description first and only create directory on success
    echo "  Fetching description..."
    TMP_DESC=$(mktemp)
    if ! gh pr view "$PR_URL" --json body -q .body > "$TMP_DESC"; then
        echo "  Warning: failed to fetch PR description for #${PR_NUMBER}. Skipping."
        rm -f "$TMP_DESC"
        continue
    fi

    PR_DIR="${RELEASE_DIR}/pr-${PR_NUMBER}"
    mkdir -p "$PR_DIR"
    mv "$TMP_DESC" "${PR_DIR}/description.md"

    # Fetch PR diff
    echo "  Fetching diff..."
    if [ -n "$GITHUB_TOKEN" ]; then
        if ! curl -sSfL -H "Authorization: token $GITHUB_TOKEN" -o "${PR_DIR}/patch.diff" "${PR_URL}.diff"; then
            echo "  Warning: failed to download diff for #${PR_NUMBER}."
            continue
        fi
    else
        if ! curl -sSfL -o "${PR_DIR}/patch.diff" "${PR_URL}.diff"; then
            echo "  Warning: failed to download diff for #${PR_NUMBER}."
            continue
        fi
    fi

    echo "  Done."
done

# Summary box
DECLARED_COUNT=$(wc -l < "${RELEASE_DIR}/declared_prs.txt" | tr -d ' ')

# Gather successfully downloaded PRs (those with patch.diff present)
find "$RELEASE_DIR" -type f -name 'patch.diff' -exec dirname {} \; \
  | xargs -I{} basename {} \
  | sed -E -n 's/^pr-([0-9]+)$/\1/p' \
  | sort -u > "${RELEASE_DIR}/downloaded_prs.txt" || true

DOWNLOADED_COUNT=$(wc -l < "${RELEASE_DIR}/downloaded_prs.txt" | tr -d ' ')

# Compute missing list
sort -u "${RELEASE_DIR}/declared_prs.txt" > "${RELEASE_DIR}/declared_prs_sorted.txt"
# Ensure downloaded_prs.txt exists to avoid comm failures
touch "${RELEASE_DIR}/downloaded_prs.txt"
comm -23 "${RELEASE_DIR}/declared_prs_sorted.txt" "${RELEASE_DIR}/downloaded_prs.txt" > "${RELEASE_DIR}/missing_prs.txt" || true
MISSING_COUNT=$(wc -l < "${RELEASE_DIR}/missing_prs.txt" | tr -d ' ')

printf "\n\033[1m" # bold
BOX_WIDTH=72
border_top=$(printf '━%.0s' $(seq 1 $((BOX_WIDTH-2))))
printf '┏%s┓\n' "$border_top"

msg() {
  local content="$1"
  printf '┃ %-*.*s ┃\n' $((BOX_WIDTH-4)) $((BOX_WIDTH-4)) "$content"
}

REL_PATH="${RELEASE_DIR#$PWD/}"
msg "📦  Output directory : ${REL_PATH}"
msg "🔗  PRs declared     : $DECLARED_COUNT"
msg "⬇️  PRs downloaded   : $DOWNLOADED_COUNT"
msg "⚠️  PRs missing      : $MISSING_COUNT"
printf '┗%s┛\n' "$border_top"
printf "\033[0m"

# If there are missing PRs, provide a short note with path to the list
if [ "$MISSING_COUNT" -gt 0 ]; then
  echo ""
  echo "Some PRs referenced in the release notes could not be downloaded."
  echo "See list: ${REL_PATH}/missing_prs.txt"
fi