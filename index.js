//Includes
const configDatabase    = require('./config/db.json');
const configToken       = require('./config/token.json');
const configServer      = require('./config/server.json');
const Discord           = require('discord.js');
const client            = new Discord.Client();
var   mysql             = require('mysql');
var rankUpdateCooldwown = new Map();

//Main
async function main(){
  client.login(configToken.value);
}

//Funktionen
function setRankUpdateCooldwown(discordid){
  return new Promise((resolve, reject) => {
    let timestamp = new Date();
    resolve(rankUpdateCooldwown.set(discordid, timestamp));
  });
}

function checkRankUpdateCooldwown(discordid){
  //Überprüft ob der Cooldown eines Users für das aktualisieren seines Ranges abgelaufen ist
  return new Promise((resolve, reject) => {
    let timestamp = new Date();
    let cooldownTimestamp = rankUpdateCooldwown.get(discordid);
    if (cooldownTimestamp !== 'undefined'){
      if ((timestamp - cooldownTimestamp) < 3600000){
        reject("Cooldown not over yet");
      }else{
        resolve("Cooldown over")
      }
    }else{
      resolve("no Cooldown");
    }
  });
}

function connectDatabase(){
  //Stellt eine Datenbankverbindung her
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
  //Überprüft ob der Channel in dem eine Textnachricht geschrieben wurde der vorgesehene Bot-Channel ist
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

function queryLogVoiceUser(connection, member){
  //DB-Query für das loggen von Activity-Points eines Users
  return new Promise((resolve, reject) => {
    connection.query({
      sql: 'INSERT INTO `voiceActivity`(`ID`) VALUES (?)',
      values: [member.user.id]
      }, function (error, results, fields) {
        if (error != null){
          reject(error);
        }else{
          let time = getTime();
          resolve(time+" Points have been awarded to "+member.user.username);
        }
    });
  });
}

async function dbLogVoiceUser(){
  //Loggen von Voice-Activity und löschen abgelaufener Voice-Acitvity aller User
  try {
    let connection  = await connectDatabase();
    let response1   = await queryDeleteOldActvitiy(connection);
    let voiceUsers  = await returnUserInVoice();
    console.log(response1);
    for (const member of voiceUsers) {
      if (member.voice.selfMute == false){
        let response2 = await queryLogVoiceUser(connection, member);
        console.log(response2);
      }
    }
    connection.end();
  } catch (error) {
    console.log(error);
  }
}

function getTime(){
  //Gibt aktuelle Zeit in Form hh:mm:ss für die Console zurück
  let now = new Date();
  let h = now.getHours();
  let m = now.getMinutes();
  let s = now.getSeconds();
  // add a zero in front of numbers<10
  m = checkTime(m);
  s = checkTime(s);
  return h+":"+m+":"+s;
}

function checkTime(i) {
  //Hilfsfunktion für führende Nullen für getTime()
  if (i < 10) {
    i = "0" + i;
  }
  return i;
}

function queryUpdateUserData(connection, user){
  return new Promise((resolve, reject) => {
    let avatar = user[1].avatarURL({format:"png", dynamic:true, size:4096});
    let username = user[1].username;
    let time = getTime();
    //User ohne Avatar
    if (avatar == null){
      connection.query({
        sql: 'INSERT INTO `userData`(`discordID`, `username`) VALUES (?,?) ON DUPLICATE KEY UPDATE `username`=?',
        values: [user[0], username, username]
      }, function (error, results, fields) {
        if (error != null){
          reject(error);
        }
        resolve(time+" UserData updated for "+username);
      });
    //User mit Avatar
    }else{
      connection.query({
        sql: 'INSERT INTO `userData`(`discordID`, `avatar`, `username`) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `avatar`=?, `username`=?',
        values: [user[0], avatar, username, avatar, username]
      }, function (error, results, fields) {
        if (error != null){
          reject(error);
        }
        resolve(time+" UserData updated for "+username);
      });
    }
  });
}

async function dbUpdateUserData(){
  try {
    let connection  = await connectDatabase();
    for (const user of client.users.cache) {
      let response = await queryUpdateUserData(connection, user);
      console.log(response);
    }
    connection.end();
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
    let connection    = await connectDatabase();
    let cooldowncheck = await checkRankUpdateCooldwown(member.id)
    let respone       = await SetRankRole(connection,member);
    let setcooldown   = await setRankUpdateCooldwown(member.id)
    console.log(respone);
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

function queryDeleteOldActvitiy(connection){
  return new Promise((resolve, reject) => {
    connection.query({
      sql: 'DELETE FROM `voiceActivity` WHERE `Date` + INTERVAL 120 DAY <= NOW()'
      }, function (error, results, fields) {
        if (error != null){
          reject(error);
        }else{
          let time = getTime();
          resolve(time+" Expired activity points have been deleted");
        }
    });
  });
}

//Events
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  let logVoiceAvtivityInterval = setInterval(dbLogVoiceUser, 60000);
  let logUserDataInterval = setInterval(dbUpdateUserData, 3600000);
  dbUpdateUserData();
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

client.on('voiceStateUpdate', (oldState, newState) => {
  dbSetRankRoleOfMember(client.guilds.resolve(configServer.guild).members.resolve(newState.id));
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
  console.log ("Presence Update: "+newPresence.user.username)
  dbSetRankRoleOfMember(client.guilds.resolve(configServer.guild).members.resolve(newPresence.user.id));
});

//Run
main()