// React kütüphanesini içe aktarma
import { useState, useEffect, useMemo, useRef } from 'react'
import { createChart } from 'lightweight-charts'; 
//Al/sat ve kâr/zarar hesapları portfoy.js dosyasından gelir.
import {
  alimUygula,
  // Yeni portföy analizi yardımcıları.
  analiziCanlandir,
  analizIslemleri,
  seriyiDonemeGoreKes,
  // Kapalı günler grafikten çıkarılır.
  kapaliGunleriCikar,
  bakiyeHesapla,
  // Kâr/Zarar grafiğini üst şeritle aynı döneme bağlar.
  donemKarSerisi,
  donemBasinaKadarDoldur,
  // Seçili hissenin dönem değişimi.
  donemDegisimi,
  // Yeni sayfa düzeninin yardımcıları.
  enFazlaLot,
  isaretliTl,
  isaretliYuzde,
  karRengi,
  tl,
  gecerliIslemKaydi,
  gecerliNakitKaydi,
  gecerliPortfoyKaydi,
  gerceklesenKarZarar,
  // Grafiklerin parlak yeşil ve kırmızısı tek yerden gelir.
  GRAFIK_KIRMIZI,
  GRAFIK_YESIL,
  grafikSembolleri,
  islemKaydi,
  kaydiOlmayanHisseler,
  karZararHesapla,
  kayitliListeyiOku,
  lotMiktariniCoz,
  nakitHareketi,
  paraYatir,
  portfoyOzeti,
  satimUygula,
  sonFiyatBul,
  tutarCoz,
  yeterliBakiyeVarMi,
} from './portfoy';
import PortfoyDagilimi from './PortfoyDagilimi';
import PortfoyGrafigi from './PortfoyGrafigi';
import PortfoyOzetSeridi from './PortfoyOzetSeridi';

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
  //Grafik saklanır; veri değişince baştan kurulmaz, yalnızca verisi güncellenir.
  const chartRef = useRef(null);
  const seriRef = useRef(null);
  const ilkZamanRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    //Kanvas oluşumu
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: '#000000' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155', style: 1 },
        horzLines: { color: '#334155', style: 1 },
      },
      width: chartContainerRef.current.clientWidth || 450,
      height: chartContainerRef.current.clientHeight || 250,
      rightPriceScale: { borderColor: '#ffffff' },
      timeScale: {
        borderColor: '#ffffff',
        timeVisible: saatGoster,
        secondsVisible: false,
      },
    });

    if (tip === 'cizgi') {
      seriRef.current = chart.addLineSeries({ lineWidth: 2 });
    } else {
      //Yeşil ve kırmızı mumları oluşturma.
      seriRef.current = chart.addCandlestickSeries({
        upColor: GRAFIK_YESIL,
        downColor: GRAFIK_KIRMIZI,
        borderVisible: false,
        wickUpColor: GRAFIK_YESIL,
        wickDownColor: GRAFIK_KIRMIZI,
      });
    }
    chartRef.current = chart;
    ilkZamanRef.current = null;

    //Pencere boyutu değiştiğinde grafik otomatik yeniden boyutlandırılır. Grafiğin taşmaması sağlandı.
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== chartContainerRef.current) return;
      const newRect = entries[0].contentRect;
      if (newRect.width > 0 && newRect.height > 0) {
        chart.applyOptions({ width: newRect.width, height: newRect.height });
      }
    });
    
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriRef.current = null;
    };
  }, [tip, saatGoster]);

  //Veri değişince mevcut grafiğin verisi güncellenir.
  useEffect(() => {
    // Veri yoksa veya array boş ise grafiğin çökmemesi için
    if (!seriRef.current || !Array.isArray(data) || data.length === 0) return;

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

    try {
      if (tip === 'cizgi') {
        //Çizgi grafik kapanış fiyatlarını kullanır, dönem başına göre yeşil veya kırmızı olur.
        const yukseliste = temizVeri[temizVeri.length - 1].close >= temizVeri[0].close;
        //Tek nokta çizgi olarak görünmediği için az veride noktalar da gösterilir.
        seriRef.current.applyOptions({ color: yukseliste ? GRAFIK_YESIL : GRAFIK_KIRMIZI, pointMarkersVisible: temizVeri.length <= 2 });
        seriRef.current.setData(temizVeri.map(d => ({ time: d.time, value: d.close })));
      } else {
        seriRef.current.setData(temizVeri);
      }
      //Her güncellemede değil, grafiğin başlangıcı değişince sığdırılır. Kullanıcının yakınlaştırması bozulmaz.
      if (ilkZamanRef.current !== temizVeri[0].time) {
        chartRef.current.timeScale().fitContent();
        ilkZamanRef.current = temizVeri[0].time;
      }
    } catch (e) {
      console.error("TradingView Çizim Hatası:", e);
    }
  }, [data, tip, saatGoster]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
};

