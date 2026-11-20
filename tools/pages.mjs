// Writes Mimic's generator pages, one per app, into public/ (served as they are):
//   /generators/<app>/        every app, in English
//   /zh/generators/<app>/     the Chinese apps, in Chinese (paired with the English page by hreflang)
//   /generators/, /zh/generators/   the lists
// plus public/sitemap.xml. Plain HTML, no script: what an app's page says comes from what Mimic's scene for
// that app can show (src/model/rules.ts), and its picture is Mimic's own example (public/examples/<family>.webp,
// rendered from the gallery). Each page's button opens Mimic with that app's example (/?make=<family>).
//
//   node tools/pages.mjs
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')
const SITE = 'https://mimic.ooooomo.com'
const TODAY = new Date().toISOString().slice(0, 10)

// The mark, in currentColor (public/favicon.svg without its colour switch).
const MARK = readFileSync(join(PUBLIC, 'favicon.svg'), 'utf8')
  .replace(/<style>.*?<\/style>/s, '')
  .replace(' width="64" height="64"', ' class="mark" aria-hidden="true" focusable="false"')
  .replace('fill="none"', 'fill="none" stroke="currentColor"')
  .replaceAll(' class="s"', '')
  .replaceAll(' class="f"', ' fill="currentColor"')
  .trim()

