$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $cscPath)) {
    $cscPath = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

if (-not (Test-Path $cscPath)) {
    Write-Error "Compilador csc.exe não encontrado no .NET Framework do Windows."
    exit 1
}

$sourceFile = Join-Path $PSScriptRoot "..\launcher\SmartTennisLauncher.cs"
$outputExe = Join-Path $PSScriptRoot "..\SmartTennis.exe"

Write-Host "Compilando Smart Tennis Launcher..."
Write-Host "Compilador: $cscPath"
Write-Host "Fonte: $sourceFile"
Write-Host "Destino: $outputExe"

& $cscPath /target:winexe /optimize+ /platform:anycpu /r:System.dll,System.Windows.Forms.dll,System.Drawing.dll,System.Net.Http.dll "/out:$outputExe" "$sourceFile"

if ($LASTEXITCODE -eq 0 -and (Test-Path $outputExe)) {
    Write-Host "SmartTennis.exe compilado com sucesso!" -ForegroundColor Green
} else {
    Write-Error "Falha na compilação do launcher."
    exit 1
}
