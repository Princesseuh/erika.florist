---
  title: "Daily annoyances"
  tagline: "Love-hate relationships are usually at least kinda excitings, not so much here"
  maxDepthTOC: 2
  navigation:
    label: "Daily annoyances"
    category: computers
---

I like my setup. After all, I've put a lot of time into it, making sure everything is just like how I want. Sure, not everything about is is perfect, there's a few irks and quirks that I notice once in a while but usually, nothing that really ruins my experience, however some issues are.. a bit too much

On this page, I'll be listing the daily annoyances I have that I notice everytime and annoys me a lot. Some issues are fixable - I just haven't gotten to it. Some.. not so much, either I couldn't find a fix, a fix doesn't exist or a fix has other implications that I don't like. Some issues have workaround that I don't necessarily mind using until a find a proper solution (or a proper solution exists)

I'll try my best to avoid putting features request in here, but some things for example Spotify not having tray support on Linux I consider to be a bug as the other versions do have that feature (and it's a pretty important one)

## Linux

### Randomly takes a long time to shutdown

Long time to shudown issues on Linux are oftentimes related to hard drives not being able to be unmounted for random reasons, this is probably fixable. I just haven't gotten to it (it isn't that big of a problem, just annoying when it happens)

---

## Windows

### Can't hibernate-reboot, hibernation is always a full shutdown

I'd like to hibernate Windows to boot Linux sometimes (I have a shortcut that automatically set my motherboard so it boots Linux on next boot), this slow down switches from Windows to Linux considerably

### Xbox Controller Adapter fails to power on after using Linux

I don't know if this is a Linux or Windows issue, I'm filling it under Windows because I feel like, Windows should be able to "repair" the situation. Also, the adapter becomes weirdly hot on Linux, not sure what's up there

**Workaround**: Unplug replug usually fix it

---

## Spotify

### No tray support on Linux

Even after all those years, there's still [no tray support for Spotify](https://community.spotify.com/t5/Desktop-Linux/Cannot-minimize-to-tray-on-Linux/td-p/1703131) on most distro, this means that on i3/Sway and other tilling window manager, you can't minimize Spotify.

**Workaround**: I have an entire workspace dedicated to Spotify, this is somewhat convenient in a way because my bar has a "currently listening to" display which, when I click on it, focus the workspace

### Doesn't sync liked songs properly between platforms

This might be related to the issue below, but very often I'll like a song on Linux, reboot on Windows or even check my phone and [the song won't be there](https://community.spotify.com/t5/Desktop-Windows/Spotify-liked-songs-not-syncing-properly-across-android-and/td-p/4782488). This isn't exclusive to Linux, the same thing happen from Windows to Linux, Android to Windows etc

**Workaround**: Emptying Spotify's cache and rebooting the app usually fix it

### Doesn't refresh itself correctly on hibernation resume

My "Windows session" will often be up and running for weeks as I only hibernate it, but the Spotify app never update itself! This means my friendlist will be out of date by multiple days sometimes! A way to fix this would be using a service that reboot the app on hibernation resume but that seem awfully overenginered for a problem Spotify themselves should fix

**Workaround**: Reboot the app

## Discord

### Doesn't properly acknowledge when a call has ended on another device on wakeup

A workflow I find myself having often is, I'm on a call on Windows on my desktop and without cutting the call, I'll dual boot to Linux and rejoin the call there, talk for a while and cut the call. This is all fine and dandy, it works nicely.

However, when I'll go back to Windows, waking it up from hibernation, it'll try to rejoin the call even though it had ended, this result in Discord automatically trying to call back the people in the call. It should know that the call has ended somewhere else and not try to restart it. I've called my lover a few times in the middle of the night due to that..

---

## Android

Some of the issues here aren't necessarily related to Android itself, it could be the specific version I use, the apps I use etc. I just put everything that happen on my phone here

### Some websites crash my browser

No idea why it happens, even simple pages will sometimes completely freeze up my browser. A case I can reproduce 100% of the time is [Hoogle](https://hoogle.haskell.org/), I don't use Haskell, I just sometimes type !h instead of !g in DuckDuckGo - this crash my browser 100% of the time

### Instagram keyboard goes over the application when bottom bar is disabled

This issue drives me mad, probably more so than every single other issues on this list. I'm sure all the women who ghosted me on Instagram did so for this reason, I don't see another explanation. [This has been an issue for years](https://forums.androidcentral.com/ask-question/848949-keyboard-covers-what-im-typing-instagram.html)
