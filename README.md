# Minigames Hub: server version

This folder is the Minigames Hub site plus a small server. With the server running, accounts, friends and chat work **between different phones and laptops**.

## What's inside
- `server.js`: the server (no installs needed, just Node 18 or newer)
- `public/index.html`: the website (the server hands it out)
- `package.json`: tells hosts how to start it

## Try it on your own computer
1. Install Node from nodejs.org (version 18 or newer).
2. Open a terminal in this folder and run: `node server.js`
3. Open http://localhost:3000

## Put it online (so friends can use it)
Any host that can run a Node app will work. Free plans change often, so check the host's current rules first. The usual steps:
1. Put this folder in a GitHub repository.
2. On a host such as Render, create a new **Web Service** from that repository.
3. Build command: leave empty (or `npm install`). Start command: `npm start`.
4. Add an environment variable `OWNER_NAME` set to the username you want to carry the 👑 OWNER tag (for example `Ace`).
5. Open the link the host gives you, and **sign up with that exact username straight away**, because the first person to register it gets the tag.
6. Send that link to your friends. They sign up, add each other, and chat.

## Good to know
- **Friends and chat:** adding a friend is one-way until the other person adds you back. Chat unlocks once you've both added each other, so strangers can't message you.
- **Saved data (important on free hosts):** by default everything is saved in a file next to the server. Free hosts wipe their files when the app sleeps or restarts, and then every account, score and chat disappears (people see "Wrong username or password" and have to sign up again). To stop that, connect a free Upstash Redis database:
  1. Make a free account at upstash.com and create a Redis database (pick the free plan).
  2. On the database page, find the **REST** section and copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**.
  3. On your host (Render), open your service, go to **Environment**, and add both as environment variables with exactly those names. Save, and let it redeploy.
  4. When it starts, the server logs "Saving to Upstash Redis". If it can't reach the database it refuses to start instead of running empty, so it can never overwrite your saved data.
  Free plan limits change, so check Upstash's pricing page. The server saves at most every 10 seconds, and keeps the saved copy under 1 MB by trimming old chat messages.
- **Passwords** are salted and hashed on the server. This is fine for a small hobby site; it hasn't had a professional security review.
- **Leaderboard:** the 🏆 Leaderboard button shows the top 10 players for each game. Only each player's best score counts, and the owner's 👑 tag shows next to their name.
- **Voice calls:** friends who have added each other get a 📞 Call button (in the friends list and in the chat screen). The other person sees a ringing box with Accept and Decline. The server only passes the connection messages; the voice itself goes straight between the two devices. Both people need to keep the page open, allow the microphone when asked, and be on the host's https link.
- **Calls can fail on some networks:** the call uses free public connection helpers only. Some mobile networks, school or office Wi-Fi, and strict home routers block direct calls, and then you'll see "Couldn't connect". Fixing that needs a paid or self-run relay server. Friends can also see each other's network address while a call is connected.
- **Chat updates** come in every couple of seconds (not instantly).
- The claude.ai preview link can't use this server, because claude.ai blocks pages from calling other sites. Use the link from your host instead.
