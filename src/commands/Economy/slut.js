import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SLUT_COOLDOWN = 30 * 60 * 1000;

// 擴充至 10 個活動項目
const SLUT_ACTIVITIES = [
    { name: "視訊直播", min: 120, max: 450, risk: 0.2 },
    { name: "私人熱舞對話", min: 220, max: 700, risk: 0.25 },
    { name: "深夜俱樂部主持人", min: 320, max: 900, risk: 0.3 },
    { name: "VIP 伴侶預約", min: 550, max: 1400, risk: 0.35 },
    { name: "獨家實況直播", min: 850, max: 2200, risk: 0.4 },
    { name: "街頭快閃魅力秀", min: 400, max: 1100, risk: 0.28 },
    { name: "高級私人派對招待", min: 1000, max: 2600, risk: 0.45 },
    { name: "深夜ASMR療癒頻道", min: 300, max: 850, risk: 0.22 },
    { name: "豪華遊艇晚宴嘉賓", min: 1500, max: 3500, risk: 0.5 },
    { name: "魅惑系寫真集拍攝", min: 700, max: 1800, risk: 0.38 },
];

const POSITIVE_OUTCOMES = [
    "你的直播爆紅，打賞如雪片般飛來。",
    "一筆 VIP 預約的報酬遠高於平均。",
    "你的深夜班次爆滿且利潤豐厚。",
    "高級要求接踵而至，你的收入大幅跳升。",
    "粉絲瘋狂解鎖你的專屬內容，收穫滿滿。",
    "全場觀眾為你的表演瘋狂，獲得了超高額的額外小費！"
];

const FINE_OUTCOMES = [
    "場地保全開立了一張合規罰單。",
    "審核警告觸發了平台手續費。",
    "你遭到標記並必須支付違規罰款。",
    "因為服裝尺度稍微踩線，被管理員開出警告罰單。",
    "場地租用超時，被加收了一筆行政罰款。"
];

const ROBBED_OUTCOMES = [
    "假買家的退款請求吞掉了你一部分的收益。",
    "一場詐騙預約清空了你的一大筆現金。",
    "你被詐騙帳號設局釣魚並損失了金錢。",
    "遇到惡意洗頻客強行勒索保護費。",
    "後台帳戶遭到可疑的惡意扣款攻擊。"
];

