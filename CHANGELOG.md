# CHANGELOG

版本号规则：`主.次.修订`。修改后必须提升 `@version`，否则篡改猴不会拉取更新。

## v1.2.2

- **修复**：「头部有物品时禁止发送表情消息」在部分情况下完全没反应（不拦截、控制台也不报错），两处根因：
  - **跨家族物品判不出来**：判定只走了 `InventoryGet`，它内部还要求 `Group.Family === Player.AssetFamily`（`Scripts/Inventory.js:681`），中立/跨家族头饰会被判成「没戴」。现在取不到时退回直接扫描 `Player.Appearance`，不再比对家族。
  - **脚本启动时序**：`waitForSdk()` 原在文件靠前处调用，`bcModSdk` 已存在时 `boot()` 会同步执行，此时后面 `let` 声明的状态还在 TDZ，hook 一被触发就 `ReferenceError`，整个脚本不加载。现移到文件末尾，所有状态初始化后再启动。
- 新增 `/bcxfix emote` 自检：开关、监控分组、hook 状态、每个分组的物品、当前判定、已拦截次数。
- 新增 `emoteBlockGroups`（默认 `["ItemHead"]`）与 `/bcxfix group <分组>`：Head 栏以外的分组（如 `ItemHood`）也可纳入判定。
- 新增 `emoteBlockAtProtocol`（默认关）：协议层兜底，应对绕过 `ChatRoomSendEmote` 直接发消息的聊天增强 mod；已排除 WheelFortune 自带旁白与自身公告。
- 拦截时控制台会打印 `[BCX-Supplement] 已拦截表情消息（…）`，便于确认规则是否触发。
- 文档：中文/英文 README 各加一节「规则不生效怎么查」。

## v1.2.1

- 发布到 GitHub（`mrc0580/bcx-supplement`），启用 GitHub Pages 作为安装与更新源。
- 保留原 `@namespace`（`bcx-supplement.local`），这样从 URL 安装时会**覆盖已有的旧脚本**，而不是变成两份。
- 安装页：<https://mrc0580.github.io/bcx-supplement/>
- 文档：新增英文版 `README.en.md`，与 `README.md` 并存并需同步更新；安装页加入中英文切换入口。（仅文档，未改脚本，`@version` 不变。）

## v1.2.0

- **修正**：自定义规则改为拦截「表情消息」而不是「表情图标」。
  - 改为 hook `ChatRoomSendEmote`（`ChatRoom.js:3500`），覆盖 `*文字`、`50%*文字`、`/me`、`/attempt`、`/action`、Mu 风格 `:文字` 全部写法。
  - 移除 v1.1.0 中针对 `DialogSelfMenuMapping.Expression._ClickButton`、`DialogFacialExpressionsLoad`、`CharacterSetFacialExpression` 的三个 hook——那三个拦的是脸上的 facial expression，与「发消息」无关。
  - 被拦下时把原文回填到输入框（`emoteKeepInputText`，默认开）。
- **配置键重命名**，旧值自动迁移：`forbidEmotionWhileHeadOccupied` → `forbidEmoteWhileHeadOccupied`，`emotionNotice*` → `emoteNotice*`。
- 新增 `@updateURL` / `@downloadURL`，可由篡改猴自动更新。

## v1.1.0

- 新增自定义规则：头部栏（`ItemHead`）有物品时禁止发送表情（当时实现为拦截表情图标，已在 v1.2.0 修正）。

## v1.0.0

- 首版。补回 BCX 1.1.22 在 BC R133 上失效的规则：
  - Hide online friends if blind（`alt_hide_friends`）
  - Partial hearing / Hearing whitelist（`speech_partial_hearing` / `alt_hearing_whitelist`）
  - 5 条关系规则（`rc_*`）
  - Limit bound admin power（`alt_room_admin_limit`）
