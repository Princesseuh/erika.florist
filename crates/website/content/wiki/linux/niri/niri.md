---
title: Niri tips, tricks and tweaks
navigation:
  label: Niri Tips and Tricks
  category: linux
---

> This page assumes that you are using Niri's default keybinds and general settings
>
> If you are using DankShellMaterial's binds config, your keybinds are (surprisingly to me) different from Niri's defaults. For instance, moving windows is done using Shift instead of CTRL.

## Easier moving across windows, columns, workspaces and monitors

Mod+Direction moves focus across windows vertically, and columns horizontally. To move focus to another workspace requires pressing `Mod+PageDirection` and moving to another monitor can be done using `Mod+Shift+Direction`.

In all cases, pressing also CTRL will move the window or column to wherever desired.

Personally, I find that it makes things easier to be able to navigate across all kinds of things with the same keybinds:

```kdl
Mod+Left  { focus-column-or-monitor-left; }
Mod+Down  { focus-window-or-workspace-down; }
Mod+Up    { focus-window-or-workspace-up; }
Mod+Right { focus-column-or-monitor-right; }

Mod+Ctrl+Left  { move-column-left-or-to-monitor-left; }
Mod+Ctrl+Down  { move-window-down-or-to-workspace-down; }
Mod+Ctrl+Up    { move-window-up-or-to-workspace-up; }
Mod+Ctrl+Right { move-column-right-or-to-monitor-right; }
```

With this, whenever the edge of a column/workspace is reached, pressing any binds again will move to the neighboring workspace vertically or monitor horizontally.

> Note that this doesn't work if your monitor are on top of each other, as it assumes that horizontal movement will eventually reach another monitor.

I would not suggest removing the default keybinds for moving across workspaces and monitors as it can still be useful to be able to jump to a specific workspace/monitor without needing to go through all your windows/columns.

## Cycling columns

A common workflow in niri is to have one main window and a side window. For instance, 75/25 where 75 is your editor and the 25 is a terminal.

Perhaps on that same workspace you also have a browser and you'd like to be able to switch quickly between the terminal and the browser without losing sight of your editor.

By default, this would require you to either move your columns around, or consume the browser window into your terminal (or vice versa) column and make the column tabbed (which is not a bad workflow!)

An alternative to this is to bind a key to cycle the right hand column:

```kdl
Mod+Tab {
 spawn "sh" "-c" "niri msg action focus-column-right; niri msg action move-column-to-last; niri msg action focus-window-previous"
}
```

With this bind, you can keep your focus on your editor, and press it whenever you want to switch between your terminal and browser.

## Workspace back and forth

By default, pressing Mod+Number will focus the specific workspace, pressing it twice however will do nothing.

By setting the following setting:

```
input {
 workspace-auto-back-and-forth
}
```

Pressing it twice will now go back to the previous workspace you were on, allowing you to quickly check a workspace with one keybind x 2 instead of two separate ones.

#### Alternative: Binding alternate actions if already on the workspace

Using `niri_workspace_helper.py` you can bind alternate actions for when you are already on the workspace you're trying to focus, such as focusing the first or last column of the workspace.

See [the GitHub page of the script for more information](https://github.com/heyoeyo/niri_tweaks#niri_workspace_helperpy)

## Disabling mouse acceleration

No comment.

```kdl
input {
   mouse {
       accel-profile "flat"
   }
}
```

## Lesser known keybinds

Those following things are binded by default, but I found them unintuitive to discover.

### Expanding to available width

I see sometimes users creating layouts like 25/75 or 66/33 (or even 50/50, actually) by painfully resizing both columns manually.

Instead of doing that, pressing `Mod+Ctrl+F` will automatically expand a column to take the maximum available remaining width, allowing you to create, i.e 25/75 by only resizing the column intended to take 25 (either manually or through presets), focusing the future 75 and pressing the keybind.

### Adding / removing windows into / from columns

[It is not possible in Niri to create a window in an existing column](https://yalter.github.io/niri/FAQ.html#can-i-open-a-window-directly-in-the-current-column-in-the-same-column-as-another-window). The way to do this is instead to "consume" windows into your existing columns by pressing `Mod+BracketLeft/Right` while focused on the window you want to move into a column.

You can try it by creating two columns, focusing the right one and pressing `Mod+BracketLeft`.

Alternatively, there's `Mod+Comma` (and `Mod+Period`) that allows one to consume or expel windows into the current column, but I personally find it weird to use, so I've inverted the bindings as Comma and Period are easier to access than brackets on my keyboard.

## Troubleshooting

### Environment variables are not set as expected

niri's `environment` setting only applies to Niri and programs started through it.

This notably means that systemd services don't have those variables, and specifically, DMS (if started through its recommended systemd services) and programs started through it won't have those variables.

In the same vein...

### Environment variables are coming from an unknown place (DMS)

DMS's install wizard (invisibly) installs a file into `~/.config/environment.d` that sets a few things required for Wayland, but more troublingly sets `TERMINAL` to whatever you might've not realized you selected during the install.

In my case, my terminal of choice wasn't available as an option so I selected a random thing not thinking it'd actually change important stuff.

### Discord auto start does not work

For some reason, starting Discord in my niri config did not work. The workaround I found was to put a sleep in its start command:

```
spawn-sh-at-startup "sleep 3 && discord --start-minimized"
```

I haven't investigated, but I would not be surprised that this happens because Discord starts before my system has successfully connected to the internet.

## Resources

- [My Niri config](https://github.com/Princesseuh/dotfiles/tree/main/linux%2Fniri)
- [awesome-niri](https://github.com/Vortriz/awesome-niri) - List of links about Niri
- [nirius](https://git.sr.ht/~tsdh/nirius) - Useful companion software to do various things
