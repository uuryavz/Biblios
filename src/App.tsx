/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Search, BookDashed, Loader2, Copy, Check, Settings, History, SlidersHorizontal, Plus, Users, HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BookDetails {
  turkceAd: string;
  orijinalAd: string;
  orijinalDil: string;
  yazar: string;
  ilkBaskiYili: string;
  tur: string;
  kisaOzet: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch(err) {
      console.error(err);
    }
  };
  return (
    <button onClick={handleCopy} className="text-zinc-400 hover:text-zinc-700 transition-colors opacity-40 hover:opacity-100 flex-shrink-0 focus:outline-none" title="Kopyala">
      {copied ? <Check className="w-3.5 h-3.5 text-black" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function capitalizeWords(str: string | undefined | null): string {
  if (!str || str.toLowerCase() === 'bilinmiyor') return 'Bilinmiyor';
  
  return str
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => {
      if (!word) return '';
      let first = word.charAt(0);
      let rest = word.slice(1);
      
      // Turkish special casing
      if (first === 'i') first = 'İ';
      else if (first === 'ı') first = 'I';
      else if (first === 'ş') first = 'Ş';
      else if (first === 'ğ') first = 'Ğ';
      else if (first === 'ü') first = 'Ü';
      else if (first === 'ö') first = 'Ö';
      else if (first === 'ç') first = 'Ç';
      else first = first.toUpperCase();
      
      const lowercaseRest = rest.split('').map(char => {
        if (char === 'I') return 'ı';
        if (char === 'İ') return 'i';
        if (char === 'Ş') return 'ş';
        if (char === 'Ğ') return 'ğ';
        if (char === 'Ü') return 'ü';
        if (char === 'Ö') return 'ö';
        if (char === 'Ç') return 'ç';
        return char.toLowerCase();
      }).join('');
      
      return first + lowercaseRest;
    })
    .join(' ');
}

interface Contributor {
  role: string;
  name: string;
}

function parseSorumlular(sorumlularStr: string | undefined | null): Contributor[] {
  if (!sorumlularStr || sorumlularStr.toLowerCase() === 'bilinmiyor') return [];
  
  // Split by semicolon
  const parts = sorumlularStr.split(/[;]/).map(p => p.trim()).filter(Boolean);
  const results: Contributor[] = [];
  
  const roleMappings = [
    { keys: ['çev.', 'çeviren', 'çevirmen', 'çev'], title: 'Çevirmen' },
    { keys: ['ed.', 'editör', 'editor', 'ed'], title: 'Editör' },
    { keys: ['haz.', 'hazırlayan', 'haz'], title: 'Hazırlayan' },
    { keys: ['der.', 'derleyen', 'der'], title: 'Derleyen' },
    { keys: ['res.', 'resimleyen', 'res'], title: 'Resimleyen' },
    { keys: ['katkı', 'katkıda bulunan'], title: 'Katkıda Bulunan' }
  ];
  
  for (const part of parts) {
    let matched = false;
    for (const mapping of roleMappings) {
      for (const key of mapping.keys) {
        const lowerPart = part.toLowerCase();
        const keyLower = key.toLowerCase();
        
        if (lowerPart.startsWith(keyLower + ' ') || lowerPart.startsWith(keyLower + ':') || lowerPart.includes(' ' + keyLower + ' ') || lowerPart.includes('(' + keyLower + ')')) {
          const regex = new RegExp(key.replace('.', '\\.'), 'i');
          const nameOnly = part.replace(regex, '').replace(/^[:\s\-\.]+|[:\s\-\.]+$/g, '').trim();
          if (nameOnly) {
            results.push({
              role: mapping.title,
              name: capitalizeWords(nameOnly)
            });
            matched = true;
            break;
          }
        }
      }
      if (matched) break;
    }
    if (!matched) {
      if (part.includes(':')) {
        const [rolePart, namePart] = part.split(':');
        if (rolePart && namePart) {
          results.push({
            role: capitalizeWords(rolePart.trim()),
            name: capitalizeWords(namePart.trim())
          });
          matched = true;
        }
      }
      if (!matched) {
        results.push({
          role: 'Katkıda Bulunan',
          name: capitalizeWords(part)
        });
      }
    }
  }
  
  return results;
}

function getDerivedGenre(konu: string | undefined | null, eserAdi: string | undefined | null): string {
  const text = ((konu || '') + ' ' + (eserAdi || '')).toLowerCase();
  if (text.includes('şema terapi') || text.includes('terapi') || text.includes('psikoloji') || text.includes('kişilik')) {
    return 'Psikoloji / Psikoterapi';
  }
  if (text.includes('roman') || text.includes('hikaye') || text.includes('edebiyat') || text.includes('şiir') || text.includes('öykü')) {
    return 'Edebiyat / Kurgu';
  }
  if (text.includes('felsefe') || text.includes('düşünce')) {
    return 'Felsefe / Düşünce';
  }
  if (text.includes('tarih') || text.includes('arkeoloji')) {
    return 'Tarih / Araştırma';
  }
  if (text.includes('sosyoloji') || text.includes('toplum')) {
    return 'Sosyal Bilimler / Sosyoloji';
  }
  if (text.includes('çocuk') || text.includes('masal')) {
    return 'Çocuk Kitapları';
  }
  
  if (konu) {
    const deweyMatch = konu.match(/\d{3}/);
    if (deweyMatch) {
      const code = deweyMatch[0];
      if (code.startsWith('1')) return 'Felsefe ve Psikoloji';
      if (code.startsWith('2')) return 'Din / Teoloji';
      if (code.startsWith('3')) return 'Sosyal Bilimler';
      if (code.startsWith('4')) return 'Dil ve Dilbilim';
      if (code.startsWith('5')) return 'Doğa Bilimleri ve Matematik';
      if (code.startsWith('6')) return 'Teknoloji / Uygulamalı Bilimler';
      if (code.startsWith('7')) return 'Güzel Sanatlar ve Spor';
      if (code.startsWith('8')) return 'Edebiyat / Roman';
      if (code.startsWith('9')) return 'Tarih ve Coğrafya';
    }
  }

  return 'Kütüphane Kaynağı (Akademik / İnceleme)';
}

export default function App() {
  const [query, setQuery] = useState('');
  const [authorQuery, setAuthorQuery] = useState('');
  const [showAuthorInput, setShowAuthorInput] = useState(false);
  const [bookDetails, setBookDetails] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailedSearchOpen, setDetailedSearchOpen] = useState(false);
  const [isbnQuery, setIsbnQuery] = useState('');
  const [isbnLoading, setIsbnLoading] = useState(false);
  const [isbnDetails, setIsbnDetails] = useState<any | null>(null);
  const [activeIsbnSource, setActiveIsbnSource] = useState<'ibb' | 'kasif'>('ibb');

  const searchByIsbn = async () => {
    if (!isbnQuery) return;
    setIsbnLoading(true);
    setError(null);
    setIsbnDetails(null);
    setBookDetails(null);
    
    try {
      const response = await fetch('/api/isbn-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbn: isbnQuery })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "İBB veya Kâşif Kütüphane Kayıtlarında Böyle Bir Kitap Bulunmamaktadır.");
      }

      const data = await response.json();
      setIsbnDetails(null); // Clear completely right before assigning new taze values
      setIsbnDetails(data);
      if (data.ibb) {
        setActiveIsbnSource('ibb');
      } else if (data.kasif) {
        setActiveIsbnSource('kasif');
      }
    } catch (error: any) {
      console.error("ISBN aranırken hata oluştu", error);
      setError(error.message || "İBB veya Kâşif Kütüphane Kayıtlarında Böyle Bir Kitap Bulunmamaktadır.");
    } finally {
      setIsbnLoading(false);
    }
  };

  const searchBook = async () => {
    if (!query) return;
    setLoading(true);
    setError(null);
    setBookDetails(null);
    setIsbnDetails(null);
    setDetailedSearchOpen(false);
    
    try {
      const response = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query,
          authorQuery: showAuthorInput ? authorQuery : ''
        })
      });

      if (!response.ok) {
        throw new Error('Bir hata oluştu');
      }

      const data = await response.json();
      setBookDetails(data);
      
    } catch (error) {
      console.error("Kitap aranırken hata oluştu", error);
      setError("Kitap bilgileri getirilirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const isSearched = loading || bookDetails !== null || error !== null || isbnLoading || isbnDetails !== null;

  return (
    <div className="w-full min-h-screen bg-stone-50 text-zinc-900 font-sans overflow-x-hidden relative flex flex-col items-center z-0 pt-24 pb-20">
      
      {/* Top Header Bant */}
      <div className="w-full h-16 sm:h-20 bg-white/70 backdrop-blur-xl border-b border-zinc-200/80 fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10 shadow-[0_4px_30px_rgba(0,0,0,0.03)]">
        {/* Logo (Left) */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-md">
            <BookDashed className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-widest text-black">BİBLİOS</h1>
            <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold leading-none">Dijital Arşiv</p>
          </div>
        </div>

        {/* Action Buttons (Right) */}
        <div className="flex items-center gap-1 sm:gap-3">
          <button 
            onClick={() => setDetailedSearchOpen(!detailedSearchOpen)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-xs font-bold uppercase tracking-wider ${detailedSearchOpen ? 'bg-black text-white hover:bg-zinc-800' : 'text-zinc-500 hover:text-black hover:bg-zinc-100/80'}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Detaylı Arama</span>
          </button>
          <button className="p-2 text-zinc-500 hover:text-black hover:bg-zinc-100/80 rounded-lg transition-colors" title="Geçmiş">
            <History className="w-5 h-5" />
          </button>
          <button className="p-2 text-zinc-500 hover:text-black hover:bg-zinc-100/80 rounded-lg transition-colors" title="Ayarlar">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area (Animated positioning) */}
      <motion.div 
        className="w-full max-w-2xl flex flex-col items-center z-10 px-6 sm:px-10"
        initial={false}
        animate={{ 
          marginTop: isSearched ? "2rem" : "25vh" 
        }}
        transition={{ type: "spring", bounce: 0.1, duration: 0.7 }}
      >
        {/* Search Interface */}
        <AnimatePresence mode="wait">
          {!detailedSearchOpen ? (
            <motion.div 
              key="simple-search"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.2 }}
              className="w-full flex flex-col gap-3 relative group"
            >
              <div className="w-full relative">
                <input 
                  type="text" 
                  placeholder="Kitap veya yazar adı girin..." 
                  className="w-full bg-white border border-zinc-200/80 shadow-md rounded-2xl py-4 sm:py-5 pl-14 sm:pl-16 pr-44 sm:pr-52 text-lg sm:text-xl outline-none focus:ring-4 focus:ring-zinc-100 transition-all placeholder:text-zinc-400 text-zinc-900 font-medium"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchBook()}
                />
                <div className="absolute left-5 sm:left-6 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                  <Search className="w-6 h-6" />
                </div>
                <div className="absolute right-2 sm:right-3 top-2 sm:top-3 bottom-2 sm:bottom-3 flex items-center gap-2">
                  <button 
                    onClick={() => setShowAuthorInput(!showAuthorInput)}
                    className={`h-full px-3 sm:px-4 rounded-xl border transition-colors flex items-center justify-center ${showAuthorInput ? 'bg-zinc-100 border-zinc-300 text-black' : 'bg-zinc-50 hover:bg-zinc-100/80 border-zinc-200/80 text-zinc-500'}`}
                    title="Yazar Ekle (Aramayı Detaylandır)"
                    type="button"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={searchBook}
                    disabled={loading || !query.trim()}
                    className="bg-black hover:bg-zinc-800 text-white px-5 sm:px-6 h-full rounded-xl font-bold transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-md text-sm sm:text-base whitespace-nowrap"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sorgula'}
                  </button>
                </div>
              </div>

              {/* Author Refinement Area */}
              <AnimatePresence>
                {showAuthorInput && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: -6 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 0 }}
                    exit={{ opacity: 0, height: 0, marginTop: -6 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                    className="w-full relative overflow-visible flex items-center gap-2"
                  >
                    <div className="relative flex-1">
                      <input 
                        type="text" 
                        placeholder="Yazarın Adı (Aramayı daraltmak için yazın...)" 
                        className="w-full bg-white border border-zinc-200/80 shadow-sm rounded-xl py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-zinc-150 transition-all placeholder:text-zinc-400 text-zinc-800 font-medium"
                        value={authorQuery}
                        onChange={(e) => setAuthorQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchBook()}
                      />
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                        <Users className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Question Mark Tooltip Box */}
                    <div className="relative flex-shrink-0 group/tooltip">
                      <button 
                        type="button"
                        className="w-10 h-10 rounded-xl bg-white border border-zinc-200/80 hover:bg-zinc-50 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-colors shadow-sm focus:outline-none"
                      >
                        <HelpCircle className="w-5 h-5" />
                      </button>
                      
                      {/* Tooltip text box on hover */}
                      <div className="absolute right-0 bottom-12 z-50 pointer-events-none opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-200 w-64 bg-black text-white text-xs font-semibold p-3 rounded-lg shadow-xl border border-zinc-800 text-center">
                        Aramayı detaylandırmak için yazar ekleyiniz.
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div 
              key="detailed-search"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.2 }}
              className="w-full bg-white border border-zinc-200/80 shadow-md rounded-2xl p-5 flex flex-col gap-3 relative"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2 mb-1">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-black" />
                  <span className="text-xs font-bold text-black tracking-wider uppercase">İBB Kütüphaneleri Detaylı ISBN Arama</span>
                </div>
                <button 
                  onClick={() => setDetailedSearchOpen(false)}
                  className="text-[10px] font-bold text-zinc-400 hover:text-black uppercase"
                >
                  Basit Arama'ya Dön
                </button>
              </div>

              <div className="relative">
                <input 
                  type="text" 
                  placeholder="ISBN numarası ile arayın... (Örn: 9789752116832)" 
                  className="w-full bg-zinc-55 border border-zinc-200 shadow-sm rounded-xl py-3 pl-12 pr-28 text-sm outline-none focus:ring-4 focus:ring-zinc-100 transition-all placeholder:text-zinc-400 text-zinc-900 font-medium"
                  value={isbnQuery}
                  onChange={(e) => setIsbnQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchByIsbn()}
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                  <BookDashed className="w-5 h-5" />
                </div>
                <button 
                  onClick={searchByIsbn}
                  disabled={isbnLoading || !isbnQuery.trim()}
                  className="absolute right-2 top-2 bottom-2 bg-black hover:bg-zinc-800 text-white px-5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow"
                >
                  {isbnLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sorgula'}
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 font-medium leading-normal">
                Bu özellik, İstanbul Büyükşehir Belediyesi (İBB) Kütüphaneleri veri tabanını kullanarak ISBN üzerinden gerçek zamanlı kütüphane kataloglarını tarar.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!isSearched && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="flex gap-3 sm:gap-4 flex-wrap mt-6 justify-center text-[11px] sm:text-xs text-zinc-400 font-bold tracking-wide uppercase"
            >
              <span>Popüler Aramalar:</span>
              <button onClick={() => setQuery('Sefiller')} className="hover:text-black transition-colors">Sefiller</button>
              <span>•</span>
              <button onClick={() => setQuery('1984')} className="hover:text-black transition-colors">1984</button>
              <span>•</span>
              <button onClick={() => setQuery('Dune')} className="hover:text-black transition-colors">Dune</button>
              <span>•</span>
              <button onClick={() => setQuery('Küçük Prens')} className="hover:text-black transition-colors">Küçük Prens</button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="z-10 mt-8 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100 max-w-2xl w-full flex items-center justify-center text-center font-medium"
          >
            {error}
          </motion.div>
        )}

        {bookDetails && (
          <motion.div 
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: 0.1, type: "spring", bounce: 0, duration: 0.6 }}
            className="z-10 w-full max-w-3xl mt-12 mb-12 px-6 sm:px-10"
          >
            <div className="bg-white border border-zinc-200/80 rounded-[32px] p-6 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row gap-8 sm:gap-10">
              
              {/* Book Cover Placeholder */}
              <div className="w-full sm:w-48 h-64 sm:h-72 bg-gradient-to-br from-zinc-50 to-zinc-100 rounded-2xl flex-shrink-0 border border-zinc-200/80 flex flex-col items-center justify-center relative overflow-hidden shadow-sm p-4 text-center">
                <div className="w-12 h-1.5 bg-zinc-300 mx-auto mb-4 rounded-full"></div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 break-words line-clamp-2 z-10 mb-2">{bookDetails.yazar}</p>
                <p className="text-base font-serif italic text-zinc-700 break-words line-clamp-3 z-10">{bookDetails.orijinalAd}</p>
              </div>

              {/* Book Details */}
              <div className="flex-1 flex flex-col">
                <div className="mb-6 border-b border-zinc-100 pb-6 sm:border-none sm:pb-0">
                  <h2 className="text-3xl sm:text-4xl font-bold text-black mb-2 leading-tight flex items-center gap-3">
                    {bookDetails.turkceAd}
                    <CopyButton text={bookDetails.turkceAd} />
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-y-6 gap-x-8 mb-8">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Yazar</p>
                      <CopyButton text={bookDetails.yazar} />
                    </div>
                    <p className="text-zinc-800 text-sm font-semibold">{bookDetails.yazar}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Orijinal Ad</p>
                      <CopyButton text={bookDetails.orijinalAd} />
                    </div>
                    <p className="text-zinc-800 text-sm font-semibold">{bookDetails.orijinalAd}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Orijinal Dil</p>
                      <CopyButton text={bookDetails.orijinalDil} />
                    </div>
                    <p className="text-zinc-800 text-sm font-semibold">{bookDetails.orijinalDil}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">İlk Baskı Yılı</p>
                      <CopyButton text={bookDetails.ilkBaskiYili} />
                    </div>
                    <p className="text-zinc-800 text-sm font-semibold">{bookDetails.ilkBaskiYili}</p>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Tür</p>
                      <CopyButton text={bookDetails.tur} />
                    </div>
                    <p className="text-zinc-800 text-xs font-bold tracking-wide uppercase inline-block bg-zinc-100 py-1.5 px-3 rounded-lg border border-zinc-200">{bookDetails.tur}</p>
                  </div>
                </div>

                <div className="mt-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Kısa Özet</p>
                    <CopyButton text={bookDetails.kisaOzet} />
                  </div>
                  <div className="bg-zinc-50 rounded-2xl p-5 border border-zinc-100">
                    <p className="text-zinc-600 italic text-sm leading-relaxed">
                      "{bookDetails.kisaOzet}"
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {isbnDetails && (() => {
          const activeDetails = activeIsbnSource === 'ibb'
            ? (isbnDetails.ibb || isbnDetails.kasif)
            : (isbnDetails.kasif || isbnDetails.ibb);

          if (!activeDetails) return null;

          const hasIbb = !!isbnDetails.ibb;
          const hasKasif = !!isbnDetails.kasif;
          const canToggle = hasIbb && hasKasif;

          const derivedTur = getDerivedGenre(activeDetails.konu, activeDetails.eserAdi);
          const gridItems = [
            { label: "Eser Adı", value: capitalizeWords(activeDetails.eserAdi) },
            { label: "Yazar", value: capitalizeWords(activeDetails.yazar) }
          ];

          // Parse detailed contributors and map them to their correct roles
          const contributors = parseSorumlular(activeDetails.sorumlular);
          if (contributors.length > 0) {
            contributors.forEach(contrib => {
              gridItems.push({ label: contrib.role, value: contrib.name });
            });
          } else {
            gridItems.push({ label: "Sorumlular", value: "Bilinmiyor" });
          }

          // Add remaining fields (without "Konu" - "KONU BAŞLIĞI KAPATILSIN")
          gridItems.push(
            { label: "Yayın Tarihi", value: capitalizeWords(activeDetails.yayinTarihi) },
            { label: "Yayın Yeri", value: capitalizeWords(activeDetails.yayinYeri) },
            { label: "Yayınlayan", value: capitalizeWords(activeDetails.yayinlayan) },
            { label: "Dil", value: capitalizeWords(activeDetails.dil) },
            { label: "ISBN", value: capitalizeWords(activeDetails.isbn) },
            { label: "Fiziksel Nitelik", value: capitalizeWords(activeDetails.fizikselNitelik) },
            { label: "Baskı", value: capitalizeWords(activeDetails.baski) },
            { label: "Sınıflama Yer Bilgisi", value: capitalizeWords(activeDetails.konu) }
          );

          return (
            <motion.div 
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: 0.1, type: "spring", bounce: 0, duration: 0.6 }}
              className="z-10 w-full max-w-5xl mt-12 mb-12 px-6 sm:px-10"
            >
              <div className="bg-white border border-zinc-200/80 rounded-[32px] p-6 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row gap-8 sm:gap-10">
                
                {/* Book Cover Placeholder */}
                <div className="w-full sm:w-48 h-64 sm:h-72 bg-gradient-to-br from-zinc-50 to-zinc-100 rounded-2xl flex-shrink-0 border border-zinc-200/80 flex flex-col items-center justify-center relative overflow-hidden shadow-sm p-4 text-center">
                  <div className="w-12 h-1.5 bg-zinc-300 mx-auto mb-4 rounded-full"></div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 break-words line-clamp-2 z-10 mb-2">{capitalizeWords(activeDetails.yazar)}</p>
                  <p className="text-base font-serif italic text-zinc-700 break-words line-clamp-3 z-10">{capitalizeWords(activeDetails.eserAdi)}</p>
                </div>

                {/* Book Details */}
                <div className="flex-1 flex flex-col">
                  <div className="mb-6 border-b border-zinc-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        {activeIsbnSource === 'ibb' && isbnDetails.ibb ? (
                          <span className="inline-block bg-black text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">İBB Kütüphaneleri</span>
                        ) : (
                          <span className="inline-block bg-amber-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Milli Kütüphane (Kâşif)</span>
                        )}
                        {!isbnDetails.ibb && (
                          <span className="inline-block bg-red-100 text-red-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">İBB'de Yok</span>
                        )}
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-black mb-1 leading-tight flex items-center gap-3">
                        {capitalizeWords(activeDetails.eserAdi)}
                        <CopyButton text={capitalizeWords(activeDetails.eserAdi)} />
                      </h2>
                    </div>

                    {/* Carousel Navigation */}
                    {canToggle && (
                      <div className="flex items-center gap-2 bg-zinc-100 p-1.5 rounded-xl self-start sm:self-center shrink-0 shadow-sm border border-zinc-200/50">
                        <button
                          type="button"
                          onClick={() => setActiveIsbnSource(activeIsbnSource === 'ibb' ? 'kasif' : 'ibb')}
                          className="p-1 hover:bg-white text-zinc-500 hover:text-black rounded-lg transition-all focus:outline-none"
                          title="Önceki Kaynak (İBB / Kâşif)"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] font-black tracking-widest text-zinc-500 min-w-[70px] text-center uppercase">
                          {activeIsbnSource === 'ibb' ? 'İBB (1/2)' : 'KÂŞİF (2/2)'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveIsbnSource(activeIsbnSource === 'ibb' ? 'kasif' : 'ibb')}
                          className="p-1 hover:bg-white text-zinc-500 hover:text-black rounded-lg transition-all focus:outline-none"
                          title="Sonraki Kaynak (İBB / Kâşif)"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                    {gridItems.map((item, index) => (
                      <div key={index} className="flex flex-col justify-between py-2 border-b border-zinc-100/50 min-h-[70px]">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-extrabold">
                            {item.label}
                          </span>
                          <CopyButton text={item.value || "Bilinmiyor"} />
                        </div>
                        <p className="text-zinc-800 text-xs font-semibold leading-relaxed break-words line-clamp-2">
                          {item.value || "Bilinmiyor"}
                        </p>
                      </div>
                    ))}

                    {/* Full Width "Tür" Banner block at the bottom */}
                    <div className="col-span-1 sm:col-span-2 lg:col-span-4 mt-6 pt-5 border-t border-zinc-100">
                      <div className="flex items-center gap-2 mb-1.5">
                        <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Tür</p>
                        <CopyButton text={derivedTur} />
                      </div>
                      <p className="text-zinc-800 text-xs font-bold tracking-wide uppercase inline-block bg-zinc-100 py-1.5 px-3 rounded-lg border border-zinc-200">
                        {derivedTur}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Bottom Footer Bant */}
      <div className="w-full h-12 bg-white/70 backdrop-blur-xl border-t border-zinc-200/80 fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10">
        <div className="text-[10px] text-zinc-400 font-medium">
          Bu veriler tarayıcı derlemesidir, hata olabilir.
        </div>
        <div className="text-[24px] font-black tracking-tighter text-zinc-200 select-none opacity-50">
          UY
        </div>
      </div>
    </div>
  );
}
