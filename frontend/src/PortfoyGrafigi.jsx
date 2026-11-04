// Portföy özet kartları ile portföy değeri / maliyet grafiği.
// Grafik, hisse grafikleriyle aynı görünsün diye Lightweight Charts ile çizilir.
import { useEffect, useRef, useState } from 'react';
import { createChart, LineStyle, LineType } from 'lightweight-charts';
import { toplamKarZarar } from './portfoy';

const YESIL = '#34d399';
const KIRMIZI = '#f87171';
const MALIYET_RENGI = 'rgba(251, 191, 36, 0.7)';

const tl = (tutar) => `${tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
const isaretliTl = (tutar) => `${tutar > 0 ? '+' : ''}${tl(tutar)}`;
const isaretliYuzde = (yuzde) => `${yuzde > 0 ? '+' : ''}${yuzde.toFixed(2)}%`;
const karRengi = (tutar) => (tutar >= 0 ? 'text-emerald-400' : 'text-red-400');
// Gün içi noktalarda date alanı saati de içerir.
const saatliMi = (tarih) => tarih.includes('T');
const tarihYaz = (tarih, secenekler) => new Date(saatliMi(tarih) ? tarih : `${tarih}T00:00:00`).toLocaleDateString('tr-TR', secenekler);
const saatYaz = (tarih) => new Date(tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
// Grafik zamanı UTC gösterdiği için İstanbul saati UTC gibi verilir, eksende aynı saat görünür.
const grafikZamani = (tarih) => (saatliMi(tarih) ? Date.parse(`${tarih}Z`) / 1000 : tarih);

const OzetKarti = ({ baslik, deger, altDeger, renk = 'text-white' }) => (
  <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
    <p className="text-slate-400 text-xs mb-1">{baslik}</p>
    <p className={`text-xl font-bold ${renk}`}>{deger}</p>
    {altDeger && <p className={`text-sm font-medium ${renk}`}>{altDeger}</p>}
  </div>
);

const TooltipSatiri = ({ baslik, deger, renk = 'text-slate-100' }) => (
  <div className="flex justify-between gap-6">
    <span className="text-slate-400">{baslik}</span>
    <span className={`font-medium ${renk}`}>{deger}</span>
  </div>
);

const Mesaj = ({ children }) => (
  <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">{children}</div>
);

// Dönem veya görünüm değişince key ile yeniden kurulur ve veri ekrana sığdırılır.
const PortfoyCizelgesi = ({ seri, karGorunumu, saatGoster }) => {
  const kapsayiciRef = useRef(null);
  const chartRef = useRef(null);
  const anaSeriRef = useRef(null);
  const maliyetSeriRef = useRef(null);
  const sigdirildiRef = useRef(false);
  const [imlec, setImlec] = useState(null);

  useEffect(() => {
    const kapsayici = kapsayiciRef.current;
    const chart = createChart(kapsayici, {
      layout: { background: { type: 'solid', color: '#0f172a' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#334155', style: 1 }, horzLines: { color: '#334155', style: 1 } },
      width: kapsayici.clientWidth || 450,
      height: kapsayici.clientHeight || 250,
      localization: {
        locale: 'tr-TR',
        priceFormatter: (tutar) => tutar.toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
      },
      timeScale: { borderColor: '#475569', timeVisible: saatGoster, secondsVisible: false },
    });

    anaSeriRef.current = chart.addLineSeries({ lineWidth: 2 });
    if (karGorunumu) {
      // Sıfır çizgisi kâr ve zararı ayırır.
      anaSeriRef.current.createPriceLine({ price: 0, color: '#64748b', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
      maliyetSeriRef.current = null;
    } else {
      // Maliyet yalnızca işlem günlerinde basamak yapar.
      maliyetSeriRef.current = chart.addLineSeries({
        color: MALIYET_RENGI,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lineType: LineType.WithSteps,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
    }
    chartRef.current = chart;
    sigdirildiRef.current = false;

    // Bilgi kutusu için imlecin altındaki günün sırası tutulur. İki seride de her gün olduğu için sıra seriyle aynıdır.
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
    const anaDegerler = seri.map(gun => (karGorunumu ? toplamKarZarar(gun) : gun.portfolio_value));
    const sonDeger = anaDegerler[anaDegerler.length - 1];
    // Renk dönem başına göre değil, kârda olup olmamaya göre belirlenir. Değer görünümünde sınır maliyet, kâr/zararda sıfırdır.
    const yukseliste = sonDeger >= (karGorunumu ? 0 : seri[seri.length - 1].total_invested);
    const noktalariGoster = seri.length <= 2;

    anaSeriRef.current.applyOptions({ color: yukseliste ? YESIL : KIRMIZI, pointMarkersVisible: noktalariGoster });
    anaSeriRef.current.setData(seri.map((gun, i) => ({ time: grafikZamani(gun.date), value: anaDegerler[i] })));
    if (maliyetSeriRef.current) {
      maliyetSeriRef.current.applyOptions({ pointMarkersVisible: noktalariGoster });
      maliyetSeriRef.current.setData(seri.map(gun => ({ time: grafikZamani(gun.date), value: gun.total_invested })));
    }
    // Canlı fiyat güncellemesinde kullanıcının yakınlaştırması bozulmasın diye yalnızca ilk çizimde sığdırılır.
    if (!sigdirildiRef.current) {
      chartRef.current.timeScale().fitContent();
      sigdirildiRef.current = true;
    }
  }, [seri, karGorunumu]);

  const gun = imlec && Number.isInteger(imlec.sira) ? seri[imlec.sira] : null;

  return (
    <div className="relative w-full h-full">
      <div ref={kapsayiciRef} className="w-full h-full" />
      {gun && (
        <div
          className="absolute top-2 z-10 w-56 pointer-events-none bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs space-y-1 shadow-lg"
          style={{ left: imlec.x < imlec.genislik / 2 ? imlec.x + 16 : imlec.x - 240 }}
        >
          <p className="font-medium text-slate-200 mb-2">{tarihYaz(gun.date, { day: 'numeric', month: 'long', year: 'numeric' })}{saatliMi(gun.date) && ` ${saatYaz(gun.date)}`}</p>
          <TooltipSatiri baslik="Portföy Değeri" deger={tl(gun.portfolio_value)} />
          <TooltipSatiri baslik="Yatırılan Anapara" deger={tl(gun.total_invested)} />
          <TooltipSatiri baslik="Açık Kâr" deger={isaretliYuzde(gun.unrealized_return_pct)} renk={karRengi(gun.unrealized_return_pct)} />
          <TooltipSatiri baslik="Gerçekleşen Kâr" deger={isaretliTl(gun.realized_pnl)} renk={karRengi(gun.realized_pnl)} />
          <TooltipSatiri baslik="Toplam Kâr/Zarar" deger={isaretliTl(toplamKarZarar(gun))} renk={karRengi(toplamKarZarar(gun))} />
        </div>
      )}
    </div>
  );
};

const PortfoyGrafigi = ({ analiz, seri, yukleniyor, donemler, donem, donemDegistir, kayitsizHisseler }) => {
  // Varsayılan Kâr/Zarar: alımlar ekseni büyütmediği için günlük fiyat hareketleri görünür.
  const [gorunum, setGorunum] = useState('kar');
  const karGorunumu = gorunum === 'kar';
  const ozet = analiz?.summary;
  const reddedilenler = analiz?.warnings.rejected_sales ?? [];
  const eksikFiyatlar = analiz?.warnings.missing_prices ?? [];
  const dugmeStili = (secili) => `px-2 py-1 rounded text-xs font-medium transition ${secili ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`;

  return (
    <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 mb-8 shadow-inner">
      {ozet && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
          <OzetKarti baslik="Portföy Değeri" deger={tl(ozet.portfolio_value)} />
          <OzetKarti baslik="Toplam Maliyet (Anapara)" deger={tl(ozet.total_invested)} />
          <OzetKarti
            baslik="Açık Kâr / Zarar"
            deger={isaretliTl(ozet.unrealized_pnl)}
            altDeger={isaretliYuzde(ozet.unrealized_return_pct)}
            renk={karRengi(ozet.unrealized_pnl)}
          />
          <OzetKarti baslik="Gerçekleşen Kâr" deger={isaretliTl(ozet.realized_pnl)} renk={karRengi(ozet.realized_pnl)} />
        </div>
      )}

      <div className="flex flex-wrap justify-between items-start gap-2 mb-4">
        <div>
          <h4 className="text-slate-300 font-medium">{karGorunumu ? 'Toplam Kâr / Zarar' : 'Portföy Değeri ve Maliyet'}</h4>
          <p className="text-xs text-slate-500 mt-1">
            {karGorunumu
              ? 'Açık ve gerçekleşen kârın toplamı. Alım ve satımlar çizgiyi sıçratmaz, çizgiyi fiyat hareketleri belirler.'
              : 'Alım ve satımlar iki çizgiyi birlikte hareket ettirir. Aradaki fark açık kâr/zarardır.'}
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

      <div className="h-72 w-full rounded-lg border border-slate-700 overflow-hidden">
        {yukleniyor ? (
          <Mesaj>Grafik Yükleniyor...</Mesaj>
        ) : seri.length > 0 ? (
          <PortfoyCizelgesi key={`${donem}-${gorunum}`} seri={seri} karGorunumu={karGorunumu} saatGoster={donem === '1g'} />
        ) : (
          <Mesaj>{analiz ? 'Bu dönemde portföyde hisse yok.' : 'Grafik verisi alınamadı.'}</Mesaj>
        )}
      </div>

      {!karGorunumu && (
        <div className="flex gap-4 mt-3 text-xs text-slate-400">
          <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-emerald-400" />Portföy Değeri</span>
          <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-amber-400" />Toplam Maliyet</span>
        </div>
      )}

      {!yukleniyor && eksikFiyatlar.length > 0 && (
        <p className="text-xs text-amber-300 mt-2">
          Kapanış fiyatı alınamayan günlerde son işlem fiyatıyla hesaplandı: {eksikFiyatlar.map(t => t.replace(/\.IS$/, '')).join(', ')}
        </p>
      )}

      {!yukleniyor && reddedilenler.length > 0 && (
        <p className="text-xs text-amber-300 mt-2">
          Yeterli alım kaydı olmadığı için hesaba katılmayan satışlar: {reddedilenler.map(r => `${r.ticker.replace(/\.IS$/, '')} (${tarihYaz(r.date)})`).join(', ')}
        </p>
      )}

      {!yukleniyor && kayitsizHisseler.length > 0 && (
        <p className="text-xs text-amber-300 mt-2">
          Alım kaydı olmayan lotlar bu özete ve grafiğe dahil edilmedi: {kayitsizHisseler.join(', ')}
        </p>
      )}
    </div>
  );
};

export default PortfoyGrafigi;
