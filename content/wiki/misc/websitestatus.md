---
  title: "The status of this website"
  navigation:
    label: Website status
    category: 'misc'
---

{% usingCSSComponent "code" %}

Things that should be done, things I'd maybe like to do in the future..

## TODOs

Feature-wise, the website is pretty much finished however, just like anything, it can always be improved and there's still a few details that are wrong. You never really truly feel at home, do you?

Unlike the Future section below, those are things I would like to be completed before shipping the website officially

### Features

- Add the {% footnoteref "toc-on-blog", "Perhaps this should depend on the size of the article, adding it only when it's really warranted" %}table of content on blog articles{% endfootnoteref %}

### Style

- The website currently doesn't work on mobile and tablets
- Vertical rhythm is mostly good but a few elements are still missing
- The font used for code blocks isn't installed on the website and doesn't have fallbacks
- Add loading spinners (or other loading visualization) in place where content loading can be slow, for the moment that's page loadings and the catalogue

### Performance

- Properly resize cover images on the index page

### Code Gardening

- My `.eleventy.js` file is a mess, I need to look into best practices for the architecture of that file otherwise, It'll be a hard to maintain

## Future

Maybe in the future I'd like for those things to happens. I want this website to be the kind of website you get lost in so I'm always up for adding unnecessary features. Making people think "Why did she even do that, that's so unnecessary yet so cool" is a cool feeling

### Technology

- Right now this website uses Eleventy with Nunjucks for the templates and Tailwind for the CSS. In the future, I would love to instead move to using Vue 3 for the templates, however `eleventy-plugin-vue` does not [currently support using Vue files as templates](https://github.com/11ty/eleventy-plugin-vue/issues/5) neither does [it support Vue 3](https://github.com/11ty/eleventy-plugin-vue/issues/31) so that's not possible for the moment
- I don't like the way images are done right now, {% footnoteref "image-shortcode", "Perhaps I could look into using eleventy-plugin-images-responsiver instead" %}the shortcode is clunky to use{% endfootnoteref %}, doesn't work well with CMSes and the result isn't necessarily that pleasant. I wish users could click on the images to see them in full resolution. It would also be neat to have blurry placeholders
- I don't like how footnotes are done. It's nice that they are accessible but they make my markdown files very hard to parse for me

### Performance and Bugs

- Currently the page transition works nicely when going from normal page to wiki but not the reverse, what happens is {% footnoteref "side-transitions-wiki", "Frankly, this is a really minor issue and probably not worth spending too much time on" %}the side menus don't get affected by the transition and instead just disappear instantly once the loading is done{% endfootnoteref %}
- Reduce dependencies as much as possible, some are used for convenience but can be removed easily. `concurrently` in particular needs to be removed as it's insanely big (almost as many files as eleventy itself!)

### New pages and features

- A {% footnoteref "glitch-gallery", "I used to have this on my old old website, years ago. I'm very good at getting in places in video games that the devs didn't expect and getting artsy with it is really fun" %}gallery of pictures I take of video games glitches{% endfootnoteref %}
- Adding galleries support in posts (that include the wiki) and on standalone pages, [Mark Llorbrera has a cool exemple on his blog using PhotoSwipe](https://www.markllobrera.com/posts/eleventy-building-image-gallery-photoswipe/)