// ---------------------------------------------------------------- the apps
// form: chat | comments | feed (rules.ts). cards: comment cards; stickers: "Reply to …'s comment" stickers.
const APPS = [
  {
    family: 'imessage', slug: 'imessage', name: 'iMessage', form: 'chat',
    title: 'Fake iMessage & Text Message Generator, With Video | Mimic',
    description: 'Make a fake iMessage or text conversation with blue or green bubbles, Tapbacks, replies and Read receipts. Export screenshots or video. Free, no watermark.',
    h1: 'Fake iMessage Generator',
    lede: 'Type a text conversation, one-on-one or in a group, and Mimic draws it as iMessage on an iPhone screen, ready to drop into your video.',
    cta: 'Make an iMessage chat',
    has: ['One-on-one chats and group chats', 'Blue iMessage or green SMS bubbles', 'Tapback reactions, replies, edited and unsent messages',
      '“Delivered” and “Read” receipts, and messages that failed to send', 'Photos, stickers, voice messages, links, files, locations and contact cards',
      'Typing bubbles, and banners dropping in from the top'],
  },
  {
    family: 'whatsapp', slug: 'whatsapp', name: 'WhatsApp', form: 'chat',
    title: 'Fake WhatsApp Chat Generator: Screenshots & Video | Mimic',
    description: 'Make a fake WhatsApp chat with photos, voice messages, reactions, replies and blue ticks. Export screenshots, one long image or an MP4. Free, no watermark.',
    h1: 'Fake WhatsApp Chat Generator',
    lede: 'Write a WhatsApp conversation, private or in a group, and Mimic lays it out on WhatsApp’s wallpaper, ticks and all.',
    cta: 'Make a WhatsApp chat',
    has: ['Private chats and group chats', 'Reactions, replies, edited and deleted messages', 'Ticks for sent, delivered and read, and messages that didn’t send',
      'Photos, stickers, voice messages, calls, links, files, locations and contacts', '“online” or “last seen” under the name, “typing…” in the header',
      'The wallpaper and the end-to-end encryption notice'],
  },
  {
    family: 'snapchat', slug: 'snapchat', name: 'Snapchat', form: 'chat',
    title: 'Fake Snapchat Chat Generator: Screenshots & Video | Mimic',
    description: 'Make a fake Snapchat chat with Snaps, saved messages, screenshot alerts, voice notes and calls. Export screenshots or an MP4 video. Free, no watermark.',
    h1: 'Fake Snapchat Chat Generator',
    lede: 'Write a Snapchat conversation and Mimic draws it in Snapchat’s chat, with Snaps, saves and the screenshot alert everyone dreads.',
    cta: 'Make a Snapchat chat',
    has: ['One-on-one chats and group chats', 'Snaps, photos, stickers, voice messages, calls and links', 'Saved messages and “… took a screenshot of chat”',
      'Deleted messages, and “Delivered” and “Opened” under your Snaps', 'Typing bubbles, and banners dropping in from the top'],
  },
  {
    family: 'telegram', slug: 'telegram', name: 'Telegram', form: 'chat',
    title: 'Fake Telegram Chat Generator: Screenshots & Video | Mimic',
    description: 'Make a fake Telegram chat with reactions, replies, voice messages and read ticks, private or in a group. Export screenshots or an MP4. Free, no watermark.',
    h1: 'Fake Telegram Chat Generator',
    lede: 'Write a Telegram conversation and Mimic draws it on Telegram’s patterned wallpaper, with reactions, replies and read ticks.',
    cta: 'Make a Telegram chat',
    has: ['Private chats and group chats', 'Reactions, replies and edited messages', 'Read ticks, and messages that didn’t send',
      'Photos, stickers, voice messages, calls, links, files, locations and contacts', '“last seen recently” under the name, “typing…” in the header',
      'Telegram’s patterned wallpaper'],
  },
  {
    family: 'instagram', slug: 'instagram-dm', name: 'Instagram', form: 'chat',
    title: 'Fake Instagram DM Generator: Screenshots & Video | Mimic',
    description: 'Make a fake Instagram DM with reactions, replies, photos and voice messages, one-on-one or in a group. Export screenshots or an MP4. Free, no watermark.',
    h1: 'Fake Instagram DM Generator',
    lede: 'Write an Instagram direct-message thread and Mimic draws it in Instagram’s chat, verified badge included if you want one.',
    cta: 'Make an Instagram DM',
    has: ['One-on-one chats and group chats', 'Reactions, replies and unsent messages', 'Verified badges',
      'Photos, stickers, voice messages, links and calls', 'Typing bubbles, and banners dropping in from the top'],
  },
  {
    family: 'instagramComments', slug: 'instagram-comments', name: 'Instagram', form: 'comments', cards: true,
    title: 'Instagram Comment Generator: Screenshots & Video | Mimic',
    description: 'Make a fake Instagram comment section with replies, likes, pinned comments and verified badges. Export screenshots, comment cards or video. Free, no watermark.',
    h1: 'Instagram Comment Generator',
    lede: 'Write the comments under a post and Mimic draws Instagram’s comment sheet: threads, likes, pins and all.',
    cta: 'Make Instagram comments',
    has: ['Comments and threaded replies, with “View … more replies”', 'Likes and pinned comments', 'Verified badges', 'Photos in comments'],
  },
  {
    family: 'youtube', slug: 'youtube-comments', name: 'YouTube', form: 'comments', cards: true,
    title: 'YouTube Comment Generator: Screenshots & Video | Mimic',
    description: 'Make a fake YouTube comment section with replies, likes, pinned comments and creator hearts. Export screenshots, comment cards or video. Free, no watermark.',
    h1: 'YouTube Comment Generator',
    lede: 'Write the comments under a video and Mimic draws YouTube’s comment section, with pins, the creator’s heart and long reply threads.',
    cta: 'Make YouTube comments',
    has: ['Comments and threaded replies, with “… replies” under them', 'Likes, pinned comments and the creator’s heart', 'Creator and verified badges', 'The comment count at the top'],
  },
  {
    family: 'tiktok', slug: 'tiktok-comments', name: 'TikTok', form: 'comments', cards: true, stickers: true,
    title: 'TikTok Comment Generator: Stickers, Cards & Video | Mimic',
    description: 'Make fake TikTok comments and “Reply to …’s comment” stickers on a transparent background, with replies, likes and creator badges. Free, no watermark.',
    h1: 'TikTok Comment Generator',
    lede: 'Write the comments under a TikTok and Mimic draws the comment sheet, or turns each comment into a transparent “Reply to …’s comment” sticker for your next video.',
    cta: 'Make TikTok comments',
    has: ['Comments and threaded replies, with “View … replies”', 'Likes, pinned comments and “Liked by creator”', 'Creator and verified badges', 'Photos in comments',
      'Reply stickers on a transparent background'],
  },
  {
    family: 'discord', slug: 'discord', name: 'Discord', form: 'chat',
    title: 'Fake Discord Message Generator: Screenshots & Video | Mimic',
    description: 'Make fake Discord messages in a channel, with replies, reactions, role colours, bots and edited messages. Export screenshots or an MP4. Free, no watermark.',
    h1: 'Fake Discord Message Generator',
    lede: 'Write a channel’s conversation and Mimic draws it in Discord, with role colours, replies, reactions and the “(edited)” tag.',
    cta: 'Make a Discord chat',
    has: ['A channel with as many people as you like', 'Replies, reactions and edited messages', 'Role colours, and APP tags for bots',
      'Photos, stickers, voice messages, links and files', 'Join messages, and “… is typing” at the bottom'],
  },
  {
    family: 'assistant', slug: 'ai-chat', name: 'ChatGPT, Gemini and DeepSeek', form: 'chat',
    title: 'Fake ChatGPT, Gemini & DeepSeek Chat Generator | Mimic',
    description: 'Make a fake AI conversation in the look of ChatGPT, Gemini or DeepSeek, with thinking time, lists and code blocks. Export screenshots or an MP4. Free.',
    h1: 'Fake AI Chat Generator',
    lede: 'Write a conversation with an AI and Mimic draws it as ChatGPT, Gemini or DeepSeek, thinking time, lists and code blocks included.',
    cta: 'Make an AI chat',
    has: ['ChatGPT, Gemini and DeepSeek looks', '“Thought for …” lines, lists and code blocks', 'Images and files in your messages'],
  },
  {
    family: 'wechat', slug: 'wechat', name: 'WeChat', form: 'chat',
    title: 'Fake WeChat Chat Generator: Screenshots & Video | Mimic',
    description: 'Make a fake WeChat chat, private or in a group, with voice messages, stickers, pats, recalled messages, calls and quotes. Export screenshots or video. Free.',
    h1: 'Fake WeChat Chat Generator',
    lede: 'Write a WeChat conversation, in Chinese or any language, and Mimic draws it on WeChat’s chat screen.',
    cta: 'Make a WeChat chat',
    has: ['Private chats and group chats, with the member count', 'Voice messages, photos, stickers, links, files, locations and contact cards',
      '“Pat” messages, recalled messages and calls', 'Quoted replies, and messages that failed to send', '“Typing…” in the title'],
    zh: {
      title: '微信聊天记录生成器：截图和视频，免费无水印 | Mimic',
      description: '在线生成微信聊天截图和视频：私聊、群聊、语音、表情、拍一拍、撤回、引用、通话都能做。导出单屏截图、长图或 MP4 视频，免费、无水印，在浏览器里完成。',
      name: '微信', h1: '微信聊天记录生成器',
      lede: '把对话打进去，Mimic 就按微信的样子画出来，直接放进你的视频。',
      cta: '做一段微信聊天',
      has: ['私聊和群聊（带群人数）', '语音、图片、表情、链接、文件、位置、名片', '拍一拍、撤回、语音和视频通话', '引用回复、发送失败', '标题栏的“对方正在输入…”'],
    },
  },
  {
    family: 'moments', slug: 'wechat-moments', name: 'WeChat Moments', form: 'feed',
    title: 'WeChat Moments Generator: Screenshots & Video | Mimic',
    description: 'Make a fake WeChat Moments post with photos, likes and a thread of comments and replies. Export screenshots, one long image or an MP4. Free, no watermark.',
    h1: 'WeChat Moments Generator',
    lede: 'Write a Moments post and its comments, and Mimic draws it in WeChat’s feed, with the likes and the back-and-forth underneath.',
    cta: 'Make a Moments post',
    has: ['A post with text and photos', 'The friends who liked it', 'Comments and replies, with their times'],
    zh: {
      title: '朋友圈生成器：截图和视频，免费无水印 | Mimic',
      description: '在线生成朋友圈截图和视频：配文、图片、点赞的人、评论和回复都能做。导出截图、长图或 MP4 视频，免费、无水印，在浏览器里完成。',
      name: '朋友圈', h1: '朋友圈生成器',
      lede: '写一条朋友圈和下面的评论，Mimic 按微信的样子画出来。',
      cta: '做一条朋友圈',
      has: ['配文和图片', '点赞的人', '评论和回复，带时间'],
    },
  },
  {
    family: 'bilibili', slug: 'bilibili-comments', name: 'Bilibili', form: 'comments', cards: true,
    title: 'Bilibili Comment Generator: Screenshots & Video | Mimic',
    description: 'Make a fake Bilibili comment section with replies, likes, user levels, pinned comments and the UP主’s like. Export screenshots, cards or video. Free.',
    h1: 'Bilibili Comment Generator',
    lede: 'Write the comments under a video and Mimic draws Bilibili’s comment section, level badges and all.',
    cta: 'Make Bilibili comments',
    has: ['Comments and threaded replies', 'Likes, pinned comments and “UP主觉得很赞”', 'User levels and the UP主 badge', 'Photos in comments'],
    zh: {
      title: 'B站评论生成器：截图和视频，免费无水印 | Mimic',
      description: '在线生成B站评论区截图和视频：楼中楼回复、点赞、置顶、UP主觉得很赞、等级标识都能做。导出截图、评论卡片或 MP4 视频，免费、无水印。',
      name: 'B站', h1: 'B站评论生成器',
      lede: '把评论打进去，Mimic 按B站评论区的样子画出来。',
      cta: '做一段B站评论',
      has: ['评论和楼中楼回复', '点赞、置顶、“UP主觉得很赞”', '等级和UP主标识', '带图评论'],
    },
  },
  {
    family: 'douyin', slug: 'douyin-comments', name: 'Douyin', form: 'comments', cards: true, stickers: true,
    title: 'Douyin Comment Generator: Stickers, Cards & Video | Mimic',
    description: 'Make fake Douyin comments and reply stickers on a transparent background, with replies, likes and the author badge. Export screenshots, cards or video. Free.',
    h1: 'Douyin Comment Generator',
    lede: 'Write the comments under a Douyin video and Mimic draws the comment sheet, or turns each comment into a reply sticker for your next video.',
    cta: 'Make Douyin comments',
    has: ['Comments and threaded replies', 'Likes and “作者赞过”', 'The author badge and the comment count', 'Photos in comments', 'Reply stickers on a transparent background'],
    zh: {
      title: '抖音评论生成器：评论截图、回复贴纸和视频 | Mimic',
      description: '在线生成抖音评论区截图、透明底的“回复 … 的评论”贴纸和视频：楼中楼回复、点赞、作者赞过都能做。免费、无水印，在浏览器里完成。',
      name: '抖音', h1: '抖音评论生成器',
      lede: '把评论打进去，Mimic 按抖音评论区的样子画出来，也能把每条评论做成透明底的回复贴纸，放进下一条视频。',
      cta: '做一段抖音评论',
      has: ['评论和楼中楼回复', '点赞、作者赞过', '作者标识和评论总数', '带图评论', '透明底的回复贴纸'],
    },
  },
  {
    family: 'xiaohongshu', slug: 'xiaohongshu-comments', name: 'Xiaohongshu', form: 'comments', cards: true,
    title: 'Xiaohongshu Comment Generator: Screenshots & Video | Mimic',
    description: 'Make a fake Xiaohongshu (RED) note with its comments: replies, likes, pinned comments, voice comments and the author tag. Export screenshots or video. Free.',
    h1: 'Xiaohongshu Comment Generator',
    lede: 'Write a note and the comments under it, and Mimic draws Xiaohongshu’s note page, voice comments included.',
    cta: 'Make Xiaohongshu comments',
    has: ['The note at the top: pictures, title, and text with #topics', 'Comments and threaded replies, with “View … replies”', 'Likes, pinned comments and the author tag', 'Photos and voice comments'],
    zh: {
      title: '小红书评论生成器：笔记评论截图和视频 | Mimic',
      description: '在线生成小红书笔记评论区截图和视频：笔记正文、楼中楼回复、点赞、置顶、语音评论、作者标识都能做。免费、无水印，在浏览器里完成。',
      name: '小红书', h1: '小红书评论生成器',
      lede: '写一篇笔记和下面的评论，Mimic 按小红书的样子画出来，语音评论也能做。',
      cta: '做一段小红书评论',
      has: ['笔记正文和话题', '评论和楼中楼回复', '点赞、置顶、作者标识', '带图评论和语音评论'],
    },
  },
]

