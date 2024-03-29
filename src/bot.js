//SET UP
require('dotenv').config();
const Discord = require('discord.js');
const client = new Discord.Client({ fetchAllMembers: true });
const { PythonShell } = require('python-shell');

//GET FILES
const { list, replylist, trivia } = require('./resources/wordtrivialist');
const { private } = require('./resources/private');
const similarity = require('./resources/isMessageAlike');
const { addScore,  scoreCache, scoreMapCache, deleteScore } = require('./databases/SQLite/queries');
const { guess, leaderboards, points } = require('./slashCommandSupport/slashTriviaCommands');

//SET UP VARIABLES
const token = process.env.BOT_TOKEN;
const prefix = process.env.PREFIX;
//PLAY VARIABLES
const timer = 1000 * 60 * 5; //Milliseconds
const triviaTimer = timer * 2;
let lastmessage = {};
let triviaMain = {};
let userReplyMessage = new Map();

//INIT VARIABLES
for (guild in private.allowed) {
    lastmessage[guild] = {time: 0, server: false};
    triviaMain[guild] = {triviaAnswer: null, triviaNumber: null, triviaMessage: null, users: new Map(), triviaEach: {}};
    for (i in trivia) triviaMain[guild].triviaEach[trivia[i].id] = 5;
}

//PLAY FUNCTIONS
async function intervalMessage(guild) {
    if (!lastmessage[guild]) return;
    lastmessage[guild].server = true;
    setTimeout(() => {
        if (new Date().getTime() - lastmessage[guild].time < timer - 3000) {
            try {
                client.channels.cache.get(private.allowed[guild].mainchat).send(list[Math.round(Math.random() * (list.length - 1))]);
            } catch (error) { }
        }
        lastmessage[guild].server = false;
    }, timer * 3);
}

async function randomTrivia() {
    setInterval(async () => {
        for (guild in private.allowed) {
            if (triviaMain[guild].triviaMessage != null) return;
            else if (triviaMain[guild].users.size >= 2) {
                let mapArray = [...triviaMain[guild].users.values()].sort((a, b) => b - a);
                if ((!mapArray) || (new Date().getTime() - mapArray[0] > timer || new Date().getTime() - mapArray[1] > timer)) return;
                triviaMain[guild].triviaNumber = Math.round(Math.random() * (trivia.length - 1));

                while (triviaMain[guild].triviaEach[trivia[triviaMain[guild].triviaNumber].id] < 5) triviaMain[guild].triviaNumber = Math.round(Math.random() * (trivia.length - 1));

                triviaMain[guild].triviaEach[trivia[triviaMain[guild].triviaNumber].id] = 0;
                for (id in triviaMain[guild].triviaEach) if (id != trivia[triviaMain[guild].triviaNumber].id) triviaMain[guild].triviaEach[id]++;

                triviaMain[guild].triviaAnswer = [trivia[triviaMain[guild].triviaNumber].answer.toLowerCase(), trivia[triviaMain[guild].triviaNumber].acceptable];
                let question = trivia[triviaMain[guild].triviaNumber].question;
                
                if (triviaMain[guild].triviaAnswer[1] == null) triviaMain[guild].triviaAnswer.pop();
                else triviaMain[guild].triviaAnswer[1] = triviaMain[guild].triviaAnswer[1].toLowerCase();
                
                let letters = ["a", "b", "c", "d"];
                let order = [];
                let choices;

                if (trivia[triviaMain[guild].triviaNumber].name == "mutiplechoice") {
                    let ordernumber = 0;
                    choices = [trivia[triviaMain[guild].triviaNumber].a, trivia[triviaMain[guild].triviaNumber].b, trivia[triviaMain[guild].triviaNumber].c, trivia[triviaMain[guild].triviaNumber].d];
                    
                    if (choices[3] == null) choices.pop();

                    let choiceslength = choices.length;
                    
                    while (order.length < choiceslength) {
                        let choicenumber = Math.round(Math.random() * (choices.length - 1));

                        if (choices[choicenumber] == trivia[triviaMain[guild].triviaNumber].answer) triviaMain[guild].triviaAnswer[0] = letters[ordernumber];

                        order.push(`${letters[ordernumber].toUpperCase()}. ${choices[choicenumber]}`);
                        choices.splice(choicenumber, 1);
                        ordernumber++;
                    }
                    question += `\n${order.join("\n")}`;
                }
    
                let embed = new Discord.MessageEmbed()
                    .setColor("RED")
                    .setTitle("NEW RANDOM TRIVIA!")
                    .setDescription(question)
                    .setFooter("To guess, do nvsn.guess [answer]")
                    .setTimestamp();

                if (trivia[triviaMain[guild].triviaNumber].image) embed.setImage(await trivia[triviaMain[guild].triviaNumber].image);
    
                try {
                    triviaMain[guild].triviaMessage = await client.channels.cache.get(private.allowed[guild].mainchat).send(embed);
                } catch (error) { }
            }
        }
    }, triviaTimer);
}

