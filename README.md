# BCX 失效规则补充包（BC R133）

[English](README.en.md) | **中文**

BCX（Bondage Club Extended）1.1.22 里有几条规则挂的 hook 在 BC R133 上已经没有被调用，勾选后完全没有效果。这个补充包用 `bcModSdk` 重新实现了这些规则的核心行为，**不改 BCX 本体**，可以随时单独关掉。另外还带一条 BCX 没有的自定义规则：**头部栏有物品时禁止发送表情消息**（聊天里以 `*` 开头的那条 Emote 消息，不是脸上的表情图标）。

- 主文件：`bcx-supplement.user.js`
- 适用：BC R128 及以上（好友列表改版之后），在 R133 上核对过全部 hook 目标
- 当前版本：**v1.2.3**（变更记录见 [CHANGELOG.md](CHANGELOG.md)）

## 安装（一键）

装好 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/) 后，打开安装页点按钮，扩展会直接弹出安装窗口：

- 安装页：<https://mrc0580.github.io/bcx-supplement/>
- 直接装脚本：<https://mrc0580.github.io/bcx-supplement/bcx-supplement.user.js>

脚本里已经写死 `@updateURL` / `@downloadURL`，装的就是「会自己更新的版本」：

- 篡改猴默认每 24 小时检查一次，也可以在扩展面板里点「检查用户脚本更新」立刻拉取；
- 检查时只比对脚本头部的 `@version`，**版本号变大才会更新**，所以每次改动都必须提升 `@version`；
- 更新后刷新游戏页面即生效，不用重新粘贴代码。

### 为什么用 github.io 而不是 raw.githubusercontent.com

本机实测：`raw.githubusercontent.com` 在中国大陆**无法解析**（`curl` 立即失败，`nslookup` 查不到记录），所以 raw 链接既装不上、也检查不了更新。`https://mrc0580.github.io/...` 走的是 GitHub Pages 的 CDN，实测可访问，而且**每次 push 后自动重新构建**，不存在长缓存问题。

备用源（内容一致，任选其一装，但装完要同步改头部 `@updateURL` / `@downloadURL`，否则更新检查仍指向原地址）：

| 源 | 地址 | 特点 |
|---|---|---|
| GitHub Pages（默认） | `https://mrc0580.github.io/bcx-supplement/bcx-supplement.user.js` | 每次 push 即更新 |
| jsDelivr | `https://fastly.jsdelivr.net/gh/mrc0580/bcx-supplement@main/bcx-supplement.user.js` | 稳，但分支引用有约 12 小时缓存 |
| gh-proxy | `https://gh-proxy.com/https://raw.githubusercontent.com/mrc0580/bcx-supplement/main/bcx-supplement.user.js` | 第三方代理，长期可用性不保证 |

---

## 一、覆盖的规则

