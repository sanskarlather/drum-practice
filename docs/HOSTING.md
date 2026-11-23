# Hosting on GitHub Pages

GitHub Pages hosts the app for free at an address like `https://<your-username>.github.io/drum-practice/`. Once it's there you can open it on your laptop and phone, install it to your phone's home screen, and USB MIDI and the microphone work reliably (both need a secure `https://` address).

You don't need to install anything or use the command line. Total time: about 15 minutes.

## Before you start: public or private?

On a free GitHub account, **Pages only works for public repositories**. That means anyone could find and read the *code*. Your songs, scores and settings are **not** uploaded anywhere: they stay in your browser. If you want the repository private, you need a paid GitHub plan (Pro); the steps are otherwise the same.

## 1. Create a GitHub account

Skip this if you already have one.

1. Go to <https://github.com/signup> and create an account.
2. Your **username** becomes part of the app's address, so pick one you're happy with.

## 2. Create the repository

1. Sign in, click the **+** in the top-right corner, then **New repository**.
2. **Repository name:** `drum-practice` (this becomes the end of the address).
3. **Description:** e.g. *Drum practice app with a lit-up kit. Works with e-kits over USB or a microphone.*
4. Choose **Public** (see above).
5. **Leave "Add a README file" unticked**: this project already has one.
6. Click **Create repository**.

## 3. Upload the files

1. Unzip `drum-practice.zip` on your computer. You'll get a folder containing `index.html`, `README.md`, and the folders `css`, `js`, `docs` and so on.
2. On the new, empty repository page, click the link **uploading an existing file**.
3. Open the unzipped folder, select **everything inside it** (not the folder itself) and drag it onto the upload area. Use Chrome or Edge: they upload sub-folders correctly.
4. Wait until every file is listed. Check that `index.html` is at the top level, not inside another folder.
5. Under **Commit changes**, type a message such as `First version` and click **Commit changes**.

> The hidden file `.nojekyll` may not show in your file browser, so it might not get uploaded. That's fine: the app works without it.

## 4. Turn on GitHub Pages

1. In the repository, click **Settings** (top bar), then **Pages** (left sidebar).
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Set **Branch** to **main** and the folder to **/ (root)**, then click **Save**.
4. Wait 1 to 2 minutes. You can watch progress under the **Actions** tab ("pages build and deployment").
5. Go back to **Settings → Pages**. At the top it now says **Your site is live at …**. That's your app's address.

## 5. Open it on your laptop

1. Open the address in **Chrome** or **Edge**.
2. Plug in the Nitro Mesh by USB, go to **Kit setup**, press **Connect** and allow MIDI.
3. Hit each pad to check the mapping, then go to **Library** and start lesson 1.

Bookmark the page. Your songs and settings are saved in this browser.

## 6. Install it on your Android phone

1. Open the same address in **Chrome** on the phone.
2. Tap the **⋮** menu, then **Add to Home screen** (on some phones it says **Install app**).
3. Open it from the new icon. It runs full-screen, like a normal app, and works offline once it has been opened once.
4. To use the e-kit with the phone, connect the module's USB port to the phone with a **USB-OTG adapter** (USB-B to USB-C, or USB-B to micro-USB, depending on your phone), then use **Kit setup → Connect**.
5. For an acoustic kit, use **Kit setup → Microphone mode** instead.

The phone keeps its own songs and settings, separate from the laptop's.

## 7. Updating the app later

When you have a new version of a file (for example a fixed `js/mic.js`):

1. In the repository, open the folder (e.g. `js`), click **Add file → Upload files**, and drag in the new file. A file with the same name is replaced.
2. Commit the change. Pages republishes in a minute or two.
3. Reload the app. It always tries the network first, so the new version appears as soon as you're online. If you still see the old one, do a hard refresh (Ctrl+Shift+R; on a phone, close the app and open it again).

If you add new files, also add them to the `FILES` list in `sw.js` and change `CACHE = "drum-practice-v1"` to `v2`, so the offline copy includes them.

## Optional: using git instead of the website

If you'd like to use git from a terminal:

```bash
cd drum-practice            # the unzipped folder
git init
git add .
git commit -m "First version"
git branch -M main
git remote add origin https://github.com/<your-username>/drum-practice.git
git push -u origin main
```

Then do step 4 above. For later updates: `git add . && git commit -m "Describe the change" && git push`.

## Troubleshooting

| Problem | Fix |
|---|---|
| **404 page** at the address | Wait a couple of minutes after enabling Pages. Check that `index.html` is at the top level of the repository and that Pages is set to `main` / `(root)`. The address is case-sensitive. |
| Page loads but looks unstyled | The `css` folder didn't upload. Upload it again, keeping the folder name. |
| "Kit needs Chrome/Edge" | You're in Safari or an in-app browser. Open the address in Chrome or Edge. |
| "MIDI blocked" | Click the icon to the left of the address bar, allow MIDI, and reload. |
| No kit found | Check the USB cable (some cables only charge), turn the module on, then press **Connect** again. On a phone, check that the OTG adapter works with another USB device. |
| Microphone blocked | Click the icon to the left of the address bar and allow the microphone, then reload. |
| Songs missing on the phone | Each browser and device has its own storage. Re-import the file on the phone. |
| Old version still showing | Hard refresh (Ctrl+Shift+R), or close and reopen the installed app. |

## Updating the README

If you host your own copy, edit `README.md` on GitHub (click it, then the pencil icon) and change the live-app links to your own address. Also put your name in `LICENSE`.
