// Bot discord permettant de limiter les raid et spam sur un serveur
/*
• Ban virtuel si :
// En 20s :
Si l'utilisateur a envoyé plus de 12 messages
Si l'utilisateur a envoyé plus de 6 messages dupliqués
Si l'utilisateur a envoyé plus de 6 messages avec des mentions
Si l'utilisateur a envoyé plus de 5 messages avec des liens ou fichiers
Ou une combinaison de ces critères
{scoreMsg: 0.83, scoreDupliMsg: 1.66, scoreMention: 1.66, scoreMedia: 2}

Bannissement virtuel : donne un role "ban" qui donne accès à un unique salon avec la raison du ban et les 100 derniers messages envoyés par le banni

• Passage en mode raid si sur le serveur :
‌Sur les 30 dernières secondes, plus de un message toute les 0,5 secondes
‌40% des messages des 30 dernières secondes sont des liens, mentions ou image/fichier
Si plus de 20 messages sont dupliqués dans les 200 derniers messages (30s)
Le mode raid bloque les messages dans tout les salons et stop la vérification dans le salon de vérification
Il supprime les 100 derniers messages des membres ayant spammé
Désactivation du mode raid après 10 minutes
*/

// Require the necessary discord.js classes
const { Client, IntentsBitField, Partials} = require('discord.js');
const { token } = require('./real_config.json');
const { config } = require('./real_config.json')
const { SlashCommandBuilder } = require('discord.js');

// Create a new client instance
const Intents = new IntentsBitField();
Intents.add(IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.MessageContent, IntentsBitField.Flags.GuildMessageReactions, IntentsBitField.Flags.GuildMembers, IntentsBitField.Flags.GuildInvites);
const client = new Client({ intents: Intents, partials: [Partials.Message, Partials.Channel, Partials.Reaction]});

// Variables globales

// Liste des utilisateurs, leurs nombres de messages, de mentions/liens/fichiers, et de leurs derniers messages
// Pour chaque serveur
//{"server":{"example":{nbMsg:0, nbHeavyMsg:0, nbDuplicMsg:0, last100Msg:[]}}}
var usersData = {};
// {"server":{threatScore: 0, last200Msg:[]}}
var serverData = {};

// {"server": {raidMode: false, raidModeTime: 0}}
var raidData = {};



client.on('messageCreate', message => {
    const guildId = message.guildId;

    if (!guildId) return;

    // Si le message est envoyé par le bot, on ne fait rien
    if (message.author.bot) return;

    // Si l'utilisateur n'est pas dans la liste des utilisateurs, on l'ajoute
    if (!(message.author.id in usersData[guildId])) {
        usersData[guildId][message.author.id] = {threatScore: 0, last100Msg:[]};
    }

    // On ajoute le message à la liste des 100 derniers messages de l'utilisateur
    usersData[guildId][message.author.id].last100Msg.push([message, message.content]);
    // Si la liste est trop longue, on supprime le premier élément
    if (usersData[guildId][message.author.id].last100Msg.length > 100) {
        usersData[guildId][message.author.id].last100Msg.shift();
    }

    //On ajoute le message à la liste des 200 derniers messages du serveur
    serverData[guildId].last200Msg.push([message, message.content]);
    // Si la liste est trop longue, on supprime le premier élément
    if (serverData[guildId].last200Msg.length > 200) {
        serverData[guildId].last200Msg.shift();
    }

    var isHeavyMsg = false;
    var threatConfig = config[guildId].threatConfig;

    // Si le message contient une mention
    if(message.mentions.users.size > 0 || message.mentions.roles.size > 0 || message.mentions.everyone) {
        usersData[guildId][message.author.id].threatScore += threatConfig.scoreMention;
        serverData[guildId].threatScore += threatConfig.scoreMention;
        isHeavyMsg = true;
    }

    // Si le message contient un lien ou un fichier
    if (message.attachments.size > 0 || message.embeds.length > 0 || message.content.includes("http")) {
        usersData[guildId][message.author.id].threatScore += threatConfig.scoreMedia;
        serverData[guildId].threatScore += threatConfig.scoreMedia;
        isHeavyMsg = true;
    }

    // Si le message est un doublon, on incrémente le nombre de doublons de l'utilisateur
    if (usersData[guildId][message.author.id].last100Msg.filter(msg => msg[1] == message.content).length > 1) {
        usersData[guildId][message.author.id].threatScore += threatConfig.scoreDupliMsg;
        isHeavyMsg = true;
    }

    // Si le message est un doublon, on incrémente le nombre de doublons du serveur
    if (serverData[guildId].last200Msg.filter(msg => msg[1] == message.content).length > 1) {
        serverData[guildId].threatScore += threatConfig.scoreDupliMsg;
    }

    if(!isHeavyMsg){
        usersData[guildId][message.author.id].threatScore += threatConfig.scoreMsg;
        serverData[guildId].threatScore += threatConfig.scoreMsg;
    }

});

