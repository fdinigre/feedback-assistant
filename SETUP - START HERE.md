# Feedback Assistant — setting it up

You do this once. It takes about five minutes, and the only thing you type is
one line you copy from here.

## Before you start

- **A Mac**, and an internet connection.
- **Your @thekaustschool.org Google account.** The AI marking runs on Gemini,
  signed in with your school account — the one the school has approved for
  student work. **Not a personal Gmail:** the app checks, and refuses to send
  anything from any other account.
- **No administrator password.** Everything installs inside your own user folder,
  and nothing already on your Mac is changed or removed.

## Setting it up

1. Open **Terminal** (press ⌘-Space, type `Terminal`, press Return).
2. Copy this line, paste it into Terminal, and press Return:

   ```
   curl -fsSL https://raw.githubusercontent.com/fdinigre/feedback-assistant/main/scripts/get.sh | bash
   ```

3. Windows will ask you a few questions. The middle part is slow and looks like
   nothing is happening. Leave it alone.
4. At the end it offers to sign you in to Gemini. A terminal window opens and
   walks you through it:
   - your browser opens a Google page — **choose your @thekaustschool.org
     account** and allow access;
   - the page shows a **code** — copy it;
   - go back to the terminal window, press **⌘V** to paste it, and press
     **Return**. The window does not update by itself; it is waiting for the
     paste.

   You have about a minute for that. If it runs out, it starts again on its
   own. At the end it tells you which account you're signed in with.

It installs into a **Feedback Assistant** folder in your home folder and opens
that folder when it's done. Drag the **Feedback Assistant** icon to the Dock if
you like.

> **Why Terminal, and not "Download ZIP"?** A web browser marks everything it
> downloads, and macOS then refuses to open the app's icons ("Apple could not
> verify…") because they aren't signed with a paid Apple developer account.
> Getting past that on a school Mac needs an administrator. Downloading through
> Terminal doesn't mark anything, so the icons just open — no administrator
> needed.

### If you already have the folder

If you downloaded the ZIP or a colleague sent you the folder, and macOS says it
"could not verify" the app, you can clear that yourself without an
administrator:

1. Open **Terminal**.
2. Type `xattr -dr com.apple.quarantine ` (with the space at the end), drag the
   **Feedback Assistant** folder onto the Terminal window, and press Return.
3. Double-click **Install Feedback Assistant**.

## Using it day to day

Double-click **Feedback Assistant**. It opens in your web browser.

The app runs entirely on your own Mac. It isn't on the internet, and the page
only works while your Mac is on. Close the browser tab whenever you like and
reopen it from the icon.

The app starts **empty** — add your own classes and students.

## Where your work is kept

Everything — classes, students, scans, marks and reports — lives in the `data`
folder inside the Feedback Assistant folder, and never leaves your Mac.

**Back it up.** Copy the `data` folder to a USB stick or external drive every so
often. There is no copy anywhere else.

## What gets sent to the AI, and what doesn't

Your files stay on your Mac. The marking and report steps do send student work
out to be read, so it is worth knowing exactly what goes:

- The student is referred to by a code, never by name.
- The name area on page 1 of each scan is blacked out before the image is sent.
  If a name is repeated on another page, add a mask for that page too, in the
  assessment's **Name mask** section.
- Every request is recorded in the app under **Settings → AI request log**, so
  you can see what was sent.
- On Gemini, it only goes through your school Google account. If Gemini is
  signed in with any other account, the app stops before sending and tells you.
  If you switch to Claude in **Settings → AI**, it goes to your own Claude
  account instead, with the same codes and masking.

Two honest limits: only the pages you mask are hidden, so keep names off any
unmasked page; and the name guard checks text, not the pixels inside scans.

## Sharing it with a colleague

Use the **Share a Clean Copy** icon. It puts a copy on your Desktop containing
the app and none of your students' data, and checks before finishing that
nothing slipped through.

**Never just copy or AirDrop your own folder.** It holds your students' names,
their scanned work and their marks.

## Getting updates

Double-click **Update Feedback Assistant**. It checks for a newer version, and if
there is one, installs it and reopens the app. It takes a few minutes.

Your classes, students, scans, marks and reports are never touched by an
update. If an update ever fails to install, the previous version is put back
automatically.

## If an icon seems to do nothing

macOS protects the Desktop, Documents and Downloads folders, and it refuses
apps that didn't come from a registered developer without always saying so. If
that happens here, the icon opens Terminal and runs the same thing there
instead — so you may see a Terminal window appear. That's expected; let it
finish. If macOS asks whether the app may access your Desktop, say yes.

Keeping the Feedback Assistant folder somewhere outside Desktop, Documents and
Downloads — your home folder, say — avoids this entirely.

## If something else goes wrong

**The app says Gemini is signed in with the wrong account.** Run the installer
again and take the sign-in step; it shows how to sign out and sign back in with
your @thekaustschool.org account.

**The app says Gemini's usage limit has been reached.** Gemini's free
allowance is weekly, and the message says when it resets. To keep marking
before then, open **Settings → AI** and choose Claude. That needs your own
Claude Pro or Max account; if Claude isn't installed yet, Settings shows the two
Terminal lines that install it and sign you in. Switch back to Gemini once the
limit resets.

**The sign-in says it failed.** Usually the minute ran out before the code was
pasted. Run Install Feedback Assistant again and take the sign-in step — it is
safe to repeat, and the second time is quicker.

**The app says the AI is unavailable.** The sign-in didn't complete. Double-click
**Install Feedback Assistant** and run it again — it's safe to repeat and
won't touch your `data` folder. Take the sign-in step this time.

**Anything else.** Every icon writes to the `logs` folder inside the Feedback
Assistant folder. Send those files to whoever set this up for you; they say
exactly what happened.
