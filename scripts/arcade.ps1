param([ValidateSet('start', 'stop')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
try {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $bundledNode = Join-Path $projectRoot 'runtime\node.exe'
    if (Test-Path -LiteralPath $bundledNode -PathType Leaf) {
        $nodeExecutable = $bundledNode
    } else {
        $installedNode = Get-Command node.exe -ErrorAction SilentlyContinue
        if (-not $installedNode) {
            throw 'Node.js was not found. Use the Windows portable ZIP, or install Node.js 24 LTS from https://nodejs.org and run this launcher again.'
        }
        $nodeExecutable = $installedNode.Source
    }
    & $nodeExecutable (Join-Path $PSScriptRoot 'launcher.mjs') $Action
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
