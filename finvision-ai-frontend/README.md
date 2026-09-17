# FinVision AI — Frontend

Single-file static frontend (`index.html`). No build step required.

> Note: `finvision-ai-backend` now also bundles and serves its own copy of
> this file, so `npm start` in the backend alone gives you a working app at
> `http://localhost:3000/`. Use *this* standalone copy only if you want to
> host the frontend on a different server/domain from the API.

## Run

Serve this folder with any static file server, e.g.:

```
npx serve .
```

or just open `index.html` directly in a browser.

## Connecting to the backend

At the top of the `<script>` block in `index.html` there's:

```js
const API_BASE_URL = 'http://localhost:3000';
```

Set this to wherever you're running the **finvision-ai-backend** project. If the backend isn't reachable, the app automatically falls back to a local "Demo Mode" (browser-only, no persistence) so the UI still works standalone.
