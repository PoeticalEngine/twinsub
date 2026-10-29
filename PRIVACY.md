# Twinsub privacy policy

Last updated: 2026-10-29. Publisher: Poetical Engine LLC (hello@poeticalengine.com).

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

Our server passes the text to Anthropic's Claude API, which writes the explanation, and streams the answer back to you. Anthropic processes it under its commercial terms and does not use it to train models.

We keep: a count of explanations per install id and per IP address for each day, to enforce the free daily limit and stop abuse; and the finished explanation, keyed by the video and the marked text, so the same question gets an instant answer next time. We do not keep a history of what you watched or asked, and we never sell or share data.

Nothing is sent unless you tap Explain.

## Settings

Your Twinsub settings (on/off, target language, line order, which lines to show, text size and position) are saved with `chrome.storage.sync`, which Chrome may sync between your own signed-in Chrome browsers. The install id is saved with `chrome.storage.local`.

Twinsub is not affiliated with or endorsed by YouTube or Google.

Questions: hello@poeticalengine.com
