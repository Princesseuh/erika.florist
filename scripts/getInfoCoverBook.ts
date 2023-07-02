import matter from "gray-matter";
import { bold, gray } from "kleur/colors";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Logger, getContentDirs } from "./catalogueUtils";

interface OpenLibraryData {
  bib_key: string;
  info_url: string;
  preview: string;
  preview_url: string;
  thumbnail_url: string;
  details: {
    publishers: string[];
    subtitle: string;
    title: string;
    number_of_pages: number;
    publish_date: string;
    authors: { name: string; key: string }[];
    contributors: { name: string; role: string }[];
  };
}

export async function getDataForBooks() {
  const booksDirs = getContentDirs("books");

  for (const bookDir of booksDirs) {
    const dirBasename = path.basename(decodeURI(bookDir.pathname));
    Logger.info(`Getting data for ${bold(dirBasename)}...`);
    const dataFilePath = new URL("./_data.json", bookDir);
    if (fs.existsSync(dataFilePath)) {
      Logger.info(gray(`Data already exists, skipping...`));
      continue;
    }

    const markdownContent = fs.readFileSync(new URL(dirBasename + ".md", bookDir)).toString();
    const isbn = matter(markdownContent).data.isbn;
    const response = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=details&format=json`,
    ).then((response) => response.json());
    const responseData = response[`ISBN:${isbn}`] as OpenLibraryData;
    const resultData = {
      title: responseData.details.title,
      subtitle: responseData.details.subtitle,
      authors: responseData?.details?.authors
        ?.map((author) => author.name)
        .filter(
          (author) =>
            !responseData?.details?.contributors?.some(
              (contributor) =>
                contributor.name === author && contributor.role.toLowerCase() === "translator",
            ),
        ),
      contributors: responseData.details.contributors,
      publishers: responseData.details.publishers,
      pages: responseData.details.number_of_pages,
      publishDate: Math.floor(new Date(responseData.details.publish_date).getTime() / 1000),
    };

    fs.writeFileSync(dataFilePath, JSON.stringify(resultData, null, 2));
    Logger.success(`Data saved for ${bold(dirBasename)}!`);

    if (!responseData.thumbnail_url) {
      Logger.warn(`No cover found for ${bold(dirBasename)}, skipping...`);
      continue;
    }

    const coverURL = responseData.thumbnail_url.replace("-S", "-L");
    const coverData = await (await fetch(coverURL)).arrayBuffer();

    const coverPath = new URL("./cover.png", bookDir);
    if (!coverURL.endsWith("png")) {
      sharp(coverData).toFile(coverPath.pathname);
    } else {
      fs.writeFileSync(coverPath, Buffer.from(coverData));
    }
    Logger.success(`Cover saved for ${dirBasename}!`);
  }

  return booksDirs.length;
}
