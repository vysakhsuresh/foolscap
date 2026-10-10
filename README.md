# Foolscap

**PDF tools that can't upload your files.**

Merge, split and organise PDFs in your browser. The work happens on your own
device; nothing is sent anywhere. Free, no sign-up, no limits, no watermark.

The web version of [Sheaf](https://github.com/vysakhsuresh/sheaf-android).
Read `CLAUDE.md` for the brief and the rules.

## Running it

```
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # dist/, what Cloudflare Pages publishes
npm run preview    # the built site, with the production headers applied
npm test           # typecheck, unit tests, then e2e against the built site
```

## Deploying

Cloudflare Pages, free plan. Build command `npm run build`, output directory
`dist`. The headers in `app/public/_headers` are applied automatically.

---

From [Layerbit](https://layerbit.co.in).