client.on('guildMemberRemove', async (user) => {

    const guildId = user.guild.id;
    const guild  = await client.guilds.cache.get(guildId);

    if(!guildId || !guild) return;

    // On supprime l'utilisateur de la liste des utilisateurs
    delete usersData[guildId][user.id];
    channelInfo = await guild.channels.cache.get(config[guildId]["channels"].channelInfoId);
    if(config[guildId]["channels"].channelGateEnabled){
        channelGate = await guild.channels.cache.get(config[guildId]["channels"].channelGateId);
    }

    // On envoie un message dans le salon d'info
    channelInfo.send("L'utilisateur " + user.user.username + " (<@" + user.id +">) a quitté le serveur.");
    // On envoie un message dans le salon de gate
    if(config[guildId]["channels"].channelGateEnabled) {
        channelGate.send("> L'aventurier.e " + user.user.username + "(<@" + user.id + ">) a quitté la guilde. On lui souhaite une bonne continuation !");
    }

});

client.on('guildMemberAdd', async (user) => {

    const guildId = user.guild.id;
    const guild  = await client.guilds.cache.get(guildId);

    if(!guildId || !guild) return;

    channelInfo = await guild.channels.cache.get(config[guildId]["channels"].channelInfoId);
    if(config[guildId]["channels"].channelGateEnabled){
        channelGate = await guild.channels.cache.get(config[guildId]["channels"].channelGateId);
    }

    // On envoie un message dans le salon d'info
    channelInfo.send("L'utilisateur " + user.user.username + " (<@" + user.id +">) a rejoint le serveur.");
    // On envoie un message dans le salon de gate
    if(config[guildId]["channels"].channelGateEnabled) {
        channelGate.send("> L'aventurier.e " + user.user.username + " a rejoint la guilde.");
    }
});

client.on('messageReactionAdd', async (reaction, user) => {


    const guildId = reaction.message.guild.id;
    if(!guildId || !config[guildId]["verification"].enableVerification) return;

    const guild  = await client.guilds.cache.get(guildId);
    if(!guild) return;

    channelInfo = await guild.channels.cache.get(config[guildId]["channels"].channelInfoId);

    //On vérifie que la réaction est sur le message de vérification
    if (reaction.message.id == config[guildId]["verification"].idMessageVerification) {
        // Info de l'ajout du rôle
        channelInfo.send("L'utilisateur " + user.username + " (<@" + user.id +">) a démarré la vérification.");

        // On lui donne le rôle membre après 5 minutes
        setTimeout(() => verifyUser(guildId, user.id), 300000);//300000
    }
});

async function verifyUser(guildId, userId){
    // On récupère le membre
    var member = await client.guilds.cache.get(guildId).members.cache.get(userId);

    // On vérifie si le membre est toujours sur le serveur
    if(member == undefined) return;

    channelInfo = await guild.channels.cache.get(config[guildId]["channels"].channelInfoId);
    if(config[guildId]["channels"].channelWelcomeEnabled){
        channelWelcome = await guild.channels.cache.get(config[guildId]["channels"].channelWelcomeId);
    }

    // On ajoute le role membre à l'utilisateur
    if(!raidData[guildId].raidMode) {
        // On vérifie si le membre a pas déja le role membre
        if(!member.roles.cache.some(role => role.id === config[guildId]["roles"].roleMemberId)) {
            member.roles.add(config[guildId]["roles"].roleMemberId);
            member.roles.remove(config[guildId]["verification"].roleVerifId);
            // Info de l'ajout du rôle
            channelInfo.send("L'utilisateur " + member.user.username + " (<@" + member.user.id +">) a été vérifié.");
            // On envoie un message de bienvenue
            if(config[guildId]["channels"].channelWelcomeEnabled){
                channelWelcome.send("> Bienvenue dans la guilde <@" + member.user.id +"> !\n\n");
            }
        } else {
	        channelInfo.send("L'utilisateur " + member.user.username + " (<@" + member.user.id +">) est déjà membre.");
	    }
    }
}