| BCX 规则 | 规则 ID | R133 上失效原因 | 本补充包的实现 |
|---|---|---|---|
| Hide online friends if blind | `alt_hide_friends` | 依赖 `button.fl-online-friends-content`，R128 改成「•••」菜单后该按钮不存在 | hook `FriendListLoadFriendList` 直接改表格单元格；hook `FriendListGetAvailableActions` 过滤掉 `beep` 动作 |
| Partial hearing | `speech_partial_hearing` | hook 的 `SpeechGarble` 已 0 调用点（改用 `SpeechTransformProcess`） | hook `SpeechTransformProcess`，按词重建模糊文本 |
| Hearing whitelist | `alt_hearing_whitelist` | 同上 | 白名单成员在纯失聪场景下直接返回原文 |
| Forbid getting new lovers | `rc_lover_new` | `ChatRoomLovershipOptionIs` 0 调用点 | hook `ServerSend`，拦 `AccountLovership` 的 `Propose` / `Accept` |
| Forbid breaking up with lovers | `rc_lover_leave` | 菜单层失效 | hook `ServerSend`，拦 `AccountLovership` 的 `Break` |
| Forbid taking new submissives | `rc_sub_new` | `ChatRoomOwnershipOptionIs` 0 调用点 | hook `ServerSend`，拦 `AccountOwnership` 的 `Propose`（试用转正放行） |
| Forbid disowning submissives | `rc_sub_leave` | `ChatRoomIsOwnedByPlayer` 0 调用点 | hook `ServerSend`，拦 `AccountOwnership` 的 `Release` |
| Forbid club owner changes | `rc_club_owner` | `ChatRoomOwnershipOptionIs` 0 调用点（管理界面的 hook 仍有效） | hook `ServerSend`，拦 `Accept`（无主时）与离开主人的 `Break` |
| Limit bound admin power | `alt_room_admin_limit` | `ChatRoomAdminAction` 0 调用点 | hook `ServerSend`，束缚时拦掉除 `Kick` / `Ban` 之外的 `ChatRoomAdmin` 动作 |
| **头部有物品时禁止发送表情消息**（本包新增，BCX 没有这条） | `forbid_emote_in_mask` | — | hook `ChatRoomSendEmote`——`*文字`、`/me`、`/action`、`/attempt`、Mu 风格 `:文字` 全部收敛到这，拦下后向房间发一条公告；另有可选的 `ServerSend` 协议层兜底 |

未包含：`block_entering_rooms` 的「房间已被屏蔽」提示。该规则的**拦截本身仍然有效**（走 `ChatSearchJoin`），失效的只是搜索结果里的那条 tooltip，属于纯装饰。

---

## 二、安装

### 方式 A：从本仓库安装（推荐，可自动更新）

1. 装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 打开上面的 raw 链接，扩展自动弹安装页，点「安装」。
3. 刷新游戏页面。控制台应出现：

```
[BCX-Supplement] ✓ hooked FriendListLoadFriendList  (alt_hide_friends)
[BCX-Supplement] ✓ hooked FriendListGetAvailableActions  (alt_hide_friends)
[BCX-Supplement] ✓ hooked SpeechTransformProcess  (speech_partial_hearing + alt_hearing_whitelist)
[BCX-Supplement] ✓ hooked ServerSend  (rc_* / alt_room_admin_limit)
[BCX-Supplement] ✓ hooked ChatRoomSendEmote  (forbid_emote_in_mask（新增）)
[BCX-Supplement] 已加载 v1.2.1：5/5 个 hook 生效
```

脚本头部已经写好 `@match`，覆盖 `www.bondageprojects.elementfx.com` / `bondageprojects.elementfx.com` / `bondage-club.com`。如果你用的是别的镜像，把域名加进 `@match` 即可。

### 方式 B：手动粘贴（只适合临时调试）

扩展面板 →「添加新脚本」→ 把 `bcx-supplement.user.js` 全文粘进去保存。这样装的脚本**不会**跟着仓库更新（除非你把 `@updateURL` 一起粘进去），改完记得换回方式 A。

### 方式 C：FUSAM 本地开发模式

FUSAM 支持用 URL 参数加载本地脚本（见官方文档「Developing an Addon for FUSAM」）：

1. 在脚本所在目录起一个静态服务，例如 `python -m http.server 8000`。
2. 打开 `https://www.bondageprojects.elementfx.com/R133/BondageClub/?fusam=http://localhost:8000/bcx-supplement.user.js&fusamType=eval`
3. FUSAM 里会出现一条「Local Development」的 addon，开关它即可。

### 方式 D：临时试一下（刷新失效）

控制台粘贴整个文件内容回车即可，和方式 A 等价，只是每次刷新要重来。

> 脚本只往 `bcModSdk` 注册一个名为 `BCXSupplement` 的 mod，不写 BC 的数据、不改存档；卸载 = 删掉脚本刷新。

---

## 三、配置

配置存在 `localStorage["bcx-supplement.config.v1"]`，两种改法：

### 聊天框命令 `/bcxfix`