function App() {
  // Uygulama portföy sekmesiyle açılır.
  const [aktifSekme, setAktifSekme] = useState('portfoy'); 
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
  // Tüm geçmiş tek seferde geldiği için dönem sonuçta tutulmaz, seri ekranda kesilir.
  // 1G gün içi seri kullandığı için sonucun hangi seri türüne ait olduğu da tutulur.
  const [portfoyGrafikSonucu, setPortfoyGrafikSonucu] = useState({ semboller: null, anahtar: null, veri: null });
  // 5Y dışındaki dönemler gün içi sıklıkta ayrı ayrı çekilir, 5Y günlük geçmişten kesilir.
  const portfoyGunIci = portfoyDonemi !== '5y';
  const portfoyVeriAnahtari = portfoyGunIci ? portfoyDonemi : 'gunluk';
  // Özet şeridindeki dönem kâr/zararının verisi.
  const [donemKariVerisi, setDonemKariVerisi] = useState(null);

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
  // Para yatırma alanı üst menüden açılır.
  const [paraPaneliAcik, setParaPaneliAcik] = useState(false);
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

  // VERİ GÜNCELLEME DÖNGÜSÜ (POLLING)
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
        // Piyasa sayfasındaki panel boş kalmasın diye ilk hisse seçili gelir.
        setSeciliHisse(onceki => onceki ?? data[0]);
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
    //Sayfa kapatıldığında bu saat durur.
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

  const portfoySembolleri = grafikSembolleri(portfoy, islemGecmisi);

  useEffect(() => {
    if (aktifSekme === 'portfoy' && portfoySembolleri !== '') {
      const semboller = portfoySembolleri;
      const anahtar = portfoyVeriAnahtari;
      // İşlemler tarayıcıda tutulduğu için analiz isteğinin gövdesinde gönderilir.
      const govde = JSON.stringify(analizIslemleri(islemGecmisi));
      let iptal = false;
      //Yenileme başarısız olursa eldeki grafik silinmez.
      const sonucuYaz = (veri) => setPortfoyGrafikSonucu(onceki => (
        veri === null && onceki.semboller === semboller && onceki.anahtar === anahtar ? onceki : { semboller, anahtar, veri }
      ));
      const veriyiGetir = () => fetch(`http://127.0.0.1:8000/api/portfoy-analiz${anahtar === 'gunluk' ? '' : `/gun-ici?donem=${anahtar}`}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: govde,
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (!iptal) sonucuYaz(data);
        })
        .catch(() => {
          if (!iptal) sonucuYaz(null);
        });

      veriyiGetir();
      //Yeni mumlar grafiğe eklensin diye geçmiş veri dakikada bir yenilenir.
      const intervalId = setInterval(veriyiGetir, 60000);
      return () => {
        iptal = true;
        clearInterval(intervalId);
      };
    }
  }, [aktifSekme, portfoySembolleri, islemGecmisi, portfoyVeriAnahtari]);

  // İşlem değişince ve dakikada bir yenilenir. Yenileme başarısız olursa eldeki değer silinmez.
  useEffect(() => {
    if (aktifSekme === 'portfoy') {
      const govde = JSON.stringify(analizIslemleri(islemGecmisi));
      let iptal = false;
      const veriyiGetir = () => fetch('http://127.0.0.1:8000/api/portfoy-donem-kari', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: govde,
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (!iptal) setDonemKariVerisi(data);
        })
        .catch(error => console.error('Dönem kârı alınamadı:', error));

      veriyiGetir();
      const intervalId = setInterval(veriyiGetir, 60000);
      return () => {
        iptal = true;
        clearInterval(intervalId);
      };
    }
  }, [aktifSekme, islemGecmisi]);

  const filtrelenmisHisseler = hisseler.filter(hisse =>
    hisse.sembol.toLowerCase().includes(aramaMetni.toLowerCase()) || 
    hisse.ad.toLowerCase().includes(aramaMetni.toLowerCase())
  );

  // Seçilen hissenin fiyatının güncel piyasadan okunması için yeni bir değişken. Öncesinde modal açıkken değer güncellenmiyordu. 
  const seciliFiyat = hisseler.find(h => h.sembol === seciliHisse?.sembol)?.fiyat ?? seciliHisse?.fiyat;

  // Pencere kalktığı için işlemden sonra hisse seçili kalır, yalnızca form temizlenir.
  const islemFormunuTemizle = () => {
    setLotMiktari('');
    setIslemTipi('AL');
  };

  const hisseSec = (hisse) => {
    setSeciliHisse(hisse);
    setLotMiktari('');
  };

  const eldekiLot = portfoy.find(p => p.sembol === seciliHisse?.sembol)?.lot ?? 0;
  const seciliDegisim = hisseler.find(h => h.sembol === seciliHisse?.sembol)?.degisim ?? seciliHisse?.degisim ?? 0;
  // Seçili hisse dönem değişimini gösterir. 1G önceki kapanışa göre günlük değişimdir, grafik yüklenirken değer gösterilmez.
  const grafikHazir = grafikSonucu.sembol === seciliHisse?.sembol && grafikSonucu.donem === grafikDonemi;
  const seciliDonemDegisimi = grafikDonemi === '1g' ? seciliDegisim : (grafikHazir ? donemDegisimi(grafikSonucu.veri, seciliFiyat) : null);
  const seciliDonemAdi = GRAFIK_DONEMLERI.find(d => d.kod === grafikDonemi).ad;
  const degisimYaz = (degisim) => (degisim === null ? '—' : isaretliYuzde(degisim));
  const degisimRengi = (degisim) => (degisim === null ? 'text-slate-400' : karRengi(degisim));

  //Geçici para yatırma işlemi; banka uygulaması bağlanınca kaldırılabilir.
  const paraYatirOnayla = () => {
    const tutar = tutarCoz(yatirilacakTutar);
    if (tutar === null) return alert('Lütfen en fazla iki ondalıklı, pozitif bir tutar girin.');
    setNakitHareketleri(paraYatir(nakitHareketleri, tutar));
    setYatirilacakTutar('');
    setParaPaneliAcik(false);
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
    islemFormunuTemizle();
  };

  //Portföy değeri otomatik olarak güncellenir.
  //Tüm hisseler en son alınan fiyatla hesaplanır; kayıt yoksa son işlem fiyatı kullanılır.
  const fiyatEskiMi = item => piyasaHatasi || !hisseler.some(h => h.sembol === item.sembol);
  const eskiFiyatSayisi = portfoy.filter(fiyatEskiMi).length;

  //Toplamlar portfoyOzeti fonksiyonundan geliyor.
  const { toplamPortfoyDegeri, toplamMaliyet } = portfoyOzeti(portfoy, sonFiyatlar);

  //Pasta grafiği eklendi.
  const pastaGrafikVerisi = portfoy.map(item => {
    return {
      name: item.sembol,
      value: sonFiyatBul(item, sonFiyatlar) * item.lot
    };
  }).filter(item => item.value > 0);

  //Seri işlem geçmişi ve güncel fiyatlarla da yenilenir, son nokta güncel değeri gösterir.
  // Backend sonucunun son günü canlı fiyatlarla güncellenir, seri seçilen döneme göre kesilir.
  const portfoyAnalizi = useMemo(
    () => analiziCanlandir(portfoyGrafikSonucu.veri, sonFiyatlar),
    [portfoyGrafikSonucu.veri, sonFiyatlar]
  );
  const portfoyGrafikSerisi = useMemo(
    () => {
      // 5Y'de ilk alımdan önceki kısım sıfırla doldurulur, gün içi dönemlerde bunu backend yapar.
      const seri = portfoyGunIci ? (portfoyAnalizi?.series ?? []) : donemBasinaKadarDoldur(kapaliGunleriCikar(seriyiDonemeGoreKes(portfoyAnalizi?.series ?? [], portfoyDonemi)), portfoyDonemi);
      const pozisyonlar = donemKariVerisi?.periods[portfoyDonemi];
      return pozisyonlar ? donemKarSerisi(seri, pozisyonlar) : seri;
    },
    [portfoyAnalizi, portfoyDonemi, portfoyGunIci, donemKariVerisi]
  );
  const portfoyGrafikYukleniyor = portfoyGrafikSonucu.semboller !== portfoySembolleri || portfoyGrafikSonucu.anahtar !== portfoyVeriAnahtari;
  //Alım kaydı olmayan lotlar için uyarı gösterilir.
  const kayitsizHisseler = kaydiOlmayanHisseler(portfoy, islemGecmisi);

  const sekmeStili = (sekme) => `h-full px-3 sm:px-4 font-medium whitespace-nowrap border-b-[3px] transition ${aktifSekme === sekme ? 'text-emerald-400 border-emerald-400' : 'text-slate-300 border-transparent hover:text-white'}`;

  // Site şablonları ve arayüzü oluşturuldu.
  // Tema: siyah arka plan ve beyaz çerçeveler. Tablo satır ayraçları kalabalık olmasın diye soluk beyazdır.
  return (
    <div className="min-h-screen bg-black text-slate-100 font-sans relative">
      {/* Sekmeler altı çizili, nakit bakiye ve para yatırma her sayfada sağ üstte. */}
      <nav className="border-b border-white bg-black px-4 sm:px-7 py-3 lg:py-0 lg:h-16 flex flex-wrap items-center gap-x-7 gap-y-2 sticky top-0 z-20">
        <h1 className="text-2xl font-bold text-emerald-400 tracking-wide cursor-pointer" onClick={() => setAktifSekme('portfoy')}>
          BIST100 <span className="text-white font-medium text-lg">Terminal</span>
        </h1>
        <div className="order-3 lg:order-none w-full lg:w-auto h-10 lg:h-full flex">
          <button onClick={() => setAktifSekme('portfoy')} className={sekmeStili('portfoy')}>Portföyüm ({portfoy.length})</button>
          <button onClick={() => setAktifSekme('piyasa')} className={sekmeStili('piyasa')}>Piyasa</button>
          <button onClick={() => setAktifSekme('gecmis')} className={sekmeStili('gecmis')}>İşlem Geçmişi</button>
        </div>
        <div className="ml-auto flex items-center gap-3 relative">
          <div className="text-right">
            <p className="text-slate-400 text-xs">Nakit Bakiye</p>
            <p className="font-bold text-white whitespace-nowrap">{tl(nakitBakiye)}</p>
          </div>
          <button
            onClick={() => setParaPaneliAcik(!paraPaneliAcik)}
            aria-expanded={paraPaneliAcik}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap"
          >
            Para Yatır
          </button>
          {/*Nakit bakiye ve geçici para yatırma alanı. */}
          {paraPaneliAcik && (
            <div className="acilir-gecis absolute right-0 top-full mt-3 w-72 bg-black border border-white rounded-xl p-4 space-y-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  autoFocus
                  value={yatirilacakTutar}
                  onChange={(e) => setYatirilacakTutar(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') paraYatirOnayla(); }}
                  placeholder="Tutar"
                  aria-label="Yatırılacak tutar"
                  className="min-w-0 flex-1 bg-black border border-white rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                />
                <button
                  onClick={paraYatirOnayla}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition"
                >
                  Yatır
                </button>
              </div>
              <p className="text-xs text-slate-500">Simülasyon: gerçek para değildir.</p>
            </div>
          )}
        </div>
      </nav>

      {/* key sayesinde her sekme değişiminde perde yeniden açılır. Tıklamaları engellemez. */}
      <div key={aktifSekme} className="perde-gecisi fixed inset-0 z-10 bg-black pointer-events-none" aria-hidden="true" />
      <main className="p-4 sm:p-7 max-w-[1400px] mx-auto space-y-5">
        {/* Solda hisse listesi, sağda grafik ve al/sat paneli. Açılır pencerenin yerini aldı. */}
        {aktifSekme === 'piyasa' && (
          <div className="grid gap-5 items-start lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,1fr)]">
            <section className="min-w-0 bg-black rounded-xl border border-white">
              <div className="p-5 flex flex-wrap gap-3 justify-between items-center">
                <h3 className="font-medium">BIST Hisseleri ({hisseler.length})</h3>
                <input
                  type="text"
                  placeholder="Hisse Ara..."
                  value={aramaMetni}
                  onChange={(e) => setAramaMetni(e.target.value)}
                  className="bg-black border border-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 w-52"
                />
              </div>

              {piyasaHatasi && hisseler.length > 0 && (
                <div className="mx-5 mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
                  Veriler güncellenemedi, son alınan fiyatlar gösteriliyor.
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white text-slate-400 text-sm">
                      <th className="py-3 pl-5 font-medium">Sembol</th>
                      <th className="py-3 text-right font-medium">Fiyat (₺)</th>
                      <th className="py-3 pr-5 text-right font-medium">Değişim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrelenmisHisseler.map((hisse) => (
                      <tr
                        key={hisse.id}
                        onClick={() => hisseSec(hisse)}
                        className={`border-b border-white/20 cursor-pointer transition ${seciliHisse?.sembol === hisse.sembol ? 'bg-slate-700/40' : 'hover:bg-slate-700/30'}`}
                      >
                        <td className="py-3 pl-5 font-bold text-emerald-400">
                          <button aria-pressed={seciliHisse?.sembol === hisse.sembol}>{hisse.sembol}</button>
                        </td>
                        <td className="py-3 text-right font-medium">{hisse.fiyat.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        {seciliHisse?.sembol === hisse.sembol ? (
                          <td className={`py-3 pr-5 text-right font-medium ${degisimRengi(seciliDonemDegisimi)}`}>
                            <span className="mr-2 text-xs font-normal text-slate-400">{seciliDonemAdi}</span>
                            {degisimYaz(seciliDonemDegisimi)}
                          </td>
                        ) : (
                          <td className={`py-3 pr-5 text-right font-medium ${karRengi(hisse.degisim)}`}>{isaretliYuzde(hisse.degisim)}</td>
                        )}
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

            {seciliHisse && (
              // Panel ekran yüksekliğine sığar, grafik kalan alanı doldurur. Emir düğmesine ulaşmak için kaydırma gerekmez.
              <section className="order-first lg:order-none min-w-0 bg-black rounded-xl border border-white lg:sticky lg:top-20 lg:flex lg:flex-col lg:h-[calc(100vh-6rem)] lg:max-h-[52rem] lg:overflow-y-auto">
                <div className="p-4 pb-2 shrink-0">
                  <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                    <div>
                      <h3 className="text-xl font-bold text-white">{seciliHisse.sembol}</h3>
                      {/* Panelde fiyat güncel kalır. */}
                      <p className={`text-sm font-medium ${degisimRengi(seciliDonemDegisimi)}`}>{tl(seciliFiyat)} · {seciliDonemAdi} {degisimYaz(seciliDonemDegisimi)}</p>
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
                </div>

                <div className="h-64 lg:h-auto lg:flex-1 lg:min-h-36 w-full px-2 overflow-hidden relative">
                    {/* Grafik için yükleniyor ve veri yok durumları ayrıldı. */}
                    {grafikSonucu.sembol !== seciliHisse.sembol || grafikSonucu.donem !== grafikDonemi ? (
                        <div className="icerik-gecisi w-full h-full flex items-center justify-center text-slate-500 text-sm">
                            Grafik Yükleniyor...
                        </div>
                    ) : grafikSonucu.veri.length > 0 ? (
                        <div className="icerik-gecisi w-full h-full">
                          <TradingViewChart
                            data={grafikSonucu.veri}
                            tip={grafikTipi}
                            saatGoster={GRAFIK_DONEMLERI.find(d => d.kod === grafikDonemi).gunIci}
                          />
                        </div>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                            Grafik verisi alınamadı.
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-white/20 space-y-2.5 shrink-0">
                  <div className="flex gap-2">
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

                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={lotMiktari}
                      onChange={(e) => setLotMiktari(e.target.value)}
                      aria-label="Lot miktarı"
                      className="min-w-0 flex-1 bg-black border border-white rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                      placeholder="Lot miktarı"
                    />
                    <button
                      onClick={() => setLotMiktari(String(enFazlaLot(islemTipi, nakitBakiye, seciliFiyat, eldekiLot)))}
                      className="bg-slate-700 hover:bg-slate-600 text-white px-3 rounded-lg text-sm transition whitespace-nowrap"
                    >
                      En fazla
                    </button>
                  </div>

                  {/*İşlem panelinde nakit bakiye gösterilecek.*/}
                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
                    <span><span className="text-slate-400">Nakit </span><span className="font-medium text-slate-200">{tl(nakitBakiye)}</span></span>
                    <span><span className="text-slate-400">Portföydeki Lot </span><span className="font-medium text-slate-200">{eldekiLot}</span></span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Toplam Tutar</span>
                    <span className="text-lg font-bold text-white">
                      {lotMiktariniCoz(lotMiktari) ? tl(seciliFiyat * lotMiktariniCoz(lotMiktari)) : tl(0)}
                    </span>
                  </div>

                  <button
                    onClick={islemOnayla}
                    className={`w-full py-3 rounded-lg font-bold transition ${islemTipi === 'AL' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}
                  >
                    {islemTipi === 'AL' ? 'ALIŞ EMRİ GÖNDER' : 'SATIŞ EMRİ GÖNDER'}
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Dış çerçeve kalktı. Özet tek şeritte, grafik ve dağılım yan yana. */}
        {aktifSekme === 'portfoy' && (
          <>
             {eskiFiyatSayisi > 0 && (
               <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
                 {hisseler.length === 0 && !piyasaHatasi
                   ? 'Güncel fiyatlar yükleniyor, son alınan fiyatlar gösteriliyor.'
                   : `${eskiFiyatSayisi} hisse güncel fiyat yerine son alınan fiyatla hesaplandı.`}
               </div>
             )}

            <PortfoyOzetSeridi
              portfoyDegeri={toplamPortfoyDegeri}
              toplamMaliyet={toplamMaliyet}
              donemler={GRAFIK_DONEMLERI}
              donemKariVerisi={donemKariVerisi}
              sonFiyatlar={sonFiyatlar}
            />

            <div className={`grid gap-5 ${pastaGrafikVerisi.length > 0 ? 'lg:grid-cols-[minmax(0,2.3fr)_minmax(280px,1fr)]' : ''}`}>
              {/*Portföy çizgi grafiği. */}
              {portfoySembolleri !== '' && (
                <PortfoyGrafigi
                  analiz={portfoyAnalizi}
                  seri={portfoyGrafikSerisi}
                  yukleniyor={portfoyGrafikYukleniyor}
                  donemKariHazir={donemKariVerisi !== null}
                  donemler={GRAFIK_DONEMLERI}
                  donem={portfoyDonemi}
                  donemDegistir={setPortfoyDonemi}
                  kayitsizHisseler={kayitsizHisseler}
                />
              )}

              {pastaGrafikVerisi.length > 0 && <PortfoyDagilimi veri={pastaGrafikVerisi} />}
            </div>

            <section className="bg-black rounded-xl border border-white">
              <h3 className="font-medium p-5 pb-3">Hisselerim</h3>
              {portfoy.length === 0 ? (
                <div className="text-center pb-8 pt-3 text-slate-500">Portföyünüzde hisse bulunmuyor.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-white text-slate-400 text-sm">
                        <th className="py-3 pl-5 pr-4 font-medium">Sembol</th>
                        <th className="py-3 px-4 text-right font-medium">Lot</th>
                        <th className="py-3 px-4 text-right font-medium">Maliyet</th>
                        <th className="py-3 px-4 text-right font-medium">Güncel</th>
                        <th className="py-3 px-4 text-right font-medium">Değer</th>
                        <th className="py-3 px-4 text-right font-medium">Kâr/Zarar</th>
                        <th className="py-3 pl-4 pr-5 text-right font-medium">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfoy.map((item, index) => {
                        const guncelVeri = hisseler.find(h => h.sembol === item.sembol);
                        //Satırın fiyatı ve kâr/zararı portfoy.js dosyasından gelir.
                        const guncelFiyat = sonFiyatBul(item, sonFiyatlar);
                        const { karZarar, karZararYuzde } = karZararHesapla(item, guncelFiyat);

                        return (
                          <tr key={index} className="border-b border-white/20 last:border-b-0 hover:bg-slate-700/30 transition">
                            <td className="py-3 pl-5 pr-4 font-bold text-emerald-400">{item.sembol}</td>
                            <td className="py-3 px-4 text-right text-slate-300 font-medium">{item.lot}</td>
                            <td className="py-3 px-4 text-right">{tl(item.maliyet)}</td>
                            <td className="py-3 px-4 text-right">
                              {tl(guncelFiyat)}
                              {fiyatEskiMi(item) && <span className="ml-2 text-xs text-amber-300">son veri</span>}
                            </td>
                            <td className="py-3 px-4 text-right">{tl(guncelFiyat * item.lot)}</td>
                            <td className={`py-3 px-4 text-right font-medium ${karRengi(karZarar)}`}>
                              {isaretliTl(karZarar)} ({isaretliYuzde(karZararYuzde)})
                            </td>
                            <td className="py-3 pl-4 pr-5 text-right">
                              <button
                                onClick={() => { hisseSec(guncelVeri); setIslemTipi('SAT'); setAktifSekme('piyasa'); }}
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
          </>
        )}

        {aktifSekme === 'gecmis' && (
          <section className="bg-black rounded-xl p-6 border border-white shadow-sm">
            <h3 className="text-lg font-medium border-b border-white pb-4 mb-4">İşlem Kayıtları (Trade Logs)</h3>

            
            {islemGecmisi.length === 0 ? (
              <div className="text-center py-8 text-slate-500">Henüz hiçbir alım/satım yapmadınız.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white text-slate-400 text-sm">
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
                      <tr key={islem.id} className="border-b border-white/20 hover:bg-slate-700/30 transition">
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
            <h3 className="text-lg font-medium border-b border-white pb-4 mb-4 mt-8">Nakit Hareketleri</h3>
            {nakitHareketleri.length === 0 ? (
              <div className="text-center py-8 text-slate-500">Henüz nakit hareketi yok.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white text-slate-400 text-sm">
                      <th className="pb-3 pl-2">Tarih / Saat</th>
                      <th className="pb-3">Tür</th>
                      <th className="pb-3">Açıklama</th>
                      <th className="pb-3 text-right pr-2">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nakitHareketleri.map((hareket) => (
                      <tr key={hareket.id} className="border-b border-white/20 hover:bg-slate-700/30 transition">
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
    </div>
  )
}


export default App