client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;
    
    if (interaction.commandName === "raid") {

        const guildId = interaction.guild.id;
        const guild  = await client.guilds.cache.get(guildId);

        if(!guildId || !guild) return;
        
        channelRaidInfo = await guild.channels.cache.get(config[guildId]["channels"].channelRaidInfoId);
        channelInfo = await guild.channels.cache.get(config[guildId]["channels"].channelInfoId);

        // On vérifie que l'utilisateur est un membre du staff
        var isallowed = false;
        for(let roleId of config[guildId]["roles"].rolesStaffId){
            if(interaction.member.roles.cache.has(roleId)){
                isallowed = true;
                break;
            }
        }
        if(isallowed) {
            // On récupère l'option
            const enable = interaction.options.getBoolean('enable');
            if(enable) {
                // On active le mode raid
                await interaction.reply("Le mode raid a été activé");
                raidData[guildId].raidMode = true;
                lockChannels(guild, guildId);

                var logString = `> Le mode raid a été activé par ${interaction.user.username} (<@${interaction.user.id}>).`
                channelRaidInfo.send("> Le mode raid vient d'être activé");

                // On récupère l'option time
                const time = interaction.options.getInteger('time');
                if(time == null) {
                    raidData[guildId].raidModeTime = 3*config[guildId]["raid"].defaultRaidModeTime;
                } else {
                    raidData[guildId].raidModeTime = 3*time;
                    logString += ` Le mode raid sera désactivé dans ${time} minutes.`;
                }
                channelInfo.send(logString);
            }
            else {
                // On désactive le mode raid
                await interaction.reply("Le mode raid a été désactivé");
                raidData[guildId].raidMode = false;
                raidData[guildId].raidModeTime = 0;
                unlockChannels(guild, guildId);

                channelInfo.send(`> Le mode raid a été désactivé par ${interaction.user.username}.`);
                channelRaidInfo.send("> Le mode raid vient d'être désactivé.");
            }
        }
        else {
            await interaction.reply("Vous n'avez pas les permissions pour effectuer cette commande.");
        }
    }
});


async function main(){
    setInterval(userAndServerCheck, 20000);
}

async function userAndServerCheck(){
    await serverCheck();
    await userCheck();
}

async function userCheck(){
    for (const [guildId, users] of Object.entries(usersData)) {
        // On parcourt la liste des utilisateurs
        const guild  = await client.guilds.cache.get(guildId);
        if(!guild) continue;

        for (const [id, user] of Object.entries(usersData[guildId])) {
            // On récupère le membre
            var member = await guild.members.cache.get(id);

            // En 20s :
            // Si l'utilisateur a envoyé plus de 12 messages
            // Si l'utilisateur a envoyé plus de 6 messages dupliqués
            // Si l'utilisateur a envoyé plus de 6 messages avec des mentions
            // Si l'utilisateur a envoyé plus de 5 messages avec des liens ou fichiers

            if(user.threatScore > config[guildId]["threatConfig"].maxUserScore){
                // On banni l'utilisateur et on supprime ses messages
                banMember(guild, [member]);
                user.threatScore = 0;
            }

            // On décrémente le threatScore de l'utilisateur
            if(user.threatScore > config[guildId]["threatConfig"].userScoreRegen){
                user.threatScore -= config[guildId]["threatConfig"].userScoreRegen;
            }
            else {
                user.threatScore = 0;
            }


            // On check si ca fait plus d'une heure que l'utilisateur n'a pas envoyé de message
            if(user.last100Msg != undefined && user.last100Msg.length > 0){
                // On recupere le temps du dernier message
                var lastMsgTime = (user.last100Msg[user.last100Msg.length-1][0].createdTimestamp/1000).toFixed(0);
                // On recupere le temps actuel
                var currentTime = (new Date().getTime()/1000).toFixed(0);
                // Si ca fait plus d'une heure
                if(currentTime - lastMsgTime > 3600) {
                    // On retire le membre de la liste
                    delete usersData[guildId][id];
                }
            }
        }
    }
}


