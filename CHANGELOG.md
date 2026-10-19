# CHANGELOG

版本号规则：`主.次.修订`。修改后必须提升 `@version`，否则篡改猴不会拉取更新。

## v2.1.0

**中英双语界面**，默认英文，面板右上角一键切换。

- **默认英文**：新增配置键 `uiLang`（默认 `"en"`）。面板标题、副标题、分类标签、规则名与说明、参数提示、底部按钮、`hook n/n` 徽标、悬浮按钮 tooltip、偏好设置入口名、`/bcxfix` 状态与 `/bcxfix emote` 自检，全部跟随语言。
- **切换按钮**：面板标题栏右上角 `🌐 中文` / `🌐 EN`。切换后立即原地重建面板，**保留当前分类标签与滚动位置**（在「关系控制」里切换不会跳回「全部」），并写入 `localStorage` 下次生效。
- **命令切换**：`/bcxfix lang en|zh`；`/bcxfix reset` 只重置规则，不动语言（语言算界面偏好）。
- **数据层**：`RULES` 里每条规则/字段补齐 `descEn` / `hintEn`，两条「本补充包新增」的规则加 `bcxEn`；面板外框文案集中在 `L10N.zh` / `L10N.en`，用 `t()` / `L()` / `nameOf()` / `pick()` 取值，缺英文自动回退中文。
- 修复：页脚「设置会自动保存」的词条漏写，会直接显示键名 `autosave`。
- 文档：中英文 README 各加「界面语言」「双语怎么实现」章节，`uiLang` 键名，界面语言自测项；两张界面截图（`docs/ui-panel-en.png` 英文 / `docs/ui-panel-zh.png` 中文）。

## v2.0.0

**可视化设置面板**，参照原版 BCX 的「规则列表」形态：每条规则一张卡片，可以单独开关，参数就在卡片里改。

- **三个入口，同一套面板**：
  - 偏好设置 → 扩展 → 「BCX 补充包 / Supplement」（走 BC 官方的 `PreferenceRegisterExtensionSetting`，BCX 原版也挂在这里）；
  - 屏幕右侧的 `BCX` 悬浮按钮（`uiFloatingButton`，默认开，可关）；
  - 聊天框 `/bcxfix ui`，或控制台 `BCXSupplement.openSettings()`。
- **面板结构**：顶部 7 个分类标签（全部 / 好友与视觉 / 听力 / 关系控制 / 房间管理 / 表情消息 / 通用），标签上带「已开启/总数」；每张卡片含勾选框、中文名、右侧对应 BCX 原规则 ID、说明、`hook n/n` 生效徽标；底部「全部开启 / 全部关闭 / 恢复默认」+ 总体 `hook 6/6 生效`；`Esc`、`×`、点遮罩都能关。
- **参数进卡片**：白名单成员编号、可懂词表、公告文本与冷却、监控分组、`emoteKeepInputText`、`emoteBlockAtProtocol` 全部可视化编辑，勾选/改动即时写 localStorage 并生效，没有「保存」按钮。
- **规则改为单一数据源**：新增 `RULES`（规则 + 字段）与 `RULE_GROUPS`（分类）两张表，面板、`/bcxfix` 状态、`on|off` 键名、批量开关全部由它们生成。以后加规则只改表，界面自动出现。
- 关掉「失明时隐藏在线好友」时，已遮罩的好友行会立即还原（新增 `unmaskFriendList()`，名字从 `Player.FriendNames` / 缓存取）。为此 `maskFriendList()` 现在也会记住原始名字。
- 拦截公告文本框留空 = 只在本地拦截、不向房间播报（之前空值会发出去一条只有 `*` 的消息）。
- 新增 `uiFloatingButton`（默认 `true`）配置键。
- 面板与悬浮按钮可被 `BCXSupplement.openSettings()` / `closeSettings()` 操作；`BCXSupplement.maskFriendList` / `unmaskFriendList` 也一并暴露，便于排查。
- 修复：`document-start` 早期注入时 `document.body` / `head` 还没就绪，悬浮按钮与样式会静默不创建；现在带延迟重试。
- 修复：从偏好设置里按 BC 的返回键离开时，会被 `PreferenceSubscreenExtensionsClear()` 又拉回扩展列表；`closeSettings(fromGame)` 现在区分「自己点 ×」和「BC 自己收起」。
- 文档：中英文 README 各加「设置面板」章节、`uiFloatingButton` 键名、7 条界面自测项。

## v1.2.3

- **默认监控分组加入 `ItemHood`**：`emoteBlockGroups` 默认值从 `["ItemHead"]` 改为 `["ItemHead","ItemHood"]`。BC 里很多「面具/头罩」其实挂在 Hood 栏（`ItemHood`），只认 `ItemHead` 会漏判，表现就是规则完全没反应。
  - 配置迁移：只在「存的是旧的 `["ItemHead"]`」时自动升级；用户自己改过的列表不动（新增 `configVersion` 字段）。
- `/bcxfix emote` 增加一行「身上头部相关分组」，列出当前穿着里所有 head/hood/mask/blind/face 类分组及物品名，并标注是否已监控——直接告诉你该 `/bcxfix group` 哪个。
- 新增控制台入口 `BCXSupplement.diag()`：效果等同 `/bcxfix emote`，但可以直接在开发者控制台调用（`/bcxfix` 是游戏内聊天指令，敲进控制台会被当成正则，报 `Invalid regular expression`）。
- `/bcxfix emote` 现在同时把结果打进控制台，方便复制。

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
