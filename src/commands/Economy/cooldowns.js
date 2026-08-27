import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// 與 cd_remove.js 保持一致
const COOLDOWN_FIELDS = {
    work: 'lastWork',
    mine: 'lastMine',
    slut: 'lastSlut',
    crime: 'lastCrime',
    rob: 'lastRob',
    beg: 'lastBeg',
    fish: 'lastFish',
    gamble: 'lastGamble',
};

// 各指令的冷卻時間（與實際指令保持一致）
const COOLDOWN_DURATIONS = {
    work: 60 * 60 * 1000,           // 1 小時
    mine: 35 * 60 * 1000,           // 35 分鐘
    slut: 30 * 60 * 1000,           // 30 分鐘
    crime: 30 * 60 * 1000,          // 30 分鐘（失敗時）/ 15 分鐘（成功時）
    rob: 2 * 60 * 60 * 1000,        // 2 小時
    beg: 15 * 60 * 1000,            // 15 分鐘
    fish: 35 * 60 * 1000,           // 35 分鐘
    gamble: 5 * 60 * 1000,          // 5 分鐘
};

// 指令的顯示名稱與表情符號
const COMMAND_DISPLAY = {
    work: { emoji: '💼', name: '工作' },
    mine: { emoji: '⛏️', name: '挖礦' },
    slut: { emoji: '💋', name: 'Slut' },
    crime: { emoji: '🔫', name: '犯罪' },
    rob: { emoji: '💰', name: '搶劫' },
    beg: { emoji: '🫴', name: '乞討' },
    fish: { emoji: '🎣', name: '釣魚' },
    gamble: { emoji: '🎰', name: '賭博' },
};

export default {
    data: new SlashCommandBuilder()
        .setName('cooldowns')
        .setDescription('查看所有經濟指令的冷卻狀態')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('要查看的玩家（不填則查看自己）')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId;
        const isSelf = targetUser.id === interaction.user.id;

        if (targetUser.bot) {
            throw createError(
                "Invalid target",
                ErrorTypes.VALIDATION,
                "機器人沒有冷卻時間。"
            );
        }

        // 取得目標玩家的經濟數據
        const userData = await getEconomyData(client, guildId, targetUser.id);
        if (!userData) {
            throw createError(
                "Failed to load user data",
                ErrorTypes.DATABASE,
                `無法載入 ${targetUser.username} 的經濟數據，請稍後再試。`,
                { userId: targetUser.id, guildId }
            );
        }

        const now = Date.now();
        const cooldownStatus = [];

        // 🔥 檢查是否在監獄中（只影響 crime）
        const isJailed = userData.jailedUntil && userData.jailedUntil > now;
        let jailStatusText = '';

        if (isJailed) {
            const jailRemainingMs = userData.jailedUntil - now;
            const jailMinutes = Math.ceil(jailRemainingMs / 60000);
            const jailHours = Math.floor(jailMinutes / 60);
            const jailMins = jailMinutes % 60;

            if (jailHours > 0) {
                jailStatusText = `⛔ 在監獄中（剩餘 ${jailHours} 時 ${jailMins} 分）`;
            } else {
                jailStatusText = `⛔ 在監獄中（剩餘 ${jailMins} 分鐘）`;
            }
        }

        // 計算每個指令的冷卻狀態
        for (const [cmdKey, fieldName] of Object.entries(COOLDOWN_FIELDS)) {
            // 特殊處理 crime（因為它用 cooldowns.crime）
            let lastUsed;
            if (cmdKey === 'crime') {
                lastUsed = userData.cooldowns?.crime || 0;
            } else {
                lastUsed = userData[fieldName] || 0;
            }

            const cooldownMs = COOLDOWN_DURATIONS[cmdKey] || 60 * 60 * 1000;
            const elapsed = now - lastUsed;
            const remaining = Math.max(0, cooldownMs - elapsed);
            const isReady = remaining <= 0;

            const display = COMMAND_DISPLAY[cmdKey] || { emoji: '❓', name: cmdKey };

            let statusText;

            // 🔥 只有 crime 會受到監獄影響
            if (cmdKey === 'crime' && isJailed) {
                statusText = jailStatusText;
            } else if (isReady) {
                statusText = '✅ 就緒';
            } else {
                const remainingSeconds = Math.ceil(remaining / 1000);
                const remainingMinutes = Math.floor(remainingSeconds / 60);
                const remainingSecs = remainingSeconds % 60;

                if (remainingSeconds < 60) {
                    statusText = `⏳ 剩餘 ${remainingSeconds} 秒`;
                } else if (remainingSeconds < 3600) {
                    statusText = `⏳ 剩餘 ${remainingMinutes} 分 ${remainingSecs} 秒`;
                } else {
                    const hours = Math.floor(remainingSeconds / 3600);
                    const mins = Math.floor((remainingSeconds % 3600) / 60);
                    statusText = `⏳ 剩餘 ${hours} 時 ${mins} 分`;
                }
            }

            // 🔥 只有 crime 會被監獄影響就緒狀態
            const isActuallyReady = (cmdKey === 'crime' && isJailed) ? false : isReady;

            cooldownStatus.push({
                emoji: display.emoji,
                name: display.name,
                field: cmdKey,
                isReady: isActuallyReady,
                status: statusText,
            });
        }

        // 計算就緒數量
        const readyCount = cooldownStatus.filter(c => c.isReady).length;
        const totalCount = cooldownStatus.length;

        // 生成 Embed
        let description = `共 ${totalCount} 個指令，${readyCount} 個已就緒，${totalCount - readyCount} 個冷卻中`;

        if (isJailed) {
            description = `🔫 **${targetUser.username} 正在監獄中，無法使用 /crime！**\n${description}`;
        }

        const embed = successEmbed(
            `⏱️ ${targetUser.username} 的冷卻狀態`,
            description
        )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setFooter({
                text: isSelf ? '你的冷卻狀態' : `由 ${interaction.user.username} 查詢`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            });

        const fields = cooldownStatus.map(c => ({
            name: `${c.emoji} ${c.name}`,
            value: c.status,
            inline: true,
        }));

        embed.addFields(fields);

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'cooldowns' })
};