async function serverCheck(){
    // Si sur les 20 dernières secondes :
    // Il y a eu plus de un message toute les 0,47 secondes (42 msg /20s)
    // 40% des messages sont des liens, mentions ou image/fichier
    // Plus de 20 messages sont dupliqués dans les 200 derniers messages

    for (const [guildId, users] of Object.entries(usersData)) {
        // On parcourt la liste des utilisateurs
        const guild  = await client.guilds.cache.get(guildId);
        if(!guild) continue;
        
        channelInfo = await guild.channels.cache.get(config[guildId]["channels"].channelInfoId);
        channelRaidInfo = await guild.channels.cache.get(config[guildId]["channels"].channelRaidInfoId);
        if(serverData[guildId].threatScore > config[guildId]["threatConfig"].maxServerScore){//35
            var badUserIdList = [];
            // On récupère les membres ayant un threatScore >= 8
            for (const [id, user] of Object.entries(usersData[guildId])) {
                if (user.threatScore >= 0.8*config[guildId]["threatConfig"].maxUserScore) {
                    badUserIdList.push(id);
                }
            }

            // On bloque les salons (on passe en mode raid pour defaultRaidModeTime minutes) si plus de un membre a spammé
            if (badUserIdList.length > 1) {//1
                raidData[guildId].raidMode = true;
                raidData[guildId].raidModeTime = 3*raidData[guildId].defaultRaidModeTime;

                lockChannels(guild, guildId);

                //On envoie un message dans le salon info
                channelRaidInfo.send("> Le mode raid vient d'être activé.");
                channelInfo.send(`> Le mode raid a été activé.`);

                // On supprime les 100 derniers messages des membres ayant envoyé le plus de messages
                ban_member_list = [];
                for(id of badUserIdList) {
                    var member = await guild.members.cache.get(id);
                    ban_member_list.push(member);
                    usersData[guildId][id].threatScore = 0;
                }
                banMember(guild, ban_member_list);
            }
        }

        // On remet à 0 les données du serveur
        serverData[guildId].threatScore = 0;


        if(raidData[guildId].raidMode) {
            raidData[guildId].raidModeTime--;
            if (raidData[guildId].raidModeTime <= 0) {
                // On désactive le mode raid
                raidData[guildId].raidMode = false;
                raidData[guildId].raidModeTime = 0;

                unlockChannels(guild, guildId);

                //On envoie un message dans le salon info
                channelRaidInfo.send("> Le mode raid vient d'être désactivé.");
                channelInfo.send(`> Le mode raid a été désactivé.`);
            }
        }


        if(serverData[guildId].last200Msg.length > 0){
            // On check si ca fait plus d'une heure qu'un utilisateur a envoyé un message
            // On recupere le temps du dernier message
            var lastMsgTime = (serverData[guildId].last200Msg[serverData[guildId].last200Msg.length-1][0].createdTimestamp/1000).toFixed(0);
            // On recupere le temps actuel
            var currentTime = (new Date().getTime()/1000).toFixed(0);
            // Si ca fait plus d'une heure
            if(currentTime - lastMsgTime > 3600) {
                // On remet purge la liste des messages du serveur
                serverData[guildId].last200Msg = [];
            }
        }

    }

}

async function lockChannels(guild, guildId){
    try {
        manageGuildLock(guild, guildId, true);
    }
    catch {
        channelInfo = await guild.channels.cache.get(config[guildId]["channels"].channelInfoId);
        channelInfo.send("Erreur lors du lock des salons");
        //console.log("Erreur lors du lock des salons");
    }
    
}

async function unlockChannels(guild, guildId){
    try {
        manageGuildLock(guild, guildId, false);
    }
    catch {
        channelInfo = await guild.channels.cache.get(config[guildId]["channels"].channelInfoId);
        channelInfo.send("Erreur lors de l'unlock des salons");
        //console.log("Erreur lors de l'unlock des salons");
    }
}