```
/bcxfix                       查看所有开关与白名单
/bcxfix off forbidNewSub      关掉某条（键名见下）
/bcxfix on forbidNewSub       打开
/bcxfix allowfriend 12345     把 12345 加进/移出「失明也可见」名单
/bcxfix allowhearing 12345    把 12345 加进/移出「语音白名单」
/bcxfix word hello            加/删「永远听得懂」的词
/bcxfix notice <文本>         改「表情消息被拦截」的公告文本（{name} 或 $name 会被替换成昵称）
/bcxfix emote                 表情消息规则自检（排查「不生效」先看这个）
/bcxfix group ItemHood        把某个装备分组加入/移出「头部栏」（默认 ItemHead + ItemHood）
/bcxfix reset                 恢复默认
```

### 控制台

```js
BCXSupplement.config.partialHearingRandom = false;
BCXSupplement.config.partialHearingWords = ["hello", "please"];
BCXSupplement.save();      // 不 save 则刷新后丢失
BCXSupplement.status();    // 看 hook 是否都挂上了
```

### 键名一览

| 键 | 默认 | 含义 |
|---|---|---|
| `hideFriendsWhenBlind` | `true` | 完全失明（blind ≥ 3）时遮好友名字/编号并禁用蜂鸣 |
| `friendsVisible` | `[]` | 失明时仍可见的成员编号 |
| `partialHearing` | `true` | 部分听懂模糊语音 |
| `partialHearingRandom` | `true` | 每个词 25% 概率听懂 |
| `partialHearingWords` | `[]` | 永远听得懂的词 |
| `hearingWhitelist` | `true` | 语音白名单开关 |
| `hearingWhitelistMembers` | `[]` | 语音永远听得懂的成员 |
| `hearingWhitelistIgnoreGagged` | `false` | 对方被堵嘴时是否也听懂 |
| `forbidNewOwner` | `true` | 禁止换主人 / 离开主人 |
| `forbidNewSub` | `true` | 禁止收新 sub（试用转正不受影响） |
| `forbidReleaseSub` | `true` | 禁止放弃 sub |
| `forbidNewLover` | `true` | 禁止新恋人（恋爱→订婚→结婚不受影响） |
| `forbidBreakLover` | `true` | 禁止与恋人分手 |
| `limitAdminWhileRestrained` | `true` | 被束缚时禁掉除踢人/封禁外的房间管理动作 |
| `forbidEmoteWhileHeadOccupied` | `true` | 头部栏（`ItemHead`）有物品时禁止发送表情消息（`*` 开头的 Emote 消息），并向房间公告 |
| `emoteBlockGroups` | `["ItemHead","ItemHood"]` | 哪些装备分组算「头部栏」。默认同时算 Head 栏和头套（很多面具/头罩其实是 `ItemHood`）；其它分组用 `/bcxfix group` 加 |
| `emoteBlockAtProtocol` | `false` | 协议层兜底：有的聊天增强 mod 绕过 `ChatRoomSendEmote` 直接发消息，打开后在 `ServerSend` 再堵一道 |
| `emoteNoticeMessage` | `"$name" tries to send an emotion, but failed due to he/she's in a mask` | 公告文本模板 |
| `emoteNoticeCooldownMs` | `1500` | 公告冷却，防止连发刷屏（拦截本身不受冷却影响） |
| `emoteKeepInputText` | `true` | 被拦下后把原文留在输入框，省得重打 |

---

## 四、实现要点

**Hook 目标全部是 R133 里仍被调用的函数**，不是「看起来还在」的废弃函数：

- `FriendListLoadFriendList`：R133 里同步构建好友列表 DOM，post-hook 能直接拿到 `.friend-list-row`。
- `FriendListGetAvailableActions`：R133 的「•••」菜单数据源，动作 `id` 为 `delete / add / beep / reply / copy / react`，过滤 `beep` 等价于 BCX 当年的「禁用蜂鸣按钮」。
- `SpeechTransformProcess`：R133 的语音处理入口，接收方效果固定为 `["deafen"]`，所以只在这一支上动手。
- `ServerSend`：关系与房间管理最终都变成 `AccountOwnership` / `AccountLovership` / `ChatRoomAdmin` 消息，在这一层拦截比逐个菜单函数稳。

