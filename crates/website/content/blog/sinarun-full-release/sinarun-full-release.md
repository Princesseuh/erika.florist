---
title: "SinaRun is now out!"
tagline: "Closer to a slow walk, really."
date: 2025-11-03
tags: ["SinaRun", "release", "gamedev"]
featured: true
---

After a very long time spent in limbo, I'm proud to announce **the full release of SinaRun is now out!**

<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/PiAH1v7-SsE?si=vAoWXUahNWRItaey" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

<iframe src="https://store.steampowered.com/widget/324470/" frameborder="0" width="646" height="190"></iframe>

This final update is currently only available on Steam, but will be deployed to Itch.io in the coming weeks.

## Changelog

### General

- Added a new Speedrun game mode
  - In this mode, all levels from the chosen category (or both) are played in a row, with the total time being the sum of all individual times. This mode includes a leaderboard for each category.
  - This game mode needs to be unlocked by completing any level at least once (including the tutorial in normal mode)
- Reworked menus with more modern UI elements and visuals
- Reworked in-game UI
- Improved keyboard and controller navigation in menus
- Updated application icon
- Replaced game logo with a higher resolution and properly colored one
- Added support for binding more keys (ex: mouse4, mouse5 etc can now be bound)
- The game is now available for Apple Silicon Macs
- Added support for Steam Cloud
- Updated credits
- Removed the walk function
- Removed WIP multiplayer mode
- Removed Training mode (it wasn't really working, nor useful)
- Improved UI scaling
- Improved performance
- Renamed the level categories as follows:
  - Main Line -> Standard
  - Classic -> Legacy
- Legacy levels now needs to be unlocked by completing any level in the Standard category at least once

### Levels

#### New Tutorial

The tutorial has been redone from scratch to better prepare and teach players how to play the game. A common complaint was that the previous tutorial was a bit demeaning towards both the player and the game itself, so I tried to make it more fun and engaging. It is now a short level that introduces the player to the basic mechanics of the game, while also being a fun and pretty level to play through. It now has its own leaderboard, and after being completed once, it can be played as a normal level in the Standard category.

#### New Level: Coffee Swirl

A happy-looking level with a lot of different paths to take, should be pretty fun to go through! This level is part of the Standard category.

#### Blast Tendency

- Improved visuals consistency with the rest of the game

#### Wanderer Hideout

Wanderer Hideout has been reworked to be more visually appealing and to have a better flow.

- Reworked lighting
- Improved "mountains" formation
- Reworked platform formation
- Moved side pillars to make it harder/impossible to climb in unintended places
- Lessened initial rotation of the player
- Updated particles
- Reworked the end of the map
- Fixed a few platforms being darker than intended

Since overall best times are lower than the current best times (by around 700-800ms), leaderboards won't be reset

#### Community Interest

- Fixed certain collision issues

#### Elastic Light

- Added music, Four Prophets by General Fuzz (the music previously used in Spiritual Era)

#### Spiritual Era

- Moved to the main line category
- Changed music to Go Inward by General Fuzz

#### Slick Talk

- Improved lighting. Platforms should be easier to see without necessarily being blinding like they used to be a few patches ago

#### Golden Opportunity

- Updated lighting
- Adjusted certain platforms towards the end to make the shortcut possible from both sides

#### Inner Synergy

- Moved to the legacy category
  - I do not have the motivation to rework this map completely to make it flow better, and too many people over time told me they liked the map as it was, so I decided to leave it as is. Although, as I do not consider it to be up to the quality of the other maps in the main line category, I think the legacy category is a better fit for it.
- Updated lighting
- Fixed certain collision issues
- Removed death zones throughout the map
- Slightly updated certain platforms to avoid getting stuck now that death zones are removed
- (No changes have been made to the "exploit", it's okay to use it!)

#### Legacy Maps

##### Red Things

- Modified map scaling so it works better with the current movement engine
- Adjusted certain platforms to make it easier to get through the map
- Reduced fog
- Added leaderboard

##### Light City

- Adjusted map scaling so it works better with the current movement engine
- Reduced fog

##### White Things

- Adjusted map scaling so it works better with the current movement engine
- Moved spawn position back a little bit
- Added leaderboard

### Bugs Fixes

- Fixed a bug causing 00:00:00 times. I'm not sure that's the name you wanna be known for but thanks to 'The Loliconvict' for finding how to reproduce this bug!
- Fixed end door hitbox being larger than intended (this does not affect times, as it was unlikely to hit the part of the hitbox that was larger than intended)
- Fixed speed meter jittering between values at max speed
- Fixed player own score not being properly highlighted in the leaderboard in certain cases
- Fixed the minimum speed indicator not working correctly after reset
- Fixed underscores not showing properly in names on the leaderboard
- Fixed an issue where shadows would shake/flicker on certain maps
- Fixed an issue where other Steam users statistics on the same computer would override the current user's statistics
- Fixed an issue where keyboard bindings would not properly reflect the current keyboard layout
- Fixed a thousand little things over the past few years...

## Why did it take so long

I started working on this game when I was a young teenager, a kid really, and despite the fact that I definitely have not been working on it consistently, it's been a huge part of my life. I've learned a lot about game development, programming, and myself through this project. SinaRun has honestly been quite persistently in the back of my mind since its release.

I'm ashamed of the state it was left in. I'd like to think that I was and I am now too, better than releasing early access slop that never get finished. A lot of it was due to a lack of motivation due to various factors, perfectionism, the last 10%... and in more recent years, a lack of time (I'm an adult now, believe it or not).

Every single time I started a new project, even 10 years later, the only thing I could think of was "I should be finishing SinaRun instead". It sucked, both for me and for players of the game! Ever since the game release, I've gotten praise for the game in my DMs on various platforms or by mails and while players never explicitly expressed that they were disappointed by the lack of updates, I can easily assume that they would've preferred playing a finished version of it.

### What did it take

Wanting to make a new game.

I was able to suppress this feeling of inadequacy while working on softwares and websites, but I've been unable to even think about making a game without feeling like I was disappointing everyone by not finishing SinaRun first.

Additionally, support from my friends regarding streamlining the game and removing elements of the game that I was dreading coming back to / updating to my standards. The most notable of which was multiplayer support, something I initially added to SinaRun Classic to please a single person (who ended up never playing the game, ha) and that I have now fully removed from the game.

### Connecting with people is actually hard

The multiplayer code of SinaRun 2 (now just SinaRun) re-used a lot of the original code from the classic version which was: made by a 12 years old, programming in C# for the first time in her life, in an engine she didn't know very well, not fun anyway and well networking complicated you know. It tangled the entire game's code and made working on SinaRun, even 10 years later very annoying.

But, I felt really bad about removing it, because I know that over the years some people have told me they had made wonderful memories on it (some even asking me for 10+ years old builds of the first game to play it again!) and well, it was part of the pitch to sell the game.

More concretely however, it was unplayable both for technical and gameplay reasons. There were a lot of bugs, the server list and facilitator for connections were a pain to keep online (both now and in 2014) and didn't really work most of the time, the gameplay was very bad, pretty much impossible to play unless all players had the exact same skill level and the host quick to press buttons.

There was three choices:
1. Spend a very long time re-doing the multiplayer from scratch, killing my motivation forever
2. Accept that it sucked a lot
3. Remove the multiplayer

Due to how it tangled the rest of the code (almost every piece of code in the game had to take into account that it could run in networking) 2. was very annoying, because even keeping it but bad meant making progress on the rest of the game slower. I was initially going for 1., but the truth is that I would've never had finished it.

So, I choose the third option.

## 1-800-Disappointed

If you're someone who bought SinaRun while it was in Early Access (or before even!), hoping for a wonderful multiplayer experience eventually: I apologize.

If any missing features are deal breakers for you, and you would like to get refunded your purchase, but are not eligible for Steam's refund program, please contact me at **sinarun@erika.florist** (with a proof of purchase and how you'd like to get refunded) and I'll be happy to help you out, no questions asked (and if do have questions, I'll answer them!). You can keep the game, of course.

There's a million things I would have liked to do, but I had to draw the line somewhere to be able to move on. I hope that you can nonetheless appreciate the work that has been put into this final update, and that it will be a fitting end to SinaRun's development.

{{ dinkus /}}

I'm extremely grateful for all the support I've received from the community, thank you very much! There's a lot of names that came back throughout the years and it's impossible for me to remember them all, but really, thank you all.

See you all for my next game, hopefully that one won't take as long.
