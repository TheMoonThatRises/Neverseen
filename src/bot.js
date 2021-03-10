//SET UP
require('dotenv').config();
const Discord = require('discord.js');
const client = new Discord.Client({ fetchAllMembers: true });

//GET FILES
const { list, replylist, trivia } = require('./resources/wordtrivialist');
const { private } = require('./resources/private');
const similarity = require('./resources/isMessageAlike');
const { addScore,  scoreCache, scoreMapCache, deleteScore } = require('./databases/SQLite/queries');

//SET UP VARIABLES
const token = process.env.BOT_TOKEN;
const prefix = "nvsn."

//PLAY VARIABLES
const timer = 1000 * 60 * 5; //Milliseconds
const triviaTimer = timer * 2;
let lastmessage = {};
let triviaMain = {};

//INIT VARIABLES
for (guild in private.allowed) {
    lastmessage[guild] = new Date().getTime() + timer;
    triviaMain[guild] = {triviaAnswer: null, triviaNumber: null, triviaMessage: null, users: new Map(), triviaEach: {}};
    for (i in trivia) triviaMain[guild].triviaEach[trivia[i].id] = 5;
}

//PLAY FUNCTIONS
async function intervalMessage() {
    setInterval(() => {
        for (guild in private.allowed) {
            if (new Date().getTime() - lastmessage[guild] < timer - 3000) {
                try {
                    client.channels.cache.get(private.allowed[guild].mainchat).send(list[Math.round(Math.random() * (list.length - 1))]);
                } catch (error) { }
            }
        }
    }, timer);
}

