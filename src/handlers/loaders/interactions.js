import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const interactionTypes = ['buttons', 'selectMenus', 'modals'];

async function getAllInteractionFiles(directory, fileList = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await getAllInteractionFiles(entryPath, fileList);
    } else if (entry.name.endsWith('.js')) {
      fileList.push(entryPath);
    }
  }

  return fileList;
}

export default async (client) => {
  try {
    const interactionsPath = join(__dirname, '../../interactions');

    // ========== 加载所有交互组件 ==========
    for (const type of interactionTypes) {
      const typePath = join(interactionsPath, type);

      try {
        const interactionFiles = await getAllInteractionFiles(typePath);
        let loadedCount = 0;

        for (const filePath of interactionFiles) {
          const relativePath = filePath.slice(interactionsPath.length + 1).replace(/\\/g, '/');
          const fileName = relativePath.split('/').pop();

          try {
            const module = await import(pathToFileURL(filePath).href);
            const moduleExport = module.default;
            const interactions = Array.isArray(moduleExport) ? moduleExport : [moduleExport];

            for (const interaction of interactions) {
              if (!interaction?.name || !interaction?.execute) {
                logger.warn(`Interaction ${relativePath} in ${type} is missing required properties.`);
                continue;
              }

              client[type].set(interaction.name, interaction);
              loadedCount += 1;
              logger.info(`Loaded ${type.slice(0, -1)}: ${interaction.name} (${fileName})`);
            }
          } catch (error) {
            logger.error(`Error loading interaction ${relativePath} in ${type}:`, error);
          }
        }

        logger.info(`Loaded ${loadedCount} ${type}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.error(`Error loading ${type}:`, error);
        } else {
          logger.debug(`No ${type} directory found, skipping...`);
        }
      }
    }

    // ========== 注册交互事件监听器 ==========
    client.on('interactionCreate', async (interaction) => {
      try {
        // 1. 处理斜杠命令
        if (interaction.isChatInputCommand()) {
          const command = client.commands.get(interaction.commandName);
          if (!command) {
            return interaction.reply({ content: '❌ 找不到该命令', ephemeral: true });
          }
          await command.execute(interaction);
          return;
        }

        // 2. 处理按钮
        if (interaction.isButton()) {
          const button = client.buttons.get(interaction.customId);
          if (button) {
            await button.execute(interaction);
          }
          return;
        }

        // 3. 处理选择菜单（StringSelectMenu）
        if (interaction.isStringSelectMenu()) {
          const selectMenu = client.selectMenus.get(interaction.customId);
          if (selectMenu) {
            await selectMenu.execute(interaction);
          }
          return;
        }

        // 4. 处理模态框
        if (interaction.isModalSubmit()) {
          const modal = client.modals.get(interaction.customId);
          if (modal) {
            await modal.execute(interaction);
          }
          return;
        }
      } catch (error) {
        logger.error(`交互处理出错:`, error);
        // 如果交互还未回复，发送错误提示
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ 执行时发生错误', ephemeral: true });
        }
      }
    });

  } catch (error) {
    logger.error('Error loading interactions:', error);
  }
};
