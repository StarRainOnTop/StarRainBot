import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyPrefix } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName("eleaderboard")
        .setDescription("查看伺服器中最富有的前 10 名使用者")
        .setDMPermission(false),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        // ✅ 使用 interaction.client 确保有效
        const botClient = interaction.client;

        if (!botClient.db || typeof botClient.db.list !== 'function') {
            throw createError(
                "Database not available",
                ErrorTypes.CONFIGURATION,
                "資料庫暫時無法使用，請稍後再試。"
            );
        }

        const guildId = interaction.guildId;
        logger.debug(`[ECONOMY] Leaderboard requested`, { guildId });

        const prefix = getEconomyPrefix(guildId);
        let allKeys = await botClient.db.list(prefix);

        if (!Array.isArray(allKeys)) {
            allKeys = [];
        }

        if (allKeys.length === 0) {
            throw createError(
                "No economy data found",
                ErrorTypes.VALIDATION,
                "找不到此伺服器的經濟數據。"
            );
        }

        const allUserData = [];

        for (const key of allKeys) {
            const userId = key.replace(prefix, "");
            const userData = await botClient.db.get(key);

            if (userData) {
                allUserData.push({
                    userId: userId,
                    net_worth: (userData.wallet || 0) + (userData.bank || 0),
                });
            }
        }

        allUserData.sort((a, b) => b.net_worth - a.net_worth);

        const topUsers = allUserData.slice(0, 10);
        const userRank = allUserData.findIndex((u) => u.userId === interaction.user.id) + 1;
        const rankEmoji = ["🥇", "🥈", "🥉"];
        const leaderboardEntries = [];

        for (let i = 0; i < topUsers.length; i++) {
            const user = topUsers[i];
            const rank = i + 1;
            const emoji = rankEmoji[i] || `**#${rank}**`;

            leaderboardEntries.push(
                `${emoji} <@${user.userId}> - 🏦 $${user.net_worth.toLocaleString()}`
            );
        }

        logger.info(`[ECONOMY] Leaderboard generated`, {
            guildId,
            userCount: allUserData.length,
            userRank
        });

        const description = leaderboardEntries.length > 0
            ? leaderboardEntries.join("\n")
            : "目前此伺服器尚無可用的經濟數據。";

        const embed = createEmbed({
            title: `💰 伺服器財富排行榜`,
            description,
            footer: `您的排名：${userRank > 0 ? `#${userRank}` : "無排名數據"}`,
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'eleaderboard' })
};
