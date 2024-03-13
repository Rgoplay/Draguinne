// Bot discord permettant de limiter les raid et spam sur un serveur
/*
• Ban virtuel si :
‌Plus de 13 messages en 20s
‌Plus de 50% des messages des 20 dernières secondes sont des liens, mentions ou image/fichier
‌Si plus de 6 messages sont dupliqués dans les 100 derniers messages dans les 20 dernières secondes
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
const { token } = require('./config.json');
const { roleBanId } = require('./config.json');
const { channelInfoId } = require('./config.json');
const { roleMemberId } = require('./config.json');
const { idMessageVerification } = require('./config.json');
const { idServeur } = require('./config.json');
const { idSalonsTextuels } = require('./config.json');
const { idSalonsPassions } = require('./config.json');
const { channelGateId } = require('./config.json');
const { channelWelcomeId } = require('./config.json');
const { roleVerifId } = require('./config.json');
const { roleStaffId } = require('./config.json');
const { roleAdminId } = require('./config.json');
const { SlashCommandBuilder } = require('discord.js');

// Create a new client instance
const Intents = new IntentsBitField();
Intents.add(IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.MessageContent, IntentsBitField.Flags.GuildMessageReactions, IntentsBitField.Flags.GuildMembers);
const client = new Client({ intents: Intents, partials: [Partials.Message, Partials.Channel, Partials.Reaction]});

// Variables globales

// Liste des utilisateurs, leurs nombres de messages, de mentions/liens/fichiers, et de leurs derniers messages
var usersData = {};//"example":{nbMsg:0, nbHeavyMsg:0, nbDuplicMsg:0, last100Msg:[channelId, id, "content"]}
var serverData = {nbMsg:0, nbHeavyMsg:0, nbDuplicMsg:0, last200Msg:[]};

var raidMode = false;
var raidModeTime = 0;
var guild = null;
var channelInfo = null;
var channelGate = null;
var channelWelcome = null;
var categorySalonsTextuels = null;
var categorySalonsPassions = null;


client.on('messageCreate', message => {
    // Si le message est envoyé par le bot, on ne fait rien
    if (message.author.bot) return;

    // Si l'utilisateur n'est pas dans la liste des utilisateurs, on l'ajoute
    if (!(message.author.id in usersData)) {
        usersData[message.author.id] = {nbMsg:0, nbHeavyMsg:0, last100Msg:[]};
    }

    // On ajoute le message à la liste des 100 derniers messages de l'utilisateur
    usersData[message.author.id].last100Msg.push([message, message.content]);
    // Si la liste est trop longue, on supprime le premier élément
    if (usersData[message.author.id].last100Msg.length > 100) {
        usersData[message.author.id].last100Msg.shift();
    }

    //On ajoute le message à la liste des 200 derniers messages du serveur
    serverData.last200Msg.push([message, message.content]);
    // Si la liste est trop longue, on supprime le premier élément
    if (serverData.last200Msg.length > 200) {
        serverData.last200Msg.shift();
    }

    // On incrémente le nombre de messages de l'utilisateur et du serveur
    usersData[message.author.id].nbMsg += 1;
    serverData.nbMsg += 1;

    // Si le message contient une mention, un lien ou un fichier, on incrémente le nombre de messages lourds de l'utilisateur
    if (message.mentions.users.size > 0 || message.mentions.roles.size > 0 || message.mentions.everyone || message.attachments.size > 0 || message.embeds.length > 0 || message.content.includes("http")) {
        usersData[message.author.id].nbHeavyMsg += 1;
        serverData.nbHeavyMsg += 1;
    }

    // Si le message est un doublon, on incrémente le nombre de doublons de l'utilisateur
    if (usersData[message.author.id].last100Msg.filter(msg => msg[1] == message.content).length > 1) {
        usersData[message.author.id].nbDuplicMsg += 1;
    }

    // Si le message est un doublon, on incrémente le nombre de doublons du serveur
    if (serverData.last200Msg.filter(msg => msg[1] == message.content).length > 1) {
        serverData.nbDuplicMsg += 1;
    }

});

client.on('guildMemberRemove', user => {
    // On supprime l'utilisateur de la liste des utilisateurs
    delete usersData[user.id];

    // On envoie un message dans le salon d'info
    channelInfo.send("L'utilisateur " + user.user.username + " (<@" + user.id +">) a quitté le serveur.");
    // On envoie un message dans le salon de gate
    channelGate.send("> L'aventurier.e " + user.user.username + " a quitté la guilde. On lui souhaite une bonne continuation !");

});

client.on('guildMemberAdd', user => {
    // On envoie un message dans le salon d'info
    channelInfo.send("L'utilisateur " + user.user.username + " (<@" + user.id +">) a rejoint le serveur.");
    // On envoie un message dans le salon de gate
    channelGate.send("> L'aventurier.e " + user.user.username + " a rejoint la guilde.");

});

client.on('messageReactionAdd', async (reaction, user) => {
    //On vérifie que la réaction est sur le message de vérification
    if (reaction.message.id == idMessageVerification) {
        // Info de l'ajout du rôle
        channelInfo.send("L'utilisateur " + user.username + " (<@" + user.id +">) a démarré la vérification.");

        // On lui donne le rôle membre après 5 minutes
        setTimeout(() => verifyUser(user.id), 300000);//300000
    }
});

async function verifyUser(userId){
    // On récupère le membre
    var member = await guild.members.cache.get(userId);

    // On vérifie si le membre est toujours sur le serveur
    if(member == undefined) return;

    // On ajoute le role membre à l'utilisateur
    if(!raidMode) {
        // On vérifie si le membre a pas déja le role membre
        if(!member.roles.cache.some(role => role.id === roleMemberId)) {
            member.roles.add(roleMemberId);
            member.roles.remove(roleVerifId);
            // Info de l'ajout du rôle
            channelInfo.send("L'utilisateur " + member.user.username + " (<@" + member.user.id +">) a été vérifié.");
            // On envoie un message de bienvenue
            channelWelcome.send("> Bienvenue dans la guilde <@" + member.user.id +"> !\n\n");
        } else {
	        channelInfo.send("L'utilisateur " + member.user.username + " (<@" + member.user.id +">) est déjà membre.");
	    }
    }
}


client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === "raid") {
        // On vérifie que l'utilisateur est un membre du staff
        if(interaction.member.roles.cache.has(roleStaffId) || interaction.member.roles.cache.has(roleAdminId)) {
            // On récupère l'option
            const enable = interaction.options.getBoolean('enable');
            if(enable) {
                // On active le mode raid
                await interaction.reply("Le mode raid a été activé");
                raidMode = true;
                blockChannels();

                var logString = `<@407992364347686934> Le mode raid a été activé par ${interaction.user.username}.`
                channelGate.send("> Le mode raid vient d'être activé, les salons ont été bloqués. La vérification est désactivée.");

                // On récupère l'option time
                const time = interaction.options.getInteger('time');
                if(time == null) {
                    raidModeTime = 1;
                } else {
                    raidModeTime = 20-time*2;
                    logString += ` Le mode raid sera désactivé dans ${time} minutes.`;
                    if(raidModeTime == 0) {
                        raidModeTime = 1;
                    }
                }
                channelInfo.send(logString);
            }
            else {
                // On désactive le mode raid
                await interaction.reply("Le mode raid a été désactivé");
                raidMode = false;
                raidModeTime = 0;
                unblockChannels();

                channelInfo.send(`<@407992364347686934> Le mode raid a été désactivé par ${interaction.user.username}.`);
                channelGate.send("> Le mode raid vient d'être désactivé.");
            }
        }
    }
});


async function main(){

    // On récupère le channel d'info
    channelInfo = await guild.channels.cache.get(channelInfoId);
    // On récupère la catégorie des salons textuels
    categorySalonsTextuels = await guild.channels.cache.get(idSalonsTextuels);
    // On récupère la catégorie des salons passions
    categorySalonsPassions = await guild.channels.cache.get(idSalonsPassions);
    // On récupère le channel d'arrivée sortie
    channelGate = await guild.channels.cache.get(channelGateId);
    // On récupère le channel de bienvenue
    channelWelcome = await guild.channels.cache.get(channelWelcomeId);
    // Définition des timers
    setInterval(userCheck, 20000);
    setInterval(serverCheck, 30000);
}

async function userCheck(){
    // On parcourt la liste des utilisateurs
    for (const [id, user] of Object.entries(usersData)) {
        if(!raidMode) {
            var ban = false;
            // On récupère le membre
            var member = await guild.members.cache.get(id);

            // Si l'utilisateur a envoyé plus de 13 messages en 20s
            if (user.nbMsg > 13) {
                ban = true;
            }
            // Si l'utilisateur a envoyé plus de 50% de messages lourds et a envoyé plus de 8 messages
            if (user.nbHeavyMsg / user.nbMsg > 0.5 && user.nbMsg > 8) {
                ban = true;
            }
            // Si l'utilisateur a envoyé plus de 6 doublons
            if (user.nbDuplicMsg > 6) {
                ban = true;
            }

            if(ban){
                // On banni l'utilisateur et on supprime ses messages
                banMember(member);

                // Info du ban
                channelInfo.send("L'utilisateur " + member.user.username +  " (<@" + member.id +">) a été banni virtuellement.");
                channelGate.send("> Le membre <@" + member.id +"> a été banni virtuellement.");
            }
        }
        // On check si ca fait plus d'une heure que l'utilisateur n'a pas envoyé de message
        // On recupere le temps du dernier message
        var lastMsgTime = (usersData[id].last100Msg[usersData[id].last100Msg.length-1][0].createdTimestamp/1000).toFixed(0);
        // On recupere le temps actuel
        var currentTime = (new Date().getTime()/1000).toFixed(0);
        // Si ca fait plus d'une heure
        if(currentTime - lastMsgTime > 3600) {
            // On retire le membre de la liste
            delete usersData[id];
        }

        // On remet à 0 les données de l'utilisateur
        user.nbMsg = 0;
        user.nbHeavyMsg = 0;
        user.nbDuplicMsg = 0;
    }
}


async function serverCheck(){
    // Si sur les 30 dernières secondes, plus de un message toute les 0,5 secondes
    if (serverData.nbMsg > 60) {
        raidMode = true;
    }
    // Si 40% des derniers messages (30s) sont des liens, mentions ou image/fichier
    if (serverData.nbHeavyMsg / serverData.nbMsg > 0.4 && serverData.nbMsg > 15) {
        raidMode = true;
    }
    // Si plus de 20 messages sont dupliqués dans les 200 derniers messages (30s)
    if (serverData.nbDuplicMsg > 20) {
        raidMode = true;
    }

    // On remet à 0 les données du serveur
    serverData.nbMsg = 0;
    serverData.nbHeavyMsg = 0;
    serverData.nbDuplicMsg = 0;

    // Si le mode raid est activé
    if (raidMode) {
        if(raidModeTime == 0) {

            var nbMsgMax = 0;
            var nbMsgMaxUser = [];
            // On récupère le nombre de messages du membre ayant envoyé le plus de messages
            for (const [id, user] of Object.entries(usersData)) {
                if (user.nbMsg > nbMsgMax) {
                    nbMsgMax = user.nbMsg;
                }
            }
            // On récupère les membres ayant envoyé plus de 50% de messages que le membre ayant envoyé le plus de messages
            for (const [id, user] of Object.entries(usersData)) {
                if (user.nbMsg / nbMsgMax > 0.5) {
                    nbMsgMaxUser.push(id);
                }
            }

            // On bloque les salons (pendant 10 minutes) si plus de un membre a spammé
            if (nbMsgMaxUser.length > 1) {
                
                blockChannels();

                // On supprime les 100 derniers messages des membres ayant envoyé le plus de messages
                for(id of nbMsgMaxUser) {
                    var member = await guild.members.cache.get(id);
                    banMember(member);
                    channelInfo.send("L'utilisateur <@" + id +"> a été banni virtuellement.");
                    channelGate.send("> Le membre <@" + id +"> a été banni virtuellement.");
                }

                //On envoie un message dans le salon info
                channelGate.send("> Le mode raid vient d'être activé, les salons ont été bloqués. La vérification est désactivée.");
                channelInfo.send("<@407992364347686934> Le mode raid a été activé.");
            }
            else { 
                // Sinon pas de raid
                raidMode = false;
            }
        }
    }

    if(raidMode) {
        raidModeTime++;
        //Si le mode raid est activé depuis plus de 10 minutes
        if (raidModeTime > 20) {
            // On désactive le mode raid
            raidMode = false;
            raidModeTime = 0;

            unblockChannels();

            //On envoie un message dans le salon info
            channelGate.send("> Le mode raid vient d'être désactivé.");
            channelInfo.send("<@407992364347686934> Le mode raid a été désactivé.");
        }
    }
}

async function blockChannels(){
    // On bloque les salons de la catégorie salons textuels
    let roleMember = await guild.roles.cache.get(roleMemberId);
    categorySalonsTextuels.children.cache.forEach(channel => {
        if (channel.type == 0) {
            channel.permissionOverwrites.edit(roleMember, {"SendMessages": false});
        }
    });
    // De la catégorie passions
    categorySalonsPassions.children.cache.forEach(channel => {
        if (channel.type == 0) {
            channel.permissionOverwrites.edit(roleMember, {"SendMessages": false});
        }
    });
}

async function unblockChannels(){
    // On débloque les salons
    let roleMember = await guild.roles.cache.get(roleMemberId);
    categorySalonsTextuels.children.cache.forEach(channel => {
        if (channel.type == 0) {
            channel.permissionOverwrites.edit(roleMember, {"SendMessages": true});
        }
    });
    categorySalonsPassions.children.cache.forEach(channel => {
        if (channel.type == 0) {
            channel.permissionOverwrites.edit(roleMember, {"SendMessages": true});
        }
    });
}

async function banMember(member){
    // On le banni
    await member.roles.add(roleBanId);
    // On supprime le rôle membre
    await member.roles.remove(roleMemberId);
    // On supprime les 100 derniers messages
    var messages = usersData[member.id].last100Msg;
    for (const [message, content] of messages) {
        try {
            await message.delete();
        }
        catch {
            console.log("Erreur lors de la suppression d'un message");
        }
    }
    usersData[member.id].last100Msg = [];
}
    

// When the client is ready, run this code (only once)
client.once('ready', async () => {
    console.log('Ready!');
    client.user.setPresence({ activities: [{ name: "C'est pénible de remplir la paperasse..." }], status: 'idle' });

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
    guild = await client.guilds.fetch(idServeur);
    await guild.commands.create(raidCommand);

    main();
});

// Login to Discord with your client's token
client.login(token);