import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { formatDuration } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { botConfig } from '../../config/bot.js';

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000; // 24 小時冷卻
const STREAK_RESET_WINDOW = 24 * 60 * 60 * 1000; // 超過 24 小時沒領即斷簽重置
const BASE_DAILY_AMOUNT = 100; // 基礎每日獎勵 $100
const PREMIUM_BONUS_PERCENTAGE = 0.1;

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('領取你的每日現金獎勵（基礎 $100，每 2 天 +$50，每 7 天倍數再送大獎）'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        logger.debug(`[ECONOMY] Daily claimed started for ${userId}`, { userId, guildId });

        const userData = await getEconomyData(client, guildId, userId);
        
        if (!userData) {
            throw createError(
                "Failed to load economy data for daily",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId, guildId }
            );
        }
        
        const lastDaily = userData.lastDaily || 0;

        // 檢查冷卻時間 (24 小時內不可重複領取)
        if (now < lastDaily + DAILY_COOLDOWN) {
            const timeRemaining = lastDaily + DAILY_COOLDOWN - now;
            throw createError(
                "Daily cooldown active",
                ErrorTypes.RATE_LIMIT,
                `您需要等待一段時間才能再次領取每日獎勵。請在 **${formatDuration(timeRemaining)}** 後再試。`,
                { timeRemaining, cooldownType: 'daily' }
            );
        }

        // 📈 連續簽到 (Streak) 計算：超過 24 小時沒領即斷簽重置為 1
        const ALLOWED_WINDOW = DAILY_COOLDOWN + STREAK_RESET_WINDOW; // 48 小時內必須按
        let currentStreak = userData.dailyStreak || 0;
        
        if (lastDaily === 0 || now - lastDaily <= ALLOWED_WINDOW) {
            currentStreak += 1; // 準時接續領取，天數 +1
        } else {
            currentStreak = 1; // 超過時間斷簽，重置回 1，金額回歸 $100
        }

        // 1. 常規每 2 天 +$50 獎勵（修正公式：day2 +50, day4 +100 ...）
        const streakBonus = Math.floor(currentStreak / 2) * 50;

        // 2. 每 7 天里程碑動態加碼獎勵 (7天+$100, 14天+$200, 21天+$300...)
        let milestoneBonus = 0;
        let milestoneMessage = "";

        if (currentStreak > 0 && currentStreak % 7 === 0) {
            const weeks = currentStreak / 7;
            milestoneBonus = weeks * 100;
            milestoneMessage = `\n🏆 **【第 ${currentStreak} 天里程碑大獎】**：額外獎勵 +$${milestoneBonus.toLocaleString()}！`;
        }

        const guildConfig = await getGuildConfig(client, guildId);
        const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

        // 總獲得金額 = 基礎 $100 + 每 2 天加成 + 7天倍數里程碑大獎
        let earned = BASE_DAILY_AMOUNT + streakBonus + milestoneBonus;
        let bonusMessage = "";
        let hasPremiumRole = false;

        if (
            PREMIUM_ROLE_ID &&
            interaction.member &&
            interaction.member.roles.cache.has(PREMIUM_ROLE_ID)
        ) {
            const premiumBonus = Math.floor(
                BASE_DAILY_AMOUNT * PREMIUM_BONUS_PERCENTAGE,
            );
            earned += premiumBonus;
            bonusMessage += `\n✨ **高級會員加成：** +$${premiumBonus.toLocaleString()}`;
            hasPremiumRole = true;
        }

        if (streakBonus > 0) {
            bonusMessage += `\n🔥 **連續簽到獎勵：** +$${streakBonus.toLocaleString()}`;
        }

        // 拼上里程碑大獎訊息
        if (milestoneMessage) {
            bonusMessage += milestoneMessage;
        }

        userData.wallet = (userData.wallet || 0) + earned;
        userData.lastDaily = now;
        userData.dailyStreak = currentStreak;
        userData.reminderSent = false;
        userData.nextReminderAt = now + DAILY_COOLDOWN; // ⏰ 設定下次提醒時間（24小時後）

        await setEconomyData(client, guildId, userId, userData);
        const claimTimestamp = now;

        logger.info(`[ECONOMY_TRANSACTION] Daily claimed`, {
            userId,
            guildId,
            amount: earned,
            streak: currentStreak,
            milestone: milestoneBonus,
            newWallet: userData.wallet,
            hasPremium: hasPremiumRole,
            timestamp: new Date().toISOString()
        });

        const embed = successEmbed(
            "✅ 每日獎勵領取成功！",
            `您已成功領取您的每日獎勵 **$${earned.toLocaleString()}**！${bonusMessage}`
        )
            .addFields(
                {
                    name: "連續簽到天數",
                    value: `🔥 ${currentStreak} 天`,
                    inline: true,
                },
                {
                    name: "新錢包現金餘額",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                }
            )
            .setFooter({
                text: hasPremiumRole
                    ? `可在 24 小時後再次領取。（高級會員已生效）`
                    : `可在 24 小時後再次領取。`,
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        // 注意：已移除 setTimeout，改由 dailyReminderService 每分鐘檢查提醒

    }, { command: 'daily' })
};
