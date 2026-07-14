#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

schema='specs/001-product-foundation/contracts/scene-document.schema.json'
example='specs/001-product-foundation/contracts/scene.example.json'
manifest_schema='specs/001-product-foundation/contracts/archive-manifest.schema.json'
manifest_example='specs/001-product-foundation/contracts/archive-manifest.example.json'
completion='specs/001-product-foundation/checklists/product-design-completion.md'

for command_name in jq npm rg; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
done

mapfile -t design_files < <(rg --files README.md docs specs scripts | sort)

if rg -n '[ \t]+$' "${design_files[@]}"; then
  printf '%s\n' 'FAIL trailing whitespace found' >&2
  exit 1
fi

jq empty "$schema" "$example" "$manifest_schema" "$manifest_example"
npm exec --yes --package=ajv-cli@5.0.0 -- \
  ajv validate --spec=draft2020 -s "$schema" -d "$example" >/dev/null
npm exec --yes --package=ajv-cli@5.0.0 -- \
  ajv validate --spec=draft2020 -s "$manifest_schema" -d "$manifest_example" >/dev/null

for number in $(seq -w 1 13); do
  rg -q "FR-0${number}" "$completion"
done

for number in $(seq -w 1 9); do
  rg -q "NFR-00${number}" "$completion"
done

sed -n 's/.*](\([^)]*\)).*/\1/p' README.md | while IFS= read -r path; do
  if [ ! -e "$path" ]; then
    printf 'FAIL missing README link: %s\n' "$path" >&2
    exit 1
  fi
done

secret_case=$(mktemp --suffix=.json)
runtime_case=$(mktemp --suffix=.json)
path_case=$(mktemp --suffix=.json)
trap 'unlink "$secret_case" "$runtime_case" "$path_case" 2>/dev/null || true' EXIT

jq '
  .dataSources[0].adapter = "websocket"
  | .dataSources[0].options = {
      "url": "wss://secret.example",
      "token": "secret"
    }
' "$example" > "$secret_case"

jq '.selectedTarget = "press-01-target"' "$example" > "$runtime_case"
jq '.files[1].path = "../outside.glb"' "$manifest_example" > "$path_case"

if npm exec --yes --package=ajv-cli@5.0.0 -- \
  ajv validate --spec=draft2020 -s "$schema" -d "$secret_case" \
  >/dev/null 2>&1; then
  printf '%s\n' 'FAIL schema accepted sensitive WebSocket options' >&2
  exit 1
fi

if npm exec --yes --package=ajv-cli@5.0.0 -- \
  ajv validate --spec=draft2020 -s "$schema" -d "$runtime_case" \
  >/dev/null 2>&1; then
  printf '%s\n' 'FAIL schema accepted runtime selection state' >&2
  exit 1
fi

if npm exec --yes --package=ajv-cli@5.0.0 -- \
  ajv validate --spec=draft2020 -s "$manifest_schema" -d "$path_case" \
  >/dev/null 2>&1; then
  printf '%s\n' 'FAIL archive schema accepted a traversal path' >&2
  exit 1
fi

if rg -n \
  '\[PLACEHOLDER|\[RESEARCH NEEDED|\bTBD\b|## 待确认|## 暂定' \
  README.md docs specs; then
  printf '%s\n' 'FAIL unresolved product-design placeholder found' >&2
  exit 1
fi

while read -r lines path; do
  if [ "$lines" -gt 2000 ]; then
    printf 'FAIL oversized file lines=%s path=%s\n' "$lines" "$path" >&2
    exit 1
  fi
done < <(wc -l "${design_files[@]}" | sed '$d')

printf '%s\n' 'PASS product-design verification'
