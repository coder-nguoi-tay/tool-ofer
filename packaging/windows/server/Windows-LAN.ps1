#requires -RunAsAdministrator
<#
.SYNOPSIS
Mo/thu hoi cong LAN rieng cho backend AutoLeadPC tren mang Private cung subnet.
.PARAMETER Action
Enable de mo cong, Disable de go dung rule do AutoLeadPC tao.
.PARAMETER Port
Cong HTTP; mac dinh 3211, hoac AUTOLEADPC_PORT neu da dat.
.OUTPUTS
Thong bao trang thai rule va dia chi truy cap.
.NOTES
@author ductv <ductv@getflycrm.com>
@since 2026-11-16
#>
param(
  [ValidateSet('Enable', 'Disable')][string]$Action = 'Enable',
  [ValidateRange(1024, 65535)][int]$Port = $(if ($env:AUTOLEADPC_PORT) { [int]$env:AUTOLEADPC_PORT } else { 3211 })
)

$ErrorActionPreference = 'Stop'
$ruleName = "AutoLeadPC-Server-$Port"
try {
  $existingRule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
  if ($existingRule -and $existingRule.Group -ne 'AutoLeadPC') {
    throw 'Da co rule trung ten khong thuoc AutoLeadPC; giu nguyen rule hien co.'
  }
  if ($Action -eq 'Disable') {
    if ($existingRule) { $existingRule | Remove-NetFirewallRule }
    Write-Host "Da go rule LAN AutoLeadPC cong $Port."
  } else {
    $nodeExecutable = Join-Path $PSScriptRoot 'resources\backend\runtime-node\node.exe'
    if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) { throw 'Khong tim thay Node di kem ung dung. Hay giai nen day du goi.' }
    if ($existingRule) { $existingRule | Remove-NetFirewallRule }
    New-NetFirewallRule -Name $ruleName -DisplayName "AutoLeadPC Server TCP $Port" -Group 'AutoLeadPC' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Program $nodeExecutable -Profile Private -RemoteAddress LocalSubnet | Out-Null
    Write-Host "Da mo TCP $Port: chi mang Private va cac may cung subnet."
    Write-Host 'Hay dat ket noi LAN/Wi-Fi tin cay thanh Private trong Windows Settings.'
    Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | ForEach-Object { Write-Host "Dia chi truy cap: http://$($_.IPAddress):$Port" }
  }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  Read-Host 'Nhan Enter de dong'
  exit 1
}
Read-Host 'Nhan Enter de dong'
