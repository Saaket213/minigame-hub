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
- **Saved data:** everything is stored in `data.json` next to the server. Many free hosts wipe their files when the app restarts or redeploys, which would delete all accounts and messages. For permanent data, use a host with a persistent disk (set `DATA_DIR` to its path) or move the data to a database.
- **Passwords** are salted and hashed on the server. This is fine for a small hobby site; it hasn't had a professional security review.
- **Leaderboard:** the 🏆 Leaderboard button shows the top 10 players for each game. Only each player's best score counts, and the owner's 👑 tag shows next to their name.
- **Chat updates** come in every couple of seconds (not instantly).
- The claude.ai preview link can't use this server, because claude.ai blocks pages from calling other sites. Use the link from your host instead.
