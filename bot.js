'use strict'
const TeleBot = require('telebot')
const bot = new TeleBot(process.env.TG_TOKEN)
const vkapi = new (require('node-vkapi'))({ accessToken: process.env.VK_TOKEN })
const Datastore = require('nedb-promises')
const LOOP_INTERVAL = 3000
const SOME_ERROR_MESSAGE = 'Some error :(\nPlease try again later.'
const NOT_AUTHORIZED_MESSAGE = 'not authorized'
const adminIds = loadAdminIds()

let db = {}
db.userKeywords = Datastore.create('var/user_keywords.db')
db.vkGroups = Datastore.create('var/vk_groups.db')

let keywordUsers = {}
let vkGroupLastMessageIds = {}

async function loadKeywordUsers () {
  let docs = await db.userKeywords.find()
  docs.forEach(doc => {
    if (!(doc.keyword in keywordUsers)) keywordUsers[doc.keyword] = []
    keywordUsers[doc.keyword].push(doc.user_id)
  })
}

function loadAdminIds () {
  let str = process.env.ADMIN_IDS || ''
  return str.length ? str.split(',').map(id => +id) : []
}

function isAdmin (userId) {
  return adminIds.includes(userId)
}

function postUrl (post) {
  return `https://vk.com/wall${post.from_id}_${post.id}`
}

function postToMessage (post) {
  return post.text + '\n\n' + postUrl(post)
}

function sendPostToUsers (bot, post) {
  let sentToUsers = {}
  let lowerText = post.text.toLowerCase()

  for (let keyword in keywordUsers) {
    if (!lowerText.includes(keyword)) continue
    let text = postToMessage(post)
    let userIds = keywordUsers[keyword]
    userIds.forEach(userId => {
      if (sentToUsers[userId]) return
      bot.sendMessage(userId, text).catch(err => console.log(err))
    })
  }
}

function loadGroupPosts (groupId) {
  vkapi.call('wall.get', { owner_id: -groupId, count: 100 })
    .then(response => {
      response.items.reverse().forEach(post => {
        if (vkGroupLastMessageIds[groupId] > post.id) return
        vkGroupLastMessageIds[groupId] = post.id
        sendPostToUsers(bot, post)
      })
    }).catch(err => { console.log(err) })
}

async function loadNewPosts () {
  const groupIds = await vkGroupIds()
  groupIds.forEach(groupId => loadGroupPosts(groupId))
}

function loadNewPostsLoop () {
  loadNewPosts()
  setTimeout(loadNewPostsLoop, LOOP_INTERVAL)
}

async function userKeywords (userId) {
  let docs = await db.userKeywords.find({user_id: userId})
  return docs.map((doc) => doc.keyword)
}

async function userKeywordsMessage (userId) {
  const keywords = await userKeywords(userId)
  if (keywords.length) return 'Your keywords:\n' + keywords.join('\n')
  return 'No keywords\nEnter\n/add keyword\nto add new one'
}

async function vkGroupIds () {
  let docs = await db.vkGroups.find()
  return docs.map((doc) => doc.group_id)
}

async function vkGroupsListsMessage () {
  const groupIds = await vkGroupIds()
  if (groupIds.length) return 'Vk groups:\n' + groupIds.join('\n')
  return 'No vk groups\nEnter\n/add_vk_group group_id\nto add new one'
}

function currentTimestamp () {
  const now = new Date(Date.now())
  return now.toJSON()
}

async function reloadKeywordUsers (keyword) {
  let docs = await db.userKeywords.find({keyword: keyword})
  const userIds = docs.map((doc) => doc.user_id)
  keywordUsers[keyword] = userIds
}

async function commandAdd (msg, props) {
  const keyword = props.match[1]
  const userId = msg.from.id

  let objKeyword = { keyword: keyword, user_id: userId }
  let docs = await db.userKeywords.find(objKeyword)

  let answer
  if (docs.length) answer = `Keyword ${keyword} already exists`
  else {
    objKeyword = Object.assign(objKeyword, { created_at: currentTimestamp() })
    await db.userKeywords.insert(objKeyword)
    await reloadKeywordUsers(keyword)
    answer = `Added keyword ${keyword}`
  }

  answer += '\n\n' + await userKeywordsMessage(userId)
  return msg.reply.text(answer)
}

