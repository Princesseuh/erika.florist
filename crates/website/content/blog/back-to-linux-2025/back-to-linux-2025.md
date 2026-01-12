---
title: "Back to Linux after a few years of sipping cappuccinos in SF"
tagline: "Mod+Down through this article"
tags: ["linux", "niri"]
date: 2026-01-06
---

For the past 3 years or so, I've been using macOS as a daily driver. Initially just because I needed a good laptop and, boy, M1 are good and then my job provided a MacBook so I kinda ended up on macOS all the time.

macOS is fine, it works for the most part, but since I game a fair amount, I always needed a Windows setup somewhere anyway. At one point I got tired of needing to switch between the two so I tried WSL.

Queue the guy from Ratatouille when I installed Arch in WSL. Windows also has lower input latency than macOS (something very important for me), so queue the ratatouille guy again for I was actually quite satisfied.

[Of course, as I know deeply as a tooling author: WSL is full of issues.](https://m.webtoo.ls/@erika/112916162533035189) Extensions not working in my editor correctly, some things looking for the wrong native binaries, WSL crashes too sometimes.

After trying dubious setups with actual VMs running Linux and stuff, I just gave up, formatted all my hard drives and went with a classic dual boot Linux and Windows.

## Valve and times are changing

You can do the games on Linux nowadays! Thanks to Valve's efforts on Proton, it is now trivial\* to run even AAA games on Linux. I have a full AMD setup, so drivers and Nvidia nonsense are all non-issues.

I wouldn't call myself doubtful about the claims, but there was most definitely a wow factor when I double clicked Ghost of Tsushima and it started in 360fps HDR and what not without any issues.

.... So I haven't actually needed the Windows dual boot since installing Linux a few weeks ago.

But, asterisk, surely one day someone will ask me to play some {{ sidenote }}I have not set up secure boot, it still seems a bit annoying to do on Arch!{{ /sidenote }} that requires Secure Boot and kernel anticheats and so at least, the possibility to just boot on Windows is welcome.

## It's not just in the games

I haven't been in the Linux landscape for some time now, but despite that I heard more than just games have changed: Arch and Gentoo are now for losers, cool people are on NixOS, CachyOS, Omarchy or whatever else exists. All of those are 2 spooky 4 me and I'm old and bearded. I just installed Arch as I always would.

I still do not know / understand how archinstall work so I did it the way I know, running commands manually. Next time I'll try that one too.

Historically, I'd then install [`sway`](https://swaywm.org) and move on with my life, but one thing that I did keep up with while was gone was the advent of tiled scrollable window managers, like [PaperWM](https://github.com/paperwm/PaperWM) and [niri](https://github.com/YaLTeR/niri).

Those exists on macOS too, but customizing macOS never really feels good to me so I never tried any of the options there. I don't like Gnome too much, so I gave Niri a try and...

## They made it: sliced bread 2

When I first started using tiling WMs about 10 years or so ago (with `i3`), I was: mind blown. The experience even just out of the box was incredible. Finding windows and navigating across workspaces was incredibly fluid and things just felt great.

10 years later, I still feel the same, I still love tiling WMs. But, **I no longer see any point to using any of them when Niri exists**. It's that good.

To nuance, [my initial feeling wasn't actually as good](https://bsky.app/profile/erika.florist/post/3m7wgjhcc2s2n) as it was for i3. In addition to hitting a few snags during the installation (mostly my fault for following the wrong instructions, admittedly), in my opinion Niri's default settings are sub-optimal at showing off all the possibilities.

Most notably, I found navigating (and moving windows) between workspaces and monitors to be quite cumbersome with the default settings.

Changing all of my keybinds to use variants like `focus-column-or-monitor-x` or `focus-column-or-workspace-x` (instead of just `focus-column`) and equivalent for movement made it generally much more intuitive to use, and I struggle to understand why it isn't the default!

## Desktop assemble

Something that also seems to have changed is how people build their desktop environment. Back in the day, you could either install Gnome, KDE and what not and get a full working desktop. Or, alternatively, you'd install just a WM and a bunch of programs to make your desktop (waybar, rofi, etc.)

This second option is obviously still available, but I was surprised to see that following Niri's install guide installs `DankMaterialShell` which includes a bar, program launcher and lot of other features, but is not a DE.

It's not as _cool_ perhaps as setting up bunch of random programs and configuring them, but I was honestly pretty impressed at how quick I got a fully working desktop environment thanks to it. I worry a little bit about feeling locked to DMS, but at least in the Niri department I fully understand my config and could remove DMS whenever I want.

After using Niri for close to a month now, I can confidently say the only bad thing about Niri is that it's not available on more of my computers.
