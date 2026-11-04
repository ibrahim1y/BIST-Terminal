// Portföy özet kartları ile portföy değeri / maliyet grafiği.
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Bu sayıdan fazla günde çizgiler birbirine girip grafiği kapatacağı için gün sınırları gösterilmez.
const GUN_SINIRI_LIMITI = 120;

const tl = (tutar) => `${tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
const isaretliTl = (tutar) => `${tutar > 0 ? '+' : ''}${tl(tutar)}`;
const isaretliYuzde = (yuzde) => `${yuzde > 0 ? '+' : ''}${yuzde.toFixed(2)}%`;
const karRengi = (tutar) => (tutar >= 0 ? 'text-emerald-400' : 'text-red-400');
// Gün içi noktalarda date alanı saati de içerir.
const saatliMi = (tarih) => tarih.includes('T');
const tarihYaz = (tarih, secenekler) => new Date(saatliMi(tarih) ? tarih : `${tarih}T00:00:00`).toLocaleDateString('tr-TR', secenekler);
const saatYaz = (tarih) => new Date(tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

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

const OzelTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const gun = payload[0].payload;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs space-y-1 shadow-lg">
      <p className="font-medium text-slate-200 mb-2">{tarihYaz(gun.date, { day: 'numeric', month: 'long', year: 'numeric' })}{saatliMi(gun.date) && ` ${saatYaz(gun.date)}`}</p>
      <TooltipSatiri baslik="Portföy Değeri" deger={tl(gun.portfolio_value)} />
      <TooltipSatiri baslik="Yatırılan Anapara" deger={tl(gun.total_invested)} />
      <TooltipSatiri baslik="Açık Kâr" deger={isaretliYuzde(gun.unrealized_return_pct)} renk={karRengi(gun.unrealized_return_pct)} />
      <TooltipSatiri baslik="Gerçekleşen Kâr" deger={isaretliTl(gun.realized_pnl)} renk={karRengi(gun.realized_pnl)} />
    </div>
  );
};

const Mesaj = ({ children }) => (
  <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">{children}</div>
);

const PortfoyGrafigi = ({ analiz, seri, yukleniyor, donemler, donem, donemDegistir, kayitsizHisseler }) => {
  const ozet = analiz?.summary;
  const reddedilenler = analiz?.warnings.rejected_sales ?? [];
  const eksikFiyatlar = analiz?.warnings.missing_prices ?? [];

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
          <h4 className="text-slate-300 font-medium">Portföy Değeri ve Maliyet</h4>
          <p className="text-xs text-slate-500 mt-1">Alım ve satımlar iki çizgiyi birlikte hareket ettirir. Aradaki fark açık kâr/zarardır.</p>
        </div>
        <div className="flex gap-1">
          {donemler.map((secenek) => (
            <button
              key={secenek.kod}
              onClick={() => donemDegistir(secenek.kod)}
              className={`px-2 py-1 rounded text-xs font-medium transition ${donem === secenek.kod ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              {secenek.ad}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72 w-full rounded-lg border border-slate-700 overflow-hidden p-2">
        {yukleniyor ? (
          <Mesaj>Grafik Yükleniyor...</Mesaj>
        ) : seri.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={seri} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="portfoyDolgu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
              {donem !== '1g' && seri.length <= GUN_SINIRI_LIMITI && seri.map((gun) => (
                <ReferenceLine key={gun.date} x={gun.date} stroke="#334155" strokeOpacity={0.6} />
              ))}
              <XAxis
                dataKey="date"
                tickFormatter={(tarih) => (saatliMi(tarih) ? saatYaz(tarih) : tarihYaz(tarih, { day: '2-digit', month: 'short' }))}
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                minTickGap={40}
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(tutar) => tutar.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                width={72}
              />
              <Tooltip content={OzelTooltip} />
              {/* Fiyatlar 15 saniyede bir yenilendiği için animasyon kapalı; tek günlük veride nokta gösterilir. */}
              {/* İki çizgi de stepAfter: yumuşak çizgi işlem gününe doğru erken yükselip maliyetin üstünde sahte kâr boşluğu gösteriyordu. */}
              <Area
                type="stepAfter"
                dataKey="portfolio_value"
                stroke="#34d399"
                strokeWidth={2}
                fill="url(#portfoyDolgu)"
                dot={seri.length <= 2}
                isAnimationActive={false}
              />
              {/* stepAfter: maliyet yalnızca işlem günlerinde basamak yapar. */}
              <Line
                type="stepAfter"
                dataKey="total_invested"
                stroke="#fbbf24"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={seri.length <= 2}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <Mesaj>{analiz ? 'Bu dönemde portföyde hisse yok.' : 'Grafik verisi alınamadı.'}</Mesaj>
        )}
      </div>

      <div className="flex gap-4 mt-3 text-xs text-slate-400">
        <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-emerald-400" />Portföy Değeri</span>
        <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-amber-400" />Toplam Maliyet</span>
      </div>

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