async function manageGuildLock(guild, guildId, enable){

    //On met en pause ou unpause les invitations
    try {
        await guild.disableInvites(enable);
    }
    catch {
        channelInfo = await guild.channels.cache.get(config[guildId]["channels"].channelInfoId);
        channelInfo.send("Erreur lors de la gestion des invitations");
    }

    if(!config[guildId]["raid"].enableLock) return;

    // On bloque/débloque les salons dans les catégories du fichier de config
    let roleMember = await guild.roles.cache.get(config[guildId]["roles"].roleMemberId);


    config[guildId]["raid"].lockedCategories.forEach(async (categoryId) => {
        category = await guild.channels.cache.get(categoryId);
        category.children.cache.forEach(channel => {
            if (channel.type == 0) {
                channel.permissionOverwrites.edit(roleMember, {"SendMessages": !enable});
            }
        });

    });

    // Des salons non présent dans une catégorie
    config[guildId]["raid"].lockedChannels.forEach(async (channelId) => {
        channel = await guild.channels.cache.get(channelId);
        if (channel.type == 0) {
            channel.permissionOverwrites.edit(roleMember, {"SendMessages": !enable});
        }
    });
}

async function banMember(guild, members){

    const guildId = guild.id;

    if(!guildId || !guild) return;

    channelInfo = await guild.channels.cache.get(config[guildId]["channels"].channelInfoId);
    if(config[guildId]["channels"].channelGateEnabled){
        channelGate = await guild.channels.cache.get(config[guildId]["channels"].channelGateId);
    }

    for (var member of members) {
        try {
            // On le banni
            await member.roles.add(config[guildId]["roles"].roleBanId);
            // On supprime le rôle membre
            await member.roles.remove(config[guildId]["roles"].roleMemberId);
            // On supprime les 100 derniers messages
            channelInfo.send("L'utilisateur <@" + member.id +"> a été exclu temporairement.");
            if(config[guildId]["channels"].channelGateEnabled){
                channelGate.send("> Le membre <@" + member.id +"> a été exclu temporairement.");
            }
        }
        catch {
            channelInfo.send("Erreur lors du bannissement du membre <@" + member.id +">");
            //console.log("Erreur lors du bannissement d'un membre");
        }
        
    }

    for (var member of members) {
        var messages = usersData[guildId][member.id].last100Msg;
        var message_dict = {};
        for (const [message, content] of messages) {
            if (message.channel.id in message_dict) {
                message_dict[message.channel.id].push(message);
            } else {
                message_dict[message.channel.id] = [message];
            }
        }

        //On supprime les messages en bulk
        for (let [channelId, messages] of Object.entries(message_dict)) {
            try {
                await guild.channels.cache.get(channelId).bulkDelete(messages);
            }
            catch {
                //console.log("Erreur lors de la suppression d'un message");
            }
            sleep(500);
        }
        // On envoie un log des messages
        log_text = "Suppression message de <@" + member.id + "> :";
        var messages = usersData[guildId][member.id].last100Msg;
        for (const [message, content] of messages) {
            if(log_text.length + content.length < 1500){
                log_text += "```"+ content + "```";
            } else {
                channelInfo.send(log_text);
                log_text = "Suppression message de <@" + member.id + "> :";
            }
        }
        channelInfo.send(log_text);
        usersData[guildId][member.id].last100Msg = [];
    }
}


function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
}
    

// When the client is ready, run this code (only once)
client.once('ready', async () => {
    console.log('Ready!');
    client.user.setPresence({ activities: [{ name: "Guarding your server" }], status: 'idle' });

    const raidCommand = new SlashCommandBuilder()
        .setName('raid')
        .setDescription('Active ou désactive le mode raid')
        .addBooleanOption(option =>
            option.setName('enable')
                .setDescription('Active ou désactive')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('time')
                .setDescription('Temps en minutes')
                .setRequired(false));

    // On récupère le serveur
    for(let [guildId, configGuild] of Object.entries(config)){
        // On initialise les données des utilisateurs
        usersData[guildId] = {};
        // On initialise les données du serveur
        serverData[guildId] = {threatScore: 0, last200Msg:[]};
        // On initialise les données du mode raid
        raidData[guildId] = {raidMode: false, raidModeTime: 0};

        guild = await client.guilds.fetch(guildId);
        await guild.commands.create(raidCommand);
    }

    main();
});

// Login to Discord with your client's token
client.login(token);