// ---------------------------------------------------------------- words
const WORDS = {
  en: {
    lang: 'en', open: 'Open Mimic', has: 'What you can put in', get: 'What you get', how: 'How it works', faq: 'Questions', more: 'More generators',
    all: 'All generators', other: '中文',
    exports: app => [
      'Screenshots at 1170 × 2532: one screen, or every screen of a long conversation in a zip.',
      'One tall image of the whole thing.',
      ...(app.cards ? ['Cards: each comment with its replies as its own picture.'] : []),
      ...(app.stickers ? ['Stickers: “Reply to …’s comment” on a transparent background.'] : []),
      app.form === 'chat'
        ? 'An MP4 video (1080 × 2338, 30 fps): the conversation plays out with typing, sounds and notifications.'
        : 'An MP4 video (1080 × 2338, 30 fps) of it playing out.',
      'The .mimic project file, to keep editing later or in another browser.',
    ],
    steps: app => [
      `Open Mimic with ${app.name} picked. It starts from an example you can change.`,
      'Type the messages, or paste a whole conversation. Pick who says what, their names and pictures, and the times.',
      'Export screenshots, a long image or a video, and drop it into your edit.',
    ],
    faqs: app => [
      ['Is Mimic free?', 'Yes. No sign-up and no watermark.'],
      ['Are my conversations uploaded?', 'No. Everything happens in your browser; projects and pictures stay on your device.'],
      ['Can I make a video, not just a screenshot?', 'Yes. Mimic exports an MP4 that plays the scene out, ready for your editor.'],
      [`Is this the real ${app.name}?`, `No. Mimic isn’t affiliated with ${app.name}: it draws a look-alike for videos, stories and mockups. Please don’t use it to pass off a conversation as real, or to put words in real people’s mouths.`],
    ],
    foot: 'Mimic is free and open source.', made: 'Made by', notAffiliated: 'Mimic isn’t affiliated with the apps it draws.',
    indexTitle: 'Fake Chat & Comment Generators: 15 Apps, With Video | Mimic',
    indexDescription: 'Free generators for fake chats and comment sections: iMessage, WhatsApp, Snapchat, Telegram, Instagram, YouTube, TikTok, Discord, ChatGPT, WeChat and more.',
    indexH1: 'Chat and comment generators',
    indexLede: 'Pick an app. Mimic draws the conversation or the comment section in its look, as screenshots, a long image or a video.',
  },
  zh: {
    lang: 'zh-Hans', open: '打开 Mimic', has: '能放进去的', get: '能导出的', how: '怎么用', faq: '常见问题', more: '更多生成器',
    all: '全部生成器', other: 'English',
    exports: app => [
      '截图：1170 × 2532，单屏，或者长对话的每一屏打包下载',
      '长图：整段一张图',
      ...(app.cards ? ['评论卡片：每条评论连同回复单独一张图'] : []),
      ...(app.stickers ? ['回复贴纸：透明底的“回复 … 的评论”'] : []),
      app.form === 'chat'
        ? '视频：MP4（1080 × 2338，30 帧），对话一条条出现，带打字、音效和通知'
        : '视频：MP4（1080 × 2338，30 帧）',
      '.mimic 项目文件：以后接着改，或者换个浏览器打开',
    ],
    steps: app => [
      `打开 Mimic，已经选好${app.zh.name}，从一个示例开始改。`,
      '把消息打进去，或者整段粘贴；改谁说的、名字、头像和时间。',
      '导出截图、长图或视频，拖进剪辑软件就能用。',
    ],
    faqs: app => [
      ['免费吗？', '免费。不用注册，没有水印。'],
      ['聊天内容会上传吗？', '不会。所有东西都在浏览器里完成，项目和图片只存在你自己的设备上。'],
      ['能做视频吗？', '能。Mimic 可以导出 MP4，直接拖进剪辑软件。'],
      [`这是真的${app.zh.name}吗？`, `不是。Mimic 和${app.zh.name}没有关系，只是画一个看起来像的画面，用在视频、故事和设计稿里。请不要用它冒充真实对话，或者替真实的人编造言论。`],
    ],
    foot: 'Mimic 免费开源。', made: '出品：', notAffiliated: 'Mimic 与它画出的各个 App 没有关系。',
    indexTitle: '聊天记录和评论区生成器：微信、朋友圈、抖音、B站、小红书 | Mimic',
    indexDescription: '免费在线生成微信聊天记录、朋友圈、抖音评论、B站评论、小红书评论的截图和视频，不用注册，没有水印，在浏览器里完成。',
    indexH1: '聊天记录和评论区生成器',
    indexLede: '选一个 App，Mimic 按它的样子画出聊天或评论区，导出截图、长图或视频。',
  },
}

