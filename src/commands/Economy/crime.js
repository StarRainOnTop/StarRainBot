import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// ─── 犯罪冷卻與懲罰設定 ───
const SUCCESS_COOLDOWN = 15 * 60 * 1000;      // 成功後冷卻 15 分鐘
const FAILURE_COOLDOWN = 30 * 60 * 1000;      // 失敗後冷卻 30 分鐘
const JAIL_TIME = 1 * 60 * 60 * 1000;         // 坐牢時間（保持原樣）
const FINE_RATE = 0.2;                        // 罰款比例（潛在收益的 20%）
const MAX_FINE = 5000;                        // 罰款上限

// ─── 犯罪熟練度設定 ───
const XP_PER_ATTEMPT = 10;                    // 每次犯罪獲得的經驗值
const LEVEL_RISK_REDUCTION = 0.01;            // 每級降低失敗率 1%
const LEVEL_REWARD_MULTIPLIER = 0.02;         // 每級提升獎勵 2%
const MAX_RISK_REDUCTION = 0.30;              // 最多降低 30% 失敗率
const MAX_REWARD_MULTIPLIER = 2.0;            // 獎勵最高 2 倍

// ─── 道具效果常數 ───
const MASK_FINE_REDUCTION = 0.5;              // 面具罰款減半
const LOCKPICK_RISK_REDUCTION = 0.15;         // 萬能鑰匙降低失敗率 15%

// 計算升級所需經驗
function getXpForNextLevel(level) {
    return level * 100 + 100; // 每級需求遞增
}

// ─── 犯罪類型 ───
const CRIME_TYPES = [
    { name: "Pickpocketing", min: 100, max: 500, risk: 0.3 },
    { name: "Burglary", min: 300, max: 1200, risk: 0.4 },
    { name: "Bank Heist", min: 1000, max: 5000, risk: 0.6 },
    { name: "Art Theft", min: 2000, max: 9000, risk: 0.7 },
    { name: "Cybercrime", min: 4000, max: 15000, risk: 0.8 },
    { name: "Car Theft", min: 800, max: 3500, risk: 0.45 },
    { name: "Smuggling", min: 3000, max: 12000, risk: 0.72 },
    { name: "Casino Scams", min: 5000, max: 18000, risk: 0.82 },
    { name: "Corporate Espionage", min: 8000, max: 24000, risk: 0.88 },
    { name: "International Trafficking", min: 12000, max: 30000, risk: 0.92 },
];

// ─── 動態風險因子：越有錢，失敗率越高 ───
function getRiskMultiplier(totalWealth) {
    const minMultiplier = 0.5;
    const maxMultiplier = 2.0;
    const wealthFactor = totalWealth / 100000;   // 每 10 萬資產增加 0.5 倍風險
    const multiplier = minMultiplier + wealthFactor * 0.5;
    return Math.min(maxMultiplier, Math.max(minMultiplier, multiplier));
}

// ─── 隨機事件系統 ───
const SUCCESS_EVENT_CHANCE = 0.25;
const FAILURE_EVENT_CHANCE = 0.30;

const SUCCESS_EVENTS = [
    {
        name: "意外之財",
        description: "你在現場意外發現了額外的財物！",
        effect: { cashBonus: 1000, message: "獲得額外 $1,000！" }
    },
    {
        name: "乾淨俐落",
        description: "你完美地執行任務，沒有留下任何痕跡。",
        effect: { cooldownReduction: 0.5, message: "冷卻時間減半！" }
    },
    {
        name: "名聲大噪",
        description: "你的成功在道上傳開，經驗值翻倍！",
        effect: { xpBonus: 2, message: "本次經驗值 x2！" }
    },
    {
        name: "神秘贊助",
        description: "一位神秘人物欣賞你的手法，給了你一筆資金。",
        effect: { cashBonus: 2000, message: "獲得額外 $2,000！" }
    }
];

const FAILURE_EVENTS = [
    {
        name: "同夥背叛",
        description: "你的同夥出賣了你，罰款加倍！",
        effect: { fineMultiplier: 2, message: "罰款加倍！" }
    },
    {
        name: "警察暴力",
        description: "你被逮捕時遭到不當對待，坐牢時間延長。",
        effect: { jailExtension: 0.5, message: "坐牢時間延長 50%！" }
    },
    {
        name: "幸運逃脫",
        description: "你在混亂中成功逃脫，免於坐牢。",
        effect: { jailRemoved: true, message: "你成功逃脫，不用坐牢！" }
    },
    {
        name: "貴人相助",
        description: "一位有影響力的人出面幫你，罰款減半。",
        effect: { fineMultiplier: 0.5, message: "罰款減半！" }
    }
];

