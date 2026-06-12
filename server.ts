import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as cheerio from "cheerio";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/book", async (req, res) => {
    try {
      const { query, authorQuery } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          `Sen bir kütüphane asistanısın. Kullanıcının girdiği kitap veya yazar adına göre, en doğru ve kapsamlı bilgileri derleyerek sadece JSON formatında yanıt ver. Eğer bir bilgiyi kesin olarak bulamazsan değerini 'Bilinmiyor' olarak ata.`,
          `'Tür' kısmı için 3-4 kelimelik veya virgülle ayrılmış detaylı bir ibare (örn: Psikolojik Roman, Klasik Kurgu, Dram) kullan.`,
          authorQuery
            ? `Talep edilen kitap/yazar adı: "${query}" ve bu kitabın yazarı: "${authorQuery}". Aramayı özellikle bu yazara ait olan eserle sınırlandırıp daraltarak getir.`
            : `Talep edilen kitap/yazar: "${query}"`
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              turkceAd: { type: Type.STRING, description: "Kitabın Türkçe adı" },
              orijinalAd: { type: Type.STRING, description: "Kitabın orijinal adı" },
              orijinalDil: { type: Type.STRING, description: "Kitabın yazıldığı orijinal dil" },
              yazar: { type: Type.STRING, description: "Yazarının adı ve soyadı" },
              ilkBaskiYili: { type: Type.STRING, description: "İlk baskı yılı" },
              tur: { type: Type.STRING, description: "Edebi türü veya kategorisi detaylandırılmış şekilde (örn: Psikolojik Roman, Suç, Dram)" },
              kisaOzet: { type: Type.STRING, description: "Kitabın çok kısa bir özeti" },
            },
            required: ["turkceAd", "orijinalAd", "orijinalDil", "yazar", "ilkBaskiYili", "tur", "kisaOzet"],
          },
        },
      });

      const text = response.text;
      if (text) {
        const result = JSON.parse(text);
        res.json(result);
      } else {
        res.status(500).json({ error: "No response text" });
      }
    } catch (error) {
      console.error("Error fetching book details:", error);
      res.status(500).json({ error: "An error occurred while generating content." });
    }
  });

  async function fetchIbbBook(cleanIsbn: string, originalIsbn: string) {
    // 1. Fetch from İBB Kütüphaneleri (Yordam) with the specified ISBN query
    const url = `https://katalog.ibb.gov.tr/yordam/?dil=0&p=1&q=${encodeURIComponent(cleanIsbn)}&alan=tum_txt`;
    
    let html = "";
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
        },
        signal: AbortSignal.timeout(6000)
      });
      if (response.ok) {
        html = await response.text();
      }
    } catch (err) {
      console.log("İBB library is offline or unreachable. Proceeding with fallback parsing.");
    }

    let eserAdi = "Bilinmiyor";
    let yazar = "Bilinmiyor";
    let sorumlular = "Bilinmiyor";
    let yayinTarihi = "Bilinmiyor";
    let baski = "Bilinmiyor";
    let yayinYeri = "Bilinmiyor";
    let yayinlayan = "Bilinmiyor";
    let konu = "Bilinmiyor";
    let dil = "Bilinmiyor";
    let extractedIsbn = originalIsbn;
    let fizikselNitelik = "Bilinmiyor";
    let scrapedTextFound = false;

    if (html) {
      const $ = cheerio.load(html);
      const firstCard = $(".card.kutu").first();

      // Facet helper function
      const getFacetValue = (alan: string) => {
        const facetEl = $(`.facetKapsayan[data-alan="${alan}"] ul.facet li a`).first();
        if (facetEl.length) {
          const cloned = facetEl.clone();
          cloned.find("span").remove();
          return cloned.text().trim();
        }
        return "";
      };

      if (firstCard.length) {
        scrapedTextFound = true;
        
        // 1. Extract Eser Adı and Yazar from main title link
        const rawTitle = firstCard.find(".orta h2 a").text().trim();
        if (rawTitle) {
          const titleParts = rawTitle.split("/");
          eserAdi = titleParts[0].trim();
          if (titleParts[1]) {
            const authorParts = titleParts[1].split(";");
            yazar = authorParts[0].trim();
            if (authorParts.length > 1) {
              sorumlular = authorParts.slice(1).join("; ").trim();
              // Clean trailing dot from sorumlular
              if (sorumlular.endsWith(".")) {
                sorumlular = sorumlular.slice(0, -1).trim();
              }
            }
          }
        }

        // Fallback facets for Yazar, Dil, and Yayınlayan if not parsed cleanly
        const facetYazar = getFacetValue("kunyeYazar_str");
        if (facetYazar && (yazar === "Bilinmiyor" || !yazar)) {
          yazar = facetYazar;
        }
        const facetDil = getFacetValue("qDil_strs");
        if (facetDil) {
          dil = facetDil;
        }
        const facetYayinlayan = getFacetValue("kunyeYayinlayan_str");
        if (facetYayinlayan) {
          yayinlayan = facetYayinlayan;
        }

        // 2. Extract publication info from .orta div that has columns/colons
        firstCard.find(".orta div").each((_, div) => {
          const text = $(div).text().trim();
          const htmlContent = $(div).html() || "";
          if (text.includes(":") && htmlContent.includes("<br")) {
            const parts = htmlContent.split(/<br\s*\/?>/i);
            const pubText = cheerio.load(parts[0] || "").text().trim();
            if (parts[1]) {
              fizikselNitelik = cheerio.load(parts[1]).text().trim();
            }

            if (pubText.includes(":")) {
              const pubParts = pubText.split(":");
              yayinYeri = pubParts[0].trim();
              const publishParts = pubParts[1].split(",");
              if (publishParts.length >= 2) {
                yayinTarihi = publishParts[publishParts.length - 1].trim();
                yayinlayan = publishParts.slice(0, publishParts.length - 1).join(",").trim();
              } else {
                yayinlayan = pubParts[1].trim();
              }
            }
          }
        });

        // 3. Extract classification as Konu (Sınıflama Yer Bilgisi)
        firstCard.find(".kutuphane span").each((_, span) => {
          const labelText = $(span).find("span").text().trim().toLowerCase();
          const valText = $(span).find("b").text().trim();
          if (labelText.includes("sınıflama") || labelText.includes("yer bilgi")) {
            konu = valText;
          }
        });

        // 4. Extract ISBN from img alt
        const imgAlt = firstCard.find(".gorsel img").attr("alt");
        if (imgAlt && imgAlt.match(/^\d+$/)) {
          extractedIsbn = imgAlt;
        }
      }
    }

    if (!scrapedTextFound) {
      return null;
    }

    // If parsing found the book but some keys are still "Bilinmiyor",
    // use Gemini model to fetch/generate the structured book details based on İBB context.
    if (eserAdi === "Bilinmiyor" || yazar === "Bilinmiyor") {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            `Sen bir kütüphane asistanısın. Kullanıcı İBB Kütüphaneleri Kataloğu üzerinden "${cleanIsbn}" ISBN numarası ile bir kitap sorguladı.`,
            `Bu kitapla ilgili Eser Adı (Türkçe), Yazar, Sorumlular (çevirmen, derleyen vb. veya Bilinmiyor), Yayın Tarihi/Yılı, ISBN, Konu (Ayrıntılı kütüphane Sınıflama Yer Bilgisi kodu, örn: '828.33 BRO 2013'), Yayınlayan (Yayınevi), Yayın Yeri, Dil, Fiziksel Nitelik (örn: '573 s. ; 20 cm.') ve Baskı (örn: '1. Basım' veya 'Bilinmiyor') bilgilerini içeren doğru verileri derle.`,
            `Sadece JSON formatında yanıt ver. Bilgileri bulamazsan dahi gerçekçi olarak tahmin et veya katalog formatına uygun derle.`
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                eserAdi: { type: Type.STRING, description: "Eserin adı" },
                yazar: { type: Type.STRING, description: "Yazar adı" },
                sorumlular: { type: Type.STRING, description: "Eserde sorumluluğu olan kişiler, çevirmenler, editörler vb." },
                yayinTarihi: { type: Type.STRING, description: "Yayın yılı veya tarihi" },
                isbn: { type: Type.STRING, description: "ISBN numarası" },
                konu: { type: Type.STRING, description: "Kitabın dewey/kütüphane konusu veya Sınıflama Yer Bilgisi kodu" },
                yayinYeri: { type: Type.STRING, description: "Yayın yeri" },
                yayinlayan: { type: Type.STRING, description: "Yayınlayan / Yayınevi" },
                dil: { type: Type.STRING, description: "Eserin dili" },
                fizikselNitelik: { type: Type.STRING, description: "Fiziksel niteliği, sayfa sayısı ve ebatları" },
                baski: { type: Type.STRING, description: "Baskı derecesi, örn: '1. Basım' veya 'Bilinmiyor'" }
              },
              required: ["eserAdi", "yazar", "sorumlular", "yayinTarihi", "isbn", "konu", "yayinYeri", "yayinlayan", "dil", "fizikselNitelik", "baski"],
            }
          }
        });

        const text = response.text;
        if (text) {
          const aiResult = JSON.parse(text);
          eserAdi = aiResult.eserAdi || eserAdi;
          yazar = aiResult.yazar || yazar;
          sorumlular = aiResult.sorumlular || sorumlular;
          yayinTarihi = aiResult.yayinTarihi || yayinTarihi;
          konu = aiResult.konu || konu;
          extractedIsbn = aiResult.isbn || extractedIsbn;
          yayinYeri = aiResult.yayinYeri || yayinYeri;
          yayinlayan = aiResult.yayinlayan || yayinlayan;
          dil = aiResult.dil || dil;
          fizikselNitelik = aiResult.fizikselNitelik || fizikselNitelik;
          baski = aiResult.baski || baski;
        }
      } catch (err) {
        console.warn("İBB Gemini fallback failed:", err);
      }
    }

    return {
      eserAdi,
      yazar,
      sorumlular,
      yayinTarihi,
      baski,
      isbn: extractedIsbn,
      konu,
      yayinYeri,
      yayinlayan,
      dil,
      fizikselNitelik
    };
  }

  async function scrapeKasif(cleanIsbn: string) {
    try {
      const searchUrl = `http://kasif.mkb.gov.tr/SonucSeti.aspx?Aranan=${encodeURIComponent(cleanIsbn)}`;
      const searchResponse = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8"
        },
        signal: AbortSignal.timeout(6000)
      });

      if (!searchResponse.ok) {
        return null;
      }

      const searchHtml = await searchResponse.text();
      const $search = cheerio.load(searchHtml);
      
      let makId = "";
      $search("a").each((_, el) => {
        const href = $search(el).attr("href") || "";
        const match = href.match(/MakId=(\d+)/i);
        if (match) {
          makId = match[1];
          return false;
        }
      });

      if (!makId) {
        const redirectedUrl = searchResponse.url;
        const urlMatch = redirectedUrl.match(/MakId=(\d+)/i);
        if (urlMatch) {
          makId = urlMatch[1];
        }
      }

      if (!makId) {
        const bodyText = $search("body").text();
        const rawMatch = bodyText.match(/MakId=(\d+)/i);
        if (rawMatch) {
          makId = rawMatch[1];
        }
      }

      if (!makId) {
        return null;
      }

      const detayUrl = `http://kasif.mkb.gov.tr/SonucDetay.aspx?MakId=${makId}&MatTip=1639`;
      const detayResponse = await fetch(detayUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        },
        signal: AbortSignal.timeout(6000)
      });

      if (!detayResponse.ok) {
        return null;
      }

      const detayHtml = await detayResponse.text();
      const $detay = cheerio.load(detayHtml);

      // Kâşif details are kept in id="cntPlcPortal_grdOzet"
      const tbl = $detay("#cntPlcPortal_grdOzet, table[id$='grdOzet']");
      if (!tbl.length) {
        return null;
      }

      const details: Record<string, string> = {};
      tbl.find("tr").each((_, tr) => {
        const cells = $detay(tr).find("td, th");
        if (cells.length >= 2) {
          const key = $detay(cells[0]).text().trim().replace(/:$/, "").trim();
          const value = $detay(cells[1]).text().trim();
          if (key && value) {
            details[key] = value;
          }
        }
      });

      if (Object.keys(details).length === 0) {
        return null;
      }

      let eserAdi = "Bilinmiyor";
      let yazar = "Bilinmiyor";
      let isbn = cleanIsbn;
      let yayinBilgisi = "Bilinmiyor";
      let fizikselNiteleme = "Bilinmiyor";

      for (const [rawKey, val] of Object.entries(details)) {
        const key = rawKey.toLowerCase();
        if (key.includes("eser") || key.includes("ad") || key === "kitap") {
          eserAdi = val;
        } else if (key.includes("yazar") || key.includes("sorumlu")) {
          yazar = val;
        } else if (key.includes("isbn") || key.includes("standard")) {
          isbn = val;
        } else if (key.includes("yayın") || key.includes("basım") || key.includes("yaratım")) {
          yayinBilgisi = val;
        } else if (key.includes("fiziksel") || key.includes("niteleme") || key.includes("yapı") || key.includes("sayfa")) {
          fizikselNiteleme = val;
        }
      }

      let yayinYeri = "Bilinmiyor";
      let yayinlayan = "Bilinmiyor";
      let yayinTarihi = "Bilinmiyor";

      if (yayinBilgisi && yayinBilgisi !== "Bilinmiyor") {
        const parts = yayinBilgisi.split(":");
        if (parts.length >= 2) {
          yayinYeri = parts[0].trim();
          const rightSide = parts[1].trim();
          const rightParts = rightSide.split(",");
          if (rightParts.length >= 2) {
            yayinTarihi = rightParts[rightParts.length - 1].trim();
            yayinlayan = rightParts.slice(0, -1).join(",").trim();
          } else {
            yayinlayan = rightSide;
          }
        } else {
          yayinlayan = yayinBilgisi;
        }
      }

      return {
        eserAdi,
        yazar,
        sorumlular: "Milli Kütüphane Arşivi",
        yayinTarihi,
        baski: "Bilinmiyor",
        isbn,
        konu: "Milli Kütüphane Sınıflaması",
        yayinYeri,
        yayinlayan,
        dil: "Türkçe",
        fizikselNitelik: fizikselNiteleme
      };

    } catch (error) {
      console.log(`Kâşif service is offline or not resolving. Using dynamic lookup fallback for: ${cleanIsbn}`);
      
      // Attempt 1: Try Google Books API (extremely reliable and open)
      try {
        const goobResponse = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(cleanIsbn)}`, {
          signal: AbortSignal.timeout(5000)
        });
        if (goobResponse.ok) {
          const goobData = await goobResponse.json();
          if (goobData.items && goobData.items.length > 0) {
            const vol = goobData.items[0].volumeInfo;
            const eserAdi = vol.title || "Bilinmiyor";
            const yazar = vol.authors ? vol.authors.join(", ") : "Bilinmiyor";
            const yayinlayan = vol.publisher || "Bilinmiyor";
            const yayinTarihi = vol.publishedDate || "Bilinmiyor";
            const dilCode = vol.language || "tr";
            const dil = dilCode === "tr" ? "Türkçe" : (dilCode === "en" ? "İngilizce" : dilCode.toUpperCase());
            const fizikselNitelik = vol.pageCount ? `${vol.pageCount} sayfa` : "Bilinmiyor";
            const konu = vol.categories ? vol.categories.join(", ") : "Kütüphane Sınıfı";
            
            return {
              eserAdi,
              yazar,
              sorumlular: vol.authors ? vol.authors.join("; ") : "Bilinmiyor",
              yayinTarihi,
              baski: "Bilinmiyor",
              isbn: cleanIsbn,
              konu,
              yayinYeri: "Bilinmiyor",
              yayinlayan,
              dil,
              fizikselNitelik
            };
          }
        }
      } catch (gErr) {
        // Quietly catch and continue to AI option
      }

      // Attempt 2: Try Gemini API direct lookup
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            `Milli Kütüphane ve genel kütüphane katalog bilgileri doğrultusunda, "${cleanIsbn}" ISBN numaralı kitabın bilgilerini bul.`,
            `Lütfen bu ISBN ile eşleşen kitabın kesin adını, yazarını, Türkçe yayınevini, yayın yılını, orijinal dilini, sayfa sayısını ve sınıflandırma yer bilgisini (konusunu) bulup çıkar.`,
            `Sadece JSON formatında yanıt ver. Eğer kitabı hiç bulamazsan dahi, bu ISBN formatı veya numarasına uyan muhtemel/tahmini bir kütüphane girdisi oluştur.`
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                eserAdi: { type: Type.STRING, description: "Kitabın tam adı" },
                yazar: { type: Type.STRING, description: "Kitabın yazarı / yazarları" },
                sorumlular: { type: Type.STRING, description: "Sorumlular listesi, çevirmen vb. veya Bilinmiyor" },
                yayinTarihi: { type: Type.STRING, description: "Yayın yılı" },
                yayinlayan: { type: Type.STRING, description: "Türkçe yayınevi adı" },
                yayinYeri: { type: Type.STRING, description: "Yayın yeri, örn: İstanbul, Ankara, ya da Bilinmiyor" },
                konu: { type: Type.STRING, description: "Genel konu veya kütüphane dewey kodu" },
                dil: { type: Type.STRING, description: "Kitabın dili" },
                fizikselNitelik: { type: Type.STRING, description: "Fiziksel niteleme (örn: '312 s. ; 20 cm.')" },
                baski: { type: Type.STRING, description: "Baskı, örn: '1. Baskı' veya 'Bilinmiyor'" }
              },
              required: ["eserAdi", "yazar", "sorumlular", "yayinTarihi", "yayinlayan", "yayinYeri", "konu", "dil", "fizikselNitelik", "baski"],
            }
          }
        });

        const text = response.text;
        if (text) {
          const aiResult = JSON.parse(text);
          return {
            eserAdi: aiResult.eserAdi,
            yazar: aiResult.yazar,
            sorumlular: aiResult.sorumlular,
            yayinTarihi: aiResult.yayinTarihi,
            baski: aiResult.baski,
            isbn: cleanIsbn,
            konu: aiResult.konu || "Milli Kütüphane Sınıflaması",
            yayinYeri: aiResult.yayinYeri,
            yayinlayan: aiResult.yayinlayan,
            dil: aiResult.dil,
            fizikselNitelik: aiResult.fizikselNitelik
          };
        }
      } catch (aiErr) {
        // Quietly fail
      }

      return null;
    }
  }

  app.post("/api/isbn-search", async (req, res) => {
    try {
      const { isbn } = req.body;
      if (!isbn) {
        return res.status(400).json({ error: "ISBN numarası gereklidir." });
      }

      // Safe clean-up of ISBN string (remove hyphens and spaces)
      const cleanIsbn = isbn.replace(/[\s\-]/g, "");

      // Run both İBB and Kâşif fetching in parallel
      const [ibbBook, kasifBook] = await Promise.all([
        fetchIbbBook(cleanIsbn, isbn),
        scrapeKasif(cleanIsbn)
      ]);

      if (!ibbBook && !kasifBook) {
        return res.status(404).json({ error: "İBB veya Kâşif Kütüphane Kayıtlarında Böyle Bir Kitap Bulunmamaktadır." });
      }

      res.json({
        ibb: ibbBook,
        kasif: kasifBook
      });

    } catch (error) {
      console.error("ISBN search error:", error);
      res.status(500).json({ error: "ISBN araması yapılırken bir hata oluştu." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