**延迟挂钩**：BC 的脚本按顺序同步加载，`bcModSdk` 出现时 `Screens/*.js` 里的函数可能还没定义。脚本对每个 hook 做「函数出现后再挂」，每 500ms 重试、最多 60 秒，所以不会因为加载顺序漏挂。

**优先级**：从 ModSDK 源码看，`hookFunction` 的 priority 越大越靠外层（先执行、后置代码最后执行）。所以过滤类 hook 用高优先级（10），保证看到的是最终结果。

### 新增规则「头部有物品时禁止发送表情消息」怎么实现的

先说清楚拦的是哪一个：**表情消息**是聊天内容，接收端 `Type: "Emote"`，在房间里显示成斜体的一段话；**表情图标**是角色脸上的 facial expression（脸红、皱眉之类）。两者在 BC 里毫无关系，这条规则管的是前者。

R133 里玩家主动发出的表情消息只有一条必经之路（`ChatRoom.js:3500`），所有写法都收敛到同一个函数：

```
*文字                       聊天框输入，ChatRoom.js:3352 判断前缀
50%*文字                    带成功率的表情
/me 文字                     CommandsDefault.js:448
/attempt 50% 文字            CommandsDefault.js:455
/action 文字                 CommandsDefault.js:461（内部变成 **文字）
:文字                        MuStylePoses 打开时的另类写法
        ↓
ChatRoomSendEmote(msg)
        ↓
ChatRoomGenerateChatRoomChatMessage("Emote", msg)
        ↓
ServerSend("ChatRoomChat", { Type: "Emote", ... })
```

所以只 hook `ChatRoomSendEmote` 一个点就覆盖全部写法，拦下后不调 `next`，消息根本不会进入协议层。

几个细节：

- **判定条件**是 `InventoryGet(Player, "ItemHead")` 非空，也就是衣柜里 Head 那一栏有东西（面具、头套、帽子都算）。取不到 `InventoryGet` 时退回遍历 `Player.Appearance`。
- **为什么不在 `ServerSend` 兜底**：`WheelFortune.js:904/944/957` 有 3 处直接发 `Emote` 的自动旁白（转盘结果），那是游戏自带的叙述，不属于「玩家发表情」，在协议层拦会误伤。
- **输入框回填**：`ChatRoomSendChat` 在调用 `ChatRoomSendEmote` 之后会无条件清空输入框（`ChatRoom.js:3354`），所以拦下时用微任务把原文写回去，避免玩家白打一遍。不想要这个行为就把 `emoteKeepInputText` 设成 `false`。
- **公告用 `Type: "Emote"` 而不是 `"Action"`**。R133 收到 `Action` 会拿 `Content` 去 `TextQueryMultiple` 查本地化表（`ChatRoom.js:4562`），自定义文本会被替换成 `⚠️MISSING TEXT` 占位符；`Emote` 不查表。内容以 `*` 开头，接收端的 Emote 格式化逻辑（`ChatRoom.js:3782`）就不会再在句首补一遍发送者名字，最终在房间里显示为斜体的一段 `"Alice" tries to send an emotion, but failed due to he/she's in a mask`。
- **公告有 1.5 秒冷却**，但拦截本身每次都生效。
- 顺带一提，BC 自己也有语义相同的房主规则 `BlockEmote`（`ChatRoom.js:3502` 那句 `ChatRoomOwnerPresenceRule("BlockEmote")`），可以对照。

---

## 五、与 BCX 原规则的差异（重要）

补充包是**全局开关**，没有 BCX 那套「对谁生效」的条件系统：

