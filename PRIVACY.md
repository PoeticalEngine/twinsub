# Twinsub privacy policy

Last updated: 2026-10-30. Publisher: Poetical Engine LLC (hello@poeticalengine.com).

## Dual subtitles: nothing leaves your computer

- Subtitles are translated by the translator built into Chrome, on your own computer. The only downloads are Chrome's own language packs, fetched by Chrome the first time you use a language pair.
- On www.youtube.com only, Twinsub reads the subtitle files the YouTube player has already downloaded for the video you are watching, so it can show a translated line under the original. Those subtitles stay in the page.
- No account, no sign-in, no analytics, no ads, no tracking.

## "Didn't catch that?" explanations: sent only when you ask

When you mark part of a subtitle and tap **Explain** (or **Explain whole line**), Twinsub sends this to our server at api.poeticalengine.com:

- the words you marked and a few subtitle lines around them, in the video's language;
- the video's title, channel name and video id;
- the language you want the answer in;
- a random id created when Twinsub was installed, used only to count your free explanations per day. It is not linked to your name, email or Google account.

Our server passes the text to an AI model and service hosted in the United States, which writes the explanation, and streams the answer back to you. We only use AI providers whose commercial terms do not allow them to train models on this data.

We keep: a count of explanations per install id and per IP address for each day, to enforce the free daily limit and stop abuse; and the finished explanation, keyed by the video and the marked text, so the same question gets an instant answer next time. We do not keep a history of what you watched or asked, and we never sell or share data.

Nothing is sent unless you tap Explain.

## Explanations with your own API key: never through our server

With Twinsub Lifetime (or while you have Pro) you can have explanations written by your own AI provider instead, using your own API key: OpenAI, Anthropic, Google, another listed provider, or any server you enter.

- When you tap Explain, the same content listed above (the marked words, nearby subtitle lines, the video's title, channel and id, and your answer language) is sent **directly from Chrome to the provider you chose**. It does not pass through our server, and we never see it. That provider handles it under its own terms and privacy policy.
- Your API key is encrypted on your computer with a key that only Twinsub's background process can use, and stored with `chrome.storage.local`. It is never synced to other devices and never sent to us. Only the provider you chose receives it, with each request.
- Chrome asks your permission before Twinsub can reach a provider's address, once per provider.
- While your own key is on, opening the explanation panel does not contact our server at all. Opening the Twinsub menu or the AI settings asks our server whether your install id has Lifetime or Pro (see Payments below).

## Payments

Twinsub Pro and Lifetime are sold by our payment provider, Dodo Payments, which acts as the merchant of record and handles your card details; we never see them. When you buy, we receive and keep the payment or subscription id, Dodo's customer id, your email address and the Twinsub code for your purchase, so the code works on your computers and we can help if something goes wrong. Your install id is linked to that code on each computer where you use it.

## Settings

Your Twinsub settings (on/off, target language, line order, which lines to show, text size and position) are saved with `chrome.storage.sync`, which Chrome may sync between your own signed-in Chrome browsers. The install id, your own-key settings and the encrypted API key are saved with `chrome.storage.local`, which is never synced.

Twinsub is not affiliated with or endorsed by YouTube or Google.

Questions: hello@poeticalengine.com
