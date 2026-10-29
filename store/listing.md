# Twinsub store listing

Name and short description come from `_locales/*/messages.json` (extName, extDescription).
Category: Education → Language learning (fallback: Productivity → Tools). Pricing: Free.
Locales: en, zh_CN, ja, ko, fr, de, es, hi, id. Per-locale description, screenshots copy and promo text live in `store/copy/<locale>.json` (the descriptions below are the en and zh copies).
Screenshots: `store/screenshots/<locale>/1-5.png` (1280×800).
Package: `npm run build` → `dist/twinsub-<version>.zip`.
Small promo tile: `store/promo/small-440x280-<locale>.png`. Marquee: `store/promo/marquee-1400x560-<locale>.png`.

## English description

```
Watch anything on YouTube and understand every line.

Twinsub puts two subtitles on the video at once: the original line, and the same line in your language right underneath. You hear the real voice, read the original words, and never miss what was said.

FREE, UNLIMITED, NO SIGN-IN
No account, no API key, no "trial ended" screen after 15 minutes. Install it and open a video. That's the whole setup.

TRANSLATED ON YOUR OWN COMPUTER
Twinsub uses the translator built into Chrome, so every line is translated on your device in milliseconds. Nothing waits on a server, and nothing about what you watch is sent anywhere.

BUILT FOR LANGUAGE LEARNERS
Keep the original on top and the translation underneath, or swap them. Watch Spanish vlogs, Japanese anime clips, Korean variety shows, French cooking, English lectures, and pick up the language from the videos you already like.

WORKS WITH THE SUBTITLES YOU ALREADY HAVE
Hand-made subtitles and YouTube's auto-generated ones both work. Twinsub turns subtitles on for you, follows whatever track you pick in YouTube's CC menu, and keeps working as you click from video to video.

MAKE IT YOURS
• Translate into 39 languages, including Chinese, Japanese, Korean, Spanish, French, German, Portuguese, Russian, Arabic, Hindi and Vietnamese
• Original on top or translation on top
• Text size and height on screen
• Show only the translation, or only the original
• One button in the player bar switches it on and off

HOW TO USE
1. Install Twinsub.
2. Open any YouTube video that has subtitles.
3. The first time you use a language pair, click the yellow prompt once. Chrome downloads its translation pack in a few seconds.
4. Watch.

Needs Chrome 138 or newer on a computer (Windows, Mac, Linux or ChromeOS). Twinsub isn't affiliated with or endorsed by YouTube or Google.
```

## 简体中文描述

```
在 YouTube 上看任何视频，每一句都看得懂。

Twinsub 同时给视频配上两行字幕：上面是原文，下面紧跟着同一句的中文。听着原声，看着原文，哪句都不会错过。

免费、不限量、不用登录
不用注册账号，不用填 API key，也不会看了 15 分钟就弹出"试用已结束"。装好、打开视频，就这么简单。

翻译就在你的电脑上完成
Twinsub 用的是 Chrome 自带的翻译，每一句都在你的电脑上翻译，几毫秒就好。不等服务器，你看了什么也不会被发送到任何地方。

学外语的好帮手
原文在上、译文在下，也可以对调。看西班牙语 vlog、日语动画片段、韩国综艺、法语美食、英文公开课，在本来就爱看的视频里学语言。

自带字幕、自动字幕都能用
人工字幕和 YouTube 自动生成的字幕都支持。Twinsub 会帮你打开字幕，跟随你在 YouTube 字幕菜单里选的语言，点到下一个视频也照样生效。

按你的习惯来
• 可以翻译成 39 种语言：中文（简体、繁体）、日语、韩语、英语、西班牙语、法语、德语、葡萄牙语、俄语、阿拉伯语、越南语等
• 原文在上或译文在上
• 字号大小、离底部的高度都能调
• 可以只看译文，或者只看原文
• 播放器底栏一个按钮，随时开关

怎么用
1. 安装 Twinsub。
2. 打开任意有字幕的 YouTube 视频。
3. 第一次用某个语言组合时，点一下黄色提示，Chrome 几秒钟就下载好翻译包。
4. 开始看。

需要电脑版 Chrome 138 或更新版本（Windows、Mac、Linux、ChromeOS）。Twinsub 与 YouTube、Google 没有关联，也未获其背书。
```

## Privacy tab

- Single purpose: `Shows a second subtitle line on YouTube videos: the current caption translated into the user's language with Chrome's built-in on-device translator.`
- storage: `Saves the user's Twinsub settings (on/off, target language, line order, text size, position) in chrome.storage.sync.`
- Host permissions (content scripts on https://www.youtube.com/*): `Twinsub's only job happens inside YouTube's video player: it reads the captions the player has already downloaded, translates them on the device, and draws the second subtitle line over the video. It runs on no other site and makes no network requests of its own.`
- Remote code: No.
- Data usage: nothing collected; tick all three certifications.
- Privacy policy URL: https://github.com/poeticalengine/twinsub/blob/main/PRIVACY.md
