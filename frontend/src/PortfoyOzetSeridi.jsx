// Üst şerit: portföy değeri, maliyet ve seçilen dönemin kâr/zararı.
import { useState } from 'react';
import { donemKari, isaretliTl, isaretliYuzde, karRengi, tl } from './portfoy';

const PortfoyOzetSeridi = ({ portfoyDegeri, toplamMaliyet, donemler, donemKariVerisi, sonFiyatlar }) => {
  const [donemSirasi, setDonemSirasi] = useState(0);
  const donem = donemler[donemSirasi];
  const pozisyonlar = donemKariVerisi?.periods[donem.kod];
  const kar = pozisyonlar ? donemKari(pozisyonlar, sonFiyatlar, donemKariVerisi.last_prices) : null;

  return (
    <section className="grid sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)] bg-black rounded-xl border border-white">
      <div className="min-w-0 p-5">
        <p className="text-slate-400 text-xs mb-2">Portföy Değeri</p>
        <p className="text-3xl sm:text-4xl font-bold text-white">{tl(portfoyDegeri)}</p>
      </div>
      <div className="min-w-0 p-5 border-t sm:border-t-0 sm:border-l border-white/20">
        <p className="text-slate-400 text-xs mb-2">Toplam Maliyet</p>
        <p className="text-xl font-bold text-white">{tl(toplamMaliyet)}</p>
      </div>
      <div className="min-w-0 p-5 border-t sm:border-t-0 sm:border-l border-white/20">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-slate-400 text-xs">Portföy Kâr / Zarar</p>
          <button
            onClick={() => setDonemSirasi((donemSirasi + 1) % donemler.length)}
            aria-label={`Dönemi değiştir, şu an ${donem.ad}`}
            className="bg-emerald-500 hover:bg-emerald-400 text-white px-2 py-0.5 rounded text-xs font-medium transition"
          >
            {donem.ad}
          </button>
        </div>
        {kar ? (
          <>
            <p className={`text-xl font-bold ${karRengi(kar.tutar)}`}>{isaretliTl(kar.tutar)}</p>
            <p className={`text-sm font-medium mt-1 ${karRengi(kar.tutar)}`}>{isaretliYuzde(kar.yuzde)}</p>
          </>
        ) : (
          <p className="text-xl font-bold text-slate-500">—</p>
        )}
      </div>
    </section>
  );
};

export default PortfoyOzetSeridi;
