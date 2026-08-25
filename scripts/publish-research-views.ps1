param(
    [string]$VaultPath = "",
    [switch]$Push
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($VaultPath)) {
    $VaultPath = if ($env:CFMS_RESEARCH_VAULT) { $env:CFMS_RESEARCH_VAULT } else { "D:\cfms-research-vault" }
}
$vaultRoot = (Resolve-Path -LiteralPath $VaultPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $vaultRoot "Projects") -PathType Container)) {
    throw "Vault Projects directory not found: $vaultRoot"
}

Push-Location $repoRoot
try {
    node scripts/audit-vault-projects.mjs $vaultRoot
    if ($LASTEXITCODE -ne 0) { throw "Vault audit failed" }

    node scripts/check-graph-html.mjs
    if ($LASTEXITCODE -ne 0) { throw "graph.html validation failed" }
    node scripts/check-mindmap-html.mjs
    if ($LASTEXITCODE -ne 0) { throw "mindmap.html validation failed" }
    git diff --check
    if ($LASTEXITCODE -ne 0) { throw "git diff --check failed" }

    if (-not $Push) {
        Write-Host "Validated locally. Add -Push only after reviewing git diff and browser output."
        exit 0
    }

    if ((git branch --show-current) -ne "main") { throw "Push is allowed only from main" }
    git fetch origin main
    if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }
    $counts = (git rev-list --left-right --count HEAD...origin/main) -split "\s+"
    if ([int]$counts[1] -ne 0) { throw "origin/main is ahead; merge or rebase it before publishing" }

    $allowed = @("graph.html", "graph3d.html", "graph_계층형.html", "mindmap.html")
    $changed = @(
        git diff --name-only
        git diff --cached --name-only
        git ls-files --others --exclude-standard
    ) | Where-Object { $_ } | Sort-Object -Unique
    $unrelated = @($changed | Where-Object { $_ -notin $allowed })
    if ($unrelated.Count) {
        throw "Unrelated changes are present; publish aborted: $($unrelated -join ', ')"
    }

    git add -- $allowed
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        git commit -m "graph: update research views ($stamp)"
        if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
    }
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw "git push failed" }
    Write-Host "Published to https://github.com/cfms-lab/KIT_sodi"
} finally {
    Pop-Location
}
