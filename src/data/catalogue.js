"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
exports.__esModule = true;
exports.books = exports.games = void 0;
var matter = require("gray-matter");
var fdir_1 = require("fdir");
var path_1 = require("path");
var games = (function () {
    var files = new fdir_1.fdir()
        .withFullPaths()
        .filter(function (path) { return path.endsWith('.md'); })
        .crawl('./content/catalogue/games')
        .sync();
    var result = [];
    files.forEach(function (file) {
        var markdownData = matter.read(file);
        var slug = (0, path_1.basename)(file, (0, path_1.extname)(file));
        var link = new URL("/catalogue/games/" + slug, 'http://localhost:3000/');
        result.push(__assign({ slug: slug, link: link }, markdownData));
    });
    return result;
})();
exports.games = games;
var books = (function () {
    var files = new fdir_1.fdir()
        .withFullPaths()
        .filter(function (path) { return path.endsWith('.md'); })
        .crawl('./content/catalogue/books')
        .sync();
    var result = [];
    files.forEach(function (file) {
        var markdownData = matter.read(file);
        var slug = (0, path_1.basename)(file, (0, path_1.extname)(file));
        var link = new URL("/catalogue/books/" + slug, 'http://localhost:3000/');
        var type = 'single';
        if (markdownData.data.volumes) {
            type = 'multiple';
        }
        result.push(__assign({ slug: slug, link: link, type: type }, markdownData));
    });
    return result;
})();
exports.books = books;
