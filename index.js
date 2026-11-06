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

// جدول لحفظ الحسابات النشطة ومعلوماتها بالكامل
const activeAccounts = new Map(); // مفتاح: token أو معرف فرعي، القيمة: تفاصيل الحساب

client.once('ready', async () => {
  console.log(`✔ بوت التحكم شغال باسم: ${client.user.tag}`);

  const command = new SlashCommandBuilder()
    .setName('panel')
    .setDescription('إرسال لوحة التحكم ومراقبة الحسابات الصوتية المتصلة');

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: [command.toJSON()] });
    console.log('✔ تم تسجيل أمر /panel بنجاح!');
  } catch (error) {
    console.error('خطأ في تسجيل الأمر:', error);
  }
});

client.on('interactionCreate', async interaction => {
  // 1. أمر /panel لإرسال اللوحة
  if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
    await sendControlPanel(interaction);
    return;
  }

  // 2. زر فتح نافذة تشغيل حساب جديد
  if (interaction.isButton() && interaction.customId === 'open_modal_btn') {
    const modal = new ModalBuilder()
      .setCustomId('run_bot_modal')
      .setTitle('تشغيل حساب جديد في الروم الصوتي');

    const tokenInput = new TextInputBuilder()
      .setCustomId('token_input')
      .setLabel('توكن الحساب (Token)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ضع توكن الحساب هنا...')
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

  // 3. زر تحديث الحالة (Refresh Status)
  if (interaction.isButton() && interaction.customId === 'refresh_status_btn') {
    await updatePanelMessage(interaction);
    return;
  }

  // 4. استقبال البيانات من النافذة وتشغيل السيلف بوت
  if (interaction.isModalSubmit() && interaction.customId === 'run_bot_modal') {
    const token = interaction.fields.getTextInputValue('token_input');
    const channelId = interaction.fields.getTextInputValue('channel_input');
    const ownerTag = interaction.user.tag;
    const ownerId = interaction.user.id;

    await interaction.reply({ content: '⏳ جاري التحقق من الحساب وإدخاله الروم...', ephemeral: true });

    try {
      const selfClient = new SelfClient({ checkUpdate: false });

      selfClient.on('ready', async () => {
        const botTag = selfClient.user.tag;
        console.log(`[تحكم] تم تسجيل الدخول للحساب: ${botTag} بواسطة ${ownerTag}`);
        
        // حفظ الحساب في قائمة المراقبة
        activeAccounts.set(token, {
          tag: botTag,
          channelId: channelId,
          owner: ownerTag,
          ownerId: ownerId,
          status: 'متصل وثابت 🟢',
          selfClient: selfClient
        });

        await joinAndKeep(selfClient, channelId, token);
      });

      // مراقبة حالة الصوت لو الحساب طلع أو فصل
      selfClient.on('voiceStateUpdate', async (oldState, newState) => {
        if (selfClient.user && oldState.id === selfClient.user.id) {
          // إذا طلع من الروم
          if (oldState.channelId && !newState.channelId) {
            console.log(`[تنبيه] الحساب ${selfClient.user.tag} خرج من الروم! جاري إعادته...`);
            
            // تحديث الحالة في القائمة
            const acc = activeAccounts.get(token);
            if (acc) acc.status = 'فصل وجاري إعادة الاتصال 🟡';

            setTimeout(() => joinAndKeep(selfClient, channelId, token), 3000);
          }
          // إذا رجع وشبك
          else if (!oldState.channelId && newState.channelId) {
            const acc = activeAccounts.get(token);
            if (acc) acc.status = 'متصل وثابت 🟢';
          }
        }
      });

      await selfClient.login(token);

      await interaction.followUp({ 
        content: `✅ تم تشغيل الحساب بنجاح وتم إضافته إلى لوحة المراقبة!`, 
        ephemeral: true 
      });
    } catch (err) {
      await interaction.followUp({ 
        content: `❌ فشل التشغيل: تأكد من صحة التوكن أو آيدي الروم.`, 
        ephemeral: true 
      });
    }
  }
});

// دالة لدخول الروم والبقاء فيه
async function joinAndKeep(selfClient, channelId, token) {
  try {
    const channel = await selfClient.channels.fetch(channelId);
    if (channel && channel.isVoice()) {
      await selfClient.voice.joinChannel(channel, {
        selfMute: false,
        selfDeaf: false,
      });
      const acc = activeAccounts.get(token);
      if (acc) acc.status = 'متصل وثابت 🟢';
      console.log(`🎉 الحساب دخل الروم بنجاح وثبت فيه.`);
    }
  } catch (err) {
    console.error('خطأ في دخول الصوت:', err.message);
    const acc = activeAccounts.get(token);
    if (acc) acc.status = 'خطأ في الاتصال 🔴';
    setTimeout(() => joinAndKeep(selfClient, channelId, token), 5000);
  }
}

// دالة إنشاء لوحة التحكم
async function sendControlPanel(interaction) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('📊 لوحة مراقبة الحسابات الصوتية')
    .setDescription('هذه اللوحة تعرض كافة الحسابات الشغالة حالياً، من الذي قام بتشغيلها، وحالتها في الرومات الصوتية.')
    .setTimestamp();

  if (activeAccounts.size === 0) {
    embed.addFields({ name: 'الحسابات النشطة', value: 'لا توجد أي حسابات تعمل حالياً. اضغط على زر التشغيل بالأسفل لإضافة حساب.' });
  } else {
    let desc = '';
    activeAccounts.forEach((acc, token) => {
      desc += `👤 **الحساب:** \`${acc.tag}\`\n🔊 **الروم:** \`${acc.channelId}\`\n🛠️ **شغله العضو:** <@${acc.ownerId}>\n📌 **الحالة:** ${acc.status}\n----------------------------------\n`;
    });
    embed.addFields({ name: '🎛️ قائمة الحسابات المتصلة:', value: desc });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_modal_btn')
      .setLabel('➕ تشغيل حساب جديد')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('refresh_status_btn')
      .setLabel('🔄 تحديث الحالة')
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

// دالة تحديث الرسالة لما يضغط زر التحديث
async function updatePanelMessage(interaction) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('📊 لوحة مراقبة الحسابات الصوتية')
    .setDescription('تم تحديث بيانات وحالة الحسابات المتصلة حالياً.')
    .setTimestamp();

  if (activeAccounts.size === 0) {
    embed.addFields({ name: 'الحسابات النشطة', value: 'لا توجد أي حسابات تعمل حالياً.' });
  } else {
    let desc = '';
    activeAccounts.forEach((acc, token) => {
      desc += `👤 **الحساب:** \`${acc.tag}\`\n🔊 **الروم:** \`${acc.channelId}\`\n🛠️ **شغله العضو:** <@${acc.ownerId}>\n📌 **الحالة:** ${acc.status}\n----------------------------------\n`;
    });
    embed.addFields({ name: '🎛️ قائمة الحسابات المتصلة:', value: desc });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_modal_btn')
      .setLabel('➕ تشغيل حساب جديد')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('refresh_status_btn')
      .setLabel('🔄 تحديث الحالة')
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

client.login(process.env.DISCORD_BOT_TOKEN);
