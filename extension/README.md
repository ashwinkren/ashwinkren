# Top 40% Hand

A Chrome extension for [Poker Now](https://www.pokernow.com). When you are dealt a starting hand in the top 40% of hands, Chrome shows a notification and removes it after 3 seconds. The Poker Now tab can stay in the background. Weaker hands stay quiet.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and choose this folder

Sit down at a Poker Now table. Leave that tab open and switch away. The extension only reads the two cards already face-up in your own seat. The first alert asks macOS to allow notifications from Chrome. Open `demo.html` to preview the on-page note.

## What counts

There are 1,326 possible two-card deals. The note shows for the best 530 of them (39.97%), ordered the way a 100bb solver opens: pairs, suited aces, broadways, and suited connectors before dominated offsuit hands. `7♥4♠` does not qualify. `A♠K♠`, `22`, and `76s` do.
