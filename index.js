//Includes
const configDatabase= require('./config/db.json');
const configToken   = require('./config/token.json');
const configServer  = require('./config/server.json');
const Discord       = require('discord.js');
const client        = new Discord.Client();
var   mysql         = require('mysql');

//Main
async function main(){
  client.login(configToken.value);
}

//Funktionen
function connectDatabase(){
  return new Promise((resolve, reject) => {
    let connection = mysql.createConnection({
      host     : configDatabase.host,
      user     : configDatabase.user,
      password : configDatabase.password,
      database : configDatabase.database,
      port     : configDatabase.port
    });
    connection.connect(function(err) {
      if (err) {
        reject('error connecting: ' + err.stack);
      }
      else{
        resolve(connection);
      }         
    });   
  });
}

function checkIfBotChannel(channel){
  return new Promise((resolve, reject) => {
    if(configServer.botchannel.includes(channel.id)){
      resolve('Nachricht wurde in Bot-Channel geschrieben');
    }
    else{
      reject('Nachricht wurde nicht in Bot-Channel geschrieben');
    }
  });
}

function returnUserInVoice(){
  //Gibt Array mit GuildMember Objekten zurück die in Voice Channeln sind
  return new Promise((resolve, reject) => {
    let voiceMembers = Array();
    for (const guild of client.guilds.cache) {
      for (const member of guild[1].members.cache) {
        if (member[1].voice.channelID != null){
          voiceMembers.push(member[1]);
        }
      }
    }
    resolve(voiceMembers);
  });
}

async function dbLogVoiceUser(){
  let connection = await connectDatabase();
  let voiceUsers = await returnUserInVoice();
  for (const member of voiceUsers) {
    if (member.voice.selfMute == false){
      await connection.query({
        sql: 'INSERT INTO `voiceActivity`(`ID`) VALUES (?)',
        values: [member.user.id]
        }, function (error, results, fields) {
          if (error != null){
            console.log(error);
          } 
      });
    }
  }
  connection.end();
}

async function dbUpdateUserData(){
  let connection = await connectDatabase();
  for (const user of client.users.cache) {
    console.log(user[1]);
    let avatar = user[1].avatarURL({format:"png", dynamic:true, size:4096});
    if (avatar == null){
      await connection.query({
        sql: 'INSERT INTO `userData`(`discordID`, `username`) VALUES (?,?) ON DUPLICATE KEY UPDATE `username`=?',
        values: [user[0], user[1].username, user[1].username]
        }, function (error, results, fields) {
          if (error != null){
            console.log(error);
          } 
      });
    }else{
      await connection.query({
        sql: 'INSERT INTO `userData`(`discordID`, `avatar`, `username`) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `avatar`=?, `username`=?',
        values: [user[0], avatar, user[1].username, avatar, user[1].username]
        }, function (error, results, fields) {
          if (error != null){
            console.log(error);
          } 
      });
    }
  }
}

//Events
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  let logVoiceAvtivityInterval = setInterval(dbLogVoiceUser, 60000);
  let logUserDataInterval = setInterval(dbUpdateUserData, 3600000);
  //dbLogVoiceUser();
  updateUserData();
});
 
client.on('message', msg => {
  checkIfBotChannel(msg.channel).then(() => {
    if (msg.content === 'ping') {
      msg.reply('pong');
    }
  }).catch((error) => {
    console.log(error);
  })
});

//Run
main()