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
- **Friend requests:** when someone adds you, your 👥 Friends button shows a red count like (1) or (2), and a small popup says who sent it. Open Friends to **Accept** or **Decline**. Accepting makes you friends, so chat and calls unlock. The count refreshes every few seconds while the page is open.
- **Install it as an app:** open your Render link and look for **📲 Install app** (on your profile card, and in ⚙ Settings). It adds Minigames Hub to your home screen or desktop with its own icon and no browser bars. On iPhone or iPad there's no button: tap Share, then **Add to Home Screen**. Guest games also open offline.
- **Ringtone:** when a friend calls and the app is open, it plays a loud phone-style ring, vibrates (on phones that allow it) and flashes the tab title. The caller hears a soft ringback tone. ⚙ Settings has a volume slider and a **Test ringtone** button. Browsers only allow sound after you've tapped or clicked on the page once.
- **Call alerts when the app is closed:** in ⚙ Settings, tap **Turn on alerts** (once per device, and allow notifications). After that, a call, missed call, message or friend request shows a notification even when the app is closed or the screen is off, and tapping it opens the app. These come from the phone's own notification system, so the sound is the phone's normal notification sound (not a custom looping ringtone), and calls also vibrate. The call itself needs the app open, so tap the notification, then Accept. Alerts need the phone to be switched on and online; a phone that is powered off can't receive them.
- **Alerts on iPhone and iPad:** they only work after you install the app to the Home Screen and open it from there (iOS 16.4 or newer). Android and desktop Chrome, Edge and Firefox work in the browser too.
- **Alerts and your host:** the server makes its own alert keys on first start and saves them with your data, so use the Upstash setup above, or alerts stop working after a restart. You can set an environment variable `VAPID_SUBJECT` to your email in the form `mailto:you@example.com`; some alert services like having a real contact.
- **New message alerts:** when a friend messages you and the app is closed or in the background, you get a notification (if you turned on alerts in ⚙ Settings). If the app is open on another screen, a small popup shows who wrote and what they said, and **View** opens that chat. Your 👥 Friends button shows a red count for friend requests plus unread messages, and each friend shows **💬 Chat (2)** with their unread number. Opening a chat marks it as read.
- **Profile pictures:** in ⚙ Settings (and on your profile card) tap the picture to **take a photo** (the camera on a phone, or the webcam on a laptop) or **choose one from the gallery or photos**. It's cropped to a square and shrunk to a tiny 96 by 96 picture. It shows on your profile card, in friends' lists, in friend requests and in groups. It does not show on the public leaderboard.
- **Groups:** tap **👥 Groups** on your profile card to make a group chat. A group has a name (up to 30 characters), a picture and a bio. Anyone who has both added you can be a member (up to 50 people), and you can be in up to 200 groups. The creator can rename the group, change its picture and bio, and remove people. Members can add their own friends and can leave any time. If the creator leaves, the longest-standing member takes over, and the group disappears when the last person leaves. Group messages show who wrote them, give unread counts, popups and (with alerts on) notifications like normal chat.
- **Voice calls:** friends who have added each other get a 📞 Call button (in the friends list and in the chat screen). The other person sees a ringing box with Accept and Decline. The server only passes the connection messages; the voice itself goes straight between the two devices. Both people need to keep the page open, allow the microphone when asked, and be on the host's https link.
- **Calls can fail on some networks:** the call uses free public connection helpers only. Some mobile networks, school or office Wi-Fi, and strict home routers block direct calls, and then you'll see "Couldn't connect". Fixing that needs a paid or self-run relay server. Friends can also see each other's network address while a call is connected.
- **How much picture data fits:** pictures are saved inside the same data as accounts, and the free database has about a 1 MB limit for it. Each picture is only a few KB, so hundreds of players are fine, but the server prints a warning in the logs if it gets close to the limit.
- **Chat updates** come in every couple of seconds (not instantly).
- The claude.ai preview link can't use this server, because claude.ai blocks pages from calling other sites. Use the link from your host instead.