1. **没有 per-target 条件**。BCX 的规则是按目标角色/关系逐条判定的（比如「仅当对象是你的主人时」）。本包是「开=对所有人生效」。如果你只想对特定人生效，请关掉对应开关、用 BCX 原生规则里仍然有效的部分，或改脚本。
2. **不读取 BCX 的白名单**。BCX 把 `allowedMembers` / `whitelistedMembers` 存在它自己的规则数据里，本包读不到，需要在 `/bcxfix` 里重新填一遍。
3. **关系拦截在协议层**，所以：
   - 拦截的是「消息发不出去」，界面上的按钮不会变灰；
   - 极端情况下（别的客户端/脚本直接发协议）依然能绕过——和 BCX 原规则同一水平。
4. **语音重建用的是自己的逐词算法**（和 BCX 一样逐词调 `SpeechTransformGagGarble`），随机序列与 BCX 不会逐字一致，但「听懂得比例」一致。
5. 一旦 BCX 官方修好了某条规则，请把本包对应开关关掉，避免重复处理。

---

## 六、自测清单

| 项目 | 操作 | 预期 |
|---|---|---|
| 好友遮罩 | 戴上使 blind ≥ 3 的眼罩 → 打开好友列表 | 名字变 `Someone`、编号变 `######`；白名单成员不变 |
| 蜂鸣 | 同一状态下点好友行的「•••」 | 菜单里没有「Beep」项 |
| 正常状态 | 摘下眼罩再进好友列表 | 名字编号恢复（列表会重新渲染） |
| 部分听力 | 戴耳塞使 deaf ≥ 2，让普通角色说话 | 大部分音节模糊，约 1/4 的词可辨认 |
| 听力白名单 | 把对方编号加进 `allowhearing` | 她的话完整可读 |
| 关系控制 | 对没有关系的角色发起所有权提议 | 聊天框出现「你的规则不允许你收新的 sub」，提议未发出 |
| 试用转正 | 对自己的试用期 sub 点转正 | 正常发出（不受影响） |
| 管理限制 | 被束缚且是管理员，移动房间里的角色 | 提示「被束缚时不能进行房间管理操作」，动作未发出 |
| 踢人 | 同上，踢人 | 正常执行 |
| 头部有物品禁表情消息 | 在 Head 栏戴上任意物品，在聊天框输入 `*waves` 回车 | 消息没有发出，输入框里的文字被还回来，房间里出现斜体公告 `"Alice" tries to send an emotion, but failed due to he/she's in a mask` |
| 其他表情写法 | 同一状态下试 `/me waves`、`/action waves`、`/attempt 50% waves` | 同样被拦下、同样公告（共用 1.5s 冷却） |
| 普通说话 | 同一状态下输入 `hello`（不带 `*`） | 正常发出（本规则不管普通聊天） |
| 表情图标 | 同一状态下改脸上的表情（表情面板点选） | **不受影响**，正常生效（本规则不管表情图标） |
| 摘掉头饰 | 摘下 Head 栏物品再发 `*waves` | 正常发出 |
| 状态自查 | `/bcxfix` | 显示 10 个开关 + 白名单 + 「头部栏」当前物品 + hook 是否全部生效 |
| 表情规则自检 | `/bcxfix emote` | 显示开关、监控分组、hook 状态、每个分组里的物品、当前判定、已拦截次数 |

如果 `/bcxfix` 里显示「未生效 hook」，把控制台的 `[BCX-Supplement]` 日志发我，多半是 BC 又改版了。

---

## 七、发版流程（改完怎么让篡改猴自动更新）

篡改猴是靠脚本头部的 `@version` 判断要不要更新的，所以每次改动只要守住三步：

1. **改代码**：编辑 `bcx-supplement.user.js`。
2. **提升版本号**：把头部 `// @version      1.2.1` 改成 `1.2.2`（小修小补）或 `1.3.0`（加了新规则）。
   版本号必须按 `主.次.修订` 三段递增，**不变就不会更新**。