async function randomTrivia() {
    setInterval(async () => {
        for (guild in private.allowed) {
            if (triviaMain[guild].triviaMessage != null) return;
            else if (triviaMain[guild].users.size >= 2) {
                let mapArray = [...triviaMain[guild].users.values()]
                if ((!mapArray) || (new Date().getTime() - mapArray[0] > timer && new Date().getTime() - mapArray[1] > timer)) return;
                triviaMain[guild].triviaNumber = Math.round(Math.random() * (trivia.length - 1));

                while (triviaMain[guild].triviaEach[trivia[triviaMain[guild].triviaNumber].id] < 5) triviaMain[guild].triviaNumber = Math.round(Math.random() * (trivia.length - 1));

                triviaMain[guild].triviaEach[trivia[triviaMain[guild].triviaNumber].id] = 0;
                for (id in triviaMain[guild].triviaEach) if (id != trivia[triviaMain[guild].triviaNumber].id) triviaMain[guild].triviaEach[id]++;

                triviaMain[guild].triviaAnswer = [trivia[triviaMain[guild].triviaNumber].answer, trivia[triviaMain[guild].triviaNumber].acceptable];
                let question = trivia[triviaMain[guild].triviaNumber].question;
                
                if (triviaMain[guild].triviaAnswer[1] == null) triviaMain[guild].triviaAnswer.pop();
                
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

                if (trivia[triviaMain[guild].triviaNumber].image) embed.setImage(trivia[triviaMain[guild].triviaNumber].image);
    
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

//BOT 
client.on('ready', () =>{ 
    scoreCache();
    console.log(`${client.user.tag} has logged in`); 
    intervalMessage();
    randomTrivia();
    setInterval(() => {
        scoreCache();
    }, triviaTimer * 2);
});

client.on('message', async message => {
    if (message.author.bot) return;
    else if (message.content.startsWith(prefix)) {
        const args = message.content.toLowerCase().replace(/\s+/g,' ').trim().slice(prefix.length).split(" ");
        switch (args[0]) {
            case "guess":
                if (!triviaMain[message.guild.id].triviaMessage) return message.reply('There is no trivia right now!');
                else {
                    const answer = message.content.toLowerCase().replace(/\s+/g,' ').trim().slice(message.content.toLowerCase().replace(/\s+/g,' ').trim().indexOf("guess") + 6);
                    if (triviaMain[message.guild.id].triviaAnswer.includes(answer)) {
                        await triviaMain[message.guild.id].triviaMessage.delete();
                        triviaMain[message.guild.id].triviaMessage = null;
                        if (message.guild.id != "709195031822598255") await addScore(message.author.id);
                        triviaMain[message.guild.id].users.clear();
                        await message.delete();
                        const reply = await message.reply(`You got the answer!`)
                            .then(setTimeout(() => reply.delete(), 60000));
                    } else {
                        message.delete();
                        const reply = await message.reply(`That is not the answer!`)
                            .then(setTimeout(() => reply.delete(), 60000));
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
                    switch(args[1]) {
                        case "remove": {
                            if (isNaN(args[2])) return message.channel.send("The format is `nvsn.points remove [number] [user/s]`");
                            let rpmessage = await message.channel.send("Please wait...");
                            let mentions = message.mentions.users;
                            if (args[3] == "@everyone") mentions = client.guilds.cache.get(message.guild.id).members.cache;
                            mentions.forEach(async function (user, key){
                                const member = client.guilds.cache.get(message.guild.id).members.cache.get(key).displayName;
                                await rpmessage.edit(`Removing ${args[2]} of ${member}'s points...`);
                                await deleteScore(key, args[2]);
                            })
                            await rpmessage.edit("Done.");
                            break;
                        }
                        case "add": {
                            if (isNaN(args[2])) return message.channel.send(`The format is \`nvsn.points add [number] [user/s]\``);
                            let rpmessage = await message.channel.send("Please wait...");
                            let mentions = message.mentions.users;
                            if (args[3] == "@everyone") mentions = client.guilds.cache.get(message.guild.id).members.cache;
                            mentions.forEach(async function (user, key){
                                const member = client.guilds.cache.get(message.guild.id).members.cache.get(key).displayName;
                                await rpmessage.edit(`Adding ${args[2]} to ${member}'s points...`);
                                await addScore(key, args[2]);
                            })
                            await rpmessage.edit("Done.");
                            break;
                        }
                        case "wipe": {
                            let rpmessage = await message.channel.send("Please wait...");
                            let mentions = message.mentions.users;
                            if (args[2] == "@everyone") mentions = client.guilds.cache.get(message.guild.id).members.cache;
                            mentions.forEach(async function (user, key){
                                const member = client.guilds.cache.get(message.guild.id).members.cache.get(key).displayName;
                                await rpmessage.edit(`Wiping ${member}'s points...`);
                                await deleteScore(key, null);
                            })
                            await rpmessage.edit("Done.");
                            break;
                        }
                    }
                }
                break;
        }
    }
    if (private.allowed[message.guild.id] && private.allowed[message.guild.id].mainchat == message.channel.id && message.content.toLowerCase().indexOf("guess") != 5 && !triviaMain[message.guild.id].triviaMessage) {
        triviaUsers = triviaMain[message.guild.id].users.get(message.author.id);
        if (!triviaUsers || new Date().getTime() - triviaUsers > timer) await triviaMain[message.guild.id].users.set(message.author.id, message.createdTimestamp);
        lastmessage[message.guild.id] = message.createdTimestamp;
    }
    for (i in replylist) {
        if (similarity.similarity(replylist[i][0], message.content.toLowerCase()) > 0.69) return message.channel.send(replylist[i][1]);
        else if (similarity.similarity(replylist[i][0].replace(/[ ]/g, ''), message.content.toLowerCase().replace(/[ ]/g, '')) > 0.69) return message.channel.send(replylist[i][1]);
        else if (message.content.toLowerCase().indexOf(replylist[i][0]) != -1) return message.channel.send(replylist[i][1]);
    }
});


client.on('guildMemberAdd', member => {
    joinLeaveMessage(member, "join");
});

client.on('guildMemberRemove', member => {
    joinLeaveMessage(member, "leave");
});


client.login(token);