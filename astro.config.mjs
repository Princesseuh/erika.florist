export default /** @type {import('astro').AstroUserConfig} */ ({
  public: "./static",
  buildOptions: {
    site: "https://princesseuh.netlify.app/",
  },
  renderers: [],
  vite: {
    ssr: {
      external: ["svgo"],
    },
    plugins: [],
    resolve: {
      alias: {
        $components: "/src/components",
        $data: "/src/data",
        $layouts: "/src/layouts",
        $theme: "/src/theme",
        $types: "/src/types",
        $utils: "/src/utils",
        $content: "/src/content",
      },
    },
  },
})
