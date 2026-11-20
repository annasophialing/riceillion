# 🦉 Riceillion - the nightly flight

A daily Rice University guessing game (perhaps slightly inspired by krillion.io). Every day, there are five Rice-themed prompts, with 25 seconds for you to answer each. The rarer your answer, the higher your owl flies. If you get 500 points, you've reached the moon!!

## Project layout

```
index.html        page structure (sky, owl, cards)
css/style.css     site styling
js/questions.js   question bank 
js/game.js        game logic (timer, matching, scoring, daily rotation)
js/config.js      supabase project URL + key (blank = online features off)
js/online.js      saves answers/suggestions and reads crowd stats
supabase/schema.sql   database setup to paste into Supabase
```

