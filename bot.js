const TeleBot = require('telebot');
const bot = new TeleBot(process.env.TG_TOKEN);
const vkapi = new (require('node-vkapi'))({ accessToken: process.env.VK_TOKEN });
const Datastore = require('nedb')
let db = new Datastore({ filename: 'var/data.db', autoload: true });
const LOOP_INTERVAL = 3000;

let keywordUsers = {
  'берлин': [60037421]
}

const vkGroups = [63731512, 119000633];
let vkGroupLastMessageIds = {};

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
    //TODO: guard
    if (lowercased_text.includes(keyword)) {
      let text = postToMessage(post);
      userIds = keywordUsers[keyword];
      for (let userId in userIds) {
        if (!sentToUsers[userId]) {
          sentToUsers[userId] = true;
          bot.sendMessage(userId, text);
        }
      }
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
  loadNewPosts();
  setTimeout(loadNewPostsLoop, LOOP_INTERVAL);
}

function userKeywordsMessage(userId) {
  const keywords = usersKeywords[msg.from.id];
  if (keywords.length) return 'Your keywords:\n' + keywords.join('\n')
  return 'No keywords\nEnter\n/add keyword\nto add new one'
}

bot.on('/keywords', (msg) => {
  let answer = userKeywordsMessage(msg.from.id);
  return msg.reply.text(answer);
})

bot.on(/^\/add (.+)$/, (msg, props) => {
  const keyword = props.match[1];
  usersKeywords[msg.from.id].push(keyword);
  let answer = `Added keyword ${keyword}`
    + "\n\n" + userKeywordsMessage(msg.from.id);
  return msg.reply.text(answer);
});

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

bot.on('/start', (msg) => {
  let answer = helpMessage();
  return msg.reply.text(answer);
});

bot.on('/help', (msg) => {
  let answer = helpMessage();
  return msg.reply.text(answer);
});

bot.start();
loadNewPostsLoop();
