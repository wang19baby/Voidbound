# Voidbound Steam 发布工具

一键把 `cargo tauri build` 产物推到 Steam 的工具集。

## 一次性前置(用户手动)

1. **注册 Steamworks Partner**
   - 打开 https://partner.steamgames.com/ → 注册账号
   - 付款 USD $100(Velvet 2024 后部分开发者可申请减免;具体看后台提示)
   - 审核通过后,后台 "Create New App" → 填表 → 拿到 **AppID** (7-8 位数字)

2. **创建 Depot**
   - Steamworks 后台 → 你的 App → SteamPipe → Depots → Add New Depot
   - 命名 `Windows x64 NSIS Installer` → 拿到 **DepotID** (7-8 位数字)
   - 平台选 **Windows**、OS 版本留空、语言选 **All Languages**

3. **填入 AppID / DepotID**
   - 编辑 `app_build.vdf`:`REPLACE_WITH_APP_ID` → 你的 AppID
   - 编辑 `app_build.vdf` + `depot_build.vdf`:`REPLACE_WITH_DEPOT_ID` → 你的 DepotID

## 每次上传

```powershell
# 1. 重新构建(可选)
cd <repo-root>
cargo tauri build

# 2. 推到 Steam
cd steam
.\upload.ps1
```

`upload.ps1` 会:
1. 首次运行会下载 `steamcmd.exe` 到 `steam/.cache/steamcmd/`
2. 提示输入 Steam 账号密码(支持环境变量 `STEAM_USER` / `STEAM_PASS` / `STEAM_GUARD_CODE`)
3. 调用 `steamcmd +login ... +run_app_build ...`
4. 上传完成后,登录 Steamworks → Builds → 设为 **Default** 分支可发布

## 商店页必填(发布前)

登录 https://partner.steamgames.com/ → 你的 App → Store Presence:

- [ ] **Required 标签**:勾选 "This is a Free Game" → Price = Free
- [ ] **Description**(简短介绍 1-2 段)
- [ ] **About**(长描述 + 系统需求 + 玩法说明)
- [ ] **Header Capsule**(横幅图 460x215)
- [ ] **Main Capsule**(主图 616x353)
- [ ] **Screenshot**(至少 5 张 1920x1080 截图)
- [ ] **System Requirements**(Win 10+ / x64 / 100MB)
- [ ] **Categories**:选 "RPG / Action / Indie"
- [ ] **Tags**(建议):Rogue-like, Action RPG, Pixel Graphics, Hack and Slash, Top-Down

## 不需要做的(因为我们不上 Steamworks SDK)

- � 不需要 `steamworks-rs` crate
- ❌ 不需要成就、云存档、好友列表
- ❌ 不需要 DRM
- ✅ 只需要 `steam_appid.txt` + SteamPipe 上传

## 价格设置

后台 → Pricing → **Free to Play** → 区域全部留空(默认全球免费)

## 文件清单

| 文件 | 作用 |
|------|------|
| `app_build.vdf` | 构建配置(AppID / 关联 depot) |
| `depot_build.vdf` | Depot 内容(指向 NSIS 安装包) |
| `upload.ps1` | 一键上传脚本 |
| `.cache/steamcmd/` | steamcmd 自动下载到此 |
| `output/` | 上传中间产物(已 gitignored) |
