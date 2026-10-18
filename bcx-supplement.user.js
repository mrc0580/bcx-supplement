// ==UserScript==
// @name         BC · BCX 失效规则补充包 (R133)
// @namespace    bcx-supplement.local
// @version      2.0.0
// @description  补回 BCX (Bondage Club Extended) 在 BC R133 上已失效的规则：失明时隐藏在线好友、部分听力/听力白名单、关系控制、束缚时限制管理员权限；另附自定义规则「头部栏有物品时禁止发送表情消息」。v2.0 提供可视化设置面板，每条规则可单独开关（偏好设置 → 扩展，或屏幕右侧悬浮按钮）
// @author       mrc0580
// @match        https://www.bondageprojects.elementfx.com/*
// @match        https://bondageprojects.elementfx.com/*
// @match        https://bondage-club.com/*
// @match        https://www.bondage-club.com/*
// @updateURL    https://mrc0580.github.io/bcx-supplement/bcx-supplement.user.js
// @downloadURL  https://mrc0580.github.io/bcx-supplement/bcx-supplement.user.js
// @supportURL   https://github.com/mrc0580/bcx-supplement/issues
// @homepageURL  https://github.com/mrc0580/bcx-supplement
// @run-at       document-start
// @grant        none
// ==/UserScript==

/**
 * 说明
 * ---------------------------------------------------------------------------
 * BCX 1.1.22 里有若干规则 hook 的函数在 BC R133 上已经不再被调用，
 * 或者依赖的 DOM 结构已经改版，导致规则勾选后毫无效果。本脚本作为
 * 「补充包」，用 bcModSdk 重新实现这些规则的核心行为，不修改 BCX 本体。
 *
 * 用到的 hook 目标全部在 R133 上验证过存在且仍在被调用：
 *   FriendListLoadFriendList / FriendListGetAvailableActions  → 好友列表（DOM）
 *   SpeechTransformProcess                                    → 语音模糊（取代 SpeechGarble）
 *   ServerSend                                                → 关系变更与房间管理协议
 *   ChatRoomSendEmote                                         → 表情消息（自定义规则用）
 *
 * 配置保存在 localStorage，可在聊天框用 /bcxfix 查看与切换，
 * 也可以在控制台用 BCXSupplement.config 直接改（改完调用 BCXSupplement.save()）。
 */

