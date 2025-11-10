---
title: "SinaRun Post-Mortem"
tagline: "All the synapses we've ran through"
date: 2025-11-09
tags: ["SinaRun", "gamedev"]
featured: true
---

[SinaRun is now out](/articles/sinarun-full-release/#title)! After all this time, it's finally done.

I started working on SinaRun (then called SinaRun 2) in early 2014. After the "success" of SinaRun 1 (hey, it amassed 10k+ plays in 2012-2013 without any real marketing, we out here), I wanted to make a *real thing*, a real product, a commercial game.

## A little history first

SinaRun 1 initially started as a rage game I wanted to make for a streamer I liked to watch. This didn't really pan out and the streamer in question was never really interested in it, but it still ended up having an effect on the design of the game.

The result was honestly quite frustrating to play, some of it due to polishing issues (the field of view was strangely low, the camera was way too close to the floor) but other because of intentional gameplay choices.

The movements were notably quite unintuitive. There was already part of today's design in that the character would carry a lot of inertia, but since it never felt like you were going fast, it felt really weird to be carrying that much speed.

<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/mnuBhFq9rqU?si=wMX1DSO84545vpxQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

So, for SinaRun 2 there ended up being lot of emphasis on making it less frustrating to play, something [I.. well, some people would say I did not succeed at](https://erika.florist/articles/on-feedback). But the vision was much more clear and intentional, SinaRun was gonna be a momentum-based platformer where you go fast, you feel fast, you can reset instantly (SinaRun 1 had a small freeze every time you pressed R, very annoying) with pretty and intelligently designed levels.

Anyway, the elephant in the room.

## L'enfer, c'est les autres

I implemented multiplayer into SinaRun 1 after a streamer (a different one) convinced me that he would "definitely stream the game" if I added support for playing with friends.

Seeing this as a Win-Win situation, 12 or so years old me, who didn't know ANYTHING about networking or architecting games with networking went ahead and implemented it. It was insanely buggy, but Unity's RPC networking at the time was actually quite easy to use (and misuse), so it kinda worked!

This decision would proceed to... ruin my life for the next 15 years, and the streamer in question actually ended up never streaming the game.

### Eh bien, continuons

When making SinaRun 2, I figured that I'd be smarter and implement multiplayer first, to avoid the tangle that it had caused for SinaRun 1 and well... It turned out that 13 or so years old me wasn't that much smarter than 12 or so years old me so, it ended up being pretty much the same code, just as messy, annoying, buggy and also just as fun (so not very fun).

Between the release of SinaRun 2 in 2014 and its full release in 2025, Unity had the time to introduce and deprecate 2 (3?) new networking systems, showing that this RPC thing maybe wasn't that amazing (but I liked it, though) in the first place. And also making it impossible at one point to even update to later version of Unity.

{{ image src="./princesseuh.jpeg" alt="A screenshot of a multiplayer session of SinaRun, where I am playing with random people" }}
<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=543198923">Screenshot by Steam user pernix</a>
{{ /image }}

I.. don't regret implementing multiplayer, despite it all, some people did like it! I've received DMs and mails over the year from people having a lot of fun playing with their friends. And I mean, I get it, right. Multiplayer is fun. Making SinaRun from scratch today, it would have multiplayer for sure.

... But, I won't lie that had I never implemented multiplayer, probably that SinaRun would've had twice the content. Multiplayer ended up taking a huge technical toll on the project, making it painful to do any sort of changes at times because I always had to consider how things would interact with multiplayer.

## Just straight up spinning my wheels in mud

In addition to the many technical challenges I encountered while working on the game, I also had a lot to learn in regard to the philosophy one must have while approaching a large project like this.

Some things just took a lot more time and energy than I thought they would and it felt like I was making very little progress at times. Especially towards the end of the development cycle, I felt like I was spending most of time making small changes that were necessary, but took a lot of time and didn't really move the needle in any meaningful way.

Making any sort of UI for the game in general was a very lengthy and unsatisfying process. I spent way more development time on the UI and menus than on core mechanics, despite using Unity's shiniest UI systems at the time.

{{ image src="./ui-update.png" alt="A screenshot of the settings menu of SinaRun" }}
Seriously it feels like I spent 70% of the development time on the settings menu
{{ /image }}

On the engine side, while Unity most definitely did save me a lot of time compared to how it would've been to make the game using other tools available at the time (remember, I was 12 years old). Over the years, I found myself spending a lot of time doing things in Unity itself that would've been easier to do in code, ESPECIALLY when it came to the UI.

Outside of the game itself, making things like the art assets for the different platforms, integrating with the various softwares people use, answering mails (this one mostly because of the sheer number of scam emails devs receive), doing marketing and so on are just all things that I found hard to motivate myself for and ended up taking a lot of time.

Gamedev is just long, tedious and straining work. I massively underestimated how much work especially the last 10% of the project would take.

## Okay, the good things now

The community around SinaRun has been absolutely amazing. Over the years, I've received so many messages from people telling me how much they enjoyed playing the game, how it helped them through tough times and how much they still think about it years after playing it.

It's incredibly heartwarming to see how much of an impact a niche game made by a 12 year old can have on people! The game overall sold decently well, especially considering how little marketing I did for it, and the reviews have been mostly positive.

{{ image src="./gdx.jpg" alt="A booth at a game expo where SinaRun is being shown" }}
<a href="https://steamcommunity.com/id/PowerFusion">PowerFusion</a> and his team graciously put up a little booth for SinaRun at the Game Discovery Exhibition 2016 in Edmonton
{{ /image }}

### I got better at everything

Both at hard and soft skills, I've learned a lot while working on SinaRun. From learning how to use Unity and C# better, level design, 3d modelling, to understanding how to manage a long-term project, to [improving my communication skills through interacting with the community](/articles/on-feedback#title), it's been quite the journey.

There's some things I did not get to touch on much, like marketing or sound design, but I did in fact learn a lot about those too, even if I can't say I did a particularly good job.

### Level design is actually my passion

One of the things I enjoyed the most while working on SinaRun was definitely level design. Over the years, I've thought many times about how my future projects would pretty much entirely be focused on level design, just because I enjoyed it so much!

The sole regret I have in that regard was that it was fundamentally impossible to introduce real verticality without changing the core mechanics of the game. Still, some levels do have a little bit of verticality, but it's always in the form of going down, pretty much never up.

### Stayed true to my vision

The core mechanics, the feel of the game, and the overall aesthetic remained consistent throughout the development process.

As most of the negative reviews are about frustration with the movement system (i.e. sliding too much), it was often tempting to change it to be more conventional, but I resisted that urge and I'm glad I did because positive reviews from advanced players often praise the unique feel of the movement.

As far as I remember, the only two movement changes I did were making it slightly easier to turn (especially while airborne) and making the acceleration changes dynamically based on the sprint. Which is fair enough, I think.

{{ dinkus /}}

The best time to finish SinaRun was 10 years ago. The second best time was now. I don't know if it was worth the wait, but I'm so so glad it's finally done. The relief is immense.

I'm happy with how the game is right now, there's about a million flaws and things I would do differently if I were to make it again today, but overall: The game works and you can have fun with it, and that's enough for me.

Thank you to everyone who supported me throughout this journey, whether by playing the game, giving feedback, or just being there. See you in the leaderboards!
