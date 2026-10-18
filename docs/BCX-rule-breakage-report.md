# BCX 规则失效调查报告（BC R133 / BCX 1.1.22）

调查时间：2026-10-18  
环境：BC R133 + BCX 1.1.22-32487e62  
数据来源：BC 官方仓库（gitgud.io/BondageProjects/Bondage-College）CHANGELOG 与源码、BCX master 源码、GitHub issue 检索

---

## 一、`alt_hide_friends`（Hide online friends if blind）

### 结论
自 **R128** 起该规则完全失效。原因不是 BCX 设置或权限问题，而是 BC 把好友列表改成了「操作菜单」结构，规则依赖的 DOM 选择器再也匹配不到任何元素。

### 代码对比

BCX `src/rules/bc_alter.ts`（当前 master，即 1.1.22）：

```ts
hookFunction("FriendListLoadFriendList", 1, (args, next) => {
    const ret = next(args);
    const allowList = state.customData?.allowedMembers;
    if (state.isEnforced && allowList && Player.GetBlindLevel() >= 3) {
        document.querySelectorAll(".friend-list-row").forEach(row => {
            const memberNumberEl = row.querySelector(".MemberNumber");
            const memberNameEl = row.querySelector(".MemberName");
            const beepButton = row.querySelector<HTMLButtonElement>("button.fl-online-friends-content");
            if (!memberNumberEl || !memberNameEl || !beepButton) {
                return;                       // ← R128 之后每一行都在这里 return
            }
            ...
        });
    }
    return ret;
});
```

BC R128 之前（2026-04-01 的 FriendList.js:891-903），每一行确实有一个带该 class 的 `<button>`：

```js
ElementButton.Create(`friend-list-beep-${friend.memberNumber}`, () => FriendListBeep(friend.memberNumber), { noStyling: true },
    { button: { classList: ['friend-list-column', 'friend-list-link', 'mode-specific-content', 'fl-online-friends-content'], ... }})
```

BC R133（FriendList.js:2394-2420）改成「••• 操作菜单」，class 落在 `<td>` 上，行内按钮只剩 `friend-list-actions-button` 与读取蜂鸣用的 `fl-beeps-content`（两者都不带 `fl-online-friends-content`）：

```js
return ElementCreate({
    tag: "td",
    classList: ['friend-list-column', 'mode-specific-content', 'fl-all-friends-content', 'fl-online-friends-content'],
    children: [{ tag: "div", classList: ["friend-list-actions-wrapper"], children: [
        ElementButton.Create(buttonId, ..., { button: { classList: ['friend-list-actions-button', 'friend-list-link'] }}) ...
```

即 `row.querySelector("button.fl-online-friends-content") === null` → 规则静默失效（无报错、无日志）。

### 版本定位
BC CHANGELOG `[R128]` 条目：`Deep - add action menu to friendlist (#6270)`。  
BCX 相关文件自 2026-05-27 起未再修改该规则，直至 v1.1.22（2026-10-17）仍使用旧选择器。

### 是否有人报告
GitHub issue 检索（`blind` / `friend` / `friendlist` / `beep` / `fl-online-friends-content` / `hide`）：
- 没有任何 issue 提到这条规则；
- 只有三条相关但不同的记录：
  - #67（已关闭 2026-05-24）"restrict sending beep messages"/"forbid looking at room admin UI" 不生效；
  - #71（已关闭 2026-05-27）"Fix the beep send rule"，修的是 `ChatRoomActionMessage` 层面的 beep 发送；
  - #80（open 2026-08-26）antigarble / partial hearing 失效。

=> 属于**无人上报的遗漏**，需要自己提 issue。

---

## 二、可直接提交的 issue 草稿（英文）

