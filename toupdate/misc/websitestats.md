---
  title: "Random statistics about this website"
  tagline: "Stats are always fun"
  navigation:
    label: 'Stats'
    category: misc
---

## General

This website contain a total of **{{ collections.all | length }} pages** (this only includes content pages)

It was build on the **{{ metadata.build_time }}**

## Blog

The blog contain a total of **{{ collections.post | length }} articles** filled under a total of **{{ collections.tagListPosts | length }} tags**

## Wiki

{# -5 is needed for the pages because the categories count as pages even though they have no content #}
The wiki (that's where you are!) contain a total of **{{ collections.wiki | length - 5 }} pages**

## Catalogue

The catalogue contain a total of **{{ collections.catalogue | length }} items** from **{{ collections.catalogueTypes | length }} kind of medias**
