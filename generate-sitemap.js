import fs from 'fs';

const news = JSON.parse(fs.readFileSync('data/news.json', 'utf8'));
const gallery = JSON.parse(fs.readFileSync('data/gallery.json', 'utf8'));

function generateSlug(title, date) {
    const filename_slug = (title || '').replace(/\s/g, '-').replace(/[^a-zA-Z0-9\u05D0-\u05EA-]/gi, '');
    return `${date}-${filename_slug}`;
}

let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://yt2178.github.io/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>https://yt2178.github.io/assets/social-preview-large.png</image:loc>
      <image:title>ישיבת בית הלוי ראש העין - היכל בית המדרש</image:title>
      <image:caption>היכל בית המדרש המרכזי של ישיבת בית הלוי בראש העין</image:caption>
    </image:image>
  </url>
  <url>
    <loc>https://yt2178.github.io/#about</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://yt2178.github.io/#zmanim</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://yt2178.github.io/#news</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://yt2178.github.io/#gallery</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://yt2178.github.io/#contact</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
`;

news.forEach(item => {
    if (item.data && item.data.title && item.data.date) {
        const slug = encodeURIComponent(generateSlug(item.data.title, item.data.date));
        sitemap += `  <url>
    <loc>https://yt2178.github.io/#news/${slug}</loc>
    <lastmod>${item.data.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>\n`;
    }
});

gallery.forEach(item => {
    if (item.data && item.data.title) {
        const cleanTitle = encodeURIComponent(item.data.title.replace(/\s/g, '-').replace(/[^a-zA-Z0-9\u05D0-\u05EA-]/gi, ''));
        const safeTitle = (item.data.title || '').replace(/[<>&'"]/g, '');
        
        let imageTags = '';
        if (item.data.thumbnail) {
            let thumbUrl = item.data.thumbnail;
            if (thumbUrl.startsWith('assets/')) {
                thumbUrl = `https://yt2178.github.io/${thumbUrl}`;
            }
            imageTags += `\n    <image:image>
      <image:loc>${thumbUrl}</image:loc>
      <image:title>${safeTitle}</image:title>
    </image:image>`;
        }

        sitemap += `  <url>
    <loc>https://yt2178.github.io/#gallery/${cleanTitle}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>${imageTags}
  </url>\n`;
    }
});

sitemap += `</urlset>\n`;

fs.writeFileSync('sitemap.xml', sitemap, 'utf8');
console.log('sitemap.xml regenerated successfully with', news.length, 'news and', gallery.length, 'gallery items.');
