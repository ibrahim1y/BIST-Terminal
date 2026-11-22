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
  // Endeksten çıkan portföy hisselerini bulmak için.
  endeksDisiSemboller,
  // Bölünme ve bedelsiz sermaye artırımlarını işlemek için.
  bolunmeleriUygula,
  // Tanıtım için örnek portföy.
  demoPortfoyuOlustur,
  demoSembolleri,
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
// Piyasa sayfasının yeni bileşenleri ve teknik göstergeler.
import GostergeSeridi from './GostergeSeridi';
import HisseListesi from './HisseListesi';
import { EnCokDegisenler, HisseOzeti, PiyasaGenisligi } from './PiyasaOzeti';
import { bollinger, ema, macd, rsi, sma } from './teknik';
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

// Hisse grafiğinde açılıp kapatılabilen göstergeler ve renkleri.
const GRAFIK_GOSTERGELERI = [
  { kod: 'sma20', ad: 'SMA 20' },
  { kod: 'sma50', ad: 'SMA 50' },
  { kod: 'ema20', ad: 'EMA 20' },
  { kod: 'bollinger', ad: 'Bollinger' },
  { kod: 'hacim', ad: 'Hacim' },
  { kod: 'rsi', ad: 'RSI' },
  { kod: 'macd', ad: 'MACD' },
];
const GOSTERGE_RENKLERI = { sma20: '#fbbf24', sma50: '#38bdf8', ema20: '#e879f9', bollinger: '#94a3b8', rsi: '#a78bfa', macd: '#38bdf8', sinyal: '#fbbf24' };
// Hacim, RSI ve MACD grafiğin altında üst üste bantlarda çizilir. Her bant grafik yüksekliğinin bu kadarını kaplar.
const ALT_BANT_YUKSEKLIGI = 0.18;
const fiyatYaz = (deger) => (deger == null ? '—' : deger.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const kisaSayi = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

//Boyut Duyarlı (Responsive) ve Güvenli TradingView Bileşeni
//Grafik türü ve saat gösterimi dışarıdan seçilir.
const TradingViewChart = ({ data, tip, saatGoster, gostergeler = [] }) => {
  const chartContainerRef = useRef();
  //Grafik saklanır; veri değişince baştan kurulmaz, yalnızca verisi güncellenir.
  const chartRef = useRef(null);
  const seriRef = useRef(null);
  const ekSeriRef = useRef({});
  const ilkZamanRef = useRef(null);
  const [imlec, setImlec] = useState(null);
  const gostergeAnahtari = gostergeler.join(',');

  // Temiz veri ve gösterge değerleri bir kez hesaplanır, grafik ve bilgi satırı aynı değerleri kullanır.
  const hazir = useMemo(() => {
    // Veri yoksa veya array boş ise grafiğin çökmemesi için
    if (!Array.isArray(data) || data.length === 0) return null;

    // API'den gelen verileri zorla sayıya çevirir. String veri gelme ihtimaline karşı alınan önlem.
    //Bozuk verileri filtreleyip eskiden yeniye sıralıyoruz.
    const temizVeri = data
      .map(d => ({
        time: d.time,
        open: Number(d.open),
        high: Number(d.high),
        low: Number(d.low),
        close: Number(d.close),
        volume: Number(d.volume ?? 0)
      }))
      .filter(d => !isNaN(d.open) && !isNaN(d.high) && !isNaN(d.low) && !isNaN(d.close))
      .filter((v, i, a) => a.findIndex(t => t.time === v.time) === i)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    if (temizVeri.length === 0) return null;
    const kapanislar = temizVeri.map(d => d.close);
    return {
      temizVeri,
      sma20: sma(kapanislar, 20),
      sma50: sma(kapanislar, 50),
      ema20: ema(kapanislar, 20),
      bollinger: bollinger(kapanislar),
      rsi: rsi(kapanislar),
      macd: macd(kapanislar),
    };
  }, [data]);

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
      localization: { locale: 'tr-TR' },
      rightPriceScale: { borderColor: '#ffffff' },
      timeScale: {
        borderColor: '#ffffff',
        timeVisible: saatGoster,
        secondsVisible: false,
        // Grafik büyüyüp küçülünce mum aralığı değil görünen tarih aralığı korunur, tam ekranda boş alan kalmaz.
        lockVisibleTimeRangeOnResize: true,
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

    // Açık göstergelerin serileri. Hacim, RSI ve MACD kendi bantlarında, diğerleri fiyatın üstünde çizilir.
    const acik = new Set(gostergeAnahtari ? gostergeAnahtari.split(',') : []);
    const altBantlar = ['hacim', 'rsi', 'macd'].filter(kod => acik.has(kod));
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.12, bottom: altBantlar.length * ALT_BANT_YUKSEKLIGI + 0.04 } });
    const bant = (kod) => {
      const sira = altBantlar.length - 1 - altBantlar.indexOf(kod);
      return { top: 1 - (sira + 1) * ALT_BANT_YUKSEKLIGI + 0.03, bottom: sira * ALT_BANT_YUKSEKLIGI };
    };
    const cizgi = (renk, ek = {}) => chart.addLineSeries({ color: renk, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, ...ek });
    const ekler = {};
    if (acik.has('hacim')) {
      ekler.hacim = chart.addHistogramSeries({ priceScaleId: 'hacim', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
      chart.priceScale('hacim').applyOptions({ scaleMargins: bant('hacim') });
    }
    if (acik.has('sma20')) ekler.sma20 = cizgi(GOSTERGE_RENKLERI.sma20, { lineWidth: 1.5 });
    if (acik.has('sma50')) ekler.sma50 = cizgi(GOSTERGE_RENKLERI.sma50, { lineWidth: 1.5 });
    if (acik.has('ema20')) ekler.ema20 = cizgi(GOSTERGE_RENKLERI.ema20, { lineWidth: 1.5 });
    if (acik.has('bollinger')) {
      ekler.bbUst = cizgi(GOSTERGE_RENKLERI.bollinger, { lineStyle: 2 });
      ekler.bbOrta = cizgi(GOSTERGE_RENKLERI.bollinger);
      ekler.bbAlt = cizgi(GOSTERGE_RENKLERI.bollinger, { lineStyle: 2 });
    }
    if (acik.has('rsi')) {
      ekler.rsi = cizgi(GOSTERGE_RENKLERI.rsi, { priceScaleId: 'rsi', lineWidth: 1.5 });
      chart.priceScale('rsi').applyOptions({ scaleMargins: bant('rsi') });
      // 70 üstü aşırı alım, 30 altı aşırı satım bölgesi.
      [70, 30].forEach(seviye => ekler.rsi.createPriceLine({ price: seviye, color: '#64748b', lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
    }
    if (acik.has('macd')) {
      ekler.macdHistogram = chart.addHistogramSeries({ priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });
      ekler.macd = cizgi(GOSTERGE_RENKLERI.macd, { priceScaleId: 'macd' });
      ekler.sinyal = cizgi(GOSTERGE_RENKLERI.sinyal, { priceScaleId: 'macd' });
      chart.priceScale('macd').applyOptions({ scaleMargins: bant('macd') });
    }
    ekSeriRef.current = ekler;
    chartRef.current = chart;
    ilkZamanRef.current = null;

    // Bilgi satırı imlecin altındaki mumu gösterir, imleç yoksa son mumu.
    chart.subscribeCrosshairMove(olay => setImlec(olay.point && olay.logical !== undefined ? Math.round(olay.logical) : null));

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
      ekSeriRef.current = {};
    };
  }, [tip, saatGoster, gostergeAnahtari]);

  //Veri değişince mevcut grafiğin verisi güncellenir.
  useEffect(() => {
    if (!seriRef.current || !hazir) return;
    const { temizVeri } = hazir;

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

      // Gösterge verileri. Hesaplanamayan başlangıç noktaları boş bırakılır.
      const zamanlar = temizVeri.map(d => d.time);
      const yaz = (seri, degerler) => seri?.setData(degerler.map((v, i) => (v === null ? { time: zamanlar[i] } : { time: zamanlar[i], value: v })));
      const ek = ekSeriRef.current;
      ek.hacim?.setData(temizVeri.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(0, 255, 94, 0.35)' : 'rgba(255, 31, 31, 0.35)' })));
      yaz(ek.sma20, hazir.sma20);
      yaz(ek.sma50, hazir.sma50);
      yaz(ek.ema20, hazir.ema20);
      yaz(ek.bbUst, hazir.bollinger.ust);
      yaz(ek.bbOrta, hazir.bollinger.orta);
      yaz(ek.bbAlt, hazir.bollinger.alt);
      yaz(ek.rsi, hazir.rsi);
      ek.macdHistogram?.setData(hazir.macd.histogram.map((v, i) => (v === null
        ? { time: zamanlar[i] }
        : { time: zamanlar[i], value: v, color: v >= 0 ? 'rgba(0, 255, 94, 0.5)' : 'rgba(255, 31, 31, 0.5)' })));
      yaz(ek.macd, hazir.macd.macd);
      yaz(ek.sinyal, hazir.macd.sinyal);

      //Her güncellemede değil, grafiğin başlangıcı değişince sığdırılır. Kullanıcının yakınlaştırması bozulmaz.
      if (ilkZamanRef.current !== temizVeri[0].time) {
        chartRef.current.timeScale().fitContent();
        ilkZamanRef.current = temizVeri[0].time;
      }
    } catch (e) {
      console.error("TradingView Çizim Hatası:", e);
    }
  }, [hazir, tip, saatGoster, gostergeAnahtari]);

  // Açılış, yüksek, düşük, kapanış, değişim, hacim ve açık göstergelerin değerleri.
  const sira = hazir ? (imlec !== null && imlec >= 0 && imlec < hazir.temizVeri.length ? imlec : hazir.temizVeri.length - 1) : null;
  const mum = sira !== null ? hazir.temizVeri[sira] : null;
  const oncekiKapanis = sira > 0 ? hazir.temizVeri[sira - 1].close : null;
  const acikGostergeler = new Set(gostergeler);
  const gostergeDegeri = (kod, ad, deger, ondalik = 2) => (acikGostergeler.has(kod) && deger != null
    ? <span key={ad} style={{ color: GOSTERGE_RENKLERI[ad === 'Sinyal' ? 'sinyal' : kod] }}>{ad} {deger.toLocaleString('tr-TR', { maximumFractionDigits: ondalik, minimumFractionDigits: ondalik })}</span>
    : null);

  return (
    <div className="relative w-full h-full">
      {mum && (
        <div className="absolute left-2 top-1 right-20 z-10 pointer-events-none flex flex-wrap gap-x-3 text-xs text-slate-400">
          <span>A <b className="text-white">{fiyatYaz(mum.open)}</b></span>
          <span>Y <b className="text-white">{fiyatYaz(mum.high)}</b></span>
          <span>D <b className="text-white">{fiyatYaz(mum.low)}</b></span>
          <span>K <b className="text-white">{fiyatYaz(mum.close)}</b></span>
          {oncekiKapanis > 0 && <b className={karRengi(mum.close - oncekiKapanis)}>{isaretliYuzde(((mum.close - oncekiKapanis) / oncekiKapanis) * 100)}</b>}
          {mum.volume > 0 && <span>Hacim <b className="text-white">{kisaSayi.format(mum.volume)}</b></span>}
          {gostergeDegeri('sma20', 'SMA20', hazir.sma20[sira])}
          {gostergeDegeri('sma50', 'SMA50', hazir.sma50[sira])}
          {gostergeDegeri('ema20', 'EMA20', hazir.ema20[sira])}
          {gostergeDegeri('bollinger', 'BB', hazir.bollinger.orta[sira])}
          {gostergeDegeri('rsi', 'RSI', hazir.rsi[sira], 1)}
          {gostergeDegeri('macd', 'MACD', hazir.macd.macd[sira])}
          {gostergeDegeri('macd', 'Sinyal', hazir.macd.sinyal[sira])}
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
};

function App() {
  // Uygulama portföy sekmesiyle açılır.
  const [aktifSekme, setAktifSekme] = useState('portfoy'); 
  const [hisseler, setHisseler] = useState([]);
  // Portföyde olup endekste olmayan hisselerin piyasa bilgisi.
  const [ekHisseler, setEkHisseler] = useState([]);
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
  // Hisse grafiğinde açık göstergeler ve tarayıcıda saklanan favori hisseler.
  const [grafikGostergeleri, setGrafikGostergeleri] = useState(['sma20', 'hacim']);
  // Hisse grafiği tam ekran açılabilir. Tarayıcı izin verirse pencere de tam ekrana geçer, vermezse grafik sayfayı kaplar.
  const [grafikTamEkran, setGrafikTamEkran] = useState(false);
  const tamEkranDegistir = () => {
    if (grafikTamEkran) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setGrafikTamEkran(false);
    } else {
      setGrafikTamEkran(true);
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };
  const gostergeDegistir = (kod) => setGrafikGostergeleri(onceki => (onceki.includes(kod) ? onceki.filter(k => k !== kod) : [...onceki, kod]));
  const [favoriler, setFavoriler] = useState(() => {
    try {
      const kayit = JSON.parse(localStorage.getItem('bist_favoriler'));
      return Array.isArray(kayit) ? kayit.filter(s => typeof s === 'string') : [];
    } catch {
      return [];
    }
  });
  const favoriDegistir = (sembol) => setFavoriler(onceki => (onceki.includes(sembol) ? onceki.filter(s => s !== sembol) : [...onceki, sembol]));
  // Portföy grafiğinin dönemi ve verisi, hisse grafiğinden ayrı tutulmalı.
  const [portfoyDonemi, setPortfoyDonemi] = useState('3a');
  // Sonuç ait olduğu hisselerle ve dönemle tutulur, dönem değişince eski seri gösterilmez.
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

  // İşlenmiş bölünmeler saklanır, aynı bölünme ikinci kez uygulanmaz.
  const [uygulananBolunmeler, setUygulananBolunmeler] = useState(() => {
    try {
      const kayit = JSON.parse(localStorage.getItem('bist_bolunmeler'));
      return Array.isArray(kayit) ? kayit.filter(s => typeof s === 'string') : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('bist_bolunmeler', JSON.stringify(uygulananBolunmeler));
  }, [uygulananBolunmeler]);

  useEffect(() => {
    localStorage.setItem('bist_favoriler', JSON.stringify(favoriler));
  }, [favoriler]);

  // Esc ile ya da tarayıcının tam ekranından çıkınca grafik de normale döner.
  useEffect(() => {
    if (!grafikTamEkran) return;
    const tusla = (olay) => { if (olay.key === 'Escape') setGrafikTamEkran(false); };
    const pencereCikti = () => { if (!document.fullscreenElement) setGrafikTamEkran(false); };
    window.addEventListener('keydown', tusla);
    document.addEventListener('fullscreenchange', pencereCikti);
    return () => {
      window.removeEventListener('keydown', tusla);
      document.removeEventListener('fullscreenchange', pencereCikti);
    };
  }, [grafikTamEkran]);

  // 2. Portföy state'i her değiştiğinde hafıza otomatik güncellenir.
  useEffect(() => {
    localStorage.setItem('bist_portfoy', JSON.stringify(portfoy));
  }, [portfoy]);
  
  // 3. İşlem geçmişi state'i her değiştiğinde hafıza otomatik güncellenir.
  useEffect(() => {
    localStorage.setItem('bist_islem_gecmisi', JSON.stringify(islemGecmisi));
  }, [islemGecmisi]);

  // VERİ GÜNCELLEME DÖNGÜSÜ (POLLING)
  // Bütün istekler göreli /api adresine gider. Yayında site ve API aynı sunucudadır,
  // geliştirmede Vite bu istekleri 8000 portundaki backend'e yönlendirir.
  const piyasaVerileriniGetir = () => {
    //Python backend API'sinden verileri çeker.
    fetch('/api/hisseler')
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

  // Endeksten çıkan ama portföyde duran hisseler piyasa listesinde gelmez.
  // Bu hisseler her piyasa güncellemesinden sonra ayrıca sorulur, fiyatları ve satış bilgileri güncel kalır.
  const endeksDisi = endeksDisiSemboller(portfoy, hisseler).join(',');
  useEffect(() => {
    if (!endeksDisi) return;
    let iptal = false;
    fetch(`/api/hisseler/ek?semboller=${encodeURIComponent(endeksDisi)}`)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (iptal || !Array.isArray(data)) return;
        setEkHisseler(data);
        setSonFiyatlar(onceki => ({ ...onceki, ...Object.fromEntries(data.map(h => [h.sembol, h.fiyat])) }));
      })
      .catch(error => {
        if (!iptal) console.error('Endeks dışı hisse verisi alınamadı:', error);
      });
    return () => { iptal = true; };
  }, [endeksDisi, hisseler]);

  // İşlem geçmişindeki hisselerin bölünmeleri sorulur, yeni bir bölünme varsa eski işlemler düzeltilir.
  // Kayıtlar her değiştiğinde yeniden kontrol edilir; backend sonucu önbellekte tuttuğu için bu istek hafiftir.
  const islemSembolleri = [...new Set(islemGecmisi.map(islem => islem.sembol))].sort().join(',');
  useEffect(() => {
    if (!islemSembolleri) return;
    let iptal = false;
    fetch(`/api/bolunmeler?semboller=${encodeURIComponent(islemSembolleri)}`)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(bolunmeler => {
        if (iptal) return;
        const sonuc = bolunmeleriUygula(
          { portfoy, islemler: islemGecmisi, nakit: nakitHareketleri, uygulananlar: uygulananBolunmeler },
          bolunmeler,
        );
        if (!sonuc) return;
        setPortfoy(sonuc.portfoy);
        setIslemGecmisi(sonuc.islemler);
        setNakitHareketleri(sonuc.nakit);
        setUygulananBolunmeler(sonuc.uygulananlar);
        if (sonuc.islenenler.length > 0) {
          alert(sonuc.islenenler.map(({ sembol, tarih, oran, kusurat }) =>
            `${sembol}: ${tarih} tarihli bölünme işlendi, 1 lot ${oran.toLocaleString('tr-TR')} lot oldu.`
            + (kusurat > 0 ? ` ${kusurat.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} lot küsurat nakde çevrildi.` : '')).join('\n'));
        }
      })
      .catch(error => {
        if (!iptal) console.error('Bölünme verisi alınamadı:', error);
      });
    return () => { iptal = true; };
  }, [islemSembolleri, portfoy, islemGecmisi, nakitHareketleri, uygulananBolunmeler]);

  // Fiyat ve satış için kullanılan liste. Piyasa listesi ve sekmeler yalnızca endeks hisselerini gösterir.
  // Artık portföyde olmayan ya da endekse geri dönen hisselerin eski kaydı kullanılmaz.
  const tumHisseler = useMemo(() => {
    const disarida = new Set(endeksDisi.split(','));
    return [...hisseler, ...ekHisseler.filter(h => disarida.has(h.sembol))];
  }, [hisseler, ekHisseler, endeksDisi]);

  useEffect(() => {
    if (seciliHisse) {
      const sembol = seciliHisse.sembol;
      //Seçilen dönem backend'e gönderilir, dönem değişince veri yeniden çekilir.
      const donem = grafikDonemi;
      let iptal = false;
      fetch(`/api/grafik/${sembol}?donem=${donem}`)
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
      const veriyiGetir = () => fetch(`/api/portfoy-analiz${anahtar === 'gunluk' ? '' : `/gun-ici?donem=${anahtar}`}`, {
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
      const veriyiGetir = () => fetch('/api/portfoy-donem-kari', {
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

  // Seçilen hissenin fiyatı güncel piyasadan okunur, işlem panelindeki fiyat da güncel kalır.
  // Seçili hissenin fiyatı, günlük değişimi ve özeti endeks dışı hisseler için de ek listeden okunur.
  const seciliFiyat = tumHisseler.find(h => h.sembol === seciliHisse?.sembol)?.fiyat ?? seciliHisse?.fiyat;

  // Pencere kalktığı için işlemden sonra hisse seçili kalır, yalnızca form temizlenir.
  const islemFormunuTemizle = () => {
    setLotMiktari('');
    setIslemTipi('AL');
  };

  const hisseSec = (hisse) => {
    setSeciliHisse(hisse);
    setLotMiktari('');
  };

  // Dar ekranda liste grafiğin altında kaldığı için seçimden sonra sayfa başa kayar.
  const listedenSec = (hisse) => {
    hisseSec(hisse);
    if (window.innerWidth < 1280) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const seciliGuncel = tumHisseler.find(h => h.sembol === seciliHisse?.sembol) ?? seciliHisse;
  const enCokYukselenler = [...hisseler].filter(h => h.degisim > 0).sort((a, b) => b.degisim - a.degisim).slice(0, 5);
  const enCokDusenler = [...hisseler].filter(h => h.degisim < 0).sort((a, b) => a.degisim - b.degisim).slice(0, 5);

  const eldekiLot = portfoy.find(p => p.sembol === seciliHisse?.sembol)?.lot ?? 0;
  const seciliDegisim = tumHisseler.find(h => h.sembol === seciliHisse?.sembol)?.degisim ?? seciliHisse?.degisim ?? 0;
  // Seçili hisse dönem değişimini gösterir. 1G önceki kapanışa göre günlük değişimdir, grafik yüklenirken değer gösterilmez.
  const grafikHazir = grafikSonucu.sembol === seciliHisse?.sembol && grafikSonucu.donem === grafikDonemi;
  const seciliDonemDegisimi = grafikDonemi === '1g' ? seciliDegisim : (grafikHazir ? donemDegisimi(grafikSonucu.veri, seciliFiyat) : null);
  const seciliDonemAdi = GRAFIK_DONEMLERI.find(d => d.kod === grafikDonemi).ad;
  const degisimYaz = (degisim) => (degisim === null ? '—' : isaretliYuzde(degisim));
  const degisimRengi = (degisim) => (degisim === null ? 'text-slate-400' : karRengi(degisim));

  // Örnek portföy, demo hisselerinin son 3 aylık gerçek kapanışlarıyla kurulur.
  // Yalnızca portföy ve geçmiş boşken sunulur, böylece kullanıcının kendi kayıtlarına karışmaz.
  const [demoYukleniyor, setDemoYukleniyor] = useState(false);
  const demoYukle = async () => {
    setDemoYukleniyor(true);
    try {
      const grafikler = Object.fromEntries(await Promise.all(demoSembolleri().map(async sembol => {
        const yanit = await fetch(`/api/grafik/${sembol}?donem=3a`);
        return [sembol, yanit.ok ? await yanit.json() : []];
      })));
      const demo = demoPortfoyuOlustur(grafikler);
      if (!demo) throw new Error('Demo için fiyat verisi alınamadı');
      setPortfoy(demo.portfoy);
      setIslemGecmisi(demo.islemler);
      setNakitHareketleri(demo.nakit);
    } catch (error) {
      console.error('Demo portföy yüklenemedi:', error);
      alert('Demo portföy için fiyat verisi alınamadı, biraz sonra tekrar deneyin.');
    } finally {
      setDemoYukleniyor(false);
    }
  };

  // Portföy, işlem geçmişi ve nakit hareketleri silinir. Demoyu deneyen biri baştan başlayabilir.
  const portfoyuSifirla = () => {
    if (!confirm('Portföy, işlem geçmişi ve nakit hareketleri silinecek. Emin misiniz?')) return;
    setPortfoy([]);
    setIslemGecmisi([]);
    setNakitHareketleri([]);
    setUygulananBolunmeler([]);
  };
  const kayitVar = portfoy.length > 0 || islemGecmisi.length > 0 || nakitHareketleri.length > 0;

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
  // Endeks dışı hisse ayrıca güncellendiyse "son veri" sayılmaz.
  const fiyatEskiMi = item => piyasaHatasi || !tumHisseler.some(h => h.sembol === item.sembol);
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
          {/* Ürün adında Borsa İstanbul'un markası (BIST) kullanılmaz. */}
          Borsa <span className="text-white font-medium text-lg">Terminal</span>
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
      <GostergeSeridi />

      {/* key sayesinde her sekme değişiminde perde yeniden açılır. Tıklamaları engellemez. */}
      <div key={aktifSekme} className="perde-gecisi fixed inset-0 z-10 bg-black pointer-events-none" aria-hidden="true" />
      <main className={`p-4 sm:p-7 mx-auto space-y-5 ${aktifSekme === 'piyasa' ? 'max-w-[1800px]' : 'max-w-[1400px]'}`}>
        {/* Ücretsiz sunucu uykudan uyanırken ilk veri bir dakika kadar gecikebilir, ziyaretçi bunu bilsin. */}
        {hisseler.length === 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            {piyasaHatasi
              ? 'Sunucuya ulaşılamadı, yeniden deneniyor...'
              : 'Piyasa verileri yükleniyor. Sunucu uyku modundaysa ilk açılış bir dakika kadar sürebilir.'}
          </div>
        )}
        {/* Solda hisse listesi, ortada göstergeli grafik, sağda al/sat ve piyasa özeti. Geniş ekranda sayfa kaydırmadan sığar. */}
        {aktifSekme === 'piyasa' && (
          // Orta genişlikte liste solda sabit durur, grafik ve al/sat sağda alt alta. Telefonda liste grafiğin hemen altına gelir.
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_330px] xl:h-[calc(100vh-11rem)] xl:min-h-[640px]">
            <section className="@container order-2 lg:order-none lg:row-span-2 xl:row-span-1 min-w-0 bg-black rounded-xl border border-white flex flex-col h-[60vh] lg:h-[calc(100vh-6rem)] lg:sticky lg:top-20 lg:self-start xl:static xl:h-auto xl:self-auto xl:min-h-0 overflow-hidden">
              <HisseListesi
                hisseler={hisseler}
                aramaMetni={aramaMetni}
                setAramaMetni={setAramaMetni}
                seciliSembol={seciliHisse?.sembol}
                hisseSec={listedenSec}
                favoriler={favoriler}
                favoriDegistir={favoriDegistir}
                seciliDegisim={{ deger: seciliDonemDegisimi, ad: seciliDonemAdi }}
                piyasaHatasi={piyasaHatasi}
              />
            </section>

            <section className={`min-w-0 bg-black border border-white flex flex-col overflow-hidden ${grafikTamEkran ? 'fixed inset-0 z-50 rounded-none' : 'order-1 lg:order-none rounded-xl h-[560px] xl:h-auto xl:min-h-0'}`}>
              {seciliHisse ? (
                <>
                  <div className="px-5 py-3 border-b border-white/20 flex flex-wrap items-center gap-x-6 gap-y-2 shrink-0">
                    <div className="min-w-0">
                      <h3 className="text-2xl font-bold text-white">{seciliHisse.sembol}</h3>
                      <p className="text-xs text-slate-400 truncate">{[seciliGuncel.ad !== seciliGuncel.sembol && seciliGuncel.ad, seciliGuncel.sektor].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="flex items-baseline gap-3">
                      {/* Panelde fiyat güncel kalır. */}
                      <span className="text-3xl font-bold tabular-nums">{fiyatYaz(seciliFiyat)}</span>
                      <span className={`text-sm font-semibold ${degisimRengi(seciliDonemDegisimi)}`}>{seciliDonemAdi} {degisimYaz(seciliDonemDegisimi)}</span>
                    </div>
                    <div className="ml-auto flex gap-1">
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
                      <button
                        onClick={tamEkranDegistir}
                        aria-label={grafikTamEkran ? 'Tam ekrandan çık' : 'Grafiği tam ekran aç'}
                        title={grafikTamEkran ? 'Tam ekrandan çık (Esc)' : 'Tam ekran'}
                        className="ml-1 px-2 py-1 rounded text-xs font-medium transition bg-slate-700 text-slate-300 hover:bg-slate-600"
                      >
                        {grafikTamEkran ? '✕ Küçült' : '⛶ Tam Ekran'}
                      </button>
                    </div>
                  </div>
                  <div className="px-5 pt-3 pb-1 flex flex-wrap items-center gap-1.5 shrink-0">
                    {GRAFIK_DONEMLERI.map((secenek) => (
                      <button
                        key={secenek.kod}
                        onClick={() => setGrafikDonemi(secenek.kod)}
                        className={`px-2 py-1 rounded text-xs font-medium transition ${grafikDonemi === secenek.kod ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                      >
                        {secenek.ad}
                      </button>
                    ))}
                    <span className="mx-2 h-5 w-px bg-white/20" />
                    {GRAFIK_GOSTERGELERI.map((g) => (
                      <button
                        key={g.kod}
                        onClick={() => gostergeDegistir(g.kod)}
                        aria-pressed={grafikGostergeleri.includes(g.kod)}
                        className={`px-2 py-1 rounded text-xs font-medium transition ${grafikGostergeleri.includes(g.kod) ? 'text-amber-400 ring-1 ring-amber-400' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                      >
                        {g.ad}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 min-h-0 w-full px-2 pb-2 overflow-hidden relative">
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
                              gostergeler={grafikGostergeleri}
                            />
                          </div>
                      ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                              Grafik verisi alınamadı.
                          </div>
                      )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Piyasa Verileri Yükleniyor...</div>
              )}
            </section>

            <div className="order-3 lg:order-none min-w-0 bg-black rounded-xl border border-white xl:min-h-0 xl:overflow-y-auto">
              {seciliHisse && (
                <div className="p-4 border-b border-white/20 space-y-2.5">
                  <h3 className="text-[11px] font-semibold tracking-widest text-slate-400">AL / SAT</h3>
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
              )}
              {seciliGuncel && <HisseOzeti hisse={seciliGuncel} fiyat={seciliFiyat} />}
              {hisseler.length > 0 && (
                <>
                  <PiyasaGenisligi hisseler={hisseler} />
                  <EnCokDegisenler baslik="EN ÇOK YÜKSELENLER" hisseler={enCokYukselenler} hisseSec={listedenSec} />
                  <EnCokDegisenler baslik="EN ÇOK DÜŞENLER" hisseler={enCokDusenler} hisseSec={listedenSec} />
                </>
              )}
            </div>
          </div>
        )}

        {/* Dış çerçeve kalktı. Özet tek şeritte, grafik ve dağılım yan yana. */}
        {aktifSekme === 'portfoy' && (
          <>
            {/* Hiç kaydı olmayan ziyaretçi için kısa tanıtım ve örnek portföy. */}
            {!kayitVar && (
              <section className="rounded-xl border border-emerald-500/60 bg-emerald-500/5 p-5 flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1 basis-80">
                  <h2 className="text-lg font-bold text-white">Borsa Terminal'e hoş geldiniz</h2>
                  <p className="text-sm text-slate-300 mt-1">
                    Borsa İstanbul hisseleriyle sanal alım-satım simülasyonu. Hızlıca görmek için son 3 ayın gerçek fiyatlarıyla kurulmuş
                    örnek portföyü yükleyin ya da Para Yatır ile kendi portföyünüzü oluşturun.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={demoYukle}
                    disabled={demoYukleniyor}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap"
                  >
                    {demoYukleniyor ? 'Yükleniyor...' : 'Demo portföyü yükle'}
                  </button>
                  <button
                    onClick={() => setAktifSekme('piyasa')}
                    className="border border-white hover:bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap"
                  >
                    Piyasaya git
                  </button>
                </div>
              </section>
            )}
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
              {/* Kayıt varsa portföyü sıfırlama düğmesi. */}
              <div className="flex items-center justify-between gap-3 p-5 pb-3">
                <h3 className="font-medium">Hisselerim</h3>
                {kayitVar && (
                  <button onClick={portfoyuSifirla} className="text-xs text-slate-400 hover:text-red-400 transition">
                    Portföyü sıfırla
                  </button>
                )}
              </div>
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
                        // Endeksten çıkan hisse de satılabilsin diye ek liste de aranır.
                        const guncelVeri = tumHisseler.find(h => h.sembol === item.sembol);
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
                        <td className="py-4 font-bold text-white">
                          {islem.sembol}
                          {/* Bölünmeyle düzeltilen ve bölünme küsuratı olarak satılan kayıtlar işaretlenir. */}
                          {islem.bolunme > 1 && <span className="ml-2 text-xs font-normal text-amber-300">bölünme ×{islem.bolunme.toLocaleString('tr-TR')}</span>}
                          {islem.kusurat && <span className="ml-2 text-xs font-normal text-amber-300">küsurat</span>}
                        </td>
                        <td className="py-4 text-right text-sm">{islem.fiyat.toFixed(2)} ₺</td>
                        <td className="py-4 text-right text-sm">{islem.lot.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}</td>
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
      {/* Her sayfada görünen uyarı ve kaynak kod bağlantısı. */}
      {/* Veri kaynakları, bağımsızlık ve marka bildirimi eklendi. */}
      <footer className="border-t border-white/20 px-4 sm:px-7 py-4 text-xs text-slate-500 flex flex-wrap justify-between gap-x-6 gap-y-2">
        <div className="space-y-1 max-w-4xl">
          <p>Eğitim amaçlı, ticari olmayan bir simülasyondur. Gerçek emir gönderilmez, gerçek para kullanılmaz, yatırım tavsiyesi değildir.</p>
          <p>Fiyatlar Yahoo Finance'ten gecikmeli alınır ve doğruluğu garanti edilmez. Şirket adları İş Yatırım'dan, endeks üyeleri ve sektörler KAP'tan alınır.</p>
          <p>Bu site Borsa İstanbul, Yahoo, KAP veya İş Yatırım ile bağlantılı değildir. BIST ve BIST 100, Borsa İstanbul A.Ş.'nin markalarıdır.</p>
        </div>
        <a href="https://github.com/ibrahim1y/BIST-Terminal" target="_blank" rel="noreferrer" className="hover:text-white transition">Kaynak kod: GitHub</a>
      </footer>
    </div>
  )
}


export default App