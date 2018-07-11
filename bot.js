'use strict';
const TeleBot = require('telebot');
const bot = new TeleBot(process.env.TG_TOKEN);
const vkapi = new (require('node-vkapi'))({ accessToken: process.env.VK_TOKEN });
const Datastore = require('nedb-promises')
const LOOP_INTERVAL = 3000;
const vkGroups = [63731512, 119000633];
const SOME_ERROR_MESSAGE = 'Some error :(\nPlease try again later.';
const adminIds = loadAdminIds();

let db = {};
db.userKeywords = Datastore.create('var/user_keywords.db');
db.vkGroups = Datastore.create('var/vk_groups.db');

let keywordUsers = {};
let vkGroupLastMessageIds = {};

function loadAdminIds() {
  let str = process.env.ADMIN_IDS || '';
  return str.length ? str.split(',').map(id => +id) : [];
}

function isAdmin(userId) {
  return adminIds.includes(userId);
}

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

async function reloadKeywordUsers(keyword) {
  let docs = await db.userKeywords.find({keyword: keyword});
  const userIds = docs.map((doc) => doc.user_id);
  keywordUsers[keyword] = userIds;
}

function commandList(userId) {
  const baseCommands = [
    '/add keyword - Adds new keyword to the list',
    '/delete keyword - Delete keyword from the list',
    '/keywords - List your keywords',
    '/help - This help'
  ];
  const adminCommands = [
    '/add_vk_group - Adds new vk group'
  ];
  return isAdmin(userId) ? baseCommands.concat(adminCommands) : baseCommands;
}

async function commandAdd(msg, props) {
  const keyword = props.match[1];
  const userId = msg.from.id;

  let objKeyword = { keyword: keyword, user_id: userId };
  let docs = await db.userKeywords.find(objKeyword);

  let answer;
  if (docs.length) answer = `Keyword ${keyword} already exists`;
  else {
    objKeyword = Object.assign(objKeyword, { created_at: currentTimestamp() });
    await db.userKeywords.insert(objKeyword);
    await reloadKeywordUsers(keyword);
    answer = `Added keyword ${keyword}`;
  }

  answer += "\n\n" + await userKeywordsMessage(userId);
  return msg.reply.text(answer);
}

async function commandDelete(msg, props) {
  const keyword = props.match[1];
  const userId = msg.from.id;

  let objKeyword = { keyword: keyword, user_id: userId };

  const cnt = await db.userKeywords.remove(objKeyword, { multi: true });

  let answer;
  if (cnt == 0) answer = `Keyword ${keyword} doesnt exist`;
  else {
    answer = `Deleted keyword ${keyword}`;
    await reloadKeywordUsers(keyword);
  }

  answer += "\n\n" + await userKeywordsMessage(userId);
  return msg.reply.text(answer);
}

async function commandKeywords(msg, _props) {
  let answer = await userKeywordsMessage(msg.from.id);
  return msg.reply.text(answer);
}

async function commandHelp(msg, _props) {
  const userId = msg.from.id;

  let answer = commandList(userId).join('\n');
  return msg.reply.text(answer);
}

bot.on(/^\/add (.+)$/, commandAdd);
bot.on(/^\/delete (.+)$/, commandDelete);
bot.on('/keywords', commandKeywords);
bot.on(['/start', '/help'], commandHelp);

bot.start();
loadNewPostsLoop();
