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
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>https://yt2178.github.io/assets/social-preview-large.png</image:loc>
      <image:title>ישיבת בית הלוי ראש העין - היכל בית המדרש</image:title>
      <image:caption>היכל בית המדרש המרכזי של ישיבת בית הלוי בראש העין</image:caption>
    </image:image>
`;

gallery.forEach(item => {
    if (item.data && item.data.title && item.data.thumbnail) {
        let thumbUrl = item.data.thumbnail;
        if (thumbUrl.startsWith('assets/')) {
            thumbUrl = `https://yt2178.github.io/${thumbUrl}`;
        }
        const safeTitle = (item.data.title || '').replace(/[<>&'"]/g, '');
        sitemap += `    <image:image>
      <image:loc>${thumbUrl}</image:loc>
      <image:title>${safeTitle}</image:title>
    </image:image>\n`;
    }
});

sitemap += `  </url>
</urlset>\n`;

fs.writeFileSync('sitemap.xml', sitemap, 'utf8');
console.log('sitemap.xml regenerated successfully with', news.length, 'news and', gallery.length, 'gallery items.');
