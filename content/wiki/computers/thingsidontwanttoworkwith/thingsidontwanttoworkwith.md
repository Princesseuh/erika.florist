---
  title: "Things I don't want to work with anymore"
  tagline: "Some softwares, libraries, frameworks are just not for me - and that's okay"
  loadCSSModules: ["code"]
  navigation:
    label: "Things I don't want to use"
    category: computers
---

I'm usually a pretty tolerant person regarding softwares, I recognize that some things are hard to make and that it's hard to please everyone. That's fair

However, there's some softwares, libraries and frameworks that I believe are just so terrible and at this point, maybe can't even be salvaged. Of course, sometimes there's valid reasons for that, for instance, maybe the product has to be retrocompatible for various reasons and can't afford to change things too much, maybe

Please keep in mind that most of these entries are written out of immediate frustration and thus, are not very nuanced. Additionally, I don't hate the developers that worked on them, I'm sure the result is a product of the environnement they were developed in and might have been subjects to tight schedules and lack of budget, but still, the result is unfortunately frustating (probably for everyone involved)

## Shopify

Shopify itself is mostly fine, the admin dashboard is terribly slow, there's a few weirdness everywhere, but it usually mostly work

Its API however, is very unpleasant to use. The documentation is very hard to browse in addition of being often incomplete and the libraries and frameworks they provide to developers are unmaintained, not up to standards and full of issues

No matter what programming language and way you try to use it, it's always as unpleasant and has been so for years now. In addition, the support provided to developers ins't always super good, most questions on their forums and Discord seems to goes unanswered forever

It also ties into another thing that I've been having almost exclusively bad experiences with now:

## GraphQL APIs

I think that by itself, GraphQL isn't necessarily a problem, it was made for a specific reason and it generally does what it's supposed to do, fairly well, most of the time at least

However, I think that at some point someone went overboard and thought that it would be a good idea to implement it everywhere and I think that's where we went wrong. For instance, I find GraphQL not very pleasant to use in [Gatsby](https://www.gatsbyjs.com/) and [Gridsome](https://gridsome.org/)

On the paper, everything is fine, you have this nice query language to query your data but when actually using it, you often get those very messy and long queries in your code that 1: I don't find pleasant to read and 2: I don't find pleasant to write either. Actually using the data you get is also often very unpleasant due to the `edges.node.thing.edges.node.thing` structure you'll get. The second point does get better when using things such as [Prettier](https://prettier.io/blog/2017/06/28/1.5.0.html#graphql) and [graphql-tag](https://github.com/apollographql/graphql-tag) but still isn't really as amazing as some people like to claim
