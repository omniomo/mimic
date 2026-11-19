// One sample conversation per scene ("Load an example" and the gallery thumbnails).

import { blankProject, findPerson, importScript, zhen } from './project'
import { has, isChat, rulesOf } from './rules'
import type { Entry, Project, Template, Thinking } from './types'
import { makeEntry } from './types'

const SAMPLES: Partial<Record<Template, string>> = {
  wechatGroup: `[19:38]
小满：我到楼下了
阿椰：我也快了
我：小满 我就在你家楼下，你家灯还亮着
小满：我也没说是谁家楼下啊
阿椰：行 那我也算到了，我在自己家楼下`,
  wechatDirect: `[08:12]
小满：你今天不是说要晨跑吗
我：跑了
小满：运动记录怎么就12步
我：跑去关闹钟`,
  bilibili: `半格电：看完把抽屉里那台也开了机，显示 2008 年。先别校时，让它在那边多待会儿。
帧率随缘：2:17 开机音一响，我手就开始找挂绳了
> 缓冲中：回复 @帧率随缘：我先找的充电器。找了两年
周三不上线：没想到这期还有原图对比，拉满看确实是两种颜色
像素没对齐：现在的手机拍太清楚了。我想保留一点没洗头的悬念。`,
  instagramDirect: `[Today 9:12 PM]
nori.jpeg: did you just like a photo of me from 2019
Me: my thumb slipped
Me: down 84 posts
nori.jpeg: did it have a layover`,
  instagramComments: `gloss.archive: slide 3 was taken on a digicam right
jpeg.jules: that direct flash is so good
> nori.jpeg: @jpeg.jules that’s my kitchen ceiling light 😭
receipt.jpg: slide 6 is going on my outfit board`,
  instagramGroup: `[Today 11:12 PM]
nori.jpeg: did either of you watch the reel i sent
outofmiso: the one about screen time?
Me: yeah i watched it instead of going to bed
nori.jpeg: honestly the full experience`,
  imessageDirect: `[Today 9:12 PM]
Jules: i think my roomba is mad at me
Me: what did you do
Jules: moved the rug. now it just bumps my door and leaves
Me: honestly that's pretty clear communication`,
  imessageGroup: `[Today 7:12 PM]
Jules: can everyone do thursday
Ari: yep
Me: sending the invite before anyone else speaks
Jules: wait what month`,
  whatsappDirect: `[Today 4:12 AM]
== 🔒 Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.
Noor: are you at the gate yet
Me: just got here
Me: the gate changed while i was standing at it
Noor: love a walking tour with my boarding pass [引用 Me：the gate changed while i was standing at it]`,
  whatsappGroup: `[Today 6:12 PM]
== 🔒 Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.
Noor: i'm at the airbnb, what's the door code
Izzy: it's in the pinned message
Me: you pinned a photo of a pigeon
Noor: he does look like he knows the code`,
  telegramDirect: `[Today 4:12 AM]
luma.zip: can you delete that voice note
Me: too late
Me: i saved it in a folder called evidence
luma.zip: that was me trying to open a bag of chips [引用 Me：i saved it in a folder called evidence]`,
  telegramGroup: `[Today 10:12 PM]
luma.zip: is final_FINAL the one i should send
patchnotes: no, there's a newer one
Me: actually_final?
luma.zip: no that's the old new one`,
  youtube: `goodenoughlab: Fan settings at 6:18. Yes, I remembered to peel the plastic this time.
tabhoarder: At 3:02 the PC starts cooling the entire apartment.
> cablebasil: It has two settings. Off and regional airport.
roomtemp.exe: Tried the 40% curve. My mic can finally hear me again.
jpg_or_else: The way you checked the plastic twice after last week's comments 💀`,
  tiktok: `kneecap.jpg: did the cat just close your laptop mid call
> nori.jpeg: he heard “quick sync” and made a decision
outofmiso: the little look at the camera after 😭
> tabhoarder: like yes i am available for questions
roomtemp.exe: i need him on my team`,
  douyin: `半格电：它进电梯怎么还回头看了一眼，怕我跟它抢单？
> 这条先别剪：它等我刷卡呢，已经蹭了三次楼
缓冲中：听到「请让一让」我真把腿缩了
> 不要葱谢谢：回复 @缓冲中：我也是，隔着屏幕呢
今天不加冰：所以外卖送到了吗 我比它急`,
  xiaohongshu: `卷卷没醒：是原相机吗 这个灰蓝好漂亮
> 雾面小满：是的，曝光往下拉一格就行
耳机只剩左边：[语音 12]
梨先不削：看到帽子那句已经晚了。我的帽子现在应该在天津。
拖延有时差：想问从礼堂走过去要多久呀 我妈只接受十分钟以内`,
  snapchatDirect: `[Today 9:38 PM]
Rue: please tell me this isn't your tote
Rue: [snap]
Me: that's mine
Me: where even are you
[screenshot Rue]
Rue: it lives here now [saved]
Rue: i'm taking it to brunch
Me: at least invite me`,
  snapchatGroup: `[Today 11:02 PM]
Rue: whoever left fries on the table
Kit: they're mine
Me: were*
Rue: [snap]
[screenshot Kit]
Kit: this is going in the group expenses`,
  discord: `[Today 9:38 PM]
== cachemiss joined the server.
soup.dev: who's in vc with their mic on
cachemiss: nobody. i just checked
cachemiss: wait i can hear a microwave
RoomBot: 1 member in Lounge: jpegrot [引用 soup.dev：who's in vc with their mic on]
packetloss: @jpegrot can you bring popcorn
jpegrot: that's my gpu
jpegrot: and no you can't have any [edited]`,
  wechatMoments: `梨先不削：特意挑了个靠窗的位置，太阳把我手机晒关机了。被迫享受当下。
> 阿椰：哪家啊 想去坐会儿
> 梨先不削 回复 阿椰：武康路路口那家。怕热就坐里面，外面那排是烤盘。
> 周三不上线：我带充电宝来
阿昼：猫坐我键盘上回了同事一个「好」。目前是今天唯一确认的事。
> 不要葱谢谢：至少它回了
不要葱谢谢：买了个模拟日出的闹钟。今天它日出了两次，我一次都没起。
[赞 梨先不削]`,
}