> **Title:** `alt_hide_friends` silently does nothing on R128+ (friend list rows no longer contain `button.fl-online-friends-content`)
>
> **Body:**
>
> The "Hide online friends if blind" rule (`alt_hide_friends`) no longer has any effect on current BC (tested on R133 with BCX 1.1.22 / 32487e62).
>
> `load()` hooks `FriendListLoadFriendList` and then walks every `.friend-list-row`, requiring three children:
>
> ```ts
> const memberNumberEl = row.querySelector(".MemberNumber");
> const memberNameEl = row.querySelector(".MemberName");
> const beepButton = row.querySelector<HTMLButtonElement>("button.fl-online-friends-content");
> if (!memberNumberEl || !memberNameEl || !beepButton) return;
> ```
>
> Since R128 (`add action menu to friendlist`, BC !6270) the per-row beep button was replaced by the "•••" actions menu. In R133, `FriendListCreateActionsCell()` puts `fl-online-friends-content` on the `<td>` wrapper, and the only `<button>` inside a row is `friend-list-actions-button`. `row.querySelector("button.fl-online-friends-content")` is therefore always `null`, and the rule bails out for every row — no masking, no beep blocking, no console error.
>
> Suggested fix:
> - drop the dependency on that button entirely (mask `.MemberName`/`.MemberNumber` on every row);
> - block beeps through `FriendListGetAvailableActions()` (filter out the action whose `id === "beep"` from `FriendListActionDefinitions`) and/or `FriendListBeep()`, instead of disabling a button.
>
> Verified against: BC R133 `Screens/Character/FriendList/FriendList.js` (`FriendListLoadFriendList`, `FriendListCreateActionsCell`, `FriendListGetAvailableActions`).

---

## 三、R133 上其它已失效 / 部分失效的规则（静态核查）

判定方法：从 BCX 源码中提取每条规则 `hookFunction()` 的目标函数，在完整的 R133 脚本集合中统计「定义」与「调用点」。调用点为 0 的 hook 永远不会触发，规则即使勾选也不会产生任何效果。

| BCX 规则 | 规则 ID | 依赖的 hook 目标 | R133 状态 | 结论 |
|---|---|---|---|---|
| Hide online friends if blind | `alt_hide_friends` | DOM `button.fl-online-friends-content` | 选择器不存在 | 完全失效（R128 起） |
| Partial hearing | `speech_partial_hearing` | `SpeechGarble` | 仅有定义，0 调用点（已被 `SpeechTransformProcess` 取代，`@deprecated`） | 完全失效（issue #80 已确认） |
| Hearing whitelist | `alt_hearing_whitelist` | `SpeechGarble` | 同上 | 完全失效 |
| Limit bound admin power | `alt_room_admin_limit` | `ChatRoomAdminAction` | 0 调用点（管理操作改走新的 DOM 角色菜单） | 阻止部分失效 |
| Forbid getting new lovers | `rc_lover_new` | `ChatRoomLovershipOptionIs` | 0 调用点 | 完全失效 |
| Forbid taking new submissives | `rc_sub_new` | `ChatRoomOwnershipOptionIs` | 0 调用点 | 完全失效 |
| Forbid disowning submissives | `rc_sub_leave` | `ChatRoomIsOwnedByPlayer` | 0 调用点 | 完全失效 |
| Forbid club owner changes | `rc_club_owner` | `ChatRoomOwnershipOptionIs` + `ManagementCanBeReleased*` 等 | 部分为 0 调用点 | 部分失效 |
| Restrict entering rooms | `block_entering_rooms` | 文本补丁 `ChatSearchCreateGridRoom` 中 `const hasTooltip = ...` | 目标字符串已不存在 | 仅「被屏蔽房间的提示」失效，拦截本身仍生效（`ChatSearchJoin` hook 有效） |

另有两个已知但尚未修复的上游 issue：
- #80（open）：antigarble 命令 + partial hearing 失效，根因同上（`SpeechGarble` 弃用）。
- #77（open）：Block OOC 对悄悄话（whisper）无效。

---

## 四、本地临时修复（ModSDK 控制台片段）

在浏览器控制台执行，可让该规则在本次会话内恢复（刷新后需重放）：