function getRandomEvent(isSuccess) {
    const eventList = isSuccess ? SUCCESS_EVENTS : FAILURE_EVENTS;
    const chance = isSuccess ? SUCCESS_EVENT_CHANCE : FAILURE_EVENT_CHANCE;
    if (Math.random() > chance) return null;
    return eventList[Math.floor(Math.random() * eventList.length)];
}

// ─── 主指令 ───
export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('犯罪來賺取金錢（有風險）')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('要犯案的類型')
                .setRequired(true)
                .addChoices(
                    { name: '扒竊 (Pickpocketing)', value: 'pickpocketing' },
                    { name: '闖空門 (Burglary)', value: 'burglary' },
                    { name: '銀行搶劫 (Bank Heist)', value: 'bank-heist' },
                    { name: '藝術品偷竊 (Art Theft)', value: 'art-theft' },
                    { name: '網路犯罪 (Cybercrime)', value: 'cybercrime' },
                    { name: '車輛偷竊 (Car Theft)', value: 'car-theft' },
                    { name: '走私貨物 (Smuggling)', value: 'smuggling' },
                    { name: '賭場詐出 (Casino Scams)', value: 'casino-scams' },
                    { name: '企業間諜 (Corporate Espionage)', value: 'corporate-espionage' },
                    { name: '跨國走私 (International Trafficking)', value: 'international-trafficking' },
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastCrime = userData.cooldowns?.crime || 0;
        const isJailed = userData.jailedUntil && userData.jailedUntil > now;

        if (isJailed) {
            const timeLeft = Math.ceil((userData.jailedUntil - now) / (1000 * 60));
            throw createError(
                "User is in jail",
                ErrorTypes.RATE_LIMIT,
                `你還要在監獄裡待 ${timeLeft} 分鐘！`,
                { jailTimeRemaining: userData.jailedUntil - now }
            );
        }

        if (now < lastCrime) {
            const timeLeft = Math.ceil((lastCrime - now) / (1000 * 60));
            throw createError(
                "Crime cooldown active",
                ErrorTypes.RATE_LIMIT,
                `你必須等待 ${timeLeft} 分鐘後才能再次犯案。`,
                { remaining: lastCrime - now, cooldownType: 'crime' }
            );
        }

        const crimeType = interaction.options.getString("type").toLowerCase();
        const crime = CRIME_TYPES.find(
            c => c.name.toLowerCase().replace(/\s+/g, '-') === crimeType
        );

        if (!crime) {
            throw createError(
                "Invalid crime type",
                ErrorTypes.VALIDATION,
                "請選擇一個有效的犯罪類型。",
                { crimeType }
            );
        }

        // ─── 犯罪熟練度處理 ───
        const crimeLevel = userData.crimeLevel || 0;
        const crimeXp = userData.crimeXp || 0;

        userData.crimeXp = crimeXp + XP_PER_ATTEMPT;

        while (userData.crimeXp >= getXpForNextLevel(crimeLevel)) {
            userData.crimeXp -= getXpForNextLevel(crimeLevel);
            userData.crimeLevel = (userData.crimeLevel || 0) + 1;
        }
        const newLevel = userData.crimeLevel || 0;

        const riskReduction = Math.min(crimeLevel * LEVEL_RISK_REDUCTION, MAX_RISK_REDUCTION);
        const rewardMultiplier = Math.min(1 + (crimeLevel * LEVEL_REWARD_MULTIPLIER), MAX_REWARD_MULTIPLIER);

        // ─── 總資產與動態風險 ───
        const totalWealth = (userData.wallet || 0) + (userData.bank || 0);
        const riskMultiplier = getRiskMultiplier(totalWealth);
        let adjustedRisk = Math.max(0.05, (crime.risk * riskMultiplier) - riskReduction);

        // ─── 道具使用 ───
        const inventory = userData.inventory || {};
        let usedLockpick = false;
        let usedMask = false;

        if ((inventory.lockpick || 0) > 0) {
            usedLockpick = true;
            inventory.lockpick -= 1;
            adjustedRisk = Math.max(0.05, adjustedRisk - LOCKPICK_RISK_REDUCTION);
        }

        if ((inventory.disguise_mask || 0) > 0) {
            usedMask = true;
            inventory.disguise_mask -= 1;
        }

        // 判定成功與否
        const isSuccess = Math.random() > adjustedRisk;

        // 基礎獎勵（成功時）
        let amountEarned = 0;
        if (isSuccess) {
            amountEarned = Math.floor(
                (Math.random() * (crime.max - crime.min + 1) + crime.min) * rewardMultiplier
            );
        }

        // ─── 隨機事件 ───
        const event = getRandomEvent(isSuccess);
        let eventMessage = '';
        let cashBonus = 0;
        let fineMultiplier = 1;
        let jailTimeModifier = 1;
        let cooldownReduction = 1;
        let xpMultiplier = 1;

        if (event) {
            eventMessage = `\n\n🎲 **隨機事件：${event.name}**\n${event.description} ${event.effect.message}`;

            if (isSuccess) {
                if (event.effect.cashBonus) {
                    cashBonus = event.effect.cashBonus;
                    amountEarned += cashBonus;
                }
                if (event.effect.cooldownReduction) {
                    cooldownReduction = event.effect.cooldownReduction;
                }
                if (event.effect.xpBonus) {
                    xpMultiplier = event.effect.xpBonus;
                    userData.crimeXp = (userData.crimeXp || 0) + XP_PER_ATTEMPT * (xpMultiplier - 1);
                }
            } else {
                if (event.effect.fineMultiplier) {
                    fineMultiplier = event.effect.fineMultiplier;
                }
                if (event.effect.jailExtension) {
                    jailTimeModifier = 1 + event.effect.jailExtension;
                }
                if (event.effect.jailRemoved) {
                    jailTimeModifier = 0;
                }
            }
        }

        // ─── 設定冷卻時間 ───
        const baseCooldown = isSuccess ? SUCCESS_COOLDOWN : FAILURE_COOLDOWN;
        const finalCooldown = Math.floor(baseCooldown * cooldownReduction);
        userData.cooldowns = userData.cooldowns || {};
        userData.cooldowns.crime = now + finalCooldown;

        // ─── 成功處理 ───
        if (isSuccess) {
            userData.wallet = (userData.wallet || 0) + amountEarned;

            // 存回 inventory
            userData.inventory = inventory;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "🕵️ 犯罪成功！",
                `你成功進行了 **${crime.name}**，賺取了 **$${amountEarned.toLocaleString()}**！` +
                (rewardMultiplier > 1 ? `\n（熟練度加成 x${rewardMultiplier.toFixed(2)}）` : '') +
                (eventMessage ? eventMessage : '')
            );
            embed.addFields(
                { name: '犯罪等級', value: `Lv.${newLevel}`, inline: true },
                { name: '冷卻時間', value: `${finalCooldown / 60000} 分鐘`, inline: true }
            );

            if (usedLockpick || usedMask) {
                embed.addFields({
                    name: '🛠️ 使用道具',
                    value: `${usedLockpick ? '🔧 萬能鑰匙' : ''}${usedLockpick && usedMask ? '、' : ''}${usedMask ? '🕶️ 面具' : ''}`,
                    inline: false
                });
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } else {
            // ─── 失敗：罰款計算 ───
            const potentialHaul = Math.floor((crime.min + crime.max) / 2);
            let fine = Math.min(Math.floor(potentialHaul * FINE_RATE), MAX_FINE);
            fine = Math.floor(fine * fineMultiplier);

            // 面具效果：罰款減半
            if (usedMask) {
                fine = Math.floor(fine * MASK_FINE_REDUCTION);
            }

            const totalMoney = (userData.wallet || 0) + (userData.bank || 0);
            const actualFinePaid = Math.min(fine, totalMoney);

            if (userData.wallet >= actualFinePaid) {
                userData.wallet -= actualFinePaid;
            } else {
                const remainingFine = actualFinePaid - userData.wallet;
                userData.wallet = 0;
                userData.bank = Math.max(0, userData.bank - remainingFine);
            }

            // 坐牢時間處理
            let jailTime = JAIL_TIME * jailTimeModifier;
            if (jailTime > 0) {
                userData.jailedUntil = now + jailTime;
            } else {
                userData.jailedUntil = 0;
            }

            // 存回 inventory
            userData.inventory = inventory;

            await setEconomyData(client, guildId, userId, userData);

            const jailText = jailTime > 0
                ? `且必須在監獄裡待上 **${Math.ceil(jailTime / 60000)} 分鐘**`
                : '但幸運地逃過了坐牢';
            const embed = warningEmbed(
                "🚔 犯罪失敗！",
                `你在嘗試 **${crime.name}** 時被抓包並送進了監獄！\n` +
                `你被罰款 **$${actualFinePaid.toLocaleString()}**（已自動從現金與銀行扣除）${jailText}。` +
                (eventMessage ? eventMessage : '')
            );
            embed.addFields(
                { name: '犯罪等級', value: `Lv.${newLevel}`, inline: true },
                { name: '冷卻時間', value: `${finalCooldown / 60000} 分鐘`, inline: true }
            );

            if (usedLockpick || usedMask) {
                embed.addFields({
                    name: '🛠️ 使用道具',
                    value: `${usedLockpick ? '🔧 萬能鑰匙' : ''}${usedLockpick && usedMask ? '、' : ''}${usedMask ? '🕶️ 面具' : ''}`,
                    inline: false
                });
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }, { command: 'crime' })
};