export function exampleProject(template: Template): Project {
  if (has(rulesOf(template), 'assistant')) return assistantExample(template)
  const p = blankProject(template)
  p.people = []
  p.selfID = undefined
  try { importScript(p, SAMPLES[template] ?? '', true) } catch { /* empty sample */ }
  if (template === 'bilibili') {
    p.people.forEach((x, i) => { x.level = String(6 - (i % 3)) })
    p.entries[0].authorLiked = true
    p.entries[1].replies = '12'
  }
  if (template === 'instagramComments') p.entries[1].replies = '4'
  decorateExample(p)
  if (!isChat(rulesOf(template))) {
    const counts = ['352', '128', '', '42', '17']
    p.entries.forEach((e, i) => {
      e.metadata = zhen(p.language, '2 小时前', '2h')
      e.likes = counts[i] ?? ''
    })
    if (template === 'youtube') decorateYouTube(p)
    decorateNewScenes(p)
  }
  return p
}

function react(p: Project, i: number, emoji: string) {
  const e = p.entries[i]
  if (!e) return
  e.isLiked = true
  e.reaction = emoji
}

function decorateExample(p: Project) {
  switch (p.template) {
    case 'imessageDirect': react(p, 2, '❤️'); if (p.entries.length) p.entries[p.entries.length - 1].receipt = 'read'; break
    case 'imessageGroup': react(p, 3, '😂'); break
    case 'whatsappDirect': react(p, 4, '❤️'); break
    case 'whatsappGroup': react(p, 3, '😂'); break
    case 'telegramDirect': react(p, 3, '❤️'); break
    case 'telegramGroup': react(p, 2, '😁'); break
    case 'instagramGroup': react(p, 3, '❤️'); break
    case 'discord': {
      const colors: Record<string, number> = { 'soup.dev': 4, cachemiss: 1, packetloss: 6, jpegrot: 2 }
      for (const x of p.people) {
        x.roleColor = colors[x.name]
        if (x.name === 'RoomBot') x.isBot = true
      }
      p.selfID = findPerson(p, 'jpegrot')?.id
      const at = p.entries.find(e => e.text.startsWith('@jpegrot '))
      if (at) at.reactions = [{ emoji: '😳', count: 4, mine: true }, { emoji: '💀', count: 2 }]
      break
    }
  }
}

function setEach(p: Project, values: string[], apply: (e: Entry, v: string) => void) {
  values.forEach((v, i) => { if (p.entries[i]) apply(p.entries[i], v) })
}

