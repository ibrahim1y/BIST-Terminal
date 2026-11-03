// React kütüphanesini içe aktarma
import { useState, useEffect, useMemo, useRef } from 'react'
import { createChart } from 'lightweight-charts'; 
import {PieChart, Pie,Cell, Tooltip, ResponsiveContainer, Legend} from 'recharts';
//Al/sat ve kâr/zarar hesapları portfoy.js dosyasından gelir.
import {
  alimUygula,
  bakiyeHesapla,
  gecerliIslemKaydi,
  gecerliNakitKaydi,
  gecerliPortfoyKaydi,
  gerceklesenKarZarar,
  islemKaydi,
  karZararHesapla,
  kayitliListeyiOku,
  lotMiktariniCoz,
  nakitHareketi,
  paraYatir,
  pastaRengi,
  portfoyDegerSerisi,
  portfoyOzeti,
  satimUygula,
  sonFiyatBul,
  toplamGerceklesenKarZarar,
  tutarCoz,
  veriOlmayanHisseler,
  yeterliBakiyeVarMi,
} from './portfoy';

// Grafikte dönem seçimi eklendi.
const GRAFIK_DONEMLERI = [
  { kod: '1g', ad: '1G', gunIci: true },
  { kod: '1h', ad: '1H', gunIci: true },
  { kod: '1a', ad: '1A', gunIci: false },
  { kod: '3a', ad: '3A', gunIci: false },
  { kod: '1y', ad: '1Y', gunIci: false },
  { kod: '5y', ad: '5Y', gunIci: false },
];

//Boyut Duyarlı (Responsive) ve Güvenli TradingView Bileşeni
//Grafik türü ve saat gösterimi dışarıdan seçilir.
const TradingViewChart = ({ data, tip, saatGoster }) => {
  const chartContainerRef = useRef();

  useEffect(() => {
    // Veri yoksa veya array boş ise grafiğin çökmemesi için 
    if (!chartContainerRef.current || !Array.isArray(data) || data.length === 0) return;

    // API'den gelen verileri zorla sayıya çevirir. String veri gelme ihtimaline karşı alınan önlem.
    //Bozuk verileri filtreleyip eskiden yeniye sıralıyoruz. 
    const temizVeri = data
      .map(d => ({
        time: d.time,
        open: Number(d.open),
        high: Number(d.high),
        low: Number(d.low),
        close: Number(d.close)
      }))
      .filter(d => !isNaN(d.open) && !isNaN(d.high) && !isNaN(d.low) && !isNaN(d.close))
      .filter((v, i, a) => a.findIndex(t => t.time === v.time) === i)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    if (temizVeri.length === 0) return;

    //Kanvas oluşumu
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: '#0f172a' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155', style: 1 },
        horzLines: { color: '#334155', style: 1 },
      },
      width: chartContainerRef.current.clientWidth || 450,
      height: chartContainerRef.current.clientHeight || 250,
      timeScale: {
        borderColor: '#475569',
        timeVisible: saatGoster,
        secondsVisible: false,
      },
    });

    try {
      if (tip === 'cizgi') {
        //Çizgi grafik kapanış fiyatlarını kullanır, dönem başına göre yeşil veya kırmızı olur.
        const yukseliste = temizVeri[temizVeri.length - 1].close >= temizVeri[0].close;
        const cizgiSerisi = chart.addLineSeries({ color: yukseliste ? '#34d399' : '#f87171', lineWidth: 2 });
        cizgiSerisi.setData(temizVeri.map(d => ({ time: d.time, value: d.close })));
      } else {
        //Yeşil ve kırmızı mumları oluşturma.
        const candlestickSeries = chart.addCandlestickSeries({
          upColor: '#34d399',
          downColor: '#f87171',
          borderVisible: false,
          wickUpColor: '#34d399',
          wickDownColor: '#f87171',
        });
        candlestickSeries.setData(temizVeri);
      }
      chart.timeScale().fitContent();
    } catch (e) {
      console.error("TradingView Çizim Hatası:", e);
    }

    //Pencere boyutu değiştiğinde grafik otomatik yeniden boyutlandırılır.Grafiğin taşmaması sağlandı.
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== chartContainerRef.current) return;
      const newRect = entries[0].contentRect;
      if (newRect.width > 0 && newRect.height > 0) {
        chart.applyOptions({ width: newRect.width, height: newRect.height });
      }
    });
    
    resizeObserver.observe(chartContainerRef.current);

    // İncele modalı kapatıldığında RAM temizlenir.
    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, tip, saatGoster]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
};

