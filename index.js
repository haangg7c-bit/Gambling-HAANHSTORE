import express from 'express';
import { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    REST, 
    Routes, 
    SlashCommandBuilder 
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// Web server chống ngủ trên Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot đang hoạt động 24/7!'));
app.listen(PORT, () => console.log(`Web server chạy trên cổng ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Cấu hình ID Kênh Admin và ID Admin (Đã điền sẵn ID kênh từ link của ông)
const ADMIN_CHANNEL_ID = '1553738938810638356'; 
const ADMIN_ROLE_OR_USER_ID = 'ĐIỀN_ID_DISCORD_CỦA_ÔNG_VÀO_ĐÂY'; // Thay ID Discord của ông vào đây để có quyền admin

const balances = new Map();
const histories = new Map();
const forcedResults = new Map();

function getBalance(userId) {
    if (!balances.has(userId)) balances.set(userId, 1000000);
    return balances.get(userId);
}

function setBalance(userId, amount) {
    balances.set(userId, Math.max(0, amount));
}

function parseMoney(str) {
    if (!str) return 0;
    str = str.trim().toLowerCase();
    let multiplier = 1;
    if (str.endsWith('m')) { multiplier = 1000000; str = str.slice(0, -1); }
    else if (str.endsWith('b')) { multiplier = 1000000000; str = str.slice(0, -1); }
    else if (str.endsWith('k')) { multiplier = 1000; str = str.slice(0, -1); }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : Math.floor(num * multiplier);
}

client.once('ready', async () => {
    console.log(`Bot đã đăng nhập thành công: ${client.user.tag}`);
    const commands = [
        new SlashCommandBuilder().setName('tx').setDescription('Mở bảng điều khiển game Tài Xỉu'),
        new SlashCommandBuilder().setName('nap').setDescription('Mở bảng nạp tiền vào bot'),
        new SlashCommandBuilder().setName('bal').setDescription('Kiểm tra số dư tài khoản')
            .addUserOption(option => option.setName('user').setDescription('Người chơi muốn xem').setRequired(false)),
        new SlashCommandBuilder().setName('give').setDescription('Chuyển tiền cho người chơi khác')
            .addUserOption(option => option.setName('nguoinhan').setDescription('Người nhận').setRequired(true))
            .addStringOption(option => option.setName('sotien').setDescription('Số tiền (VD: 1m)').setRequired(true)),
        new SlashCommandBuilder().setName('settx').setDescription('[Admin] Chỉnh kết quả ván tài xỉu tiếp theo')
            .addStringOption(option => option.setName('ketqua').setDescription('Chọn kết quả').setRequired(true)
                .addChoices(
                    { name: 'Tài', value: 'tai' },
                    { name: 'Xỉu', value: 'xiu' },
                    { name: 'Ngẫu nhiên', value: 'random' }
                ))
    ].map(command => command.toJSON());
    const rest = new REST({ version: '10' }).setToken('MTU1Mzc0MDk4ODg1NjU0MTI5Ng.G5FJg2.kpiSqWaBa0mAi3pmNIACLdDjQzc9KFUbuCkr9I');
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Đăng ký Slash Commands thành công!');
    } catch (error) { console.error(error); }
});

client.on('interactionCreate', async (interaction) => {
    const userId = interaction.user.id;

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'tx') {
            const balance = getBalance(userId);
            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('🎲 BẢNG ĐIỀU KHIỂN TÀI XỈU 🎲')
                .setDescription(`Chào **${interaction.user.username}**!\n💰 Số dư: **${balance.toLocaleString()} xu**\n\nBấm nút bên dưới để cược nhanh (100,000 xu/lần):`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_tai').setLabel('Tài').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                new ButtonBuilder().setCustomId('btn_xiu').setLabel('Xỉu').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
                new ButtonBuilder().setCustomId('btn_history').setLabel('Lịch sử').setStyle(ButtonStyle.Secondary).setEmoji('📜')
            );
            return interaction.reply({ embeds: [embed], components: [row] });
        }

        if (commandName === 'nap') {
            const modal = new ModalBuilder().setCustomId('modal_nap').setTitle('💰 NẠP GAMBLING');
            const ignInput = new TextInputBuilder().setCustomId('input_ign').setLabel('In-Game Name (IGN) *').setStyle(TextInputStyle.Short).setRequired(true);
            const moneyInput = new TextInputBuilder().setCustomId('input_money').setLabel('Số tiền (Tối thiểu 1M) *').setPlaceholder('VD: 1M, 2M').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(ignInput), new ActionRowBuilder().addComponents(moneyInput));
            return interaction.showModal(modal);
        }

        if (commandName === 'bal') {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const bal = getBalance(targetUser.id);
            return interaction.reply({ content: `💰 Số dư của **${targetUser.username}**: **${bal.toLocaleString()} xu**`, ephemeral: true });
        }

        if (commandName === 'give') {
            const targetUser = interaction.options.getUser('nguoinhan');
            const amount = parseMoney(interaction.options.getString('sotien'));
            if (targetUser.id === userId) return interaction.reply({ content: '❌ Không thể tự chuyển tiền cho chính mình!', ephemeral: true });
            if (amount <= 0) return interaction.reply({ content: '❌ Số tiền không hợp lệ!', ephemeral: true });
            const senderBal = getBalance(userId);
            if (senderBal < amount) return interaction.reply({ content: `❌ Bạn không đủ tiền! Số dư: **${senderBal.toLocaleString()} xu**.`, ephemeral: true });

            setBalance(userId, senderBal - amount);
            setBalance(targetUser.id, getBalance(targetUser.id) + amount);
            return interaction.reply({ content: `✅ Đã chuyển thành công **${amount.toLocaleString()} xu** cho ${targetUser}!` });
        }

        if (commandName === 'settx') {
            if (userId !== ADMIN_ROLE_OR_USER_ID && !interaction.member.permissions.has('Administrator')) {
                return interaction.reply({ content: '❌ Bạn không có quyền dùng lệnh này!', ephemeral: true });
            }
            const choice = interaction.options.getString('ketqua');
            if (choice === 'random') {
                forcedResults.delete(interaction.guildId);
                return interaction.reply({ content: '✅ Đã đưa kết quả về ngẫu nhiên.', ephemeral: true });
            }
            forcedResults.set(interaction.guildId, choice);
            return interaction.reply({ content: `⚠️ Đã ép kết quả ván tới ra: **${choice.toUpperCase()}**!`, ephemeral: true });
        }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_nap') {
        const ign = interaction.fields.getTextInputValue('input_ign');
        const moneyRaw = interaction.fields.getTextInputValue('input_money');
        const amount = parseMoney(moneyRaw);

        if (amount < 1000000) return interaction.reply({ content: '❌ Số tiền nạp tối thiểu là **1M**!', ephemeral: true });

        await interaction.reply({ content: '✅ Yêu cầu nạp đã gửi đến Admin, vui lòng chờ duyệt!', ephemeral: true });

        const adminChannel = client.channels.cache.get(ADMIN_CHANNEL_ID);
        if (adminChannel) {
            const adminEmbed = new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle('📥 YÊU CẦU NẠP TIỀN MỚI')
                .addFields(
                    { name: '👤 Người chơi', value: `${interaction.user} (${interaction.user.tag})` },
                    { name: '🎮 IGN', value: `\`${ign}\``, inline: true },
                    { name: '💰 Số tiền', value: `**${amount.toLocaleString()} xu**`, inline: true }
                );
            const adminRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_${userId}_${amount}`).setLabel('Duyệt').setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId(`reject_${userId}_${amount}`).setLabel('Không duyệt').setStyle(ButtonStyle.Danger).setEmoji('❌')
            );
            await adminChannel.send({ embeds: [adminEmbed], components: [adminRow] });
        }
    }

    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId.startsWith('approve_') || customId.startsWith('reject_')) {
            if (userId !== ADMIN_ROLE_OR_USER_ID && !interaction.member.permissions.has('Administrator')) {
                return interaction.reply({ content: '❌ Bạn không có quyền thao tác!', ephemeral: true });
            }
            const [action, targetUserId, amountStr] = customId.split('_');
            const amount = parseInt(amountStr);

            if (action === 'approve') {
                setBalance(targetUserId, getBalance(targetUserId) + amount);
                await interaction.update({ content: `✅ **ĐÃ DUYỆT** (+${amount.toLocaleString()} xu cho <@${targetUserId}>)`, components: [] });
                try { const targetUser = await client.users.fetch(targetUserId); await targetUser.send(`🎉 Nạp **${amount.toLocaleString()} xu** thành công!`); } catch(e){}
            } else {
                await interaction.update({ content: `❌ **ĐÃ TỪ CHỐI** yêu cầu nạp tiền.`, components: [] });
                try { const targetUser = await client.users.fetch(targetUserId); await targetUser.send(`😢 Yêu cầu nạp tiền bị từ chối.`); } catch(e){}
            }
            return;
        }

        if (customId === 'btn_history') {
            const userHistory = histories.get(userId) || [];
            const historyText = userHistory.length > 0 ? userHistory.slice(-5).reverse().join('\n') : 'Chưa có lịch sử cược.';
            const historyEmbed = new EmbedBuilder().setColor(0x95A5A6).setTitle('📜 Lịch sử 5 ván gần nhất').setDescription(historyText);
            return interaction.reply({ embeds: [historyEmbed], ephemeral: true });
        }

        if (customId === 'btn_tai' || customId === 'btn_xiu') {
            const choice = customId === 'btn_tai' ? 'tai' : 'xiu';
            const betAmount = 100000;
            const currentBal = getBalance(userId);

            if (currentBal < betAmount) return interaction.reply({ content: `❌ Không đủ tiền! Số dư: **${currentBal.toLocaleString()} xu**`, ephemeral: true });

            setBalance(userId, currentBal - betAmount);
            await interaction.update({ content: `🎲 Đang lắc xúc xắc cho cửa **${choice.toUpperCase()}**...`, embeds: [], components: [] });

            setTimeout(async () => {
                let d1, d2, d3, total, result;
                const forced = forcedResults.get(interaction.guildId);

                if (forced) {
                    if (forced === 'tai') { d1 = 4; d2 = 4; d3 = 4; total = 12; result = 'tai'; }
                    else { d1 = 2; d2 = 2; d3 = 2; total = 6; result = 'xiu'; }
                    forcedResults.delete(interaction.guildId);
                } else {
                    d1 = Math.floor(Math.random() * 6) + 1;
                    d2 = Math.floor(Math.random() * 6) + 1;
                    d3 = Math.floor(Math.random() * 6) + 1;
                    total = d1 + d2 + d3;
                    result = (d1 === d2 && d2 === d3) ? 'bau' : (total >= 11 ? 'tai' : 'xiu');
                }

                let updatedBal = getBalance(userId);
                let msgResult = '', historyLog = '';

                if (result === 'bau') {
                    msgResult = `💥 Ra bão (${d1}-${d2}-${d3} = ${total}). Nhà cái ăn hết!`;
                    historyLog = `❌ Thua (Bão) | Tổng: ${total}`;
                } else if (result === choice) {
                    const winMoney = betAmount * 2;
                    updatedBal += winMoney;
                    setBalance(userId, updatedBal);
                    msgResult = `🎉 **THẮNG!** Xúc xắc: **${d1} - ${d2} - ${d3}** (Tổng: **${total}** - **${result.toUpperCase()}**)\nNhận **+${winMoney.toLocaleString()} xu**!`;
                    historyLog = `✅ Thắng ${result.toUpperCase()} | Tổng: ${total}`;
                } else {
                    msgResult = `😢 **THUA!** Xúc xắc: **${d1} - ${d2} - ${d3}** (Tổng: **${total}** - **${result.toUpperCase()}**).`;
                    historyLog = `❌ Thua ${result.toUpperCase()} | Tổng: ${total}`;
                }

                if (!histories.has(userId)) histories.set(userId, []);
                histories.get(userId).push(historyLog);

                const finalEmbed = new EmbedBuilder()
                    .setColor(result === choice ? 0x2ECC71 : 0xE74C3C)
                    .setTitle('🎲 KẾT QUẢ TÀI XỈU 🎲')
                    .setDescription(msgResult)
                    .addFields({ name: '💰 Số dư', value: `**${updatedBal.toLocaleString()} xu**` });

                const newRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_tai').setLabel('Tài').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                    new ButtonBuilder().setCustomId('btn_xiu').setLabel('Xỉu').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
                    new ButtonBuilder().setCustomId('btn_history').setLabel('Lịch sử').setStyle(ButtonStyle.Secondary).setEmoji('📜')
                );

                await interaction.editReply({ content: null, embeds: [finalEmbed], components: [newRow] });
            }, 1500);
        }
    }
});



// Đường dẫn chính của trang web: https://gambling-haanhstore-1.onrender.com/
app.get('/', (req, res) => {
  res.send('Bot Tai Xiu dang hoat dong 24/7 tai https://gambling-haanhstore-1.onrender.com/');
});

app.listen(port, () => {
  console.log(`Web server dang chay va san sang tai https://gambling-haanhstore-1.onrender.com/ trên cổng ${port}`);
});

client.login('MTU1Mzc0MDk4ODg1NjU0MTI5Ng.GLKv-o.fiTT1lrMGYocRKONjqCGWN-3VR34PhHC9PhmZU');


