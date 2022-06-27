---
title: New Website!
date: 2016-11-30
tags: ["pelican", "release", "website"]
---

About 9 years ago when I started programming, one thing I really enjoyed doing was fully reading the blogs of developers I admired (back then it was the French developers [Sebsauvage](http://sebsauvage.net) and [Lehollandaisvolant](https://lehollandaisvolant.net) in particular). I would spend nights scrolling through their blog until finally reaching their first posts!

It was really interesting to see how much they had evolved since their first articles and thus was born my love for blogs, people (and programming!).

The second I learned HTML/CSS/PHP (didn't even learn JS! Was too hard.) my first goal was to make myself a personal website where -just like the developers I admired!- I would write about the things I learned, my thoughts on certain things, my projects etc. My first personal website even used the same CMS the developers I enjoyed reading used! How cool is that!

<!-- more -->

Okay, back to reality. I DID have a website 5-6 years ago (which of course; ran on a free hosting service) but I actually never wrote anything meaningful. I had FOUR articles! One wishing a Merry Christmas, a Lorem Ipsum thing, a progress update about the website design and the announcement of [a platforming game I was working on]({filename}/pages/games/sinarun.md)

The website then proceeded to go through a few redesigns and iterations and finally in late 2012
almost be the website we know today. In 2014 I started hosting the website on a paid service and paying more attention to design since I was in the process of releasing SinaRun and wanted a proper website to show the game on

And now? Where am I? Do I still need a blog? Well, for quite some time I thought maybe I would prefer the more common twitter-sphere thing people do now but then I realized I'm awful at finding interesting things to tweet about. I also always felt like I was bothering my followers by retweeting something I personally enjoy but that doesn't fit the narrative of my account

So I took upon the quest of trying to make myself a personal platform I would like to write on. A personal website where I would be able to showcase my projects be it games, websites or softwares and blog about the things I find interesting! Here we go.

## Content Management System and static site generators

Like always, when updating a old project (in this case, my website) I look at alternative frameworks, libraries etc. in order to 1: check if there's better stuff and 2: potentially learn more stuff!

I had no particular complaints about Wordpress apart from the fact that it was slow and bloated for such a simple website. Alas I'm not too versed in CMS and didn't really know where to go. I didn't really want to deal with something big so I ended-up principally looking into file-based CMS and static site senerators

I had a few 'requirements' though :

- It had to be lightweight
- I wanted to be able to make changes to the theme and publish articles easily
- Preferably in a programming language I know

At first I considered going back to the first CMS I used : Blogotext.
It worked great back then and I had some experience with it! Unfortunately being a small project it's not really maintained and while I do enjoy contributing to open-source projects it wasn't really in the scope of this project. Next!

I then stumbled upon Grav. To be honest.. I didn't really gave it a chance but checking it out I was quickly confused by how pages and templates worked. I'm sure it's great though!

Obviously, there was no reason to limit myself to PHP. I've certainly 'grown up' in programming languages since my first websites and certainly would be able to use Python, JavaScript (Node.js) etc. Python in particular is one of my favorite languages so hey, let's look that way!

There's quite a lot of static site generators and blogging softwares in Python but [Pelican](http://blog.getpelican.com/) seemed to be the most popular and it actually.. Did fit my needs pretty nicely!

<span>[Pelican also has a fairly active GitHub](https://github.com/getpelican/pelican) which is always a plus!</span>

It was in Python (duh), it allowed writing articles easily in Markdown and of course being a static site generator it was lightweight. Since I've used Flask in the past I also had experience using Jinja2 so making the theme was gonna be pretty easy

Honorable mention to Jekyll, Hugo and Hexo which all looked neat (specially Hugo. I like Go and the documentation seemed extra nice)

And so Pelican it was!

### Downside

Unfortunately due to being a static website, the few 'dynamic' parts of the website needed to be emulated through JavaScript (the devil!).

So comments and the random sentences in the header won't work if JavaScript is disabled, sorry! That's pretty much the only bad part of it though and those features are not core to the website anyway.

## Design

Switching 'CMS' meant that no matter what happened I had to redo the design to fit the templating engine of the new framework so I took the opportunity to redo.. everything! Nah, I actually still liked the way the things were organized so I kept the same idea and improved upon it

Back when I 'made' (it was based upon another theme) the design in 2012, the idea regarding website design I had been taught then was to show as much information as possible without having to scroll. On a 1080px screen the old website was able to show the header, a full article, 5+ games in the sidebar and a part of my Twitter!

By reducing the amount of things in the sidebar I was able to expand the main part allowing for bigger padding (and therefore improving readability). Pretty much everything was given more space to breath. Breathing is important!

Regarding fonts and their sizes, the previous design used 12px Arial for article content, this new design uses 14px Open Sans. I believe the recommended font size is actually 15px but it felt a little bit too big for my tastes. Titles now uses Lato instead of.. Arial. The website name also use Lato (instead of Arial Black!)

A few colors were brightened (and sometime put in gray scale because for no reason some colors had a tint of red??) in order to prevent contrast issues and improve visibility on small devices (which goes along the fact that the website is now fully responsive)

Overall the design is more in line with designs of 2016 without having gone full blown minimalism 40px padding (mostly because old habits die hard because I actually envy some of these designs)

Oh also the previous version was XHTML which is.. a bit outdated by now.

## The few things I learned

### SASS

For those unaware, SASS is a scripting language which translate into normal CSS. It add features like variables, nesting, functions and more! It's a great tool to make CSS easier to write and avoid having to repeat oneself

I had some experience using SASS due to a few very small projects, I never really learned its intricacies. So for this new website, I thought.. Why not try to use it somewhat seriously this time? Perhaps it would speed up development or at least speed up the work on future projects.

I obviously didn't get to use all its features considering this website certainly doesn't need to import things left and right nor does it need to support IE6 but all the features I used were actually pretty great and certainly did help me achieve things quicker! I hope to continue using Sass (or perhaps try Less?) in future projects!

### How to optimize a website

As you might have already noticed by now if you wandered through the website : It's fast.

Unsurprisingly servers are pretty fast at delivering static content but there's plenty of ways we can further improve on the overall speed! Optimizations on the client side would be things along the lines of minimizing CSS/JS, reducing requests counts or optimizing images where the ones on the server side would be things like using http2/spdy, gzip, proper caching headers etc

After spending days reading guides, scanning my website with various diagnostic tools and tweaking Nginx's configuration files, I finally managed to make it load almost 'instantaneously' (read : various hundreds of ms) without really having to cut features!

One of the coolest things I did -in my opinion- was adding click-to-load for Youtube embeds.

I noticed that Youtube embeds added a whopping 400kb+ to load which is clearly wasted since a lot of users (specially on mobile) might not even click the video. Now, unless the user interact with the embed the only thing loaded is the thumbnail (which average 20-30kb) so that's a pretty big improvement! [Example in this article]({filename}/2015-10-26-sinarun-steam-release.md) (which funnily enough include a non-optimized Steam embed)

### Lot of things about design

I don't make websites often and design is certainly not my favorite part of development but as a mostly back-end person, it's kinda interesting to at least once in a year try to delve into the design part of things.

I can't say I learned many things (After all this is a pretty classic blog setup). I did however learn a lot about proper contrasts, giving elements more breathing spaces and focusing on content which is already pretty nice!

## End

And that's pretty much it! I hope you enjoy the new design and look forward to me potentially writing articles.