function decorateNewScenes(p: Project) {
  const person = (name: string) => findPerson(p, name)?.id
  switch (p.template) {
    case 'douyin':
      p.authorID = person('这条先别剪')
      setEach(p, ['2小时前 · 广东', '1小时前 · 浙江', '45分钟前 · 四川', '30分钟前 · 四川', '12分钟前 · 上海'], (e, v) => { e.metadata = v })
      setEach(p, ['1.8万', '2301', '512', '18', '96'], (e, v) => { e.likes = v })
      p.entries[0].authorLiked = true
      p.entries[0].replies = '326'
      p.commentCount = '1.2万'
      break
    case 'tiktok': {
      p.authorID = person('nori.jpeg')
      const author = p.people.find(x => x.id === p.authorID)
      if (author) author.verified = true
      setEach(p, ['2h', '1h', '45m', '30m', '12m'], (e, v) => { e.metadata = v })
      setEach(p, ['18.2K', '2,301', '512', '18', '96'], (e, v) => { e.likes = v })
      p.entries[0].authorLiked = true
      p.entries[0].replies = '326'
      p.commentCount = '1,284'
      break
    }
    case 'xiaohongshu':
      p.authorID = person('雾面小满')
      setEach(p, ['11-05 北京', '11-05 河北', '11-05 上海', '11-06 江苏', '11-06 浙江'], (e, v) => { e.metadata = v })
      setEach(p, ['236', '41', '89', '12', '7'], (e, v) => { e.likes = v })
      p.entries[0].replies = '18'
      p.noteTitle = '阿那亚傍晚机位｜帽子别戴松的'
      p.noteText = '五点从礼堂往北走，人会少一点。风是真的大，建议扎头发。我以为在拍海，回家一看，一半是我的刘海。\n#阿那亚 #海边散步'
      p.noteMeta = '编辑于 11-05 河北'
      p.noteLikes = '2.1万'
      p.noteSaves = '8032'
      p.commentCount = '1284'
      break
    case 'wechatMoments': {
      p.selfID = person('不要葱谢谢')
      for (const e of p.entries) e.metadata = ''
      const posts = p.entries.filter(e => !e.isReply)
      const times = ['2小时前', '昨天', '3天前']
      posts.forEach((e, k) => { e.metadata = times[k % times.length] })
      if (posts[0]) {
        posts[0].detail = '上海 · 武康路'
        posts[0].likers = ['周三不上线', '阿椰', '阿昼', '不要葱谢谢'].map(person).filter((x): x is string => !!x)
      }
      const mine = [...posts].reverse().find(e => e.personID === p.selfID)
      if (mine) mine.audience = 'partial'
      p.momentsAlert = '2'
      break
    }
  }
}

function decorateYouTube(p: Project) {
  const times = ['1d ago', '2h ago', '1h ago', '3h ago', '5h ago']
  const zhTimes = ['1 天前', '2 小时前', '1 小时前', '3 小时前', '5 小时前']
  const likes = ['1.2K', '356', '48', '89', '12']
  p.entries.forEach((e, i) => {
    e.metadata = zhen(p.language, zhTimes[i % 5], times[i % 5])
    e.likes = likes[i % likes.length]
  })
  const first = p.entries[0]
  if (!first) return
  p.authorID = first.personID
  const author = p.people.find(x => x.id === first.personID)
  if (author) author.verified = true
  first.pinned = true
  if (p.entries[1]) { p.entries[1].replies = '24'; p.entries[1].authorLiked = true }
  p.commentCount = '1.2K'
}

function assistantExample(template: Template): Project {
  const p = blankProject(template)
  const me = p.selfID!
  const ai = p.people.find(x => x.id !== me)!.id
  const ask = (text: string) => makeEntry(me, { text })
  const reply = (text: string, thinking?: Thinking, sources?: string[]) => makeEntry(ai, { text, thinking, sources })
  switch (template) {
    case 'gemini':
      p.entries = [
        ask('I have 64 tabs open and one of them is a recipe. Is there a way to close all of them without finding out which one?'),
        reply('Yes. **Bookmark all open tabs** in one folder, then close them. You can open the folder again when you need it.\n\n- Open your browser’s **Bookmarks** menu and look for the option to bookmark all tabs.\n- Name the folder something searchable, like **pasta + 63 witnesses**.', { seconds: 6 }, ['Chrome Help', 'Mozilla Support']),
        ask('wait i think the recipe is in my other window'),
        reply('The command saves tabs from **the current window**. Repeat it in the other window. You can name that folder **pasta, appeal pending**.'),
      ]
      p.title = '64 open tabs'
      break
    case 'deepseek':
      p.entries = [
        ask('别人问我周末干嘛了，怎么把「在家等外卖」说得像真的有安排？'),
        reply('看你俩有多熟：\n\n1. **同事**：「在家休息了一下，试了家新店。」\n2. **朋友**：「周末主要在看一个小蓝点怎么在我家附近绕了三圈。」\n3. **一起点外卖的朋友**：「我周六那单周日才吃完，算跨天活动。」',
          { seconds: 12, text: '这是闲聊，用户想要几句拿来就能发的话。按关系远近给三种口气。等餐时一直看骑手地图这点很具体，熟人应该听得懂。', open: true }),
        ask('那他要是问好不好吃呢'),
        reply('「饭不错，建议吃饱了再点。」', { seconds: 5 }),
      ]
      p.title = '周末干嘛了'
      break
    default:
      p.entries = [
        ask('I moved 47 screenshots into a folder called sort-later. write me a commit message that sounds like progress'),
        reply('**`chore: consolidate screenshots`**\n\nIt’s accurate. The screenshots had 47 addresses and now they have one.\n\n- For a team repo: `chore: move reference images into one folder`\n- For your own repo: `chore: put the mess behind a door`', { seconds: 12 }),
        ask('what if the folder already has a folder called sort-later'),
        reply('At this point you can call it recursion.\n\n```bash\ngit commit -m "chore: defer sorting at a deeper level"\n```'),
      ]
      p.title = 'Commit message for sort-later'
  }
  p.statusTime = '9:41'
  return p
}
