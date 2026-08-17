# Steam 上传脚本 - Voidbound
#
# 用法:
#   cd steam
#   .\upload.ps1
#
# 环境变量(可选,避免交互输入密码):
#   $env:STEAM_USER       = "your_steam_username"
#   $env:STEAM_PASS       = "your_steam_password"
#   $env:STEAM_GUARD_CODE = "12345"   # 首次登录后邮件/APP 给的 5 位验证码
#
# 必填项(脚本会检查):
#   app_build.vdf   → AppID 已填
#   depot_build.vdf → DepotID 已填
#   src-tauri\target\release\bundle\nsis\Voidbound_0.1.0_x64-setup.exe 存在

$ErrorActionPreference = "Stop"
$repoRoot  = Resolve-Path "$PSScriptRoot\.."
$steamDir  = $PSScriptRoot
$cacheDir  = Join-Path $steamDir ".cache"
$scDir     = Join-Path $cacheDir "steamcmd"
$scExe     = Join-Path $scDir "steamcmd.exe"
$installer = Join-Path $repoRoot "src-tauri\target\release\bundle\nsis\Voidbound_0.1.0_x64-setup.exe"
$appVdf    = Join-Path $steamDir "app_build.vdf"
$outputDir = Join-Path $steamDir "output"

# ---------- 1. 检查 installer 存在 ----------
if (-not (Test-Path $installer)) {
    Write-Host "[ERR] 找不到 NSIS 安装包: $installer" -ForegroundColor Red
    Write-Host "      请先跑: cargo tauri build" -ForegroundColor Yellow
    exit 1
}

# ---------- 2. 检查 VDF 占位符已替换 ----------
$appContent = Get-Content $appVdf -Raw
if ($appContent -match "REPLACE_WITH_APP_ID") {
    Write-Host "[ERR] app_build.vdf 里还有 REPLACE_WITH_APP_ID 占位符" -ForegroundColor Red
    Write-Host "      编辑 $appVdf,填入你在 Steamworks 后台拿到的 AppID" -ForegroundColor Yellow
    exit 1
}
$depotVdf = Join-Path $steamDir "depot_build.vdf"
$depotContent = Get-Content $depotVdf -Raw
if ($depotContent -match "REPLACE_WITH_DEPOT_ID") {
    Write-Host "[ERR] depot_build.vdf 里还有 REPLACE_WITH_DEPOT_ID 占位符" -ForegroundColor Red
    Write-Host "      编辑 $depotVdf,填入 DepotID" -ForegroundColor Yellow
    exit 1
}

# ---------- 3. 下载 steamcmd(首次) ----------
if (-not (Test-Path $scExe)) {
    Write-Host "[..] 首次运行,下载 steamcmd 到 $scDir ..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $scDir -Force | Out-Null
    $zipUrl = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip"
    $zipPath = Join-Path $cacheDir "steamcmd.zip"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $scDir -Force
    Remove-Item $zipPath -Force
    Write-Host "[OK] steamcmd 已下载" -ForegroundColor Green
}

# ---------- 4. 准备环境 ----------
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

# 凭证(优先环境变量)
$steamUser  = if ($env:STEAM_USER)  { $env:STEAM_USER }  else { Read-Host "Steam 用户名" }
$steamPass  = if ($env:STEAM_PASS)  { $env:STEAM_PASS }  else { Read-Host "Steam 密码" -AsSecureString | ConvertFrom-SecureString -AsPlainText }
$guardCode  = if ($env:STEAM_GUARD_CODE) { $env:STEAM_GUARD_CODE } else { "" }

# ---------- 5. 调用 steamcmd ----------
Write-Host "[..] 启动 steamcmd 上传 build ..." -ForegroundColor Cyan
$appVdfAbs = Resolve-Path $appVdf
$loginArgs = "+login $steamUser $steamPass"
if ($guardCode) { $loginArgs += " $guardCode" }

& $scExe $loginArgs.Split(" ") + @(
    "+force_install_dir", "`"$repoRoot`"",
    "+run_app_build", "`"$appVdfAbs`"",
    "+quit"
)

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[OK] Build 已上传到 Steam!" -ForegroundColor Green
    Write-Host "    登录 https://partner.steamgames.com/ → Builds → 把 build 设为 Default 分支" -ForegroundColor Yellow
} else {
    Write-Host "[ERR] steamcmd 失败,exit=$LASTEXITCODE" -ForegroundColor Red
    Write-Host "      看 stderr 输出,通常是 Steam Guard 验证码过期或凭证错" -ForegroundColor Yellow
    exit 1
}