async function joinLeaveMessage(member, whichjoinleave) {
    switch (whichjoinleave) {
        case "join": try {
            if  (!private.allowed[member.guild.id].welcome || !private.allowed[member.guild.id].welcome.welcomemessage) return;
            const welcomechannel = client.channels.cache.get(private.allowed[member.guild.id].welcome.channel);
            const welcomemessage = private.allowed[member.guild.id].welcome.welcomemessage.replace(/\[id\]/g, member.id);
            try {
                welcomechannel.send(welcomemessage);
            } catch { }
            break;
        } catch { }
        case "leave": try {
            if  (!private.allowed[member.guild.id].welcome || !private.allowed[member.guild.id].welcome.leavemessage) return;
            const welcomechannel = client.channels.cache.get(private.allowed[member.guild.id].welcome.channel);
            const leavemessage = private.allowed[member.guild.id].welcome.leavemessage.replace(/\[id\]/g, member.id);
            try {
                welcomechannel.send(leavemessage);
            } catch { }
            break;
        } catch { }
    }
}

//ALL SLASH COMMANDS
async function pyfile(inputargs) {
    let pyshell = new PythonShell(`src/slashCommandSupport/getMessages.py`, {args: inputargs});
    return new Promise((resolve, reject) => {
        pyshell.on('message', function (message) {
            try {
                if (message) resolve(JSON.parse(message));
                else reject(false);
            } catch(err) { console.log(err) }
        });
    });
}

async function createSlashCommand(guild, idata) {
    if (!guild) await client.api.applications(client.user.id).commands.post({data: idata});
    else await client.api.applications(client.user.id).guilds(guild).commands.post({data: idata});
}

async function reply(interaction, response) {
    let data = {
        content: response
    }

    if (typeof response == 'object') data = await createAPIMessage(interaction, response);
    
    client.api.interactions(interaction.id, interaction.token).callback.post({
        data: {
            type: 4, 
            data
        }
    });
};

async function createAPIMessage(interaction, content) {
    const { data, files } = await Discord.APIMessage.create(
        client.channels.resolve(interaction.channel_id),
        content
    )
    .resolveData()
    .resolveFiles();

    return {...data, files};
};

async function deleteAfter(inputargs, interaction, time) {
    let timecomplete = new Date().getTime();
    let messages = await pyfile(inputargs);
    if (!messages) return console.log("could not fetch messages");
    
    let messageid;
    for (message of messages) if (message.interaction && message.interaction.id == interaction.id) messageid = message.id;

    if (!messageid) return console.log("could not find the message");

    timecomplete -= new Date().getTime();

    setTimeout(() => client.channels.cache.get(inputargs[1]).messages.fetch(messageid).then(msg => msg.delete()), time + timecomplete);
}

async function listener() {
    client.ws.on('INTERACTION_CREATE', async (interaction) => {
        const { name, options } = interaction.data;

        const command = name.toLowerCase();

        const args = {};

        if (options) for (option of options) {
            const {name, value} = option;
            args[name] = value;
        }
        
        switch(command) {
            case "leaderboards":
                await reply(interaction, (await leaderboards(args, client, Discord, interaction)).content);
                break;
            case "guess":
                await reply(interaction, (await guess(args, triviaMain, interaction)).content);
                await deleteAfter([process.env.BOT_TOKEN, interaction.channel_id], interaction, 60000);
                break;
            case "points":
                await reply(interaction, (await points(args, client, interaction)).content);
                break;
        }
    });
}

