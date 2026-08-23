import { Events } from 'discord.js';
import config from '../../config.js'; // 請根據你實際的 config.js 檔案路徑調整
import { logger, startupLog } from '../utils/logger.js'; // 請根據你實際的 logger 工具路徑調整

// 如果這些背景任務函數是從其他檔案匯入的，請確保也有正確 import，例如：
// import { registerCommands } from '../handlers/commandHandler.js';
// import { reconcileReactionRoleMessages, reconcileTicketPanels, reconcileVerificationPanels, reconcileReactionRolePanelHealth, reconcileLevelRoles } from '../services/reconcile.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(config.bot.presence);

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);

      // 🚀 註冊指令可以保留 await（確保指令第一時間可用）
      await registerCommands(client, { 
        clientId: client.user.id, 
        guildId: "783858618386219059" 
      });

      startupLog(`Loaded ${client.commands.size} commands`);

      if (client.config?.features?.music) {
        initRiffyAfterReady(client);
      }

      // 💡 把所有的面板健康檢查和同步改到背景執行 (Background Promise)
      // 這樣它們會在背景慢慢跑，絕對不會卡死你的互動事件！
      (async () => {
        try {
          const reconciliationSummary = await reconcileReactionRoleMessages(client);
          startupLog(`Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`);

          const ticketPanelSummary = await reconcileTicketPanels(client);
          startupLog(`Ticket panel health: scanned ${ticketPanelSummary.scannedGuilds} guilds, healthy ${ticketPanelSummary.healthyPanels}, deleted ${ticketPanelSummary.deletedPanels}, missing channel ${ticketPanelSummary.missingChannels}, recovered ${ticketPanelSummary.recoveredIds}, errors ${ticketPanelSummary.errors}`);

          const verificationPanelSummary = await reconcileVerificationPanels(client);
          startupLog(`Verification panel health: scanned ${verificationPanelSummary.scannedGuilds} guilds, healthy ${verificationPanelSummary.healthyPanels}, deleted ${verificationPanelSummary.deletedPanels}, missing channel ${verificationPanelSummary.missingChannels}, recovered ${verificationPanelSummary.recoveredIds}, errors ${verificationPanelSummary.errors}`);

          const reactionRolePanelSummary = await reconcileReactionRolePanelHealth(client);
          startupLog(`Reaction role panel health: scanned ${reactionRolePanelSummary.scannedPanels} panels, healthy ${reactionRolePanelSummary.healthyPanels}, deleted ${reactionRolePanelSummary.deletedPanels}, missing channel ${reactionRolePanelSummary.missingChannels}, recovered ${reactionRolePanelSummary.recoveredIds}, errors ${reactionRolePanelSummary.errors}`);

          const levelRoleSummary = await reconcileLevelRoles(client);
          startupLog(`Level role sync: scanned ${levelRoleSummary.scannedGuilds} guilds, pruned ${levelRoleSummary.prunedRewardEntries} stale rewards, re-awarded ${levelRoleSummary.rolesReAwarded} roles, errors ${levelRoleSummary.errors}`);
        } catch (bgError) {
          logger.error("Error in background reconciliation tasks:", bgError);
        }
      })();

    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};