3. **推送**：

```bash
git add -A
git commit -m "fix: 修复 xxx"
git push
```

推送后最多 24 小时内（或手动点「检查用户脚本更新」）篡改猴就会拉到新版，刷新游戏页面生效。

如果要用命令行一键发版，可以装个 `npm` 脚本或用下面的小流程（改完直接跑）：

```bash
# 自动把 patch 号 +1，提交并推送
node -e "const fs=require('fs');const p='bcx-supplement.user.js';let s=fs.readFileSync(p,'utf8');s=s.replace(/@version\s+(\d+)\.(\d+)\.(\d+)/,(m,a,b,c)=>'@version      '+a+'.'+b+'.'+(+c+1));fs.writeFileSync(p,s);"
git commit -am "chore: bump version"
git push
```

### 中英文 README 必须同步

- `README.md` 是中文版，`README.en.md` 是英文版。**两份要一起改**：规则列表、配置键、行为说明、发版流程任一变动，都要在同一次提交里同步到两个文件。
- `CHANGELOG.md` 只保留一份（中文为主），纯文档改动也记一行。

`docs/BCX-rule-breakage-report.md` 是当初的排查报告，保留作为「为什么这么写」的依据，不参与运行。

---

## 八、规则不生效怎么查（以「头部有物品禁用表情消息」为例）

v1.2.2 起内置了自检命令，按这个顺序看（命令要敲在**游戏里的聊天输入框**，不是浏览器控制台——控制台里 `/` 会被当成正则开头，报 `Invalid regular expression`；控制台请用 `BCXSupplement.diag()`）：

1. **确认脚本版本**：篡改猴面板里必须是 `1.2.2`。1.1.x 拦的是脸上的表情图标，不是 `*文字`；1.2.0/1.2.1 有下面表里的两个坑。手动点一次「检查用户脚本更新」，或重开安装页装一次。
2. **确认 6 个 hook 全绿**：控制台搜 `[BCX-Supplement]`，最后一行应为 `已加载 v1.2.2：6/6 个 hook 生效`。
3. **聊天框敲 `/bcxfix emote`**，逐项对照：
   - `开关 …：关` → `/bcxfix on forbidEmoteWhileHeadOccupied`
   - `ChatRoomSendEmote hook：未挂载` → BC 又改版了，把控制台日志发出来
   - `ItemHead：InventoryGet=空，扫描=空` 且 `ItemHood` 也是空 → 戴的东西不在默认分组，看下一行「身上头部相关分组」，把那个分组用 `/bcxfix group <分组>` 加进来
   - `当前判定：不会拦截` → 就是上面某一条没满足
4. **戴着头饰发一条 `*waves`，再看 `/bcxfix emote` 的「已拦截 N 次」**：
   - N 变成 1 → 规则在工作。若还是看到消息发出去了，说明有别的东西在替你发（宏、换行发送、别的 mod）
   - N 还是 0 → 消息根本没走 `ChatRoomSendEmote`（常见于 WCE 这类接管聊天框的 mod）→ `/bcxfix on emoteBlockAtProtocol` 再试

v1.2.2 修掉的两个问题，表现都是「完全没反应、控制台也不报错」：

| 问题 | 原因 | 修法 |
|---|---|---|
| 跨家族物品判不出来 | `InventoryGet` 内部还要求 `Group.Family === Player.AssetFamily`（`Inventory.js:681`），中立/跨家族头饰会被判成「没戴」 | 改成「先官方 API，取不到再直接扫 `Player.Appearance`」，不再比对家族 |
| SDK 已存在时脚本自己崩掉 | `waitForSdk()` 原先在文件靠前处调用，`bcModSdk` 已存在时会同步执行 `boot()`，此时后面 `let` 声明的状态还在 TDZ，hook 一触发就 `ReferenceError`，整个脚本不加载 | `waitForSdk()` 移到文件末尾，状态全部初始化后再启动 |
