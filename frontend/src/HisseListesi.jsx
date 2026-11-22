// Piyasa sayfasının sol sütunu: sekmeler, arama, favoriler ve mini grafikli hisse listesi.
import { useState } from 'react';
import { GRAFIK_KIRMIZI, GRAFIK_YESIL, isaretliYuzde } from './portfoy';

const SEKMELER = [
  { kod: 'tumu', ad: 'Tümü' },
  { kod: 'favori', ad: 'Favoriler' },
  { kod: 'yukselen', ad: 'Yükselen' },
  { kod: 'dusen', ad: 'Düşen' },
];

const MiniGrafik = ({ degerler, yukseliste }) => {
  if (!degerler || degerler.length < 2) return <span />;
  const enKucuk = Math.min(...degerler);
  const aralik = Math.max(...degerler) - enKucuk || 1;
  const noktalar = degerler.map((d, i) => `${(i / (degerler.length - 1)) * 64},${22 - ((d - enKucuk) / aralik) * 20}`).join(' ');
  return (
    <svg width="64" height="24" viewBox="0 0 64 24" aria-hidden="true">
      <polyline points={noktalar} fill="none" stroke={yukseliste ? GRAFIK_YESIL : GRAFIK_KIRMIZI} strokeWidth="1.4" />
    </svg>
  );
};

const degisimKutusu = (degisim) => (degisim === null
  ? 'text-slate-400 bg-slate-700/40'
  : degisim >= 0 ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10');

const HisseListesi = ({ hisseler, aramaMetni, setAramaMetni, seciliSembol, hisseSec, favoriler, favoriDegistir, seciliDegisim, piyasaHatasi }) => {
  const [sekme, setSekme] = useState('tumu');
  const arama = aramaMetni.toLocaleLowerCase('tr-TR');

  let liste = hisseler.filter(h => h.sembol.toLocaleLowerCase('tr-TR').includes(arama) || h.ad.toLocaleLowerCase('tr-TR').includes(arama));
  if (sekme === 'favori') liste = liste.filter(h => favoriler.includes(h.sembol));
  if (sekme === 'yukselen') liste = liste.filter(h => h.degisim > 0).sort((a, b) => b.degisim - a.degisim);
  if (sekme === 'dusen') liste = liste.filter(h => h.degisim < 0).sort((a, b) => a.degisim - b.degisim);

  return (
    <>
      <div className="flex border-b border-white/20 shrink-0">
        {SEKMELER.map(s => (
          <button
            key={s.kod}
            onClick={() => setSekme(s.kod)}
            className={`flex-1 py-3 text-sm font-medium border-b-[3px] transition ${sekme === s.kod ? 'text-emerald-400 border-emerald-400' : 'text-slate-300 border-transparent hover:text-white'}`}
          >
            {s.ad}
          </button>
        ))}
      </div>
      <div className="p-3 shrink-0">
        <input
          type="text"
          placeholder="Hisse Ara..."
          value={aramaMetni}
          onChange={(e) => setAramaMetni(e.target.value)}
          className="w-full bg-black border border-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
        />
      </div>
      {piyasaHatasi && hisseler.length > 0 && (
        <div className="mx-3 mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 shrink-0">
          Veriler güncellenemedi, son alınan fiyatlar gösteriliyor.
        </div>
      )}
      <div className="grid grid-cols-[18px_minmax(0,1fr)_64px_74px] @[340px]:grid-cols-[18px_minmax(0,1fr)_64px_64px_74px] gap-2 px-3 pb-2 text-[11px] text-slate-400 border-b border-white shrink-0">
        <span /><span>SEMBOL</span><span className="hidden @[340px]:block" /><span className="text-right">SON</span><span className="text-center">DEĞ. %</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {liste.map(hisse => {
          const secili = hisse.sembol === seciliSembol;
          const favori = favoriler.includes(hisse.sembol);
          // Seçili hissede dönem değişimi, diğerlerinde günlük değişim gösterilir.
          // Yükselen ve Düşen sekmeleri günlük değişime göre sıralandığı için orada seçili hisse de günlük değişimi gösterir.
          const donemGoster = secili && sekme !== 'yukselen' && sekme !== 'dusen';
          const degisim = donemGoster ? seciliDegisim.deger : hisse.degisim;
          return (
            <div
              key={hisse.id}
              onClick={() => hisseSec(hisse)}
              className={`grid grid-cols-[18px_minmax(0,1fr)_64px_74px] @[340px]:grid-cols-[18px_minmax(0,1fr)_64px_64px_74px] gap-2 items-center px-3 py-2 border-b border-white/20 cursor-pointer transition ${secili ? 'bg-slate-700/40 shadow-[inset_3px_0_0_#34d399]' : 'hover:bg-slate-700/30'}`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); favoriDegistir(hisse.sembol); }}
                aria-label={favori ? `${hisse.sembol} favorilerden çıkar` : `${hisse.sembol} favorilere ekle`}
                className={`text-sm leading-none ${favori ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300'}`}
              >
                {favori ? '★' : '☆'}
              </button>
              <div className="min-w-0">
                <button className="block font-bold text-emerald-400 text-sm" aria-pressed={secili}>{hisse.sembol}</button>
                <p className="text-[11px] text-slate-400 truncate">{hisse.ad}</p>
              </div>
              {/* Liste 340 pikselden darsa mini grafik sembolün üstüne binmesin diye gizlenir. */}
              <span className="hidden @[340px]:block"><MiniGrafik degerler={hisse.gecmis} yukseliste={hisse.degisim >= 0} /></span>
              <span className="text-right font-semibold text-sm tabular-nums">{hisse.fiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={`text-center rounded-md py-1 text-xs font-semibold tabular-nums ${degisimKutusu(degisim)}`}>
                {donemGoster && <span className="mr-1 font-normal text-slate-400">{seciliDegisim.ad}</span>}
                {degisim === null ? '—' : isaretliYuzde(degisim)}
              </span>
            </div>
          );
        })}
        {liste.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            {hisseler.length === 0
              ? (piyasaHatasi ? 'Piyasa verileri alınamadı. Yeniden deneniyor...' : 'Piyasa Verileri Yükleniyor...')
              : sekme === 'favori' && favoriler.length === 0
                ? 'Favori eklemek için yıldıza tıklayın.'
                : 'Bu listede hisse yok.'}
          </div>
        )}
      </div>
      <p className="px-3 py-2 text-xs text-slate-400 border-t border-white/20 shrink-0">{liste.length} / {hisseler.length} hisse</p>
    </>
  );
};

export default HisseListesi;