```js
const m = bcModSdk.registerMod({ name: "altHideFriendsFix", fullName: "Hide online friends if blind (fix)", version: "1.0.0", repository: "local" });

// 1) 失明时遮罩名字 / 编号
m.hookFunction("FriendListLoadFriendList", 1, (args, next) => {
  const ret = next(args);
  if (Player.GetBlindLevel() >= 3) {
    document.querySelectorAll(".friend-list-row").forEach(row => {
      const num = row.querySelector(".MemberNumber");
      const name = row.querySelector(".MemberName");
      if (!num || !name) return;
      num.textContent = "######";
      name.textContent = "Someone";
    });
  }
  return ret;
});

// 2) 失明时从「•••」菜单里移除发送蜂鸣的选项
m.hookFunction("FriendListGetAvailableActions", 10, (args, next) => {
  const actions = next(args);
  return Player.GetBlindLevel() >= 3 ? actions.filter(a => a.id !== "beep") : actions;
});
```

局限：不读取规则内的白名单（`allowedMembers`），需要白名单时把 `Player.GetBlindLevel() >= 3` 换成自己的成员编号判断。

---

## 五、补充插件

针对上表所有「完全失效 / 部分失效」的规则，已写好一个独立的 BC mod（不修改 BCX 本体）：

- `bcx-supplement.user.js` —— 篡改猴/暴力猴脚本，也可用 FUSAM 的 `?fusam=...&fusamType=eval` 加载
- `bcx-supplement-README.md` —— 安装、配置与自测清单

实现方式：hook 的目标换成 R133 里**仍在被调用**的函数

| 修复项 | hook 目标 | 说明 |
|---|---|---|
| 失明隐藏好友 | `FriendListLoadFriendList` + `FriendListGetAvailableActions` | 直接改表格单元格；从「•••」菜单移除 `beep` |
| 部分听力 / 听力白名单 | `SpeechTransformProcess` | 逐词调用 `SpeechTransformGagGarble` 重建，不依赖已废弃的 `SpeechGarble` |
| 5 条关系规则 | `ServerSend` | 拦 `AccountOwnership` / `AccountLovership` 的 `Propose` / `Accept` / `Release` / `Break` |
| 束缚限制管理 | `ServerSend` | 拦 `ChatRoomAdmin` 中除 `Kick` / `Ban` 外的动作 |
| **新增**：头部栏有物品时禁止发送表情消息 | `ChatRoomSendEmote` | BCX 没有这条规则；`*文字` / `/me` / `/action` / `/attempt` / `:文字` 全部收敛到该函数（`ChatRoom.js:3500`），拦下并向房间发一条 `Emote` 公告（`"<昵称>" tries to send an emotion, but failed due to he/she's in a mask`） |

补充包是全局开关，不读取 BCX 规则里的 per-target 条件与白名单，需要在 `/bcxfix` 里单独配置。

自定义规则的判定与公告细节：

- 判定：`InventoryGet(Player, "ItemHead")` 非空（衣柜 Head 栏有任何物品）。
- 拦的是**表情消息**（聊天内容，接收端 `Type: "Emote"`），不是脸上的表情图标（facial expression），后者完全不受影响。
- 不在 `ServerSend` 兜底拦 `Emote`：`WheelFortune.js:904/944/957` 有 3 处游戏自带的转盘旁白，会被误伤。
- 公告用 `Type: "Emote"`：R133 收到 `Action` 会拿 `Content` 去 `TextQueryMultiple` 查本地化表，自定义文本会变成 `⚠️MISSING TEXT`；`Emote` 不查表。内容以 `*` 开头，接收端就不会再在句首补发送者名字。

---

## 六、参考链接

- BCX 仓库：https://github.com/Jomshir98/bondage-club-extended
- BCX issue #67 / #71 / #80 / #77
- BC 仓库：https://gitgud.io/BondageProjects/Bondage-College
- BC CHANGELOG `[R128]`：`add action menu to friendlist (#6270)`
