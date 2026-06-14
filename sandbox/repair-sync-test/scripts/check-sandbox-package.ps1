$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$codePath = Join-Path $root 'Code.gs'
$htmlPath = Join-Path $root 'index.html'
$manifestPath = Join-Path $root 'appsscript.json'

$sandboxSheetId = '1PuYj0_e1wGYfCkC6Z3mKRMChF6CN3oXVfOqARAAFSCc'
$productionSheetId = '1IPcwCNKbCRVz9JsvQYeYhZ4qQnEPzQZza8WE081VcJ0'

foreach ($path in @($codePath, $htmlPath, $manifestPath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing required file: $path"
  }
}

$code = Get-Content -LiteralPath $codePath -Raw -Encoding UTF8
$html = Get-Content -LiteralPath $htmlPath -Raw -Encoding UTF8
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8

if ($code -notmatch [regex]::Escape($sandboxSheetId)) {
  throw "Sandbox Code.gs does not reference the sandbox sheet id."
}

if ($code -match [regex]::Escape($productionSheetId)) {
  throw "Sandbox Code.gs references the production sheet id. Refusing to pass."
}

if ($html -match [regex]::Escape($productionSheetId)) {
  throw "Sandbox index.html references the production sheet id. Refusing to pass."
}

if ($code -notmatch 'sandbox-2026-06-14-mobile-sync-v1') {
  throw "Sandbox version marker is missing."
}

if ($code -notmatch 'supports_form_post') {
  throw "Form POST health marker is missing."
}

$null = $manifest | ConvertFrom-Json

$counts = [pscustomobject]@{
  CodeOpenParen = ($code.ToCharArray() | Where-Object { $_ -eq '(' }).Count
  CodeCloseParen = ($code.ToCharArray() | Where-Object { $_ -eq ')' }).Count
  CodeOpenBrace = ($code.ToCharArray() | Where-Object { $_ -eq '{' }).Count
  CodeCloseBrace = ($code.ToCharArray() | Where-Object { $_ -eq '}' }).Count
  HtmlOpenScript = ([regex]::Matches($html, '<script')).Count
  HtmlCloseScript = ([regex]::Matches($html, '</script>')).Count
}

if ($counts.CodeOpenParen -ne $counts.CodeCloseParen) { throw "Code.gs parenthesis count mismatch." }
if ($counts.CodeOpenBrace -ne $counts.CodeCloseBrace) { throw "Code.gs brace count mismatch." }
if ($counts.HtmlOpenScript -ne $counts.HtmlCloseScript) { throw "HTML script tag count mismatch." }

[pscustomobject]@{
  ok = $true
  sandboxSheetId = $sandboxSheetId
  productionSheetReferenced = $false
  version = 'sandbox-2026-06-14-mobile-sync-v1'
  checks = $counts
} | ConvertTo-Json -Depth 4
