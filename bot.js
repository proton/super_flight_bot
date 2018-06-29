const TeleBot = require('telebot');
const bot = new TeleBot(process.env.TG_TOKEN);

const vkapi = new (require('node-vkapi'))({ accessToken: process.env.VK_TOKEN });

let usersKeywords = {
  60037421: ['берлин']
}

const vkGroups = [63731512, 119000633];
let vkGroupLastMessageIds = {};

// every minute

vkGroups.forEach(vkGroupId => {
  return vkapi.call('wall.get', { owner_id: -vkGroupId, count: 100 })
    .then(response => {
      response.items.forEach(post => {
        let lowercased_text = post.text.toLowerCase();
        const url = `https://vk.com/wall-${vkGroupId}_${post.id}`
        for (var user_id in usersKeywords) {
          let keywords = usersKeywords[user_id];
          if(keywords.some(keyword => lowercased_text.includes(keyword))) {
            let text = post.text + "\n\n" + url;
            bot.sendMessage(user_id, text);
          }
        }
      });

      // const photo = response.items[0].attachments[0].photo;

      // return vkapi.call('photos.getById', {
      //   photos: `${photo.owner_id}_${photo.id}_${photo.access_key}`
      // });
    });
});




//

//

// bot.on('text', (msg) => { console.log(msg); msg.reply.text(msg.text) });

// bot.start();

// // user = msg.from.id
// bot.sendMessage(60037421, "Hello!");
// bot.sendMessage(60037421, "Hello!");
// bot.sendMessage(60037421, "Hello!");

// TODO: rss parser