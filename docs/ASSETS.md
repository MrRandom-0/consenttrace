# Generated Assets

**Purpose:** every binary asset in this project is generated from source — none are hand-made or required in git. **Owner:** _placeholder_. **Last reviewed:** 2026-08-23.

| Asset | Path | Regenerate with |
| --- | --- | --- |
| Extension icons (16/32/48/128) | `apps/extension/public/icons/` | `npm run -w @consenttrace/extension icons` (hand-rolled PNG encoder, deterministic) |
| Extension store/demo screenshots | `apps/extension/store/` | `npm run -w @consenttrace/extension build && node apps/extension/scripts/screenshot-demo.mjs` |
| Landing page panel image | `apps/web/public/media/panel-dark.png` | copy `apps/extension/store/sidepanel-demo-dark.png` after the step above |

One-shot setup after cloning:

```bash
npm install && npx playwright install chromium
npm run -w @consenttrace/extension icons
npm run -w @consenttrace/extension build
node apps/extension/scripts/screenshot-demo.mjs
cp apps/extension/store/sidepanel-demo-dark.png apps/web/public/media/panel-dark.png
```

The extension build fails without icons (manifest references them), so run the icons script before the first build. CI regenerates icons the same way; screenshots are optional outside store submissions.