// ---------------------------------------------------------------- html
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const url = (lang, slug) => `${SITE}${lang === 'zh' ? '/zh' : ''}/generators/${slug ? `${slug}/` : ''}`
const path = (lang, slug) => `${lang === 'zh' ? '/zh' : ''}/generators/${slug ? `${slug}/` : ''}`
// Chinese headings break before 生成器 / 评论区, never mid-word (generators.css sets keep-all on :lang(zh) h1).
const heading = (text, lang) => lang === 'zh' ? esc(text).replace(/(?=生成器)|(?<=和)(?=评论区)/g, '<wbr>') : esc(text)
const ld = data => `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`

function head({ lang, title, description, canonical, alternates = [] }) {
  const w = WORDS[lang]
  const alt = alternates.length
    ? '\n' + alternates.map(([hl, href]) => `<link rel="alternate" hreflang="${hl}" href="${href}">`).join('\n') +
      `\n<link rel="alternate" hreflang="x-default" href="${alternates.find(([hl]) => hl === 'en')[1]}">`
    : ''
  return `<!doctype html>
<html lang="${w.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">${alt}
<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/icon-512.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Mimic">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/og.png">
<link rel="stylesheet" href="/generators.css?v=1">`
}

function top(lang, otherHref) {
  const w = WORDS[lang]
  return `<header class="top">
<a class="brand" href="/">${MARK}<span>Mimic</span></a>
<nav class="top-links">${otherHref ? `<a href="${otherHref}" lang="${lang === 'zh' ? 'en' : 'zh-Hans'}">${w.other}</a>` : ''}<a class="pill" href="/">${w.open}</a></nav>
</header>`
}

