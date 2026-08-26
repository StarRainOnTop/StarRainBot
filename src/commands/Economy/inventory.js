import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('查看你或其他人的經濟背包道具、升級項目與保險箱狀態')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('要查詢背包的使用者（選填，不填則預設為自己）')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userOption = interaction.options.getUser('user');
        const targetUser = userOption || interaction.user;
        const guildId = interaction.guildId;

        logger.debug(`[ECONOMY] Inventory requested for ${targetUser.id}`, { userId: targetUser.id, guildId });

        if (targetUser.bot) {
            throw createError(
                "Bot user queried for inventory",
                ErrorTypes.VALIDATION,
                "機器人沒有經濟背包或資產。"
            );
        }

        const userData = await getEconomyData(client, guildId, targetUser.id);

        if (!userData) {
            throw createError(
                "Failed to load economy data for inventory",
                ErrorTypes.DATABASE,
                `無法載入該玩家的經濟數據，請稍後再試。`,
                { userId: targetUser.id, guildId }
            );
        }

        const inventory = userData.inventory || {};
        const upgrades = userData.upgrades || {};

        // 1. 一般背包道具解析（包含個人保險箱，會直接顯示剩餘耐久度/數量）
        const inventoryLines = Object.entries(inventory)
            .filter(([_, quantity]) => quantity > 0)
            .map(([itemId, quantity]) => {
                const item = shopItems.find(i => i.id === itemId);
                const itemName = item ? item.name : itemId;
                
                // 如果是個人保險箱，特別標註它是防禦次數
                if (itemId === 'personal_safe') {
                    return `• **${itemName}** (\`${itemId}\`)：剩餘防禦次數 **${quantity}** 次`;
                }
                
                return `• **${itemName}** (\`${itemId}\`)：${quantity} 個`;
            });

        // 2. 設施與永久升級解析
        const upgradeLines = Object.entries(upgrades)
            .filter(([_, level]) => level > 0)
            .map(([itemId, level]) => {
                const item = shopItems.find(i => i.id === itemId);
                const itemName = item ? item.name : itemId;
                // ✅ 修改点：一次性升级（maxLevel === 1）显示为“已擁有”，而不是 Lv.1
                const isOneTime = item && item.type === 'upgrade' && item.maxLevel === 1;
                const displayValue = isOneTime ? '已擁有' : `Lv.${level}`;
                return `• **${itemName}** (\`${itemId}\`)：${displayValue}`;
            });

        // 3. 保險箱防護狀態解析
        const safeCount = inventory['personal_safe'] || 0;
        const safeStatus = safeCount > 0
            ? `🔒 **保險箱保護中**（剩餘可抵擋 **${safeCount}** 次搶劫）`
            : '❌ **無保險箱保護**（容易遭到其他人搶劫，建議至商店購買）';

        const fields = [
            {
                name: '🎒 持有道具',
                value: inventoryLines.length > 0 ? inventoryLines.join('\n') : '（目前沒有任何消耗性道具或裝備）',
                inline: false,
            },
        ];

        if (upgradeLines.length > 0) {
            fields.push({
                name: '⚡ 設施與永久升級',
                value: upgradeLines.join('\n'),
                inline: false,
            });
        }

        fields.push({
            name: '🛡️ 搶劫防禦狀態',
            value: safeStatus,
            inline: false,
        });

        const embed = createEmbed({
            title: `🎒 ${targetUser.username} 的個人資產與背包`,
            fields: fields,
        }).setThumbnail(targetUser.displayAvatarURL());

        logger.info(`[ECONOMY] Inventory retrieved`, {
            userId: targetUser.id,
            guildId,
            itemCount: Object.keys(inventory).length,
            upgradeCount: Object.keys(upgrades).length,
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'inventory' })
};
