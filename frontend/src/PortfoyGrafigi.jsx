// Portföyün kâr/zarar ve değer grafiği.
// Grafik, hisse grafikleriyle aynı görünsün diye Lightweight Charts ile çizilir.
import { useEffect, useRef, useState } from 'react';
import { createChart, LineStyle } from 'lightweight-charts';
import { GRAFIK_KIRMIZI, GRAFIK_YESIL, isaretliTl, isaretliYuzde, karRengi, tl } from './portfoy';

// Gün içi noktalarda date alanı saati de içerir.
const saatliMi = (tarih) => tarih.includes('T');
const tarihYaz = (tarih, secenekler) => new Date(saatliMi(tarih) ? tarih : `${tarih}T00:00:00`).toLocaleDateString('tr-TR', secenekler);
const saatYaz = (tarih) => new Date(tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
// Grafik zamanı UTC gösterdiği için İstanbul saati UTC gibi verilir, eksende aynı saat görünür.
const grafikZamani = (tarih) => (saatliMi(tarih) ? Date.parse(`${tarih}Z`) / 1000 : tarih);

const TooltipSatiri = ({ baslik, deger, renk = 'text-slate-100' }) => (
  <div className="flex justify-between gap-6">
    <span className="text-slate-400">{baslik}</span>
    <span className={`font-medium ${renk}`}>{deger}</span>
  </div>
);

const Mesaj = ({ children }) => (
  <div className="icerik-gecisi w-full h-full flex items-center justify-center text-slate-500 text-sm">{children}</div>
);

// Dönem veya görünüm değişince key ile yeniden kurulur ve veri ekrana sığdırılır.
const PortfoyCizelgesi = ({ seri, karGorunumu, saatGoster }) => {
  const kapsayiciRef = useRef(null);
  const chartRef = useRef(null);
  const anaSeriRef = useRef(null);
  const sigdirildiRef = useRef(false);
  const [imlec, setImlec] = useState(null);

  useEffect(() => {
    const kapsayici = kapsayiciRef.current;
    const chart = createChart(kapsayici, {
      layout: { background: { type: 'solid', color: '#000000' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#334155', style: 1 }, horzLines: { color: '#334155', style: 1 } },
      width: kapsayici.clientWidth || 450,
      height: kapsayici.clientHeight || 250,
      localization: {
        locale: 'tr-TR',
        priceFormatter: (tutar) => tutar.toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
      },
      rightPriceScale: { borderColor: '#ffffff' },
      timeScale: { borderColor: '#ffffff', timeVisible: saatGoster, secondsVisible: false },
    });

    anaSeriRef.current = chart.addLineSeries({ lineWidth: 2 });
    if (karGorunumu) {
      // Sıfır çizgisi kâr ve zararı ayırır.
      anaSeriRef.current.createPriceLine({ price: 0, color: '#64748b', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
    }
    chartRef.current = chart;
    sigdirildiRef.current = false;

    // Bilgi kutusu için imlecin altındaki günün sırası tutulur. Serideki her gün grafikte olduğu için sıra seriyle aynıdır.
    chart.subscribeCrosshairMove((olay) => {
      setImlec(olay.point && olay.logical !== undefined ? { sira: olay.logical, x: olay.point.x, genislik: kapsayici.clientWidth } : null);
    });

    const resizeObserver = new ResizeObserver((girdiler) => {
      const { width, height } = girdiler[0].contentRect;
      if (width > 0 && height > 0) chart.applyOptions({ width, height });
    });
    resizeObserver.observe(kapsayici);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [karGorunumu, saatGoster]);

  useEffect(() => {
    const anaDegerler = seri.map(gun => (karGorunumu ? gun.donem_kari : gun.portfolio_value));
    const sonDeger = anaDegerler[anaDegerler.length - 1];
    //Değer görünümünde renk, seçilen aralığın ilk değerine göre belirlenir. Kâr/zararda sınır sıfırdır.
    const yukseliste = sonDeger >= (karGorunumu ? 0 : anaDegerler[0]);

    anaSeriRef.current.applyOptions({ color: yukseliste ? GRAFIK_YESIL : GRAFIK_KIRMIZI, pointMarkersVisible: seri.length <= 2 });
    anaSeriRef.current.setData(seri.map((gun, i) => ({ time: grafikZamani(gun.date), value: anaDegerler[i] })));
    // Canlı fiyat güncellemesinde kullanıcının yakınlaştırması bozulmasın diye yalnızca ilk çizimde sığdırılır.
    if (!sigdirildiRef.current) {
      chartRef.current.timeScale().fitContent();
      sigdirildiRef.current = true;
    }
  }, [seri, karGorunumu]);

  const gun = imlec && Number.isInteger(imlec.sira) ? seri[imlec.sira] : null;

  return (
    <div className="icerik-gecisi relative w-full h-full">
      <div ref={kapsayiciRef} className="w-full h-full" />
      {gun && (
        <div
          className="absolute top-2 z-10 w-56 pointer-events-none bg-black border border-white rounded-lg p-3 text-xs space-y-1 shadow-lg"
          style={{ left: imlec.x < imlec.genislik / 2 ? imlec.x + 16 : imlec.x - 240 }}
        >
          <p className="font-medium text-slate-200 mb-2">{tarihYaz(gun.date, { day: 'numeric', month: 'long', year: 'numeric' })}{saatliMi(gun.date) && ` ${saatYaz(gun.date)}`}</p>
          {/* Kâr/Zarar görünümünde yalnızca elde kalan lotlar, Değer görünümünde o günkü portföy gösterilir. */}
          {karGorunumu ? (
            <>
              <TooltipSatiri baslik="Dönem Kâr / Zarar" deger={isaretliTl(gun.donem_kari)} renk={karRengi(gun.donem_kari)} />
              <TooltipSatiri baslik="Dönem Getirisi" deger={isaretliYuzde(gun.donem_getiri)} renk={karRengi(gun.donem_kari)} />
            </>
          ) : (
            <>
              <TooltipSatiri baslik="Portföy Değeri" deger={tl(gun.portfolio_value)} />
              <TooltipSatiri baslik="Yatırılan Anapara" deger={tl(gun.total_invested)} />
            </>
          )}
        </div>
      )}
    </div>
  );
};

const PortfoyGrafigi = ({ analiz, seri, yukleniyor, donemKariHazir, donemler, donem, donemDegistir, kayitsizHisseler }) => {
  // Varsayılan Kâr/Zarar: alımlar ekseni büyütmediği için günlük fiyat hareketleri görünür.
  const [gorunum, setGorunum] = useState('kar');
  // Değer görünümü tek çizgidir; maliyet bilgisi özet kartında ve bilgi kutusunda kalır.
  const karGorunumu = gorunum === 'kar';
  const reddedilenler = analiz?.warnings.rejected_sales ?? [];
  const eksikFiyatlar = analiz?.warnings.missing_prices ?? [];
  const dugmeStili = (secili) => `px-2 py-1 rounded text-xs font-medium transition ${secili ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`;

  return (
    <section className="min-w-0 bg-black rounded-xl border border-white">
      <div className="flex flex-wrap justify-between items-start gap-2 p-5 pb-3">
        <div>
          <h4 className="text-slate-300 font-medium">{karGorunumu ? 'Portföy Kâr / Zarar' : 'Portföy Değeri'}</h4>
          <p className="text-xs text-slate-500 mt-1">
            {karGorunumu
              ? 'Seçilen dönemde elde kalan lotların kâr/zararı. Çizgi dönem başında sıfırdan başlar, satılan lotlar hesaba girmez.'
              : 'Portföyün piyasa değeri. Alım ve satımlar değeri doğrudan değiştirir, kârı Kâr/Zarar görünümü gösterir.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-1">
            <button onClick={() => setGorunum('kar')} className={dugmeStili(karGorunumu)}>Kâr/Zarar</button>
            <button onClick={() => setGorunum('deger')} className={dugmeStili(!karGorunumu)}>Değer</button>
          </div>
          <div className="flex gap-1">
            {donemler.map((secenek) => (
              <button key={secenek.kod} onClick={() => donemDegistir(secenek.kod)} className={dugmeStili(donem === secenek.kod)}>
                {secenek.ad}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-80 w-full px-2 pb-2 overflow-hidden">
        {yukleniyor || (karGorunumu && !donemKariHazir) ? (
          <Mesaj>Grafik Yükleniyor...</Mesaj>
        ) : seri.length > 0 ? (
          <PortfoyCizelgesi key={`${donem}-${gorunum}`} seri={seri} karGorunumu={karGorunumu} saatGoster={donem !== '5y'} />
        ) : (
          //Seri her dönemde son günü içerdiği için boş seri, dönemden değil işlem kaydı olmamasından kaynaklanır.
          <Mesaj>{analiz ? 'Grafik için işlem kaydı bulunamadı.' : 'Grafik verisi alınamadı.'}</Mesaj>
        )}
      </div>

      {!yukleniyor && eksikFiyatlar.length > 0 && (
        <p className="text-xs text-amber-300 px-5 pb-3">
          Kapanış fiyatı alınamayan günlerde son işlem fiyatıyla hesaplandı: {eksikFiyatlar.map(t => t.replace(/\.IS$/, '')).join(', ')}
        </p>
      )}

      {!yukleniyor && reddedilenler.length > 0 && (
        <p className="text-xs text-amber-300 px-5 pb-3">
          Yeterli alım kaydı olmadığı için hesaba katılmayan satışlar: {reddedilenler.map(r => `${r.ticker.replace(/\.IS$/, '')} (${tarihYaz(r.date)})`).join(', ')}
        </p>
      )}

      {!yukleniyor && kayitsizHisseler.length > 0 && (
        <p className="text-xs text-amber-300 px-5 pb-3">
          Alım kaydı olmayan lotlar grafiğe dahil edilmedi: {kayitsizHisseler.join(', ')}
        </p>
      )}
    </section>
  );
};

export default PortfoyGrafigi;
