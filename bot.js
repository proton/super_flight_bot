const TeleBot = require('telebot');
const bot = new TeleBot(process.env.TG_TOKEN);
const vkapi = new (require('node-vkapi'))({ accessToken: process.env.VK_TOKEN });
const LOOP_INTERVAL = 3000;

let usersKeywords = {
  60037421: ['берлин']
}

const vkGroups = [63731512, 119000633];
let vkGroupLastMessageIds = {};

function loadGroupPosts(groupId) {
  vkapi.call('wall.get', { owner_id: -groupId, count: 100 })
    .then(response => {
      response.items.reverse().forEach(post => {
        if (vkGroupLastMessageIds[groupId] > post.id) return;
        vkGroupLastMessageIds[groupId] = post.id;

        let lowercased_text = post.text.toLowerCase();
        const url = `https://vk.com/wall-${groupId}_${post.id}`
        for (var user_id in usersKeywords) {
          let keywords = usersKeywords[user_id];
          if(keywords.some(keyword => lowercased_text.includes(keyword))) {
            let text = post.text + "\n\n" + url;
            bot.sendMessage(user_id, text);
          }
        }
      });
    });
}

bot.start();

function loadNewPosts() {
  vkGroups.forEach(vkGroupId => loadGroupPosts(vkGroupId));
}

function loadNewPostsLoop() {
  loadNewPosts();
  setTimeout(loadNewPostsLoop, LOOP_INTERVAL);
}

bot.on('/keywords', (msg) => {
  const keywords = usersKeywords[msg.from.id];
  if (keywords.length) answer = 'Keywords:\n' + keywords.join('\n')
  else answer = 'No keywords\nEnter\n/add keyword\nto add new one'
  return msg.reply.text(answer);
});

loadNewPostsLoop();


// every minute




//

//

// bot.on('text', (msg) => { console.log(msg); msg.reply.text(msg.text) });


// // user = msg.from.id
// bot.sendMessage(60037421, "Hello!");
// bot.sendMessage(60037421, "Hello!");
// bot.sendMessage(60037421, "Hello!");

// TODO: rss parser