//BOT 
client.on('ready', async () =>{ 
    scoreCache();
    console.log(`${client.user.tag} has logged in`); 
    client.user.setActivity('The Neverseen', { type: "WATCHING" })
    randomTrivia();
    setInterval(() => {
        scoreCache();
    }, triviaTimer * 2);
    setInterval(() => {
        userReplyMessage.clear();
    }, timer-2000);

    createSlashCommand(null, {
        name: 'Leaderboards',
        description: 'Get Neverseen top trivia players',
        options: [
            {
                name: 'User',
                description: 'Get user\'s position in the leaderboards',
                required: false,
                type: 6
            }
        ]
    });

    createSlashCommand(null, {
        name: 'Guess',
        description: 'Guess the trivia answer when there is a trivia',
        options: [
            {
                name: 'Guess',
                description: 'Your guess',
                required: true,
                type: 3
            }
        ]
    });

    createSlashCommand("709195031822598255", {
        name: 'Points',
        description: 'Add/remove/wipe points from user/s',
        options: [
            {
                name: 'Operation',
                description: 'Set to either add/remove/wipe',
                required: true,
                choices: [
                    {
                        name: 'Add',
                        value: 'add'
                    },
                    {
                        name: 'Remove',
                        value: 'remove'
                    },
                    {
                        name: 'Wipe',
                        value: 'wipe'
                    }
                ],
                type: 3
            },
            {
                name: 'Amount',
                description: 'The amounts of points to add/remove/wipe',
                required: true,
                type: 4
            },
            {
                name: 'Users',
                description: 'Add/remove/wipe the amount of points from user/s',
                required: true,
                type: 3
            }
        ]
    });

    listener();

});

