# Feedback Assistant — setting it up

You do this once. It takes about five minutes and you won't type anything.

## Before you start

- **A Mac**, and an internet connection.
- **Your @thekaustschool.org Google account.** The AI marking runs on Gemini,
  signed in with your school account — the one the school has approved for
  student work. **Not a personal Gmail:** the app checks, and refuses to send
  anything from any other account.
- **No administrator password.** Everything installs inside your own user folder,
  and nothing already on your Mac is changed or removed.

## Setting it up

1. Put the **Feedback Assistant** folder wherever you like — the Desktop is
   fine. Keep everything inside it together.
2. **Right-click** the **Install Feedback Assistant** icon and choose **Open**.
   Then click **Open** again in the box that appears.
3. Follow the prompts. The middle part is slow and looks like nothing is
   happening. Leave it alone.
4. At the end it offers to sign you in. A terminal window opens and runs the
   sign-in for you: follow the prompts in your browser, **choose your
   @thekaustschool.org account**, then close that window.

> **Why right-click the first time?** This app didn't come from the App Store,
> so macOS blocks a plain double-click and offers no way past it. Right-click →
> Open is the same action with a button that lets you continue. Once per icon,
> the first time only.

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
- It only goes through your school Google account. If Gemini is signed in with
  any other account, the app stops before sending and tells you.

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

The first time, right-click the icon and choose **Open**, as with the others.

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
again (below) and, at the sign-in step, choose your @thekaustschool.org account.

**The app says the AI is unavailable.** The sign-in didn't complete. Right-click
**Install Feedback Assistant** → Open and run it again — it's safe to repeat and
won't touch your `data` folder. Take the sign-in step this time.

**Anything else.** Every icon writes to the `logs` folder inside the Feedback
Assistant folder. Send those files to whoever set this up for you; they say
exactly what happened.
