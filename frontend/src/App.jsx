// React kütüphanesini içe aktarma
import { useState, useEffect, useRef } from 'react'
import { createChart } from 'lightweight-charts'; 
import {PieChart, Pie,Cell, Tooltip, ResponsiveContainer, Legend} from 'recharts';

const RENKLER = ['#34d399', '#3b82f6', '#f59e0b','#ec4899','#8b5cf6','#14b8a6','#f43f5e'];

// Boyut Duyarlı (Responsive) ve Güvenli TradingView Bileşeni
const TradingViewChart = ({ data }) => {
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
      },
    });

    //Yeşil ve kırmızı mumları oluşturuma
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#34d399',
      downColor: '#f87171',
      borderVisible: false,
      wickUpColor: '#34d399',
      wickDownColor: '#f87171',
    });

    try {
      candlestickSeries.setData(temizVeri);
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
  }, [data]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
};

function App() {
  const [aktifSekme, setAktifSekme] = useState('piyasa'); 
  const [hisseler, setHisseler] = useState([]);
  const [aramaMetni, setAramaMetni] = useState('');
  
  const [seciliHisse, setSeciliHisse] = useState(null);
  const [islemTipi, setIslemTipi] = useState('AL');
  const [lotMiktari, setLotMiktari] = useState('');
  const [grafikVerisi, setGrafikVerisi] = useState([]);

  // 1. Portföy başlatılırken önce localStorage kontrol edilir.
  // Eğer kayıtlı veri varsa JSON.parse ile okunur.
  const [portfoy, setPortfoy] = useState(() => {
    const kayitliVeri = localStorage.getItem('bist_portfoy');
    return kayitliVeri ? JSON.parse(kayitliVeri) : [];
  });

  //İşlem geçmişi özelliği eklendi. Kullanıcı işlemlerini görebilecek.
  const [islemGecmisi, setIslemGecmisi] = useState(() => {
    const kayitliGecmis = localStorage.getItem('bist_islem_gecmisi');
    return kayitliGecmis ? JSON.parse(kayitliGecmis) : [];
  });

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
      .then(response => response.json())
      .then(data => setHisseler(data))
      .catch(error => console.error("Arka plan veri güncelleme hatası:", error));
  };

  useEffect(() => {
    piyasaVerileriniGetir(); // İlk açılışta hemen çalıştır
    const intervalId = setInterval(() => {
      //Verilerin 15 saniyede bir güncellenmesi sağlandı.
      piyasaVerileriniGetir(); 
    }, 15000);
    //Sayfa kapatıldığında bu saat durur. Bilgisayarın kilitlenmesi sorunu çözüldü.
    return () => clearInterval(intervalId); // Bellek sızıntısını önle
  }, []);

  useEffect(() => {
    if (seciliHisse) {
      setGrafikVerisi([]); 
      fetch(`http://127.0.0.1:8000/api/grafik/${seciliHisse.sembol}`)
        .then(res => res.json())
        .then(data => setGrafikVerisi(data))
        .catch(() => setGrafikVerisi([]));
    }
  }, [seciliHisse]);

  const filtrelenmisHisseler = hisseler.filter(hisse => 
    hisse.sembol.toLowerCase().includes(aramaMetni.toLowerCase()) || 
    hisse.ad.toLowerCase().includes(aramaMetni.toLowerCase())
  );

  const modalKapat = () => {
    setSeciliHisse(null);
    setLotMiktari('');
    setIslemTipi('AL');
  };

  const islemOnayla = () => {
    const miktar = parseInt(lotMiktari);
    if (!miktar || miktar <= 0) return alert('Lütfen geçerli bir lot miktarı girin.');


    // Kayıt objesi 
    const yeniIslemKaydi = {
      id: Date.now(),
      tarih: new Date().toLocaleString('tr-TR'),
      tip: islemTipi,
      sembol: seciliHisse.sembol,
      lot: miktar,
      fiyat: seciliHisse.fiyat,
      lot: miktar,
      fiyat: seciliHisse.fiyat,
      tutar: miktar * seciliHisse.fiyat
    };
    

    
    if (islemTipi === 'AL') {
      const mevcutHisse = portfoy.find(p => p.sembol === seciliHisse.sembol);//Portföyde zaten var mı?
      if (mevcutHisse) {
        const guncelPortfoy = portfoy.map(p => {
          if (p.sembol === seciliHisse.sembol) {
            const yeniLot = p.lot + miktar;//Eski lot sayısına ekle
            const yeniMaliyet = ((p.lot * p.maliyet) + (miktar * seciliHisse.fiyat)) / yeniLot;
            return { ...p, lot: yeniLot, maliyet: yeniMaliyet };
          }
          return p;
        });
        setPortfoy(guncelPortfoy);
      } else {
        setPortfoy([...portfoy, { ...seciliHisse, lot: miktar, maliyet: seciliHisse.fiyat }]);
      }

      //Alım işlemlerini geçmişe kaydet
      setIslemGecmisi([yeniIslemKaydi, ...islemGecmisi])
      alert(`${miktar} lot ${seciliHisse.sembol} başarıyla alındı!`);
    } 
    else if (islemTipi === 'SAT') {
      const mevcutHisse = portfoy.find(p => p.sembol === seciliHisse.sembol);//Portföyde var mı?
      if (!mevcutHisse || mevcutHisse.lot < miktar)//Yeterli lot var mı kontrolü
       {
        return alert('Portföyünüzde yeterli lot bulunmuyor!');
      }

      //Lotların tamamı satılıyorsa portföyden çıkar, aksi takdirde lot sayısını güncelle.
      if (mevcutHisse.lot === miktar) {
        setPortfoy(portfoy.filter(p => p.sembol !== seciliHisse.sembol));
      } else {
        setPortfoy(portfoy.map(p => p.sembol === seciliHisse.sembol ? { ...p, lot: p.lot - miktar } : p));
      }

      //Satım işlemlerini geçmişe kaydet
      setIslemGecmisi([yeniIslemKaydi, ...islemGecmisi])
      alert(`${miktar} lot ${seciliHisse.sembol} başarıyla satıldı!`);
    }
    modalKapat();
  };

  //Portföy değeri otomaik olarak güncellenir.
  const toplamPortfoyDegeri = portfoy.reduce((toplam, item) => {
    const guncelVeri = hisseler.find(h => h.sembol === item.sembol);
    const guncelFiyat = guncelVeri ? guncelVeri.fiyat : item.fiyat;
    return toplam + (guncelFiyat * item.lot);
  }, 0);

  const toplamMaliyet = portfoy.reduce((toplam, item) => toplam + (item.maliyet * item.lot), 0);
  const toplamKarZarar = toplamPortfoyDegeri - toplamMaliyet;
  const toplamKarZararYuzde = toplamMaliyet > 0 ? (toplamKarZarar / toplamMaliyet) * 100 : 0;

  //Pasta grafiği eklendi. 
  const pastaGrafikVerisi = portfoy.map(item => {
    const guncelVeri = hisseler.find(h => h.sembol === item.sembol);
    const guncelFiyat = guncelVeri ? guncelVeri.fiyat : item.fiyat;
    return {
      name: item.sembol,
      value: guncelFiyat * item.lot
    };
  }).filter(item => item.value > 0);
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
                <div className="text-center py-8 text-slate-500">Piyasa Verileri Yükleniyor...</div>
              )}
            </div>
          </section>
        )}

        {aktifSekme === 'portfoy' && (
          <section className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-sm animate-fade-in">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-700 flex flex-col justify-center">
                    <p className="text-slate-400 text-sm mb-1">Toplam Portföy</p>
                    <p className="text-3xl font-bold text-white">
                      {toplamPortfoyDegeri.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                    </p>
                  </div>
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-700 flex flex-col justify-center">
                    <p className="text-slate-400 text-sm mb-1">Kâr / Zarar</p>
                    <p className={`text-3xl font-bold ${toplamKarZarar >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {toplamKarZarar > 0 ? '+' : ''}{toplamKarZarar.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺
                    </p>
                  </div>
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-700 flex flex-col justify-center">
                    <p className="text-slate-400 text-sm mb-1">Genel Getiri</p>
                    <p className={`text-3xl font-bold ${toplamKarZararYuzde >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {toplamKarZararYuzde > 0 ? '+' : ''}{toplamKarZararYuzde.toFixed(2)}%
                    </p>
                  </div>
            </div>


            {portfoy.length > 0 && (
              <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 mb-8 h-80 flex flex-col justify-center items-center shadow-inner">
                <h4 className="text-slate-300 font-medium mb-4 w-full text-left">Portföy Dağılımı</h4>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pastaGrafikVerisi}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {pastaGrafikVerisi.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={RENKLER[index % RENKLER.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => `${value.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺`}
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '0.5rem' }}
                      itemStyle={{ color: '#e2e8f0' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ paddingTop: '20px' }}/>
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
                        const guncelFiyat = guncelVeri ? guncelVeri.fiyat : item.fiyat;
                        const karZarar = (guncelFiyat - item.maliyet) * item.lot;
                        const karZararYuzde = ((guncelFiyat - item.maliyet) / item.maliyet) * 100;

                        return (
                          <tr key={index} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                            <td className="py-4 pl-2 font-bold text-emerald-400">{item.sembol}</td>
                            <td className="py-4 text-right">{item.maliyet.toFixed(2)} ₺</td>
                            <td className="py-4 text-right">{guncelFiyat.toFixed(2)} ₺</td>
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
          <section className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-sm animate-fade-in">
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
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-[36rem] shadow-2xl">
            
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">{seciliHisse.sembol}</h3>
                <p className="text-sm text-slate-400">Son Fiyat: {seciliHisse.fiyat.toFixed(2)} ₺</p>
              </div>
              <button onClick={modalKapat} className="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>

            <div className="h-64 w-full bg-slate-900 rounded-lg mb-6 border border-slate-700 overflow-hidden relative">
                {grafikVerisi.length > 0 ? (
                    <TradingViewChart data={grafikVerisi} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                        Mum Grafiği Yükleniyor...
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
                  value={lotMiktari}
                  onChange={(e) => setLotMiktari(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                  placeholder="0"
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-sm text-slate-400">Toplam Tutar:</span>
                <span className="text-xl font-bold text-white">
                  {lotMiktari ? (seciliHisse.fiyat * parseInt(lotMiktari)).toLocaleString('tr-TR', {minimumFractionDigits: 2}) : '0,00'} ₺
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