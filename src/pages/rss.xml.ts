import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import rss, { type RSSOptions, } from "@astrojs/rss";

export async function GET(context: APIContext) {
  const blog = await getCollection("blog");

  const allPosts = blog.map((post) => ({
    title: post.data.title,
    pubDate: post.data.date,
    description: post.data.tagline,
    link: `/articles/${post.slug}/`,
  }));

  const opts: RSSOptions = {
    title: "The Erika Blog",
    description: "Articles written by Erika.",
    site: context.site,
    items: allPosts,
  };

  return rss(opts);
}
