# Top 40% Hand

A Chrome extension for [Poker Now](https://www.pokernow.com). When you are dealt a starting hand in the top 40% of hands, a small note appears in the top-right corner and goes away after 3 seconds.

Weaker hands stay quiet. There is no sound, no badge, and no Chrome notification.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and choose this folder

Sit down at a Poker Now table. The note only reads the two cards already face-up in your own seat. Open `demo.html` to preview it.

## What counts

There are 1,326 possible two-card deals. The note shows for the best 530 of them (39.97%), ordered the way a 100bb solver opens: pairs, suited aces, broadways, and suited connectors before dominated offsuit hands. `7♥4♠` does not qualify. `A♠K♠`, `22`, and `76s` do.
