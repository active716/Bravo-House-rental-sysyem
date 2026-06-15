# 維修同步自動部署 Sandbox 測試包

這是一套獨立測試用的維修同步 sandbox，不會讀寫正式維修資料。

## 測試目標

驗證以下流程是否穩定：

- 手機端先顯示資料，再背景同步。
- JSONP 寫入失敗時，可改用表單 POST 備援。
- Apps Script `action=health` 能確認後端版本。
- `Code.gs` 使用 Apps Script 相容語法，避免貼上後出現 `Unexpected token` 語法錯誤。
- 已完成且超過 7 天的測試維修會自動清除。
- 整套流程只寫入 sandbox Google Sheet。

## Sandbox Google Sheet

```text
Bravo House 維修同步自動部署測試_SANDBOX_20260614
```

網址：

```text
https://docs.google.com/spreadsheets/d/1PuYj0_e1wGYfCkC6Z3mKRMChF6CN3oXVfOqARAAFSCc/edit
```

Apps Script 會自動建立分頁：

```text
repairs_sandbox
```

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `Code.gs` | Sandbox Apps Script 後端，只寫入 sandbox Sheet |
| `index.html` | 手機端同步測試頁 |
| `appsscript.json` | Apps Script manifest 範例 |
| `scripts/check-sandbox-package.ps1` | 本機檢查腳本 |

## 手動部署測試

1. 打開 sandbox Google Sheet。
2. 點「擴充功能」。
3. 點「Apps Script」。
4. 把本資料夾的 `Code.gs` 內容完整貼到 Apps Script 編輯器。
5. 儲存。
6. 點「部署」。
7. 選「新增部署作業」。
8. 類型選「網頁應用程式」。
9. 設定：

```text
執行身分：我
誰可以存取：任何人
```

10. 部署後複製 Web App URL。
11. 打開 `index.html`。
12. 貼上 Web App URL。
13. 點「檢查 health」。

成功時應看到：

```json
{
  "ok": true,
  "sandbox": true,
  "version": "sandbox-2026-06-15-compatible-v1",
  "supports_get_upsert": true,
  "supports_form_post": true
}
```

## 可測項目

### 1. Health check

按「檢查 health」。

用途：

- 確認 Apps Script 已部署新版。
- 確認目前 Web App URL 是 sandbox，不是正式後端。

### 2. 一般新增維修

按「新增並背景同步」。

預期：

- 畫面立刻出現維修卡片。
- 卡片先顯示同步中。
- 背景同步完成後，可按「讀取雲端資料」看到資料。

### 3. 舊完成資料自動清除

按「新增舊完成測試並驗證自動清除」。

預期：

- 會新增一筆完成日期為 `2020-01-01` 的測試維修。
- 下一次讀取雲端資料時，Apps Script 會自動清除它。
- 正式資料不會受影響。

## 本機檢查

在 PowerShell 執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\sandbox\repair-sync-test\scripts\check-sandbox-package.ps1
```

這只檢查檔案內容與基本語法，不會部署、不會寫正式資料。

2026-06-15 補充：檢查腳本也會擋下 Apps Script 較容易出錯的新版 JavaScript 寫法，例如 `=>`、`...`、`const`、`let`。

## 下一階段

如果這套 sandbox 測試通過，才建議繼續做：

```text
GitHub Actions + clasp 自動部署 Apps Script
```

正式自動化前要先決定：

- Google 授權要放哪裡。
- GitHub Secrets 怎麼管理。
- 是否要加入 token，避免 Web App URL 被知道後亂寫。
- 是否要強制用 `action=health` 驗證前後端版本一致。
