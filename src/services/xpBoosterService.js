import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';

const XP_BOOSTER_ROLE_ID = '1540410469406220358';
const CHECK_INTERVAL = 10 * 60 * 1000; // ⏱️ 改為每 10 分鐘檢查一次

export function initXpBoosterService(client) {
    // 機器人啟動後立即執行一次檢查
    checkExpiredBoosters(client);

    // 設定定時背景掃描（每 10 分鐘）
    setInterval(() => {
        checkExpiredBoosters(client);
    }, CHECK_INTERVAL);

    logger.info('[XP_BOOSTER_SERVICE] Background booster expiration service initialized (Interval: 10 mins).');
}

async function checkExpiredBoosters(client) {
    try {
        // 遍歷機器人所在的每個伺服器
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                // 確保伺服器成員有被載入（如果快取為空，先抓取一次成員）
                const members = await guild.members.fetch().catch(() => guild.members.cache);

                for (const [userId, member] of members) {
                    // 如果該成員已經擁有這個經驗加成身分組
                    if (member.roles.cache.has(XP_BOOSTER_ROLE_ID)) {
                        // 讀取該名玩家的經濟資料（內含過期時間）
                        const userData = await getEconomyData(client, guildId, userId);

                        // 檢查是否有設定過期時間，且當前時間已經超過（或等於）過期時間
                        if (userData && userData.xpBoosterExpiresAt && Date.now() >= userData.xpBoosterExpiresAt) {
                            try {
                                // 拔除身分組
                                await member.roles.remove(XP_BOOSTER_ROLE_ID, 'XP Booster card expired (checked by 10-min background service)');
                                logger.info(`[XP_BOOSTER] Successfully removed expired role from user ${userId} in guild ${guildId}`);

                                // 清除資料庫中的過期時間標記，並儲存
                                delete userData.xpBoosterExpiresAt;
                                await setEconomyData(client, guildId, userId, userData);
                            } catch (roleErr) {
                                logger.error(`[XP_BOOSTER] Failed to remove role for user ${userId}: ${roleErr.message}`);
                            }
                        }
                    }
                }
            } catch (guildErr) {
                logger.error(`[XP_BOOSTER_SERVICE] Error processing guild ${guildId}: ${guildErr.message}`);
            }
        }
    } catch (err) {
        logger.error(`[XP_BOOSTER_SERVICE] Error during background check: ${err.message}`);
    }
}
