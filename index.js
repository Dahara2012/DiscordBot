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
      port     : configDatabase.port,
      charset  : 'utf8mb4_unicode_ci'
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
          }else{
            console.log("Points have been awarded to "+member.user.username);
          }
      });
    }
  }
  connection.end();
}

function UpdateUserData(connection){
  return new Promise((resolve, reject) => {
    for (let index = 0; index < client.users.cache.size; index++) {
      let sqlDoneCounter = 0;
      const user = client.users.cache.array()[index];
      let avatar = user.avatarURL({format:"png", dynamic:true, size:4096});
      let username = user.username;
      //User ohne Avatar
      if (avatar == null){
        connection.query({
          sql: 'INSERT INTO `userData`(`discordID`, `username`) VALUES (?,?) ON DUPLICATE KEY UPDATE `username`=?',
          values: [user.id, username, username]
          }, function (error, results, fields) {
            if (error != null){
              reject(error);
            }
            console.log ("UserData updated for "+username);
            sqlDoneCounter++;
        });
      //User mit Avatar
      }else{
        connection.query({
          sql: 'INSERT INTO `userData`(`discordID`, `avatar`, `username`) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `avatar`=?, `username`=?',
          values: [user.id, avatar, username, avatar, username]
          }, function (error, results, fields) {
            if (error != null){
              reject(error);
            }
            console.log ("UserData updated for "+username);
            sqlDoneCounter++;
        });
      }
      if (sqlDoneCounter == (client.users.cache.size - 1)){
        resolve("UserData updated");
      }
    }
  });
}

async function dbUpdateUserData(){
  try {
    let connection  = await connectDatabase();
    let result      = await UpdateUserData(connection);
    connection.end();
    console.log(result);
  } catch (error) {
    console.log(error);
  }
}

function SetRankRole(connection, member){
  return new Promise((resolve, reject) => {
    let RolesToSet = Array();
    let ranks = configServer.ranks;
    let points = 0;
    let activityRole = ranks[0].rank;

    for (const role of member.roles.cache) {
      let toAdd = true;
      for (const rank of ranks) {
        if (rank.rank == role[0]){
          toAdd = false;
        }
      }
      if (toAdd == true){
        RolesToSet.push(role[1]); 
      }
    }

    connection.query({
      sql: 'SELECT ID, COUNT(ID) as "Points", username FROM voiceActivity LEFT JOIN userData ON ID = discordID WHERE ID = ? GROUP BY(ID)',
      values: [member.user.id]
      }, function (error, results, fields) {
        if (error != null){
          console.log(error);
        }else{
          if (typeof results[0] !== 'undefined'){
            points = results[0].Points;
          
            for (const rank of ranks) {
              if (rank.points <= points){
                activityRole = rank.rank
              }
            }

            connection.end();
            RolesToSet.push(client.guilds.resolve(configServer.guild).roles.resolve(activityRole));
            member.edit({roles:RolesToSet});
            resolve("Applying Activity Roles to "+member.user.username);
          }
          else{
            connection.end();
            RolesToSet.push(client.guilds.resolve(configServer.guild).roles.resolve(activityRole));
            member.edit({roles:RolesToSet});
            reject(member.user.username+" hat noch keine Punkte");
          }
          
        }
    });
  });
}

async function dbSetRankRoleOfMember(member){
  try {
    let connection  = await connectDatabase();
    let result      = await SetRankRole(connection,member);
    console.log(result);
  } catch (error) {
    console.log(error);
  }
}

async function UpdateAllMembersRanksOfGuild(guild){
  for (const member of guild.members.cache) {
    try {
      await dbSetRankRole(member[1]);
    } catch (error) {
      console.log(error);
    }
  }
}

//Events
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  let logVoiceAvtivityInterval = setInterval(dbLogVoiceUser, 60000);
  let logUserDataInterval = setInterval(dbUpdateUserData, 3600000);
  //UpdateAllMembersRanksOfGuild(client.guilds.resolve(configServer.guild));
  //dbLogVoiceUser();
  dbUpdateUserData();
  //setRankRole(client.guilds.resolve('189163811763257344').members.resolve('161125958881902592'));
});
 
/*client.on('message', msg => {
  checkIfBotChannel(msg.channel).then(() => {
    if (msg.content === 'ping') {
      msg.reply('pong');
    }
  }).catch((error) => {
    console.log(error);
  })
});*/

client.on('voiceStateUpdate', newState => {
  dbSetRankRoleOfMember(client.guilds.resolve(configServer.guild).members.resolve(newState.id));
});

//Run
main()