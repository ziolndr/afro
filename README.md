# AFRO Editorial — Comp-Accurate v1.2.3

This revision implements the approved white editorial comp in HTML/CSS rather than reinterpreting it.

## Exact structural changes

- Single 66px editorial header with the left tagline, five centered sections, search, sign-in, join, and a restrained theme switch.
- Full-width 396px hero with the same portrait-left / white editorial center / diagonal city-maker-land-regalia composition.
- Search field and example prompts positioned over the hero exactly as the comp specifies.
- Flash-news wire directly beneath the hero.
- Left editorial rail plus four live trending cards.
- Meaning/resonance information band beneath trending.
- Dark mode uses corresponding dark hero crops and the same geometry.
- Trending, flash news, counts, filters, and the archive all come from the real built Afro field.

No fake trending data is included. The existing `data/` field is preserved when this package is unzipped over the current project.

## Install over the working field

```bash
cd ~/Downloads
unzip -o afro-editorial-comp-v1.2.3.zip
cd afro-arbiter-field
chmod +x START_AFRO_ARBITER.command REBUILD_AFRO_ARBITER.command DEPLOY_AFRO.command
./START_AFRO_ARBITER.command
```

Open `http://127.0.0.1:8796`.

## Deploy

```bash
cd ~/Downloads/afro-arbiter-field
./DEPLOY_AFRO.command
```

The deploy script retains `afro.actualgeneralintelligence.com` by default and falls back from an installed `vercel` binary to `npx`, then `npm exec`.


## Search-results mode

A search now collapses the homepage hero into a compact search masthead and replaces the homepage sections with ranked results immediately. Users never have to scroll below Trending to find the result set. Clearing the query or pressing **Back to AFRO** restores the full homepage.


## v1.2.3 hero cache fix

The hero now references uniquely named, verified clean photography assets. All legacy hero image files were removed, and HTML/CSS/JS are served without stale-cache reuse.