function foot(lang) {
  const w = WORDS[lang]
  return `<footer class="foot">
<p>${w.foot} <a href="https://github.com/omniomo/mimic">GitHub</a> · ${w.made} <a href="https://ooooomo.com/">OMO</a></p>
<p class="quiet">${w.notAffiliated}</p>
</footer>`
}

function appPage(app, lang) {
  const w = WORDS[lang]
  const t = lang === 'zh' ? { ...app, ...app.zh } : app
  const canonical = url(lang, app.slug)
  const alternates = app.zh ? [['en', url('en', app.slug)], ['zh-Hans', url('zh', app.slug)]] : []
  const others = (lang === 'zh' ? APPS.filter(a => a.zh) : APPS).filter(a => a !== app)
  const faqs = w.faqs(app)
  const data = [
    {
      '@context': 'https://schema.org', '@type': 'WebPage', name: t.title.replace(/ \| Mimic$/, ''), description: t.description, url: canonical, inLanguage: w.lang,
      isPartOf: { '@type': 'WebSite', name: 'Mimic', url: `${SITE}/` },
      about: { '@id': `${SITE}/#app` },
      primaryImageOfPage: `${SITE}/examples/${app.family}.webp`,
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Mimic', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: lang === 'zh' ? '生成器' : 'Generators', item: url(lang) },
        { '@type': 'ListItem', position: 3, name: t.h1, item: canonical },
      ],
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ]
  return `${head({ lang, title: t.title, description: t.description, canonical, alternates })}
${data.map(ld).join('\n')}
</head>
<body>
${top(lang, app.zh ? (lang === 'zh' ? path('en', app.slug) : path('zh', app.slug)) : null)}
<main>
<section class="hero">
<div class="hero-words">
<p class="crumbs"><a href="${path(lang)}">${lang === 'zh' ? '生成器' : 'Generators'}</a></p>
<h1>${heading(t.h1, lang)}</h1>
<p class="lede">${esc(t.lede)}</p>
<a class="pill pill--big" href="/?make=${app.family}">${esc(t.cta)}</a>
</div>
<figure class="phone"><img src="/examples/${app.family}.webp" alt="${esc(lang === 'zh' ? `Mimic 画的${t.name}示例` : `An example ${app.name} screen made with Mimic`)}" width="540" height="1169"></figure>
</section>
<section class="cols">
<div><h2>${w.has}</h2><ul>${t.has.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
<div><h2>${w.get}</h2><ul>${w.exports(app).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
</section>
<section>
<h2>${w.how}</h2>
<ol class="steps">${w.steps(app).map(x => `<li>${esc(x)}</li>`).join('')}</ol>
</section>
<section>
<h2>${w.faq}</h2>
<dl class="faq">${faqs.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join('')}</dl>
</section>
<section>
<h2>${w.more}</h2>
<ul class="chips">${others.map(a => `<li><a href="${path(lang, a.slug)}">${esc(lang === 'zh' ? a.zh.h1 : a.h1)}</a></li>`).join('')}</ul>
</section>
</main>
${foot(lang)}
</body>
</html>
`
}

