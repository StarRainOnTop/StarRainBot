import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 15 * 60 * 1000;
const MIN_WIN = Number(botConfig?.economy?.begMin) || 100;
const MAX_WIN = Number(botConfig?.economy?.begMax) || 300;
const BASE_SUCCESS_CHANCE = 0.7;

// ─── 乞討熟練度設定 ───
const XP_PER_BEG = 10;                     // 每次乞討獲得的經驗值
const LEVEL_SUCCESS_BOOST = 0.01;         // 每級提升成功率 1%
const LEVEL_AMOUNT_MULTIPLIER = 0.02;     // 每級提升金額 2%
const MAX_LEVEL_SUCCESS_BOOST = 0.20;     // 成功率最多 +20%
const MAX_LEVEL_AMOUNT_MULTIPLIER = 2.0;  // 金額最多 x2

// ─── 連續乞討加成設定 ───
const STREAK_BONUS_MULTIPLIER = 1.5;      // 連續成功 3 次以上時金額 x1.5
const STREAK_BONUS_THRESHOLD = 3;

// ─── 每日首次乞討加成設定 ───
const DAILY_FIRST_BONUS = 500;            // 每日第一次乞討額外 +$500
const DAILY_FIRST_GUARANTEED = true;      // 每日第一次乞討必定成功

// ─── 道具效果常數 ───
const BEG_HAT_SUCCESS_BOOST = 0.10;       // 破舊帽子：成功率 +10%
const BEG_SIGN_AMOUNT_MULTIPLIER = 1.5;   // 創意標語板：金額 x1.5

// 計算升級所需經驗
function getXpForNextLevel(level) {
    return level * 100 + 100;
}

// ─── 隨機事件系統 ───
const SUCCESS_EVENT_CHANCE = 0.25;
const FAILURE_EVENT_CHANCE = 0.30;

const SUCCESS_EVENTS = [
    {
        name: "意外之財",
        description: "你發現路邊有個被遺忘的錢包，裡面有些零錢！",
        effect: { cashBonus: 300, message: "獲得額外 $300！" }
    },
    {
        name: "名聲大噪",
        description: "你的乞討事蹟在社群傳開，經驗值翻倍！",
        effect: { xpBonus: 2, message: "本次經驗值 x2！" }
    },
    {
        name: "慈善家降臨",
        description: "一位慈善家被你的真誠打動，給了你一筆慷慨的捐助。",
        effect: { cashBonus: 1000, message: "獲得額外 $1,000！" }
    },
    {
        name: "街頭藝人合作",
        description: "一位街頭藝人邀你一起表演，意外獲得更多打賞。",
        effect: { cashBonus: 500, message: "獲得額外 $500！" }
    }
];

const FAILURE_EVENTS = [
    {
        name: "警察驅趕",
        description: "警察過來驅趕你，冷卻時間延長。",
        effect: { cooldownExtension: 0.5, message: "冷卻時間延長 50%！" }
    },
    {
        name: "地盤爭奪",
        description: "其他乞丐搶走了你的位置，你損失了一些錢。",
        effect: { cashLoss: 100, message: "損失 $100！" }
    },
    {
        name: "倒楣日",
        description: "你今天運氣特別差，什麼也沒得到。",
        effect: { nothing: true, message: "什麼也沒發生..." }
    },
    {
        name: "貴人相助",
        description: "一位路人看你可憐，給了你一點車馬費。",
        effect: { cashBonus: 50, message: "獲得 $50 安慰獎。" }
    }
];

