# Chrome 网上应用店上架清单：Twinsub 0.3.0

Chrome 应用商店的页面不允许扩展脚本操作，所以这一步要你在开发者后台手动完成。下面的路径都相对于 `/Volumes/exernal SSD/MacData/Development/twinsub/`。

这是第二个名额（第一个是 Grassy Knees，正在审核）。新开发者最多发布 2 个扩展。

## 1. 新建条目
1. 打开开发者后台 https://chrome.google.com/webstore/devconsole 。
2. 点「新建内容 / New item」。
3. 上传 `dist/twinsub-0.3.0.zip`。

名称和简短说明会自动从 zip 里的 `_locales` 读取，10 种语言都有，不用填。

## 2. 商品详情（Store listing）
每种语言都要填一遍：先在页面右上角切换语言，再填描述并上传图片。

| 语言 | 描述（整段粘贴） | 截图（1280×800，5 张） | 小宣传图 440×280 | 顶部大图 1400×560 |
|---|---|---|---|---|
| English | `store/descriptions/en.txt` | `store/screenshots/en/1-5.png` | `store/promo/small-440x280-en.png` | `store/promo/marquee-1400x560-en.png` |
| 한국어 | `store/descriptions/ko.txt` | `store/screenshots/ko/` | `…-ko.png` | `…-ko.png` |
| Français | `store/descriptions/fr.txt` | `store/screenshots/fr/` | `…-fr.png` | `…-fr.png` |
| Deutsch | `store/descriptions/de.txt` | `store/screenshots/de/` | `…-de.png` | `…-de.png` |
| Español (Latinoamérica) | `store/descriptions/es.txt` | `store/screenshots/es/` | `…-es.png` | `…-es.png` |
| हिन्दी | `store/descriptions/hi.txt` | `store/screenshots/hi/` | `…-hi.png` | `…-hi.png` |
| Bahasa Indonesia | `store/descriptions/id.txt` | `store/screenshots/id/` | `…-id.png` | `…-id.png` |
| 日本語 | `store/descriptions/ja.txt` | `store/screenshots/ja/` | `…-ja.png` | `…-ja.png` |
| 中文（简体） | `store/descriptions/zh_CN.txt` | `store/screenshots/zh_CN/` | `…-zh_CN.png` | `…-zh_CN.png` |
| 中文（繁體） | `store/descriptions/zh_TW.txt` | `store/screenshots/zh_TW/` | `…-zh_TW.png` | `…-zh_TW.png` |

以下各项只填一次：

- **类别：** 教育 → 语言学习（Education → Language learning）。没有这一项就选「工作效率 → 工具」（Productivity → Tools）。
- **商店图标：** `store/brand-logo-512.png`。后台要求 128×128 的话，用 `icons/128.png`。
- **官方网址：** twinsub.poeticalengine.com。需要先在 Search Console 用同一个 Google 账号验证 poeticalengine.com 才会出现；不出现就跳过。
- **首页网址：** `https://twinsub.poeticalengine.com/`
- **支持网址：** `https://twinsub.poeticalengine.com/`
- **成人内容：** 否。

## 3. 隐私（Privacy practices）

**单一用途（Single purpose）**
```
Shows a second subtitle line on YouTube videos, the current caption translated into the user's language with Chrome's built-in on-device translator, and explains a line the user marks when they ask for it.
```

**storage 权限的理由**
```
Saves the user's Twinsub settings (on/off, target language, line order, text size, position) in chrome.storage.sync. In chrome.storage.local it keeps a random install id used to count free explanations, the Pro or Lifetime code the user entered, and, only if the user sets up their own AI provider, that provider's settings with the API key encrypted on the device.
```

**主机权限的理由**（内容脚本只在 https://www.youtube.com/* 上运行）
```
Twinsub works inside YouTube's video player: it reads the captions the player has already downloaded, translates them on the device, and draws the second subtitle line over the video. When the user taps Explain, it sends the marked words and nearby subtitle lines to api.poeticalengine.com for an explanation. It runs on no other site.
```

**可选主机权限的理由**（optional_host_permissions https://*/* 和 http://*/*）
```
Only for users who choose to use their own AI API key in Twinsub's AI settings. When the user saves or tests a provider, Chrome asks them to allow that one provider's address (for example https://api.openai.com/* or http://localhost:11434/* for a local Ollama), and Twinsub then sends explanation requests straight to it. Twinsub never requests access to any other site, and nothing is granted unless the user approves the prompt.
```

**是否使用远程代码：** 否。

**数据使用：** 只勾「网站内容（Website content）」。它指用户标记的字幕文字、附近几行、视频标题、频道和视频 ID，只在用户点「解释」时发送。
- 不要勾「身份验证信息」：自带的 API key 加密后只存在用户电脑上，从不发给我们。
- 付款在 Dodo 的结账网页完成，扩展本身不收集付款信息。
- 页面底部三项承诺全部勾选。

**隐私政策网址：** `https://twinsub.poeticalengine.com/privacy/`

## 4. 发布范围（Distribution）
- **付款：** 免费。付费方案（Pro 订阅、买断版）通过我们自己的网站和 Dodo 结账，不走 Chrome 应用商店。
- **可见性：** 公开。
- **地区：** 所有地区。

## 5. 提交
- 「提交审核」时，可以勾选「审核通过后自动发布」。
- 因为申请了 `https://*/*` 可选主机权限，后台可能提示需要深入审核，通常会多等几天。
- 如果被拒，把拒信发给我。若需要收窄权限，可以改成只列出预设服务商的地址，但那样就不支持自定义 Base URL 了。

## 6. 上架后
1. 在 `site/config.json` 里填上 `cws`（商店链接）。
2. 运行 `node site/build.mjs` 重建网站，再部署。官网上的「免费加到 Chrome」按钮就会生效。