function App() {
  const [aktifSekme, setAktifSekme] = useState('piyasa'); 
  const [hisseler, setHisseler] = useState([]);
  //Piyasa verisi alınmamasını bu state kontrol edecek.
  const [piyasaHatasi, setPiyasaHatasi] = useState(false);
  const [aramaMetni, setAramaMetni] = useState('');
  
  const [seciliHisse, setSeciliHisse] = useState(null);
  const [islemTipi, setIslemTipi] = useState('AL');
  const [lotMiktari, setLotMiktari] = useState('');
  // Grafik verisi artık ait olduğu hisse ile tutulacak.
  //Sonuç hangi hisse ve döneme aitse onunla tutulur; grafik türü ve dönem seçimi eklendi.
  const [grafikSonucu, setGrafikSonucu] = useState({ sembol: null, donem: null, veri: [] });
  const [grafikTipi, setGrafikTipi] = useState('mum');
  const [grafikDonemi, setGrafikDonemi] = useState('3a');
  // Portföy grafiğinin dönemi ve verisi, hisse grafiğinden ayrı tutulmalı.
  const [portfoyDonemi, setPortfoyDonemi] = useState('3a');
  const [portfoyGrafikSonucu, setPortfoyGrafikSonucu] = useState({ semboller: null, donem: null, veri: [] });

  // 1. Portföy başlatılırken önce localStorage kontrol edilir.
  // Eğer kayıtlı veri varsa JSON.parse ile okunur.
  //Portföy kaydı güvenli şekilde okunacak.
  const [portfoy, setPortfoy] = useState(() => kayitliListeyiOku('bist_portfoy', gecerliPortfoyKaydi));

  //İşlem geçmişi özelliği eklendi. Kullanıcı işlemlerini görebilecek.
  //İşlem geçmişi kaydı güvenli şekilde okunacak.
  const [islemGecmisi, setIslemGecmisi] = useState(() => kayitliListeyiOku('bist_islem_gecmisi', gecerliIslemKaydi));

  //Her hissenin en son alınan fiyatı saklanır. Sayfa yenilense de korunacak.
  const [sonFiyatlar, setSonFiyatlar] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('bist_son_fiyatlar')) || {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('bist_son_fiyatlar', JSON.stringify(sonFiyatlar));
  }, [sonFiyatlar]);

  //Nakit hareketleri saklanır, bakiye bunlardan hesaplanır.
  const [nakitHareketleri, setNakitHareketleri] = useState(() => kayitliListeyiOku('bist_nakit_hareketleri', gecerliNakitKaydi));
  const [yatirilacakTutar, setYatirilacakTutar] = useState('');
  const nakitBakiye = bakiyeHesapla(nakitHareketleri);

  useEffect(() => {
    localStorage.setItem('bist_nakit_hareketleri', JSON.stringify(nakitHareketleri));
  }, [nakitHareketleri]);

  // 2. Portföy state'i her değiştiğinde hafıza otomatik güncellenir.
  useEffect(() => {
    localStorage.setItem('bist_portfoy', JSON.stringify(portfoy));
  }, [portfoy]);
  
  // 3. İşlem geçmişi state'i her değiştiğinde hafıza otomatik güncellenir.
  useEffect(() => {
    localStorage.setItem('bist_islem_gecmisi', JSON.stringify(islemGecmisi));
  }, [islemGecmisi]);

  // CANLI VERİ DÖNGÜSÜ (POLLING)
  const piyasaVerileriniGetir = () => {
    //Python backend API'sinden verileri çeker.
    fetch('http://127.0.0.1:8000/api/hisseler')
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) throw new Error('Piyasa verisi boş geldi');
        setHisseler(data);
        //Gelen fiyatlar sonFiyatlar state'ine işlenir.
        setSonFiyatlar(onceki => ({ ...onceki, ...Object.fromEntries(data.map(h => [h.sembol, h.fiyat])) }));
        setPiyasaHatasi(false);
      })
      .catch(error => {
        console.error("Arka plan veri güncelleme hatası:", error);
        setPiyasaHatasi(true);
      });
  };

  useEffect(() => {
    piyasaVerileriniGetir(); // İlk açılışta hemen çalıştır
    const intervalId = setInterval(() => {
      piyasaVerileriniGetir(); 
    }, 15000);
    //Sayfa kapatıldığında bu saat durur. Bilgisayarın kilitlenmesi sorunu çözüldü.
    return () => clearInterval(intervalId); // Bellek sızıntısını önle
  }, []);

  useEffect(() => {
    if (seciliHisse) {
      const sembol = seciliHisse.sembol;
      //Seçilen dönem backend'e gönderilir, dönem değişince veri yeniden çekilir.
      const donem = grafikDonemi;
      let iptal = false;
      fetch(`http://127.0.0.1:8000/api/grafik/${sembol}?donem=${donem}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (!iptal) setGrafikSonucu({ sembol, donem, veri: Array.isArray(data) ? data : [] });
        })
        .catch(() => {
          if (!iptal) setGrafikSonucu({ sembol, donem, veri: [] });
        });
      return () => { iptal = true; };
    }
  }, [seciliHisse, grafikDonemi]);

  //Portföy sekmesi açıkken geçmiş fiyatlar çekilir. Lot değişince değil, hisse listesi veya dönem değişince yenilenir.
  const portfoySembolleri = portfoy.map(item => item.sembol).sort().join(',');

  useEffect(() => {
    if (aktifSekme === 'portfoy' && portfoySembolleri !== '') {
      const semboller = portfoySembolleri;
      const donem = portfoyDonemi;
      let iptal = false;
      fetch(`http://127.0.0.1:8000/api/portfoy-grafik?semboller=${encodeURIComponent(semboller)}&donem=${donem}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (!iptal) setPortfoyGrafikSonucu({ semboller, donem, veri: Array.isArray(data) ? data : [] });
        })
        .catch(() => {
          if (!iptal) setPortfoyGrafikSonucu({ semboller, donem, veri: [] });
        });
      return () => { iptal = true; };
    }
  }, [aktifSekme, portfoySembolleri, portfoyDonemi]);

  const filtrelenmisHisseler = hisseler.filter(hisse => 
    hisse.sembol.toLowerCase().includes(aramaMetni.toLowerCase()) || 
    hisse.ad.toLowerCase().includes(aramaMetni.toLowerCase())
  );

  // Seçilen hissenin fiyatının güncel piyasadan okunması için yeni bir değişken. Öncesinde modal açıkken değer güncellenmiyordu. 
  const seciliFiyat = hisseler.find(h => h.sembol === seciliHisse?.sembol)?.fiyat ?? seciliHisse?.fiyat;

  const modalKapat = () => {
    setSeciliHisse(null);
    setLotMiktari('');
    setIslemTipi('AL');
  };

  //Geçici para yatırma işlemi; banka uygulaması bağlanınca kaldırılabilir.
  const paraYatirOnayla = () => {
    const tutar = tutarCoz(yatirilacakTutar);
    if (tutar === null) return alert('Lütfen en fazla iki ondalıklı, pozitif bir tutar girin.');
    setNakitHareketleri(paraYatir(nakitHareketleri, tutar));
    setYatirilacakTutar('');
  };

  const islemOnayla = () => {
    //Küsuratlı lotlar artık yuvarlanmayacak, doğrudan reddedilecek. 
    const miktar = lotMiktariniCoz(lotMiktari);
    if (miktar === null) return alert('Lot miktarı pozitif bir tam sayı olmalıdır.');


    // Kayıt objesi 
    //Kayıt portfoy.js dosyasındaki islemKaydi fonksiyonuyla oluşturulur.
    const yeniIslemKaydi = islemKaydi(islemTipi, seciliHisse.sembol, miktar, seciliFiyat);
    

    
    if (islemTipi === 'AL') {
      //Bakiye yetmiyorsa alım reddedilir, yetiyorsa tutar bakiyeden düşülür.
      if (!yeterliBakiyeVarMi(nakitBakiye, yeniIslemKaydi.tutar)) {
        return alert(`Yetersiz bakiye. Gereken: ${yeniIslemKaydi.tutar.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺, mevcut: ${nakitBakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺`);
      }
      setNakitHareketleri([nakitHareketi('ALIM', -yeniIslemKaydi.tutar, seciliHisse.sembol), ...nakitHareketleri]);

      //Alım hesabı alimUygula fonksiyonuna taşındı.
      setPortfoy(alimUygula(portfoy, seciliHisse, miktar, seciliFiyat));

      //Alım işlemlerini geçmişe kaydet
      setIslemGecmisi([yeniIslemKaydi, ...islemGecmisi])
      alert(`${miktar} lot ${seciliHisse.sembol} başarıyla alındı!`);
    } 
    else if (islemTipi === 'SAT') {
      //Satım hesabı satimUygula fonksiyonuna taşındı.
      const yeniPortfoy = satimUygula(portfoy, seciliHisse.sembol, miktar);
      if (yeniPortfoy === null) {
        return alert('Portföyünüzde yeterli lot bulunmuyor!');
      }
      setPortfoy(yeniPortfoy);
      //Satış tutarı bakiyeye eklenir.
      setNakitHareketleri([nakitHareketi('SATIM', yeniIslemKaydi.tutar, seciliHisse.sembol), ...nakitHareketleri]);

      //Satım işlemlerini geçmişe kaydet
      //Satış kaydına gerçekleşen kâr/zarar ekleniyor.
      const satilanHisse = portfoy.find(p => p.sembol === seciliHisse.sembol);
      setIslemGecmisi([{ ...yeniIslemKaydi, karZarar: gerceklesenKarZarar(satilanHisse, seciliFiyat, miktar) }, ...islemGecmisi])
      alert(`${miktar} lot ${seciliHisse.sembol} başarıyla satıldı!`);
    }
    modalKapat();
  };

  //Portföy değeri otomatik olarak güncellenir.
  //Tüm hisseler en son alınan fiyatla hesaplanır; kayıt yoksa son işlem fiyatı kullanılır.
  const fiyatEskiMi = item => piyasaHatasi || !hisseler.some(h => h.sembol === item.sembol);
  const eskiFiyatSayisi = portfoy.filter(fiyatEskiMi).length;

  //Toplamlar portfoyOzeti fonksiyonundan geliyor.
  const { toplamPortfoyDegeri, toplamKarZarar, toplamKarZararYuzde } = portfoyOzeti(portfoy, sonFiyatlar);
  //Gerçekleşen kâr/zarar işlem geçmişinden hesaplanır.
  const gerceklesenToplam = toplamGerceklesenKarZarar(islemGecmisi);

  //Pasta grafiği eklendi.
  const pastaGrafikVerisi = portfoy.map(item => {
    return {
      name: item.sembol,
      value: sonFiyatBul(item, sonFiyatlar) * item.lot
    };
  }).filter(item => item.value > 0);

  // Grafik yalnızca veri veya portföy değişince yeniden çizilsin diye seriyi saklıyoruz.
  const portfoyGrafikSerisi = useMemo(
    () => portfoyDegerSerisi(portfoy, portfoyGrafikSonucu.veri),
    [portfoy, portfoyGrafikSonucu.veri]
  );
  const portfoyGrafikYukleniyor = portfoyGrafikSonucu.semboller !== portfoySembolleri || portfoyGrafikSonucu.donem !== portfoyDonemi;
  const grafikteOlmayanHisseler = veriOlmayanHisseler(portfoy, portfoyGrafikSonucu.veri);

  // Site şablonları ve arayüzü oluşturuldu.
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans relative">
      <nav className="border-b border-slate-700 bg-slate-800/50 px-6 py-4 flex justify-between items-center sticky top-0 backdrop-blur-sm z-10">
        <h1 className="text-2xl font-bold text-emerald-400 tracking-wide cursor-pointer" onClick={() => setAktifSekme('piyasa')}>
          BIST100 <span className="text-white font-medium text-lg">Terminal</span>
        </h1>
        <div className="space-x-4 flex items-center">
          <button 
            onClick={() => setAktifSekme('piyasa')}
            className={`font-medium transition ${aktifSekme === 'piyasa' ? 'text-emerald-400' : 'text-slate-300 hover:text-white'}`}
          >
            Piyasa
          </button>
          <button 
            onClick={() => setAktifSekme('portfoy')}
            className={`font-medium transition px-4 py-2 rounded-lg ${aktifSekme === 'portfoy' ? 'bg-slate-700 text-emerald-400' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
          >
            Portföyüm ({portfoy.length})
          </button>
          <button
            onClick={() => setAktifSekme('gecmis')}
            className={`font-medium transition px-4 py-2 rounded-lg ${aktifSekme === 'gecmis' ? 'bg-slate-700 text-emerald-400' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
          >
            İşlem Geçmişi
          </button>
        </div>
      </nav>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        {aktifSekme === 'piyasa' && (
          <section className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-sm">
            <div className="border-b border-slate-700 pb-4 mb-4 flex justify-between items-center">
              <h3 className="text-lg font-medium">BIST Hisseleri ({hisseler.length})</h3>
              <input 
                type="text" 
                placeholder="Hisse Ara..." 
                value={aramaMetni}
                onChange={(e) => setAramaMetni(e.target.value)}
                className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 w-64"
              />
            </div>

            {piyasaHatasi && hisseler.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
                Veriler güncellenemedi, son alınan fiyatlar gösteriliyor.
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-sm">
                    <th className="pb-3 pl-2">Sembol</th>
                    <th className="pb-3 text-right">Fiyat (₺)</th>
                    <th className="pb-3 text-right">Değişim</th>
                    <th className="pb-3 text-center">İşlem & Grafik</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrelenmisHisseler.map((hisse) => (
                    <tr key={hisse.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                      <td className="py-4 pl-2 font-bold text-emerald-400">{hisse.sembol}</td>
                      <td className="py-4 text-right font-medium">{hisse.fiyat.toFixed(2)}</td>
                      <td className={`py-4 text-right font-medium ${hisse.degisim >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {hisse.degisim > 0 ? '+' : ''}{hisse.degisim}%
                      </td>
                      <td className="py-4 text-center">
                        <button 
                          onClick={() => setSeciliHisse(hisse)}
                          className="bg-slate-700 hover:bg-emerald-600 text-white px-3 py-1 rounded text-sm transition"
                        >
                          İncele / Al
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtrelenmisHisseler.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  {hisseler.length > 0
                    ? 'Aramanızla eşleşen hisse bulunamadı.'
                    : piyasaHatasi
                      ? 'Piyasa verileri alınamadı. Yeniden deneniyor...'
                      : 'Piyasa Verileri Yükleniyor...'}
                </div>
              )}
            </div>
          </section>
        )}

        {aktifSekme === 'portfoy' && (
          <section className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-sm">
             {eskiFiyatSayisi > 0 && (
               <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
                 {hisseler.length === 0 && !piyasaHatasi
                   ? 'Güncel fiyatlar yükleniyor, son alınan fiyatlar gösteriliyor.'
                   : `${eskiFiyatSayisi} hisse güncel fiyat yerine son alınan fiyatla hesaplandı.`}
               </div>
             )}
             {/*Nakit bakiye ve geçici para yatırma alanı. */}
             <div className="mb-4 bg-slate-900 p-5 rounded-xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
               <div>
                 <p className="text-slate-400 text-sm mb-1">Nakit Bakiye</p>
                 <p className="text-3xl font-bold text-white">
                   {nakitBakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                 </p>
               </div>
               <div className="flex flex-col items-stretch md:items-end gap-2">
                 <div className="flex gap-2">
                   <input
                     type="number"
                     min="0.01"
                     step="0.01"
                     value={yatirilacakTutar}
                     onChange={(e) => setYatirilacakTutar(e.target.value)}
                     placeholder="Tutar"
                     className="flex-1 md:w-40 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                   />
                   <button
                     onClick={paraYatirOnayla}
                     className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition"
                   >
                     Para Yatır
                   </button>
                 </div>
                 <p className="text-xs text-slate-500">Simülasyon: gerçek para değildir.</p>
               </div>
             </div>
             {/*Dört kart için ızgara düzeni değişti. */}
             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-700 flex flex-col justify-center">
                    <p className="text-slate-400 text-sm mb-1">Toplam Portföy</p>
                    <p className="text-3xl font-bold text-white">
                      {toplamPortfoyDegeri.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                    </p>
                  </div>
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-700 flex flex-col justify-center">
                    {/*Kart başlığı açık pozisyonları belirtir. */}
                    <p className="text-slate-400 text-sm mb-1">Açık Pozisyon Kâr / Zarar</p>
                    <p className={`text-3xl font-bold ${toplamKarZarar >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {toplamKarZarar > 0 ? '+' : ''}{toplamKarZarar.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                    </p>
                  </div>
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-700 flex flex-col justify-center">
                    <p className="text-slate-400 text-sm mb-1">Açık Pozisyon Getirisi</p>
                    <p className={`text-3xl font-bold ${toplamKarZararYuzde >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {toplamKarZararYuzde > 0 ? '+' : ''}{toplamKarZararYuzde.toFixed(2)}%
                    </p>
                  </div>
                  {/*Satışlardan oluşan gerçekleşen kâr/zarar kartı. */}
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-700 flex flex-col justify-center">
                    <p className="text-slate-400 text-sm mb-1">Gerçekleşen Kâr / Zarar</p>
                    <p className={`text-3xl font-bold ${gerceklesenToplam >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {gerceklesenToplam > 0 ? '+' : ''}{gerceklesenToplam.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                    </p>
                  </div>
            </div>


            {/*Portföy çizgi grafiği. */}
            {portfoy.length > 0 && (
              <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 mb-8 shadow-inner">
                <div className="flex flex-wrap justify-between items-start gap-2 mb-4">
                  <div>
                    <h4 className="text-slate-300 font-medium">Mevcut Hisselerin Geçmiş Performansı</h4>
                    <p className="text-xs text-slate-500 mt-1">Bugünkü lotlarla hesaplanır, gerçek işlem geçmişini göstermez.</p>
                  </div>
                  <div className="flex gap-1">
                    {GRAFIK_DONEMLERI.map((secenek) => (
                      <button
                        key={secenek.kod}
                        onClick={() => setPortfoyDonemi(secenek.kod)}
                        className={`px-2 py-1 rounded text-xs font-medium transition ${portfoyDonemi === secenek.kod ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                      >
                        {secenek.ad}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-64 w-full rounded-lg border border-slate-700 overflow-hidden relative">
                  {portfoyGrafikYukleniyor ? (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                      Grafik Yükleniyor...
                    </div>
                  ) : portfoyGrafikSerisi.length > 0 ? (
                    <TradingViewChart
                      data={portfoyGrafikSerisi}
                      tip="cizgi"
                      saatGoster={GRAFIK_DONEMLERI.find(d => d.kod === portfoyDonemi).gunIci}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                      Grafik verisi alınamadı.
                    </div>
                  )}
                </div>

                {!portfoyGrafikYukleniyor && grafikteOlmayanHisseler.length > 0 && (
                  <p className="text-xs text-amber-300 mt-2">
                    Geçmiş verisi alınamadığı için grafiğe dahil edilmedi: {grafikteOlmayanHisseler.join(', ')}
                  </p>
                )}
              </div>
            )}

            {portfoy.length > 0 && (
              <div className={`bg-slate-900 p-6 rounded-xl border border-slate-700 mb-8 ${pastaGrafikVerisi.length > 10 ? 'h-[28rem]' : 'h-80'} flex flex-col justify-center items-center shadow-inner`}>
                <h4 className="text-slate-300 font-medium mb-4 w-full text-left">Portföy Dağılımı</h4>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pastaGrafikVerisi}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={Math.min(5, 120 / pastaGrafikVerisi.length)}
                      dataKey="value"
                      stroke="none"
                    >
                      {pastaGrafikVerisi.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={pastaRengi(index)} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => `${value.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺`}
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '0.5rem' }}
                      itemStyle={{ color: '#e2e8f0' }}
                    />
                    <Legend verticalAlign="bottom" height={pastaGrafikVerisi.length > 10 ? 90 : 36} iconType="circle" wrapperStyle={{ paddingTop: '20px', overflowY: 'auto' }}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            
            {portfoy.length === 0 ? (
              <div className="text-center py-8 text-slate-500">Portföyünüzde hisse bulunmuyor.</div>
            ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400 text-sm">
                        <th className="pb-3 pl-2">Sembol</th>
                        <th className="pb-3 text-right">Maliyet</th>
                        <th className="pb-3 text-right">Güncel</th>
                        <th className="pb-3 text-right">Lot</th>
                        <th className="pb-3 text-right">Kâr/Zarar</th>
                        <th className="pb-3 text-center">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfoy.map((item, index) => {
                        const guncelVeri = hisseler.find(h => h.sembol === item.sembol);
                        //Satırın fiyatı ve kâr/zararı portfoy.js dosyasından gelir.
                        const guncelFiyat = sonFiyatBul(item, sonFiyatlar);
                        const { karZarar, karZararYuzde } = karZararHesapla(item, guncelFiyat);

                        return (
                          <tr key={index} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                            <td className="py-4 pl-2 font-bold text-emerald-400">{item.sembol}</td>
                            <td className="py-4 text-right">{item.maliyet.toFixed(2)} ₺</td>
                            <td className="py-4 text-right">
                              {guncelFiyat.toFixed(2)} ₺
                              {fiyatEskiMi(item) && <span className="ml-2 text-xs text-amber-300">son veri</span>}
                            </td>
                            <td className="py-4 text-right text-slate-300 font-medium">{item.lot}</td>
                            <td className={`py-4 text-right font-medium ${karZarar >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {karZarar > 0 ? '+' : ''}{karZarar.toFixed(2)} ₺ ({karZararYuzde.toFixed(2)}%)
                            </td>
                            <td className="py-4 text-center">
                              <button
                                onClick={() => { setSeciliHisse(guncelVeri); setIslemTipi('SAT'); }}
                                disabled={!guncelVeri}
                                title={guncelVeri ? undefined : 'Güncel fiyat alınamadı'}
                                className="bg-slate-700 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-700"
                              >
                                Sat
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
            )}
          </section>
        )}
      
        {aktifSekme === 'gecmis' && (
          <section className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-sm">
            <h3 className="text-lg font-medium border-b border-slate-700 pb-4 mb-4">İşlem Kayıtları (Trade Logs)</h3>

            
            {islemGecmisi.length === 0 ? (
              <div className="text-center py-8 text-slate-500">Henüz hiçbir alım/satım yapmadınız.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 text-sm">
                      <th className="pb-3 pl-2">Tarih / Saat</th>
                      <th className="pb-3 text-center">İşlem</th>
                      <th className="pb-3">Sembol</th>
                      <th className="pb-3 text-right">Fiyat</th>
                      <th className="pb-3 text-right">Lot</th>
                      <th className="pb-3 text-right pr-2">Toplam Tutar</th>
                      {/*Geçmişe gerçekleşen kâr/zarar sütunu eklendi. */}
                      <th className="pb-3 text-right pr-2">Kâr/Zarar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {islemGecmisi.map((islem) => (
                      <tr key={islem.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                        <td className="py-4 pl-2 text-sm text-slate-300">{islem.tarih}</td>
                        <td className="py-4 text-center">
                          <span className={`px-2 py-1 text-xs font-bold rounded ${islem.tip === 'AL' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {islem.tip}
                          </span>
                        </td>
                        <td className="py-4 font-bold text-white">{islem.sembol}</td>
                        <td className="py-4 text-right text-sm">{islem.fiyat.toFixed(2)} ₺</td>
                        <td className="py-4 text-right text-sm">{islem.lot}</td>
                        <td className="py-4 text-right pr-2 font-medium">
                          {islem.tutar.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                        </td>
                        {Number.isFinite(islem.karZarar) ? (
                          <td className={`py-4 text-right pr-2 font-medium ${islem.karZarar >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {islem.karZarar > 0 ? '+' : ''}{islem.karZarar.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                          </td>
                        ) : (
                          <td className="py-4 text-right pr-2 font-medium text-slate-500">—</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/*Nakit hareketleri tablosu. */}
            <h3 className="text-lg font-medium border-b border-slate-700 pb-4 mb-4 mt-8">Nakit Hareketleri</h3>
            {nakitHareketleri.length === 0 ? (
              <div className="text-center py-8 text-slate-500">Henüz nakit hareketi yok.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 text-sm">
                      <th className="pb-3 pl-2">Tarih / Saat</th>
                      <th className="pb-3">Tür</th>
                      <th className="pb-3">Açıklama</th>
                      <th className="pb-3 text-right pr-2">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nakitHareketleri.map((hareket) => (
                      <tr key={hareket.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                        <td className="py-4 pl-2 text-sm text-slate-300">{hareket.tarih}</td>
                        <td className="py-4 text-sm">{hareket.tip}</td>
                        <td className="py-4 text-sm text-slate-300">{hareket.aciklama}</td>
                        <td className={`py-4 text-right pr-2 font-medium ${hareket.tutar >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {hareket.tutar > 0 ? '+' : ''}{hareket.tutar.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>

      {seciliHisse && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-[36rem] max-h-[90vh] overflow-y-auto shadow-2xl">
            
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">{seciliHisse.sembol}</h3>
                {/* Pencere açıkken fiyat canlı güncellenir. */}
                <p className="text-sm text-slate-400">Son Fiyat: {seciliFiyat.toFixed(2)} ₺</p>
              </div>
              <button onClick={modalKapat} className="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
              <div className="flex gap-1">
                {GRAFIK_DONEMLERI.map((secenek) => (
                  <button
                    key={secenek.kod}
                    onClick={() => setGrafikDonemi(secenek.kod)}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${grafikDonemi === secenek.kod ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                  >
                    {secenek.ad}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setGrafikTipi('mum')}
                  className={`px-2 py-1 rounded text-xs font-medium transition ${grafikTipi === 'mum' ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                  Mum
                </button>
                <button
                  onClick={() => setGrafikTipi('cizgi')}
                  className={`px-2 py-1 rounded text-xs font-medium transition ${grafikTipi === 'cizgi' ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                  Çizgi
                </button>
              </div>
            </div>

            <div className="h-64 w-full bg-slate-900 rounded-lg mb-6 border border-slate-700 overflow-hidden relative">
                {/* Grafik için yükleniyor ve veri yok durumları ayrıldı. */}
                {grafikSonucu.sembol !== seciliHisse.sembol || grafikSonucu.donem !== grafikDonemi ? (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                        Grafik Yükleniyor...
                    </div>
                ) : grafikSonucu.veri.length > 0 ? (
                    <TradingViewChart
                      data={grafikSonucu.veri}
                      tip={grafikTipi}
                      saatGoster={GRAFIK_DONEMLERI.find(d => d.kod === grafikDonemi).gunIci}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                        Grafik verisi alınamadı.
                    </div>
                )}
            </div>

            <div className="flex gap-2 mb-6">
              <button
                className={`flex-1 py-2 rounded-lg font-medium transition ${islemTipi === 'AL' ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                onClick={() => setIslemTipi('AL')}
              >
                ALIŞ
              </button>
              <button
                className={`flex-1 py-2 rounded-lg font-medium transition ${islemTipi === 'SAT' ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                onClick={() => setIslemTipi('SAT')}
              >
                SATIŞ
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Lot Miktarı</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={lotMiktari}
                  onChange={(e) => setLotMiktari(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                  placeholder="0"
                />
              </div>

              {/*İşlem penceresinde nakit bakiye gösterilecek.*/}
              <div className="flex justify-between items-center pt-2">
                <span className="text-sm text-slate-400">Nakit Bakiye:</span>
                <span className="text-sm font-medium text-slate-200">
                  {nakitBakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                </span>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-sm text-slate-400">Toplam Tutar:</span>
                <span className="text-xl font-bold text-white">
                  {lotMiktariniCoz(lotMiktari) ? (seciliFiyat * lotMiktariniCoz(lotMiktari)).toLocaleString('tr-TR', {minimumFractionDigits: 2}) : '0,00'} ₺
                </span>
              </div>

              <button 
                onClick={islemOnayla}
                className={`w-full py-3 rounded-lg font-bold transition mt-2 ${islemTipi === 'AL' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}
              >
                {islemTipi === 'AL' ? 'ALIŞ EMRİ GÖNDER' : 'SATIŞ EMRİ GÖNDER'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}


export default App