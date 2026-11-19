# Mimic

Make chat and comment-section screenshots and videos for your videos — iMessage, WhatsApp, Telegram,
Snapchat, Instagram, YouTube, TikTok, Discord, AI chats, WeChat, Moments, Bilibili, Douyin, Xiaohongshu.

Everything happens in your browser. Nothing is uploaded: projects and pictures stay in the browser's
storage (IndexedDB) on your device.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static files in dist/, host them anywhere (GitHub Pages, Netlify, a folder…)
npm run typecheck
```

`dist/` uses relative paths, so it also works from a sub-folder.

It's deployed on Cloudflare Workers as static assets (`wrangler.jsonc`): build with `npm run build`,
then `npx wrangler deploy`.

## What you can make

- **Screenshots**: one phone screen, or every screen of a long conversation (zipped), at 1170 × 2532.
- **Long image**: the whole conversation in one tall picture.
- **Cards** (comment scenes): each comment with its replies as its own picture.
- **Stickers** (Douyin, TikTok): "Reply to …'s comment" cards on a transparent background.
- **Video**: the conversation plays out — typing, sounds, notifications — as an MP4 (1080 × 2338, 30 fps).
- **.mimic files**: the project itself, to keep or to move to another browser.

Video export uses WebCodecs. Chrome and Edge on macOS and Windows, and Safari 17+, write MP4 with sound.
Where the browser has no AAC encoder (Chrome on Linux, for one), you get a zip with the silent MP4 and a WAV.

## How it's built

Vite + React + TypeScript, plain CSS, no UI library. Four layers, each in its own folder:

| Folder | What it is |
| --- | --- |
| `src/model/` | The content: people, entries, projects. `rules.ts` says what each scene has (pure data). |
| `src/scene/` | Drawing. `Phone.tsx` is the frame; `skins/` has one file (and one CSS file) per app. |
| `src/store/` | State: the editor (`studio.ts`), the avatar library, images in IndexedDB. |
| `src/export/`, `src/video/` | Pictures (html-to-image), MP4 (WebCodecs + a small muxer), zip. |
| `src/ui/` | The editor around the phone: gallery, workbench, panels. |
| `src/i18n/` | Editor text in Chinese (`zh.json`); English is the source. |

### Adding a scene

1. Add the template to `TEMPLATES` in `src/model/types.ts` and its rules to `RULES` in `src/model/rules.ts`
   (which kinds of entries it has, and traits such as `quote`, `reactions`, `thread`).
2. Write `src/scene/skins/<app>.tsx` exporting a `Skin` (nav, composer, row; optional notice, lead, typing),
   with its CSS scoped under the skin's class.
3. Register it in `src/scene/skins/index.ts`, and give it a sample in `src/model/examples.ts`.

A skin only draws. What can be added, edited or exported is decided by the rules, so the editor
picks up a new scene without changes.

### Icons

Phone glyphs come from Ionicons 5, editor glyphs from Lucide, copied as a small subset into
`src/ui/icons.tsx`. To add one: `npm i --no-save react-icons`, then `node tools/icons.mjs io5 name=IoSomething`.

## Not in this repo, on purpose

No app logos, no SF Pro, no Apple Color Emoji. Text uses the system font; emoji are your system's.
App names appear only to say which look a scene imitates. Mimic isn't affiliated with any of them.
Please use it for videos, parody and storytelling — not to fake real conversations about real people.

## Licenses

- Code: MIT, see `LICENSE`.
- Icons: Ionicons (MIT, © Ionic), Lucide (ISC, © Lucide contributors).
- Sounds: real recordings, all CC0 1.0. See `CREDITS.md`.
- Default avatars: see `CREDITS.md`.
