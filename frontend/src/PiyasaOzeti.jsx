// Piyasa sayfasının sağ sütunundaki hisse özeti, piyasa genişliği ve en çok değişenler.
import { GRAFIK_KIRMIZI, GRAFIK_YESIL, isaretliTl, isaretliYuzde, karRengi } from './portfoy';

const sayi = (deger) => deger.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kisa = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

const Baslik = ({ children }) => <h3 className="mb-3 text-[11px] font-semibold tracking-widest text-slate-400">{children}</h3>;

const Satir = ({ baslik, deger, renk = 'text-white' }) => (
  <div className="flex justify-between py-1 text-sm">
    <span className="text-slate-400">{baslik}</span>
    <span className={`font-semibold tabular-nums ${renk}`}>{deger}</span>
  </div>
);

export const HisseOzeti = ({ hisse, fiyat }) => {
  const onceki = hisse.onceki_kapanis;
  const fark = onceki ? fiyat - onceki : null;
  const aralikVar = hisse.gun_dusuk != null && hisse.gun_yuksek != null && hisse.gun_yuksek > hisse.gun_dusuk;
  // İşaret, fiyatın gün içindeki en düşük ile en yüksek arasındaki yerini gösterir.
  const konum = aralikVar ? Math.min(100, Math.max(0, ((fiyat - hisse.gun_dusuk) / (hisse.gun_yuksek - hisse.gun_dusuk)) * 100)) : 50;

  return (
    <div className="p-4 border-b border-white/20">
      <Baslik>ÖZET</Baslik>
      <Satir baslik="Önceki Kapanış" deger={onceki ? sayi(onceki) : '—'} />
      <Satir baslik="Günlük Değişim" deger={fark === null ? '—' : `${isaretliTl(fark)} (${isaretliYuzde(hisse.degisim)})`} renk={fark === null ? 'text-white' : karRengi(fark)} />
      <Satir baslik="Açılış" deger={hisse.acilis != null ? sayi(hisse.acilis) : '—'} />
      {aralikVar && (
        <div className="py-2">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="font-semibold tabular-nums">{sayi(hisse.gun_dusuk)}</span>
            <span className="text-slate-400">Gün Aralığı</span>
            <span className="font-semibold tabular-nums">{sayi(hisse.gun_yuksek)}</span>
          </div>
          <div className="relative h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${GRAFIK_KIRMIZI}, #fbbf24, ${GRAFIK_YESIL})` }}>
            <span className="absolute -top-1 h-3.5 w-0.5 bg-white" style={{ left: `${konum}%` }} />
          </div>
        </div>
      )}
      <Satir baslik="Hacim (Lot)" deger={hisse.hacim != null ? kisa.format(hisse.hacim) : '—'} />
      <Satir baslik="Hacim (TL)" deger={hisse.hacim != null ? `≈ ${kisa.format(hisse.hacim * fiyat)} ₺` : '—'} />
      {hisse.sektor && <Satir baslik="Sektör" deger={hisse.sektor} />}
    </div>
  );
};

export const PiyasaGenisligi = ({ hisseler }) => {
  const yukselen = hisseler.filter(h => h.degisim > 0).length;
  const dusen = hisseler.filter(h => h.degisim < 0).length;
  const sabit = hisseler.length - yukselen - dusen;
  const oran = (adet) => `${(adet / (hisseler.length || 1)) * 100}%`;

  return (
    <div className="p-4 border-b border-white/20">
      <Baslik>PİYASA GENİŞLİĞİ</Baslik>
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-700">
        <span style={{ width: oran(yukselen), background: GRAFIK_YESIL }} />
        <span style={{ width: oran(sabit) }} className="bg-slate-500" />
        <span style={{ width: oran(dusen), background: GRAFIK_KIRMIZI }} />
      </div>
      <div className="flex justify-between mt-2 text-sm">
        <span className="text-emerald-400">▲ {yukselen} yükselen</span>
        <span className="text-slate-300">{sabit} sabit</span>
        <span className="text-red-400">▼ {dusen} düşen</span>
      </div>
    </div>
  );
};

export const EnCokDegisenler = ({ baslik, hisseler, hisseSec }) => (
  <div className="p-4 border-b border-white/20 last:border-b-0">
    <Baslik>{baslik}</Baslik>
    {hisseler.map(h => (
      <button key={h.sembol} onClick={() => hisseSec(h)} className="w-full grid grid-cols-[1fr_64px_72px] py-1.5 text-sm text-left hover:bg-slate-700/30 rounded">
        <span className="font-bold">{h.sembol}</span>
        <span className="text-right text-slate-300 tabular-nums">{sayi(h.fiyat)}</span>
        <span className={`text-right font-semibold tabular-nums ${karRengi(h.degisim)}`}>{isaretliYuzde(h.degisim)}</span>
      </button>
    ))}
  </div>
);
