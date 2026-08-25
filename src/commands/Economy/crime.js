import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SUCCESS_COOLDOWN = 15 * 60 * 1000; // 成功後冷卻 15 分鐘
const FAILURE_COOLDOWN = 30 * 60 * 1000; // 失敗後冷卻 30 分鐘
const JAIL_TIME = 1 * 60 * 60 * 1000; // 坐牢時間（你已自行調整，保留原值）
const FINE_RATE = 0.2; // 罰款比例（潛在收益的 20%）
const MAX_FINE = 5000; // 罰款上限

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

// 動態風險因子：越有錢，失敗率越高（最低 0.5 倍，最高 2 倍）
function getRiskMultiplier(totalWealth) {
    const minMultiplier = 0.5;
    const maxMultiplier = 2.0;
    const wealthFactor = totalWealth / 100000; // 每 10 萬資產增加 0.5 倍風險
    const multiplier = minMultiplier + wealthFactor * 0.5;
    return Math.min(maxMultiplier, Math.max(minMultiplier, multiplier));
}

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

        // 取得玩家總資產（錢包 + 銀行）
        const totalWealth = (userData.wallet || 0) + (userData.bank || 0);
        // 根據資產動態調整失敗率
        const riskMultiplier = getRiskMultiplier(totalWealth);
        const adjustedRisk = Math.min(0.95, crime.risk * riskMultiplier); // 失敗率最高 95%，避免必敗

        const isSuccess = Math.random() > adjustedRisk;
        const amountEarned = isSuccess
            ? Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min
            : 0;

        userData.cooldowns = userData.cooldowns || {};
        // 成功與失敗有不同的冷卻時間
        userData.cooldowns.crime = isSuccess ? now + SUCCESS_COOLDOWN : now + FAILURE_COOLDOWN;

        if (isSuccess) {
            userData.wallet = (userData.wallet || 0) + amountEarned;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "🕵️ 犯罪成功！",
                `你成功進行了 **${crime.name}**，賺取了 **$${amountEarned.toLocaleString()}**！\n` +
                `（成功率加成：富人風險 x${riskMultiplier.toFixed(2)}）`
            );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } else {
            const potentialHaul = Math.floor((crime.min + crime.max) / 2);
            // 罰款 = 潛在收益 * 比例，但不超過上限
            const fine = Math.min(Math.floor(potentialHaul * FINE_RATE), MAX_FINE);

            const totalMoney = (userData.wallet || 0) + (userData.bank || 0);
            const actualFinePaid = Math.min(fine, totalMoney);

            if (userData.wallet >= actualFinePaid) {
                userData.wallet -= actualFinePaid;
            } else {
                const remainingFine = actualFinePaid - userData.wallet;
                userData.wallet = 0;
                userData.bank = Math.max(0, userData.bank - remainingFine);
            }

            userData.jailedUntil = now + JAIL_TIME;

            await setEconomyData(client, guildId, userId, userData);

            const embed = warningEmbed(
                "🚔 犯罪失敗！",
                `你在嘗試 **${crime.name}** 時被抓包並送進了監獄！\n` +
                `你被罰款 **$${actualFinePaid.toLocaleString()}**（已自動從現金與銀行扣除）且必須在監獄裡待上 1 小時。\n` +
                `（失敗率已因資產調整，目前風險 x${riskMultiplier.toFixed(2)}）`
            );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }, { command: 'crime' })
};
