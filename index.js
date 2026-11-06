const { Client: BotClient, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Control Bot is Alive!'));
app.listen(process.env.PORT || 3000, () => console.log('Express Server Ready'));

const client = new BotClient({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.once('ready', async () => {
  console.log(`✔ بوت التحكم شغال باسم: ${client.user.tag}`);

  const command = new SlashCommandBuilder()
    .setName('run')
    .setDescription('دخل أي حساب بالروم وخليه شغال 24 ساعة')
    .addStringOption(option => 
      option.setName('token').setDescription('توكن الحساب').setRequired(true))
    .addStringOption(option => 
      option.setName('channel_id').setDescription('آيدي الروم الصوتي').setRequired(true));

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: [command.toJSON()] });
    console.log('✔ تم تسجيل أمر /run بنجاح!');
  } catch (error) {
    console.error('خطأ في تسجيل الأمر:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'run') {
    const token = interaction.options.getString('token');
    const channelId = interaction.options.getString('channel_id');

    await interaction.reply({ content: '⏳ جاري تشغيل الحساب وإدخاله الروم...', ephemeral: true });

    try {
      const selfClient = new SelfClient({ checkUpdate: false });

      selfClient.on('ready', async () => {
        console.log(`[تحكم] تم تسجيل الدخول للحساب: ${selfClient.user.tag}`);
        await joinAndKeep(selfClient, channelId);
      });

      selfClient.on('voiceStateUpdate', async (oldState, newState) => {
        if (selfClient.user && oldState.id === selfClient.user.id) {
          if (oldState.channelId && !newState.channelId) {
            console.log('[تحكم] تم إخراج الحساب، جاري إعادته فوراً...');
            setTimeout(() => joinAndKeep(selfClient, channelId), 3000);
          }
        }
      });

      await selfClient.login(token);
      await interaction.followUp({ content: `✅ تم تشغيل الحساب واستقراره في الروم بنجاح!`, ephemeral: true });
    } المشروع catch (err) {
      await interaction.followUp({ content: `❌ فشل التشغيل: تأكد أن التوكن صحيح أو الروم صوتي.`, ephemeral: true });
    }
  }
});

async function joinAndKeep(selfClient, channelId) {
  try {
    const channel = await selfClient.channels.fetch(channelId);
    if (channel && channel.isVoice()) {
      await selfClient.voice.joinChannel(channel, {
        selfMute: false,
        selfDeaf: false,
      });
      console.log(`🎉 الحساب دخل الروم: ${channel.name} وشغال بدون ما يفك.`);
    }
  } catch (err) {
    console.error('خطأ في دخول الصوت:', err.message);
    setTimeout(() => joinAndKeep(selfClient, channelId), 5000);
  }
}

client.login(process.env.DISCORD_BOT_TOKEN);
