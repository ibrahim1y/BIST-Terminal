// Üst menünün altındaki endeks, döviz ve altın şeridi, piyasa durumu ve saat.
import { useEffect, useState } from 'react';
import { isaretliYuzde, karRengi } from './portfoy';

// Borsa İstanbul hafta içi 10:00-18:10 arası açık sayılır. Resmi tatiller bilinmediği için hesaba girmez.
const piyasaAcikMi = (simdi) => {
  const parcalar = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(simdi)
      .map(p => [p.type, p.value])
  );
  const dakika = Number(parcalar.hour) * 60 + Number(parcalar.minute);
  return !['Sat', 'Sun'].includes(parcalar.weekday) && dakika >= 10 * 60 && dakika < 18 * 60 + 10;
};

const GostergeSeridi = () => {
  const [gostergeler, setGostergeler] = useState([]);
  const [simdi, setSimdi] = useState(() => new Date());

  useEffect(() => {
    const getir = () => fetch('http://127.0.0.1:8000/api/gostergeler')
      .then(res => (res.ok ? res.json() : []))
      .then(data => { if (Array.isArray(data) && data.length > 0) setGostergeler(data); })
      .catch(error => console.error('Göstergeler alınamadı:', error));
    getir();
    const veriSaati = setInterval(getir, 30000);
    const saat = setInterval(() => setSimdi(new Date()), 1000);
    return () => {
      clearInterval(veriSaati);
      clearInterval(saat);
    };
  }, []);

  const acik = piyasaAcikMi(simdi);

  return (
    <div className="border-b border-white/20 bg-black px-4 sm:px-7 py-2 flex items-center gap-x-8 gap-y-2 overflow-x-auto">
      {gostergeler.length === 0 && <span className="text-xs text-slate-500">Göstergeler yükleniyor...</span>}
      {gostergeler.map((g) => (
        <div key={g.ad} className="shrink-0">
          <p className="text-[11px] tracking-wide text-slate-400">{g.ad}</p>
          <p className="text-sm whitespace-nowrap">
            <span className="font-bold text-white">{g.deger.toLocaleString('tr-TR', { minimumFractionDigits: g.ondalik, maximumFractionDigits: g.ondalik })}</span>
            <span className={`ml-2 text-xs font-semibold ${karRengi(g.degisim)}`}>{isaretliYuzde(g.degisim)}</span>
          </p>
        </div>
      ))}
      <div className="ml-auto shrink-0 flex items-center gap-4 text-sm">
        <span className="flex items-center gap-2 text-slate-300">
          <span className={`w-2 h-2 rounded-full ${acik ? 'bg-[#00ff5e]' : 'bg-slate-500'}`} />
          {acik ? 'Piyasa Açık' : 'Piyasa Kapalı'}
        </span>
        <span className="font-bold tabular-nums">
          {simdi.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

export default GostergeSeridi;