client.on('message', async message => {
    let mesagecontent = message.content.toLowerCase().replace(/\s+/g,' ').trim();
    if (message.author.bot) return;
    else if (mesagecontent.startsWith(prefix)) {
        const args = mesagecontent.slice(prefix.length).split(" ");
        switch (args[0]) {
            case "guess":
                if (!triviaMain[message.guild.id].triviaMessage) {
                    message.delete().catch(error => console.log(`An error has occured --- ${error}`));
                    return message.reply('There is no trivia right now!');
                } else {
                    const answer = mesagecontent.trim().slice(mesagecontent.indexOf("guess") + 6);
                    if (triviaMain[message.guild.id].triviaAnswer.includes(answer)) {
                        await triviaMain[message.guild.id].triviaMessage.delete().catch(error => console.log(`An error has occured --- ${error}`));
                        triviaMain[message.guild.id].triviaMessage = null;
                        if (message.guild.id != "709195031822598255") await addScore(message.author.id);
                        triviaMain[message.guild.id].users.clear();
                        await message.delete().catch(error => console.log(`An error has occured --- ${error}`));
                        const reply = await message.reply(`You got the answer!`)
                            .then(setTimeout(() => reply.delete().catch(error => console.log(`An error has occured --- ${error}`)), 60000));
                    } else {
                        message.delete().catch(error => console.log(`An error has occured --- ${error}`));
                        const reply = await message.reply(`That is not the answer!`)
                            .then(setTimeout(() => reply.delete().catch(error => console.log(`An error has occured --- ${error}`)), 60000));
                    }
                }
                break;
            case "lb":
            case "leaderboard":
            case "leaderboards":
                const sortedScoremap = new Map([...scoreMapCache.entries()].sort((a, b) => b[1] - a[1]));
                const leaderboardArray = [];
                let iteration = 1;
                let userplace = null;
                let points = 0;
                sortedScoremap.forEach(function (value, key) {
                    if (key == message.author.id) {
                        userplace = iteration;
                        points = value;
                    }
                    else iteration++;
                    if (leaderboardArray.length < 10) leaderboardArray.push(`**${leaderboardArray.length+1}.** <@!${key}> score: ${value}`);
                })

                const embed = new Discord.MessageEmbed()
                    .setTitle("Top Ten Answered Correct Trivia Players")
                    .setColor("GREEN")
                    .setDescription(leaderboardArray.join("\n"))
                    .setFooter(`Your position is: ${userplace} with ${points} points`)
                    .setTimestamp();
                
                message.channel.send(embed);
                break;
            case "points":
                if (message.member.roles.cache.get(private.control)) {
                    async function foreachElement(operation, args, call, message) {
                        if (!args[2]) return message.channel.send(`You need to mention [a] user[s]!`);
                        let rpmessage = await message.channel.send("Please wait...");
                        let mentions = message.mentions.users;
                        if (args[3] == "@everyone") mentions = client.users.cache;
                        if (mentions.size != 0) {
                            mentions.forEach(async function (user, key){
                                const member = client.users.cache.get(key);
                                if (!member) return message.channel.send(`I could not find user <@!${id}>`);
                                await rpmessage.edit(`${operation} ${args[2]} of ${member}'s points...`);
                                await call(key, args[2]);
                            });
                        } else if (!args[2].startsWith("<@!")) {
                            let newargs = args.splice(3);
                            for (id of newargs) {
                                const member = client.users.cache.get(id);
                                if (!member) return message.channel.send(`I could not find user <@!${id}>`);
                                await rpmessage.edit(`${operation} ${args[2]} of ${member.displayName}'s points...`);
                                await call(id, args[2]);
                            }
                        }
                        await rpmessage.edit("Done.");
                    }
                    switch(args[1]) {
                        case "remove": 
                            if (isNaN(args[2])) return message.channel.send("The format is `nvsn.points remove [number] [user/s]`");
                            foreachElement("Removing", args, deleteScore, message);
                            break;
                        case "add": 
                            if (isNaN(args[2])) return message.channel.send(`The format is \`nvsn.points add [number] [user/s]\``);
                            foreachElement("Adding", args, addScore, message);
                            break;
                        case "wipe": 
                            foreachElement("Wiping", args, deleteScore, message);
                            break;
                    }
                }
                break;
        }
    }
    if ((message.guild && message.author && message.channel && message.content) && private.allowed[message.guild.id] && private.allowed[message.guild.id].mainchat == message.channel.id && message.content.toLowerCase().indexOf("guess") != 5 && !triviaMain[message.guild.id].triviaMessage) {
        if (!lastmessage[message.guild.id].server) intervalMessage(message.guild.id);
        triviaUsers = triviaMain[message.guild.id].users.get(message.author.id);
        if (!triviaUsers || new Date().getTime() - triviaUsers > timer) await triviaMain[message.guild.id].users.set(message.author.id, message.createdTimestamp);
        lastmessage[message.guild.id].time = message.createdTimestamp;
    }
    for (i in replylist) {
        let user = userReplyMessage.get(message.author.id);
        
        if ((similarity.similarity(replylist[i][0], message.content.toLowerCase()) > 0.69 || similarity.similarity(replylist[i][0].replace(/[ ]/g, ''), message.content.toLowerCase().replace(/[ ]/g, '')) > 0.69 || message.content.toLowerCase().indexOf(replylist[i][0]) != -1) && ((!user || user < 10) || message.channel.name.toLowerCase() == "spam")) {
            if (user != undefined && message.channel.name.toLowerCase() != "spam") userReplyMessage.set(message.author.id, (userReplyMessage.get(message.author.id))+1); 
            else if (message.channel.name.toLowerCase() != "spam") userReplyMessage.set(message.author.id, 1);
            
            if (similarity.similarity(replylist[i][0], message.content.toLowerCase()) > 0.69) message.channel.send(replylist[i][1]);
            else if (similarity.similarity(replylist[i][0].replace(/[ ]/g, ''), message.content.toLowerCase().replace(/[ ]/g, '')) > 0.69) message.channel.send(replylist[i][1]);
            else if (message.content.toLowerCase().indexOf(replylist[i][0]) != -1) message.channel.send(replylist[i][1]);
        }
    }
});


client.on('guildMemberAdd', member => {
    joinLeaveMessage(member, "join");
});

client.on('guildMemberRemove', member => {
    joinLeaveMessage(member, "leave");
});


client.login(token);