const LOSS_OUTCOMES = [
    "場次表現不佳，你必須自行負擔營運成本。",
    "你在前置準備上燒掉了預算卻沒有任何回報。",
    "這次班次徹底搞砸，讓你陷入赤字。",
    "設備突然故障，維修費直接吃掉所有收入。",
    "宣傳預算打水漂，完全沒有人來參與活動。"
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function resolveOutcome(activity, totalWealth) {
    const successChance = Math.max(0.35, 0.55 - activity.risk * 0.2);
    const fineChance = 0.22;
    const robbedChance = 0.2;
    const roll = Math.random();

    if (roll < successChance) {
        const amount = randomInt(activity.min, activity.max);
        return {
            type: 'payout',
            delta: amount,
            message: randomChoice(POSITIVE_OUTCOMES),
            title: `${activity.name} - 獲得報酬`
        };
    }

    const remainingAfterSuccess = roll - successChance;

    if (remainingAfterSuccess < fineChance) {
        const maxFine = Math.min(totalWealth, Math.max(150, Math.floor(activity.max * 0.4)));
        const minFine = Math.min(maxFine, Math.max(50, Math.floor(activity.min * 0.2)));
        const amount = maxFine > 0 ? randomInt(minFine, maxFine) : 0;
        return {
            type: 'fine',
            delta: -amount,
            message: randomChoice(FINE_OUTCOMES),
            title: `${activity.name} - 遭到罰款`
        };
    }

    if (remainingAfterSuccess < fineChance + robbedChance) {
        // 搶劫金額固定為 $200 ~ $2,000，完全不受總資產影響
        const amount = randomInt(200, 2000);
        return {
            type: 'robbed',
            delta: -amount,
            message: randomChoice(ROBBED_OUTCOMES),
            title: `${activity.name} - 遭到搶劫`
        };
    }

    const maxLoss = Math.min(totalWealth, Math.max(100, Math.floor(activity.max * 0.3)));
    const minLoss = Math.min(maxLoss, Math.max(40, Math.floor(activity.min * 0.15)));
    const amount = maxLoss > 0 ? randomInt(minLoss, maxLoss) : 0;
    return {
        type: 'loss',
        delta: -amount,
        message: randomChoice(LOSS_OUTCOMES),
        title: `${activity.name} - 虧損`
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('slut')
        .setDescription('從事風險較高的挑釁性質工作以獲取隨機收益或虧損'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        logger.debug(`[ECONOMY] Slut command started for ${userId}`, { userId, guildId });

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                "Failed to load economy data for slut command",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId, guildId }
            );
        }

        const lastSlut = userData.lastSlut || 0;

        if (now - lastSlut < SLUT_COOLDOWN) {
            const remainingTime = lastSlut + SLUT_COOLDOWN - now;
            throw createError(
                "Slut cooldown active",
                ErrorTypes.RATE_LIMIT,
                `你需要休息才能再次工作！請在 **${Math.ceil(remainingTime / 60000)}** 分鐘後再試。`,
                { timeRemaining: remainingTime, cooldownType: 'slut' }
            );
        }

        const activity = randomChoice(SLUT_ACTIVITIES);

        userData.wallet = userData.wallet || 0;
        userData.bank = userData.bank || 0;
        const totalWealth = userData.wallet + userData.bank;

        const outcome = resolveOutcome(activity, totalWealth);

        userData.lastSlut = now;
        userData.totalSluts = (userData.totalSluts || 0) + 1;
        userData.totalSlutEarnings = (userData.totalSlutEarnings || 0) + Math.max(0, outcome.delta);
        userData.totalSlutLosses = (userData.totalSlutLosses || 0) + Math.max(0, -outcome.delta);

        if (outcome.type !== 'payout') {
            userData.failedSluts = (userData.failedSluts || 0) + 1;
        }

        // 資金異動處理
        if (outcome.delta >= 0) {
            // 賺錢直接加到現金
            userData.wallet += outcome.delta;
        } else {
            // 虧損/罰款：先扣現金，現金不夠則從銀行扣（不讓銀行變負數）
            const lossAmount = Math.abs(outcome.delta);
            if (userData.wallet >= lossAmount) {
                userData.wallet -= lossAmount;
            } else {
                const remainingLoss = lossAmount - userData.wallet;
                userData.wallet = 0;
                userData.bank = Math.max(0, userData.bank - remainingLoss);
            }
        }

        await setEconomyData(client, guildId, userId, userData);

        logger.info(`[ECONOMY_TRANSACTION] Slut activity resolved`, {
            userId,
            guildId,
            activity: activity.name,
            outcomeType: outcome.type,
            amountDelta: outcome.delta,
            newWallet: userData.wallet,
            newBank: userData.bank,
            timestamp: new Date().toISOString()
        });

        const amountLabel = `${outcome.delta >= 0 ? '+' : '-'}$${Math.abs(outcome.delta).toLocaleString()}`;
        const summaryLines = [
            `${outcome.message}`,
            `💸 **淨利結果：** ${amountLabel}`,
            `💳 **當前現金餘額：** $${userData.wallet.toLocaleString()}`,
            `🏦 **當前銀行餘額：** $${userData.bank.toLocaleString()}`,
            `📊 **總工作場次：** ${userData.totalSluts}`,
            `💵 **總賺取金額：** $${(userData.totalSlutEarnings || 0).toLocaleString()}`,
            `🧾 **總虧損金額：** $${(userData.totalSlutLosses || 0).toLocaleString()}`
        ];

        const embed = createEmbed({
            title: outcome.title,
            description: summaryLines.join('\n'),
            color: outcome.delta >= 0 ? 'success' : 'error',
            timestamp: true
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'slut' })
};