async function commandDelete (msg, props) {
  const keyword = props.match[1]
  const userId = msg.from.id

  let objKeyword = { keyword: keyword, user_id: userId }

  const cnt = await db.userKeywords.remove(objKeyword, { multi: true })

  let answer
  if (cnt === 0) answer = `Keyword ${keyword} doesnt exist`
  else {
    answer = `Deleted keyword ${keyword}`
    await reloadKeywordUsers(keyword)
  }

  answer += '\n\n' + await userKeywordsMessage(userId)
  return msg.reply.text(answer)
}

async function commandKeywords (msg, _props) {
  let answer = await userKeywordsMessage(msg.from.id)
  return msg.reply.text(answer)
}

async function commandHelp (msg, _props) {
  const userIsAdmin = isAdmin(msg.from.id)
  let answer = commands.filter(cmd => !cmd.admin || userIsAdmin)
    .map(cmd => cmd.description)
    .join('\n')

  return msg.reply.text(answer)
}

async function commandAddVkGroup (msg, props) {
  let vkGroupId = props.match[1]
  const userId = msg.from.id

  let groups = await vkapi.call('groups.getById', { group_id: vkGroupId })
  let group = groups[0]
  vkGroupId = group.id

  let objGroup = { group_id: vkGroupId }
  let docs = await db.vkGroups.find(objGroup)
  let answer
  if (docs.length) answer = `Group ${vkGroupId} already exists`
  else {
    objGroup = Object.assign(objGroup, { added_at: currentTimestamp() })
    await db.vkGroups.insert(objGroup)
    answer = `Added group ${vkGroupId}`
  }

  answer += '\n\n' + await vkGroupsListsMessage(userId)
  return msg.reply.text(answer)
}

async function commandDeleteVkGroup (msg, props) {
  const userId = msg.from.id
  let vkGroupId = props.match[1]
  let objGroup = { group_id: vkGroupId }

  const cnt = await db.vkGroups.remove(objGroup, { multi: true })

  let answer
  if (cnt === 0) answer = `Vk group ${vkGroupId} doesnt exist`
  else answer = `Deleted vk group ${vkGroupId}`

  answer += '\n\n' + await vkGroupsListsMessage(userId)
  return msg.reply.text(answer)
}

async function commandVkGroups (msg, _props) {
  let answer = await vkGroupsListsMessage()
  return msg.reply.text(answer)
}

const commands = [
  { matcher: /^\/add (.+)$/,
    function: commandAdd,
    description: '/add keyword - Add new keyword to the list' },
  { matcher: /^\/delete (.+)$/,
    function: commandDelete,
    description: '/delete keyword - Delete keyword from the list' },
  { matcher: '/keywords',
    function: commandKeywords,
    description: '/keywords - List your keywords' },
  { matcher: /^\/add_vk_group (.+)$/,
    function: commandAddVkGroup,
    description: '/add_vk_group group_id - Add new vk group',
    admin: true },
  { matcher: /^\/delete_vk_group (.+)$/,
    function: commandDeleteVkGroup,
    description: '/delete_vk_group group_id - Delete vk group',
    admin: true },
  { matcher: '/vk_groups',
    function: commandVkGroups,
    description: '/vk_groups - Show vk groups',
    admin: true },
  { matcher: ['/start', '/help'],
    function: commandHelp,
    description: '/help - This help' }
]

function wrapCommand (command) {
  return async function (msg, props) {
    const userId = msg.from.id
    if (command.admin && !isAdmin(userId)) return msg.reply.text(NOT_AUTHORIZED_MESSAGE)

    try { await command.function(msg, props) } catch (error) {
      let answer = SOME_ERROR_MESSAGE
      if (isAdmin(userId)) answer += '\n\n' + error
      return msg.reply.text(answer)
    }
  }
}

function addNewCommand (command) {
  bot.on(command.matcher, wrapCommand(command))
}

function loadCommands () {
  commands.forEach(command => addNewCommand(command))
}

async function start () {
  loadCommands()
  await loadKeywordUsers()
  bot.on('start', loadNewPostsLoop)
  bot.start()
}

start()