(function () {
	"use strict";

	const TAG = "[BCX-Supplement]";
	const CFG_KEY = "bcx-supplement.config.v1";
	const MOD_VERSION = "2.0.0";

	/** 默认配置：全部开启，白名单为空 */
	const DEFAULTS = {
		// 1) Hide online friends if blind
		hideFriendsWhenBlind: true,
		friendsVisible: [], // 失明时仍可见的成员编号

		// 2) Partial hearing / Hearing whitelist
		partialHearing: true,
		partialHearingRandom: true, // 每个词 25% 概率听懂
		partialHearingWords: [], // 永远听得懂的词
		hearingWhitelist: true,
		hearingWhitelistMembers: [], // 语音永远听得懂的成员
		hearingWhitelistIgnoreGagged: false, // 对方被堵嘴时是否也听得懂

		// 3) 关系控制（对应 BCX 的 rc_* 规则）
		forbidNewOwner: true, // Forbid club owner changes（含离开主人）
		forbidNewSub: true, // Forbid taking new submissives
		forbidReleaseSub: true, // Forbid disowning submissives
		forbidNewLover: true, // Forbid getting new lovers
		forbidBreakLover: true, // Forbid breaking up with lovers

		// 4) Limit bound admin power
		limitAdminWhileRestrained: true,

		// 5) 自定义新增规则：头部栏（ItemHead）有物品时禁止发送「表情消息」
		//    注意是表情消息（聊天里 * 开头的 Emote 消息），不是脸上的表情图标
		forbidEmoteWhileHeadOccupied: true,
		// 哪些装备分组算「头部栏」。ItemHead 是衣柜的 Head 栏，ItemHood 是头套
		// （很多面具/头罩其实是 hood，v1.2.3 起两者默认都算）；
		// 其它分组可以用 /bcxfix group 加进来
		emoteBlockGroups: ["ItemHead", "ItemHood"],
		// 配置结构版本，用来做一次性迁移
		configVersion: 2,
		// {name} / $name 会被替换成昵称（没有昵称就用账号名）
		emoteNoticeMessage: '"$name" tries to send an emotion, but failed due to he/she\'s in a mask',
		emoteNoticeCooldownMs: 1500,
		// 被拦下时把原文留在输入框里，省得玩家重打一遍
		emoteKeepInputText: true,
		// 协议层兜底：有些聊天增强 mod（WCE 等）会绕过 ChatRoomSendEmote 直接发消息，
		// 打开这个开关后在 ServerSend 再堵一道（默认关，避免误伤游戏自带旁白）
		emoteBlockAtProtocol: false,

		// 界面：屏幕右侧的悬浮按钮（点开设置面板）。可以关掉，改用偏好设置里的入口。
		uiFloatingButton: true,
	};

	// ---------------------------------------------------------------------
	// 规则清单（v2.0 的单一数据源）
	//
	// 设置面板、/bcxfix 状态、开关列表全部从这里生成，加规则只要在这里加一项：
	//   key    配置键（DEFAULTS 里的同名键）
	//   group  所属分类（RULE_GROUPS 的 id）
	//   zh/en  规则名（en 对应 BCX 里的原规则名，方便对照）
	//   desc   一句话说明
	//   fields 该规则的子参数（开关 / 数字 / 文本 / 列表）
	// ---------------------------------------------------------------------

	const RULE_GROUPS = [
		{ id: "vision", zh: "好友与视觉", en: "Friends & Vision" },
		{ id: "speech", zh: "听力", en: "Hearing" },
		{ id: "relation", zh: "关系控制", en: "Relationships" },
		{ id: "room", zh: "房间管理", en: "Room admin" },
		{ id: "emote", zh: "表情消息（自定义）", en: "Emotes (custom)" },
		{ id: "general", zh: "通用", en: "General" },
	];

	const RULES = [
		{
			key: "hideFriendsWhenBlind",
			group: "vision",
			zh: "失明时隐藏在线好友",
			en: "Hide online friends if blind",
			bcx: "alt_hide_friends",
			desc: "完全失明时把好友列表的昵称与编号遮成 Someone / ######，并去掉「发送蜂鸣」动作。",
			fields: [
				{
					key: "friendsVisible",
					type: "list",
					numeric: true,
					zh: "例外成员编号",
					en: "Exceptions (member numbers)",
					hint: "依然可见的成员，用逗号或空格分隔，例如 12345, 67890",
				},
			],
		},
		{
			key: "partialHearing",
			group: "speech",
			zh: "部分听力",
			en: "Partial hearing",
			bcx: "speech_partial_hearing",
			desc: "失聪时不再全部听不懂：部分词仍能听清（默认每个词 25% 概率听懂，另有固定可懂词表）。",
			fields: [
				{ key: "partialHearingRandom", type: "switch", zh: "随机听懂 25%", en: "Random 25% understood" },
				{
					key: "partialHearingWords",
					type: "list",
					zh: "永远听得懂的词",
					en: "Always understood words",
					hint: "用逗号分隔，例如 hello, please, stop",
				},
			],
		},
		{
			key: "hearingWhitelist",
			group: "speech",
			zh: "听力白名单",
			en: "Hearing whitelist",
			bcx: "alt_hearing_whitelist",
			desc: "白名单里的成员对你说话时，即使你失聪也能完全听懂。",
			fields: [
				{
					key: "hearingWhitelistMembers",
					type: "list",
					numeric: true,
					zh: "白名单成员编号",
					en: "Whitelisted member numbers",
					hint: "用逗号分隔，例如 12345, 67890",
				},
				{
					key: "hearingWhitelistIgnoreGagged",
					type: "switch",
					zh: "对方被堵嘴时也听得懂",
					en: "Understand even when the speaker is gagged",
				},
			],
		},
		{
			key: "forbidNewOwner",
			group: "relation",
			zh: "禁止换 / 离开主人",
			en: "Forbid club owner changes",
			bcx: "rc_owner_change",
			desc: "不接受新的主人，也不主动解除与现任主人的关系（试用期转正不受影响）。",
		},
		{
			key: "forbidNewSub",
			group: "relation",
			zh: "禁止收新的 sub",
			en: "Forbid taking new submissives",
			bcx: "rc_take_sub",
			desc: "不向别人发出收 sub 的请求（已成为你的试用 sub 的转正请求仍然允许）。",
		},
		{
			key: "forbidReleaseSub",
			group: "relation",
			zh: "禁止放弃 sub",
			en: "Forbid disowning submissives",
			bcx: "rc_release_sub",
			desc: "不允许自己主动释放已有的 sub。",
		},
		{
			key: "forbidNewLover",
			group: "relation",
			zh: "禁止新的恋人",
			en: "Forbid getting new lovers",
			bcx: "rc_new_lover",
			desc: "不接受新的恋人关系（已与你互为恋人的求婚/升级仍然允许）。",
		},
		{
			key: "forbidBreakLover",
			group: "relation",
			zh: "禁止与恋人分手",
			en: "Forbid breaking up with lovers",
			bcx: "rc_break_lover",
			desc: "不允许主动与恋人解除关系。",
		},
		{
			key: "limitAdminWhileRestrained",
			group: "room",
			zh: "束缚时限制管理权限",
			en: "Limit bound admin power",
			bcx: "alt_room_admin_limit",
			desc: "被束缚时不能执行房间管理操作（踢人 / 封禁除外）。",
		},
		{
			key: "forbidEmoteWhileHeadOccupied",
			group: "emote",
			zh: "头部有物品时禁止发送表情消息",
			en: "Forbid emote messages while the head slot is occupied",
			bcx: "（本补充包新增，BCX 没有）",
			desc: "头上戴着面具/头套时，用 *文字、/me、:文字 等方式发出的表情消息会被拦下，并向房间公告。",
			fields: [
				{
					key: "emoteBlockGroups",
					type: "list",
					zh: "算作「头部」的装备分组",
					en: "Groups treated as the head slot",
					hint: "默认 ItemHead（Head 栏）与 ItemHood（头套），用逗号分隔",
				},
				{
					key: "emoteNoticeMessage",
					type: "text",
					zh: "拦截公告",
					en: "Blocked announcement",
					hint: "$name 或 {name} 会替换成你的昵称；留空则不公告",
				},
				{
					key: "emoteNoticeCooldownMs",
					type: "number",
					zh: "公告冷却（毫秒）",
					en: "Announcement cooldown (ms)",
					hint: "避免连续发送时刷屏，0 表示不限制",
				},
				{
					key: "emoteKeepInputText",
					type: "switch",
					zh: "被拦下时把文字留在输入框",
					en: "Keep the text in the input box",
				},
				{
					key: "emoteBlockAtProtocol",
					type: "switch",
					zh: "协议层兜底（其它聊天 mod 绕过时用）",
					en: "Protocol-level backstop",
				},
			],
		},
		{
			key: "uiFloatingButton",
			group: "general",
			zh: "显示屏幕悬浮按钮",
			en: "Show floating button",
			bcx: "（本补充包新增）",
			desc: "屏幕右侧显示一个 BCX 按钮，点开这个设置面板。关掉后可以从「偏好设置 → 扩展」进入。",
		},
	];

	// ---------------------------------------------------------------------
	// 配置读写
	// ---------------------------------------------------------------------

	function loadConfig() {
		try {
			const raw = localStorage.getItem(CFG_KEY);
			if (!raw) return Object.assign({}, DEFAULTS);
			const parsed = JSON.parse(raw);
			const merged = Object.assign({}, DEFAULTS);
			if (parsed && typeof parsed === "object") {
				for (const key of Object.keys(DEFAULTS)) {
					if (key in parsed) merged[key] = parsed[key];
				}
				// v1.1.0 用的是「表情图标」相关的键名，迁移过来
				if ("forbidEmotionWhileHeadOccupied" in parsed)
					merged.forbidEmoteWhileHeadOccupied = parsed.forbidEmotionWhileHeadOccupied;
				if ("emotionNoticeMessage" in parsed) merged.emoteNoticeMessage = parsed.emotionNoticeMessage;
				if ("emotionNoticeCooldownMs" in parsed) merged.emoteNoticeCooldownMs = parsed.emotionNoticeCooldownMs;

				// v1.2.3：默认监控分组从 ["ItemHead"] 扩到 ["ItemHead","ItemHood"]。
				// 只在「还是旧默认值」时升级，用户自己改过的列表保持不动。
				const storedGroups = parsed.emoteBlockGroups;
				const isOldDefault =
					!Array.isArray(storedGroups) ||
					(storedGroups.length === 1 && String(storedGroups[0]) === "ItemHead");
				if (isOldDefault && !(Number(parsed.configVersion) >= 2)) {
					merged.emoteBlockGroups = DEFAULTS.emoteBlockGroups.slice();
				}
				merged.configVersion = DEFAULTS.configVersion;
			}
			return merged;
		} catch (err) {
			console.warn(TAG, "配置读取失败，使用默认值：", err);
			return Object.assign({}, DEFAULTS);
		}
	}

	const config = loadConfig();

	function saveConfig() {
		try {
			localStorage.setItem(CFG_KEY, JSON.stringify(config));
		} catch (err) {
			console.warn(TAG, "配置保存失败：", err);
		}
	}

	// ---------------------------------------------------------------------
	// 小工具（全部做存在性检查，避免版本差异把整个脚本带崩）
	// ---------------------------------------------------------------------

	const failures = [];

	function logErr(where, err) {
		console.warn(`${TAG} ${where} 出错：`, err);
	}

	/** 在聊天室时顺带发一条本地消息，否则只写控制台（同一句 3 秒内不重复） */
	let lastNotify = { msg: "", at: 0 };
	function notify(msg, timeout = 6000) {
		const now = Date.now();
		if (msg === lastNotify.msg && now - lastNotify.at < 3000) return;
		lastNotify = { msg, at: now };
		console.info(`${TAG} ${msg}`);
		try {
			if (typeof window.ChatRoomSendLocal === "function" && window.ChatRoomData) {
				window.ChatRoomSendLocal(`[BCX补充] ${msg}`, timeout);
			}
		} catch (err) {
			/* 忽略：不在聊天室或界面未就绪 */
		}
	}

	function player() {
		return window.Player || null;
	}

	function blindLevel() {
		try {
			const P = player();
			return P && typeof P.GetBlindLevel === "function" ? P.GetBlindLevel() : 0;
		} catch (err) {
			return 0;
		}
	}

	function asNumberSet(list) {
		const set = new Set();
		(Array.isArray(list) ? list : []).forEach((value) => {
			const num = Number(value);
			if (Number.isFinite(num)) set.add(num);
		});
		return set;
	}

	function characterByNumber(memberNumber) {
		const num = Number(memberNumber);
		if (!Number.isFinite(num)) return null;
		try {
			const list = window.ChatRoomCharacter;
			if (!Array.isArray(list)) return null;
			return list.find((c) => Number(c && c.MemberNumber) === num) || null;
		} catch (err) {
			return null;
		}
	}

	// ---------------------------------------------------------------------
	// 引导：等 bcModSdk 就绪后注册 mod 并打补丁
	// ---------------------------------------------------------------------

	let mod = null;
	const hooks = [];

	/**
	 * 解析 hook 目标，支持 ModSDK 的点号路径（如 DialogSelfMenuMapping.Expression._ClickButton）。
	 * ModSDK 自己会写回所属对象的属性，所以这里只需要能取到当前值来判断"是否已经存在"。
	 */
	function resolveTarget(name) {
		const parts = String(name).split(".");
		let owner = window;
		for (let i = 0; i < parts.length - 1; i++) {
			owner = owner == null ? undefined : owner[parts[i]];
		}
		const key = parts[parts.length - 1];
		return { owner, key, value: owner == null ? undefined : owner[key] };
	}

	/**
	 * 注册 hook。BC 的脚本是按顺序同步加载的，bcModSdk 出现时
	 * Screens/*.js 里的函数可能还没定义，所以这里做「延迟挂钩」：
	 * 目标函数出现之前每 500ms 重试一次，最多等 60 秒。
	 */
	function hook(name, priority, fn, owner) {
		const record = { target: name, owner, ok: false, error: null };
		hooks.push(record);

		const attach = (attempt) => {
			if (typeof resolveTarget(name).value !== "function") {
				if (attempt >= 120) {
					record.error = "等待目标函数超时";
					failures.push(`${name}（${owner}）：等待目标函数超时`);
					console.warn(`${TAG} ✗ ${name} 60 秒内未出现，跳过（${owner}）`);
					return;
				}
				setTimeout(() => attach(attempt + 1), 500);
				return;
			}
			try {
				mod.hookFunction(name, priority, fn);
				record.ok = true;
				console.log(`${TAG} ✓ hooked ${name}  (${owner})`);
			} catch (err) {
				record.error = String(err && err.message ? err.message : err);
				failures.push(`${name}（${owner}）：${record.error}`);
				console.warn(`${TAG} ✗ hook ${name} 失败（${owner}）：`, err);
			}
		};

		attach(0);
	}

	function boot() {
		if (!window.bcModSdk || typeof window.bcModSdk.registerMod !== "function") return false;
		if (mod) return true;

		try {
			mod = window.bcModSdk.registerMod({
				name: "BCXSupplement",
				fullName: "BCX 失效规则补充包",
				version: MOD_VERSION,
				repository: "local",
			});
		} catch (err) {
			console.warn(`${TAG} registerMod 失败：`, err);
			return true; // 不再重试，避免刷屏
		}

		installFriendFixes();
		installSpeechFixes();
		installProtocolFixes();
		installEmoteFix();
		installEmoteProtocolBackstop();
		registerCommand();
		installUi();

		window.BCXSupplement = {
			version: MOD_VERSION,
			config,
			save: saveConfig,
			status: () => ({ hooks: hooks.slice(), config: Object.assign({}, config) }),
			notify,
			rules: () => RULES.map((rule) => Object.assign({}, rule)),
			// 打开 / 关闭设置面板（控制台与 /bcxfix ui 都用这个）
			openSettings,
			closeSettings,
			// 调试用：手动触发好友列表遮罩 / 还原
			maskFriendList,
			unmaskFriendList,
			// 控制台用：BCXSupplement.diag() 打印表情规则自检
			diag: () => {
				const lines = emoteDiagnostics();
				console.log(lines.join("\n"));
				return lines;
			},
		};

		// 延迟汇总：hook 是「函数出现后再挂」的，立刻统计会全是 pending
		setTimeout(() => {
			const okCount = hooks.filter((h) => h.ok).length;
			console.log(
				`${TAG} 已加载 v${MOD_VERSION}：${okCount}/${hooks.length} 个 hook 生效` +
					(failures.length ? `；失败/待定：${failures.join("；")}` : "")
			);
			if (failures.length) console.warn(`${TAG} 部分修复可能不可用（多半是 BC 版本差异）：`, failures);
		}, 3000);
		return true;
	}

	let bootTimer = null;
	let waited = 0;
	function waitForSdk() {
		if (boot()) return;
		waited += 500;
		if (waited > 5 * 60 * 1000) {
			console.warn(`${TAG} 等待 bcModSdk 超时，脚本未生效。`);
			return;
		}
		bootTimer = setTimeout(waitForSdk, 500);
	}
	// 注意：waitForSdk() 的调用放在文件末尾（见最后一行）。
	// boot() 在 bcModSdk 已经存在时会「同步」执行，如果这里立刻调用，
	// 后面用 let 声明的状态（lastEmoteNotice 等）还处于 TDZ，hook 一旦被
	// 触发就会抛 ReferenceError 把整个脚本带崩。放到末尾可彻底避免。

	// ---------------------------------------------------------------------
	// 修复 1：Hide online friends if blind
	//   BCX 依赖 button.fl-online-friends-content，R128 起该按钮不存在
	//   → 改为直接处理表格行 + 过滤「发送蜂鸣」动作
	// ---------------------------------------------------------------------

	function friendAllowed(memberNumber) {
		const num = Number(memberNumber);
		if (!Number.isFinite(num)) return false;
		return asNumberSet(config.friendsVisible).has(num);
	}

	/** 是否要对该成员隐藏信息 */
	function shouldHideFriend(memberNumber) {
		if (!config.hideFriendsWhenBlind) return false;
		if (blindLevel() < 3) return false;
		return !friendAllowed(memberNumber);
	}

	function maskFriendList() {
		if (!config.hideFriendsWhenBlind || blindLevel() < 3) return;
		const allowed = asNumberSet(config.friendsVisible);
		document.querySelectorAll(".friend-list-row").forEach((row) => {
			const nameCell = row.querySelector("td.MemberName, .MemberName");
			const numberCell = row.querySelector("td.MemberNumber, .MemberNumber");
			if (!nameCell || !numberCell) return;

			// 记住原始编号：遮罩之后 textContent 就只剩 ###### 了
			if (!numberCell.dataset.bcxMemberNumber) {
				const raw = (numberCell.textContent || "").replace(/[^\d]/g, "");
				if (raw) numberCell.dataset.bcxMemberNumber = raw;
			}
			// 名字也留一份，关掉规则时用来还原（Player.FriendNames 取不到时兜底）
			if (!nameCell.dataset.bcxName && nameCell.textContent !== "Someone") {
				nameCell.dataset.bcxName = nameCell.textContent || "";
			}
			const memberNumber = Number(numberCell.dataset.bcxMemberNumber);
			if (Number.isFinite(memberNumber) && allowed.has(memberNumber)) return;

			if (nameCell.textContent !== "Someone") nameCell.textContent = "Someone";
			if (numberCell.textContent !== "######") numberCell.textContent = "######";
			row.dataset.bcxMasked = "1";
		});
	}

	function installFriendFixes() {
		hook(
			"FriendListLoadFriendList",
			2,
			(args, next) => {
				const ret = next(args);
				try {
					maskFriendList();
				} catch (err) {
					logErr("好友列表遮罩", err);
				}
				return ret;
			},
			"alt_hide_friends"
		);

		// 「•••」菜单里去掉发送蜂鸣（对应 BCX 里禁用 beep 按钮的行为）
		hook(
			"FriendListGetAvailableActions",
			10,
			(args, next) => {
				const actions = next(args);
				try {
					const friend = args[0] || {};
					if (Array.isArray(actions) && shouldHideFriend(friend.memberNumber)) {
						return actions.filter((action) => action && action.id !== "beep");
					}
				} catch (err) {
					logErr("好友动作过滤", err);
				}
				return actions;
			},
			"alt_hide_friends"
		);
	}

	// ---------------------------------------------------------------------
	// 修复 2：Partial hearing / Hearing whitelist
	//   BCX hook 的 SpeechGarble 在 R133 已无调用点（改用 SpeechTransformProcess）
	// ---------------------------------------------------------------------

	function speakerCannotTalk(C) {
		try {
			return !!(C && typeof C.CanTalk === "function" && !C.CanTalk());
		} catch (err) {
			return false;
		}
	}

	/**
	 * 逐词重建模糊文本：命中白名单 / 随机听懂的词保留原文，其余单独模糊。
	 * 不能直接对返回结果做替换——高强度模糊会把部分字母变成空格，
	 * 原始文本和模糊结果的词数不一致，按位置对齐会错位。
	 */
	function rebuildWithPartialHearing(C, originalText, ignoreOOC) {
		if (typeof window.SpeechTransformGagGarble !== "function") return null;
		const intensity =
			typeof window.SpeechTransformDeafenIntensity === "function" ? window.SpeechTransformDeafenIntensity(C) : 0;
		if (!(intensity > 0)) return null;

		const words = new Set(
			(Array.isArray(config.partialHearingWords) ? config.partialHearingWords : [])
				.map((word) => String(word).toLowerCase())
				.filter(Boolean)
		);

		return originalText.replace(/\([^)]+\)?|\p{L}+/gu, (word) => {
			if (word.startsWith("(")) return word; // 跳过 OOC 括号内容
			const bare = word.toLowerCase();
			if ((config.partialHearingRandom && Math.random() < 0.25) || words.has(bare)) return word;
			return window.SpeechTransformGagGarble(word, intensity, ignoreOOC);
		});
	}

	function installSpeechFixes() {
		hook(
			"SpeechTransformProcess",
			5,
			(args, next) => {
				const ret = next(args);
				try {
					const C = args[0];
					const originalText = args[1];
					const effects = args[2];

					if (!Array.isArray(effects) || !effects.includes("deafen")) return ret;
					if (!ret || typeof ret.text !== "string" || typeof originalText !== "string") return ret;

					const appliedEffects = Array.isArray(ret.effects) ? ret.effects : [];
					// 只处理「纯粹因为失聪而模糊」的情形；说话者自己也模糊时不动
					if (!appliedEffects.includes("deafen")) return ret;
					if (appliedEffects.some((effect) => effect !== "deafen")) return ret;

					const senderNumber = Number(C && C.MemberNumber);
					const muted = speakerCannotTalk(C);

					// 2a) 听力白名单：完全听懂
					if (
						config.hearingWhitelist &&
						Number.isFinite(senderNumber) &&
						asNumberSet(config.hearingWhitelistMembers).has(senderNumber)
					) {
						if (config.hearingWhitelistIgnoreGagged || !muted) {
							return Object.assign({}, ret, { text: originalText });
						}
					}

					// 2b) 部分听力
					if (!config.partialHearing) return ret;
					if (muted) return ret; // 与 BCX 默认一致：不还原被堵嘴者的语音

					const rebuilt = rebuildWithPartialHearing(C, originalText, args[3] === true);
					return rebuilt == null ? ret : Object.assign({}, ret, { text: rebuilt });
				} catch (err) {
					logErr("部分听力", err);
					return ret;
				}
			},
			"speech_partial_hearing + alt_hearing_whitelist"
		);
	}

	// ---------------------------------------------------------------------
	// 修复 3：关系控制 + 房间管理限制
	//   BCX hook 的 ChatRoomOwnershipOptionIs / ChatRoomLovershipOptionIs /
	//   ChatRoomIsOwnedByPlayer / ChatRoomAdminAction 在 R133 已无调用点
	//   → 改在协议层 ServerSend 上拦截
	// ---------------------------------------------------------------------

	function lovershipWith(memberNumber) {
		const num = Number(memberNumber);
		if (!Number.isFinite(num)) return null;
		try {
			const list = player() && player().Lovership;
			if (!Array.isArray(list)) return null;
			return list.find((entry) => entry && Number(entry.MemberNumber) === num) || null;
		} catch (err) {
			return null;
		}
	}

	function ownershipVeto(data) {
		const P = player();
		if (!P) return null;
		const action = data && data.Action;
		const targetNumber = Number(data && data.MemberNumber);
		const target = characterByNumber(targetNumber);

		if (action === "Propose" && config.forbidNewSub) {
			// 已经是「我拥有、处于试用期」时，Propose 是转正，规则允许
			const trialMine = target && target.Ownership && Number(target.Ownership.MemberNumber) === Number(P.MemberNumber);
			if (!trialMine) return "你的规则不允许你收新的 sub";
		}

		if (action === "Accept" && config.forbidNewOwner) {
			// 已有试用关系时 Accept 是转正，规则允许
			if (!P.Ownership) return "你的规则不允许你有新的主人";
		}

		if (action === "Release" && config.forbidReleaseSub) {
			return "你的规则不允许你放弃你的 sub";
		}

		if (action === "Break" && config.forbidNewOwner) {
			const leavingOwner = P.Ownership && Number(P.Ownership.MemberNumber) === targetNumber;
			if (leavingOwner) return "你的规则不允许你离开你的主人";
		}

		return null;
	}

	function lovershipVeto(data) {
		const action = data && data.Action;
		const targetNumber = Number(data && data.MemberNumber);

		if (action === "Propose" || action === "Accept") {
			if (!config.forbidNewLover) return null;
			// 已经和她是恋人时，Propose 是求婚/升级，规则允许
			if (!lovershipWith(targetNumber)) return "你的规则不允许你有新的恋人";
		}

		if (action === "Break" && config.forbidBreakLover) {
			return "你的规则不允许你和恋人分手";
		}

		return null;
	}

	function adminVeto(data) {
		if (!config.limitAdminWhileRestrained) return null;
		const action = data && data.Action;
		if (action === "Kick" || action === "Ban") return null;

		const P = player();
		if (!P || typeof P.IsRestrained !== "function" || !P.IsRestrained()) return null;
		if (typeof window.ChatRoomPlayerIsAdmin !== "function" || !window.ChatRoomPlayerIsAdmin()) return null;
		return "被束缚时不能进行房间管理操作";
	}

	function installProtocolFixes() {
		hook(
			"ServerSend",
			10,
			(args, next) => {
				try {
					const type = args[0];
					const data = args[1];
					let veto = null;

					if (type === "AccountOwnership") veto = ownershipVeto(data);
					else if (type === "AccountLovership") veto = lovershipVeto(data);
					else if (type === "ChatRoomAdmin") veto = adminVeto(data);

					if (veto) {
						notify(veto);
						return undefined;
					}
				} catch (err) {
					logErr("协议拦截", err);
				}
				return next(args);
			},
			"rc_* / alt_room_admin_limit"
		);
	}

	// ---------------------------------------------------------------------
	// 自定义新增规则：头部栏（ItemHead）有物品时禁止发送「表情消息」
	//
	// 这里拦的是**表情消息**——聊天框里以 * 开头发出去、接收端 Type 为 "Emote"
	// 的那条消息，不是脸上的表情图标（facial expression）。两者在 BC 里是
	// 完全无关的两套东西：前者是聊天内容，后者是角色外观。
	//
	// R133 里玩家主动发出的表情消息只有一条必经之路（ChatRoom.js:3500）：
	//
	//   *文字          （聊天框输入，ChatRoom.js:3352 判断）
	//   50%*文字       （带成功率的表情）
	//   /me 文字  /attempt 50% 文字  /action 文字   （CommandsDefault.js:448/455/461）
	//   :文字          （MuStylePoses 打开时的另类写法）
	//          ↓  全部收敛到
	//   ChatRoomSendEmote(msg)
	//          ↓
	//   ChatRoomGenerateChatRoomChatMessage("Emote", msg)
	//          ↓
	//   ServerSend("ChatRoomChat", { Type: "Emote", ... })
	//
	// 所以 hook ChatRoomSendEmote 一个点就够，覆盖上面全部写法。
	//
	// 为什么不 hook ServerSend 兜底：WheelFortune.js:904/944/957 有 3 处直接
	// 发 Emote 的自动旁白（转盘结果），那是游戏自带的叙述，不属于「玩家发表情」，
	// 在协议层拦会误伤。
	//
	// 顺带一提：BC 自己也有同名的房主规则 BlockEmote（ChatRoom.js:3502 里那句
	// ChatRoomOwnerPresenceRule("BlockEmote")），语义与这里一致，可以对照参考。
	// ---------------------------------------------------------------------

	let lastEmoteNotice = 0;
	let emoteBlockCount = 0;
	let lastEmoteBlock = null;
	let announcingEmote = false; // 防止协议层兜底把「拦截公告」自己也拦掉

	/** 监控的装备分组（默认只有 ItemHead，即衣柜的 Head 栏） */
	function emoteBlockGroups() {
		const list = Array.isArray(config.emoteBlockGroups)
			? config.emoteBlockGroups.filter((g) => typeof g === "string" && g.trim())
			: [];
		return list.length ? list : DEFAULTS.emoteBlockGroups.slice();
	}

	/**
	 * 在指定分组里找已装备的物品，命中返回 { group, item }，否则 null。
	 *
	 * 先走官方 InventoryGet，但它内部还要求 A.Asset.Group.Family === Player.AssetFamily
	 * （见 R133 Scripts/Inventory.js:681），跨家族/中立家族的物品会被判成 null；
	 * 所以再补一遍不比对家族的 Appearance 扫描，两条路任一命中都算「有物品」。
	 */
	function equippedInGroups(groupNames) {
		const P = player();
		if (!P || !Array.isArray(P.Appearance)) return null;
		const names = new Set(groupNames);

		for (const name of names) {
			try {
				if (typeof window.InventoryGet === "function") {
					const item = window.InventoryGet(P, name);
					if (item) return { group: name, item };
				}
			} catch (err) {
				/* 落到下面的手动扫描 */
			}
		}

		const item = P.Appearance.find(
			(it) => it && it.Asset && it.Asset.Group && names.has(it.Asset.Group.Name)
		);
		return item ? { group: item.Asset.Group.Name, item } : null;
	}

	/** 头部栏（按当前监控分组）已装备的物品，没有就返回 null */
	function headItem() {
		const hit = equippedInGroups(emoteBlockGroups());
		return hit ? hit.item : null;
	}

	function emoteForbidden() {
		return !!(config.forbidEmoteWhileHeadOccupied && equippedInGroups(emoteBlockGroups()));
	}

	function displayName() {
		const P = player();
		if (!P) return "Someone";
		try {
			if (typeof window.CharacterNickname === "function") {
				const name = window.CharacterNickname(P);
				if (name) return name;
			}
		} catch (err) {
			/* 用下面的兜底 */
		}
		return String(P.Nickname || P.Name || `#${P.MemberNumber}`);
	}

	/**
	 * 被拦下时把原文还回输入框。
	 * ChatRoomSendChat 在调用 ChatRoomSendEmote 之后会无条件清空输入框
	 * （ChatRoom.js:3354），如果不还回去，玩家打的字就白打了。
	 * 用微任务等到清空之后再写回，并只在自己是空的时候写，避免覆盖新输入。
	 */
	function restoreChatInputLater() {
		if (!config.emoteKeepInputText) return;
		try {
			const box = document.getElementById("InputChat");
			const original = box && typeof box.value === "string" ? box.value : "";
			if (!original.trim()) return;
			queueMicrotask(() => {
				try {
					const el = document.getElementById("InputChat");
					if (!el || el.value !== "") return;
					el.value = original;
					el.dispatchEvent(new InputEvent("input", { bubbles: true }));
				} catch (err) {
					/* 忽略：界面已切走 */
				}
			});
		} catch (err) {
			/* 忽略 */
		}
	}

	/**
	 * 通知房间：这次表情消息被拦下了。
	 * 用 Type "Emote" 而不是 "Action"：Action 的内容会被 TextQueryMultiple 当
	 * 本地化 key 去查表（ChatRoom.js:4562），自定义文本会变成「MISSING TEXT」。
	 * 内容以 * 开头，接收端的 Emote 格式化逻辑（ChatRoom.js:3782）就不会再在
	 * 句首补一遍发送者名字。
	 */
	function announceEmoteBlocked() {
		const now = Date.now();
		const cooldown = Number(config.emoteNoticeCooldownMs);
		if (Number.isFinite(cooldown) && cooldown > 0 && now - lastEmoteNotice < cooldown) return;
		lastEmoteNotice = now;

		const template = String(
			config.emoteNoticeMessage == null ? DEFAULTS.emoteNoticeMessage : config.emoteNoticeMessage
		).trim();
		if (!template) return; // 公告留空 = 只在本地拦截，不向房间播报
		const text = template.replace(/\{name\}|\$name/g, displayName());

		try {
			const inRoom =
				typeof window.ServerPlayerIsInChatRoom === "function"
					? window.ServerPlayerIsInChatRoom()
					: !!window.ChatRoomData;
			if (inRoom && typeof window.ServerSend === "function") {
				announcingEmote = true;
				try {
					window.ServerSend("ChatRoomChat", { Type: "Emote", Content: `*${text}`, Dictionary: [] });
				} finally {
					announcingEmote = false;
				}
			}
		} catch (err) {
			logErr("发送表情消息拦截公告", err);
		}
	}

	function installEmoteFix() {
		hook(
			"ChatRoomSendEmote",
			20,
			(args, next) => {
				try {
					const hit = config.forbidEmoteWhileHeadOccupied
						? equippedInGroups(emoteBlockGroups())
						: null;
					if (hit) {
						emoteBlockCount++;
						lastEmoteBlock = {
							at: new Date().toLocaleTimeString(),
							group: hit.group,
							asset: (hit.item && hit.item.Asset && hit.item.Asset.Name) || hit.group,
							text: String((args && args[0]) || ""),
						};
						console.log(
							`${TAG} 已拦截表情消息（${hit.group}：${lastEmoteBlock.asset}）→ ${lastEmoteBlock.text}`
						);
						restoreChatInputLater();
						announceEmoteBlocked();
						return undefined; // 不进 next：消息不会发出去
					}
				} catch (err) {
					logErr("表情消息拦截", err);
				}
				return next(args);
			},
			"forbid_emote_in_mask（新增）"
		);
	}

	/**
	 * 可选兜底：在协议层再堵一道。
	 * 为什么需要：有些聊天增强 mod 会自己构造消息直接 ServerSend，根本不过
	 * ChatRoomSendEmote，那样上面的 hook 永远不会被调用（自检里「已拦截 0 次」）。
	 * 默认关闭，因为协议层分不清「玩家发表情」和「游戏自带旁白」：
	 *   - WheelFortune 的转盘结果旁白（WheelFortune.js:904/944/957）靠调用栈排除；
	 *   - 我们自己的拦截公告靠 announcingEmote 标记排除。
	 */
	function installEmoteProtocolBackstop() {
		hook(
			"ServerSend",
			40,
			(args, next) => {
				try {
					if (config.emoteBlockAtProtocol && config.forbidEmoteWhileHeadOccupied && !announcingEmote) {
						const event = args && args[0];
						const data = args && args[1];
						if (event === "ChatRoomChat" && data && data.Type === "Emote") {
							const hit = equippedInGroups(emoteBlockGroups());
							let fromWheel = false;
							try {
								fromWheel = /WheelFortune/i.test(String(new Error().stack || ""));
							} catch (err) {
								/* 拿不到栈就按「不是转盘」处理 */
							}
							if (hit && !fromWheel) {
								emoteBlockCount++;
								lastEmoteBlock = {
									at: new Date().toLocaleTimeString(),
									group: hit.group,
									asset: (hit.item && hit.item.Asset && hit.item.Asset.Name) || hit.group,
									text: String(data.Content || ""),
								};
								console.log(`${TAG} 已拦截表情消息（协议层 · ${hit.group}）→ ${lastEmoteBlock.text}`);
								announceEmoteBlocked();
								return undefined;
							}
						}
					}
				} catch (err) {
					logErr("表情消息协议层兜底", err);
				}
				return next(args);
			},
			"forbid_emote_in_mask · 协议层兜底（可选）"
		);
	}

	// ---------------------------------------------------------------------
	// /bcxfix 命令：查看状态、快速切换
	// ---------------------------------------------------------------------

	/**
	 * 所有布尔开关（规则本身 + 规则下的子开关），供 /bcxfix 显示与 on|off 使用。
	 * 从 RULES 派生，避免和界面里的清单各写一份、改一处忘另一处。
	 */
	function allSwitchKeys() {
		const out = [];
		RULES.forEach((rule) => {
			out.push({ key: rule.key, zh: rule.zh, en: rule.en });
			(rule.fields || []).forEach((field) => {
				if (field.type === "switch") out.push({ key: field.key, zh: field.zh, en: field.en });
			});
		});
		return out;
	}

	const TOGGLES = allSwitchKeys();

	function statusLines() {
		const lines = [`BCX 补充包 v${MOD_VERSION}`];
		for (const item of TOGGLES) {
			lines.push(`${config[item.key] ? "开" : "关"}  ${item.zh}  (${item.key})`);
		}
		lines.push(`可见好友：${(config.friendsVisible || []).join(",") || "无"}`);
		lines.push(`听力白名单：${(config.hearingWhitelistMembers || []).join(",") || "无"}`);
		lines.push(`可懂词：${(config.partialHearingWords || []).join(",") || "无"}`);
		const head = headItem();
		const headName = head && head.Asset ? head.Asset.Name || head.Asset.Group.Name : "";
		lines.push(`头部栏：${head ? headName || "有物品" : "空"}${emoteForbidden() ? "（表情消息已禁止）" : ""}`);
		const failed = hooks.filter((h) => !h.ok);
		lines.push(failed.length ? `未生效 hook：${failed.map((h) => h.target).join(",")}` : "所有 hook 均已生效");
		return lines;
	}

	/** 「表情消息」规则的详细自检：规则看起来没反应时，聊天框敲 /bcxfix emote */
	function emoteDiagnostics() {
		const lines = [`BCX 补充包 v${MOD_VERSION} · 表情消息规则自检`];

		lines.push(
			`开关 forbidEmoteWhileHeadOccupied：${config.forbidEmoteWhileHeadOccupied ? "开" : "关（关着就不会拦）"}`
		);
		lines.push(`监控分组：${emoteBlockGroups().join(",")}`);

		const rec = hooks.find((h) => h.target === "ChatRoomSendEmote");
		lines.push(
			`ChatRoomSendEmote hook：${
				rec ? (rec.ok ? "已挂载" : `未挂载（${rec.error || "等待目标函数"}）`) : "未注册"
			}`
		);
		lines.push(
			`游戏里该函数：${typeof window.ChatRoomSendEmote === "function" ? "存在" : "不存在（版本可能已改）"}`
		);
		lines.push(`协议层兜底 emoteBlockAtProtocol：${config.emoteBlockAtProtocol ? "开" : "关"}`);

		const P = player();
		if (!P) {
			lines.push("Player：尚未登录或界面未就绪");
		} else {
			const name = P.Nickname || P.Name || `#${P.MemberNumber}`;
			const appearance = Array.isArray(P.Appearance) ? P.Appearance : [];
			lines.push(`Player：${name}，家族 ${P.AssetFamily}，外观 ${appearance.length} 件`);

			// 每个监控分组各自的结果
			for (const group of emoteBlockGroups()) {
				let viaApi = "—";
				try {
					const item = typeof window.InventoryGet === "function" ? window.InventoryGet(P, group) : null;
					viaApi = item && item.Asset ? item.Asset.Name || "有物品" : "空";
				} catch (err) {
					viaApi = "报错";
				}
				const viaScan = appearance.some(
					(it) => it && it.Asset && it.Asset.Group && it.Asset.Group.Name === group
				);
				lines.push(`${group}：InventoryGet=${viaApi}，扫描=${viaScan ? "有物品" : "空"}`);
			}

			// 身上所有「看起来和头有关」的分组，直接告诉你该监控哪个
			const worn = [];
			appearance.forEach((it) => {
				if (it && it.Asset && it.Asset.Group && it.Asset.Group.Name && !worn.includes(it.Asset.Group.Name)) {
					worn.push(it.Asset.Group.Name);
				}
			});
			const headish = worn.filter((g) => /head|hood|mask|blind|face/i.test(g));
			if (headish.length) {
				lines.push(
					`身上头部相关分组：${headish
						.map((g) => {
							const item = appearance.find((a) => a.Asset && a.Asset.Group && a.Asset.Group.Name === g);
							const assetName = item && item.Asset && item.Asset.Name ? item.Asset.Name : "有物品";
							const monitored = emoteBlockGroups().includes(g);
							return `${g}(${assetName}${monitored ? "·已监控" : "·未监控"})`;
						})
						.join(", ")}`
				);
			} else {
				lines.push(`身上没有任何 head/hood 类分组，当前全部分组：${worn.join(",") || "无"}`);
			}

			lines.push(`当前判定：${emoteForbidden() ? "会拦截" : "不会拦截"}`);
		}

		lines.push(
			`已拦截 ${emoteBlockCount} 次${
				lastEmoteBlock ? `，最近 ${lastEmoteBlock.at}（${lastEmoteBlock.group}：${lastEmoteBlock.asset}）` : ""
			}`
		);
		lines.push(
			"若戴着头饰发 *文字 后这里仍是 0：说明消息没走 ChatRoomSendEmote（常见于别的聊天增强 mod 直接发协议）→ /bcxfix on emoteBlockAtProtocol 再试"
		);
		return lines;
	}

	let commandRetries = 0;
	function registerCommand() {
		if (typeof window.CommandCombine !== "function") {
			// Commands.js 可能还没加载完，稍后再试（最多 60 秒）
			if (++commandRetries <= 60) setTimeout(registerCommand, 1000);
			return;
		}
		try {
			window.CommandCombine({
				Tag: "bcxfix",
				Description: "BCX 补充包：/bcxfix、/bcxfix on|off <键>、/bcxfix allowfriend <编号>",
				Action: (argString) => {
					const parts = String(argString || "").trim().split(/\s+/).filter(Boolean);
					const out = [];
					const cmd = (parts[0] || "").toLowerCase();

					if (cmd === "on" || cmd === "off") {
						const key = parts[1];
						if (key && key in DEFAULTS) {
							config[key] = cmd === "on";
							saveConfig();
							out.push(`${key} 已${cmd === "on" ? "开启" : "关闭"}（下次刷新也保留）`);
						} else {
							out.push(`未知键：${key || "(空)"}`);
						}
					} else if (cmd === "allowfriend" || cmd === "allowhearing") {
						const num = Number(parts[1]);
						const key = cmd === "allowfriend" ? "friendsVisible" : "hearingWhitelistMembers";
						if (Number.isFinite(num)) {
							const list = new Set(asNumberSet(config[key]));
							if (list.has(num)) list.delete(num);
							else list.add(num);
							config[key] = Array.from(list);
							saveConfig();
							out.push(`${key}：${config[key].join(",") || "无"}`);
						} else {
							out.push("请给出成员编号，例如 /bcxfix allowfriend 12345");
						}
					} else if (cmd === "word") {
						const word = (parts[1] || "").trim();
						if (word) {
							const list = new Set((config.partialHearingWords || []).map(String));
							if (list.has(word)) list.delete(word);
							else list.add(word);
							config.partialHearingWords = Array.from(list);
							saveConfig();
							out.push(`可懂词：${config.partialHearingWords.join(",") || "无"}`);
						} else {
							out.push("请给出一个词，例如 /bcxfix word hello");
						}
					} else if (cmd === "notice") {
						const text = String(argString || "").trim().replace(/^notice\s*/i, "");
						if (text) {
							config.emoteNoticeMessage = text;
							saveConfig();
							out.push(`拦截公告已改为：${text.replace(/\{name\}|\$name/g, displayName())}`);
						} else {
							out.push(`当前公告：${String(config.emoteNoticeMessage).replace(/\{name\}|\$name/g, displayName())}`);
						}
					} else if (cmd === "emote" || cmd === "诊断") {
						const lines = emoteDiagnostics();
						console.log(lines.join("\n"));
						out.push(...lines);
					} else if (cmd === "group") {
						const group = (parts[1] || "").trim();
						if (group) {
							const list = new Set(emoteBlockGroups());
							if (list.has(group)) list.delete(group);
							else list.add(group);
							config.emoteBlockGroups = Array.from(list);
							saveConfig();
							out.push(`监控分组：${config.emoteBlockGroups.join(",") || "无"}`);
						} else {
							out.push(`监控分组：${emoteBlockGroups().join(",")}（用法 /bcxfix group ItemHood）`);
						}
					} else if (cmd === "ui" || cmd === "menu" || cmd === "设置" || cmd === "界面") {
						openSettings();
						out.push("设置面板已打开（Esc 或点右上角 × 关闭）");
					} else if (cmd === "reset") {
						const fresh = Object.assign({}, DEFAULTS);
						Object.keys(config).forEach((key) => delete config[key]);
						Object.assign(config, fresh);
						saveConfig();
						afterConfigChange("hideFriendsWhenBlind");
						afterConfigChange("uiFloatingButton");
						out.push("配置已重置为默认值");
					} else {
						out.push(...statusLines());
						out.push(
							"用法：/bcxfix ui（打开设置面板）；/bcxfix on|off <键>；/bcxfix allowfriend|allowhearing <编号>；/bcxfix word <词>；/bcxfix notice <公告文本>；/bcxfix emote（表情规则自检）；/bcxfix group <分组>；/bcxfix reset"
						);
					}

					notify(out.join(" ｜ "), 20000);
					return true;
				},
			});
			console.log(`${TAG} ✓ 已注册 /bcxfix 命令`);
		} catch (err) {
			console.warn(`${TAG} 注册 /bcxfix 失败：`, err);
		}
	}

	// ---------------------------------------------------------------------
	// v2.0 设置界面
	//
	// 三个入口，同一套面板：
	//   1. 偏好设置 → 扩展 → 「BCX 补充包」（走 BC 官方的
	//      PreferenceRegisterExtensionSetting，和 BCX 在原版里的入口一致）
	//   2. 屏幕右侧的悬浮按钮（可以在面板里关掉）
	//   3. 聊天框 /bcxfix ui，或控制台 BCXSupplement.openSettings()
	//
	// 布局按 BCX 的规则列表习惯：上方分类标签，下面一条规则一张卡片，
	// 勾选即写 localStorage 立即生效，没有「保存」按钮。
	// ---------------------------------------------------------------------

	const UI_ROOT_ID = "bcxfix-ui";
	const UI_STYLE_ID = "bcxfix-ui-style";
	const UI_FAB_ID = "bcxfix-fab";
	const UI_ICON =
		"data:image/svg+xml;charset=utf-8," +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
				'<rect x="2" y="2" width="60" height="60" rx="12" fill="#242433" stroke="#7f7fd6" stroke-width="4"/>' +
				'<path d="M17 41 L32 18 L47 41" fill="none" stroke="#cfcfff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
				'<circle cx="32" cy="47" r="4" fill="#cfcfff"/></svg>'
		);

	/** 每条规则依赖哪个 hook，用来在卡片上标「生效 / 未挂载」 */
	const RULE_HOOKS = {
		hideFriendsWhenBlind: ["FriendListLoadFriendList", "FriendListGetAvailableActions"],
		partialHearing: ["SpeechTransformProcess"],
		hearingWhitelist: ["SpeechTransformProcess"],
		forbidNewOwner: ["ServerSend"],
		forbidNewSub: ["ServerSend"],
		forbidReleaseSub: ["ServerSend"],
		forbidNewLover: ["ServerSend"],
		forbidBreakLover: ["ServerSend"],
		limitAdminWhileRestrained: ["ServerSend"],
		forbidEmoteWhileHeadOccupied: ["ChatRoomSendEmote"],
	};

	const UI_CSS = `
#${UI_ROOT_ID}, #${UI_ROOT_ID} * { box-sizing: border-box; font-family: Consolas, "Courier New", monospace; }
#${UI_ROOT_ID} {
	position: fixed; inset: 0; z-index: 999999; display: flex; align-items: center; justify-content: center;
	background: rgba(0, 0, 0, 0.72);
}
#${UI_ROOT_ID} .bcxfix-panel {
	width: min(960px, 94vw); height: min(740px, 90vh); display: flex; flex-direction: column;
	background: #1b1b23; color: #e9e9f2; border: 2px solid #6f6fae; border-radius: 10px;
	box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7); overflow: hidden;
}
#${UI_ROOT_ID} .bcxfix-head {
	display: flex; align-items: center; gap: 12px; padding: 14px 18px;
	background: linear-gradient(180deg, #2b2b3d, #232331); border-bottom: 1px solid #3c3c54;
}
#${UI_ROOT_ID} .bcxfix-logo { width: 40px; height: 40px; image-rendering: pixelated; }
#${UI_ROOT_ID} .bcxfix-title { font-size: 19px; font-weight: bold; letter-spacing: 0.5px; }
#${UI_ROOT_ID} .bcxfix-sub { font-size: 12px; color: #9c9cb8; margin-top: 2px; }
#${UI_ROOT_ID} .bcxfix-close {
	margin-left: auto; width: 34px; height: 34px; border-radius: 6px; cursor: pointer;
	background: #3a3a52; color: #d8d8ea; border: 1px solid #55557a; font-size: 20px; line-height: 1;
}
#${UI_ROOT_ID} .bcxfix-close:hover { background: #6b3a4c; border-color: #a05a72; color: #fff; }
#${UI_ROOT_ID} .bcxfix-tabs {
	display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 18px;
	background: #20202b; border-bottom: 1px solid #34344a;
}
#${UI_ROOT_ID} .bcxfix-tab {
	padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;
	background: #2b2b3b; color: #b9b9d0; border: 1px solid #3d3d57;
}
#${UI_ROOT_ID} .bcxfix-tab:hover { background: #35354b; color: #e6e6f5; }
#${UI_ROOT_ID} .bcxfix-tab.active { background: #55558f; border-color: #8b8bd0; color: #fff; }
#${UI_ROOT_ID} .bcxfix-tab .num { opacity: 0.7; margin-left: 6px; font-size: 12px; }
#${UI_ROOT_ID} .bcxfix-body { flex: 1; overflow-y: auto; padding: 14px 18px 20px; }
#${UI_ROOT_ID} .bcxfix-group {
	margin: 14px 0 8px; font-size: 12px; letter-spacing: 1px; color: #8282a8;
	border-bottom: 1px dashed #34344a; padding-bottom: 4px;
}
#${UI_ROOT_ID} .bcxfix-group:first-child { margin-top: 0; }
#${UI_ROOT_ID} .bcxfix-card {
	background: #24242f; border: 1px solid #38384d; border-left: 4px solid #7f7fd6;
	border-radius: 8px; padding: 12px 14px; margin-bottom: 10px;
}
#${UI_ROOT_ID} .bcxfix-card.off { border-left-color: #4a4a5e; opacity: 0.62; }
#${UI_ROOT_ID} .bcxfix-card-head { display: flex; align-items: center; gap: 10px; cursor: pointer; }
#${UI_ROOT_ID} .bcxfix-card-head input { width: 17px; height: 17px; cursor: pointer; accent-color: #7f7fd6; }
#${UI_ROOT_ID} .bcxfix-name { font-size: 15px; font-weight: bold; color: #f0f0fa; }
#${UI_ROOT_ID} .bcxfix-bcx { margin-left: auto; font-size: 11px; color: #8585a8; text-align: right; }
#${UI_ROOT_ID} .bcxfix-desc { font-size: 12.5px; color: #a9a9c2; margin: 8px 0 0 27px; line-height: 1.5; }
#${UI_ROOT_ID} .bcxfix-fields { margin: 10px 0 0 27px; display: flex; flex-direction: column; gap: 8px; }
#${UI_ROOT_ID} .bcxfix-field { display: flex; flex-direction: column; gap: 3px; }
#${UI_ROOT_ID} .bcxfix-field.inline { flex-direction: row; align-items: center; gap: 8px; }
#${UI_ROOT_ID} .bcxfix-label { font-size: 12px; color: #c4c4dc; }
#${UI_ROOT_ID} .bcxfix-input {
	width: 100%; padding: 6px 8px; border-radius: 5px; font-size: 13px;
	background: #16161d; color: #e9e9f2; border: 1px solid #43435e;
}
#${UI_ROOT_ID} .bcxfix-input:focus { outline: none; border-color: #8b8bd0; box-shadow: 0 0 0 2px rgba(127, 127, 214, 0.25); }
#${UI_ROOT_ID} .bcxfix-hint { font-size: 11.5px; color: #7d7d9a; }
#${UI_ROOT_ID} .bcxfix-badge { font-size: 11px; padding: 1px 6px; border-radius: 4px; }
#${UI_ROOT_ID} .bcxfix-badge.ok { background: #23402f; color: #86d8a6; }
#${UI_ROOT_ID} .bcxfix-badge.bad { background: #4a2430; color: #f0a0b4; }
#${UI_ROOT_ID} .bcxfix-foot {
	display: flex; align-items: center; gap: 8px; padding: 10px 18px;
	background: #20202b; border-top: 1px solid #34344a; font-size: 12px; color: #9a9ab6;
}
#${UI_ROOT_ID} .bcxfix-btn {
	padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;
	background: #2f2f43; color: #dcdcf0; border: 1px solid #45456a;
}
#${UI_ROOT_ID} .bcxfix-btn:hover { background: #3d3d58; border-color: #6f6fae; }
#${UI_ROOT_ID} .bcxfix-credit { margin-left: auto; }
#${UI_FAB_ID} {
	position: fixed; right: 12px; bottom: 116px; width: 48px; height: 48px; border-radius: 50%;
	z-index: 9000; cursor: pointer; padding: 0; border: 2px solid #7f7fd6;
	background: #242433; color: #d8d8f6; font: bold 13px/1 Consolas, "Courier New", monospace;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.55); opacity: 0.9;
}
#${UI_FAB_ID}:hover { opacity: 1; background: #3a3a58; transform: scale(1.06); }
`;

	let uiRoot = null;
	let uiMode = "standalone"; // standalone（指令/按钮打开） | embedded（偏好设置里打开）
	let uiTab = "all";
	let uiHookTimer = null;
	let uiPrefRegistered = false;
	let uiPendingOpen = false;

	/** 极简元素构造：attrs 支持 class / text / 事件（on开头的函数）/ 普通属性 */
	function el(tag, attrs, children) {
		const node = document.createElement(tag);
		if (attrs) {
			Object.keys(attrs).forEach((key) => {
				const value = attrs[key];
				if (value == null) return;
				if (key === "class") node.className = value;
				else if (key === "text") node.textContent = value;
				else if (key.slice(0, 2) === "on" && typeof value === "function")
					node.addEventListener(key.slice(2), value);
				else if (key === "checked" || key === "value") node[key] = value;
				else node.setAttribute(key, value);
			});
		}
		(Array.isArray(children) ? children : children == null ? [] : [children]).forEach((child) => {
			if (child != null) node.append(child);
		});
		return node;
	}

	let uiStyleAdded = false;
	function ensureUiStyle() {
		if (uiStyleAdded) return;
		if (!document.head) {
			// document-start 阶段 head 可能还没就绪
			setTimeout(ensureUiStyle, 200);
			return;
		}
		const style = document.createElement("style");
		style.id = UI_STYLE_ID;
		style.textContent = UI_CSS;
		document.head.append(style);
		uiStyleAdded = true;
	}

	function ruleEnabled(rule) {
		return !!config[rule.key];
	}

	/** 某个分类下「已开启 / 总数」 */
	function groupCounts(groupId) {
		const rules = RULES.filter((rule) => rule.group === groupId);
		const on = rules.filter(ruleEnabled).length;
		return { on, total: rules.length };
	}

	function hookBadge(rule) {
		const targets = RULE_HOOKS[rule.key] || [];
		if (!targets.length) return null;
		const records = targets.map((target) => hooks.find((item) => item.target === target));
		if (records.some((record) => !record)) return el("span", { class: "bcxfix-badge bad", text: "hook 未注册" });
		const okCount = records.filter((record) => record.ok).length;
		return okCount === records.length
			? el("span", { class: "bcxfix-badge ok", text: `hook ${okCount}/${records.length}` })
			: el("span", { class: "bcxfix-badge bad", text: `hook ${okCount}/${records.length}` });
	}

	function fieldValue(field) {
		const value = config[field.key];
		if (field.type === "list") return (Array.isArray(value) ? value : []).join(", ");
		if (field.type === "number") return Number.isFinite(Number(value)) ? String(value) : "";
		return value == null ? "" : String(value);
	}

	function parseListInput(raw, numeric) {
		const parts = String(raw || "")
			.split(/[,，;；\s]+/)
			.map((item) => item.trim())
			.filter(Boolean);
		const out = [];
		parts.forEach((item) => {
			const value = numeric ? Number(item) : item;
			if (numeric && !Number.isFinite(value)) return;
			if (!out.includes(value)) out.push(value);
		});
		return out;
	}

	/** 某个值改了之后需要立刻产生的副作用（其余都是 hook 里实时读 config，无需处理） */
	function afterConfigChange(key) {
		try {
			if (key === "hideFriendsWhenBlind" || key === "friendsVisible") {
				if (config.hideFriendsWhenBlind) maskFriendList();
				else unmaskFriendList();
			}
			if (key === "uiFloatingButton") syncFloatingButton();
		} catch (err) {
			logErr("应用设置", err);
		}
	}

	function buildField(field) {
		const wrap = el("div", { class: field.type === "switch" ? "bcxfix-field inline" : "bcxfix-field" });
		const label = el("span", { class: "bcxfix-label", text: `${field.zh} · ${field.en}` });

		if (field.type === "switch") {
			const box = el("input", { type: "checkbox" });
			box.checked = !!config[field.key];
			box.addEventListener("change", () => {
				config[field.key] = box.checked;
				saveConfig();
				afterConfigChange(field.key);
				refreshTabCounts();
			});
			wrap.append(box, label);
			return wrap;
		}

		const input = el("input", {
			class: "bcxfix-input",
			type: field.type === "number" ? "number" : "text",
			spellcheck: "false",
			value: fieldValue(field),
		});
		input.addEventListener("change", () => {
			try {
				if (field.type === "list") config[field.key] = parseListInput(input.value, !!field.numeric);
				else if (field.type === "number") {
					const num = Number(input.value);
					config[field.key] = Number.isFinite(num) ? num : 0;
				} else config[field.key] = input.value;
				input.value = fieldValue(field);
				saveConfig();
				afterConfigChange(field.key);
			} catch (err) {
				logErr("保存字段", err);
			}
		});

		wrap.append(label, input);
		if (field.hint) wrap.append(el("span", { class: "bcxfix-hint", text: field.hint }));
		return wrap;
	}

	function buildCard(rule) {
		const card = el("div", { class: ruleEnabled(rule) ? "bcxfix-card" : "bcxfix-card off" });

		const toggle = el("input", { type: "checkbox" });
		toggle.checked = ruleEnabled(rule);
		toggle.addEventListener("change", () => {
			config[rule.key] = toggle.checked;
			saveConfig();
			card.classList.toggle("off", !toggle.checked);
			afterConfigChange(rule.key);
			refreshTabCounts();
		});

		const head = el("label", { class: "bcxfix-card-head" }, [
			toggle,
			el("span", { class: "bcxfix-name", text: rule.zh }),
			el("span", { class: "bcxfix-bcx", text: rule.bcx || "" }),
		]);
		card.append(head);

		if (rule.desc) card.append(el("div", { class: "bcxfix-desc", text: rule.desc }));

		const badge = hookBadge(rule);
		if (badge) {
			badge.style.marginLeft = "27px";
			badge.style.marginTop = "6px";
			badge.style.display = "inline-block";
			card.append(badge);
		}

		if (rule.fields && rule.fields.length) {
			const fields = el("div", { class: "bcxfix-fields" });
			rule.fields.forEach((field) => fields.append(buildField(field)));
			card.append(fields);
		}
		return card;
	}

	function renderTabs(tabsEl) {
		tabsEl.replaceChildren();
		const allCount = RULES.filter(ruleEnabled).length;
		tabsEl.append(
			el(
				"button",
				{
					class: uiTab === "all" ? "bcxfix-tab active" : "bcxfix-tab",
					"data-tab": "all",
					onclick: () => switchTab("all"),
				},
				[
					document.createTextNode("全部"),
					el("span", { class: "num", text: `${allCount}/${RULES.length}` }),
				]
			)
		);
		RULE_GROUPS.forEach((group) => {
			const counts = groupCounts(group.id);
			if (!counts.total) return;
			tabsEl.append(
				el(
					"button",
					{
						class: uiTab === group.id ? "bcxfix-tab active" : "bcxfix-tab",
						"data-tab": group.id,
						onclick: () => switchTab(group.id),
					},
					[
						document.createTextNode(group.zh),
						el("span", { class: "num", text: `${counts.on}/${counts.total}` }),
					]
				)
			);
		});
	}

	function renderList(listEl) {
		listEl.replaceChildren();
		const groups = uiTab === "all" ? RULE_GROUPS : RULE_GROUPS.filter((group) => group.id === uiTab);
		groups.forEach((group) => {
			const rules = RULES.filter((rule) => rule.group === group.id);
			if (!rules.length) return;
			if (uiTab === "all")
				listEl.append(el("div", { class: "bcxfix-group", text: `${group.zh} · ${group.en}` }));
			rules.forEach((rule) => listEl.append(buildCard(rule)));
		});
	}

	function switchTab(tabId) {
		uiTab = tabId;
		if (!uiRoot) return;
		const tabsEl = uiRoot.querySelector(".bcxfix-tabs");
		const listEl = uiRoot.querySelector(".bcxfix-body");
		if (tabsEl) renderTabs(tabsEl);
		if (listEl) {
			renderList(listEl);
			listEl.scrollTop = 0;
		}
	}

	/** 勾选之后只刷新标签上的计数，不整页重绘（否则正在输入的框会失焦） */
	function refreshTabCounts() {
		if (!uiRoot) return;
		const tabsEl = uiRoot.querySelector(".bcxfix-tabs");
		if (tabsEl) renderTabs(tabsEl);
		updateHookSummary();
	}

	function updateHookSummary() {
		if (!uiRoot) return;
		const target = uiRoot.querySelector(".bcxfix-hooksum");
		if (!target) return;
		const okCount = hooks.filter((item) => item.ok).length;
		target.textContent = `hook ${okCount}/${hooks.length} 生效`;
		target.className =
			okCount === hooks.length ? "bcxfix-badge bcxfix-hooksum ok" : "bcxfix-badge bcxfix-hooksum bad";
	}

	function setAllRules(enabled) {
		RULES.forEach((rule) => {
			config[rule.key] = enabled;
			(rule.fields || []).forEach((field) => {
				if (field.type === "switch") config[field.key] = enabled;
			});
		});
		saveConfig();
		afterConfigChange("hideFriendsWhenBlind");
		afterConfigChange("uiFloatingButton");
		switchTab(uiTab);
		notify(enabled ? "已开启全部规则" : "已关闭全部规则");
	}

	function resetRules() {
		const fresh = Object.assign({}, DEFAULTS);
		Object.keys(config).forEach((key) => delete config[key]);
		Object.assign(config, fresh);
		saveConfig();
		afterConfigChange("hideFriendsWhenBlind");
		afterConfigChange("uiFloatingButton");
		switchTab(uiTab);
		notify("已恢复默认设置");
	}

	function openSettings(mode) {
		ensureUiStyle();
		uiMode = mode === "embedded" ? "embedded" : "standalone";
		if (uiRoot) {
			// 已经开着，只切换模式
			return uiRoot;
		}
		// 极早期（body 还没解析出来）时等一会儿再开
		if (!document.body) {
			if (!uiPendingOpen) {
				uiPendingOpen = true;
				const retry = () => {
					uiPendingOpen = false;
					openSettings(mode);
				};
				if (document.readyState === "loading")
					document.addEventListener("DOMContentLoaded", retry, { once: true });
				else setTimeout(retry, 100);
			}
			return null;
		}

		const panel = el("div", { class: "bcxfix-panel" });

		panel.append(
			el("div", { class: "bcxfix-head" }, [
				el("img", { class: "bcxfix-logo", src: UI_ICON, alt: "BCX" }),
				el("div", {}, [
					el("div", { class: "bcxfix-title", text: "BCX 补充包" }),
					el("div", {
						class: "bcxfix-sub",
						text: `BCX Supplement v${MOD_VERSION} · Bondage Club R133 · 勾选即生效`,
					}),
				]),
				el("button", {
					class: "bcxfix-close",
					title: "关闭（Esc）",
					text: "×",
					onclick: () => closeSettings(),
				}),
			])
		);

		const tabs = el("div", { class: "bcxfix-tabs" });
		renderTabs(tabs);
		panel.append(tabs);

		const body = el("div", { class: "bcxfix-body" });
		renderList(body);
		panel.append(body);

		const hooksum = el("span", { class: "bcxfix-badge bcxfix-hooksum" });
		panel.append(
			el("div", { class: "bcxfix-foot" }, [
				el("button", { class: "bcxfix-btn", text: "全部开启", onclick: () => setAllRules(true) }),
				el("button", { class: "bcxfix-btn", text: "全部关闭", onclick: () => setAllRules(false) }),
				el("button", { class: "bcxfix-btn", text: "恢复默认", onclick: () => resetRules() }),
				el("span", { class: "bcxfix-credit" }, [
					hooksum,
					document.createTextNode("   设置会自动保存"),
				]),
			])
		);

		uiRoot = el("div", { id: UI_ROOT_ID }, [panel]);
		uiRoot.addEventListener("mousedown", (event) => {
			if (event.target === uiRoot) closeSettings();
		});
		document.body.append(uiRoot);

		// hook 是「函数出现后再挂」的，面板打开后持续刷新状态
		if (uiHookTimer) clearInterval(uiHookTimer);
		uiHookTimer = setInterval(updateHookSummary, 1000);
		updateHookSummary();

		const onKeyDown = (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				closeSettings();
			}
		};
		document.addEventListener("keydown", onKeyDown, true);
		uiRoot.__escHandler = onKeyDown;

		return uiRoot;
	}

	/**
	 * @param {boolean} [fromGame] true = 由 BC 自己收起（exit / unload），此时不要再回调
	 *   PreferenceSubscreenExtensionsClear，否则会把自己又拉回扩展列表。
	 */
	function closeSettings(fromGame) {
		if (!uiRoot) return;
		const root = uiRoot;
		uiRoot = null;
		if (uiHookTimer) {
			clearInterval(uiHookTimer);
			uiHookTimer = null;
		}
		if (root.__escHandler) document.removeEventListener("keydown", root.__escHandler, true);
		try {
			root.remove();
		} catch (err) {
			/* 忽略 */
		}

		// 从偏好设置进来的，点 × 时回到「扩展」列表（BC 自己的返回流程）
		if (uiMode === "embedded") {
			uiMode = "standalone";
			if (fromGame) return;
			try {
				if (typeof window.PreferenceSubscreenExtensionsClear === "function")
					window.PreferenceSubscreenExtensionsClear();
			} catch (err) {
				logErr("返回扩展列表", err);
			}
		}
	}

	/** 屏幕右侧悬浮按钮 */
	let fabRetries = 0;
	function syncFloatingButton() {
		const existing = document.getElementById(UI_FAB_ID);
		if (!config.uiFloatingButton) {
			if (existing) existing.remove();
			return;
		}
		if (existing) return;
		// 脚本是 document-start 注入的，那会儿 body 可能还没造出来
		if (!document.body) {
			if (fabRetries++ < 20) setTimeout(syncFloatingButton, 500);
			return;
		}
		fabRetries = 0;
		const button = el("button", {
			id: UI_FAB_ID,
			title: "BCX 补充包设置（也可在 偏好设置 → 扩展 里打开）",
			text: "BCX",
			onclick: (event) => {
				event.preventDefault();
				event.stopPropagation();
				openSettings();
			},
		});
		document.body.append(button);
	}

	/** 关掉「失明隐藏好友」时把列表还原（名字从 Player.FriendNames 取） */
	function unmaskFriendList() {
		document.querySelectorAll(".friend-list-row[data-bcx-masked]").forEach((row) => {
			const nameCell = row.querySelector("td.MemberName, .MemberName");
			const numberCell = row.querySelector("td.MemberNumber, .MemberNumber");
			const number = Number(numberCell && numberCell.dataset.bcxMemberNumber);
			let name = "";
			try {
				const map = player() && player().FriendNames;
				if (map && typeof map.get === "function" && Number.isFinite(number)) name = map.get(number) || "";
			} catch (err) {
				/* 拿不到就退回缓存的名字 */
			}
			if (!name && nameCell && nameCell.dataset.bcxName) name = nameCell.dataset.bcxName;
			if (nameCell) nameCell.textContent = name || (Number.isFinite(number) ? `#${number}` : "Someone");
			if (numberCell) numberCell.textContent = Number.isFinite(number) ? String(number) : "######";
			delete row.dataset.bcxMasked;
		});
	}

	/**
	 * 注册到「偏好设置 → 扩展」。这是 BC 官方给第三方扩展的入口，
	 * BCX 原版也是这么挂的，所以位置和玩家习惯一致。
	 * Scripts_Preference.js 可能比本脚本晚加载，所以带重试。
	 */
	let prefAttempt = 0;
	function registerPreferenceEntry() {
		if (uiPrefRegistered) return;
		if (typeof window.PreferenceRegisterExtensionSetting !== "function") {
			if (++prefAttempt <= 120) setTimeout(registerPreferenceEntry, 500);
			return;
		}
		try {
			window.PreferenceRegisterExtensionSetting({
				Identifier: "BCXSupplement",
				ButtonText: () => "BCX 补充包 / Supplement",
				Image: UI_ICON,
				load: () => openSettings("embedded"),
				run: () => {},
				click: () => {},
				exit: () => {
					closeSettings(true);
					return true;
				},
				unload: () => closeSettings(true),
			});
			uiPrefRegistered = true;
			console.log(`${TAG} ✓ 已注册到 偏好设置 → 扩展`);
		} catch (err) {
			console.warn(`${TAG} 注册偏好设置入口失败：`, err);
		}
	}

	function installUi() {
		ensureUiStyle();
		syncFloatingButton();
		registerPreferenceEntry();
	}

	// 所有函数与状态都已就绪，最后再启动（顺序不要调换，理由见 waitForSdk 上方注释）
	waitForSdk();
})();
