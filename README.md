# 🦉 Riceillion - the nightly flight

A daily Rice University guessing game (perhaps slightly inspired by krillion.io). Every day, there are five Rice-themed prompts, with 25 seconds for you to answer each. The rarer your answer, the higher your owl flies. If you get 500 points, you've reached the moon!!

## Project layout

```
index.html        page structure (sky, owl, cards)
css/style.css     site styling
js/questions.js   the question bank 
js/game.js        game logic (timer, matching, scoring, daily rotation)
js/config.js      your Supabase project URL + key (blank = online features off)
js/online.js      saves answers/suggestions and reads crowd stats
supabase/schema.sql   database setup to paste into Supabase
```

## Online features (Supabase)

When `js/config.js` is filled in, the game:

- saves every answer anonymously, including guesses Willy hadn't heard of
- shows a "✎ suggest it to Willy" button for unknown answers, plus a "suggest a prompt" form
- shows "X% of owls said this" once a prompt has 20+ answers
- shows "you flew higher than X% of owls tonight" and a chart of tonight's scores (5+ players)
- blends in crowd-based points once a prompt has 50+ answers, and switches fully to them at 300+

The thresholds are at the top of the "Crowd data" section in `js/game.js`.

### Setup
1. Create a free project at supabase.com.
2. In the project, open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and click **Run**.
3. Open **Project Settings → API** (or **Data API**) and copy the **Project URL** and the **anon public** (or **publishable**) key.
4. Paste them into `js/config.js`, then commit and push.

### Reading the data
In Supabase, open **Table Editor**:
- `suggestions`: answers and prompts players sent in
- `answers` where `final` is false: guesses that weren't on your list (filter or sort by `raw`)
- `flights`: everyone's scores

To download any table as a CSV for Excel, Sheets or Python, use the table's **Export** button.

