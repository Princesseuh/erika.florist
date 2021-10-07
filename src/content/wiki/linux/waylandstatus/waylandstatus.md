---
  title: "Experience with Wayland on my setup"
  tagline: "Almost there Wayland, almost there"
  navigation:
    label: Wayland status
    category: linux
---

{% usingCSSComponent "code" %}

I've been using Wayland [since May 2020](https://github.com/Princesseuh/dotfiles/commit/42d18db2db41e4de08396d367d90612d2ec98f30) through [Sway](https://swaywm.org/), an i3 compatible windows manager

I started using Wayland because I got tired of dealing with vsync issues, Picom and other stuff on Xorg. So I tried out Wayland, not expecting much after all the stories I've heard but in the end, well, everything works 🤷‍♀️

### Disclaimer about NVIDIA

If you've been using Linux for a long time now, you're probably aware that Linux's biggest problem is very often somehow related to NVIDIA

For Wayland's case what this mean that if you're using a conventional stacking window manager, you're in luck because [GNOME (Mutter)](https://en.wikipedia.org/wiki/Mutter_(software)) and [KDE (KWin)](https://en.wikipedia.org/wiki/KWin) both supports NVIDIA GPUs, but any other options (be it stacking or tilling) doesn't. So yeah, [Sway doesn't officially support NVIDIA GPUs](https://github.com/swaywm/sway/wiki#nvidia-users)

I, unfortunately for my Linux adventure, have a NVIDIA GPU, but thankfully, Sway runs fine using [Nouveau](https://nouveau.freedesktop.org/), the unofficial open source driver for NVIDIA GPU. Nouveau isn't always perfect, it doesn't always have the best performance for gaming but, it's better than nothing

I'll buy an AMD GPU next time

{% image src="./wiki/linux/waylandstatus/waylandlogo.png", alt="The Wayland logo, a white W written on a yellow-ish circle using a graffiti font", caption="Wayland's logo" %}

## The overall status of things

These days? All the GUI libraries supports Wayland. [Sometimes you need to set flags or install a package to enable it](https://wiki.archlinux.org/title/Wayland#GUI_libraries) but still, it works fine after that

This mean that unless you're using an old version of a program, or the program hasn't been updated to newer versions of its GUI library, there's a very good chance that it's running under Wayland!

Here's a few programs where this is however not the case yet as they don't depend on GUI libraries for their Wayland support

### Browsers

Neither Chrome or Firefox will run using Wayland without flags at the time of writing. Chrome (and other Chromium-based browsers) needs the following flags:

`--enable-features=UseOzonePlatform --ozone-platform=wayland`

and for Firefox, run using

`MOZ_ENABLE_WAYLAND=1 firefox`

For both of them, Wayland is still a work in progress but it's getting along really nicely, I don't notice any particular issues on my setup that wouldn't happen on Xorg with Nouveau

### Electron

Electron support Wayland since its version 12, however it also needs the same flags Chrome does. It has certain limitations, namely [it doesn't support client side decorations](https://github.com/electron/electron/issues/27522) yet if you need those (this isn't really a requirement on Sway as it will render its own title bars)

Unfortunately Electron apps tend to be slow at updating their Electron versions sometimes so for some applications it might take just a little bit more time before everything works, luckily projects like [discord_arch_electron](https://aur.archlinux.org/packages/discord_arch_electron/) exists to use your system's Electron instead of the bundled one

### Spotify

Much like NVIDIA, Spotify tend to be a common name that pops up whenever someone has issues on their Linux setup. Spotify is a CEF app, which mean that you can make it run under Wayland using the flags for Chrome however...

{% image src="./wiki/linux/waylandstatus/spotifywayland.jpg", alt="The normal spotify window, running under Wayland but also, an entirely black screen running under X11", caption="Spotify is always pretty good at giving us interesting bugs on Linux" %}

It does this whenever you run it under Wayland 😅

The bottom window is running completely under Wayland and works perfectly, the top window however, in addition of being completely black and devoid of any apparent purpose is running under X11. That means that despite it working, you cannot run it without XWayland

Your best bet as the moment for running it under Wayland is probably to hide the black window somehow and just use it normally, forgetting that window ever existed
