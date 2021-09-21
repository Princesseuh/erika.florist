---
  title: "Performance tips and tricks for Fish Shell"
  navigation:
    label: Fish Shell Performance
    category: linux
---

{% usingCSSComponent "code" %}

When customizing a Linux setup, it's really easy to fall into the trap of thinking that, since your base programs are so efficient, adding plugins or tweaks won't slow them down much but that's often not the case

A common exemple is [Vim](https://www.vim.org/), it's fairly easy to slow down Vim by adding too many plugins! You'd think that Vim is so old and so fast that they're be no way to slow it down so much so that it perform worse than modern editors and yet it's very much possible and even the simplest plugin can slow down the editor to a crawl - it's horrifying

And so, this exact situation happened to me with [Fish](https://fishshell.com/) - my shell of choice. Here's a few things I noticed when fixing that problem:

## Adding to PATH in config.fish

Previously, I would add a folder to my PATH variable in my `config.fish` file like so:

```shell
set -U fish_user_paths ~/dotfiles/scripts $fish_user_paths
```

[I eventually discovered](https://github.com/Princesseuh/dotfiles/commit/f02d8957e8d53a5060ad60ae3c2b35086bec2c6d) that this is not recommended (though I'm not sure it was documented to not do so when I did it) and that doing so will append to your $PATH every time Fish is launched

At first, I didn't notice any problems but over time I started to notice my shell startup taking longer and longer, toward the end I think it took like close to 1000ms to start ha!

Nowadays, I just set the PATH directly in the terminal once using the same command, it works nicely (and is the recommended way per [the documentation](https://fishshell.com/docs/current/tutorial.html#path))

## Slow prompt

These last few years we saw a lot of new prompts being made for Fish: [Ports](https://github.com/pure-fish/pure) of [Pure](https://github.com/sindresorhus/pure) and other popular Zsh themes, [Starship](https://github.com/starship/starship) (not exclusive to Fish), [Tide](https://github.com/IlanCosman/tide) or [Hydro](https://github.com/jorgebucaran/hydro)

And, let me be clear: They are all very good and far performant enough for the common person, even one who cares about performance. I just like being extra about it, that's it 😛

At first I used Starship, it's written in [Rust](https://www.rust-lang.org/) so clearly it must be the fastest right? Well, yes and no. It is *~blazing~* fast (though not necessarily that much faster than the alternatives) however being an synchronous prompt it struggle a lot in certain situations (especially Git repositories) and due to not having a timeout, it'll sometimes take multiple seconds to print anything and letting you type. Thankfully, [the issue is known](https://github.com/starship/starship/issues/301) so I'm sure It'll eventually get fixed

{% note 'Starship `explain`' %}
Starship can be given an `explain` parameter like so: `starship explain` to explain the current prompt and measure the performance of every module composing it. It's really really good - I wish this feature was available in other prompts too

A `timings` parameter that give a few more info is also available
{% endnote %}

Apart from Starship, most of the popular shells these days are asynchronous so this is not a common issue. If your current prompt is not async, you can make it so easily by using [fish-async-prompt](https://github.com/acomagu/fish-async-prompt) (this only work with native Fish prompts, so it's not applicable to Starship)

The time it takes to show anything does still depend on what prompt you're using (in the case of Git repositories, if your prompt use [gitstatus](https://github.com/romkatv/gitstatus) it's probably: extremely fast) but at least you'll be able to type instantly - no matter what kind of folder you're in

Regarding Tide and Hydro, Hydro is [definitely faster](https://github.com/jorgebucaran/hydro#performance) at rendering the prompt, however it has less features than Tide so.. Up to you to see which one you prefer. Personally, I use Hydro due to the cited performance difference though I actually prefer the prompt on Tide