function getRandomEvent(isSuccess) {
    const eventList = isSuccess ? SUCCESS_EVENTS : FAILURE_EVENTS;
    const chance = isSuccess ? SUCCESS_EVENT_CHANCE : FAILURE_EVENT_CHANCE;
    if (Math.random() > chance) return null;
    return eventList[Math.floor(Math.random() * eventList.length)];
}

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('乞討一小筆金額'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        let userData = await getEconomyData(client, guildId, userId);
        
        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId, guildId }
            );
        }

        // 冷卻檢查
        const lastBeg = userData.lastBeg || 0;
        const remainingTime = lastBeg + COOLDOWN - now;
        if (remainingTime > 0) {
            const minutes = Math.floor(remainingTime / 60000);
            const seconds = Math.floor((remainingTime % 60000) / 1000);
            let timeMessage = minutes > 0 ? `${minutes} 分鐘` : `${seconds} 秒`;
            throw createError(
                "Beg cooldown active",
                ErrorTypes.RATE_LIMIT,
                `你還沒休息夠呢！請在 **${timeMessage}** 後再試。`,
                { remainingTime, cooldownType: 'beg' }
            );
        }

        // ─── 每日首次乞討檢查 ───
        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);
        const todayStartMs = todayStart.getTime();
        const isFirstBegOfDay = !userData.lastBegDayStart || userData.lastBegDayStart < todayStartMs;

        let isSuccess;
        if (isFirstBegOfDay && DAILY_FIRST_GUARANTEED) {
            isSuccess = true;
        } else {
            // 基礎成功率
            let successChance = BASE_SUCCESS_CHANCE;

            // 熟練度加成
            const begLevel = userData.begLevel || 0;
            successChance += Math.min(begLevel * LEVEL_SUCCESS_BOOST, MAX_LEVEL_SUCCESS_BOOST);

            // 道具加成
            const inventory = userData.inventory || {};
            let usedBegHat = false;
            if ((inventory.beg_hat || 0) > 0) {
                usedBegHat = true;
                inventory.beg_hat -= 1;
                successChance += BEG_HAT_SUCCESS_BOOST;
            }

            isSuccess = Math.random() < successChance;

            // 存回 inventory（稍後統一儲存）
            userData.inventory = inventory;
        }

        // ─── 計算獎勵或失敗 ───
        let amountWon = 0;
        let eventMessage = '';
        let event = null;
        let usedBegSign = false;

        if (isSuccess) {
            // 基礎金額
            amountWon = Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

            // 熟練度金額加成
            const begLevel = userData.begLevel || 0;
            const levelMultiplier = Math.min(1 + begLevel * LEVEL_AMOUNT_MULTIPLIER, MAX_LEVEL_AMOUNT_MULTIPLIER);
            amountWon = Math.floor(amountWon * levelMultiplier);

            // 連續乞討加成
            const begStreak = userData.begStreak || 0;
            if (begStreak + 1 >= STREAK_BONUS_THRESHOLD) {
                amountWon = Math.floor(amountWon * STREAK_BONUS_MULTIPLIER);
                eventMessage += `\n🔥 **連續成功 ${begStreak + 1} 次！** 獎金 x${STREAK_BONUS_MULTIPLIER}！`;
            }

            // 道具：創意標語板（增加金額）
            const inventory = userData.inventory || {};
            if ((inventory.beg_sign || 0) > 0) {
                usedBegSign = true;
                inventory.beg_sign -= 1;
                amountWon = Math.floor(amountWon * BEG_SIGN_AMOUNT_MULTIPLIER);
                eventMessage += `\n🪧 **使用創意標語板**，金額 x${BEG_SIGN_AMOUNT_MULTIPLIER}！`;
            }
            userData.inventory = inventory;

            // 每日首次乞討額外獎勵
            if (isFirstBegOfDay && DAILY_FIRST_BONUS > 0) {
                amountWon += DAILY_FIRST_BONUS;
                eventMessage += `\n🎁 **每日首次乞討加成**：+$${DAILY_FIRST_BONUS.toLocaleString()}！`;
            }

            // 隨機事件
            event = getRandomEvent(true);
            if (event) {
                eventMessage += `\n\n🎲 **隨機事件：${event.name}**\n${event.description} ${event.effect.message}`;
                if (event.effect.cashBonus) {
                    amountWon += event.effect.cashBonus;
                }
                if (event.effect.xpBonus) {
                    // 經驗值加倍將在下面處理
                }
            }
        } else {
            // 失敗處理
            event = getRandomEvent(false);
            if (event) {
                eventMessage += `\n\n🎲 **隨機事件：${event.name}**\n${event.description} ${event.effect.message}`;
                if (event.effect.cashLoss) {
                    userData.wallet = Math.max(0, (userData.wallet || 0) - event.effect.cashLoss);
                }
                if (event.effect.cooldownExtension) {
                    // 延長冷卻（最終冷卻時間會在下面設定）
                }
                if (event.effect.cashBonus) {
                    amountWon = event.effect.cashBonus; // 安慰獎
                    // 注意：失敗但有安慰獎，仍算失敗（無連勝、無經驗加成）
                }
            }
        }

        // ─── 更新熟練度與連續紀錄 ───
        // 增加經驗值（隨機事件可能加倍）
        let xpGain = XP_PER_BEG;
        if (event && isSuccess && event.effect.xpBonus) {
            xpGain *= event.effect.xpBonus;
        }
        userData.begXp = (userData.begXp || 0) + xpGain;

        // 升級檢查
        let begLevel = userData.begLevel || 0;
        while (userData.begXp >= getXpForNextLevel(begLevel)) {
            userData.begXp -= getXpForNextLevel(begLevel);
            begLevel += 1;
        }
        userData.begLevel = begLevel;

        // 連續成功紀錄
        if (isSuccess) {
            userData.begStreak = (userData.begStreak || 0) + 1;
        } else {
            userData.begStreak = 0;
        }

        // 更新每日首次標記
        userData.lastBegDayStart = todayStartMs;
        userData.lastBeg = now;

        // 冷卻時間設定（可被事件延長）
        let finalCooldown = COOLDOWN;
        if (event && !isSuccess && event.effect.cooldownExtension) {
            finalCooldown = Math.floor(COOLDOWN * (1 + event.effect.cooldownExtension));
        }

        // 儲存資料
        await setEconomyData(client, guildId, userId, userData);

        // ─── 建立回覆訊息 ───
        let replyEmbed;
        if (isSuccess) {
            const successMessages = [
                `一位好心的陌生人往你的杯子裡投了 **$${amountWon.toLocaleString()}**。`,
                `你發現了一個沒人注意的錢包！你抓起 **$${amountWon.toLocaleString()}** 然後立刻逃跑。`,
                `有人對你心生憐憫，給了你 **$${amountWon.toLocaleString()}**！`,
                `你在公園長椅底下找到了 **$${amountWon.toLocaleString()}**。`,
                `一個路過的富豪覺得你的招牌很好笑，豪氣地塞給了你 **$${amountWon.toLocaleString()}**！`,
                `你在路上撿到了一張掉落的彩券，兌獎竟然中了 **$${amountWon.toLocaleString()}**！`,
                `一位好心的小姐姐把你當成街頭藝人，打賞了你 **$${amountWon.toLocaleString()}**。`,
                `你幫路人撿起掉落的帽子，對方為了道謝給了你 **$${amountWon.toLocaleString()}**。`,
                `你在販賣機的退幣口意外掏出了 **$${amountWon.toLocaleString()}** 的零錢！`,
                `一位實況主剛好在附近拍片，順手塞給你 **$${amountWon.toLocaleString()}** 當作臨時臨演費。`,
                `你在垃圾桶旁邊意外翻到了一個裝有 **$${amountWon.toLocaleString()}** 的舊紅包袋！`,
                `你即興在路邊唱了一首歌，獲得了路人熱烈的掌聲與 **$${amountWon.toLocaleString()}** 打賞。`,
                `一隻可愛的小狗叼著一張鈔票走到你面前，你順勢收下了 **$${amountWon.toLocaleString()}**。`,
                `慈悲的老奶奶看你可憐，不僅給了你熱湯，還塞了 **$${amountWon.toLocaleString()}** 給你。`
            ];
            const baseMessage = successMessages[Math.floor(Math.random() * successMessages.length)];
            replyEmbed = successEmbed('乞討成功', baseMessage + eventMessage);
            replyEmbed.addFields(
                { name: '乞討等級', value: `Lv.${begLevel}`, inline: true },
                { name: '連續成功', value: `${userData.begStreak} 次`, inline: true },
                { name: '冷卻時間', value: `${finalCooldown / 60000} 分鐘`, inline: true }
            );
        } else {
            const failMessages = [
                "警察把你趕走了，你什麼也沒有得到。",
                "有人大喊：「去找個工作吧！」然後從你身邊走了過去。",
                "一隻松鼠偷走了你身上僅存的一枚硬幣。",
                "你試著開口乞討，但覺得太尷尬便放棄了。",
                "路人不僅沒理你，還順便塞了一張求職傳單給你。",
                "你才剛坐下，天空就下起暴雨，只好狼狽地逃走。",
                "一個路人經過你身邊時，大喊了一聲詐騙集團，嚇得大家紛紛走避。",
                "城管巡邏經過，直接把你的紙板和杯子沒收了！",
                "你開口要錢，結果遇到比你更窮的人反過來向你借錢。",
                "你剛伸出手，一隻鴿子精準地在你手上拉了一坨鳥屎，你只好摸摸鼻子離開。",
                "有一個怪人突然蹲下來對你講了兩小時的人生大道理，什麼錢也沒拿到。",
                "你挑錯了地方，結果被地盤保全狠狠訓斥了一頓。",
                "正要開口時，你的熟人剛好路過，你尷尬得立刻把頭埋進外套裡裝死。",
                "你面前的零錢碗突然被一陣強風吹翻，硬幣全滾進了旁邊的水溝孔裡。"
            ];
            const baseMessage = failMessages[Math.floor(Math.random() * failMessages.length)];
            replyEmbed = warningEmbed('乞討失敗', baseMessage + eventMessage);
            replyEmbed.addFields(
                { name: '乞討等級', value: `Lv.${begLevel}`, inline: true },
                { name: '冷卻時間', value: `${finalCooldown / 60000} 分鐘`, inline: true }
            );
        }

        await InteractionHelper.safeEditReply(interaction, { embeds: [replyEmbed] });
    }, { command: 'beg' })
};
