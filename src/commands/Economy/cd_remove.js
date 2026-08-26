import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// 指令名稱與對應的資料庫欄位名稱
const COOLDOWN_FIELDS = {
    work: 'lastWork',
    mine: 'lastMine',
    slut: 'lastSlut',
    crime: 'lastCrime',
    rob: 'lastRob',
    beg: 'lastBeg',
    fish: 'lastFish',
    gamble: 'lastGamble',
    // 可依需要自行新增其他指令
};

export default {
    data: new SlashCommandBuilder()
        .setName('cd_remove')
        .setDescription('移除指定玩家的指令冷卻時間（僅限管理員）')
        .addStringOption(option =>
            option
                .setName('command')
                .setDescription('要清除冷卻的指令')
                .setRequired(true)
                .addChoices(
                    ...Object.keys(COOLDOWN_FIELDS).map(cmd => ({
                        name: cmd,
                        value: cmd
                    }))
                )
        )
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('目標玩家（不填則預設為自己）')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        // 權限檢查
        if (!interaction.member.permissions.has('Administrator')) {
            throw createError(
                "Missing administrator permission",
                ErrorTypes.PERMISSION,
                "你沒有權限使用此指令。此指令僅限管理員使用。"
            );
        }

        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const commandName = interaction.options.getString('command');
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId;

        // 檢查指令是否支援
        const fieldName = COOLDOWN_FIELDS[commandName];
        if (!fieldName) {
            throw createError(
                "Invalid command for cooldown removal",
                ErrorTypes.VALIDATION,
                `找不到指令 \`${commandName}\` 的冷卻設定。`,
                { commandName }
            );
        }

        if (targetUser.bot) {
            throw createError(
                "Cannot remove cooldown for bot",
                ErrorTypes.VALIDATION,
                "機器人沒有冷卻時間。"
            );
        }

        logger.debug(`[ADMIN] Removing cooldown for ${targetUser.id} on command ${commandName}`, {
            adminId: interaction.user.id,
            targetUserId: targetUser.id,
            guildId,
            commandName
        });

        const userData = await getEconomyData(client, guildId, targetUser.id);

        if (!userData) {
            throw createError(
                "Failed to load user data",
                ErrorTypes.DATABASE,
                `無法載入 ${targetUser.username} 的經濟數據，請稍後再試。`,
                { userId: targetUser.id, guildId }
            );
        }

        // 清除冷卻（設為 0）
        userData[fieldName] = 0;

        await setEconomyData(client, guildId, targetUser.id, userData);

        logger.info(`[ADMIN] Cooldown removed`, {
            adminId: interaction.user.id,
            targetUserId: targetUser.id,
            guildId,
            commandName,
            fieldName,
            timestamp: new Date().toISOString()
        });

        const embed = successEmbed(
            "✅ 冷卻已移除",
            `已成功移除 ${targetUser} 的 **${commandName}** 指令冷卻時間。`
        ).addFields({
            name: "操作者",
            value: `${interaction.user}`,
            inline: true
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'cd_remove' })
};
