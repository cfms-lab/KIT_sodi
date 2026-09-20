param(
    [string]$VaultPath = "",
    [switch]$Push
)

$ErrorActionPreference = "Stop"

# 이 파일은 **UTF-8 BOM** 으로 저장한다. Windows PowerShell 5.1 은 BOM 없는 .ps1 을
# 시스템 ANSI(한국어 Windows 는 CP949)로 읽어 아래 $allowed 의 한글 파일명이 파싱
# 시점에 이미 깨진다 — 2026-09-18 에 그것 때문에 graph.html 이 배포에서 조용히 빠졌다.
# 같은 이유로 git 의 UTF-8 출력도 콘솔 인코딩을 맞춰야 바르게 읽힌다.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
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
    node scripts/check-portfolio-html.mjs
    if ($LASTEXITCODE -ne 0) { throw "portfolio.html validation failed" }
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

    # 2026-09-20: graph_계층형.html 을 뺐다 — 파일을 지웠다(옛 계층형 지도, 사용자 판단).
    # 아래 quotepath 설정은 그대로 둔다. 지금은 비ASCII 이름이 없지만 다시 생겼을 때
    # 조용히 어긋나지 않게 하는 것이 목적이다.
    $allowed = @("graph.html", "graph3d.html", "mindmap.html", "portfolio.html")
    # core.quotepath 기본값은 비ASCII 이름을 "graph_ê³..." 로 이스케이프해
    # 돌려주므로 $allowed 와 비교가 어긋난다. 꺼서 실제 이름을 받는다.
    $changed = @(
        git -c core.quotepath=false diff --name-only
        git -c core.quotepath=false diff --cached --name-only
        git -c core.quotepath=false ls-files --others --exclude-standard
    ) | Where-Object { $_ } | Sort-Object -Unique
    $unrelated = @($changed | Where-Object { $_ -notin $allowed })
    if ($unrelated.Count) {
        throw "Unrelated changes are present; publish aborted: $($unrelated -join ', ')"
    }

    # 위 $unrelated 검사가 "바뀐 것은 전부 허용 목록 안" 을 이미 보장하므로 -A 로 담는다.
    # 한글 pathspec 을 git 에 넘기지 않는 것이 요점이다 — PowerShell 5.1 은 네이티브 인자를
    # ANSI 로 인코딩해서 git 이 UTF-8 로 읽으면 어긋나고, `git add` 가 통째로 실패한다.
    git add -A
    if ($LASTEXITCODE -ne 0) { throw "git add failed" }

    # 되검증: 실제로 스테이지된 것이 허용 목록 안인가. pathspec 이 조용히 아무 것도
    # 담지 못하는 사고(2026-09-18)를 여기서 잡는다.
    $staged = @(git -c core.quotepath=false diff --cached --name-only) | Where-Object { $_ }
    $badStaged = @($staged | Where-Object { $_ -notin $allowed })
    if ($badStaged.Count) {
        git reset -q
        throw "Staged files outside the allowed list; publish aborted: $($badStaged -join ', ')"
    }
    # 담을 것이 없어도 **미푸시 커밋이 있으면 push 는 해야 한다.** 원래 스크립트는
    # 항상 push 로 끝났으므로, 여기서 조기 종료하면 이미 만들어 둔 뷰 커밋이 발이 묶인다.
    $ahead = [int](@(git rev-list --count origin/main..HEAD)[0])
    if (-not $staged.Count) {
        if ($ahead -eq 0) {
            Write-Host "Nothing to publish: no view files changed and nothing to push."
            exit 0
        }
        Write-Host "No file changes, but $ahead commit(s) to push."
    } else {
        Write-Host "Staging: $($staged -join ', ')"
    }

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
