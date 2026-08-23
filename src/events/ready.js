import { Events } from 'discord.js';
import config from '../config/bot.js';
import { logger, startupLog } from '../utils/logger.js';

// ✅ 1. 修正了這裡的路徑，指向新的 commandLoader.js
import { registerCommands } from '../handlers/loaders/commandLoader.js';

import { 
  reconcileReactionRoleMessages, 
  reconcileTicketPanels, 
  reconcileVerificationPanels, 
  reconcileReactionRolePanelHealth, 
  reconcileLevelRoles 
} from '../services/reconcile.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      // ⚠️ 2. 避免 TypeError：Discord.js 內部 client.isReady() 是一個函數。
      // 當 ready 事件觸發時，Discord.js 就會自動回傳 true，不需要手動覆蓋它。
      // client.isReady = true;

      // ✅ 讀取 config.presence 並設置狀態
      if (config.presence) {
         client.user.setPresence(config.presence);
      }

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);

      // 🚀 註冊指令
      await registerCommands(client, { 
        clientId: client.user.id, 
        guildId: "783858618386219059" 
      });

      startupLog(`Loaded ${client.commands.size} commands`);

      // ⚠️ 3. 避免 ReferenceError：initRiffyAfterReady 沒有被 import！
      // 而且你在 app.js 已經執行過 initializeMusic(this) 了，這段如果沒用到可以先註解掉。
      /*
      if (client.config?.features?.music) {
        // initRiffyAfterReady(client);
      }
      */

      // 💡 背景執行面板健康檢查和同步
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
