import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { getItemById, validatePurchase } from '../../config/shop/items.js';
import { getCurrentPrice } from '../../config/shop/index.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('從商店購買物品')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('要購買的物品 ID')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('購買數量（預設：1）')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const itemId = interaction.options.getString("item_id").trim().toLowerCase();
        const quantity = interaction.options.getInteger("quantity") || 1;

        const item = getItemById(itemId);

        if (!item) {
            throw createError(
                `Item ${itemId} not found`,
                ErrorTypes.VALIDATION,
                `商店中找不到 ID 為 \`${itemId}\` 的物品。`,
                { itemId }
            );
        }

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId, guildId }
            );
        }

        // 確保資料庫結構完整
        userData.inventory = userData.inventory || {};
        userData.upgrades = userData.upgrades || {};

        // 1. 執行購買條件驗證 (檢查上限、重複購買等)
        const validation = validatePurchase(itemId, userData);
        if (!validation.valid) {
            throw createError(
                "Purchase validation failed",
                ErrorTypes.VALIDATION,
                validation.reason,
                { itemId, quantity }
            );
        }

        // 2. 計算動態折扣與升級費用
        const totalCost = getCurrentPrice(itemId, { quantity, userData });

        // 3. 檢查現金餘額
        if ((userData.wallet || 0) < totalCost) {
            throw createError(
                "Insufficient funds",
                ErrorTypes.VALIDATION,
                `您需要 **$${totalCost.toLocaleString()}** 來購買 ${quantity} 個 **${item.name}**，但您的錢包裡只有 **$${(userData.wallet || 0).toLocaleString()}** 現金。`,
                { required: totalCost, current: userData.wallet, itemId, quantity }
            );
        }

        const guildConfig = (await getGuildConfig(client, guildId)) || {};
        const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

        // 決定目標身分組 ID：如果是 custom_role 就用指定 ID，否則如果是 role 類型則使用伺服器的 premiumRoleId
        let targetRoleId = null;
        if (itemId === "custom_role") {
            targetRoleId = "1540321552695037972";
        } else if (item.type === "role" || itemId === "premium_role") {
            targetRoleId = PREMIUM_ROLE_ID;
        }

        // 身分組特別驗證
        if (targetRoleId || item.type === "role" || itemId === "premium_role" || itemId === "custom_role") {
            if (!targetRoleId) {
                throw createError(
                    "Role not configured",
                    ErrorTypes.CONFIGURATION,
                    "此身分組尚未在系統中正確設定。",
                    { itemId }
                );
            }
            if (interaction.member.roles.cache.has(targetRoleId)) {
                throw createError(
                    "Role already owned",
                    ErrorTypes.VALIDATION,
                    `您已經擁有 **${item.name}** 身分組了。`,
                    { itemId, roleId: targetRoleId }
                );
            }
            if (quantity > 1) {
                throw createError(
                    "Invalid quantity for role",
                    ErrorTypes.VALIDATION,
                    `您只能購買 **${item.name}** 一次。`,
                    { itemId, quantity }
                );
            }
        }

        // 扣除費用
        userData.wallet -= totalCost;

        let successDescription = `您已成功以 **$${totalCost.toLocaleString()}** 購買了 ${quantity} 個 **${item.name}**！`;

        // 4. 根據商品類型處理發貨與生效邏輯
        if (targetRoleId || item.type === "role" || itemId === "premium_role" || itemId === "custom_role") {
            const member = interaction.member;
            const role = interaction.guild.roles.cache.get(targetRoleId);

            if (!role) {
                userData.wallet += totalCost; // 退款
                throw createError(
                    "Role not found",
                    ErrorTypes.CONFIGURATION,
                    "此伺服器中找不到對應的身分組（可能已被刪除或 ID 有誤）。",
                    { roleId: targetRoleId }
                );
            }

            try {
                // 一樣會正常把身分組發給玩家
                await member.roles.add(role, `商店購買身分組：${item.name}`);
                
                // 這裡精準調整顯示給玩家看的提示文字
                if (itemId === "custom_role") {
                    successDescription += `\n\n**👑 身分組 ${role.toString()} 已經發放給您了！**\n💬 **請透過開啟 Ticket 告訴管理員你想要的專屬名稱與顏色！**`;
                } else {
                    successDescription += `\n\n**👑 身分組 ${role.toString()} 已經發放給您了！**`;
                }
            } catch (roleError) {
                userData.wallet += totalCost; // 退款
                await setEconomyData(client, guildId, userId, userData);
                throw createError(
                    "Role assignment failed",
                    ErrorTypes.DISCORD_API,
                    "已成功扣款，但授予身分組失敗。您的金額已全數退還。",
                    { roleId: targetRoleId, originalError: roleError.message }
                );
            }
        } else if (item.type === "upgrade") {
            // 累加升級等級
            userData.upgrades[itemId] = (userData.upgrades[itemId] || 0) + quantity;
            const currentLevel = userData.upgrades[itemId];
            
            // ✅ 修改點：一次性升級（maxLevel === 1）顯示「已獲得」，否則顯示等級
            if (item.maxLevel === 1) {
                successDescription += `\n\n**✨ 您已獲得 ${item.name}！**`;
            } else {
                successDescription += `\n\n**✨ 您的 ${item.name} 已提升至 Lv.${currentLevel}！**`;
            }
        } else if (item.id === "personal_safe") {
            // 個人保險箱：依照耐久度（預設 5）與購買數量計算總防禦次數並累加
            const durabilityPerItem = item.durability || 5;
            const addedDefense = quantity * durabilityPerItem;
            userData.inventory[itemId] = (userData.inventory[itemId] || 0) + addedDefense;

            successDescription += `\n\n**🛡️ 個人保險箱已新增至您的背包！總共增加了 ${addedDefense} 次搶劫防禦次數。**`;
        } else if (item.effect?.type === "robbery_protection") {
            // 其他防盜護罩相關道具（保留原本的時效邏輯）
            userData.inventory[itemId] = (userData.inventory[itemId] || 0) + quantity;
            const durationMs = (item.effect?.durationDays || 7) * 24 * 60 * 60 * 1000 * quantity;
            const now = Date.now();
            const currentShield = (userData.shieldExpiresAt && userData.shieldExpiresAt > now) ? userData.shieldExpiresAt : now;

            userData.shieldExpiresAt = currentShield + durationMs;
            const expireTimestamp = Math.floor(userData.shieldExpiresAt / 1000);

            successDescription += `\n\n**🛡️ 防盜護罩已生效！保護期限至：<t:${expireTimestamp}:f>（<t:${expireTimestamp}:R>）**`;
        } else {
            // 一般道具或工具
            userData.inventory[itemId] = (userData.inventory[itemId] || 0) + quantity;
            if (item.type === "tool") {
                successDescription += `\n\n**🛠️ ${item.name} 已新增至您的背包！**`;
            } else {
                successDescription += `\n\n**🎒 ${item.name} 已新增至您的背包！**`;
            }
        }

        // 5. 儲存更新後的玩家資料
        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed("💰 購買成功", successDescription)
            .addFields({
                name: "新現金餘額",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'buy' })
};