function indexPage(lang) {
  const w = WORDS[lang]
  const apps = lang === 'zh' ? APPS.filter(a => a.zh) : APPS
  const canonical = url(lang)
  const data = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: w.indexH1, description: w.indexDescription, url: canonical, inLanguage: w.lang,
    isPartOf: { '@type': 'WebSite', name: 'Mimic', url: `${SITE}/` },
    hasPart: apps.map(a => ({ '@type': 'WebPage', name: lang === 'zh' ? a.zh.h1 : a.h1, url: url(lang, a.slug) })),
  }
  return `${head({ lang, title: w.indexTitle, description: w.indexDescription, canonical, alternates: [['en', url('en')], ['zh-Hans', url('zh')]] })}
${ld(data)}
</head>
<body>
${top(lang, lang === 'zh' ? path('en') : path('zh'))}
<main>
<section class="intro">
<h1>${heading(w.indexH1, lang)}</h1>
<p class="lede">${esc(w.indexLede)}</p>
</section>
<ul class="grid">${apps.map(a => `<li><a href="${path(lang, a.slug)}"><img src="/examples/${a.family}.webp" alt="" width="540" height="1169" loading="lazy"><span>${esc(lang === 'zh' ? a.zh.h1 : a.h1)}</span></a></li>`).join('')}</ul>
${lang === 'zh' ? `<p class="also">也有英文页面：${APPS.filter(a => !a.zh).map(a => `<a href="${path('en', a.slug)}">${esc(a.h1)}</a>`).join(' · ')}</p>` : ''}
</main>
${foot(lang)}
</body>
</html>
`
}

// ---------------------------------------------------------------- write
const write = (rel, html) => { const f = join(PUBLIC, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, html) }
const pages = [`${SITE}/`]
write('generators/index.html', indexPage('en')); pages.push(url('en'))
write('zh/generators/index.html', indexPage('zh')); pages.push(url('zh'))
for (const app of APPS) {
  write(`generators/${app.slug}/index.html`, appPage(app, 'en')); pages.push(url('en', app.slug))
  if (app.zh) { write(`zh/generators/${app.slug}/index.html`, appPage(app, 'zh')); pages.push(url('zh', app.slug)) }
}
writeFileSync(join(PUBLIC, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(loc => `  <url><loc>${loc}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}
</urlset>
`)
console.log(`wrote ${pages.length - 1} pages and public/sitemap.xml`)
