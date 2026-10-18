# CHANGELOG

版本号规则：`主.次.修订`。修改后必须提升 `@version`，否则篡改猴不会拉取更新。

## v1.2.1

- 发布到 GitHub（`mrc0580/bcx-supplement`），启用 GitHub Pages 作为安装与更新源。
- 保留原 `@namespace`（`bcx-supplement.local`），这样从 URL 安装时会**覆盖已有的旧脚本**，而不是变成两份。
- 安装页：<https://mrc0580.github.io/bcx-supplement/>

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
