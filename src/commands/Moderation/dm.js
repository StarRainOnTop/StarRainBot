import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { sanitizeMarkdown } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

const ALLOWED_USER_ID = '783852877641809961';

export default {
    data: new SlashCommandBuilder()
        .setName("dm")
        .setDescription("傳送私訊 (DM) 給使用者（僅限管理人員）")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("要傳送私訊的使用者")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("要傳送的訊息內容")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName("anonymous")
                .setDescription("是否以匿名方式傳送訊息（預設：否）")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),
    category: "moderation",

    async execute(interaction, config, client) {
        // Check if the user is allowed to use this command
        if (interaction.user.id !== ALLOWED_USER_ID) {
            return await replyUserError(interaction, { 
                type: ErrorTypes.UNKNOWN, 
                message: '你沒有權限使用此指令。此指令僅限特定管理人員使用。' 
            });
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`DM interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'dm'
            });
            return;
        }

        const targetUser = interaction.options.getUser("user");
        const message = interaction.options.getString("message");
        const anonymous = interaction.options.getBoolean("anonymous") || false;

        try {
            
            if (message.length > 2000) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '訊息長度必須少於 2000 個字元。' });
            }

            if (targetUser.bot) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '你無法傳送私訊給機器人帳號。' });
            }

            const sanitized = sanitizeMarkdown(message);

            const dmChannel = await targetUser.createDM();
            
            await dmChannel.send({
                embeds: [
                    successEmbed(
                        anonymous ? "來自管理團隊的訊息" : `來自 ${interaction.user.tag} 的訊息`,
                        sanitized
                    ).setFooter({
                        text: `你無法回覆此訊息。 | 記錄器 ID：${interaction.id}`
                    })
                ]
            });

            await logEvent({
                client: interaction.client,
                guild: interaction.guild,
                event: {
                    action: "已傳送私訊",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `匿名：${anonymous ? '是' : '否'}`,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        anonymous,
                        messageLength: sanitized.length
                    }
                }
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "已傳送私訊",
                        `已成功傳送訊息給 ${targetUser.tag}`
                    ),
                ],
            });
        } catch (error) {
            logger.error('DM command error:', error);
            
            if (error.code === 50007) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `無法傳送私訊給 ${targetUser.tag}。他們可能已關閉私人訊息。` });
            }
            
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `傳送私訊失敗：${error.message}` });
        }
    }
};
