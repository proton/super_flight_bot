'use strict';
const TeleBot = require('telebot');
const bot = new TeleBot(process.env.TG_TOKEN);
const vkapi = new (require('node-vkapi'))({ accessToken: process.env.VK_TOKEN });
const Datastore = require('nedb-promises')
const LOOP_INTERVAL = 3000;
const vkGroups = [63731512, 119000633];
const SOME_ERROR_MESSAGE = 'Some error :(\nPlease try again later.';

let db = {};
db.userKeywords = Datastore.create('var/user_keywords.db')
db.vkGroups = Datastore.create('var/vk_groups.db')
// db.userKeywords = new Datastore({ filename: 'var/user_keywords.db', autoload: true });
// db.vkGroups = new Datastore({ filename: 'var/vk_groups.db', autoload: true });

let keywordUsers = {};
let vkGroupLastMessageIds = {};
// let keywordUsers = {
//   'берлин': [60037421]
// }

function postUrl(post) {
  return `https://vk.com/wall${post.fromId}_${post.id}`
}

function postToMessage(post) {
  return post.text + "\n\n" + postUrl(post);
}

function sendPostToUsers(bot, post) {
  let sentToUsers = {};
  let lowercased_text = post.text.toLowerCase();
  
  for (let keyword in keywordUsers) {
    if (!lowercased_text.includes(keyword)) continue;
    let text = postToMessage(post);
    userIds = keywordUsers[keyword];
    for (let userId in userIds) {
      if (sentToUsers[userId]) continue;
      sentToUsers[userId] = true;
      bot.sendMessage(userId, text);
    }
  }
}

function loadGroupPosts(groupId) {
  vkapi.call('wall.get', { owner_id: -groupId, count: 100 })
    .then(response => {
      response.items.reverse().forEach(post => {
        if (vkGroupLastMessageIds[groupId] > post.id) return;
        vkGroupLastMessageIds[groupId] = post.id;
        sendPostToUsers(bot, post);
      });
    });
}

function loadNewPosts() {
  vkGroups.forEach(vkGroupId => loadGroupPosts(vkGroupId));
}

function loadNewPostsLoop() {
  // loadNewPosts();
  // setTimeout(loadNewPostsLoop, LOOP_INTERVAL);
}

async function userKeywords(userId) {
  let docs = await db.userKeywords.find({user_id: userId});
  return docs.map((doc) => doc.keyword);
}

async function userKeywordsMessage(userId) {
  const keywords = await userKeywords(userId);
  if (keywords.length) return 'Your keywords:\n' + keywords.join('\n')
  return 'No keywords\nEnter\n/add keyword\nto add new one'
}

function currentTimestamp() {
  const now = new Date(Date.now());
  return now.toJSON()
}

function reloadKeywordUsers(keyword) {
  db.userKeywords.find({keyword: keyword}, (err, docs) => {
    if (!err) keywordUsers[keyword] = docs;
  });
}

async function commandAdd(msg, props) {
  const keyword = props.match[1];
  const userId = msg.from.id;

  let objKeyword = { keyword: keyword, user_id: userId };
  let docs = await db.userKeywords.find(objKeyword);
  if (docs.length) return msg.reply.text(`Keyword ${keyword} already exists`
    + "\n\n" + userKeywordsMessage(msg.from.id));

  objKeyword = Object.assign(objKeyword, { created_at: currentTimestamp() });

  await db.userKeywords.insert(objKeyword);
  await reloadKeywordUsers(keyword);

  let answer = `Added keyword ${keyword}`
    + "\n\n" + await userKeywordsMessage(userId);
  return msg.reply.text(answer);
}
bot.on(/^\/add (.+)$/, commandAdd);

async function commandKeywords(msg, _props) {
  let answer = await userKeywordsMessage(msg.from.id);
  return msg.reply.text(answer);
}
bot.on('/keywords', commandKeywords);

// bot.on(/^\/add (.+)$/, (msg, props) => {
//   const keyword = props.match[1];
//   const userId = msg.from.id;

//   //

//   let objKeyword = { keyword: keyword, user_id: userId };
//   docs = await db.userKeywords.find(objKeyword);
//   console.log(docs);

//   // let objKeyword = { keyword: keyword, user_id: userId };
//   // db.userKeywords.find(objKeyword, (err, docs) => {
//   //   if (err) return msg.reply.text(SOME_ERROR_MESSAGE);
//   //   if (docs.length) return msg.reply.text(`Keyword ${keyword} already exists`
//   //     + "\n\n" + userKeywordsMessage(msg.from.id));

//   //   objKeyword = Object.assign(objKeyword, { created_at: currentTimestamp() });

//   //   db.insert(objKeyword, function (err, _newDoc) {
//   //     if (err) return msg.reply.text(SOME_ERROR_MESSAGE);
//   //     reloadKeywordUsers(keyword);
//   //     let answer = `Added keyword ${keyword}`
//   //       + "\n\n" + userKeywordsMessage(userId);
//   //     return msg.reply.text(answer);
//   //   });
//   // });
// });

bot.on(/^\/delete (.+)$/, (msg, props) => {
  const keyword = props.match[1];
  // usersKeywords[msg.from.id].remove(keyword); ???
  let answer = `Deleted keyword ${keyword}`
    + "\n\n" + userKeywordsMessage(msg.from.id);
  return msg.reply.text(answer);
});

function helpMessage() {
  return '' +
    '/add keyword - Adds new keyword to the list\n' +
    '/delete keyword - Delete keyword from the list\n' +
    '/keywords - List your keywords\n' +
    '/help - This help';
}

bot.on(['/start', '/help'], (msg) => {
  let answer = helpMessage();
  return msg.reply.text(answer);
});

bot.start();
loadNewPostsLoop();
