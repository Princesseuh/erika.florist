---
title: SinaRun Update 1.5.1
date: 2016-07-26
tags: ["SinaRun", "games"]
---

Today I watched the French movie 'Comment c'est loin' which is about the
rap/hip-hop duo Casseur Flowters. **(The next two paragraphs contain spoilers)**

Basically the story is that they need to make a song in a day to please
their producers who've been waiting for a few years for the duo first
song, however under this basic almost comedy-like story the movie is
actually about how the duo need to faces their issues, the fear of
failure etc

The end song which is both the song they make for their producer in the
movie and the last song you hear before the credits theme is about how
they or what they make will never be unaccomplished no matter what
happen. How is that relevant to SinaRun you might ask? I don't know. I
just thought it was interesting and fairly inspiring

Anyway, enough of this sad introduction!

Today update include changes to Elastic Light and others maps, many
bugfixes and polishing there and there. There's not many changes that
need to be detailed so the changelog should cover everything!

## Changelog

Since this update (and the one before) fix exploits and bugs related to
the leaderboards, I took the liberty to delete a few 'suspicious' times
on the leaderboards.

### Known Issues

- Controllers might have issues on OSX and Linux
- A few texts are missing in Spanish and Polish translations
- Mouse cursor being visible and unlocked when it shouldn't is partly back
- Slick Talk lights changes were partly reverted
- White Roads bloom changes were partly reverted

### Engine Changes

That might sound totally insane but I backported the entire game back to
Unity 4. Unity 5 actually present too much issues that I don't really
want to deal with for the moment at least.

Oh well. I guess I saved 700$. Everything that was broken due to engine
changes should be back to normal! (anti-aliasing, colors etc). I must
say backporting Elastic Light to Unity 4 was an interesting experience.
I don't know if there was an 'intended' solution for this but I ended up
writing my own thing. Was fun! In the end Elastic Light look almost the
same on both version. (Though I had to find a way to do Height Fog on
Unity 4 that didn't break transparent things and anti-aliasing too much)

### General Changes

- Re-enabled multiplayer and leaderboards
- Removed the link to my Twitter in the menu, some users commented that it
  felt too mobile game-like and beside I didn't have enough room for this
  version number
- Maximum shadow distance is now 225 (it was pretty destructive to set it
  higher anyway)
- The 'Automatic' settings for resolution is now disabled when in
  fullscreen (it was intended to be used only in windowed)
- Due to the engine changes, Post-AA is re-enabled by default (it look
  pretty okay in Unity 4. For Post-AA that is!)
- Invert Sprint is now disabled by default (Left-over from testing.
  Sorry)
- In Training F3 now allow you to hide the training UI. No-clip is now on
  F4

### Controller Changes

- LT and RT can now be used to sprint
- A can now be used to jump

In the future I plan on adding rebinding or at least different layouts
but for the time being these two changes should already help a lot!

### Maps Changes

- Fixed additional floating pillars in Slick Talk (specially at the end of
  the level)
- Fixed clipping issues in maps where pillars reached kinda high (Slick
  Talk, Elevated Highground etc)
- Slightly improved performance of some level previews

**Golden Opportunity**

- Made a 'wall' sliiighty larger to make a shortcut easier and more
  consistent
- Moved a pillar to allow for more creative jumps toward the end of the
  level
- Moved a wall slightly out of the way toward the end to allow for a
  tighter turn

**Blue Horse**

- Reduced shadow opacity to make it easier to see platforms (Thanks
  GoldenRoxGaming for his video!)

**Blast Tendency**

- Moved a pillar after the first angled pillar (arch thing) jump to make
  it less frustating (and more consistent)

**Elastic Light**

- Improved performances
- Moved many platforms around to better balance the paths

It is now easier to get to the left path and you can now easily commit
to the left path from the middle one (where previously you needed to
fully commit to the left path at the beginning), in addition it take
more time to start with the right path now to better balance the two.
Merging to the right one from the center is still possible.

The right path is still not as interesting as the left one even though
it's faster but these changes should already contribute toward a better
balanced map (and also allow for more creativity from the center path).
Further work will be done toward this in the future

## UI Changes

Added padding to notes (fix issues where at some low resolution it
looked like the text was overflowing)

## Bugs Fixes

Fixed various typos in both English and French
Fixed a few crashes related to leaderboards
Fixed missing visual effects in some level previews (Unusual Downtown
and Spiritual Era in particular)
Fixed Status Bar ingame not being aligned correctly with the menu at low
resolution
Fixed option menu closing when rebinding the pause button
Fixed IP input field label being too small and thus causing two lines
for no reason at low resolution
Fixed credits having major encoding issues and not scaling correctly at
low resolution
Fixed resolution dialog being mis-aligned at low res (which lead to the
scrollbar being hidden)
Fixed camera field of view bugging out in the settings menu when Invert
Sprint was enabled (in-game)
Fixed spawn height for the last tutorial teleport
Fixed missing geometry in Community Interest level preview
Fixed Spiritual Era brigtness and bloom issues
Fixed an issue where audio didn't play in the main menu but worked fine
in levels
Fixed a missing colon in the Spanish translation
Added missing translation in French

Hopefully you guys like the update! Next update should be a more content
focused one hopefully. I have a few ideas for a new map..
