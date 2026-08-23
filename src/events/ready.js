import { Events } from 'discord.js';
import config from '../../config.js';
import { logger, startupLog } from '../utils/logger.js';
import { registerCommands } from '../handlers/commandHandler.js';
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
      // ✅ 修正這裡：直接讀取 config.presence（對應 config.js 的結構）
      client.user.setPresence(config.presence);

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);

      // 🚀 註冊指令
      await registerCommands(client, { 
        clientId: client.user.id, 
        guildId: "783858618386219059" 
      });

      startupLog(`Loaded ${client.commands.size} commands`);

      if (client.config?.features?.music) {
        initRiffyAfterReady(client);
      }

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
