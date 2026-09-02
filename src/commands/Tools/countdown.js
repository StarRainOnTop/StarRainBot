import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createControlButtons, formatTime, startCountdown } from '../../handlers/countdownButtons.js';

const activeCountdowns = new Map();

export { activeCountdowns };

export default {
    data: new SlashCommandBuilder()
        .setName("countdown")
        .setDescription("啟動倒數計時器")
        .addIntegerOption((option) =>
            option
                .setName("minutes")
                .setDescription("倒數的分鐘數 (0-1440)")
                .setMinValue(0)
                .setMaxValue(1440)
                .setRequired(false)
        )
        .addIntegerOption((option) =>
            option
                .setName("seconds")
                .setDescription("倒數的秒數 (0-59)")
                .setMinValue(0)
                .setMaxValue(59)
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("title")
                .setDescription("倒數計時器的選填標題")
                .setRequired(false)
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Countdown interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'countdown'
            });
            return;
        }

        const minutes = interaction.options.getInteger("minutes") || 0;
        const seconds = interaction.options.getInteger("seconds") || 0;
        const title = interaction.options.getString("title") || "倒數計時器";

        const totalSeconds = minutes * 60 + seconds;

        if (totalSeconds <= 0) {
            throw new Error("請指定至少 1 秒的持續時間。");
        }

        if (totalSeconds > 86400) {
            throw new Error("倒數時間不能超過 24 小時。");
        }

        const endTime = Date.now() + totalSeconds * 1000;
        const countdownId = `${interaction.channelId}-${Date.now()}`;

        const row = createControlButtons(countdownId);

        const initialEmbed = successEmbed(
            `⏱️ ${title}`,
            `剩餘時間：**${formatTime(totalSeconds)}**`
        );

        const message = await interaction.channel.send({
            embeds: [initialEmbed],
            components: [row],
        });

        const countdownData = {
            message,
            endTime,
            remainingTime: totalSeconds * 1000,
            isPaused: false,
            title,
            lastUpdate: Date.now(),
            interval: null,
        };

        activeCountdowns.set(countdownId, countdownData);
        startCountdown(countdownId, countdownData, activeCountdowns);

        await InteractionHelper.safeEditReply(interaction, {
            content: "✅ 倒數計時已啟動！",
            flags: MessageFlags.Ephemeral,
        });
    },
};
