const { 
  Client: BotClient, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle 
} = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Control Bot is Alive!'));
app.listen(process.env.PORT || 3000, () => console.log('Express Server Ready'));

const client = new BotClient({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

// تخزين الحسابات النشطة لكل مستخدم
const activeSelfBots = new Map();

client.once('ready', async () => {
  console.log(`✔ بوت التحكم شغال باسم: ${client.user.tag}`);

  // تسجيل أمر /panel لإرسال لوحة التحكم بالسيرفر
  const command = new SlashCommandBuilder()
    .setName('panel')
    .setDescription('إرسال لوحة التحكم التفاعلية لإدارة السيلف بوت في الرومات الصوتية');

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: [command.toJSON()] });
    console.log('✔ تم تسجيل أمر /panel بنجاح!');
  } catch (error) {
    console.error('خطأ في تسجيل الأمر:', error);
  }
});

client.on('interactionCreate', async interaction => {
  // 1. التعامل مع أمر /panel
  if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎛️ لوحة تحكم السيلف بوت الصوتية')
      .setDescription('استخدم الأزرار أدناه للتحكم الكامل:\n\n• **تشغيل حساب**: لإدخال التوكن والآيدي وربطه بالروم الصوتي.\n• **التحكم بالصوت**: لضبط الميوت والسماعات للحساب.')
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_modal_btn')
        .setLabel('➕ تشغيل حساب جديد')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('toggle_audio_btn')
        .setLabel('🔊 ضبط الصوت (ميوت/ديفن)')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    return;
  }

  // 2. الضغط على زر فتح النافذة (Modal)
  if (interaction.isButton() && interaction.customId === 'open_modal_btn') {
    const modal = new ModalBuilder()
      .setCustomId('run_bot_modal')
      .setTitle('إعدادات تشغيل الحساب الصوتي');

    const tokenInput = new TextInputBuilder()
      .setCustomId('token_input')
      .setLabel('توكن الحساب (Token)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ضع توكن حساب الديسكورد هنا...')
      .setRequired(true);

    const channelInput = new TextInputBuilder()
      .setCustomId('channel_input')
      .setLabel('آيدي الروم الصوتي (Channel ID)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('مثال: 123456789012345678')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(tokenInput),
      new ActionRowBuilder().addComponents(channelInput)
    );

    await interaction.showModal(modal);
    return;
  }

  // 3. الضغط على زر تحكم الصوت
  if (interaction.isButton() && interaction.customId === 'toggle_audio_btn') {
    const botData = activeSelfBots.get(interaction.user.id);
    if (!botData || !botData.selfClient) {
      return interaction.reply({ content: '❌ ليس لديك أي حساب مسجل أو شغال حالياً عبر هذه اللوحة.', ephemeral: true });
    }

    try {
      const channelId = botData.channelId;
      const selfClient = botData.selfClient;
      const channel = await selfClient.channels.fetch(channelId);
      
      if (channel && channel.isVoice()) {
        await selfClient.voice.joinChannel(channel, {
          selfMute: false,
          selfDeaf: false,
        });
        await interaction.reply({ content: '✅ تم تحديث حالة الصوت وإلغاء الميوت/الديفن بنجاح!', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ لم يتم العثور على الروم الصوتي.', ephemeral: true });
      }
    } catch (err) {
      await interaction.reply({ content: `❌ حدث خطأ أثناء تعديل الصوت: ${err.message}`, ephemeral: true });
    }
    return;
  }

  // 4. استقبال البيانات من النافذة (Modal Submit)
  if (interaction.isModalSubmit() && interaction.customId === 'run_bot_modal') {
    const token = interaction.fields.getTextInputValue('token_input');
    const channelId = interaction.fields.getTextInputValue('channel_input');

    await interaction.reply({ content: '⏳ جاري التحقق وتسجيل الدخول وإدخال الروم...', ephemeral: true });

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
      
      // حفظ الجلسة الخاصة بالمستخدم
      activeSelfBots.set(interaction.user.id, { selfClient, channelId });

      await interaction.followUp({ 
        content: `✅ تم تشغيل الحساب **${selfClient.user.tag}** واستقراره في الروم الصوتي بنجاح وثبات تام!`, 
        ephemeral: true 
      });
    } catch (err) {
      await interaction.followUp({ 
        content: `❌ فشل التشغيل: تأكد أن التوكن صحيح أو آيدي الروم صالح (يمكنه دخول أي سيرفر آخر).`, 
        ephemeral: true 
      });
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
